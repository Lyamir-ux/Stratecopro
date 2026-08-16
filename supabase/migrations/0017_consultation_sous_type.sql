-- 0017 — Consultations diagnostiqueur : sous-type de mission + nombre de bâtiments.
-- « Diagnostic amiante et plomb avant travaux » : le candidat a besoin du nombre
-- de logements et du programme de travaux pressentis (description de mission).
-- « Test d'étanchéité à l'air » : le candidat a surtout besoin du nombre de
-- bâtiments — figé à la publication comme nb_logements (les prestataires ne
-- lisent pas les stats des copros de la plateforme).
alter table consultations add column sous_type text
  check (sous_type in ('amiante_plomb', 'etancheite'));
alter table consultations add column nb_batiments int;
