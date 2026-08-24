// Types du moteur financier - module pur, aucune dépendance UI/Supabase.

export type Profil = "Bleu" | "Jaune" | "Violet" | "Rose";

export const PROFILS: Profil[] = ["Bleu", "Jaune", "Violet", "Rose"];

/** Seuils de revenu fiscal de référence [Bleu max, Jaune max, Violet max] par taille de foyer. */
export interface MprSeuils {
  seuils: Record<1 | 2 | 3 | 4 | 5, [number, number, number]>;
  /** Incrément par personne au-delà de 5. */
  parPers: [number, number, number];
}

/** Barème versionné (stocké en base, injecté dans le moteur - jamais de constantes en dur). */
export interface Bareme {
  millesime: number;
  zone: "hors_idf" | "idf";
  mprSeuils: MprSeuils;
  /** Primes individuelles forfaitaires par profil (€ / logement). */
  primesIndiv: Record<Profil, number>;
  mprCopro: {
    /** Taux (%) si gain énergétique entre seuilMin et seuilMajore. */
    tauxStandard: number;
    /** Taux (%) si gain ≥ seuilMajore. */
    tauxMajore: number;
    /** Gain minimal (%) pour être éligible. */
    seuilMin: number;
    /** Gain (%) déclenchant le taux majoré. */
    seuilMajore: number;
    /** Bonus sortie de passoire F/G (points de %). */
    bonusPassoire: number;
  };
  ecoPtz: {
    plafondParLogement: number;
    dureeMin: number;
    dureeMax: number;
  };
}

/** Code de la clé de répartition utilisée ('MUN', 'ESC', 'BAT-A'…). */
export type CleRepartition = string;

/** Paramètres d'un scénario financier (persistés en jsonb dans scenarios_financiers.params). */
export interface FinanceParams {
  travaux: number;
  honoraires: number;
  aleas: number;
  cle: CleRepartition;
  /** Total de la clé de répartition (dénominateur des tantièmes - 1000 par convention, 10000 sur certaines copros). */
  totalCle?: number;
  /** Taux MPR Copro retenu (30 ou 45 dans le barème 2024). */
  mprCoproPct: number;
  bonusPassoire: boolean;
  cee: number;
  fonds: number;
  /** Nombre de logements par profil MPR (issu de l'enquête sociale). */
  profils: Record<Profil, number>;
  /** Primes individuelles appliquées (copie du barème au moment du scénario). */
  primeIndiv: Record<Profil, number>;
  ecoPtz: boolean;
  ecoPtzDuree: number;
  /** Part du reste à charge financée par l'éco-PTZ (0-100). */
  ecoPtzPct: number;
  avancePct: number;
  pretComplActif: boolean;
  pretComplDuree: number;
}

export interface CoproContext {
  lots: number;
  lotsHab: number;
}

export interface FinanceResult {
  coutTotal: number;
  tauxMpr: number;
  mprCopro: number;
  aidesColl: number;
  aidesIndiv: number;
  resteAvantPret: number;
  plafondEcoPtz: number;
  ecoPtzMontant: number;
  pretsMobilises: number;
  resteACharge: number;
  parLot: number;
  mensualiteEcoPtz: number;
  tauxAides: number;
}

export type UsageLot = "habitation" | "garage" | "caves" | "commerces" | "bureaux" | "autres";

/** Un copropriétaire et ses lots sur la clé de répartition choisie. */
export interface OwnerInput {
  id: string;
  nom: string;
  profil: Profil | null;
  lots: { id: string; num: string; usage: UsageLot; tantiemes: number }[];
}

/** Ligne de plan individuel générée à l'étape 7. */
export interface PlanIndividuel {
  ownerId: string;
  nom: string;
  profil: Profil | null;
  lotNums: string[];
  lotsHab: number;
  tantiemes: number;
  quotePart: number;
  mprIndiv: number;
  cee: number;
  subvColl: number;
  ecoPtz: number;
  resteACharge: number;
  mensualite: number;
}

export interface PlansResult {
  plans: PlanIndividuel[];
  totals: Omit<PlanIndividuel, "ownerId" | "nom" | "profil" | "lotNums" | "lotsHab">;
}
