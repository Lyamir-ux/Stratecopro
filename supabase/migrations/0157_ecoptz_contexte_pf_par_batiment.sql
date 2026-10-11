-- 0157 - Éco-PTZ individuel et plans par bâtiment (11/10/2026) : le contexte du
-- questionnaire (lots de travaux du PF validé, 0133) réunit les lots de tous les
-- PF validés, un par bâtiment. Les lots de même numéro sont regroupés : le
-- dossier éco-PTZ range les entreprises par numéro de lot (titre et entreprise
-- du plus ancien PF qui les renseigne, éligible si un PF retient une ligne).
-- Un seul PF validé : résultat inchangé.
create or replace function public.ecoptz_contexte_pf(p_copro_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_lots jsonb;
  v_infos jsonb;
begin
  if ecoptz_role_appelant(p_copro_id) is null then
    raise exception 'Accès refusé au dossier' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'numero', x.numero,
           'titre', x.titre,
           'entreprise', x.entreprise,
           'eligible', x.eligible
         ) order by x.numero), '[]'::jsonb)
  into v_lots
  from (
    select
      (l ->> 'numero')::int as numero,
      coalesce((array_agg(coalesce(l ->> 'titre', '') order by p.created_at))[1], '') as titre,
      (array_agg(nullif(btrim(coalesce(l ->> 'entreprise', '')), '') order by p.created_at)
         filter (where nullif(btrim(coalesce(l ->> 'entreprise', '')), '') is not null))[1] as entreprise,
      bool_or(exists (
        select 1 from jsonb_array_elements(coalesce(l -> 'lignes', '[]'::jsonb)) y
        where coalesce((y ->> 'retenu')::boolean, false)
      )) as eligible
    from plans_definitifs p
    cross join jsonb_array_elements(coalesce(p.data -> 'lots', '[]'::jsonb)) l
    where p.copro_id = p_copro_id and p.statut = 'valide'
      and (l ->> 'numero') ~ '^\d+$'
    group by (l ->> 'numero')::int
  ) x;

  select jsonb_build_object(
    'cepInitial', p.data -> 'infos' -> 'cepInitial',
    'cepProjet', p.data -> 'infos' -> 'cepProjet',
    'etiquetteInitiale', p.data -> 'infos' -> 'etiquetteInitiale',
    'etiquetteProjet', p.data -> 'infos' -> 'etiquetteProjet'
  )
  into v_infos
  from plans_definitifs p
  where p.copro_id = p_copro_id and p.statut = 'valide'
  order by p.updated_at desc
  limit 1;

  return jsonb_build_object('lots', coalesce(v_lots, '[]'::jsonb), 'infos', coalesce(v_infos, '{}'::jsonb));
end;
$function$;
