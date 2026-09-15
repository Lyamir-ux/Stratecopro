-- Appels de fonds par copropriétaire pour l'espace syndic (Amir, 15/09/2026 - Nouvelle Cité).
-- Quand le PF définitif ne peut pas être réparti par la plateforme (clés de répartition
-- incomplètes, tantièmes partiels), l'appel de fonds vient des plans individuels du scénario
-- partagé : quote-part - aides collectives (hors CEE, hors aides individuelles), c'est-à-dire
-- les montants de la banque ou de l'appel du syndic tels qu'inscrits par l'AMO.
-- Le syndic n'a pas de droit de lecture sur plans_individuels (il ne voit jamais les plans
-- chiffrés complets) : la RPC ne rend que l'appel et la part de prime CEE, pour ses copros.
create or replace function appels_de_fonds_syndic(p_copro_id uuid)
returns table (
  coproprietaire_id uuid,
  appel numeric,
  prime_cee numeric,
  source text
)
language sql stable security definer
set search_path = public
as $$
  select
    pi.coproprietaire_id,
    round(greatest(0, pi.quote_part - pi.subv_coll_part), 2) as appel,
    round(pi.cee_part, 2) as prime_cee,
    coalesce(pi.detail ->> 'source', 'scenario') as source
  from plans_individuels pi
  join scenarios_financiers s on s.id = pi.scenario_id
  where s.copro_id = p_copro_id
    and s.statut = 'partage'
    and s.id = (
      select s2.id from scenarios_financiers s2
      where s2.copro_id = p_copro_id and s2.statut = 'partage'
      order by s2.updated_at desc limit 1
    )
    and (is_syndic_of(p_copro_id) or is_amo());
$$;
revoke execute on function appels_de_fonds_syndic(uuid) from anon, public;
grant execute on function appels_de_fonds_syndic(uuid) to authenticated;
