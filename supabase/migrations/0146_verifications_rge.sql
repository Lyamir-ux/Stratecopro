-- 0146 - Vérification RGE des entreprises (demande d'Amir du 07/10/2026) :
-- « lorsqu'un chef de projet met un devis d'entreprise ou une DPGF de travaux,
-- vérifier si cette entreprise est RGE et pour quel domaine d'activité ».
--
-- La vérification interroge la liste officielle des entreprises RGE de l'ADEME
-- (data.gouv.fr, API publique sans clé) depuis le navigateur. Cette table garde
-- la trace de chaque vérification faite sur un document du dossier : la liste
-- de l'ADEME ne montre que l'état du jour, alors que l'éco-PTZ et les CEE
-- demandent une entreprise RGE à la date du devis. On conserve donc ce qui a
-- été lu (qualifications, dates, liens des certificats) et quand.
--
-- Une ligne par vérification (historique) ; l'écran affiche la plus récente.
-- AMO seul : c'est un outil des chefs de projet.

create table if not exists verifications_rge (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  -- devis ou DPGF vérifié ; null si le document a été supprimé depuis
  fichier_id uuid references fichiers (id) on delete set null,
  siret text not null check (siret ~ '^[0-9]{14}$'),
  entreprise text,
  -- lot ou prestation du document (objet saisi au dépôt) et sa date
  objet text,
  date_document date,
  -- au moins une qualification RGE en cours de validité le jour de la vérification
  rge boolean not null,
  domaines_valides text[] not null default '{}',
  -- domaines attendus d'après l'objet et non couverts (alerte)
  domaines_manquants text[] not null default '{}',
  -- certificats et qualifications lus dans la liste de l'ADEME (instantané)
  certificats jsonb not null default '[]'::jsonb,
  verifie_le timestamptz not null default now(),
  verifie_par uuid default auth.uid()
);

comment on table verifications_rge is
  'Vérifications RGE des entreprises sur les devis et DPGF d''un dossier (0146) : instantané de la liste ADEME au jour de la vérification. AMO seul.';

create index if not exists verifications_rge_copro_idx on verifications_rge (copro_id, verifie_le desc);
create index if not exists verifications_rge_fichier_idx on verifications_rge (fichier_id);

alter table verifications_rge enable row level security;

drop policy if exists verifications_rge_amo_all on verifications_rge;
create policy verifications_rge_amo_all on verifications_rge
  for all to authenticated
  using (( select is_amo() ))
  with check (( select is_amo() ));
