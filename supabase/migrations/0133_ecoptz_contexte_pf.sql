-- Questionnaire éco-PTZ au dépôt (02/10/2026) : lots de travaux du PF définitif
-- validé (numéro, titre, entreprise, éligibilité = au moins une ligne
-- « Retenu ») et performance énergétique du PF (Cep et étiquettes), pour tout
-- rôle qui peut saisir le dossier - y compris le maître d'œuvre, qui ne lit pas
-- les plans de financement. Aucun montant n'est renvoyé.

create or replace function ecoptz_contexte_pf(p_copro_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v jsonb;
begin
  if ecoptz_role_appelant(p_copro_id) is null then
    raise exception 'Accès refusé au dossier' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', (l ->> 'numero')::int,
        'titre', coalesce(l ->> 'titre', ''),
        'entreprise', nullif(btrim(coalesce(l ->> 'entreprise', '')), ''),
        'eligible', exists (
          select 1 from jsonb_array_elements(coalesce(l -> 'lignes', '[]'::jsonb)) x
          where coalesce((x ->> 'retenu')::boolean, false)
        )
      ) order by (l ->> 'numero')::int)
      from jsonb_array_elements(coalesce(p.data -> 'lots', '[]'::jsonb)) l
      where (l ->> 'numero') ~ '^\d+$'
    ), '[]'::jsonb),
    'infos', jsonb_build_object(
      'cepInitial', p.data -> 'infos' -> 'cepInitial',
      'cepProjet', p.data -> 'infos' -> 'cepProjet',
      'etiquetteInitiale', p.data -> 'infos' -> 'etiquetteInitiale',
      'etiquetteProjet', p.data -> 'infos' -> 'etiquetteProjet'
    )
  )
  into v
  from plans_definitifs p
  where p.copro_id = p_copro_id and p.statut = 'valide'
  order by p.updated_at desc
  limit 1;
  return coalesce(v, jsonb_build_object('lots', '[]'::jsonb, 'infos', '{}'::jsonb));
end;
$$;
revoke all on function ecoptz_contexte_pf(uuid) from public, anon;
grant execute on function ecoptz_contexte_pf(uuid) to authenticated;
