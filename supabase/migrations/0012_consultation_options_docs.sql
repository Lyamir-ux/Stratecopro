-- 0012 — Consultations : options demandées, documents joints, détail tarifaire MOE.
-- 1. `consultations.options` : prestations optionnelles cochées à la publication
--    (audit réglementaire, PPPT, mémoire ClimAxion).
-- 2. `consultation_docs` + bucket `consultation-docs` : pièces jointes déposées
--    par l'AMO à la publication (cahier des charges, audit, plans…), lisibles
--    par les prestataires qui voient la consultation.
-- 3. `candidatures` : détail tarifaire d'une offre MOE (DIAG AVP, PRO DCE,
--    suivi de chantier) + tarif par option demandée ; `montant` reste le total.

-- ========== Options demandées ==========
alter table consultations add column options text[] not null default '{}';
alter table consultations add constraint consultations_options_chk
  check (options <@ array['audit_reglementaire', 'pppt', 'memoire_climaxion']);

-- ========== Documents joints à la consultation ==========
create table consultation_docs (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references consultations (id) on delete cascade,
  path text not null,                       -- bucket consultation-docs : <consultation_id>/<fichier>
  name text not null,
  size bigint,
  uploaded_at timestamptz not null default now()
);
create index idx_consultation_docs on consultation_docs (consultation_id);

-- ========== Détail tarifaire d'une offre MOE ==========
alter table candidatures add column tarif_diag_avp numeric;   -- € HT
alter table candidatures add column tarif_pro_dce numeric;    -- € HT
alter table candidatures add column tarif_chantier numeric;   -- € HT (suivi de chantier)
alter table candidatures add column tarif_options jsonb;      -- { option: € HT } suivant les options cochées

-- ========== Visibilité d'une consultation (docs joints) ==========
-- AMO : tout ; prestataire : consultation en ligne de ses métiers ou déjà candidatée
create or replace function peut_voir_consultation(p_consultation_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select is_amo() or exists (
    select 1 from consultations c
    where c.id = p_consultation_id
      and (
        (c.statut = 'en_ligne' and c.type = any (my_presta_types()))
        or a_postule(c.id)
      )
  );
$$;
revoke execute on function peut_voir_consultation(uuid) from anon;

-- ========== RLS ==========
alter table consultation_docs enable row level security;
create policy consultation_docs_amo_all on consultation_docs
  for all to authenticated using (is_amo()) with check (is_amo());
create policy consultation_docs_presta_read on consultation_docs
  for select to authenticated using (peut_voir_consultation(consultation_id));

-- ========== Storage ==========
insert into storage.buckets (id, name, public)
values ('consultation-docs', 'consultation-docs', false)
on conflict (id) do nothing;

create policy storage_consult_docs_amo on storage.objects
  for all to authenticated
  using (bucket_id = 'consultation-docs' and is_amo())
  with check (bucket_id = 'consultation-docs' and is_amo());

create policy storage_consult_docs_presta_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'consultation-docs'
    and peut_voir_consultation(((storage.foldername(name))[1])::uuid)
  );
