-- 0028 — Base documentaire du dossier, avec l'origine de chaque pièce.
--
-- Qui a déposé quoi ? L'information est dans profiles.role de l'auteur, mais un
-- syndic ne lit que SON propre profil (policy profiles_own_read) : impossible de
-- joindre côté client. On passe donc par une fonction security definer, comme
-- pour enquete_reponses_syndic — elle résout le rôle et réunit les deux sources :
--   • table `fichiers`      → dépôts de l'équipe projet (AMO ou maîtrise d'œuvre)
--   • `montage_docs.files`  → pièces fournies par le syndic pour la banque
--
-- Origines renvoyées : 'amo' | 'moe' | 'syndic'.
-- Les entrées de montage_docs.files antérieures à cette migration ne portent pas
-- d'auteur : elles viennent de l'espace syndic, on les impute donc au syndic.

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
  with autorise as (select is_syndic_of(p_copro_id) or is_amo() as ok)
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

  -- Pièces déposées pour la banque depuis « Documents à produire »
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
    ('anah', 'ANAH — MaPrimeRénov'' Copro'),
    ('cee', 'Certificats d''économie d''énergie'),
    ('climaxion', 'ClimAxion'),
    ('do', 'Dommages-ouvrage')
  ) as m(id, label) on m.id = d.montage
  cross join autorise a
  where d.copro_id = p_copro_id and a.ok

  order by 6 desc nulls last;
$$;
revoke execute on function documents_dossier(uuid) from anon, public;
