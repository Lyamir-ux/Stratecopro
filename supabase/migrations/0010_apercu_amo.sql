-- 0010 — Aperçu des espaces par l'AMO
-- L'AMO accède à tous les espaces (syndic / copropriétaire / prestataire) avec
-- son compte : la RPC des réponses d'enquête vue syndic doit donc aussi
-- répondre à l'AMO (qui a déjà accès à tout, RFR compris, via ses policies).
create or replace function enquete_reponses_syndic(p_copro_id uuid)
returns table (
  coproprietaire_id uuid,
  nb_personnes int,
  statut_occupation text,
  profil_mpr text,
  updated_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select r.coproprietaire_id, r.nb_personnes, r.statut_occupation, r.profil_mpr, r.updated_at
  from enquete_reponses r
  join enquetes e on e.id = r.enquete_id
  where e.copro_id = p_copro_id
    and (is_syndic_of(p_copro_id) or is_amo());
$$;
revoke execute on function enquete_reponses_syndic(uuid) from anon, public;
