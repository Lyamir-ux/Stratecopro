-- 0111 - Suivi de la facturation des honoraires AMO par jalon
--
-- Demande d'Amir 28/09/2026 : vue côté AMO du tableau de suivi de facturation
-- (extraction Notion « AMO COPRO »), limitée aux copropriétés présentes dans
-- le logiciel. Visuels retenus : synthèse, frise des jalons, paiements à
-- relancer, bloc « Honoraires » de la fiche (tous les AMO) et répartition par
-- chef de projet (dirigeant seul, contrôle côté écran : les mêmes lignes sont
-- déjà visibles de tout AMO dans la frise).
--
-- Huit jalons par dossier, comme le classeur : P1a, P1b, P1c (phase études),
-- P2a, P2b, P2c (phase travaux), FCEE1, FCEE2 (honoraires sur la prime CEE).
-- Pour l'instant les lignes sont chargées en SQL depuis l'extraction Notion :
-- aucune écriture depuis l'application. La facturation directe viendra ensuite
-- (factures datées, numérotées), d'où date_facture / date_paiement dès maintenant.

create table if not exists honoraires_jalons (
  copro_id uuid not null references coproprietes(id) on delete cascade,
  jalon text not null check (jalon in ('P1a', 'P1b', 'P1c', 'P2a', 'P2b', 'P2c', 'FCEE1', 'FCEE2')),
  -- null = pas de montant prévu au contrat pour ce jalon
  montant_ht numeric(12, 2) check (montant_ht is null or montant_ht >= 0),
  etat text not null default 'a_facturer' check (etat in ('a_facturer', 'facture', 'encaisse')),
  date_facture date,
  date_paiement date,
  updated_at timestamptz not null default now(),
  primary key (copro_id, jalon)
);

comment on table honoraires_jalons is
  'Honoraires AMO par jalon de facturation (0111) : montant HT du contrat et état a_facturer / facture (en attente de paiement) / encaisse.';
comment on column honoraires_jalons.montant_ht is 'Montant HT prévu au contrat ; null = pas de montant pour ce jalon.';
comment on column honoraires_jalons.date_facture is 'Date de la facture du jalon (inconnue pour les lignes issues de Notion, qui ne datent que la dernière facture du dossier).';

-- Informations de facturation au niveau du dossier
create table if not exists honoraires_dossiers (
  copro_id uuid primary key references coproprietes(id) on delete cascade,
  -- « Dernière date de facturation » du classeur Notion (la plus récente des 8 jalons)
  derniere_facture date,
  source text,
  importe_le timestamptz not null default now()
);

comment on table honoraires_dossiers is
  'Facturation des honoraires AMO au niveau du dossier (0111) : dernière date de facture et source des données.';

alter table honoraires_jalons enable row level security;
alter table honoraires_dossiers enable row level security;

-- Lecture réservée à l'équipe AMO : ni syndic, ni copropriétaire, ni prestataire
create policy honoraires_jalons_amo_lecture on honoraires_jalons
  for select to authenticated using (is_amo());
create policy honoraires_dossiers_amo_lecture on honoraires_dossiers
  for select to authenticated using (is_amo());

revoke all on honoraires_jalons, honoraires_dossiers from anon;
revoke insert, update, delete, truncate on honoraires_jalons, honoraires_dossiers from authenticated;
grant select on honoraires_jalons, honoraires_dossiers to authenticated;
