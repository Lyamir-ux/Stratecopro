-- 0115 - Facturation directe des honoraires depuis le logiciel
--
-- Demande d'Amir du 28/09/2026 : le logiciel remplace l'outil de facturation.
-- Modèles repris à l'identique : FAC00000765 (honoraires AMO, SDC 3 RUE
-- MARIANO P1b, client « SDC <nom> p/a <syndic> ») et FAC00000758 (honoraires
-- CEE, client Hellio, « Facture d'apporteur d'affaires … contrat n°0902-01 »).
--
-- Circuit : un jalon à facturer (bouton « Facturer » de l'onglet Projet ou
-- bulle grise de la frise) crée un brouillon, vérifié sur son aperçu PDF puis
-- validé par un membre de l'équipe AMO (chefs de projet et chargés
-- d'affaires). La validation attribue le numéro (suite continue, sans trou),
-- date la facture du jour avec une échéance à 30 jours, passe le jalon en
-- « facturé » (bulle orange) ; le PDF est classé dans les fichiers de la
-- copropriété (dossier « Facturation ») et envoyé par e-mail au gestionnaire
-- (Hellio pour les CEE), le chef de projet et le dirigeant en copie
-- (edge function envoyer-facture). Seul le dirigeant passe un jalon facturé en
-- « payé » (bulle verte). Un avoir annule une facture émise en totalité et
-- remet le jalon à facturer.
--
-- Numérotation : première facture FAC00000766 (FAC00000765 est la dernière de
-- l'ancien outil), premier avoir AVR00000073, numéros clients CLT à partir de
-- CLT00000231 (Hellio garde CLT00000079, 3 rue Mariano CLT00000230).
--
-- Mode test : tant que le dirigeant n'a pas cliqué « Passer en production »,
-- tout est marqué test, numéroté TEST-FAC-0001 / TEST-AVR-0001 (jamais un vrai
-- numéro) et effaçable : factures, avoirs, PDF, fichiers, journal, numéros
-- clients, et jalons remis dans leur état d'avant les tests.

-- ---------- 1. Paramètres (une seule ligne) ----------

create table if not exists facturation_parametres (
  id boolean primary key default true check (id),
  mode text not null default 'test' check (mode in ('test', 'production')),
  prochain_facture integer not null default 766,
  prochain_avoir integer not null default 73,
  prochain_client integer not null default 231,
  prochain_test_facture integer not null default 1,
  prochain_test_avoir integer not null default 1,
  -- client unique des honoraires CEE (modèle FAC00000758)
  cee_client jsonb not null default jsonb_build_object(
    'nom', 'HELLIO SOLUTIONS',
    'adresse', E'Hellio Solutions\n50 rue madame de Sanzillon\n92110 CLICHY',
    'email', 'dchalmont@hellio.com',
    'numero', 'CLT00000079',
    'contrat', '0902-01'
  ),
  en_production_le timestamptz,
  en_production_par uuid references profiles(user_id) on delete set null
);

insert into facturation_parametres (id) values (true) on conflict (id) do nothing;

comment on table facturation_parametres is
  'Facturation directe (0115) : mode test / production, compteurs des numéros (factures, avoirs, clients, test) et client des honoraires CEE.';

-- ---------- 2. Adresse de facturation des syndics ----------

alter table organisations add column if not exists adresse_facturation text;
comment on column organisations.adresse_facturation is
  'Adresse postale de l''enseigne pour les factures « SDC … p/a <syndic> » (0115), une ligne par ligne d''adresse, sans le pays. Saisie dans le premier brouillon.';

-- ---------- 3. Numéros clients des copropriétés ----------

create table if not exists facturation_clients (
  copro_id uuid primary key references coproprietes(id) on delete restrict,
  numero text not null unique,
  test boolean not null default false,
  attribue_le timestamptz not null default now()
);

comment on table facturation_clients is
  'Numéro client (CLTxxxxxxxx) de chaque SDC facturé (0115), attribué à la validation de sa première facture.';

-- 3 rue Mariano est déjà client de l'ancien outil (FAC00000765)
insert into facturation_clients (copro_id, numero, test)
select id, 'CLT00000230', false
from coproprietes
where name = '3 rue Mariano' and deleted_at is null
order by created_at
limit 1
on conflict do nothing;

-- ---------- 4. Fichiers confidentiels (factures CEE invisibles du syndic) ----------

alter table fichiers add column if not exists confidentiel boolean not null default false;
comment on column fichiers.confidentiel is
  'Fichier réservé à l''équipe AMO (0115) : invisible du syndic et du copropriétaire (factures d''honoraires CEE adressées à Hellio).';

drop policy if exists fichiers_syndic_read on fichiers;
create policy fichiers_syndic_read on fichiers
  for select to authenticated using (is_syndic_of(copro_id) and not confidentiel);

drop policy if exists storage_files_syndic_read on storage.objects;
create policy storage_files_syndic_read on storage.objects
  for select to authenticated using (
    bucket_id = 'copro-files'
    and exists (
      select 1 from fichiers f
      where f.storage_path = objects.name and is_syndic_of(f.copro_id) and not f.confidentiel
    )
  );

-- Onglet Fichiers du syndic : corps identique à 0067, les fichiers
-- confidentiels ne remontent qu'à l'équipe AMO.
create or replace function documents_dossier(p_copro_id uuid)
returns table (
  id text,
  name text,
  path text,
  taille bigint,
  dossier text,
  depose_le timestamptz,
  origine text
)
language sql stable security definer
set search_path = public
as $$
  with autorise as (select is_syndic_of(p_copro_id) or is_amo() as ok, is_amo() as amo)
  select f.id::text,
         f.name,
         f.storage_path,
         f.size,
         f.dossier,
         f.created_at,
         case p.role when 'moe' then 'moe' when 'syndic' then 'syndic' else 'amo' end
  from fichiers f
  left join profiles p on p.user_id = f.uploaded_by
  cross join autorise a
  where f.copro_id = p_copro_id and a.ok
    and (not f.confidentiel or a.amo)

  union all

  select d.id::text || '-' || (e.ord - 1)::text,
         e.f ->> 'name',
         e.f ->> 'path',
         nullif(e.f ->> 'size', '')::bigint,
         coalesce(m.label, 'Documents à produire'),
         nullif(e.f ->> 'uploaded_at', '')::timestamptz,
         coalesce(
           (select case pp.role when 'moe' then 'moe' when 'amo' then 'amo' else 'syndic' end
            from profiles pp where pp.user_id = nullif(e.f ->> 'uploaded_by', '')::uuid),
           'syndic'
         )
  from montage_docs d
  cross join lateral jsonb_array_elements(d.files) with ordinality as e(f, ord)
  left join (values
    ('ecoptz', 'Éco-PTZ collectif'),
    ('anah', 'ANAH - MaPrimeRénov'' Copro'),
    ('cee', 'Certificats d''économie d''énergie'),
    ('climaxion', 'EMS & Climaxion'),
    ('do', 'Dommages-ouvrage')
  ) as m(id, label) on m.id = d.montage
  cross join autorise a
  where d.copro_id = p_copro_id and a.ok
    and (not d.confidentiel or a.amo)

  order by 6 desc nulls last;
$$;
revoke execute on function documents_dossier(uuid) from anon, public;

-- ---------- 5. Factures et avoirs ----------

create table if not exists factures (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('facture', 'avoir')),
  statut text not null default 'brouillon' check (statut in ('brouillon', 'emise')),
  -- créée en mode test : effacée au passage en production
  test boolean not null,
  copro_id uuid not null references coproprietes(id) on delete restrict,
  jalon text not null check (jalon in ('P1a', 'P1b', 'P1c', 'P2a', 'P2b', 'P2c', 'FCEE1', 'FCEE2')),
  -- amo : client SDC p/a syndic ; cee : client Hellio
  nature text not null check (nature in ('amo', 'cee')),
  facture_origine_id uuid references factures(id) on delete restrict,
  numero text unique,
  date_emission date,
  date_echeance date,
  client_numero text,
  client_nom text not null,
  -- « P/A <syndic> » (factures AMO)
  client_pa text,
  -- lignes d'adresse, sans le pays
  client_adresse text,
  destinataire_email text,
  destinataire_nom text,
  reference text not null,
  sous_reference text,
  -- [{ code, libelle, detail, quantite, pu_ht, montant_ht, taux_tva }]
  lignes jsonb not null,
  total_ht numeric(12, 2) not null,
  total_tva numeric(12, 2) not null,
  total_ttc numeric(12, 2) not null,
  pdf_path text,
  fichier_id uuid references fichiers(id) on delete restrict,
  envoi_statut text check (envoi_statut in ('envoye', 'erreur', 'simule', 'sans_email')),
  envoi_le timestamptz,
  envoi_detail text,
  payee_le date,
  payee_par uuid references profiles(user_id) on delete set null,
  cree_par uuid references profiles(user_id) on delete set null,
  cree_le timestamptz not null default now(),
  valide_par uuid references profiles(user_id) on delete set null,
  valide_le timestamptz,
  check (statut = 'brouillon' or (numero is not null and date_emission is not null)),
  check (type = 'facture' or facture_origine_id is not null)
);

-- un seul brouillon de facture par jalon, un seul avoir par facture
create unique index if not exists factures_brouillon_jalon_uniq
  on factures (copro_id, jalon) where type = 'facture' and statut = 'brouillon';
create unique index if not exists factures_avoir_origine_uniq
  on factures (facture_origine_id) where type = 'avoir';
create index if not exists factures_copro_idx on factures (copro_id, jalon);

comment on table factures is
  'Factures et avoirs émis depuis le logiciel (0115). Brouillon sans numéro, puis émise : numéro, dates et contenu figés.';

-- Une pièce émise est figée : seuls le PDF, l'envoi et le paiement évoluent.
-- Les pièces de test restent effaçables (passage en production).
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
    or new.lignes is distinct from old.lignes or new.total_ht is distinct from old.total_ht
    or new.total_tva is distinct from old.total_tva or new.total_ttc is distinct from old.total_ttc
    or new.facture_origine_id is distinct from old.facture_origine_id
  ) then
    raise exception 'Une facture ou un avoir émis ne peut plus être modifié : faites un avoir.';
  end if;
  return new;
end;
$$;

drop trigger if exists factures_protege_emises on factures;
create trigger factures_protege_emises
  before update or delete on factures
  for each row execute function factures_protege_emises();

-- Le PDF d'une pièce émise reste dans les fichiers de la copropriété
create or replace function fichiers_protege_factures()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from factures f where f.fichier_id = old.id and f.statut = 'emise' and not f.test) then
    raise exception 'Le PDF d''une facture ou d''un avoir émis ne peut pas être supprimé.';
  end if;
  return old;
end;
$$;

drop trigger if exists fichiers_protege_factures on fichiers;
create trigger fichiers_protege_factures
  before delete on fichiers
  for each row execute function fichiers_protege_factures();

-- ---------- 6. Journal de facturation ----------

create table if not exists facturation_journal (
  id uuid primary key default gen_random_uuid(),
  -- ordre strict (deux écritures d'une même transaction ont la même heure)
  ordre bigint generated always as identity,
  facture_id uuid references factures(id) on delete set null,
  copro_id uuid not null references coproprietes(id) on delete cascade,
  jalon text,
  action text not null check (action in (
    'brouillon', 'brouillon_supprime', 'validation', 'envoi', 'paiement', 'paiement_annule', 'production'
  )),
  test boolean not null,
  detail text,
  -- état du jalon et du dossier avant l'écriture (rétabli au passage en production)
  jalon_avant jsonb,
  dossier_avant jsonb,
  par uuid references profiles(user_id) on delete set null,
  le timestamptz not null default now()
);

create index if not exists facturation_journal_ordre_idx on facturation_journal (ordre desc);
create index if not exists facturation_journal_jalon_idx on facturation_journal (copro_id, jalon, ordre desc);

comment on table facturation_journal is
  'Journal de facturation (0115) : brouillons, validations, envois, paiements, avec l''état du jalon remplacé.';

-- ---------- 7. Droits ----------

alter table facturation_parametres enable row level security;
alter table facturation_clients enable row level security;
alter table factures enable row level security;
alter table facturation_journal enable row level security;

create policy facturation_parametres_amo_lecture on facturation_parametres for select to authenticated using (is_amo());
create policy facturation_clients_amo_lecture on facturation_clients for select to authenticated using (is_amo());
create policy factures_amo_lecture on factures for select to authenticated using (is_amo());
create policy facturation_journal_amo_lecture on facturation_journal for select to authenticated using (is_amo());

revoke all on facturation_parametres, facturation_clients, factures, facturation_journal from anon;
revoke insert, update, delete, truncate on facturation_parametres, facturation_clients, factures, facturation_journal from authenticated;
grant select on facturation_parametres, facturation_clients, factures, facturation_journal to authenticated;

-- ---------- 8. Fonctions ----------

create or replace function facturation_aujourdhui()
returns date language sql stable as $$
  select (now() at time zone 'Europe/Paris')::date;
$$;

-- État d'un jalon et de la dernière facture du dossier, avant écriture
create or replace function facturation_photo_jalon(p_copro_id uuid, p_jalon text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object('existe', true, 'etat', j.etat, 'date_facture', j.date_facture,
                               'date_paiement', j.date_paiement, 'updated_at', j.updated_at, 'updated_by', j.updated_by)
     from honoraires_jalons j where j.copro_id = p_copro_id and j.jalon = p_jalon),
    jsonb_build_object('existe', false));
$$;

create or replace function facturation_photo_dossier(p_copro_id uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object('existe', true, 'derniere_facture', d.derniere_facture)
     from honoraires_dossiers d where d.copro_id = p_copro_id),
    jsonb_build_object('existe', false));
$$;

-- « 5,544 » : nombre au format français, sans zéros inutiles
create or replace function facturation_nombre_fr(v numeric, decimales integer)
returns text language sql immutable as $$
  select replace(rtrim(rtrim(to_char(round(v, decimales), 'FM999999990.' || repeat('0', decimales)), '0'), '.'), '.', ',');
$$;

revoke execute on function facturation_photo_jalon(uuid, text), facturation_photo_dossier(uuid) from public, anon, authenticated;

-- Brouillon de facture d'un jalon (renvoie le brouillon existant s'il y en a un)
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
    -- du syndic est gardée sur l'enseigne)
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
      reference, sous_reference, lignes, total_ht, total_tva, total_ttc, cree_par)
    values (
      'facture', 'brouillon', v_par.mode = 'test', p_copro_id, p_jalon, 'amo',
      (select numero from facturation_clients where copro_id = p_copro_id),
      'SDC ' || v_nom, v_pa, nullif(btrim(v_org_adresse), ''),
      nullif(btrim(v_copro.gestionnaire_email), ''), nullif(btrim(v_copro.gestionnaire_nom), ''),
      'SDC ' || v_nom || ' ' || p_jalon,
      'SDC ' || v_nom || coalesce(', ' || nullif(v_lieu, ''), '') || coalesce(' p/a ' || v_pa, ''),
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
      reference, sous_reference, lignes, total_ht, total_tva, total_ttc, cree_par)
    values (
      'facture', 'brouillon', v_par.mode = 'test', p_copro_id, p_jalon, 'cee',
      v_cee ->> 'numero', v_cee ->> 'nom', null, v_cee ->> 'adresse', v_cee ->> 'email', null,
      format('Facture d''apporteur d''affaires année %s suivant contrat n°%s',
             extract(year from facturation_aujourdhui())::int, v_cee ->> 'contrat'),
      null,
      jsonb_build_array(v_ligne), v_montant, round(v_montant * 0.2, 2), v_montant + round(v_montant * 0.2, 2), auth.uid())
    returning id into v_id;
  end if;

  insert into facturation_journal (facture_id, copro_id, jalon, action, test, detail, par)
  values (v_id, p_copro_id, p_jalon, 'brouillon', v_par.mode = 'test',
          format('Brouillon de facture %s - %s € HT', p_jalon, facturation_nombre_fr(v_montant, 2)), auth.uid());
  return v_id;
end;
$$;

-- Adresse du client dans un brouillon ; pour une facture AMO, elle devient
-- l'adresse de facturation de l'enseigne (et complète ses autres brouillons).
create or replace function facture_modifier_brouillon(p_id uuid, p_client_adresse text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f factures;
  v_org uuid;
  v_adresse text := nullif(btrim(p_client_adresse), '');
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;
  select * into f from factures where id = p_id for update;
  if not found or f.statut <> 'brouillon' then
    raise exception 'Ce brouillon a déjà été validé ou supprimé';
  end if;
  update factures set client_adresse = v_adresse where id = p_id;
  if f.nature = 'amo' and f.type = 'facture' and v_adresse is not null then
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

create or replace function facture_supprimer_brouillon(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f factures;
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;
  select * into f from factures where id = p_id for update;
  if not found or f.statut <> 'brouillon' then
    raise exception 'Ce brouillon a déjà été validé ou supprimé';
  end if;
  insert into facturation_journal (facture_id, copro_id, jalon, action, test, detail, par)
  values (null::uuid, f.copro_id, f.jalon, 'brouillon_supprime', f.test,
          format('Brouillon %s %s supprimé', case f.type when 'avoir' then 'd''avoir' else 'de facture' end, f.jalon), auth.uid());
  delete from factures where id = p_id;
end;
$$;

-- Brouillon d'avoir total sur une facture émise
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
    reference, sous_reference, lignes, total_ht, total_tva, total_ttc, cree_par)
  values (
    'avoir', 'brouillon', o.test, o.copro_id, o.jalon, o.nature, o.id,
    o.client_numero, o.client_nom, o.client_pa, o.client_adresse, o.destinataire_email, o.destinataire_nom,
    format('Avoir sur la facture n° %s du %s', o.numero, to_char(o.date_emission, 'DD/MM/YYYY')),
    o.reference, v_lignes, -o.total_ht, -o.total_tva, -o.total_ttc, auth.uid())
  returning id into v_id;

  insert into facturation_journal (facture_id, copro_id, jalon, action, test, detail, par)
  values (v_id, o.copro_id, o.jalon, 'brouillon', o.test, format('Brouillon d''avoir sur la facture %s', o.numero), auth.uid());
  return v_id;
end;
$$;

-- Validation : numéro, dates, jalon facturé (ou remis à facturer pour un avoir)
create or replace function facture_valider(p_id uuid)
returns factures
language plpgsql
security definer
set search_path = public
as $$
declare
  f factures;
  o factures;
  v_par facturation_parametres;
  v_test boolean;
  v_date date := facturation_aujourdhui();
  v_numero text;
  v_client text;
  v_etat text;
  v_montant numeric(12, 2);
  v_photo jsonb;
  v_dossier jsonb;
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;
  select * into f from factures where id = p_id for update;
  if not found or f.statut <> 'brouillon' then
    raise exception 'Ce brouillon a déjà été validé ou supprimé';
  end if;
  if f.nature = 'amo' and nullif(btrim(f.client_adresse), '') is null then
    raise exception 'Complétez l''adresse du syndic avant de valider';
  end if;
  if nullif(btrim(f.destinataire_email), '') is null then
    raise exception 'Aucun e-mail de destinataire : renseignez l''e-mail du gestionnaire dans la fiche du dossier';
  end if;

  -- verrou sur les compteurs : deux validations simultanées ne prennent jamais le même numéro
  select * into v_par from facturation_parametres where id for update;
  v_test := v_par.mode = 'test';
  if f.test <> v_test then
    raise exception 'Brouillon créé en mode test : supprimez-le et recréez-le';
  end if;

  select etat, round(montant_ht, 2) into v_etat, v_montant
  from honoraires_jalons where copro_id = f.copro_id and jalon = f.jalon for update;
  v_photo := facturation_photo_jalon(f.copro_id, f.jalon);
  v_dossier := facturation_photo_dossier(f.copro_id);

  if f.type = 'facture' then
    if v_etat is distinct from 'a_facturer' then
      raise exception 'Le jalon % a été facturé entre-temps', f.jalon;
    end if;
    if v_montant is distinct from f.total_ht then
      raise exception 'Le montant du jalon % a changé depuis le brouillon : fermez-le et rouvrez le jalon pour le refaire', f.jalon;
    end if;
    if v_test then
      v_numero := 'TEST-FAC-' || lpad(v_par.prochain_test_facture::text, 4, '0');
      update facturation_parametres set prochain_test_facture = prochain_test_facture + 1 where id;
    else
      v_numero := 'FAC' || lpad(v_par.prochain_facture::text, 8, '0');
      update facturation_parametres set prochain_facture = prochain_facture + 1 where id;
    end if;
  else
    select * into o from factures where id = f.facture_origine_id;
    if not found or o.statut <> 'emise' then
      raise exception 'La facture d''origine n''est pas émise';
    end if;
    if exists (select 1 from factures where facture_origine_id = o.id and type = 'avoir' and statut = 'emise') then
      raise exception 'La facture % a déjà un avoir', o.numero;
    end if;
    if v_etat is null or v_etat = 'a_facturer' then
      raise exception 'Le jalon % n''est plus facturé : l''avoir est sans objet', f.jalon;
    end if;
    if v_test then
      v_numero := 'TEST-AVR-' || lpad(v_par.prochain_test_avoir::text, 4, '0');
      update facturation_parametres set prochain_test_avoir = prochain_test_avoir + 1 where id;
    else
      v_numero := 'AVR' || lpad(v_par.prochain_avoir::text, 8, '0');
      update facturation_parametres set prochain_avoir = prochain_avoir + 1 where id;
    end if;
  end if;

  -- numéro client du SDC, attribué à sa première facture
  v_client := f.client_numero;
  if f.nature = 'amo' and v_client is null then
    select numero into v_client from facturation_clients where copro_id = f.copro_id;
    if v_client is null then
      v_client := 'CLT' || lpad(v_par.prochain_client::text, 8, '0');
      insert into facturation_clients (copro_id, numero, test) values (f.copro_id, v_client, v_test);
      update facturation_parametres set prochain_client = prochain_client + 1 where id;
    end if;
  end if;

  update factures set
    statut = 'emise',
    numero = v_numero,
    date_emission = v_date,
    date_echeance = case when f.type = 'facture' then v_date + 30 end,
    client_numero = v_client,
    valide_par = auth.uid(),
    valide_le = now()
  where id = p_id
  returning * into f;

  if f.type = 'facture' then
    update honoraires_jalons
      set etat = 'facture', date_facture = v_date, date_paiement = null, updated_at = now(), updated_by = auth.uid()
    where copro_id = f.copro_id and jalon = f.jalon;
    insert into honoraires_dossiers (copro_id, derniere_facture, importe_le)
    values (f.copro_id, v_date, null)
    on conflict (copro_id) do update
      set derniere_facture = greatest(coalesce(honoraires_dossiers.derniere_facture, excluded.derniere_facture), excluded.derniere_facture);
  else
    update honoraires_jalons
      set etat = 'a_facturer', date_facture = null, date_paiement = null, updated_at = now(), updated_by = auth.uid()
    where copro_id = f.copro_id and jalon = f.jalon;
  end if;

  insert into facturation_journal (facture_id, copro_id, jalon, action, test, detail, jalon_avant, dossier_avant, par)
  values (f.id, f.copro_id, f.jalon, 'validation', v_test,
          format('%s %s - %s € TTC', case f.type when 'avoir' then 'Avoir' else 'Facture' end, v_numero,
                 facturation_nombre_fr(f.total_ttc, 2)),
          v_photo, v_dossier, auth.uid());
  return f;
end;
$$;

-- PDF de la pièce émise, classé dans les fichiers de la copropriété
create or replace function facture_enregistrer_pdf(p_id uuid, p_storage_path text, p_nom text, p_taille bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  f factures;
  v_fichier uuid;
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;
  select * into f from factures where id = p_id for update;
  if not found or f.statut <> 'emise' then
    raise exception 'Pièce introuvable ou non émise';
  end if;
  if f.fichier_id is not null then
    return f.fichier_id;
  end if;
  if p_storage_path is null or split_part(p_storage_path, '/', 1) <> f.copro_id::text then
    raise exception 'Chemin de fichier invalide';
  end if;
  insert into fichiers (copro_id, dossier, name, storage_path, size, mime, uploaded_by, confidentiel)
  values (f.copro_id, 'Facturation', p_nom, p_storage_path, p_taille, 'application/pdf', auth.uid(), f.nature = 'cee')
  returning id into v_fichier;
  update factures set pdf_path = p_storage_path, fichier_id = v_fichier where id = p_id;
  return v_fichier;
end;
$$;

-- Paiement reçu : réservé au dirigeant (bulle verte)
create or replace function honoraires_marquer_paye(p_copro_id uuid, p_jalon text, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etat text;
  v_date_facture date;
  v_photo jsonb;
  v_test boolean;
  v_numero text;
  v_facture uuid;
begin
  if not is_dirigeant() then
    raise exception 'Réservé au dirigeant' using errcode = '42501';
  end if;
  if p_date is null or p_date > facturation_aujourdhui() then
    raise exception 'Indiquez la date du paiement (aujourd''hui au plus tard)';
  end if;
  select etat, date_facture into v_etat, v_date_facture
  from honoraires_jalons where copro_id = p_copro_id and jalon = p_jalon for update;
  if v_etat is distinct from 'facture' then
    raise exception 'Le jalon % n''est pas en attente de paiement', p_jalon;
  end if;
  if v_date_facture is not null and p_date < v_date_facture then
    raise exception 'Le paiement ne peut pas précéder la facture du %', to_char(v_date_facture, 'DD/MM/YYYY');
  end if;
  select mode = 'test' into v_test from facturation_parametres where id;
  v_photo := facturation_photo_jalon(p_copro_id, p_jalon);

  update honoraires_jalons
    set etat = 'encaisse', date_paiement = p_date, updated_at = now(), updated_by = auth.uid()
  where copro_id = p_copro_id and jalon = p_jalon;

  update factures f set payee_le = p_date, payee_par = auth.uid()
  where f.copro_id = p_copro_id and f.jalon = p_jalon and f.type = 'facture' and f.statut = 'emise'
    and not exists (select 1 from factures a where a.facture_origine_id = f.id and a.statut = 'emise')
  returning f.id, f.numero into v_facture, v_numero;

  insert into facturation_journal (facture_id, copro_id, jalon, action, test, detail, jalon_avant, par)
  values (
    v_facture,
    p_copro_id, p_jalon, 'paiement', v_test,
    format('Paiement du %s reçu le %s%s', p_jalon, to_char(p_date, 'DD/MM/YYYY'), coalesce(' (' || v_numero || ')', '')),
    v_photo, auth.uid());
end;
$$;

-- Annule le dernier paiement saisi dans le logiciel (mauvais clic du dirigeant)
create or replace function honoraires_annuler_paiement(p_copro_id uuid, p_jalon text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e facturation_journal;
begin
  if not is_dirigeant() then
    raise exception 'Réservé au dirigeant' using errcode = '42501';
  end if;
  select * into e from facturation_journal
  where copro_id = p_copro_id and jalon = p_jalon and action in ('paiement', 'paiement_annule', 'validation')
  order by ordre desc limit 1;
  if not found or e.action <> 'paiement' then
    raise exception 'Aucun paiement saisi dans le logiciel à annuler pour ce jalon';
  end if;
  if not exists (select 1 from honoraires_jalons where copro_id = p_copro_id and jalon = p_jalon and etat = 'encaisse') then
    raise exception 'Le jalon % n''est pas encaissé', p_jalon;
  end if;

  update honoraires_jalons
    set etat = coalesce(e.jalon_avant ->> 'etat', 'facture'),
        date_paiement = nullif(e.jalon_avant ->> 'date_paiement', '')::date,
        updated_at = now(), updated_by = auth.uid()
  where copro_id = p_copro_id and jalon = p_jalon;
  update factures set payee_le = null, payee_par = null
  where copro_id = p_copro_id and jalon = p_jalon and type = 'facture' and payee_le is not null;

  insert into facturation_journal (facture_id, copro_id, jalon, action, test, detail, jalon_avant, par)
  values (e.facture_id, p_copro_id, p_jalon, 'paiement_annule',
          (select mode = 'test' from facturation_parametres where id),
          format('Paiement du %s annulé', p_jalon), facturation_photo_jalon(p_copro_id, p_jalon), auth.uid());
end;
$$;

-- Destinataires de l'e-mail (edge function envoyer-facture, service role) :
-- gestionnaire du syndic ou Hellio, chef de projet et dirigeant en copie.
create or replace function facture_destinataires(p_id uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'to', f.destinataire_email,
    'to_nom', f.destinataire_nom,
    'chef', (
      select jsonb_build_object('nom', p.full_name, 'email', u.email)
      from profiles p join auth.users u on u.id = p.user_id
      where p.role = 'amo' and p.active
        and devis_amo_normaliser_nom(p.full_name) = devis_amo_normaliser_nom(c.chef_projet)
      order by p.created_at limit 1),
    'dirigeants', coalesce((
      select jsonb_agg(u.email order by p.created_at)
      from profiles p join auth.users u on u.id = p.user_id
      where p.role = 'amo' and p.active and p.dirigeant), '[]'::jsonb),
    'copro', c.name
  )
  from factures f join coproprietes c on c.id = f.copro_id
  where f.id = p_id;
$$;

-- Passage en production : efface tout ce qui a été fait en mode test
create or replace function facturation_passer_en_production()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_par facturation_parametres;
  v_chemins text[];
  v_fichiers uuid[];
  v_nb_factures integer;
  v_nb_avoirs integer;
  v_nb_jalons integer;
  r record;
begin
  if not is_dirigeant() then
    raise exception 'Réservé au dirigeant' using errcode = '42501';
  end if;
  select * into v_par from facturation_parametres where id for update;
  if v_par.mode <> 'test' then
    raise exception 'La facturation est déjà en production';
  end if;

  -- jalons et dossiers remis dans leur état d'avant le premier essai
  v_nb_jalons := 0;
  for r in
    select distinct on (copro_id, jalon) copro_id, jalon, jalon_avant
    from facturation_journal
    where test and jalon is not null and jalon_avant is not null
    order by copro_id, jalon, ordre
  loop
    if coalesce((r.jalon_avant ->> 'existe')::boolean, false) then
      update honoraires_jalons set
        etat = r.jalon_avant ->> 'etat',
        date_facture = nullif(r.jalon_avant ->> 'date_facture', '')::date,
        date_paiement = nullif(r.jalon_avant ->> 'date_paiement', '')::date,
        updated_at = coalesce(nullif(r.jalon_avant ->> 'updated_at', '')::timestamptz, now()),
        updated_by = nullif(r.jalon_avant ->> 'updated_by', '')::uuid
      where copro_id = r.copro_id and jalon = r.jalon;
      v_nb_jalons := v_nb_jalons + 1;
    end if;
  end loop;

  for r in
    select distinct on (copro_id) copro_id, dossier_avant
    from facturation_journal
    where test and dossier_avant is not null
    order by copro_id, ordre
  loop
    update honoraires_dossiers
      set derniere_facture = case when coalesce((r.dossier_avant ->> 'existe')::boolean, false)
                                  then nullif(r.dossier_avant ->> 'derniere_facture', '')::date end
    where copro_id = r.copro_id;
  end loop;

  select coalesce(array_agg(pdf_path) filter (where pdf_path is not null), '{}'),
         count(*) filter (where type = 'facture' and statut = 'emise'),
         count(*) filter (where type = 'avoir' and statut = 'emise')
  into v_chemins, v_nb_factures, v_nb_avoirs
  from factures where test;

  select coalesce(array_agg(fichier_id) filter (where fichier_id is not null), '{}')
  into v_fichiers
  from factures where test;

  delete from facturation_journal where test;
  delete from factures where test and type = 'avoir';
  delete from factures where test;
  delete from fichiers where id = any (v_fichiers);
  delete from facturation_clients where test;

  update facturation_parametres set
    mode = 'production',
    prochain_test_facture = 1,
    prochain_test_avoir = 1,
    prochain_client = greatest(231, coalesce((
      select max(substring(numero from 4)::int) + 1 from facturation_clients where numero ~ '^CLT[0-9]{8}$'), 231)),
    en_production_le = now(),
    en_production_par = auth.uid()
  where id;

  return jsonb_build_object(
    'chemins', to_jsonb(v_chemins),
    'factures', v_nb_factures,
    'avoirs', v_nb_avoirs,
    'jalons', v_nb_jalons);
end;
$$;

comment on function facture_valider(uuid) is
  'Facturation directe (0115) : valide un brouillon (numéro, date du jour, échéance 30 jours) et passe le jalon en facturé, ou à facturer pour un avoir.';

revoke execute on function
  facture_creer_brouillon(uuid, text), facture_modifier_brouillon(uuid, text), facture_supprimer_brouillon(uuid),
  facture_creer_avoir(uuid), facture_valider(uuid), facture_enregistrer_pdf(uuid, text, text, bigint),
  honoraires_marquer_paye(uuid, text, date), honoraires_annuler_paiement(uuid, text),
  facturation_passer_en_production(), facture_destinataires(uuid)
from public, anon;

grant execute on function
  facture_creer_brouillon(uuid, text), facture_modifier_brouillon(uuid, text), facture_supprimer_brouillon(uuid),
  facture_creer_avoir(uuid), facture_valider(uuid), facture_enregistrer_pdf(uuid, text, text, bigint),
  honoraires_marquer_paye(uuid, text, date), honoraires_annuler_paiement(uuid, text),
  facturation_passer_en_production()
to authenticated;

revoke execute on function facture_destinataires(uuid) from authenticated;
grant execute on function facture_destinataires(uuid) to service_role;
