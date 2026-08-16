-- 0027 — Base documentaire du syndic + correction des policies Storage
--
-- 1) Le syndic co-gère le dossier avec l'AMO : sa base documentaire, ce n'est pas
--    seulement ce qui est publié aux copropriétaires. `partage_copro` reste le
--    drapeau du PORTAIL COPROPRIÉTAIRE (des particuliers) ; il n'a jamais eu
--    vocation à filtrer ce que voit le gestionnaire.
--
-- 2) Capture de colonne dans trois policies Storage (0005 et 0009). Elles étaient
--    écrites `where f.storage_path = name` : dans la sous-requête, `name` s'est
--    résolu sur la colonne `fichiers.name` et non sur `storage.objects.name`. La
--    condition revenait donc à `f.storage_path = f.name` — jamais vraie. Effet
--    réel : NI le syndic NI le copropriétaire ne pouvaient télécharger un fichier
--    partagé, ni afficher la photo du dossier. On qualifie explicitement la
--    colonne de l'objet Storage (`objects.name`).

-- ========== Périmètre documentaire du syndic ==========
drop policy if exists fichiers_syndic_read on fichiers;
create policy fichiers_syndic_read on fichiers
  for select to authenticated using (is_syndic_of(copro_id));

-- ========== Storage : fichiers projet ==========
drop policy if exists storage_files_syndic_read on storage.objects;
create policy storage_files_syndic_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'copro-files'
    and exists (
      select 1 from public.fichiers f
      where f.storage_path = objects.name and is_syndic_of(f.copro_id)
    )
  );

drop policy if exists storage_files_copro_read on storage.objects;
create policy storage_files_copro_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'copro-files'
    and exists (
      select 1 from public.fichiers f
      where f.storage_path = objects.name and f.partage_copro and is_copro_of(f.copro_id)
    )
  );

-- ========== Storage : photo du dossier ==========
drop policy if exists storage_photos_syndic_read on storage.objects;
create policy storage_photos_syndic_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'copro-photos'
    and exists (
      select 1 from public.coproprietes c
      where c.photo_path = objects.name and is_syndic_of(c.id)
    )
  );
