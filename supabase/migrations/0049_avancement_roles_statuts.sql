-- 0049 — Feedbacks d'Amir du 28/08 :
-- 1. Cases à trois états côté syndic : un clic = « en cours » (orange), un
--    second = « fait » (vert), comme les pastilles de l'AMO → le statut
--    'doing' entre dans la contrainte de syndic_taches.
-- 2. Deux rôles de plus dans les organisations de syndic : administratif et
--    comptable (même périmètre que gestionnaire : leurs dossiers rattachés ;
--    seul le directeur voit toute l'enseigne, is_directeur_of inchangée).
-- 3. Avancement calculé au lieu du champ manuel coproprietes.progress (jamais
--    alimenté) : copro_stats expose les compteurs de tâches AMO (table taches)
--    et syndic (syndic_taches) - côté AMO le % = tâches AMO faites, côté
--    syndic le % = tâches syndic faites. La vue est security_invoker : un
--    syndic compte 0 tâche AMO (RLS), il n'utilise que les colonnes staches_*.

-- ========== 1. Statut « en cours » ==========
alter table syndic_taches drop constraint syndic_taches_statut_check;
alter table syndic_taches add constraint syndic_taches_statut_check
  check (statut in ('todo', 'doing', 'done'));

-- ========== 2. Rôles d'organisation ==========
alter type org_role add value if not exists 'administratif';
alter type org_role add value if not exists 'comptable';

-- ========== 3. Compteurs d'avancement ==========
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
     order by t.position limit 1) as next_task,
  -- avancement AMO : plan de tâches interne (invisible du syndic via la RLS)
  (select count(*) from taches t where t.copro_id = c.id)::int as taches_total,
  (select count(*) from taches t where t.copro_id = c.id and t.status = 'done')::int as taches_faites,
  -- avancement syndic : ses tâches d'accompagnement (0047)
  (select count(*) from syndic_taches st where st.copro_id = c.id)::int as staches_total,
  (select count(*) from syndic_taches st where st.copro_id = c.id and st.statut = 'done')::int as staches_faites
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
