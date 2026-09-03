-- 0058 - Dépôt de fichiers par le syndic dans l'onglet Fichiers (feedback Amir
-- 03/09/2026 : « exactement le même dispositif de glisser-déposer que pour l'AMO »).
--
-- Le syndic dépose dans les 7 dossiers du projet des copros de son portefeuille
-- (table fichiers + bucket copro-files, chemin <copro_id>/<dossier>/…) et ne peut
-- retirer que ses propres dépôts. L'AMO garde tous les droits (policies *_amo_all
-- de 0002). La lecture syndic existe déjà (0027). L'origine « Projet syndic » des
-- pièces se déduit du rôle du déposant dans la RPC documents_dossier (0028).

drop policy if exists fichiers_syndic_insert on fichiers;
create policy fichiers_syndic_insert on fichiers
  for insert to authenticated
  with check (is_syndic_of(copro_id) and uploaded_by = auth.uid());

drop policy if exists fichiers_syndic_delete_own on fichiers;
create policy fichiers_syndic_delete_own on fichiers
  for delete to authenticated
  using (is_syndic_of(copro_id) and uploaded_by = auth.uid());

-- Storage : dépôt sous le préfixe <copro_id>/ des copros gérées
drop policy if exists storage_files_syndic_insert on storage.objects;
create policy storage_files_syndic_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'copro-files'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and is_syndic_of(((storage.foldername(name))[1])::uuid)
  );

-- Suppression : uniquement ses propres objets (owner_id = déposant)
drop policy if exists storage_files_syndic_delete_own on storage.objects;
create policy storage_files_syndic_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'copro-files'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and is_syndic_of(((storage.foldername(name))[1])::uuid)
  );
