-- 0168 - Adresse de facturation choisie à chaque facture
--
-- Demande d'Amir du 17/10/2026, à la fusion des agences Foncia Colmar,
-- Mulhouse, Sarrebourg et Strasbourg en une seule organisation « Foncia
-- ABFC » : « chaque fois qu'une facture sera faite à Foncia, il faudra
-- demander, lors de la facturation, la bonne adresse en proposant l'une des
-- quatre adresses [des agences], et la possibilité d'une nouvelle adresse,
-- s'il faut la changer ».
--
-- Une enseigne « au choix » n'a plus d'adresse unique : le brouillon d'une
-- facture AMO part sans adresse (la validation l'exige), l'AMO choisit l'une
-- des adresses de la liste ou en saisit une nouvelle, qui rejoint la liste.
-- L'adresse choisie ne vaut que pour cette facture : elle ne devient pas
-- celle de l'enseigne et ne complète pas ses autres brouillons. Les autres
-- enseignes gardent le fonctionnement de 0115 (une adresse, retenue à la
-- première facture).

-- ---------- 1. Colonnes ----------

alter table organisations
  add column if not exists adresse_facturation_au_choix boolean not null default false,
  add column if not exists adresses_facturation text[] not null default '{}';

comment on column organisations.adresse_facturation_au_choix is
  'Adresse de facturation choisie à chaque facture AMO parmi adresses_facturation, ou nouvelle (0168) ; false = adresse unique adresse_facturation (0115).';
comment on column organisations.adresses_facturation is
  'Adresses proposées à la facturation quand adresse_facturation_au_choix (0168) ; une adresse = lignes séparées par des retours à la ligne.';

-- Clé de comparaison de deux adresses : casse, espaces et retours à la ligne ignorés.
create or replace function facturation_adresse_cle(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(btrim(regexp_replace(coalesce(p, ''), '[[:space:]]+', ' ', 'g')));
$$;

-- ---------- 2. Brouillon : sans adresse pour une enseigne « au choix » ----------

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
  v_org_au_choix boolean;
  v_adresse_choisie text;
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
    -- du syndic est gardée sur l'enseigne, ou reprise du brouillon pour une
    -- enseigne « au choix » ; le numéro de référence et le texte libre sont repris)
    select reference_client, reference_client_type, texte_libre, client_adresse
      into v_ref_client, v_ref_client_type, v_texte_libre, v_adresse_choisie
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
    select o.nom, o.adresse_facturation, o.adresse_facturation_au_choix
      into v_org_nom, v_org_adresse, v_org_au_choix
    from organisations o where o.id = v_copro.organisation_id;
    if coalesce(v_org_au_choix, false) then
      v_org_adresse := v_adresse_choisie;
    end if;
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

-- ---------- 3. Saisie du brouillon : l'adresse choisie reste sur la facture ----------

-- Enseigne « au choix » : l'adresse ne vaut que pour cette facture ; une
-- adresse absente de la liste (nouvelle) y est ajoutée pour les prochaines.
-- Autres enseignes : inchangé (0135), l'adresse devient celle de l'enseigne
-- et complète ses autres brouillons.
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
  v_org organisations;
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
    select o.* into v_org
    from organisations o join coproprietes c on c.organisation_id = o.id
    where c.id = f.copro_id;
    if v_org.id is null then
      return;
    end if;
    if v_org.adresse_facturation_au_choix then
      if not exists (select 1 from unnest(v_org.adresses_facturation) a
                     where facturation_adresse_cle(a) = facturation_adresse_cle(v_adresse)) then
        update organisations set adresses_facturation = adresses_facturation || v_adresse where id = v_org.id;
      end if;
    else
      update organisations set adresse_facturation = v_adresse where id = v_org.id;
      update factures b set client_adresse = v_adresse
      from coproprietes c
      where b.copro_id = c.id and c.organisation_id = v_org.id
        and b.statut = 'brouillon' and b.nature = 'amo' and b.client_adresse is null;
    end if;
  end if;
end;
$$;

revoke execute on function facture_modifier_brouillon(uuid, text, text, text, text) from public, anon;
grant execute on function facture_modifier_brouillon(uuid, text, text, text, text) to authenticated;
