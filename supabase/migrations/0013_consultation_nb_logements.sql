-- 0013 — Consultations : nombre de logements figé à la publication.
-- Les prestataires ne peuvent pas lire copro_stats (security_invoker + RLS) :
-- l'AMO fige donc le nombre de logements sur la consultation au moment de la
-- publication (copro plateforme : lots habitation ; copro externe : saisie).
alter table consultations add column nb_logements int;
