-- 0137 - Rapport d'enquête sociale en PDF : observations du chef de projet
--
-- Demande d'Amir du 04/10/2026 : le rapport d'enquête devient un PDF de
-- synthèse (occupants et profils, tableaux détaillés, liste nominative des
-- occupants). Le chef de projet peut y ajouter des observations libres, saisies
-- au moment de la génération et gardées pour la génération suivante.

alter table enquetes
  add column if not exists rapport_observations text;

alter table enquetes drop constraint if exists enquetes_rapport_observations_longueur;
alter table enquetes add constraint enquetes_rapport_observations_longueur
  check (char_length(rapport_observations) <= 3000);

comment on column enquetes.rapport_observations is
  'Observations du chef de projet imprimées dans le rapport d''enquête sociale (PDF) ; null = pas d''encadré (0137).';
