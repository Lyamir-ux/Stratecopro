-- 0167 - Montant provisoire de l'ANAH dans copro_stats (colonne « Montant » du tableau de bord et du portefeuille).
--
-- Règle d'Amir du 17/10/2026 : une copropriété qui a déjà un plan de financement chargé
-- n'est pas touchée ; sans plan de financement, on affiche en attendant le coût total de
-- l'opération TTC déclaré à l'ANAH. Dès qu'un plan est chargé, il passe devant tout seul :
-- il n'y a aucune valeur à écraser ni à nettoyer.
--
-- montant_ttc : plan de financement validé, sinon scénario partagé (comme avant), sinon
--   ANAH (cout_total_ttc du dossier de référence) uniquement si la copropriété n'a AUCUN plan
--   de financement dans plans_definitifs, quel que soit son statut (estimatif ou brouillon
--   compris). Les copropriétés à périmètre partiel n'ont aucun montant ANAH (contrainte de
--   la 0166) : elles ne sont donc jamais concernées.
-- montant_source (nouvelle colonne, ajoutée à la fin) : 'plan_financement', 'scenario' ou
--   'anah', pour pouvoir afficher « provisoire » quand la source est l'ANAH.
--
-- Reste à charge et taux d'aides ne changent pas (restent vides pour une source ANAH).
-- La vue reste en security_invoker : les données ANAH étant réservées à l'équipe AMO (0166),
-- un syndic voit toujours « Non chiffré » pour ces copropriétés.
create or replace view public.copro_stats with (security_invoker = true) as
select
  c.id,
  (select count(*) from lots l where l.copro_id = c.id)::integer as lots,
  (select count(*) from lots l where l.copro_id = c.id and l.usage = 'habitation'::usage_lot)::integer as lots_hab,
  (select count(*) from coproprietaires cp where cp.copro_id = c.id)::integer as coproprietaires,
  (select count(*) from batiments b where b.copro_id = c.id)::integer as batiments,
  coalesce(pf.nom, s.name) as scenario,
  coalesce(pf.total_operation, (s.resultat ->> 'coutTotal')::numeric, anah.cout_total_ttc) as montant_ttc,
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
    when anah.cout_total_ttc is not null then 'anah'
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
    select a.cout_total_ttc
    from anah_dossiers a
    where a.copro_id = c.id and a.est_reference and not a.perimetre_partiel and a.cout_total_ttc is not null
      and not exists (select 1 from plans_definitifs p where p.copro_id = c.id)
    order by a.modifie_sur_anah_le desc nulls last
    limit 1
  ) anah on true;
