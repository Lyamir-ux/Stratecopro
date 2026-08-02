-- 0005 — Portail copropriétaire (phase 2, premier espace non-AMO)
-- Nouvelles tables : choix_financement, pieces_justificatives.
-- Colonne fichiers.partage_copro (documents projet visibles au portail).
-- RLS : le copropriétaire connecté ne voit QUE son périmètre — sa copro,
-- ses lots, sa réponse d'enquête (RFR), son plan individuel, ses pièces.
-- Jamais les données d'un autre copropriétaire.

-- ========== Enums ==========
create type type_financement as enum ('collectif', 'individuel', 'fonds');
create type type_piece as enum (
  'avis_imposition', 'piece_identite', 'rib', 'justificatif_domicile', 'taxe_fonciere'
);

-- ========== Choix de financement du reste à charge ==========
create table choix_financement (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios_financiers (id) on delete cascade,
  coproprietaire_id uuid not null references coproprietaires (id) on delete cascade,
  type type_financement not null,
  duree_annees int check (duree_annees between 3 and 20),
  lot_ids uuid[] not null default '{}',   -- lots concernés (prêt individuel)
  transmitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scenario_id, coproprietaire_id)
);
create index idx_choix_scenario on choix_financement (scenario_id);
create trigger trg_choix_updated before update on choix_financement
  for each row execute function set_updated_at();

-- ========== Pièces justificatives téléversées par le copropriétaire ==========
create table pieces_justificatives (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  coproprietaire_id uuid not null references coproprietaires (id) on delete cascade,
  type type_piece not null,
  name text not null,
  storage_path text not null,
  size bigint,
  mime text,
  uploaded_at timestamptz not null default now(),
  unique (coproprietaire_id, type)
);
create index idx_pieces_coproprietaire on pieces_justificatives (coproprietaire_id);

-- ========== Fichiers projet partagés au portail ==========
alter table fichiers add column partage_copro boolean not null default false;

-- ========== Helpers (security definer : évite la récursion RLS) ==========
create or replace function my_coproprietaire_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select id from coproprietaires where user_id = auth.uid();
$$;

create or replace function my_lot_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select l.id from lots l
  join coproprietaires cp on cp.id = l.coproprietaire_id
  where cp.user_id = auth.uid();
$$;

create or replace function is_copro_of(p_copro_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from coproprietaires
    where user_id = auth.uid() and copro_id = p_copro_id
  );
$$;

create or replace function is_scenario_partage(p_scenario_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from scenarios_financiers
    where id = p_scenario_id and statut = 'partage'
  );
$$;

-- ========== RLS : lecture du périmètre du copropriétaire ==========
-- (policies additives : l'accès AMO existant reste inchangé)

create policy coproprietes_copro_read on coproprietes
  for select to authenticated using (is_copro_of(id));

create policy batiments_copro_read on batiments
  for select to authenticated using (is_copro_of(copro_id));

create policy cles_copro_read on cles_repartition
  for select to authenticated using (is_copro_of(copro_id));

-- fiche(s) copropriétaire du user connecté uniquement
create policy coproprietaires_own_read on coproprietaires
  for select to authenticated using (user_id = auth.uid());

create policy lots_own_read on lots
  for select to authenticated using (id in (select my_lot_ids()));

create policy lot_tantiemes_own_read on lot_tantiemes
  for select to authenticated using (lot_id in (select my_lot_ids()));

-- scénarios : uniquement ceux partagés par l'AMO
create policy scenarios_copro_read on scenarios_financiers
  for select to authenticated
  using (statut = 'partage' and is_copro_of(copro_id));

-- plan individuel : le sien, sur un scénario partagé uniquement
create policy plans_own_read on plans_individuels
  for select to authenticated
  using (
    coproprietaire_id in (select my_coproprietaire_ids())
    and is_scenario_partage(scenario_id)
  );

-- enquête : questionnaire lisible ; réponse = la sienne (lecture/écriture)
create policy enquetes_copro_read on enquetes
  for select to authenticated using (is_copro_of(copro_id));

create policy reponses_own_read on enquete_reponses
  for select to authenticated
  using (coproprietaire_id in (select my_coproprietaire_ids()));
create policy reponses_own_insert on enquete_reponses
  for insert to authenticated
  with check (coproprietaire_id in (select my_coproprietaire_ids()));
create policy reponses_own_update on enquete_reponses
  for update to authenticated
  using (coproprietaire_id in (select my_coproprietaire_ids()))
  with check (coproprietaire_id in (select my_coproprietaire_ids()));

-- fichiers projet : seulement ceux marqués partagés
create policy fichiers_copro_read on fichiers
  for select to authenticated
  using (partage_copro and is_copro_of(copro_id));

-- ========== RLS des nouvelles tables ==========
alter table choix_financement enable row level security;
create policy choix_amo_all on choix_financement
  for all to authenticated using (is_amo()) with check (is_amo());
create policy choix_own_read on choix_financement
  for select to authenticated
  using (coproprietaire_id in (select my_coproprietaire_ids()));
create policy choix_own_insert on choix_financement
  for insert to authenticated
  with check (
    coproprietaire_id in (select my_coproprietaire_ids())
    and is_scenario_partage(scenario_id)
  );
create policy choix_own_update on choix_financement
  for update to authenticated
  using (coproprietaire_id in (select my_coproprietaire_ids()))
  with check (
    coproprietaire_id in (select my_coproprietaire_ids())
    and is_scenario_partage(scenario_id)
  );
create policy choix_own_delete on choix_financement
  for delete to authenticated
  using (coproprietaire_id in (select my_coproprietaire_ids()));

alter table pieces_justificatives enable row level security;
create policy pieces_amo_all on pieces_justificatives
  for all to authenticated using (is_amo()) with check (is_amo());
create policy pieces_own_all on pieces_justificatives
  for all to authenticated
  using (coproprietaire_id in (select my_coproprietaire_ids()))
  with check (
    coproprietaire_id in (select my_coproprietaire_ids())
    and is_copro_of(copro_id)
  );

-- ========== Storage ==========
-- Bucket privé des pièces justificatives : 1 dossier par user (uid/...)
insert into storage.buckets (id, name, public)
values ('pieces-copro', 'pieces-copro', false)
on conflict (id) do nothing;

create policy storage_pieces_own on storage.objects
  for all to authenticated
  using (bucket_id = 'pieces-copro' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pieces-copro' and (storage.foldername(name))[1] = auth.uid()::text);

create policy storage_pieces_amo on storage.objects
  for select to authenticated
  using (bucket_id = 'pieces-copro' and is_amo());

-- Téléchargement des fichiers projet partagés (bucket copro-files)
create policy storage_files_copro_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'copro-files'
    and exists (
      select 1 from public.fichiers f
      where f.storage_path = name and f.partage_copro and is_copro_of(f.copro_id)
    )
  );
