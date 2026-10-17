-- 0170 - Montant d'un PF définitif en brouillon dans copro_stats (colonne « Montant » du tableau de bord et du portefeuille).
--
-- Contexte (17/10/2026) : import des plans de financement trouvés dans les dossiers « Mon projet ANAH »
-- des copropriétés qui n'en avaient aucun. Ils arrivent en brouillon ; avec la règle des 0167 / 0169,
-- une copropriété qui reçoit un plan, même brouillon, perdait son montant ANAH provisoire et passait en
-- « Non chiffré ». Choix d'Amir : afficher le montant du brouillon importé.
--
-- Ordre des sources de montant_ttc / reste_a_charge / taux_aides :
--   1. plans de financement validés (inchangé) ;
--   2. scénario partagé (inchangé) ;
--   3. NOUVEAU : PF définitif(s) en brouillon - le plus récent de chaque nom, additionnés (une copropriété
--      à plusieurs bâtiments a un plan par bâtiment, « PF définitif - X - Bât A / Bât B » ; deux imports
--      du même classeur portent le même nom et ne comptent qu'une fois). Les plans estimatifs (scénarios
--      de comparaison) ne comptent jamais ;
--   4. ANAH : lateral de la 0169 repris tel quel (coût total, sinon coût des travaux, sinon total des
--      devis cohérents ; seulement si la copropriété n'a AUCUN plan dans plans_definitifs).
-- montant_source : 'plan_financement' | 'scenario' | 'plan_brouillon' (nouveau) | 'anah'.
--
-- La vue reste en security_invoker : un syndic ne lit que les plans validés (RLS de plans_definitifs),
-- il ne voit donc jamais le montant d'un brouillon.
create or replace view public.copro_stats with (security_invoker = true) as
select
  c.id,
  (select count(*) from lots l where l.copro_id = c.id)::integer as lots,
  (select count(*) from lots l where l.copro_id = c.id and l.usage = 'habitation'::usage_lot)::integer as lots_hab,
  (select count(*) from coproprietaires cp where cp.copro_id = c.id)::integer as coproprietaires,
  (select count(*) from batiments b where b.copro_id = c.id)::integer as batiments,
  coalesce(pf.nom, s.name, br.nom) as scenario,
  coalesce(pf.total_operation, (s.resultat ->> 'coutTotal')::numeric, br.total_operation, anah.montant) as montant_ttc,
  coalesce(pf.reste_a_charge, (s.resultat ->> 'resteACharge')::numeric, br.reste_a_charge) as reste_a_charge,
  coalesce(
    case
      when pf.n = 1 then pf.taux_un
      else pf.total_aides / nullif(pf.total_operation, 0::numeric)
    end,
    (s.resultat ->> 'tauxAides')::numeric,
    br.total_aides / nullif(br.total_operation, 0::numeric)
  ) as taux_aides,
  (select t.title from taches t
    where t.copro_id = c.id and t.status <> 'done'::statut_tache and t.phase = c.phase
    order by t."position" limit 1) as next_task,
  (select count(*) from taches t where t.copro_id = c.id)::integer as taches_total,
  (select count(*) from taches t where t.copro_id = c.id and t.status = 'done'::statut_tache)::integer as taches_faites,
  (select count(*) from syndic_taches st where st.copro_id = c.id)::integer as staches_total,
  (select count(*) from syndic_taches st where st.copro_id = c.id and st.statut = 'done'::text)::integer as staches_faites,
  case
    when pf.total_operation is not null then 'plan_financement'
    when (s.resultat ->> 'coutTotal') is not null then 'scenario'
    when br.total_operation is not null then 'plan_brouillon'
    when anah.montant is not null then 'anah'
  end as montant_source
from coproprietes c
  left join lateral (
    select count(*) as n,
      string_agg(pd.nom, ' + '::text order by pd.created_at) as nom,
      sum((pd.resultat ->> 'totalOperationTtc')::numeric) as total_operation,
      sum((pd.resultat ->> 'resteACharge')::numeric) as reste_a_charge,
      sum((pd.resultat ->> 'totalAides')::numeric) as total_aides,
      max((pd.resultat ->> 'tauxCouverture')::numeric) as taux_un
    from plans_definitifs pd
    where pd.copro_id = c.id and pd.statut = 'valide'::text
  ) pf on true
  left join lateral (
    select sf.name, sf.resultat
    from scenarios_financiers sf
    where sf.copro_id = c.id and sf.statut = 'partage'::statut_scenario
    order by sf.updated_at desc
    limit 1
  ) s on true
  left join lateral (
    select
      string_agg(d.nom, ' + '::text order by d.nom) as nom,
      sum((d.resultat ->> 'totalOperationTtc')::numeric) as total_operation,
      sum((d.resultat ->> 'resteACharge')::numeric) as reste_a_charge,
      sum((d.resultat ->> 'totalAides')::numeric) as total_aides
    from (
      select distinct on (pd.nom) pd.nom, pd.resultat
      from plans_definitifs pd
      where pd.copro_id = c.id and pd.statut = 'brouillon'::text and pd.nature = 'definitif'::text
        and pd.resultat ? 'totalOperationTtc'
      order by pd.nom, pd.updated_at desc
    ) d
  ) br on true
  left join lateral (
    select coalesce(a.cout_total_ttc, a.cout_travaux_ttc, dv.total_ttc) as montant
    from anah_dossiers a
    left join lateral (
      -- total des devis, seulement si chacun est cohérent (TTC entre HT et HT + 20 %)
      select sum(d.montant_ttc) as total_ttc
      from anah_devis d
      where d.dossier_id = a.id
      having count(*) > 0
         and bool_and(d.montant_ht > 0 and d.montant_ttc between d.montant_ht and d.montant_ht * 1.2)
    ) dv on true
    where a.copro_id = c.id and a.est_reference and not a.perimetre_partiel
      and coalesce(a.cout_total_ttc, a.cout_travaux_ttc, dv.total_ttc) is not null
      and not exists (select 1 from plans_definitifs p where p.copro_id = c.id)
    order by a.modifie_sur_anah_le desc nulls last
    limit 1
  ) anah on true;
