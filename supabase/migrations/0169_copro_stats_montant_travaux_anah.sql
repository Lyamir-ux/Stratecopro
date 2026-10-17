-- 0169 - Montant ANAH de copro_stats : coût des travaux ou total des devis à défaut du coût total.
--
-- Contrôle demandé par Amir le 17/10/2026 (« vérifie qu'il y a bien les montants travaux pour
-- ceux où on a les montants travaux auprès de l'ANAH ») : sur 111 copropriétés suivies à
-- l'ANAH, deux avaient un montant de travaux sans « coût total de l'opération », donc
-- « Non chiffré » au tableau de bord :
--   - 317 AVENUE DE COLMAR : coût des travaux TTC saisi (110 422,95 €, = ses 5 devis) ;
--   - LES ERABLES (SELESTAT) : aucun coût saisi, 5 devis cohérents (332 594,26 € TTC).
-- Choix d'Amir : le montant ANAH devient, dans l'ordre, le coût total de l'opération TTC
-- (comme en 0167), sinon le coût des travaux TTC, sinon le total TTC des devis s'ils sont tous
-- cohérents (TTC entre HT et HT + 20 %). Un devis incohérent (Le Tristan : 25 000 € HT pour
-- 270 000 € TTC) laisse le dossier « Non chiffré ». Règle de 0167 inchangée : aucun montant
-- ANAH dès qu'un plan de financement est chargé, quel que soit son statut (9 RUE DE LA GARE).
create or replace view public.copro_stats with (security_invoker = true) as
select
  c.id,
  (select count(*) from lots l where l.copro_id = c.id)::integer as lots,
  (select count(*) from lots l where l.copro_id = c.id and l.usage = 'habitation'::usage_lot)::integer as lots_hab,
  (select count(*) from coproprietaires cp where cp.copro_id = c.id)::integer as coproprietaires,
  (select count(*) from batiments b where b.copro_id = c.id)::integer as batiments,
  coalesce(pf.nom, s.name) as scenario,
  coalesce(pf.total_operation, (s.resultat ->> 'coutTotal')::numeric, anah.montant) as montant_ttc,
  coalesce(pf.reste_a_charge, (s.resultat ->> 'resteACharge')::numeric) as reste_a_charge,
  coalesce(
    case
      when pf.n = 1 then pf.taux_un
      else pf.total_aides / nullif(pf.total_operation, 0::numeric)
    end,
    (s.resultat ->> 'tauxAides')::numeric
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
