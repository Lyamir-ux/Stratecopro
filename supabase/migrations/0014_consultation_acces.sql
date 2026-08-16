-- 0014 — État de la consultation : trace de récupération du dossier.
-- Quand un prestataire ouvre le formulaire de candidature ou télécharge une
-- pièce jointe, sa « récupération » est tracée (première et dernière fois).
-- L'AMO lit ces traces dans l'onglet « État de la consultation ».
-- L'aperçu AMO d'un espace prestataire n'écrit PAS de trace (insert refusé
-- par la RLS — my_prestataire_id() est nul pour un compte AMO).
create table consultation_acces (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references consultations (id) on delete cascade,
  prestataire_id uuid not null references prestataires (id) on delete cascade,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  unique (consultation_id, prestataire_id)
);
create index idx_consultation_acces on consultation_acces (consultation_id);

alter table consultation_acces enable row level security;

-- AMO : lecture seule (le suivi vient des prestataires)
create policy consultation_acces_amo_read on consultation_acces
  for select to authenticated using (is_amo());

-- prestataire : trace sa propre récupération sur une consultation visible
create policy consultation_acces_presta_read on consultation_acces
  for select to authenticated using (prestataire_id = my_prestataire_id());
create policy consultation_acces_presta_insert on consultation_acces
  for insert to authenticated
  with check (prestataire_id = my_prestataire_id() and peut_voir_consultation(consultation_id));
create policy consultation_acces_presta_update on consultation_acces
  for update to authenticated
  using (prestataire_id = my_prestataire_id())
  with check (prestataire_id = my_prestataire_id());
