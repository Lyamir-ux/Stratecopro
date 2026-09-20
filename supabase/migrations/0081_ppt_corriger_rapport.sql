-- 0081 - Suivi PPT : corriger le rattachement d'un document déposé
--
-- Un document se dépose en tapant le nom de la copropriété : une faute de
-- frappe ou un fichier mal identifié le range sous la mauvaise copropriété (et
-- peut même en créer une). Le déposant doit pouvoir se corriger : changer la
-- copropriété, le type et le nom du fichier. Le chemin de stockage porte la
-- copropriété (<organisation>/<copro>/<horodatage>-<nom>) et commande la lecture
-- côté syndic : le fichier est donc déplacé dans le bucket, et la RPC contrôle
-- que le nouveau chemin correspond bien à la copropriété d'arrivée.
--
-- Un rapport validé ne se déplace plus : ses postes, ses remarques et
-- l'échéancier appartiennent à la copropriété. Il faut le rejeter d'abord.

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

  if not (is_amo() or (v_r.depose_par = auth.uid() and ppt_depose(v_r.ppt_copro_id) and ppt_depose(p_copro_id))) then
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
revoke execute on function ppt_corriger_rapport(uuid, uuid, text, text, text) from anon, public;
grant execute on function ppt_corriger_rapport(uuid, uuid, text, text, text) to authenticated;

-- Déplacement du fichier dans le bucket : l'AMO y est déjà autorisé (policy
-- storage_ppt_amo_all) ; le déposant peut déplacer ses propres dépôts, à
-- l'intérieur de son enseigne et vers un dossier de copropriété de celle-ci.
drop policy if exists storage_ppt_membre_update on storage.objects;
create policy storage_ppt_membre_update on storage.objects for update to authenticated
  using (
    bucket_id = 'ppt-files'
    and owner = auth.uid()
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and ppt_is_membre_org(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'ppt-files'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and ppt_is_membre_org(((storage.foldername(name))[1])::uuid)
    and ppt_org_de(((storage.foldername(name))[2])::uuid) = ((storage.foldername(name))[1])::uuid
  );
