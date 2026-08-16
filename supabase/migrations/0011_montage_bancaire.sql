-- 0011 — Montage bancaire (dossier de prêt collectif, côté syndic)
-- Le syndic prépare le dossier bancaire de la copropriété : parcours par
-- dispositif de financement ('ecoptz' CEGEE d'abord ; 'anah', 'cee',
-- 'climaxion', 'do' viendront ensuite). Deux briques :
--   - montage_docs : checklist de documents à déposer (un enregistrement par
--     document du catalogue, fichiers en jsonb — plusieurs PV possibles) ;
--   - montage_formulaires : données saisies des formulaires pré-remplis
--     (fiche de renseignements avant AG, demande de prêt CEGEE) en jsonb.
-- PREMIÈRE ÉCRITURE SYNDIC : jusqu'ici l'espace syndic était en lecture seule.
-- Le périmètre d'écriture est strictement limité à ces deux tables et au
-- préfixe Storage montage/<copro_id>/ du bucket copro-files.

-- ========== Tables ==========
create table montage_docs (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  montage text not null default 'ecoptz'
    check (montage in ('ecoptz', 'anah', 'cee', 'climaxion', 'do')),
  doc_key text not null,
  statut text not null default 'a_fournir'
    check (statut in ('a_fournir', 'depose', 'valide', 'non_applicable')),
  -- [{ name, path, size, mime, uploaded_at }]
  files jsonb not null default '[]',
  commentaire text,
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (copro_id, montage, doc_key)
);
create index idx_montage_docs_copro on montage_docs (copro_id, montage);
create trigger trg_montage_docs_updated before update on montage_docs
  for each row execute function set_updated_at();

create table montage_formulaires (
  copro_id uuid not null references coproprietes (id) on delete cascade,
  type text not null check (type in ('fiche_avant_ag', 'demande_pret')),
  data jsonb not null default '{}',
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'transmis')),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (copro_id, type)
);
create trigger trg_montage_form_updated before update on montage_formulaires
  for each row execute function set_updated_at();

-- ========== RLS ==========
alter table montage_docs enable row level security;
alter table montage_formulaires enable row level security;

create policy montage_docs_amo_all on montage_docs
  for all to authenticated using (is_amo()) with check (is_amo());
create policy montage_docs_syndic_read on montage_docs
  for select to authenticated using (is_syndic_of(copro_id));
create policy montage_docs_syndic_insert on montage_docs
  for insert to authenticated with check (is_syndic_of(copro_id));
create policy montage_docs_syndic_update on montage_docs
  for update to authenticated
  using (is_syndic_of(copro_id)) with check (is_syndic_of(copro_id));

create policy montage_form_amo_all on montage_formulaires
  for all to authenticated using (is_amo()) with check (is_amo());
create policy montage_form_syndic_read on montage_formulaires
  for select to authenticated using (is_syndic_of(copro_id));
create policy montage_form_syndic_insert on montage_formulaires
  for insert to authenticated with check (is_syndic_of(copro_id));
create policy montage_form_syndic_update on montage_formulaires
  for update to authenticated
  using (is_syndic_of(copro_id)) with check (is_syndic_of(copro_id));

-- ========== Storage ==========
-- Les documents du montage vivent dans copro-files sous montage/<copro_id>/…
-- Le syndic lit/écrit uniquement ce préfixe pour les copros de son portefeuille
-- (l'AMO a déjà tous les droits sur le bucket via la policy 0002).
create policy storage_montage_syndic on storage.objects
  for all to authenticated
  using (
    bucket_id = 'copro-files'
    and (storage.foldername(name))[1] = 'montage'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and is_syndic_of(((storage.foldername(name))[2])::uuid)
  )
  with check (
    bucket_id = 'copro-files'
    and (storage.foldername(name))[1] = 'montage'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and is_syndic_of(((storage.foldername(name))[2])::uuid)
  );
