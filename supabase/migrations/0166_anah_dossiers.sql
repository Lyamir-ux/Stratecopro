-- 0166 - Données du site ANAH (« Mon projet ANAH ») rattachées aux copropriétés.
-- BROUILLON du 17/10/2026 : NON APPLIQUÉE. À relire avec Amir avant toute écriture en prod.
--
-- Source : export du 17/10/2026 des 134 dossiers du compte « OPER 67 STRAT ECO »
-- (rapprochés de la base le jour même : 114 dossiers liés à 110 copropriétés).
--
-- Principe : les chiffres de l'ANAH vivent à part, dans une table dédiée, et n'écrasent
-- jamais les plans de financement validés ni les champs saisis par les chefs de projet.
-- Une copropriété peut avoir plusieurs dossiers ANAH (doublons confirmés par Amir).
--
-- Règle d'Amir : pour une copropriété à plusieurs bâtiments dont l'ANAH ne chiffre qu'un
-- bâtiment (Nouvelle Cité Dialogue, Meinau, Eco, Robert Schumann à Schiltigheim, Groupe
-- Ziegelfeld), AUCUN chiffre du projet (travaux, devis, aides, lots, énergie) n'est stocké :
-- `perimetre_partiel` = true, et la contrainte ci-dessous l'impose en base.

create table anah_dossiers (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  -- n° de dossier sur le site de l'ANAH (ex. 210909C67F03)
  reference text not null unique,
  -- faux pour le dossier doublon d'une copropriété qui a un autre dossier plus avancé
  est_reference boolean not null default true,
  numero_opal text,
  numero_immatriculation text,

  -- suivi du dossier
  statuts text[] not null default '{}',
  etat text,
  type_demande text,
  avancement_travaux text,
  date_depot date,
  date_premiere_visite date,
  date_dernier_paiement date,
  cree_sur_anah_le timestamptz,
  modifie_sur_anah_le timestamptz,
  instructeur text,
  agent_operateur text,

  -- périmètre : vrai = l'ANAH ne chiffre qu'une partie de la copropriété
  perimetre_partiel boolean not null default false,

  -- chiffres du projet (null si perimetre_partiel)
  nb_batiments integer,
  nb_lots integer,
  nb_lots_habitation integer,
  nb_logements_occupants integer,
  nb_logements_locatifs integer,
  annee_achevement integer,
  surface_m2 numeric,
  taux_impayes text,
  etiquette_avant char(1),
  etiquette_apres char(1),
  consommation_avant_kwh numeric,
  consommation_apres_kwh numeric,
  gain_pct numeric,
  type_chauffage text,
  energie_chauffage text,
  auditeur text,
  numero_audit text,

  -- plan de financement prévisionnel déclaré à l'ANAH (null si perimetre_partiel)
  subvention_accordee numeric,
  cout_travaux_ht numeric,
  cout_travaux_ttc numeric,
  honoraires_ht numeric,
  cout_total_ttc numeric,
  total_aides_publiques numeric,
  total_aides_privees numeric,
  reste_a_charge numeric,
  aides jsonb,

  -- fiche « Mon projet » expurgée : sans le bloc « Mes informations » (représentant du
  -- syndic), et sans les blocs chiffrés si perimetre_partiel
  donnees jsonb,
  importe_le timestamptz not null default now(),

  constraint anah_dossiers_etiquettes_chk check (
    (etiquette_avant is null or etiquette_avant between 'A' and 'G')
    and (etiquette_apres is null or etiquette_apres between 'A' and 'G')
  ),
  -- périmètre partiel : aucun chiffre du projet ni du financement
  constraint anah_dossiers_perimetre_partiel_chk check (
    not perimetre_partiel or (
      nb_batiments is null and nb_lots is null and nb_lots_habitation is null
      and nb_logements_occupants is null and nb_logements_locatifs is null
      and annee_achevement is null and surface_m2 is null and taux_impayes is null
      and etiquette_avant is null and etiquette_apres is null
      and consommation_avant_kwh is null and consommation_apres_kwh is null and gain_pct is null
      and subvention_accordee is null and cout_travaux_ht is null and cout_travaux_ttc is null
      and honoraires_ht is null and cout_total_ttc is null
      and total_aides_publiques is null and total_aides_privees is null
      and reste_a_charge is null and aides is null
    )
  )
);
create index anah_dossiers_copro_idx on anah_dossiers (copro_id);

-- devis de la liste « Liste des devis » du dossier (aucun pour un périmètre partiel)
create table anah_devis (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references anah_dossiers (id) on delete cascade,
  numero integer,
  siret text,
  raison_sociale text not null,
  type_travaux text,
  batiment text,
  montant_ht numeric,
  montant_ttc numeric,
  -- fiche de la Base prestataires (créée ou existante), retrouvée par le SIRET
  prestataire_id uuid references prestataires (id) on delete set null
);
create index anah_devis_dossier_idx on anah_devis (dossier_id);
create index anah_devis_prestataire_idx on anah_devis (prestataire_id);
create index anah_devis_siret_idx on anah_devis (siret);

-- équipe AMO seulement (comme les autres données financières) ; ( SELECT is_amo() ) :
-- évalué une fois par requête (voir 0127)
alter table anah_dossiers enable row level security;
alter table anah_devis enable row level security;
create policy anah_dossiers_amo_all on anah_dossiers
  for all to authenticated using ((select is_amo())) with check ((select is_amo()));
create policy anah_devis_amo_all on anah_devis
  for all to authenticated using ((select is_amo())) with check ((select is_amo()));
