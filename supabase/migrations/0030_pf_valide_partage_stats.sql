-- 0030 — Le PF définitif validé rayonne partout.
-- 1) Un plan validé est automatiquement partagé avec le syndic du dossier
--    (plus de bouton « partager » : valider = publier).
-- 2) La vue copro_stats (tableau de bord, portefeuille syndic) prend les
--    montants du PF définitif validé en priorité sur le scénario partagé.
drop policy plans_definitifs_syndic_read on plans_definitifs;
create policy plans_definitifs_syndic_read on plans_definitifs
  for select to authenticated
  using (is_syndic_of(copro_id) and statut in ('partage', 'valide'));

create or replace view copro_stats with (security_invoker = true) as
select
  c.id,
  (select count(*) from lots l where l.copro_id = c.id)::int as lots,
  (select count(*) from lots l where l.copro_id = c.id and l.usage = 'habitation')::int as lots_hab,
  (select count(*) from coproprietaires cp where cp.copro_id = c.id)::int as coproprietaires,
  (select count(*) from batiments b where b.copro_id = c.id)::int as batiments,
  coalesce(pf.nom, s.name) as scenario,
  coalesce((pf.resultat ->> 'totalOperationTtc')::numeric, (s.resultat ->> 'coutTotal')::numeric) as montant_ttc,
  coalesce((pf.resultat ->> 'resteACharge')::numeric, (s.resultat ->> 'resteACharge')::numeric) as reste_a_charge,
  coalesce((pf.resultat ->> 'tauxCouverture')::numeric, (s.resultat ->> 'tauxAides')::numeric) as taux_aides,
  (select t.title from taches t
     where t.copro_id = c.id and t.status <> 'done' and t.phase = c.phase
     order by t.position limit 1) as next_task
from coproprietes c
left join lateral (
  select nom, resultat from plans_definitifs pd
  where pd.copro_id = c.id and pd.statut = 'valide'
  order by pd.updated_at desc limit 1
) pf on true
left join lateral (
  select name, resultat from scenarios_financiers sf
  where sf.copro_id = c.id and sf.statut = 'partage'
  order by sf.updated_at desc limit 1
) s on true;
