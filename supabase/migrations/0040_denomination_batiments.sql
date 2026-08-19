-- 0040 — Feedback du 19/08 : certaines copropriétés sont un seul et même
-- bâtiment à plusieurs entrées (« entrée 01, 02, 03 » et non « bât. 01, 02,
-- 03 »). La fiche porte la dénomination d'affichage des subdivisions,
-- modifiable dans la synthèse de l'onglet Données. Purement cosmétique :
-- les codes des bâtiments et les rattachements des lots ne changent pas.
alter table coproprietes
  add column if not exists denomination_batiments text not null default 'batiment'
  check (denomination_batiments in ('batiment', 'entree'));
