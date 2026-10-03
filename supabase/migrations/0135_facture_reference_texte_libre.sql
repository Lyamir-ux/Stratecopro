-- 0135 - Facture : numéro de référence du client et texte libre sous les articles
--
-- Demande d'Amir du 03/10/2026 : dans le brouillon, sous l'adresse du syndic,
-- « Y a-t-il un numéro de référence ? » (numéro de référence ou numéro d'ordre
-- de service, champ libre facultatif), imprimé sous la référence de la pièce ;
-- puis un texte libre facultatif, imprimé sous les articles de vente.
--
-- Les deux champs se saisissent dans le brouillon et se figent à la
-- validation, comme le reste de la pièce. Un brouillon refait (montant du
-- jalon revalorisé) les garde ; un avoir reprend le numéro de référence de la
-- facture qu'il annule, pas son texte libre.

-- ---------- 1. Colonnes ----------

alter table factures
  add column if not exists reference_client text,
  add column if not exists reference_client_type text not null default 'reference',
  add column if not exists texte_libre text;

alter table factures drop constraint if exists factures_reference_client_type_check;
alter table factures add constraint factures_reference_client_type_check
  check (reference_client_type in ('reference', 'ordre_service'));
alter table factures drop constraint if exists factures_reference_client_longueur;
alter table factures add constraint factures_reference_client_longueur
  check (char_length(reference_client) <= 80);
alter table factures drop constraint if exists factures_texte_libre_longueur;
alter table factures add constraint factures_texte_libre_longueur
  check (char_length(texte_libre) <= 600);

comment on column factures.reference_client is
  'Numéro de référence ou d''ordre de service donné par le client (0135), imprimé sous la référence de la pièce. Vide = aucun.';
comment on column factures.reference_client_type is
  'Libellé du numéro du client (0135) : reference = « N° de référence », ordre_service = « N° d''ordre de service ».';
comment on column factures.texte_libre is
  'Texte libre (0135) imprimé sous les articles de vente.';

-- ---------- 2. Pièce émise figée : les nouveaux champs aussi ----------

create or replace function factures_protege_emises()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.statut = 'emise' and not old.test then
      raise exception 'Une facture ou un avoir émis ne peut pas être supprimé : faites un avoir.';
    end if;
    return old;
  end if;
  if old.statut = 'emise' and (
       new.statut is distinct from old.statut or new.numero is distinct from old.numero
    or new.type is distinct from old.type or new.test is distinct from old.test
    or new.copro_id is distinct from old.copro_id or new.jalon is distinct from old.jalon
    or new.date_emission is distinct from old.date_emission or new.date_echeance is distinct from old.date_echeance
    or new.client_numero is distinct from old.client_numero or new.client_nom is distinct from old.client_nom
    or new.client_pa is distinct from old.client_pa or new.client_adresse is distinct from old.client_adresse
    or new.reference is distinct from old.reference or new.sous_reference is distinct from old.sous_reference
    or new.reference_client is distinct from old.reference_client
    or new.reference_client_type is distinct from old.reference_client_type
    or new.texte_libre is distinct from old.texte_libre
    or new.lignes is distinct from old.lignes or new.total_ht is distinct from old.total_ht
    or new.total_tva is distinct from old.total_tva or new.total_ttc is distinct from old.total_ttc
    or new.facture_origine_id is distinct from old.facture_origine_id
  ) then
    raise exception 'Une facture ou un avoir émis ne peut plus être modifié : faites un avoir.';
  end if;
  return new;
end;
$$;

-- ---------- 3. Brouillon refait : numéro de référence et texte libre gardés ----------

create or replace function facture_creer_brouillon(p_copro_id uuid, p_jalon text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_par facturation_parametres;
  v_copro coproprietes;
  v_org_nom text;
  v_org_adresse text;
  v_montant numeric(12, 2);
  v_etat text;
  v_nom text;
  v_nature text;
  v_cee jsonb;
  v_gwhc numeric;
  v_ligne jsonb;
  v_pa text;
  v_lieu text;
  v_ref_client text;
  v_ref_client_type text := 'reference';
  v_texte_libre text;
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;

  select * into v_copro from coproprietes where id = p_copro_id and deleted_at is null;
  if not found then
    raise exception 'Dossier introuvable';
  end if;

  select round(montant_ht, 2), etat into v_montant, v_etat
  from honoraires_jalons where copro_id = p_copro_id and jalon = p_jalon;
  if coalesce(v_montant, 0) <= 0 then
    raise exception 'Le jalon % n''a pas de montant à facturer', p_jalon;
  end if;

  select id into v_id from factures
  where copro_id = p_copro_id and jalon = p_jalon and type = 'facture' and statut = 'brouillon';
  if found then
    if (select total_ht from factures where id = v_id) = v_montant then
      return v_id;
    end if;
    -- montant du jalon revalorisé depuis : le brouillon est refait (l'adresse
    -- du syndic est gardée sur l'enseigne, le numéro de référence et le texte
    -- libre sont repris)
    select reference_client, reference_client_type, texte_libre
      into v_ref_client, v_ref_client_type, v_texte_libre
    from factures where id = v_id;
    insert into facturation_journal (facture_id, copro_id, jalon, action, test, detail, par)
    select null::uuid, copro_id, jalon, 'brouillon_supprime', test,
           format('Brouillon %s refait : montant du jalon modifié', jalon), auth.uid()
    from factures where id = v_id;
    delete from factures where id = v_id;
  end if;

  if v_etat <> 'a_facturer' then
    raise exception 'Le jalon % est déjà facturé', p_jalon;
  end if;

  select * into v_par from facturation_parametres where id;
  v_nom := upper(btrim(v_copro.name));
  v_nature := case when p_jalon like 'FCEE%' then 'cee' else 'amo' end;

  if v_nature = 'amo' then
    select o.nom, o.adresse_facturation into v_org_nom, v_org_adresse
    from organisations o where o.id = v_copro.organisation_id;
    v_pa := coalesce(nullif(btrim(v_org_nom), ''), nullif(btrim(v_copro.syndic_name), ''));
    v_lieu := concat_ws(', ',
      nullif(btrim(v_copro.adresse), ''),
      nullif(btrim(concat_ws(' ', nullif(btrim(v_copro.code_postal), ''), nullif(btrim(v_copro.city), ''))), ''));
    v_ligne := jsonb_build_object(
      'code', 'ART00000006', 'libelle', 'Convention d''AMO', 'detail', null,
      'quantite', 1, 'pu_ht', v_montant, 'montant_ht', v_montant, 'taux_tva', 20);

    insert into factures (
      type, statut, test, copro_id, jalon, nature,
      client_numero, client_nom, client_pa, client_adresse, destinataire_email, destinataire_nom,
      reference, sous_reference, reference_client, reference_client_type, texte_libre,
      lignes, total_ht, total_tva, total_ttc, cree_par)
    values (
      'facture', 'brouillon', v_par.mode = 'test', p_copro_id, p_jalon, 'amo',
      (select numero from facturation_clients where copro_id = p_copro_id),
      'SDC ' || v_nom, v_pa, nullif(btrim(v_org_adresse), ''),
      nullif(btrim(v_copro.gestionnaire_email), ''), nullif(btrim(v_copro.gestionnaire_nom), ''),
      'SDC ' || v_nom || ' ' || p_jalon,
      'SDC ' || v_nom || coalesce(', ' || nullif(v_lieu, ''), '') || coalesce(' p/a ' || v_pa, ''),
      v_ref_client, coalesce(v_ref_client_type, 'reference'), v_texte_libre,
      jsonb_build_array(v_ligne), v_montant, round(v_montant * 0.2, 2), v_montant + round(v_montant * 0.2, 2), auth.uid())
    returning id into v_id;
  else
    v_cee := v_par.cee_client;
    -- 250 € HT par GWh cumac : la quantité est le volume en GWh cumac
    v_gwhc := round(v_montant / 250, 3);
    if round(v_gwhc * 250, 2) = v_montant then
      v_ligne := jsonb_build_object(
        'code', 'ART00000010', 'libelle', 'CEE',
        'detail', '-250 AIF Copropriété ' || v_nom || ' ' || facturation_nombre_fr(v_gwhc, 3) || ' Gwhc',
        'quantite', v_gwhc, 'pu_ht', 250, 'montant_ht', v_montant, 'taux_tva', 20);
    else
      v_ligne := jsonb_build_object(
        'code', 'ART00000010', 'libelle', 'CEE',
        'detail', '-250 AIF Copropriété ' || v_nom,
        'quantite', 1, 'pu_ht', v_montant, 'montant_ht', v_montant, 'taux_tva', 20);
    end if;

    insert into factures (
      type, statut, test, copro_id, jalon, nature,
      client_numero, client_nom, client_pa, client_adresse, destinataire_email, destinataire_nom,
      reference, sous_reference, reference_client, reference_client_type, texte_libre,
      lignes, total_ht, total_tva, total_ttc, cree_par)
    values (
      'facture', 'brouillon', v_par.mode = 'test', p_copro_id, p_jalon, 'cee',
      v_cee ->> 'numero', v_cee ->> 'nom', null, v_cee ->> 'adresse', v_cee ->> 'email', null,
      format('Facture d''apporteur d''affaires année %s suivant contrat n°%s',
             extract(year from facturation_aujourdhui())::int, v_cee ->> 'contrat'),
      null,
      v_ref_client, coalesce(v_ref_client_type, 'reference'), v_texte_libre,
      jsonb_build_array(v_ligne), v_montant, round(v_montant * 0.2, 2), v_montant + round(v_montant * 0.2, 2), auth.uid())
    returning id into v_id;
  end if;

  insert into facturation_journal (facture_id, copro_id, jalon, action, test, detail, par)
  values (v_id, p_copro_id, p_jalon, 'brouillon', v_par.mode = 'test',
          format('Brouillon de facture %s - %s € HT', p_jalon, facturation_nombre_fr(v_montant, 2)), auth.uid());
  return v_id;
end;
$$;

-- ---------- 4. Saisie du brouillon : adresse, numéro de référence, texte libre ----------

-- Les trois nouveaux paramètres valent null = inchangé, '' = effacé : l'appel
-- à deux paramètres d'un onglet resté sur l'ancienne version ne touche donc ni
-- au numéro de référence ni au texte libre. L'adresse garde son comportement
-- de 0115 (vide = effacée) ; pour une facture AMO, une adresse modifiée
-- devient celle de l'enseigne et complète ses autres brouillons.
drop function if exists facture_modifier_brouillon(uuid, text);

create or replace function facture_modifier_brouillon(
  p_id uuid,
  p_client_adresse text,
  p_reference_client text default null,
  p_reference_client_type text default null,
  p_texte_libre text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f factures;
  v_org uuid;
  v_adresse text := nullif(btrim(p_client_adresse), '');
  v_ref text := nullif(btrim(p_reference_client), '');
  v_texte text := nullif(btrim(p_texte_libre), '');
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;
  select * into f from factures where id = p_id for update;
  if not found or f.statut <> 'brouillon' then
    raise exception 'Ce brouillon a déjà été validé ou supprimé';
  end if;
  if p_reference_client_type is not null and p_reference_client_type not in ('reference', 'ordre_service') then
    raise exception 'Type de numéro inconnu : %', p_reference_client_type;
  end if;
  if char_length(v_ref) > 80 then
    raise exception 'Le numéro de référence dépasse 80 caractères';
  end if;
  if char_length(v_texte) > 600 then
    raise exception 'Le texte libre dépasse 600 caractères';
  end if;

  update factures set
    client_adresse = v_adresse,
    reference_client = case when p_reference_client is null then reference_client else v_ref end,
    reference_client_type = coalesce(p_reference_client_type, reference_client_type),
    texte_libre = case when p_texte_libre is null then texte_libre else v_texte end
  where id = p_id;

  if f.nature = 'amo' and f.type = 'facture' and v_adresse is not null
     and v_adresse is distinct from f.client_adresse then
    select organisation_id into v_org from coproprietes where id = f.copro_id;
    if v_org is not null then
      update organisations set adresse_facturation = v_adresse where id = v_org;
      update factures b set client_adresse = v_adresse
      from coproprietes c
      where b.copro_id = c.id and c.organisation_id = v_org
        and b.statut = 'brouillon' and b.nature = 'amo' and b.client_adresse is null;
    end if;
  end if;
end;
$$;

-- ---------- 5. Avoir : numéro de référence de la facture annulée ----------

create or replace function facture_creer_avoir(p_facture_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  o factures;
  v_id uuid;
  v_par facturation_parametres;
  v_lignes jsonb;
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;
  select * into o from factures where id = p_facture_id;
  if not found or o.type <> 'facture' or o.statut <> 'emise' then
    raise exception 'Un avoir se fait sur une facture émise';
  end if;
  select id into v_id from factures where facture_origine_id = p_facture_id and type = 'avoir';
  if found then
    if exists (select 1 from factures where id = v_id and statut = 'emise') then
      raise exception 'La facture % a déjà un avoir', o.numero;
    end if;
    return v_id;
  end if;
  select * into v_par from facturation_parametres where id;
  if o.test and v_par.mode = 'production' then
    raise exception 'Facture de test : elle a été effacée au passage en production';
  end if;

  select jsonb_agg(l || jsonb_build_object(
           'pu_ht', -((l ->> 'pu_ht')::numeric),
           'montant_ht', -((l ->> 'montant_ht')::numeric)))
  into v_lignes
  from jsonb_array_elements(o.lignes) as l;

  insert into factures (
    type, statut, test, copro_id, jalon, nature, facture_origine_id,
    client_numero, client_nom, client_pa, client_adresse, destinataire_email, destinataire_nom,
    reference, sous_reference, reference_client, reference_client_type,
    lignes, total_ht, total_tva, total_ttc, cree_par)
  values (
    'avoir', 'brouillon', o.test, o.copro_id, o.jalon, o.nature, o.id,
    o.client_numero, o.client_nom, o.client_pa, o.client_adresse, o.destinataire_email, o.destinataire_nom,
    format('Avoir sur la facture n° %s du %s', o.numero, to_char(o.date_emission, 'DD/MM/YYYY')),
    o.reference, o.reference_client, o.reference_client_type,
    v_lignes, -o.total_ht, -o.total_tva, -o.total_ttc, auth.uid())
  returning id into v_id;

  insert into facturation_journal (facture_id, copro_id, jalon, action, test, detail, par)
  values (v_id, o.copro_id, o.jalon, 'brouillon', o.test, format('Brouillon d''avoir sur la facture %s', o.numero), auth.uid());
  return v_id;
end;
$$;

revoke execute on function facture_modifier_brouillon(uuid, text, text, text, text) from public, anon;
grant execute on function facture_modifier_brouillon(uuid, text, text, text, text) to authenticated;
