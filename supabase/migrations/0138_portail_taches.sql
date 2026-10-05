-- 0138 - Tâches en cours sur l'accueil du portail (bug d'Amir du 05/10/2026,
-- 11:52 : « Afficher les tâches en cours également »).
--
-- portail_travaux (0129) ne renvoyait que les tâches de la phase Travaux. Le
-- récapitulatif de l'accueil montre désormais aussi ce qui est en cours sous
-- l'étape courante (Diagnostic, Études, Travaux) : la RPC renvoie donc les
-- tâches de toutes les phases du dossier (phase, libellé du gabarit, faite ou
-- non, en cours ou non), à l'AMO ou à un copropriétaire de ce dossier - rien
-- pour les autres. portail_travaux est conservée (anciens bundles déjà chargés).
create or replace function public.portail_taches(p_copro_id uuid)
returns table (phase text, titre text, fait boolean, en_cours boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.phase::text, t.title, t.status = 'done', t.status = 'doing'
  from taches t
  where t.copro_id = p_copro_id
    and (is_amo() or p_copro_id = any (copros_coproprietaire()))
  order by t.position;
$$;

revoke execute on function public.portail_taches(uuid) from public, anon;
grant execute on function public.portail_taches(uuid) to authenticated, service_role;
