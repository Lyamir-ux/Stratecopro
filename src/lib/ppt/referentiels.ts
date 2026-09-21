// Référentiels du module Suivi PPT : fourchettes de marché, seuils DPE, règles
// de TVA, libellés. Tout ce qui est un ordre de grandeur vit ici, jamais en dur
// dans une règle de contrôle - on ajuste les bornes sans toucher au moteur.

import type { Etiquette } from "./schema";

/** Tolérance arithmétique des recalculs : 1 % ou 500 €, la plus grande des deux. */
export function tolerance(montant: number): number {
  return Math.max(500, Math.abs(montant) * 0.01);
}

/** Seuils du DPE 2021 (énergie primaire, kWhep/m².an) : borne haute de chaque classe. */
export const SEUILS_CEP: { classe: Etiquette; max: number }[] = [
  { classe: "A", max: 70 },
  { classe: "B", max: 110 },
  { classe: "C", max: 180 },
  { classe: "D", max: 250 },
  { classe: "E", max: 330 },
  { classe: "F", max: 420 },
  { classe: "G", max: Number.POSITIVE_INFINITY },
];

export const ORDRE_ETIQUETTES: Etiquette[] = ["A", "B", "C", "D", "E", "F", "G"];

/**
 * Fourchettes usuelles de coût HT par famille d'ouvrage, ramenées au logement
 * (le PPPT ne donne presque jamais les surfaces de façade ou de toiture ; le
 * brief parle d'ailleurs d'« €/lot hors bornes de marché »). Bornes larges :
 * on ne signale qu'au-delà d'un facteur 2, on bloque au-delà d'un facteur 4.
 * Les mots-clés sont comparés mot entier, sans accents (« ite » ne matche pas « toiture »).
 */
export interface FourchetteCout {
  mots: string[];
  libelle: string;
  unite: "logement" | "appareil";
  min: number;
  max: number;
}

export const FOURCHETTES_COUT: FourchetteCout[] = [
  { mots: ["ite", "isolation thermique par l'exterieur", "isolation exterieure", "isolation des facades"], libelle: "ITE", unite: "logement", min: 8000, max: 25000 },
  { mots: ["ravalement"], libelle: "Ravalement simple", unite: "logement", min: 1500, max: 10000 },
  { mots: ["toiture", "couverture", "etancheite", "terrasse"], libelle: "Toiture", unite: "logement", min: 2000, max: 15000 },
  { mots: ["vmc", "ventilation"], libelle: "VMC hygro B", unite: "logement", min: 800, max: 1500 },
  { mots: ["menuiserie", "menuiseries", "fenetre", "fenetres", "chassis"], libelle: "Menuiseries", unite: "logement", min: 3000, max: 12000 },
  { mots: ["ascenseur", "ascenseurs"], libelle: "Ascenseur", unite: "appareil", min: 25000, max: 60000 },
  { mots: ["colonne", "colonnes", "eaux usees", "eaux vannes", "chute", "chutes"], libelle: "Colonnes EU / EV", unite: "logement", min: 2000, max: 6000 },
  { mots: ["electricite", "electrique", "tableau"], libelle: "Électricité des communs", unite: "logement", min: 300, max: 900 },
  { mots: ["chaudiere", "chaufferie", "pac", "pompe a chaleur", "generateur"], libelle: "Générateur de chauffage", unite: "logement", min: 1500, max: 6000 },
  { mots: ["plancher bas", "plafond de cave", "plafonds de cave"], libelle: "Isolation plancher bas", unite: "logement", min: 500, max: 3000 },
];

/** Fourchettes de gain énergétique par geste (fraction). */
export const FOURCHETTES_GAIN: { mots: string[]; libelle: string; min: number; max: number }[] = [
  { mots: ["ite", "isolation thermique par l'exterieur", "isolation exterieure", "iti", "isolation des murs", "isolation des facades"], libelle: "Isolation des murs", min: 0.2, max: 0.3 },
  { mots: ["toiture", "combles", "terrasse"], libelle: "Toiture", min: 0.08, max: 0.15 },
  { mots: ["plancher bas", "plafond de cave"], libelle: "Plancher bas", min: 0.03, max: 0.07 },
  { mots: ["menuiserie", "menuiseries", "fenetre", "fenetres"], libelle: "Menuiseries", min: 0.08, max: 0.15 },
  { mots: ["vmc", "ventilation"], libelle: "VMC hygro B", min: 0.03, max: 0.06 },
  { mots: ["chaudiere", "pac", "pompe a chaleur", "generateur", "chaufferie"], libelle: "Générateur performant", min: 0.15, max: 0.3 },
];

/** Plafond du gain composé accepté sans justification. */
export const PLAFOND_GAIN = 0.7;

/** Taux de TVA admis (%). */
export const TAUX_TVA_ADMIS = [5.5, 10, 20];

/** Ouvrages « énergétiques » (5,5 %) et « bâti / extérieur » (10 %) pour C03. */
export const MOTS_TVA_5_5 = ["isolation", "ite", "iti", "menuiserie", "menuiseries", "fenetre", "fenetres", "vmc", "ventilation", "chaudiere", "pac", "pompe a chaleur", "regulation", "calorifugeage", "plancher bas", "combles"];
export const MOTS_TVA_10 = ["ravalement", "toiture", "couverture", "etancheite", "espaces exterieurs", "cloture", "parking", "peinture", "electricite", "ascenseur", "colonne", "colonnes", "garde-corps", "porte"];

/** Enchaînements techniques attendus (C11) : le poste A doit précéder ou accompagner le poste B. */
export const ENCHAINEMENTS: { avant: string[]; apres: string[]; libelle: string }[] = [
  { avant: ["toiture", "couverture"], apres: ["ite", "isolation thermique par l'exterieur"], libelle: "Toiture avant ou avec l'ITE" },
  { avant: ["isolation", "ite", "iti", "menuiserie", "menuiseries"], apres: ["chaudiere", "pac", "pompe a chaleur", "generateur"], libelle: "Isolation avant le changement de générateur" },
];

/** Charge annuelle par logement au-delà de laquelle on signale (C16). */
export const CHARGE_ANNUELLE_MAX_PAR_LOGEMENT = 5000;

/** Total du plan par logement sur 10 ans : bornes de vraisemblance (P07). */
export const TOTAL_PAR_LOGEMENT = { min: 1000, max: 80000 };

/** Surface par logement (P13). */
export const SURFACE_PAR_LOGEMENT = { min: 20, max: 200 };

/** Fonds travaux (R18 / P22). */
export const FONDS_TRAVAUX = { cotisationMinPctPlan: 2.5, cotisationMinPctBudget: 5, couvertureMinPremiereAnnee: 0.5 };

export const SEVERITE_LABEL: Record<string, string> = {
  bloquant: "Bloquant",
  majeur: "Majeur",
  mineur: "Mineur",
  info: "Info",
};

export const STATUT_CONTROLE_LABEL: Record<string, string> = {
  conforme: "Conforme",
  non_conforme: "Non conforme",
  partiel: "Partiel",
  non_verifiable: "Non vérifiable",
  sans_objet: "Sans objet",
};

export const VERDICT_LABEL: Record<string, string> = {
  EXPLOITABLE: "Exploitable",
  EXPLOITABLE_AVEC_RESERVES: "Exploitable avec réserves",
  A_REPRENDRE: "À reprendre",
  NON_PPPT: "Ce n'est pas un PPPT",
};

export const STATUT_RAPPORT_LABEL: Record<string, string> = {
  depose: "Déposé",
  en_analyse: "En analyse",
  a_relire: "À relire",
  valide: "Validé",
  rejete: "Rejeté",
  echec: "Échec",
};

export const STATUT_POSTE_LABEL: Record<string, string> = {
  programme: "Programmé",
  presente: "Présenté en AG",
  vote: "Voté",
  rejete: "Rejeté",
  reporte: "Reporté",
  realise: "Réalisé",
  abandonne: "Abandonné",
};

export const ISSUE_LABEL: Record<string, string> = {
  adopte: "Adoptée",
  rejete: "Rejetée",
  reporte: "Reportée",
  non_presente: "Non présentée",
};

export const TYPE_RAPPORT_LABEL: Record<string, string> = {
  pppt: "PPPT",
  dpe_collectif: "DPE collectif",
  ppt_adopte: "PPT adopté",
  tableau_ppt: "Tableau PPT Strat Eco",
  pv_ag: "PV d'AG",
  autre: "Autre",
};

/** Article de la loi de 1965 suggéré selon la nature du poste : conservation de
 *  l'immeuble, santé et sécurité des occupants → art. 24 ; énergétique et
 *  amélioration → art. 25. */
export function articleSuggere(priorite: string): "24" | "25" {
  return priorite === "preservation" || priorite === "securite" || priorite === "sante" ? "24" : "25";
}

/** Minuscules sans accents, pour la reconnaissance par mots-clés. */
export function normaliser(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Mots qui excluent le mot-clé qui les suit : « reprises en façades hors ITE ». */
const NEGATIONS = ["hors", "sans", "non compris", "exclu", "exclus", "exclue", "exclues", "hormis"];

/**
 * Vrai si le texte contient l'un des mots-clés, en mots entiers (accents et
 * casse ignorés). Avec `horsNegation`, une occurrence précédée d'une négation
 * (« hors ITE », « sans ravalement ») ne compte pas.
 */
export function contientUn(texte: string, mots: string[], options: { horsNegation?: boolean } = {}): boolean {
  const t = normaliser(texte);
  return mots.some((m) => {
    const mot = echapper(normaliser(m));
    const re = new RegExp(`(^|[^a-z0-9])${mot}([^a-z0-9]|$)`, "g");
    for (const trouve of t.matchAll(re)) {
      if (!options.horsNegation) return true;
      const avant = t.slice(0, trouve.index + trouve[1].length);
      if (!NEGATIONS.some((n) => new RegExp(`(^|[^a-z0-9])${echapper(n)}[^a-z0-9]+$`).test(avant))) return true;
    }
    return false;
  });
}
