-- Feedback Amir 31/08/2026 : les retours de test peuvent être archivés dans
-- « À étudier plus tard » (statut a_etudier, entre « nouveau » et « traité »).
alter table public.feedbacks drop constraint feedbacks_statut_check;
alter table public.feedbacks
  add constraint feedbacks_statut_check
  check (statut = any (array['nouveau'::text, 'a_etudier'::text, 'traite'::text]));
