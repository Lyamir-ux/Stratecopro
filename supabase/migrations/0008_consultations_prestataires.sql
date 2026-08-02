-- 0008 — Plateforme de consultation des prestations intellectuelles (phase 2).
-- 1. Base d'entreprises référencées (`prestataires`) gérée par l'AMO, avec les
--    métiers couverts (types) et un rattachement optionnel à un compte (user_id).
-- 2. Consultation pour une copro de la plateforme OU une copro externe
--    (études pas encore démarrées) : copro_id devient nullable + champs libres.
-- 3. Candidatures enrichies : dépôt d'offre par le prestataire connecté
--    (montant, message, pièce jointe) en plus de la saisie manuelle AMO.
-- 4. Journal des notifications e-mail envoyées aux prestataires référencés.
-- RLS : un prestataire ne voit QUE les consultations en ligne de ses métiers
-- et ses propres candidatures. Les intervenants n'accèdent PAS aux projets ;
-- seule une MOE RETENUE obtient la lecture de la copro concernée (fiche + bâtiments).

-- ========== Base d'entreprises référencées ==========
create table prestataires (
  id uuid primary key default gen_random_uuid(),
  raison_sociale text not null,
  siret text,
  contact_nom text,
  email text not null unique,
  telephone text,
  ville text,
  types type_consultation[] not null default '{}',   -- métiers couverts
  actif boolean not null default true,               -- référencé / suspendu
  notes text,
  user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_prestataires_types on prestataires using gin (types);
create trigger trg_prestataires_updated before update on prestataires
  for each row execute function set_updated_at();

-- ========== Consultation : copro de la plateforme OU copro externe ==========
alter table consultations alter column copro_id drop not null;
alter table consultations add column copro_externe_nom text;
alter table consultations add column copro_externe_adresse text;
alter table consultations add column copro_externe_ville text;
alter table consultations add column copro_externe_lots int;
alter table consultations add constraint consultations_cible_chk
  check (copro_id is not null or copro_externe_nom is not null);

-- ========== Candidatures : dépôt d'offre par le portail ==========
alter table candidatures add column prestataire_id uuid references prestataires (id) on delete set null;
alter table candidatures add column montant numeric;          -- offre € HT
alter table candidatures add column message text;             -- note d'intention
alter table candidatures add column fichier_path text;        -- offre PDF (bucket offres-presta)
alter table candidatures add column fichier_name text;
-- une seule candidature par prestataire connecté et par consultation
create unique index uq_candidature_prestataire
  on candidatures (consultation_id, prestataire_id) where prestataire_id is not null;

-- ========== Journal des notifications e-mail ==========
create type statut_notification as enum ('simule', 'envoye', 'erreur');
create table consultation_notifications (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references consultations (id) on delete cascade,
  prestataire_id uuid not null references prestataires (id) on delete cascade,
  email text not null,
  statut statut_notification not null default 'simule',
  erreur text,
  sent_at timestamptz not null default now()
);
create index idx_notifs_consultation on consultation_notifications (consultation_id);

-- ========== Helpers (security definer : évite la récursion RLS) ==========
create or replace function my_prestataire_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from prestataires where user_id = auth.uid() and actif;
$$;

create or replace function my_presta_types()
returns type_consultation[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select types from prestataires where user_id = auth.uid() and actif),
    '{}'::type_consultation[]
  );
$$;

-- le prestataire connecté a déjà candidaté à cette consultation
create or replace function a_postule(p_consultation_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from candidatures ca
    join prestataires p on p.id = ca.prestataire_id
    where ca.consultation_id = p_consultation_id and p.user_id = auth.uid()
  );
$$;

-- la consultation est ouverte et correspond à un métier du prestataire connecté
create or replace function peut_postuler(p_consultation_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from consultations c
    join prestataires p on p.user_id = auth.uid() and p.actif
    where c.id = p_consultation_id
      and c.statut = 'en_ligne'
      and c.type = any (p.types)
  );
$$;

-- copro visible du prestataire : consultation de son métier en ligne dessus,
-- ou consultation sur laquelle il a candidaté
create or replace function copro_visible_presta(p_copro_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from consultations c
    join prestataires p on p.user_id = auth.uid() and p.actif
    where c.copro_id = p_copro_id
      and (
        (c.statut = 'en_ligne' and c.type = any (p.types))
        or exists (
          select 1 from candidatures ca
          where ca.consultation_id = c.id and ca.prestataire_id = p.id
        )
      )
  );
$$;

-- MOE retenue sur la copro : seule porte d'entrée d'un prestataire vers un projet
create or replace function is_moe_retenu_of(p_copro_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from candidatures ca
    join consultations c on c.id = ca.consultation_id
    join prestataires p on p.id = ca.prestataire_id
    where c.copro_id = p_copro_id
      and c.type = 'moe'
      and ca.statut = 'retenue'
      and p.user_id = auth.uid()
      and p.actif
  );
$$;

revoke execute on function my_prestataire_id() from anon;
revoke execute on function my_presta_types() from anon;
revoke execute on function a_postule(uuid) from anon;
revoke execute on function peut_postuler(uuid) from anon;
revoke execute on function copro_visible_presta(uuid) from anon;
revoke execute on function is_moe_retenu_of(uuid) from anon;

-- ========== RLS ==========
-- (policies additives : l'accès AMO « tout » existant reste inchangé)

alter table prestataires enable row level security;
create policy prestataires_amo_all on prestataires
  for all to authenticated using (is_amo()) with check (is_amo());
-- le prestataire lit sa propre fiche (raison sociale, métiers) — pas les autres
create policy prestataires_own_read on prestataires
  for select to authenticated using (user_id = auth.uid());

alter table consultation_notifications enable row level security;
create policy notifs_amo_all on consultation_notifications
  for all to authenticated using (is_amo()) with check (is_amo());

-- consultations : en ligne + métier correspondant, ou déjà candidaté (suivi)
create policy consultations_presta_read on consultations
  for select to authenticated
  using (
    (statut = 'en_ligne' and type = any (my_presta_types()))
    or a_postule(id)
  );

-- candidatures : les siennes uniquement ; dépôt seulement si ouverte + bon métier
create policy candidatures_presta_read on candidatures
  for select to authenticated
  using (prestataire_id = my_prestataire_id());
create policy candidatures_presta_insert on candidatures
  for insert to authenticated
  with check (
    prestataire_id = my_prestataire_id()
    and peut_postuler(consultation_id)
  );

-- fiche copro visible (nom, adresse, phase) pour situer la consultation ;
-- les autres tables projet (lots, enquêtes, scénarios, plans…) restent fermées
create policy coproprietes_presta_read on coproprietes
  for select to authenticated using (copro_visible_presta(id) or is_moe_retenu_of(id));

-- MOE retenue : lecture des bâtiments (données techniques de son projet)
create policy batiments_moe_read on batiments
  for select to authenticated using (is_moe_retenu_of(copro_id));

-- ========== Storage ==========
-- Offres déposées par les prestataires : 1 dossier par user (uid/...), AMO en lecture
insert into storage.buckets (id, name, public)
values ('offres-presta', 'offres-presta', false)
on conflict (id) do nothing;

create policy storage_offres_own on storage.objects
  for all to authenticated
  using (bucket_id = 'offres-presta' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'offres-presta' and (storage.foldername(name))[1] = auth.uid()::text);

create policy storage_offres_amo on storage.objects
  for select to authenticated
  using (bucket_id = 'offres-presta' and is_amo());
