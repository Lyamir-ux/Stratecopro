-- 0091 - Demande d'AMO : pièces jointes
--
-- Feedback Amir 22/09/2026 (14:26) sur /syndic/demande-amo : « Mettre également
-- la possibilité de déposer un des documents ». Le gestionnaire joint ce qu'il a
-- déjà sous la main (DPE collectif, audit, PPT, carnet d'entretien, PV d'AG…) :
-- l'équipe AMO qualifie la demande sans relancer pour les pièces de base.
--
-- Les fichiers sont décrits dans une colonne jsonb de la demande - il n'y a pas
-- encore de dossier auquel les rattacher, la table fichiers n'a donc rien à
-- voir ici. Chaque entrée : { path, name, size, mime, uploaded_at }.

alter table demandes_amo
  add column if not exists fichiers jsonb not null default '[]'::jsonb;

comment on column demandes_amo.fichiers is
  'Pièces jointes à la demande : [{ path, name, size, mime, uploaded_at }] dans le bucket demandes-amo.';

-- Bucket privé, un dossier par utilisateur puis un par demande :
-- <user_id>/<demande_id>/<horodatage>-<nom de fichier>
insert into storage.buckets (id, name, public)
values ('demandes-amo', 'demandes-amo', false)
on conflict (id) do nothing;

-- Le déposant gère ses propres dépôts (il peut retirer une pièce avant envoi).
drop policy if exists storage_demandes_amo_own on storage.objects;
create policy storage_demandes_amo_own on storage.objects
  for all to authenticated
  using (bucket_id = 'demandes-amo' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'demandes-amo' and (storage.foldername(name))[1] = auth.uid()::text);

-- L'équipe AMO lit les pièces de toutes les demandes.
drop policy if exists storage_demandes_amo_amo on storage.objects;
create policy storage_demandes_amo_amo on storage.objects
  for select to authenticated
  using (bucket_id = 'demandes-amo' and is_amo());
