-- 0022 — Consultations : option « DPE collectif » + questions des candidats.
-- 1. `consultations.options` accepte 'dpe_collectif' (prestation optionnelle
--    chiffrée par le candidat, comme le PPPT ou le mémoire Climaxion).
-- 2. `consultation_questions` : un candidat peut poser une question sur une
--    consultation avant de postuler ; l'AMO répond depuis /consultations.
--    Les questions-réponses sont visibles de tous les candidats de la
--    consultation (égalité d'information), sans exposer l'identité de
--    l'auteur aux autres candidats (la raison sociale n'est lisible que de
--    l'AMO via la table prestataires).

-- ========== Option DPE collectif ==========
alter table consultations drop constraint consultations_options_chk;
alter table consultations add constraint consultations_options_chk
  check (options <@ array['audit_reglementaire', 'pppt', 'dpe_collectif', 'memoire_climaxion']);

-- ========== Questions des candidats ==========
create table consultation_questions (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references consultations (id) on delete cascade,
  prestataire_id uuid not null references prestataires (id) on delete cascade,
  question text not null,
  reponse text,
  asked_at timestamptz not null default now(),
  answered_at timestamptz
);
create index idx_consultation_questions on consultation_questions (consultation_id);

alter table consultation_questions enable row level security;

-- AMO : tout (lecture, réponse, modération)
create policy consultation_questions_amo_all on consultation_questions
  for all to authenticated using (is_amo()) with check (is_amo());

-- Prestataire : lit les Q&A des consultations qu'il voit (mêmes règles que
-- les pièces jointes), pose une question en son nom sur une consultation
-- encore en ligne de ses métiers.
create policy consultation_questions_presta_read on consultation_questions
  for select to authenticated using (peut_voir_consultation(consultation_id));
create policy consultation_questions_presta_insert on consultation_questions
  for insert to authenticated
  with check (
    prestataire_id = my_prestataire_id()
    and reponse is null
    and answered_at is null
    and exists (
      select 1 from consultations c
      where c.id = consultation_id
        and c.statut = 'en_ligne'
        and c.type = any (my_presta_types())
    )
  );
