-- 0093 - Plans de financement ESTIMATIFS à plusieurs scénarios
--
-- Cas Le Rodin (23/09/2026) : le classeur « PF estimatif » des chefs de projet
-- présente plusieurs scénarios de travaux côte à côte (une colonne par
-- scénario). Chaque scénario est un plan complet (même moteur, même éditeur
-- que le PF définitif) rangé dans plans_definitifs avec :
--   - nature = 'estimatif' (les plans existants restent 'definitif') ;
--   - estimatif_groupe : identifiant commun aux scénarios importés ensemble
--     (le comparatif de l'onglet Financement les met côte à côte) ;
--   - scenario_ordre : numéro du scénario dans le classeur (1, 2, 3…).
-- Un plan estimatif reste un brouillon de travail AMO : il n'est jamais
-- validé ni partagé, donc jamais visible du syndic ni du portail (les
-- policies plans_definitifs_syndic_read / _copro_read exigent 'valide' ou
-- 'partage').

alter table public.plans_definitifs
  add column if not exists nature text not null default 'definitif',
  add column if not exists estimatif_groupe uuid,
  add column if not exists scenario_ordre smallint;

alter table public.plans_definitifs drop constraint if exists plans_definitifs_nature_check;
alter table public.plans_definitifs
  add constraint plans_definitifs_nature_check check (nature in ('definitif', 'estimatif'));

alter table public.plans_definitifs drop constraint if exists plans_definitifs_estimatif_brouillon;
alter table public.plans_definitifs
  add constraint plans_definitifs_estimatif_brouillon check (
    nature = 'definitif'
    or (statut = 'brouillon' and estimatif_groupe is not null and scenario_ordre is not null)
  );

create index if not exists plans_definitifs_estimatif_groupe_idx
  on public.plans_definitifs (copro_id, estimatif_groupe)
  where nature = 'estimatif';

comment on column public.plans_definitifs.nature is
  'definitif : PF définitif (validable, partagé au syndic et au portail) ; estimatif : scénario d''un PF estimatif, toujours brouillon';
comment on column public.plans_definitifs.estimatif_groupe is
  'Scénarios d''un même PF estimatif (import d''un classeur à plusieurs colonnes « Scénario N »)';
comment on column public.plans_definitifs.scenario_ordre is
  'Numéro du scénario dans le PF estimatif (colonne du classeur)';
