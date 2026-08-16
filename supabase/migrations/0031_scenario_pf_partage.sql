-- Partage du PF définitif validé aux copropriétaires : le partage passe par un
-- scénario financier « pont » (statut partage + plans_individuels matérialisés),
-- relié au plan définitif d'origine. Un seul scénario pont par plan définitif.

alter table scenarios_financiers
  add column plan_definitif_id uuid references plans_definitifs (id) on delete cascade;

create unique index scenarios_financiers_plan_definitif_uniq
  on scenarios_financiers (plan_definitif_id)
  where plan_definitif_id is not null;
