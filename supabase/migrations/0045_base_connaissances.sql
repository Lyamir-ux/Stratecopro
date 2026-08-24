-- 0045 - Base de connaissances (feedback Wafaa 24/08/2026)
-- Rubrique de l'espace AMO regroupant les documents de référence de
-- l'entreprise (guides, modèles, réglementation...), classés par secteur
-- d'activité du projet (Copropriété, Bailleur social, Tertiaire...).
-- Documents internes à l'équipe : aucun autre espace n'y accède.
create table documents_reference (
  id uuid primary key default gen_random_uuid(),
  -- libellé du secteur d'activité (liste côté application, colonne libre
  -- pour pouvoir ajouter un secteur sans migration)
  secteur text not null default 'Transverse',
  name text not null,
  description text,
  storage_path text not null,
  size bigint,
  mime text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_documents_reference_secteur on documents_reference (secteur, created_at desc);

alter table documents_reference enable row level security;
create policy documents_reference_amo on documents_reference
  for all to authenticated using (is_amo()) with check (is_amo());

-- Bucket privé dédié - réservé à l'équipe AMO
insert into storage.buckets (id, name, public)
values ('base-connaissances', 'base-connaissances', false);

create policy base_connaissances_amo on storage.objects
  for all to authenticated
  using (bucket_id = 'base-connaissances' and is_amo())
  with check (bucket_id = 'base-connaissances' and is_amo());
