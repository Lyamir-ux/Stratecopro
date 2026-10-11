-- 0156 - Plans de financement par bâtiment (demande d'Amir, 11/10/2026) : dans
-- une copropriété à plusieurs bâtiments, le programme de travaux d'un bâtiment
-- peut différer de celui d'un autre, donc la répartition aussi. Un PF définitif
-- reçoit un périmètre (les bâtiments qu'il couvre) et plusieurs PF peuvent être
-- validés en même temps tant que leurs périmètres ne se chevauchent pas (règle
-- tenue côté application, comme l'ancienne règle « un seul PF validé »).
--
-- Côté portail, le copropriétaire voit un seul plan cumulé (choix d'Amir) : le
-- scénario « pont » partagé (0031) agrège désormais tous les PF validés, listés
-- dans pf_ids ; plan_definitif_id reste l'ancre du pont (un des PF).

-- 1. Périmètre du PF : null = toute la copropriété.
alter table plans_definitifs add column batiment_ids uuid[];
comment on column plans_definitifs.batiment_ids is
  'Bâtiments couverts par le PF (null = toute la copropriété). Deux PF validés ne se chevauchent pas (géré côté application).';

-- 2. PF agrégés par le scénario pont partagé au portail.
alter table scenarios_financiers add column pf_ids uuid[] not null default '{}';
update scenarios_financiers set pf_ids = array[plan_definitif_id] where plan_definitif_id is not null;
comment on column scenarios_financiers.pf_ids is
  'PF définitifs cumulés par le scénario pont (plans par bâtiment) ; plan_definitif_id en est l''ancre.';

-- 3. Le copropriétaire lit chaque PF agrégé par un pont partagé (plan de la copropriété du portail).
alter policy plans_definitifs_copro_read on public.plans_definitifs
  using (((copro_id = ANY (( SELECT copros_coproprietaire() )::uuid[])) AND (statut = 'valide'::text) AND (EXISTS ( SELECT 1
   FROM scenarios_financiers s
  WHERE ((s.copro_id = plans_definitifs.copro_id) AND (s.statut = 'partage'::statut_scenario)
    AND ((s.plan_definitif_id = plans_definitifs.id) OR (plans_definitifs.id = ANY (s.pf_ids))))))));

-- 4. Cartes du tableau de bord et du portefeuille : montants additionnés sur
--    tous les PF validés (un seul PF : valeurs inchangées).
create or replace view copro_stats with (security_invoker = true) as
select
  c.id,
  (select count(*) from lots l where l.copro_id = c.id)::int as lots,
  (select count(*) from lots l where l.copro_id = c.id and l.usage = 'habitation')::int as lots_hab,
  (select count(*) from coproprietaires cp where cp.copro_id = c.id)::int as coproprietaires,
  (select count(*) from batiments b where b.copro_id = c.id)::int as batiments,
  coalesce(pf.nom, s.name) as scenario,
  coalesce(pf.total_operation, (s.resultat ->> 'coutTotal')::numeric) as montant_ttc,
  coalesce(pf.reste_a_charge, (s.resultat ->> 'resteACharge')::numeric) as reste_a_charge,
  coalesce(
    case when pf.n = 1 then pf.taux_un
         else pf.total_aides / nullif(pf.total_operation, 0) end,
    (s.resultat ->> 'tauxAides')::numeric
  ) as taux_aides,
  (select t.title from taches t
     where t.copro_id = c.id and t.status <> 'done' and t.phase = c.phase
     order by t.position limit 1) as next_task,
  (select count(*) from taches t where t.copro_id = c.id)::int as taches_total,
  (select count(*) from taches t where t.copro_id = c.id and t.status = 'done')::int as taches_faites,
  (select count(*) from syndic_taches st where st.copro_id = c.id)::int as staches_total,
  (select count(*) from syndic_taches st where st.copro_id = c.id and st.statut = 'done')::int as staches_faites
from coproprietes c
left join lateral (
  select
    count(*) as n,
    string_agg(pd.nom, ' + ' order by pd.created_at) as nom,
    sum((pd.resultat ->> 'totalOperationTtc')::numeric) as total_operation,
    sum((pd.resultat ->> 'resteACharge')::numeric) as reste_a_charge,
    sum((pd.resultat ->> 'totalAides')::numeric) as total_aides,
    max((pd.resultat ->> 'tauxCouverture')::numeric) as taux_un
  from plans_definitifs pd
  where pd.copro_id = c.id and pd.statut = 'valide'
) pf on true
left join lateral (
  select name, resultat from scenarios_financiers sf
  where sf.copro_id = c.id and sf.statut = 'partage'
  order by sf.updated_at desc limit 1
) s on true;

-- 5. Lecture seule des collaborateurs (0141) : nouvelles colonnes en fin de vue.
create or replace view exploitation.scenarios_financiers as
select id, copro_id, name, statut, locked, bareme_millesime, params, resultat,
       validated_at, created_at, updated_at, plan_definitif_id, pf_ids
from public.scenarios_financiers;

create or replace view exploitation.plans_definitifs as
select id, copro_id, nom, data, resultat, statut, version, nature,
       estimatif_groupe, scenario_ordre, valide_le, created_at, updated_at, batiment_ids
from public.plans_definitifs;
