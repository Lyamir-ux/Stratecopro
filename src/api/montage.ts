// Montage bancaire - préparation des dossiers de financement et d'assurance
// par le syndic. Catalogues déclaratifs des documents attendus par chaque
// organisme (CEGEE pour l'éco-PTZ collectif, ROEDERER pour la dommages-
// ouvrage) + hooks de dépôt/suivi. Les fichiers vivent dans le bucket
// copro-files sous montage/<copro_id>/<montage>/<doc_key>/…
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { nomFichierSansAccents } from "@/lib/nommage";
import type { Json, Tables } from "@/lib/database.types";
import type { IconName } from "@/components/Icon";
import { propagerDocument, retirerFichierDesMontages } from "@/api/propagation";

export type MontageId = "ecoptz" | "anah" | "cee" | "climaxion" | "do";
export type MontageDoc = Tables<"montage_docs">;
export type MontageFormulaire = Tables<"montage_formulaires">;
/** Formulaires in-app du montage : fiche avant AG et demande de prêt (CEGEE),
 *  récapitulatif des coordonnées pour la demande de cotation CEE (13/09/2026),
 *  fiche « État de la copropriété » du dossier ANAH (23/09/2026). */
export type FormulaireType = "fiche_avant_ag" | "demande_pret" | "coordonnees_cee" | "fiche_etat_anah";

/** Un fichier déposé sur un document du montage (montage_docs.files). */
export interface MontageFile {
  name: string;
  /** Nom d'origine avant renommage assisté (traçabilité). */
  name_original?: string | null;
  path: string;
  size: number | null;
  mime: string | null;
  uploaded_at: string;
  /** Auteur du dépôt - sert à afficher son origine (absent avant août 2026). */
  uploaded_by?: string | null;
}

export function docFiles(doc: MontageDoc | undefined): MontageFile[] {
  return Array.isArray(doc?.files) ? (doc!.files as unknown as MontageFile[]) : [];
}

// ========== Les montages financiers du dossier ==========

export const MONTAGES: {
  id: MontageId;
  label: string;
  sub: string;
  icon: IconName;
  dispo: boolean;
}[] = [
  {
    id: "ecoptz",
    label: "Éco-PTZ collectif",
    sub: "CEGEE - Caisse d'Épargne Grand Est Europe",
    icon: "users",
    dispo: true,
  },
  { id: "anah", label: "ANAH - MaPrimeRénov' Copro", sub: "Subvention collective de l'Anah", icon: "fileCheck", dispo: true },
  { id: "cee", label: "CEE", sub: "Certificats d'économies d'énergie - cotation, aides, solde", icon: "zap", dispo: true },
  {
    id: "climaxion",
    label: "EMS & Climaxion",
    sub: "Eurométropole de Strasbourg et Région Grand Est - dossier commun",
    icon: "leaf",
    dispo: true,
  },
  { id: "do", label: "Dommages-ouvrage", sub: "ROEDERER - assurances de chantier", icon: "hammer", dispo: true },
];

// ========== Catalogue documentaire de l'éco-PTZ collectif (CEGEE) ==========

/** Qui produit le document : le syndic le dépose, l'AMO le fournit,
 *  la MOE l'a déjà versé au dossier projet, ou l'un ou l'autre (amo_moe). */
export type Fournisseur = "syndic" | "amo" | "moe" | "amo_moe";

export interface DocDef {
  key: string;
  name: string;
  hint?: string;
  fournisseur: Fournisseur;
  /** Pièce réservée à l'équipe AMO : ligne invisible et fichiers non
   *  téléchargeables par le syndic (RLS + préfixe Storage montage-prive/, 0066).
   *  Côté syndic, seule une mention « gérée par Strat Eco » s'affiche. */
  confidentiel?: boolean;
  /** Modèle à télécharger (fichier de public/modeles). */
  modele?: string;
  /** Lien externe utile (ex. avis SIRENE). */
  lien?: { label: string; url: string };
  /** À fournir uniquement si le signataire n'est pas le dirigeant. */
  conditionnel?: boolean;
  /** Type de document (id TYPES_DOCUMENT) présélectionné dans le dialogue de dépôt. */
  type?: string;
}

export interface GroupeDef {
  titre?: string;
  note?: string;
  docs: DocDef[];
}

export interface EtapeDef {
  id: string;
  num: number;
  label: string;
  intro: string;
  /** Formulaires in-app rattachés à l'étape. */
  formulaires?: { type: FormulaireType; name: string; hint: string }[];
  groupes: GroupeDef[];
}

export const ECOPTZ_ETAPES: EtapeDef[] = [
  {
    id: "resolutions",
    num: 1,
    label: "Résolutions de prêt et projet de contrat",
    intro:
      "Avant la convocation de l'assemblée générale : la banque prépare les résolutions d'emprunt et le projet de contrat à partir de la fiche de renseignements et de l'attestation d'impayés du moment.",
    formulaires: [
      {
        type: "fiche_avant_ag",
        name: "Fiche de renseignements avant AG",
        hint: "Pré-remplie avec les données du projet - complétez les champs manquants",
      },
    ],
    groupes: [
      {
        docs: [
          {
            key: "attestation_impayes",
            name: "Attestation du taux d'impayés",
            hint: "À la date de cette étape - en-tête du cabinet, cachet + signature. Tantièmes des copropriétaires en retard de plus de 2 trimestres de charges courantes / tantièmes généraux × 100 - limite : 15 %.",
            fournisseur: "syndic",
            modele: "attestation-taux-impayes-cegee.docx",
            type: "attestation_impayes",
          },
        ],
      },
    ],
  },
  {
    id: "compte_travaux",
    num: 2,
    label: "Ouverture du compte travaux",
    intro:
      "La CEGEE ouvre un compte travaux au nom du syndicat des copropriétaires. Déposez l'ensemble des pièces ci-dessous.",
    groupes: [
      {
        docs: [
          {
            key: "reglement_copropriete",
            name: "Règlement de copropriété",
            hint: "Dans son intégralité",
            fournisseur: "syndic",
            type: "reglement_copropriete",
          },
          {
            key: "fiche_synthetique",
            name: "Fiche synthétique de la copropriété",
            hint: "Extraite du Registre national des copropriétés, avec le numéro d'immatriculation",
            fournisseur: "syndic",
            type: "fiche_synthetique",
          },
          {
            key: "attestation_registre",
            name: "Attestation de mise à jour annuelle du Registre national",
            fournisseur: "syndic",
            type: "attestation_registre",
          },
          {
            key: "avis_sirene",
            name: "Avis de situation SIRENE",
            hint: "Daté de moins de 3 mois - téléchargeable gratuitement sur le site de l'Insee",
            fournisseur: "syndic",
            lien: { label: "avis-situation-sirene.insee.fr", url: "https://avis-situation-sirene.insee.fr/" },
            type: "avis_sirene",
          },
          {
            // Clé distincte de l'étape 1 : le taux évolue, la banque veut une
            // attestation à jour à chaque étape (feedback Amir 10/09/2026).
            key: "attestation_impayes_compte",
            name: "Attestation du taux d'impayés",
            hint: "Nouvelle attestation à la date de l'ouverture du compte - plusieurs mois peuvent séparer deux étapes, celle de l'étape 1 n'est plus valable",
            fournisseur: "syndic",
            modele: "attestation-taux-impayes-cegee.docx",
            type: "attestation_impayes",
          },
          {
            key: "rib_copro",
            name: "RIB du compte de la copropriété",
            fournisseur: "syndic",
            type: "rib",
          },
          {
            key: "pv_ag_mandat",
            name: "PV d'AG - mandat du syndic",
            hint: "Signé(s), cacheté(s) et certifié(s) conforme(s) : désignation et renouvellement du mandat pour la période en cours",
            fournisseur: "syndic",
            type: "pv_ag_mandat",
          },
          {
            key: "pv_ag_travaux",
            name: "PV d'AG - vote des travaux et de la résolution d'emprunt",
            hint: "Signé(s), cacheté(s) et certifié(s) conforme(s)",
            fournisseur: "syndic",
            type: "pv_ag_travaux",
          },
          {
            key: "annexes_comptables",
            name: "« Annexes 1 à 5 » du dernier exercice",
            fournisseur: "syndic",
            type: "annexes_comptables",
          },
          {
            key: "assurance_mri",
            name: "Attestation d'assurance multirisque habitation de l'immeuble",
            hint: "Période en cours (pas l'appel de cotisation), précisant le nom ou l'adresse de la copropriété",
            fournisseur: "syndic",
            type: "attestation_assurance",
          },
          {
            key: "contrat_syndic",
            name: "Contrat de syndic signé avec la copropriété",
            hint: "Période en cours",
            fournisseur: "syndic",
            type: "contrat_syndic",
          },
        ],
      },
      {
        titre: "Si la personne habilitée à signer n'est pas le dirigeant",
        note: "Ses coordonnées (mobile et courriel) sont à renseigner dans le formulaire de demande de prêt (étape 3). Marquez « Non concerné » si le dirigeant signe lui-même.",
        docs: [
          {
            key: "delegation_pouvoir",
            name: "Délégation de pouvoirs",
            hint: "Sur papier à en-tête du syndic - signée par le délégant et le délégataire",
            fournisseur: "syndic",
            modele: "delegation-pouvoirs-cegee.docx",
            conditionnel: true,
            type: "delegation_pouvoirs",
          },
          {
            key: "cni_signataire",
            name: "Pièce d'identité du signataire",
            hint: "Recto-verso, en cours de validité",
            fournisseur: "syndic",
            conditionnel: true,
            type: "piece_identite",
          },
          {
            key: "formulaire_ppe",
            name: "Formulaire de personne politiquement exposée (PPE)",
            hint: "Daté et signé par la personne habilitée + mention « Lu et approuvé »",
            fournisseur: "syndic",
            modele: "formulaire-ppe-cegee.docx",
            conditionnel: true,
            type: "formulaire_ppe",
          },
        ],
      },
    ],
  },
  {
    id: "offre_pret",
    num: 3,
    label: "Dépôt du dossier de demande d'offre de prêt",
    intro:
      "Le dossier complet est adressé à la CEGEE (agence.copro@cegee.caisse-epargne.fr). Le classeur Excel « COPRO CEGEE Demande de prêt » est produit par Strat Eco à partir de votre formulaire, puis imprimé, tamponné et signé par vos soins.",
    formulaires: [
      {
        type: "demande_pret",
        name: "Demande de prêt CEGEE - onglet 1",
        hint: "Renseignez les informations du syndic pour que Strat Eco produise le classeur Excel",
      },
    ],
    groupes: [
      {
        titre: "Dossier éco-PTZ",
        docs: [
          {
            key: "excel_demande_pret",
            name: "Classeur « COPRO CEGEE Demande de prêt » signé",
            hint: "Les 3 onglets (demande de prêt, liste des copropriétaires adhérents, plan de financement) complétés par Strat Eco, puis tamponnés et signés par le syndic",
            fournisseur: "amo",
            modele: "copro-cegee-demande-de-pret.xlsx",
            type: "demande_pret",
          },
          {
            key: "audit_energetique",
            name: "Audit énergétique",
            hint: "Si éco-PTZ « amélioration de la performance globale » - fourni par la maîtrise d'œuvre",
            fournisseur: "moe",
            type: "audit_energetique",
          },
          {
            key: "devis_travaux",
            name: "Devis des travaux ou ordres de service",
            hint: "Datés de moins d'un an, correspondant aux montants votés en AG - fournis par la maîtrise d'œuvre",
            fournisseur: "moe",
            type: "devis_travaux",
          },
          {
            key: "rib_entreprises",
            name: "RIB des entreprises intervenantes",
            hint: "Format IBAN-BIC - fournis par la maîtrise d'œuvre",
            fournisseur: "moe",
            type: "rib_entreprises",
          },
          {
            key: "cerfa_emprunteur",
            name: "Formulaire réglementaire éco-PTZ « Emprunteur »",
            hint: "Fourni par Strat Eco - complété, tamponné et signé par le syndic",
            fournisseur: "amo",
            type: "cerfa_ecoptz_emprunteur",
          },
          {
            key: "cerfa_entreprises",
            name: "Formulaires réglementaires éco-PTZ « Entreprises »",
            hint: "Fournis par Strat Eco, signés par les entreprises RGE. Les cases « coût total éligible revenant aux seuls copropriétaires participant au prêt » restent vides jusqu'à la fin de l'instruction.",
            fournisseur: "amo",
            type: "cerfa_ecoptz_entreprise",
          },
          {
            key: "attestation_impayes_offre",
            name: "Attestation du taux d'impayés",
            hint: "Nouvelle attestation à la date du dépôt de la demande d'offre de prêt",
            fournisseur: "syndic",
            modele: "attestation-taux-impayes-cegee.docx",
            type: "attestation_impayes",
          },
          {
            key: "preuve_convocation_ag",
            name: "Preuve de la convocation à l'AG",
            hint: "Accusés de réception",
            fournisseur: "syndic",
            type: "convocation_ag",
          },
          {
            key: "annexe_2bis_cegc",
            name: "Annexe 2 bis - attestation pour la demande de cautionnement CEGC",
            hint: "Signée et tamponnée par le syndic",
            fournisseur: "syndic",
            modele: "attestation-caution-cegc-annexe-2bis.docx",
            type: "attestation_caution",
          },
          {
            key: "attestation_non_recours",
            name: "Attestation de non-recours",
            hint: "Complétée, signée et tamponnée par le syndic",
            fournisseur: "syndic",
            type: "attestation_non_recours",
          },
        ],
      },
      {
        titre: "Prêt « avance de subventions »",
        docs: [
          {
            key: "fiche_etat_anah",
            name: "Fiche « État » adressée à l'ANAH",
            hint: "Mentionne le taux d'impayés rapporté au budget de l'année n-1 - fournie par Strat Eco",
            fournisseur: "amo",
            type: "fiche_etat_anah",
          },
          {
            key: "notifications_subventions",
            name: "Notifications d'octroi des subventions au syndicat",
            hint: "Délivrées par les organismes concernés (reçues par courrier)",
            fournisseur: "syndic",
            type: "accord_subvention",
          },
          {
            key: "mail_beneficiaire_compte",
            name: "Confirmation d'enregistrement du compte travaux en bénéficiaire",
            hint: "Mail des organismes subventionneurs - fourni par Strat Eco",
            fournisseur: "amo",
            type: "courrier",
          },
        ],
      },
    ],
  },
];

// ========== Catalogue documentaire de la dommages-ouvrage (ROEDERER) ==========
// Source : « Questionnaire de présentation Assurances de chantier » + liste
// récapitulative des documents à transmettre (ROEDERER, Département Assurances
// Construction - construction@roederer.fr). Les rôles reprennent les
// annotations du dossier : MOE, AMO (Strat Eco) ou syndic.

export const DO_ETAPES: EtapeDef[] = [
  {
    id: "tarification",
    num: 1,
    label: "Demande de tarification",
    intro:
      "Éléments indispensables pour que ROEDERER tarife l'assurance du chantier. Réponse sous 24 h si le dossier est complet et sans problème technique spécifique (10 jours au maximum). Conditions : travaux de technique courante, maîtrise d'œuvre indépendante en mission complète, contrôleur technique avec avis favorables, intervenants tous assurés en RC décennale à l'ouverture du chantier.",
    groupes: [
      {
        docs: [
          {
            key: "questionnaire_chantier",
            name: "Questionnaire « Assurances de chantier » complété",
            hint: "Proposant, opération, maîtrise d'œuvre, étude de sol, contrôle technique, caractéristiques et intervenants - complété par la maîtrise d'œuvre",
            fournisseur: "moe",
            modele: "questionnaire-chantier-roederer.docx",
            type: "questionnaire_assurance",
          },
          {
            key: "cout_previsionnel",
            name: "Détail du coût total prévisionnel des travaux (plan de financement)",
            hint: "Y compris honoraires techniques - le descriptif sommaire des travaux y figure. Fourni par Strat Eco.",
            fournisseur: "amo",
            type: "pf_definitif",
          },
          {
            key: "permis_construire",
            name: "Permis de construire ou déclaration préalable de travaux",
            fournisseur: "moe",
            type: "autorisation_urbanisme",
          },
          {
            key: "doc_chantier",
            name: "Déclaration d'ouverture de chantier ou date prévisionnelle",
            fournisseur: "moe",
            type: "declaration_chantier",
          },
          {
            key: "rapport_ct_initial",
            name: "Rapport initial du contrôleur technique",
            hint: "Sans avis défavorable - mission minimum L ou LP (+ LE en cas de travaux sur existants)",
            fournisseur: "moe",
            type: "rapport_ct",
          },
          {
            key: "convention_moe",
            name: "Convention de maîtrise d'œuvre",
            hint: "Mission complète : conception, direction et suivi des travaux - fournie par Strat Eco",
            fournisseur: "amo",
            type: "contrat_moe",
          },
          {
            key: "jeu_plans",
            name: "Jeu de plans (masse, coupes, élévations…)",
            fournisseur: "moe",
            type: "plan",
          },
          {
            key: "etude_sol",
            name: "Rapport d'étude de sol",
            hint: "Le cas échéant - G2PRO minimum en cas de travaux neufs ou d'extension",
            fournisseur: "moe",
            conditionnel: true,
            type: "etude_sol",
          },
        ],
      },
    ],
  },
  {
    id: "contrat",
    num: 2,
    label: "Accord sur l'offre et établissement du contrat",
    intro:
      "En cas d'accord sur les conditions proposées, retournez l'offre signée pour obtenir rapidement une attestation d'assurance valable, puis complétez le dossier avec les pièces du contrat.",
    groupes: [
      {
        titre: "Retour d'accord",
        docs: [
          {
            key: "offre_bon_accord",
            name: "Offre signée « Bon pour accord » + document d'information et conseils",
            hint: "Copie des offres signées, retournée à ROEDERER avec le document d'information et conseils",
            fournisseur: "syndic",
            type: "offre_assurance",
          },
          {
            key: "intervenants_designes",
            name: "Liste des intervenants désignés et attestations RC décennale",
            hint: "Au minimum : maîtrise d'œuvre et entreprises de clos/couvert - attestations valables à la date d'ouverture du chantier",
            fournisseur: "moe",
            type: "attestation_decennale",
          },
        ],
      },
      {
        titre: "Pièces du contrat",
        docs: [
          {
            key: "convention_ct",
            name: "Convention de contrôle technique",
            hint: "Déjà versée au dossier projet - suivie par Strat Eco",
            fournisseur: "amo",
            type: "convention_ct",
          },
          {
            key: "honoraires_bet",
            name: "Conventions ou notes d'honoraires des BET de l'opération",
            hint: "Déjà versées au dossier projet - suivies par Strat Eco",
            fournisseur: "amo",
            type: "devis_honoraires_moe",
          },
          {
            key: "liste_intervenants_lots",
            name: "Liste de l'ensemble des intervenants prévus, ventilée par lot",
            hint: "CCTP, DPGF ou devis - vaut aussi devis descriptifs des travaux et cahiers des clauses techniques particulières",
            fournisseur: "moe",
            type: "cctp_dce",
          },
          {
            key: "attestations_rcd",
            name: "Attestations RC décennale de l'ensemble des intervenants",
            hint: "Valables expressément à la date d'ouverture du chantier et mentionnant les activités garanties",
            fournisseur: "moe",
            type: "attestation_decennale",
          },
          {
            key: "marches_travaux",
            name: "Marchés de travaux signés avec les entreprises",
            hint: "Le cas échéant - à déposer par le syndic",
            fournisseur: "syndic",
            conditionnel: true,
            type: "marche_travaux",
          },
        ],
      },
      {
        titre: "Lutte contre le blanchiment (LCB-FT)",
        note: "Le souscripteur étant une personne morale, la réglementation impose de fournir impérativement :",
        docs: [
          {
            key: "kbis",
            name: "Extrait Kbis du Registre du commerce",
            hint: "Daté de moins de 3 mois",
            fournisseur: "syndic",
            type: "kbis",
          },
          {
            key: "beneficiaires_effectifs",
            name: "Liste des bénéficiaires effectifs et leur pièce d'identité",
            hint: "Carte nationale d'identité en cours de validité de chaque bénéficiaire effectif",
            fournisseur: "syndic",
            type: "beneficiaires_effectifs",
          },
        ],
      },
    ],
  },
  {
    id: "regularisation",
    num: 3,
    label: "Régularisation définitive du contrat",
    intro:
      "À transmettre dans les 6 mois suivant la réception des travaux pour la régularisation définitive du contrat.",
    groupes: [
      {
        docs: [
          {
            key: "cout_definitif",
            name: "Coût total définitif des travaux, y compris honoraires des BET",
            hint: "Factures de travaux transmises par la maîtrise d'œuvre, cachetées par le syndic",
            fournisseur: "syndic",
            type: "facture",
          },
          {
            key: "pv_reception",
            name: "PV de réception des travaux TCE et levée des réserves éventuelles",
            hint: "Transmis et signés par le syndic et les entreprises",
            fournisseur: "syndic",
            type: "pv_reception",
          },
          {
            key: "rapport_ct_final",
            name: "Rapport final du contrôleur technique",
            hint: "Sans réserve",
            fournisseur: "moe",
            type: "rapport_ct",
          },
          {
            key: "rcd_non_declares",
            name: "Liste et attestations RC décennale des intervenants non déclarés",
            hint: "Uniquement si des intervenants n'étaient pas déclarés lors de la mise en place du contrat",
            fournisseur: "moe",
            conditionnel: true,
            type: "attestation_decennale",
          },
        ],
      },
    ],
  },
];

// ========== Catalogue documentaire ANAH - MaPrimeRénov' Copropriété ==========
// Source : checklist MaPrimeRénov' du dossier (CHECKLIST_TEMPLATES, 15 pièces
// obligatoires listées par les chefs de projet le 19/08/2026). Le déposant de
// chaque pièce a été fixé par Amir le 13/09/2026, pièce par pièce. Les avis
// d'imposition et la liste des primes individuelles sont confidentiels : ni
// visibles ni téléchargeables par le syndic.

export const ANAH_ETAPES: EtapeDef[] = [
  {
    id: "copropriete",
    num: 1,
    label: "Copropriété et gouvernance",
    intro:
      "Pièces qui attestent de la décision de l'assemblée générale, du mandat du syndic et de la situation administrative du syndicat des copropriétaires. Toutes relèvent du syndic. La fiche « État de la copropriété » se complète en ligne : elle est pré-remplie depuis le dossier, validée par Strat Eco puis signée électroniquement par le président du conseil syndical et par vous.",
    formulaires: [
      {
        type: "fiche_etat_anah",
        name: "Fiche « État de la copropriété » (ANAH)",
        hint: "Pré-remplie depuis le dossier et le rapport d'enquête sociale - complétez, puis signature électronique",
      },
    ],
    groupes: [
      {
        docs: [
          {
            key: "pv_ag_travaux",
            name: "PV d'AG ayant décidé de réaliser les travaux",
            hint: "Signé, cacheté et certifié conforme - résolutions de vote des travaux et de demande des subventions",
            fournisseur: "syndic",
            type: "pv_ag_travaux",
          },
          {
            key: "pv_ag_representant",
            name: "PV d'AG nommant le représentant légal",
            hint: "Désignation ou renouvellement du mandat du syndic pour la période en cours - signé, cacheté et certifié conforme",
            fournisseur: "syndic",
            type: "pv_ag_mandat",
          },
          {
            key: "attestation_registre",
            name: "Attestation de mise à jour du registre de copropriété",
            hint: "Registre national des copropriétés à jour pour l'exercice en cours",
            fournisseur: "syndic",
            lien: { label: "registre-coproprietes.gouv.fr", url: "https://www.registre-coproprietes.gouv.fr/" },
            type: "attestation_registre",
          },
          {
            key: "fiche_etat",
            name: "Fiche « État de la copropriété » signée",
            hint: "PDF déposé automatiquement une fois la fiche en ligne signée par le président du conseil syndical et le syndic",
            fournisseur: "syndic",
            type: "fiche_etat_anah",
          },
          {
            key: "rib_compte_travaux",
            name: "RIB du compte travaux",
            hint: "Compte ouvert au nom du syndicat des copropriétaires - c'est sur ce compte que l'Anah verse la subvention",
            fournisseur: "syndic",
            type: "rib_compte_travaux",
          },
        ],
      },
    ],
  },
  {
    id: "projet",
    num: 2,
    label: "Projet de travaux",
    intro:
      "Pièces techniques et contractuelles du projet. La plupart sont déjà au dossier projet, versées par Strat Eco ou la maîtrise d'œuvre : elles sont affichées ici pour suivi. Seule la convention AMO signée est à déposer par vos soins.",
    groupes: [
      {
        docs: [
          {
            key: "devis_dpgf",
            name: "Pièces marchés : devis détaillés / DPGF des travaux",
            hint: "Devis détaillés ou DPGF de chaque lot, établis par les entreprises RGE retenues",
            fournisseur: "amo_moe",
            type: "devis_travaux",
          },
          {
            key: "devis_honoraires_moe",
            name: "Devis détaillés des honoraires de MOE et des autres études",
            hint: "Maîtrise d'œuvre, bureaux d'études, contrôle technique, coordination SPS, diagnostics",
            fournisseur: "amo",
            type: "devis_honoraires_moe",
          },
          {
            key: "contrat_moe",
            name: "Contrat du maître d'œuvre",
            hint: "Convention de maîtrise d'œuvre signée - déjà versée au dossier projet",
            fournisseur: "amo",
            type: "contrat_moe",
          },
          {
            key: "convention_amo",
            name: "Convention AMO signée",
            hint: "Convention d'assistance à maîtrise d'ouvrage Strat Eco, signée par le syndic",
            fournisseur: "syndic",
            type: "contrat_amo",
          },
          {
            key: "audit_reglementaire",
            name: "Audit énergétique réglementaire",
            hint: "Audit énergétique réglementaire (loi ELAN) justifiant le gain énergétique du scénario de travaux retenu",
            fournisseur: "amo_moe",
            type: "audit_energetique",
          },
          {
            key: "urbanisme",
            name: "Déclarations d'urbanisme",
            hint: "Déclaration préalable ou permis de construire, avec récépissé de dépôt - « Non concerné » si les travaux n'y sont pas soumis",
            fournisseur: "moe",
            conditionnel: true,
            type: "autorisation_urbanisme",
          },
        ],
      },
    ],
  },
  {
    id: "social_financement",
    num: 3,
    label: "Volet social et plan de financement",
    intro:
      "Pièces établies par Strat Eco à partir de l'enquête sociale menée auprès des copropriétaires et du plan de financement définitif. Les justificatifs personnels des copropriétaires restent confidentiels : ils ne sont ni visibles ni téléchargeables depuis l'espace syndic.",
    groupes: [
      {
        docs: [
          {
            key: "rapport_enquete_sociale",
            name: "Rapport d'enquête sociale",
            hint: "Répartition des profils MaPrimeRénov' des ménages de la copropriété - produit par Strat Eco",
            fournisseur: "amo",
            type: "rapport_enquete_sociale",
          },
          {
            key: "avis_imposition",
            name: "Avis d'imposition des personnes éligibles aux aides individuelles",
            hint: "Justificatifs déposés par les copropriétaires depuis leur espace et centralisés par Strat Eco - pièce confidentielle",
            fournisseur: "amo",
            confidentiel: true,
            type: "avis_imposition",
          },
          {
            key: "liste_primes_individuelles",
            name: "Liste des primes individuelles",
            hint: "Primes MaPrimeRénov' individuelles par copropriétaire éligible, établie par Strat Eco - pièce confidentielle",
            fournisseur: "amo",
            confidentiel: true,
            type: "liste_primes_individuelles",
          },
          {
            key: "pf_definitif",
            name: "Plan de financement définitif de la copropriété (Excel)",
            hint: "Classeur exporté du plan de financement définitif validé - produit par Strat Eco",
            fournisseur: "amo",
            type: "pf_definitif",
          },
        ],
      },
    ],
  },
];

// ========== Catalogue documentaire EMS & Climaxion ==========
// Source : checklist commune Eurométropole de Strasbourg / Climaxion fournie
// par Amir le 13/09/2026 (25 pièces, même liste que la checklist AMO
// « EMS & Climaxion » de CHECKLIST_TEMPLATES). Déposants fixés pièce par pièce.
// Quatre pièces reposent sur un modèle à télécharger (attestation logement
// décent, mandat de délégation de dépôt, attestation et rapport de conformité
// des offres) : fichiers à venir dans public/modeles - renseigner `modele`
// dès qu'ils y sont. Le mandat de délégation sera à terme pré-rempli et signé
// électroniquement par le syndic (chantier séparé) : dépôt classique en
// attendant.

export const CLIMAXION_ETAPES: EtapeDef[] = [
  {
    id: "copropriete",
    num: 1,
    label: "Copropriété",
    intro:
      "Pièces d'identité du syndicat des copropriétaires, toutes à déposer par le syndic. L'attestation logement décent suit un modèle fourni par Strat Eco.",
    groupes: [
      {
        docs: [
          {
            key: "fiche_synthetique",
            name: "Fiche synthétique de la copropriété",
            hint: "Extraite du Registre national des copropriétés, avec le numéro d'immatriculation",
            fournisseur: "syndic",
            type: "fiche_synthetique",
          },
          {
            key: "attestation_registre",
            name: "Attestation de mise à jour du registre de copropriété",
            fournisseur: "syndic",
            lien: { label: "registre-coproprietes.gouv.fr", url: "https://www.registre-coproprietes.gouv.fr/" },
            type: "attestation_registre",
          },
          {
            key: "attestation_composition",
            name: "Attestation de composition de la copropriété",
            hint: "Nombre de lots et de logements, répartition des tantièmes - signée par le syndic",
            fournisseur: "syndic",
            type: "attestation_composition",
          },
          {
            key: "reglement_copropriete",
            name: "Règlement de copropriété",
            hint: "Dans son intégralité",
            fournisseur: "syndic",
            type: "reglement_copropriete",
          },
          {
            key: "attestation_logement_decent",
            name: "Attestation logement décent",
            hint: "Sur le modèle fourni par Strat Eco (à venir dans cette ligne) - complétée et signée par le syndic",
            fournisseur: "syndic",
            type: "attestation_logement_decent",
          },
        ],
      },
    ],
  },
  {
    id: "lancement_amo",
    num: 2,
    label: "Lancement de l'AMO",
    intro:
      "Décision de l'assemblée générale de confier l'assistance à maîtrise d'ouvrage à Strat Eco, et pièces qui permettent à Strat Eco de déposer le dossier au nom de la copropriété.",
    groupes: [
      {
        docs: [
          {
            key: "pv_age_lancement_amo",
            name: "PV d'AGE validant le lancement de l'AMO",
            hint: "Signé, cacheté et certifié conforme",
            fournisseur: "syndic",
            type: "pv_ag_lancement_amo",
          },
          {
            key: "rib_compte_travaux",
            name: "RIB du compte travaux",
            hint: "Compte ouvert au nom du syndicat des copropriétaires",
            fournisseur: "syndic",
            type: "rib_compte_travaux",
          },
          {
            key: "convention_amo",
            name: "Convention de l'AMO",
            hint: "Convention d'assistance à maîtrise d'ouvrage Strat Eco, signée par le syndic",
            fournisseur: "syndic",
            type: "contrat_amo",
          },
          {
            key: "mandat_delegation_depot",
            name: "Mandat de délégation de dépôt à l'AMO",
            hint: "Pré-rempli par Strat Eco sur le modèle EMS / Climaxion - le syndic n'a qu'à le signer puis le déposer ici (signature électronique à venir)",
            fournisseur: "syndic",
            type: "mandat_delegation_depot",
          },
        ],
      },
    ],
  },
  {
    id: "etudes_moe",
    num: 3,
    label: "Études et maîtrise d'œuvre",
    intro:
      "Pièces du choix de la maîtrise d'œuvre et des études : le PV d'AG relève du syndic, le reste est versé par Strat Eco ou la maîtrise d'œuvre et suivi ici.",
    groupes: [
      {
        docs: [
          {
            key: "pv_ag_moe",
            name: "PV d'AG validant la maîtrise d'œuvre",
            hint: "Signé, cacheté et certifié conforme",
            fournisseur: "syndic",
            type: "pv_ag_moe",
          },
          {
            key: "audit_reglementaire_sources",
            name: "Audit énergétique réglementaire et fichiers sources",
            hint: "Rapport d'audit (loi ELAN) et fichiers de calcul du bureau d'études",
            fournisseur: "amo_moe",
            type: "audit_energetique",
          },
          {
            key: "offre_moe",
            name: "Offre de la maîtrise d'œuvre",
            hint: "Offre retenue lors de la consultation - déjà au dossier projet",
            fournisseur: "amo",
            type: "offre_moe",
          },
          {
            key: "pf_definitif",
            name: "Plan de financement définitif de l'opération",
            hint: "Classeur exporté du plan de financement définitif validé - produit par Strat Eco",
            fournisseur: "amo",
            type: "pf_definitif",
          },
          {
            key: "tests_etancheite",
            name: "Rapport des tests initiaux d'étanchéité à l'air",
            hint: "Mesures avant travaux",
            fournisseur: "amo_moe",
            type: "test_etancheite",
          },
          {
            key: "memoire_technique",
            name: "Mémoire technique",
            hint: "Mémoire technique du projet établi par la maîtrise d'œuvre",
            fournisseur: "moe",
            type: "memoire_technique",
          },
          {
            key: "plans_coupes_photos",
            name: "Plans, coupes et photos des bâtiments",
            fournisseur: "moe",
            type: "plan",
          },
        ],
      },
    ],
  },
  {
    id: "travaux",
    num: 4,
    label: "Travaux",
    intro:
      "Décision de travaux et pièces des marchés. L'attestation et le rapport de conformité des offres suivent deux modèles fournis par Strat Eco, complétés par la maîtrise d'œuvre.",
    groupes: [
      {
        docs: [
          {
            key: "pv_age_travaux",
            name: "PV d'AGE validant les travaux",
            hint: "Signé, cacheté et certifié conforme",
            fournisseur: "syndic",
            type: "pv_ag_travaux",
          },
          {
            key: "attestation_conformite_offres",
            name: "Attestation de conformité des offres",
            hint: "Sur le modèle fourni par Strat Eco (à venir dans cette ligne) - établie par la maîtrise d'œuvre",
            fournisseur: "moe",
            type: "attestation_conformite_offres",
          },
          {
            key: "rapport_conformite_offres",
            name: "Rapport de conformité des offres",
            hint: "Sur le modèle fourni par Strat Eco (à venir dans cette ligne) - analyse des offres par la maîtrise d'œuvre",
            fournisseur: "moe",
            type: "rapport_conformite_offres",
          },
          {
            key: "cctp_dpgf_energetiques",
            name: "CCTP et DPGF des lots énergétiques",
            fournisseur: "amo_moe",
            type: "cctp_dce",
          },
          {
            key: "devis_fenetres",
            name: "Devis de remplacement des fenêtres",
            hint: "Devis des entreprises RGE pour les menuiseries",
            fournisseur: "amo_moe",
            type: "devis_fenetres",
          },
          {
            key: "planning_previsionnel",
            name: "Planning prévisionnel de l'opération",
            fournisseur: "moe",
            type: "planning",
          },
        ],
      },
    ],
  },
  {
    id: "aides_individuelles",
    num: 5,
    label: "Aides individuelles",
    intro:
      "Pièces établies par Strat Eco à partir de l'enquête sociale. Les avis d'imposition et le tableau des primes individuelles restent confidentiels : ni visibles ni téléchargeables depuis l'espace syndic.",
    groupes: [
      {
        docs: [
          {
            key: "avis_imposition",
            name: "Avis d'imposition des personnes éligibles aux aides",
            hint: "Justificatifs déposés par les copropriétaires depuis leur espace et centralisés par Strat Eco - pièce confidentielle",
            fournisseur: "amo",
            confidentiel: true,
            type: "avis_imposition",
          },
          {
            key: "tableau_primes_individuelles",
            name: "Tableau récapitulatif des primes individuelles",
            hint: "Primes individuelles par copropriétaire éligible, établi par Strat Eco - pièce confidentielle",
            fournisseur: "amo",
            confidentiel: true,
            type: "liste_primes_individuelles",
          },
          {
            key: "liste_beneficiaires",
            name: "Liste des bénéficiaires",
            hint: "Copropriétaires bénéficiaires des aides individuelles - établie par Strat Eco",
            fournisseur: "amo",
            type: "liste_beneficiaires",
          },
        ],
      },
    ],
  },
];

// ========== Catalogue documentaire CEE ==========
// Source : étapes du dossier de certificats d'économies d'énergie données par
// Amir le 13/09/2026 - demande de cotation, validation des aides, demande de
// solde. Déposants fixés pièce par pièce. Les pièces à signer (AIF, attestation
// sur l'honneur) sont déposées pré-remplies par Strat Eco, puis téléchargées,
// signées à la main et téléversées par le syndic sur la ligne suivante.

export const CEE_ETAPES: EtapeDef[] = [
  {
    id: "cotation",
    num: 1,
    label: "Demande de cotation",
    intro:
      "Le délégataire CEE chiffre la prime à partir des coordonnées du syndic et de la copropriété, des pièces techniques du projet et de la décision de travaux. Complétez le récapitulatif ; les pièces techniques sont versées par Strat Eco ou la maîtrise d'œuvre.",
    formulaires: [
      {
        type: "coordonnees_cee",
        name: "Récapitulatif des coordonnées du syndic et de la copropriété",
        hint: "Pré-rempli avec les données du projet - vérifiez et complétez",
      },
    ],
    groupes: [
      {
        docs: [
          {
            key: "cctp_dpgf",
            name: "CCTP et DPGF des travaux",
            fournisseur: "amo_moe",
            type: "cctp_dce",
          },
          {
            key: "audit_reglementaire_sources",
            name: "Audit énergétique réglementaire et fichiers sources",
            hint: "Rapport d'audit (loi ELAN) et fichiers de calcul du bureau d'études",
            fournisseur: "amo_moe",
            type: "audit_energetique",
          },
          {
            key: "attestations_rge",
            name: "Attestations RGE des entreprises",
            hint: "Qualifications RGE valides à la date du devis, pour chaque entreprise des lots énergétiques",
            fournisseur: "amo_moe",
            type: "attestation_rge",
          },
          {
            key: "pv_ag_travaux",
            name: "PV d'AG validant les travaux",
            hint: "Signé, cacheté et certifié conforme - même pièce que dans les autres dossiers",
            fournisseur: "syndic",
            type: "pv_ag_travaux",
          },
        ],
      },
    ],
  },
  {
    id: "validation_aides",
    num: 2,
    label: "Validation des aides",
    intro:
      "Après la cotation : le délégataire valide la prime sur la base de l'attestation d'incitation financière signée, des justificatifs des ménages et du premier contrôle de l'organisme accrédité (COFRAC).",
    groupes: [
      {
        docs: [
          {
            key: "aif_a_signer",
            name: "AIF pré-remplie (à signer)",
            hint: "Attestation d'incitation financière du délégataire, préparée et déposée par Strat Eco - à télécharger pour signature",
            fournisseur: "amo",
            type: "aif_cee",
          },
          {
            key: "aif_signee",
            name: "AIF signée",
            hint: "Téléchargez l'AIF déposée par Strat Eco à la ligne précédente, signez-la de façon manuscrite, puis téléversez-la ici",
            fournisseur: "syndic",
            type: "aif_cee_signee",
          },
          {
            key: "avis_imposition",
            name: "Avis d'imposition des copropriétaires",
            hint: "Justificatifs déposés par les copropriétaires depuis leur espace et centralisés par Strat Eco - pièce confidentielle",
            fournisseur: "amo",
            confidentiel: true,
            type: "avis_imposition",
          },
          {
            key: "rapport_cofrac_1",
            name: "Rapport complémentaire suite à COFRAC 1",
            hint: "Établi après le premier contrôle de l'organisme accrédité",
            fournisseur: "amo_moe",
            type: "rapport_cofrac_1",
          },
        ],
      },
    ],
  },
  {
    id: "solde",
    num: 3,
    label: "Demande de solde",
    intro:
      "À la réception des travaux énergétiques : le versement du solde de la prime est demandé sur la base des PV de réception, de l'attestation sur l'honneur signée et du second contrôle COFRAC.",
    groupes: [
      {
        docs: [
          {
            key: "pv_reception",
            name: "Procès-verbaux de réception des travaux énergétiques",
            hint: "Établis par la maîtrise d'œuvre lot par lot - signés également par le syndic",
            fournisseur: "amo_moe",
            type: "pv_reception",
          },
          {
            key: "ah_a_signer",
            name: "Attestation sur l'honneur pré-remplie (à signer)",
            hint: "Préparée et déposée par Strat Eco - à télécharger pour signature",
            fournisseur: "amo",
            type: "ah_cee",
          },
          {
            key: "ah_signee",
            name: "Attestation sur l'honneur signée",
            hint: "Téléchargez l'attestation déposée par Strat Eco à la ligne précédente, signez-la de façon manuscrite, puis téléversez-la ici",
            fournisseur: "syndic",
            type: "ah_cee_b",
          },
          {
            key: "rapport_cofrac_2",
            name: "Rapport complémentaire suite à COFRAC 2",
            hint: "Établi après le second contrôle de l'organisme accrédité",
            fournisseur: "amo_moe",
            type: "rapport_cofrac_2",
          },
        ],
      },
    ],
  },
];

// ========== Registre des parcours ==========

export interface ParcoursDef {
  titre: string;
  intro: string;
  etapes: EtapeDef[];
}

export const PARCOURS: Partial<Record<MontageId, ParcoursDef>> = {
  ecoptz: {
    titre: "Éco-PTZ collectif - CEGEE",
    intro:
      "Prêt collectif souscrit par le syndicat des copropriétaires auprès de la Caisse d'Épargne Grand Est Europe. Préparez les trois étapes dans l'ordre - l'équipe Strat Eco est notifiée de vos dépôts.",
    etapes: ECOPTZ_ETAPES,
  },
  anah: {
    titre: "ANAH - MaPrimeRénov' Copropriété",
    intro:
      "Subvention collective de l'Anah accordée au syndicat des copropriétaires. Le dossier reprend les 15 pièces de la checklist MaPrimeRénov' du projet : déposez celles qui relèvent du syndic, les autres sont versées par Strat Eco ou la maîtrise d'œuvre et suivies ici.",
    etapes: ANAH_ETAPES,
  },
  cee: {
    titre: "Certificats d'économies d'énergie (CEE)",
    intro:
      "Prime CEE versée par le délégataire au syndicat des copropriétaires, en trois étapes : demande de cotation, validation des aides, demande de solde. Déposez les pièces qui relèvent du syndic ; celles de Strat Eco et de la maîtrise d'œuvre sont suivies ici. Les pièces à signer sont déposées pré-remplies par Strat Eco : téléchargez-les, signez-les et téléversez-les sur la ligne prévue.",
    etapes: CEE_ETAPES,
  },
  climaxion: {
    titre: "EMS & Climaxion",
    intro:
      "Aides de l'Eurométropole de Strasbourg et de la Région Grand Est (Climaxion), instruites sur un dossier commun de 25 pièces. Déposez celles qui relèvent du syndic ; les autres sont versées par Strat Eco ou la maîtrise d'œuvre et suivies ici. Quatre pièces suivent un modèle fourni par Strat Eco.",
    etapes: CLIMAXION_ETAPES,
  },
  do: {
    titre: "Assurance dommages-ouvrage - ROEDERER",
    intro:
      "Assurance obligatoire du maître d'ouvrage (art. L.242-1 du Code des assurances) : elle préfinance, pendant les dix ans suivant la réception, la réparation des dommages de nature décennale sans recherche de responsabilité. Dossier monté avec le courtier ROEDERER (Département Assurances Construction, Schiltigheim - construction@roederer.fr, 03 88 76 75 20).",
    etapes: DO_ETAPES,
  },
};

/** Tous les documents (dédoublonnés) d'une étape. */
export function docsOfEtape(etape: EtapeDef): DocDef[] {
  return etape.groupes.flatMap((g) => g.docs);
}

/** Définition d'un document du montage, par clé. */
export function docDef(montage: MontageId, docKey: string): DocDef | undefined {
  return PARCOURS[montage]?.etapes.flatMap(docsOfEtape).find((d) => d.key === docKey);
}

/** Préfixe Storage d'un document : les pièces confidentielles vivent sous
 *  montage-prive/ (aucun droit syndic), les autres sous montage/. */
function prefixeStorage(montage: MontageId, docKey: string): string {
  return docDef(montage, docKey)?.confidentiel ? "montage-prive" : "montage";
}

/** Avancement d'une étape : documents déposés ou non applicables / total.
 *  Le syndic ne voit pas les pièces confidentielles : elles sortent de son
 *  décompte (inclureConfidentiels = false). */
export function etapeProgress(
  etape: EtapeDef,
  docs: Map<string, MontageDoc>,
  forms: Map<FormulaireType, MontageFormulaire>,
  inclureConfidentiels = true
): { done: number; total: number } {
  const defs = docsOfEtape(etape).filter((d) => inclureConfidentiels || !d.confidentiel);
  let done = defs.filter((d) => {
    const row = docs.get(d.key);
    return row && (docFiles(row).length > 0 || row.statut === "non_applicable");
  }).length;
  let total = defs.length;
  for (const f of etape.formulaires ?? []) {
    total += 1;
    const st = forms.get(f.type)?.statut;
    if (st === "transmis" || st === "valide") done += 1;
  }
  return { done, total };
}

// ========== Hooks ==========

export function useMontageDocs(coproId: string | undefined, montage: MontageId) {
  return useQuery({
    queryKey: ["montage", "docs", coproId, montage],
    enabled: !!coproId,
    queryFn: async (): Promise<MontageDoc[]> => {
      const { data, error } = await supabase
        .from("montage_docs")
        .select("*")
        .eq("copro_id", coproId!)
        .eq("montage", montage);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFormulairesMontage(coproId: string | undefined) {
  return useQuery({
    queryKey: ["montage", "formulaires", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<MontageFormulaire[]> => {
      const { data, error } = await supabase
        .from("montage_formulaires")
        .select("*")
        .eq("copro_id", coproId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

async function currentUid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Session expirée");
  return uid;
}

/** Alerte l'équipe AMO du dossier après un dépôt du syndic - meilleure volonté :
 *  l'échec de la notification ne doit jamais faire échouer le dépôt lui-même. */
function notifierDepot(coproId: string, montage: MontageId, docKey: string, fileName: string) {
  const montageLabel = MONTAGES.find((m) => m.id === montage)?.label ?? montage;
  const docName = docDef(montage, docKey)?.name ?? fileName;
  void supabase.functions
    .invoke("notifier-depot-document", {
      body: {
        copro_id: coproId,
        doc_name: docName,
        contexte: `${montageLabel} - fichier « ${fileName} »`,
      },
    })
    .catch(() => undefined);
}

/** Dépose un fichier sur un document du montage (ajout - plusieurs PV possibles). */
export function useUploadMontageDoc(coproId: string, montage: MontageId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      docKey,
      file,
      nameOriginal,
      type,
    }: {
      docKey: string;
      file: File;
      nameOriginal?: string;
      /** Type choisi dans le dialogue de nommage (défaut : celui de la pièce). */
      type?: string | null;
    }) => {
      const uid = await currentUid();
      const nom = nomFichierSansAccents(file.name);
      const safe = nom.replace(/[^a-zA-Z0-9._-]/g, "_");
      const confidentiel = !!docDef(montage, docKey)?.confidentiel;
      const path = `${prefixeStorage(montage, docKey)}/${coproId}/${montage}/${docKey}/${Date.now()}-${safe}`;
      const { error: eUp } = await supabase.storage.from("copro-files").upload(path, file);
      if (eUp) throw eUp;
      const { data: prev } = await supabase
        .from("montage_docs")
        .select("files")
        .eq("copro_id", coproId)
        .eq("montage", montage)
        .eq("doc_key", docKey)
        .maybeSingle();
      const entry: MontageFile = {
        name: nom,
        name_original: nameOriginal && nameOriginal !== nom ? nameOriginal : null,
        path,
        size: file.size,
        mime: file.type || null,
        uploaded_at: new Date().toISOString(),
        uploaded_by: uid ?? null,
      };
      const files = [...(Array.isArray(prev?.files) ? (prev!.files as unknown as MontageFile[]) : []), entry];
      const { error: eDb } = await supabase.from("montage_docs").upsert(
        {
          copro_id: coproId,
          montage,
          doc_key: docKey,
          statut: "depose",
          files: files as unknown as Json,
          confidentiel,
          updated_by: uid,
        },
        { onConflict: "copro_id,montage,doc_key" }
      );
      if (eDb) throw eDb;
      // Notifie l'équipe AMO (chef de projet) - la fonction ignore les dépôts AMO.
      notifierDepot(coproId, montage, docKey, file.name);
      // La même pièce est attendue ailleurs (checklists, autres dossiers de
      // montage) : elle y est cochée / ajoutée (feedback Amir 13/09/2026).
      await propagerDocument(coproId, type ?? docDef(montage, docKey)?.type, entry, { montageSource: montage });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["montage", "docs", coproId] });
      void qc.invalidateQueries({ queryKey: ["checklists", coproId] });
      void qc.invalidateQueries({ queryKey: ["syndic", "documents", coproId] });
    },
  });
}

/** Retire un fichier déposé (Storage + ligne). */
export function useRemoveMontageFile(coproId: string, _montage: MontageId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ path }: { docKey: string; path: string }) => {
      // Le fichier peut être référencé par plusieurs dossiers de montage
      // (propagation) : il est retiré de tous avant suppression du Storage.
      await retirerFichierDesMontages(coproId, path);
      await supabase.storage.from("copro-files").remove([path]);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["montage", "docs", coproId] }),
  });
}

/** Marque un document conditionnel « non concerné » (ou le réactive). */
export function useSetDocNonApplicable(coproId: string, montage: MontageId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docKey, nonApplicable }: { docKey: string; nonApplicable: boolean }) => {
      const uid = await currentUid();
      const { error } = await supabase.from("montage_docs").upsert(
        {
          copro_id: coproId,
          montage,
          doc_key: docKey,
          statut: nonApplicable ? "non_applicable" : "a_fournir",
          confidentiel: !!docDef(montage, docKey)?.confidentiel,
          updated_by: uid,
        },
        { onConflict: "copro_id,montage,doc_key" }
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["montage", "docs", coproId, montage] }),
  });
}

/** Télécharge un fichier déposé (URL signée 5 min). */
export async function downloadMontageFile(f: MontageFile) {
  // `download` côté Storage : le fichier arrive sous son nom affiché (l'attribut download
  // d'un lien est ignoré sur une URL cross-origin)
  const { data, error } = await supabase.storage.from("copro-files").createSignedUrl(f.path, 300, { download: nomFichierSansAccents(f.name) });
  if (error || !data) throw error ?? new Error("URL de téléchargement indisponible");
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = f.name;
  a.click();
}

/** Enregistre un formulaire du montage (brouillon ou transmis). */
export function useSaveFormulaireMontage(coproId: string, type: FormulaireType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ data, statut }: { data: Json; statut?: "brouillon" | "transmis" }) => {
      const uid = await currentUid();
      const { data: prev } = await supabase
        .from("montage_formulaires")
        .select("statut")
        .eq("copro_id", coproId)
        .eq("type", type)
        .maybeSingle();
      const { error } = await supabase.from("montage_formulaires").upsert(
        {
          copro_id: coproId,
          type,
          data,
          statut: statut ?? prev?.statut ?? "brouillon",
          updated_by: uid,
        },
        { onConflict: "copro_id,type" }
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["montage", "formulaires", coproId] }),
  });
}
