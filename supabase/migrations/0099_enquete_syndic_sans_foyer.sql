-- 0099 - Feedback de Pierrot LEFOU (syndic) du 24/09/2026 : dans « Réponses des
-- copropriétaires » de l'onglet Enquête sociale, la composition du foyer
-- (nombre de personnes) ne doit pas apparaître. Le front ne l'affiche plus ;
-- la RPC vue syndic cesse aussi de la renvoyer, pour que la donnée ne quitte
-- plus la base vers l'espace syndic (même principe que le RFR, exclu depuis 0009).
-- Changement du type de retour : drop puis create (un create or replace est refusé).
drop function if exists enquete_reponses_syndic(uuid);

create function enquete_reponses_syndic(p_copro_id uuid)
returns table (
  coproprietaire_id uuid,
  statut_occupation text,
  profil_mpr text,
  updated_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select r.coproprietaire_id, r.statut_occupation, r.profil_mpr, r.updated_at
  from enquete_reponses r
  join enquetes e on e.id = r.enquete_id
  where e.copro_id = p_copro_id
    and (is_syndic_of(p_copro_id) or is_amo());
$$;
revoke execute on function enquete_reponses_syndic(uuid) from anon, public;
grant execute on function enquete_reponses_syndic(uuid) to authenticated;
