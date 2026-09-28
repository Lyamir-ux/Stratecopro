-- 0114 - Devis AMO revalorisé : le chargé d'affaire du dossier
--
-- Demande d'Amir 28/09/2026 : après « Revaloriser la P2 », un bouton placé
-- sous celui-ci télécharge le nouveau contrat AMO en PDF (modèle du skill
-- devis-amo, P1 + P2 sans les honoraires CEE). Le chargé d'affaire du contrat
-- est le chef de projet du dossier, saisi en clair sur la fiche : on retrouve
-- son compte AMO actif en comparant les noms (minuscules, sans accents,
-- espaces simples - même règle que notifier-passation) pour lire ses
-- initiales (préfixe du n° de contrat) et son e-mail de connexion, que le
-- navigateur ne peut pas lire lui-même. Réservé à l'équipe AMO ; aucune ligne
-- si le dossier n'a pas de chef de projet ou si son nom ne correspond à aucun
-- compte.

create or replace function devis_amo_normaliser_nom(s text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(s, '')),
      'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ',
      'aaaaaaceeeeiiiinooooouuuuyy'),
    '\s+', ' ', 'g'));
$$;

create or replace function devis_amo_chef_projet(p_copro_id uuid)
returns table (full_name text, initials text, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_chef text;
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;
  select nullif(btrim(c.chef_projet), '') into v_chef
  from coproprietes c
  where c.id = p_copro_id and c.deleted_at is null;
  if v_chef is null then
    return;
  end if;
  return query
    select p.full_name::text, p.initials::text, u.email::text
    from profiles p
    join auth.users u on u.id = p.user_id
    where p.role = 'amo'
      and p.active
      and devis_amo_normaliser_nom(p.full_name) = devis_amo_normaliser_nom(v_chef)
    order by p.created_at
    limit 1;
end;
$$;

comment on function devis_amo_chef_projet(uuid) is
  'Devis AMO revalorisé (0114) : compte AMO du chef de projet du dossier (nom, initiales, e-mail de connexion), rapproché par le nom.';

revoke execute on function devis_amo_normaliser_nom(text) from public, anon;
revoke execute on function devis_amo_chef_projet(uuid) from public, anon;
grant execute on function devis_amo_chef_projet(uuid) to authenticated;
