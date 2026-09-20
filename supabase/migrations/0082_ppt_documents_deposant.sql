-- 0082 - Suivi PPT, onglet Documents : déposant, suppression, renommage
--
-- 1. Qui a déposé le document : la RLS de profiles ne laisse lire que son
--    propre profil (le syndic ne lit jamais l'annuaire). Une RPC security
--    definer rend le nom du déposant pour les documents d'un dossier ouvrable.
-- 2. Suppression d'un document : ni le syndic ni l'AMO n'avaient de policy de
--    delete sur ppt_rapports. Le déposant retire son dépôt, Strat Eco retire
--    n'importe quel document non validé (un rapport validé porte le plan de la
--    copropriété : il faut le rejeter d'abord). Le fichier part avec.
-- 3. Renommage : corriger le seul nom d'un document (sans changer de
--    copropriété) est ouvert à qui ouvre le dossier - c'est ce qui permet de
--    répercuter le renommage d'une copropriété sur ses fichiers.

-- ========== 1. Déposants d'un dossier ==========
create or replace function ppt_deposants(p_copro uuid)
returns table (rapport_id uuid, user_id uuid, nom text, email text)
language sql stable security definer set search_path = public as $$
  select r.id, p.user_id, p.full_name, u.email::text
  from ppt_rapports r
  left join profiles p on p.user_id = r.depose_par
  left join auth.users u on u.id = r.depose_par
  where r.ppt_copro_id = p_copro and ppt_ouvre(p_copro);
$$;
revoke execute on function ppt_deposants(uuid) from anon, public;
grant execute on function ppt_deposants(uuid) to authenticated;

-- ========== 2. Suppression d'un document ==========
create or replace function ppt_supprimer_rapport(p_rapport_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_r ppt_rapports;
begin
  select * into v_r from ppt_rapports where id = p_rapport_id;
  if not found then raise exception 'Document introuvable'; end if;
  if v_r.statut = 'valide' then
    raise exception 'Ce rapport est validé : son plan est rattaché à la copropriété. Rejetez-le avant de le supprimer.';
  end if;
  if not (is_amo() or (v_r.depose_par = auth.uid() and ppt_depose(v_r.ppt_copro_id))) then
    raise exception 'Suppression réservée à l''équipe Strat Eco ou au déposant du document';
  end if;

  -- le journal garde la trace du document supprimé (rapport_id passe à null)
  perform ppt_journaliser(v_r.ppt_copro_id, p_rapport_id, 'suppression',
    jsonb_build_object('name', v_r.name, 'type', v_r.type, 'statut', v_r.statut, 'depose_le', v_r.depose_le));
  delete from ppt_rapports where id = p_rapport_id;
  return v_r.storage_path;
end;
$$;
revoke execute on function ppt_supprimer_rapport(uuid) from anon, public;
grant execute on function ppt_supprimer_rapport(uuid) to authenticated;

-- le déposant retire son propre fichier du bucket ; l'AMO a déjà la policy « all »
drop policy if exists storage_ppt_membre_delete on storage.objects;
create policy storage_ppt_membre_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'ppt-files'
    and owner = auth.uid()
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and ppt_is_membre_org(((storage.foldername(name))[1])::uuid)
  );

-- ========== 3. Renommage sans changement de copropriété ==========
create or replace function ppt_corriger_rapport(
  p_rapport_id uuid,
  p_copro_id uuid,
  p_name text default null,
  p_type text default null,
  p_storage_path text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_r ppt_rapports;
  v_org uuid;
  v_nom_avant text;
  v_nom_apres text;
  v_detail jsonb;
begin
  select * into v_r from ppt_rapports where id = p_rapport_id;
  if not found then raise exception 'Document introuvable'; end if;
  if v_r.statut = 'valide' then
    raise exception 'Ce rapport est validé : son plan est rattaché à la copropriété. Rejetez-le avant de le déplacer.';
  end if;

  select organisation_id into v_org from ppt_coproprietes where id = p_copro_id and deleted_at is null;
  if v_org is null then raise exception 'Copropriété de destination introuvable'; end if;

  if not (
    is_amo()
    or (v_r.depose_par = auth.uid() and ppt_depose(v_r.ppt_copro_id) and ppt_depose(p_copro_id))
    -- simple renommage / requalification dans le dossier : réservé à qui l'ouvre
    or (p_copro_id = v_r.ppt_copro_id and ppt_ouvre(p_copro_id))
  ) then
    raise exception 'Correction réservée à l''équipe Strat Eco ou au déposant du document';
  end if;

  if p_storage_path is not null and p_storage_path <> v_r.storage_path
     and p_storage_path not like v_org::text || '/' || p_copro_id::text || '/%' then
    raise exception 'Chemin de stockage incohérent avec la copropriété d''arrivée';
  end if;

  select nom into v_nom_avant from ppt_coproprietes where id = v_r.ppt_copro_id;
  select nom into v_nom_apres from ppt_coproprietes where id = p_copro_id;

  update ppt_rapports set
    ppt_copro_id = p_copro_id,
    name = coalesce(nullif(btrim(p_name), ''), v_r.name),
    type = coalesce(nullif(btrim(p_type), ''), v_r.type),
    storage_path = coalesce(nullif(btrim(p_storage_path), ''), v_r.storage_path)
  where id = p_rapport_id;

  v_detail := jsonb_build_object(
    'copro_avant', v_nom_avant, 'copro_apres', v_nom_apres,
    'name_avant', v_r.name, 'name_apres', coalesce(nullif(btrim(p_name), ''), v_r.name),
    'type_avant', v_r.type, 'type_apres', coalesce(nullif(btrim(p_type), ''), v_r.type));

  perform ppt_journaliser(v_r.ppt_copro_id, p_rapport_id, 'correction', v_detail);
  if p_copro_id is distinct from v_r.ppt_copro_id then
    perform ppt_journaliser(p_copro_id, p_rapport_id, 'correction', v_detail);
  end if;
end;
$$;

-- déplacement du fichier : son déposant, ou qui ouvre le dossier d'arrivée
drop policy if exists storage_ppt_membre_update on storage.objects;
create policy storage_ppt_membre_update on storage.objects for update to authenticated
  using (
    bucket_id = 'ppt-files'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and ppt_is_membre_org(((storage.foldername(name))[1])::uuid)
    and (owner = auth.uid() or ppt_ouvre(((storage.foldername(name))[2])::uuid))
  )
  with check (
    bucket_id = 'ppt-files'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and ppt_is_membre_org(((storage.foldername(name))[1])::uuid)
    and ppt_org_de(((storage.foldername(name))[2])::uuid) = ((storage.foldername(name))[1])::uuid
  );
