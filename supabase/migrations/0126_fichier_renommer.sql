-- 0126 - Renommer un fichier de l'onglet Fichiers (feedbacks d'Amir du
-- 02/10/2026) : bouton « Modifier » côté AMO (09:19), puis côté syndic, mais
-- seulement sur les documents que le syndic a lui-même déposés.
--
-- Le syndic n'a pas le droit de modifier la table fichiers (lecture, dépôt et
-- suppression de ses dépôts seulement, 0058) : plutôt qu'une policy d'update
-- qui lui ouvrirait toutes les colonnes (dossier, confidentiel, partage au
-- portail…), une RPC qui ne change que le nom.
--   - AMO : tout fichier, sauf les pièces du dossier « Facturation » (factures
--     et avoirs émis par le logiciel, 0115) ;
--   - syndic : ses propres dépôts (uploaded_by = auth.uid()), comme la
--     suppression (fichiers_syndic_delete_own).
-- Seul le nom affiché change, l'objet stocké reste en place. Le même fichier
-- peut figurer dans des dossiers de montage (propagation du dépôt, 0068) : le
-- nouveau nom y est reporté dans la même transaction. Le nom arrive déjà
-- normalisé par le client (nomRenomme : sans accent, extension conservée).

create or replace function public.fichier_renommer(p_fichier_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_copro uuid;
  v_path text;
  v_dossier text;
  v_depose_par uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  select copro_id, storage_path, dossier, uploaded_by
    into v_copro, v_path, v_dossier, v_depose_par
    from fichiers where id = p_fichier_id;
  if v_copro is null then
    raise exception 'Fichier introuvable.' using errcode = 'P0002';
  end if;
  if not (is_amo() or (is_syndic_of(v_copro) and v_depose_par = auth.uid())) then
    raise exception 'Accès refusé : seuls vos propres dépôts peuvent être renommés.' using errcode = '42501';
  end if;
  if v_dossier = 'Facturation' then
    raise exception 'Les pièces émises par la facturation ne se renomment pas.' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'Le nom ne peut pas être vide.' using errcode = '22023';
  end if;
  if char_length(v_name) > 255 then
    raise exception 'Le nom est trop long (255 caractères au plus).' using errcode = '22023';
  end if;

  update fichiers set name = v_name where id = p_fichier_id;

  update montage_docs d
     set files = (
           select jsonb_agg(
                    case when e.f ->> 'path' = v_path then jsonb_set(e.f, '{name}', to_jsonb(v_name)) else e.f end
                    order by e.ord)
             from jsonb_array_elements(d.files) with ordinality as e(f, ord)
         ),
         updated_by = auth.uid()
   where d.copro_id = v_copro
     and jsonb_typeof(d.files) = 'array'
     and d.files @> jsonb_build_array(jsonb_build_object('path', v_path));
end;
$$;

comment on function public.fichier_renommer(uuid, text) is
  'Renomme un fichier de l''onglet Fichiers (0126) : AMO hors Facturation, syndic sur ses propres dépôts ; nom reporté dans les montage_docs du même chemin.';

revoke execute on function public.fichier_renommer(uuid, text) from public, anon;
grant execute on function public.fichier_renommer(uuid, text) to authenticated;
