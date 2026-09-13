-- 0066 - Feedback d'Amir du 13/09/2026 : dossier ANAH - MaPrimeRénov' Copro du
-- syndic (page Documents à produire), construit depuis la checklist MaPrimeRénov'
-- (15 pièces). Le catalogue des pièces et leur déposant vivent côté client
-- (ANAH_ETAPES dans src/api/montage.ts). Deux pièces sont CONFIDENTIELLES -
-- avis d'imposition des copropriétaires éligibles aux aides individuelles et
-- liste des primes individuelles : déposées par Strat Eco, elles ne doivent être
-- ni visibles ni téléchargeables par le syndic (réponses d'Amir aux questions
-- 12 et 13).
--
-- Verrou côté serveur (l'interface seule ne suffit pas) :
--   1. montage_docs.confidentiel : la ligne est invisible au syndic (RLS) et il
--      ne peut ni la créer ni la modifier ;
--   2. les fichiers confidentiels sont stockés sous montage-prive/<copro_id>/…
--      du bucket copro-files : aucune policy syndic ne couvre ce préfixe (la
--      sienne, 0011, est limitée à montage/…), l'AMO garde tous les droits
--      (storage_amo_all, 0002) - pas d'URL signée possible pour le syndic ;
--   3. la RPC documents_dossier (onglet Fichiers) n'expose plus ces pièces
--      qu'à l'AMO.

alter table montage_docs
  add column if not exists confidentiel boolean not null default false;

comment on column montage_docs.confidentiel is
  'Pièce réservée à l''équipe AMO (ex. avis d''imposition, primes individuelles) : invisible et non modifiable par le syndic ; fichiers sous montage-prive/.';

drop policy if exists montage_docs_syndic_read on montage_docs;
create policy montage_docs_syndic_read on montage_docs
  for select to authenticated
  using (is_syndic_of(copro_id) and not confidentiel);

drop policy if exists montage_docs_syndic_insert on montage_docs;
create policy montage_docs_syndic_insert on montage_docs
  for insert to authenticated
  with check (is_syndic_of(copro_id) and not confidentiel);

drop policy if exists montage_docs_syndic_update on montage_docs;
create policy montage_docs_syndic_update on montage_docs
  for update to authenticated
  using (is_syndic_of(copro_id) and not confidentiel)
  with check (is_syndic_of(copro_id) and not confidentiel);

-- Onglet Fichiers : même signature qu'en 0028, les pièces confidentielles ne
-- sortent que pour l'AMO. Libellé du montage ANAH aligné sur la carte de la
-- page Documents à produire (tiret simple).
create or replace function documents_dossier(p_copro_id uuid)
returns table (
  id text,
  name text,
  path text,
  taille bigint,
  dossier text,
  depose_le timestamptz,
  origine text
)
language sql stable security definer
set search_path = public
as $$
  with autorise as (select is_syndic_of(p_copro_id) or is_amo() as ok, is_amo() as amo)
  -- Dépôts de l'équipe projet
  select f.id::text,
         f.name,
         f.storage_path,
         f.size,
         f.dossier,
         f.created_at,
         case p.role when 'moe' then 'moe' when 'syndic' then 'syndic' else 'amo' end
  from fichiers f
  left join profiles p on p.user_id = f.uploaded_by
  cross join autorise a
  where f.copro_id = p_copro_id and a.ok

  union all

  -- Pièces déposées pour la banque et les financeurs depuis « Documents à produire »
  select d.id::text || '-' || (e.ord - 1)::text,
         e.f ->> 'name',
         e.f ->> 'path',
         nullif(e.f ->> 'size', '')::bigint,
         coalesce(m.label, 'Documents à produire'),
         nullif(e.f ->> 'uploaded_at', '')::timestamptz,
         coalesce(
           (select case pp.role when 'moe' then 'moe' when 'amo' then 'amo' else 'syndic' end
            from profiles pp where pp.user_id = nullif(e.f ->> 'uploaded_by', '')::uuid),
           'syndic'
         )
  from montage_docs d
  cross join lateral jsonb_array_elements(d.files) with ordinality as e(f, ord)
  left join (values
    ('ecoptz', 'Éco-PTZ collectif'),
    ('anah', 'ANAH - MaPrimeRénov'' Copro'),
    ('cee', 'Certificats d''économie d''énergie'),
    ('climaxion', 'ClimAxion'),
    ('do', 'Dommages-ouvrage')
  ) as m(id, label) on m.id = d.montage
  cross join autorise a
  where d.copro_id = p_copro_id and a.ok
    and (not d.confidentiel or a.amo)

  order by 6 desc nulls last;
$$;
revoke execute on function documents_dossier(uuid) from anon, public;
