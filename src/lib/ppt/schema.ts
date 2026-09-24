// Schéma `pppt-verif/1.2` - sortie du skill pppt-verif (analyse d'un PPPT
// tiers). C'est la frontière du module Suivi PPT : en phase 1 le JSON est
// téléversé par le dirigeant après analyse locale ; plus tard l'edge function
// ppt-analyser produira le même JSON. Ne pas modifier ces types à la volée :
// un besoin nouveau = nouvelle version du schéma, avec migrateur (import.ts).
//
// 1.0 → 1.1 (22/09/2026) : le skill décide et l'utilisateur valide en bloc.
// Bloc `propositions[]` (une décision = une proposition, avec son statut de
// validation), `travaux_source[].scenario`, compteurs de propositions dans la
// synthèse.
//
// 1.1 → 1.2 (24/09/2026) : bloc `revision` (historique de la révision),
// postes source exclus (`retenu_dans_ppt`), réévaluation des prix
// (`cout_ht_source_eur` × `reevaluation_prix_coef` = `cout_ht_base_eur`),
// micro-postes regroupés (`regroupe_ids`), plan de référence de l'échéancier
// source, statut global de validation. Tous les ajouts sont optionnels à la
// lecture : un 1.1 est migré avec les valeurs par défaut (import.ts).
//
// Unités (bloc `conventions` du fichier) : `_pct` = points de pourcentage
// (0.5 = 0,5 %, jamais une fraction, même sous 1), `_coef` = multiplicateur,
// `_eur` = euros HT sauf mention TTC. La division par 100 se fait au moment du
// calcul ou du rendu, jamais à l'import.

export const SCHEMA_VERSION = "pppt-verif/1.2";
/** Versions acceptées à l'import : toute autre est refusée (1.0 comprise). */
export const SCHEMAS_ACCEPTES = ["pppt-verif/1.1", "pppt-verif/1.2"];
/** Versions relues en base : les analyses 1.0 importées avant la 1.1 restent lisibles. */
export const SCHEMAS_CONNUS = ["pppt-verif/1.0", ...SCHEMAS_ACCEPTES];

export type NatureDocument = "PPPT" | "PPT" | "DTG" | "AUDIT" | "DPE" | "TABLEAU" | "INCONNU";
export type Etiquette = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type StatutControle = "CONFORME" | "NON_CONFORME" | "PARTIEL" | "NON_VERIFIABLE" | "SANS_OBJET";
export type SeveriteControle = "BLOQUANT" | "MAJEUR" | "MINEUR" | "INFO";
export type FamilleControle = "reglementaire" | "coherence" | "plateforme";
export type Verdict = "EXPLOITABLE" | "EXPLOITABLE_AVEC_RESERVES" | "A_REPRENDRE" | "NON_PPPT";
export type PrioriteSkill = "Préservation" | "Énergétique" | "Amélioration";
export type CoutOrigine = "source" | "converti_depuis_TTC" | "estime_strateco" | "reevalue_prix_source" | "regroupement_micro_postes";
export const COUT_ORIGINES: CoutOrigine[] = ["source", "converti_depuis_TTC", "estime_strateco", "reevalue_prix_source", "regroupement_micro_postes"];
export type AnneeOrigine = "source" | "deduite" | "a_confirmer" | "lissee";
export const ANNEE_ORIGINES: AnneeOrigine[] = ["source", "deduite", "a_confirmer", "lissee"];
/** Statut de validation d'une proposition du skill, décidé par Strat Eco sur la revue. */
export type StatutValidationProposition = "A_VALIDER" | "VALIDEE" | "REFUSEE" | "MODIFIEE";
export const STATUTS_VALIDATION: StatutValidationProposition[] = ["A_VALIDER", "VALIDEE", "REFUSEE", "MODIFIEE"];
/** État du dossier (1.2) : VALIDE quand plus aucune proposition n'est à valider. */
export type StatutValidationGlobal = "A_VALIDER" | "VALIDE";

/** Bloc `conventions` écrit par la plateforme à l'export (texte du skill 1.2). */
export const CONVENTIONS_1_2: Record<string, string> = {
  dates: "AAAA-MM-JJ ; années en entiers.",
  energie: "cep_* en kWhep/m².an, ges_* en kgCO2/m².an ; surfaces en m² (type précisé dans surface_type).",
  montants: "Tout champ suffixé _eur est en euros, base HT sauf mention TTC dans le nom ou le champ *_base.",
  identifiants: "travaux : T## (suffixe a/b/c si un poste source est éclaté par période) ; contrôles : R## / C## ; propositions : P##.",
  pourcentages: "Tout champ suffixé _pct est en points de pourcentage : 1.0 = 1 %, 0.5 = 0,5 %, 23.8 = 23,8 %. Aucun champ n'est en fraction, y compris pour les valeurs inférieures à 1 : ne jamais multiplier par 100 à l'import.",
  coefficients: "Tout champ suffixé _coef est un multiplicateur sans unité (1.071225 = +7,12 %).",
};

/** Historique de la révision (1.2). Les totaux sont calculés par le skill, ou
 *  par la plateforme quand elle produit une nouvelle révision (export.ts). */
export interface Revision {
  numero: number;
  date: string;
  base: string | null;
  propositions_appliquees: string[];
  changements: string[];
  totaux_ttc_estimes_eur: Record<string, number> | null;
  total_ttc_estime_eur: number | null;
  total_ht_base_eur: number | null;
  total_ht_source_retenu_eur: number | null;
}

export interface DocumentSource {
  fichiers: { nom: string; type: string; pages: number | null }[];
  nature_detectee: NatureDocument;
  titre: string | null;
  date_document: string | null;
  version: string | null;
  auteur: {
    raison_sociale: string | null;
    type: string | null;
    siret: string | null;
    qualification: string | null;
    assurance_rc_pro: boolean | null;
    signature_presente: boolean | null;
  };
}

export interface CoproprieteJson {
  nom: string;
  adresse: string | null;
  code_postal: string | null;
  commune: string | null;
  syndic: string | null;
  annee_construction: number | null;
  nb_batiments: number | null;
  noms_batiments: string[];
  nb_lots_total: number | null;
  nb_logements: number | null;
  surface_m2: number | null;
  surface_type: "SHAB" | "SHON" | "SDP" | "DPE" | null;
  chauffage: "collectif" | "individuel" | "mixte" | null;
  energie_chauffage: string | null;
  immeuble_plus_de_15_ans: boolean | null;
  immatriculation_rnc: string | null;
}

export interface DpeCollectifJson {
  present: boolean;
  date: string | null;
  etiquette_energie: Etiquette | null;
  etiquette_ges: Etiquette | null;
  cep_kwhep_m2_an: number | null;
  ges_kgco2_m2_an: number | null;
  methode: string | null;
  diagnostiqueur: string | null;
  numero_ademe: string | null;
  /** Non prévu par le skill : nombre de lots lu sur le DPE quand il y figure. */
  nb_lots?: number | null;
}

export interface DiagnosticsSources {
  dtg: { present: boolean; date: string | null; auteur: string | null };
  dpe_collectif: DpeCollectifJson;
  audit_energetique: { present: boolean; date: string | null; gain_scenario_max_pct: number | null };
  autres: { type: string; date: string | null }[];
}

export interface EtatDesLieux {
  ouvrage: string;
  detail: string | null;
  etat: "Bon" | "Moyen" | "Mauvais" | null;
  pathologies: string | null;
  page: number | null;
}

export interface TravailSource {
  id: string;
  libelle_source: string;
  batiment: string | null;
  ouvrage: string | null;
  /** 1.1 : plan / scénario du document quand il en propose plusieurs. */
  scenario?: string | null;
  priorite_source: string | null;
  annee_source: number | null;
  periode_source: string | null;
  cout_source_eur: number | null;
  cout_source_base: "HT" | "TTC" | null;
  tva_source_pct: number | null;
  gain_energetique_source_pct: number | null;
  justification: string | null;
  page: number | null;
  /** 1.2 : false = poste source volontairement exclu du PPT (défaut true). */
  retenu_dans_ppt?: boolean;
  motif_exclusion?: string | null;
}

export interface EcheancierSource {
  annee_base: number | null;
  horizon_annees: number | null;
  premiere_annee: number | null;
  derniere_annee: number | null;
  total_annonce_eur: number | null;
  total_annonce_base: "HT" | "TTC" | null;
  /** Clés = libellés de `travaux_source[].periode_source` (« 0 à 1 an ») ou millésimes. */
  totaux_par_annee_annonces: Record<string, number | null>;
  /** Totaux des plans du document quand il en propose plusieurs. */
  plans?: Record<string, { ht: number | null; ttc: number | null }>;
  /** 1.2 : plan de la source auquel se comparent les totaux annoncés. */
  scenario_reference?: string | null;
  note_scenario?: string | null;
}

export interface PerformanceEnergetique {
  etiquette_visee: Etiquette | null;
  cep_apres_kwhep_m2_an: number | null;
  gain_total_annonce_pct: number | null;
  ges_apres_kgco2_m2_an: number | null;
  methode_estimation: string | null;
}

export interface HypothesesFinancieres {
  inflation_pct: number | null;
  honoraires_moe_pct: number | null;
  honoraires_syndic_pct: number | null;
  tva_par_defaut_pct: number | null;
  fonds_travaux_mentionne: boolean | null;
  cotisation_fonds_travaux_pct_ou_eur: string | null;
  aides_mentionnees: string[];
}

export interface Controle {
  code: string;
  famille: FamilleControle;
  libelle: string;
  reference: string | null;
  statut: StatutControle;
  severite: SeveriteControle;
  constat: string | null;
  attendu: string | null;
  observe: string | null;
  ecart: string | null;
  action: string | null;
  page: number | null;
  /** Remarques plateforme : poste concerné (code source T01…) et visibilité syndic. */
  poste_code?: string | null;
  visible_syndic?: boolean;
}

export interface Synthese {
  verdict: Verdict;
  nb_bloquants: number;
  nb_majeurs: number;
  nb_mineurs: number;
  /** 1.1 */
  nb_partiels?: number;
  nb_propositions?: number;
  nb_propositions_appliquees?: number;
  score_conformite_pct: number;
  score_coherence_pct: number;
  points_forts: string[];
  questions_ouvertes: string[];
  /** 1.2 (défaut A_VALIDER) */
  statut_validation_global?: StatutValidationGlobal;
}

/**
 * Proposition du skill (1.1) : une décision prise par défaut, appliquée ou non
 * au tableau, que Strat Eco accepte, refuse ou modifie sur la revue avant de
 * matérialiser les postes. `appliquee_dans_ppt` = le tableau (travaux_normalises)
 * la reflète déjà ; false = alternative soumise mais non retenue par le skill.
 */
export interface Proposition {
  code: string;
  theme: string;
  decision: string;
  valeur_source: string | null;
  valeur_proposee: string;
  impact: string;
  alternative: string | null;
  appliquee_dans_ppt: boolean;
  lignes_concernees: string[];
  controle_lie: string | null;
  statut_validation: StatutValidationProposition;
  commentaire_validateur: string | null;
  /** 1.2 : ce qui a été fait concrètement (écrit par le skill). */
  note_application?: string | null;
  /** 1.2 : date de la décision (AAAA-MM-JJ), posée par la revue. */
  date_validation?: string | null;
}

export interface TravailNormalise {
  id: string;
  libelle: string;
  priorite: PrioriteSkill;
  critere: string | null;
  batiment: string | null;
  ouvrage: string;
  cout_ht_base_eur: number | null;
  cout_ht_origine: CoutOrigine | null;
  tva_pct: number;
  regle_tva: string | null;
  avec_moe: boolean;
  annee_prevue: number | null;
  annee_origine: AnneeOrigine;
  /** Points de pourcentage : 0.5 = 0,5 %. */
  gain_energetique_pct: number | null;
  commentaire: string | null;
  controles_lies: string[];
  /** 1.2 : montant HT du document source, avant réévaluation (défaut = cout_ht_base_eur). */
  cout_ht_source_eur?: number | null;
  /** 1.2 : coefficient de réévaluation appliqué à la ligne (défaut 1). */
  reevaluation_prix_coef?: number;
  /** 1.2 : postes source fusionnés dans cette ligne (micro-postes regroupés). */
  regroupe_ids?: string[] | null;
}

/** Hypothèses du tableau, en points de pourcentage (3.5 = 3,5 %). Les analyses
 *  1.0 portaient des fractions sous des clés sans suffixe (`inflation: 0.035`) :
 *  migrerJson les convertit d'après la clé. */
export interface ParametresPpt {
  annee_base: number;
  premiere_annee: number;
  horizon: number;
  inflation_pct: number;
  tva_facades_toitures_pct: number;
  tva_energetique_pct: number;
  honoraires_moe_pct: number;
  honoraires_syndic_pct: number;
  cep_base_kwhep_m2_an: number | null;
  /** 1.2 */
  annee_prix_source?: number | null;
  reevaluation_prix_coef?: number;
  /** 1.2 : honoraires de MOE aussi sur les lignes énergétiques (explique leur avec_moe). */
  moe_sur_energetique?: boolean;
}

export interface PpptVerifJson {
  schema_version: string;
  genere_le: string;
  genere_par: string;
  conventions?: Record<string, string>;
  /** 1.2 : révision du dossier (null pour un 1.1). */
  revision?: Revision | null;
  document_source: DocumentSource;
  copropriete: CoproprieteJson;
  diagnostics_sources: DiagnosticsSources;
  etat_des_lieux: EtatDesLieux[];
  travaux_source: TravailSource[];
  echeancier_source: EcheancierSource;
  performance_energetique: PerformanceEnergetique;
  hypotheses_financieres_source: HypothesesFinancieres;
  controles: Controle[];
  synthese: Synthese;
  travaux_normalises: TravailNormalise[];
  parametres_ppt: ParametresPpt;
  /** 1.1 : décisions du skill à valider en bloc (vide pour un JSON 1.0 migré). */
  propositions: Proposition[];
  /** Sortie de la plateforme, pas un champ du schéma : ignorée à l'import,
   *  recalculée (famille « plateforme ») et réécrite à chaque enregistrement de
   *  la revue ; jamais exportée vers le skill. */
  remarques_plateforme?: Controle[];
}

/** Un poste source compte dans le PPT sauf exclusion explicite (1.2). */
export const estRetenu = (s: Pick<TravailSource, "retenu_dans_ppt">): boolean => s.retenu_dans_ppt !== false;

/** Montant HT avant réévaluation d'une ligne (1.1 : le HT de base). */
export const coutHtSource = (t: Pick<TravailNormalise, "cout_ht_source_eur" | "cout_ht_base_eur">): number | null => t.cout_ht_source_eur ?? t.cout_ht_base_eur;

/** Poste source d'origine d'un identifiant éclaté par période : T06c → T06. */
export const posteRacine = (id: string): string => id.replace(/^(T\d+)[a-z]$/i, "$1");

/** Natures de poste côté plateforme (colonne ppt_postes.priorite, contrainte 0075).
 *  Les trois premières viennent du skill ; sécurité et santé sont proposées au
 *  syndic quand il ajoute une ligne (feedback 20/09/2026) et relèvent de l'art. 24. */
export type PrioriteCode = "preservation" | "energetique" | "amelioration" | "securite" | "sante";

export const PRIORITES: PrioriteCode[] = ["preservation", "energetique", "amelioration", "securite", "sante"];

/** Priorité du skill → code plateforme (mêmes règles que la RPC ppt_code_priorite). */
export function codePriorite(p: string | null | undefined): PrioriteCode {
  const s = (p ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (s.startsWith("pr")) return "preservation";
  if (s.includes("nerg")) return "energetique";
  if (s.startsWith("am")) return "amelioration";
  if (s.startsWith("secu")) return "securite";
  if (s.startsWith("sant")) return "sante";
  return "preservation";
}

export const PRIORITE_LABEL: Record<PrioriteCode, string> = {
  preservation: "Préservation",
  energetique: "Énergétique",
  amelioration: "Amélioration",
  securite: "Sécurité",
  sante: "Santé",
};

/** Clé d'un contrôle : un code peut se répéter (un par poste), jamais le triplet. */
export function cleControle(c: { code: string; poste_code?: string | null; libelle?: string | null }): string {
  return `${c.code}|${c.poste_code ?? ""}|${c.libelle ?? ""}`;
}
