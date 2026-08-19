-- 0036 — L'AMO peut aussi déposer/supprimer dans presta-docs (aperçu AMO de
-- l'espace prestataire : dépôt du logo dans le dossier du compte rattaché).
drop policy storage_presta_docs_amo on storage.objects;
create policy storage_presta_docs_amo on storage.objects
  for all to authenticated
  using (bucket_id = 'presta-docs' and is_amo())
  with check (bucket_id = 'presta-docs' and is_amo());
