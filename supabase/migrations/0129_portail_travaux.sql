-- 0129 - Récapitulatif des étapes sur l'accueil du portail (idée d'Amir du
-- 02/10/2026, 11:08) : sous « Travaux », ce qui reste à réaliser, en très
-- synthétique.
--
-- Le plan de tâches AMO (taches) n'est lisible que par l'équipe AMO : le
-- copropriétaire n'a que la phase du dossier. Les phases terminées le sont
-- entièrement (phase calculée depuis les tâches, 0065), leur récapitulatif se
-- déduit donc de la phase ; seule la phase Travaux en cours a besoin du détail
-- de ses tâches. Cette RPC ne renvoie que les tâches de la phase Travaux du
-- dossier (libellé du gabarit, faite ou non), à l'AMO ou à un copropriétaire
-- de ce dossier - rien pour les autres.
create or replace function public.portail_travaux(p_copro_id uuid)
returns table (titre text, fait boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.title, t.status = 'done'
  from taches t
  where t.copro_id = p_copro_id
    and t.phase = 'travaux'
    and (is_amo() or p_copro_id = any (copros_coproprietaire()))
  order by t.position;
$$;

revoke execute on function public.portail_travaux(uuid) from public, anon;
grant execute on function public.portail_travaux(uuid) to authenticated, service_role;
