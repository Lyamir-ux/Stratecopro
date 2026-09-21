// Schéma `pppt-verif/1.0` - sortie du skill pppt-verif (analyse d'un PPPT
// tiers). C'est la frontière du module Suivi PPT : en phase 1 le JSON est
// téléversé par le dirigeant après analyse locale ; plus tard l'edge function
// ppt-analyser produira le même JSON. Ne pas modifier ces types à la volée :
// un besoin nouveau = version 1.1 du schéma, avec migrateur.

export const SCHEMA_VERSION = "pppt-verif/1.0";

export type NatureDocument = "PPPT" | "PPT" | "DTG" | "AUDIT" | "DPE" | "TABLEAU" | "INCONNU";
export type Etiquette = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type StatutControle = "CONFORME" | "NON_CONFORME" | "PARTIEL" | "NON_VERIFIABLE" | "SANS_OBJET";
export type SeveriteControle = "BLOQUANT" | "MAJEUR" | "MINEUR" | "INFO";
export type FamilleControle = "reglementaire" | "coherence" | "plateforme";
export type Verdict = "EXPLOITABLE" | "EXPLOITABLE_AVEC_RESERVES" | "A_REPRENDRE" | "NON_PPPT";
export type PrioriteSkill = "Préservation" | "Énergétique" | "Amélioration";
export type CoutOrigine = "source" | "converti_depuis_TTC" | "estime_strateco";
export type AnneeOrigine = "source" | "deduite" | "a_confirmer";

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
  priorite_source: string | null;
  annee_source: number | null;
  periode_source: string | null;
  cout_source_eur: number | null;
  cout_source_base: "HT" | "TTC" | null;
  tva_source_pct: number | null;
  gain_energetique_source_pct: number | null;
  justification: string | null;
  page: number | null;
}

export interface EcheancierSource {
  annee_base: number | null;
  horizon_annees: number | null;
  premiere_annee: number | null;
  derniere_annee: number | null;
  total_annonce_eur: number | null;
  total_annonce_base: "HT" | "TTC" | null;
  totaux_par_annee_annonces: Record<string, number | null>;
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
  score_conformite_pct: number;
  score_coherence_pct: number;
  points_forts: string[];
  questions_ouvertes: string[];
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
  gain_energetique_pct: number | null;
  commentaire: string | null;
  controles_lies: string[];
}

export interface ParametresPpt {
  annee_base: number;
  premiere_annee: number;
  horizon: number;
  inflation: number;
  tva_facades_toitures: number;
  tva_energetique: number;
  honoraires_moe: number;
  honoraires_syndic: number;
  cep_base_kwhep_m2_an: number | null;
}

export interface PpptVerifJson {
  schema_version: string;
  genere_le: string;
  genere_par: string;
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
  /** Ajouté par la plateforme à l'import : contrôles déterministes rejoués
   *  (famille « plateforme »), réécrits à chaque enregistrement de la revue. */
  remarques_plateforme?: Controle[];
}

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
