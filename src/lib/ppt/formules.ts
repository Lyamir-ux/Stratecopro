// Formules du tableau PPT Strat Eco, recalculées côté plateforme pour que les
// tableaux de bord concordent avec le classeur produit par le skill :
//   TTC d'un poste prévu en AN+k = HT × (1+inflation)^k × (1 + TVA + [MOE si préservation] + syndic)
//   gain cumulé à l'année N = 1 - Π(1 - g_i) sur les postes énergétiques réalisés jusqu'à N
//   Cep après = Cep base × (1 - gain)
// Fonctions pures, testées (formules.test.ts).

import { codePriorite, type PrioriteCode, Etiquette, ParametresPpt, PpptVerifJson } from "./schema";
import { SEUILS_CEP } from "./referentiels";

export interface ParametresCalcul {
  anneeBase: number;
  /** fractions (0.035 = 3,5 %) */
  inflation: number;
  tvaFacades: number;
  tvaEnergetique: number;
  moe: number;
  syndic: number;
  cepBase: number | null;
}

/** Paramètres d'un cabinet tels que stockés (pourcentages). */
export interface ParametresOrg {
  taux_honoraires_pct: number;
  base_honoraires: "ht" | "ttc";
  inflation_pct: number;
  moe_pct: number;
  syndic_pct: number;
  tva_facades_pct: number;
  tva_energetique_pct: number;
}

export const PARAMETRES_ORG_DEFAUT: ParametresOrg = {
  taux_honoraires_pct: 3,
  base_honoraires: "ttc",
  inflation_pct: 3.5,
  moe_pct: 6,
  syndic_pct: 3,
  tva_facades_pct: 10,
  tva_energetique_pct: 5.5,
};

/** Poste minimal pour les formules (colonne du tableau ou ligne de ppt_postes). */
export interface PosteCalcul {
  cout_ht_base: number | null;
  tva_pct: number | null;
  avec_moe: boolean;
  annee_prevue: number | null;
  annee_prochaine_presentation?: number | null;
  gain_energetique_pct: number | null;
  priorite: PrioriteCode;
  statut?: string;
  /** Montant TTC saisi à la main par le syndic (0074) : prime sur le TTC actualisé. */
  montant_syndic?: number | null;
}

/** Paramètres de calcul : le JSON du skill prime (il porte l'année de base), l'enseigne complète. */
export function parametresDepuisJson(p: ParametresPpt | null | undefined, org: ParametresOrg = PARAMETRES_ORG_DEFAUT): ParametresCalcul {
  return {
    anneeBase: p?.annee_base ?? new Date().getFullYear(),
    inflation: p?.inflation ?? org.inflation_pct / 100,
    tvaFacades: p?.tva_facades_toitures ?? org.tva_facades_pct / 100,
    tvaEnergetique: p?.tva_energetique ?? org.tva_energetique_pct / 100,
    moe: p?.honoraires_moe ?? org.moe_pct / 100,
    syndic: p?.honoraires_syndic ?? org.syndic_pct / 100,
    cepBase: p?.cep_base_kwhep_m2_an ?? null,
  };
}

export function parametresDepuisOrg(org: ParametresOrg, anneeBase: number, cepBase: number | null = null): ParametresCalcul {
  return parametresDepuisJson({ annee_base: anneeBase, premiere_annee: anneeBase + 1, horizon: 10, inflation: org.inflation_pct / 100, tva_facades_toitures: org.tva_facades_pct / 100, tva_energetique: org.tva_energetique_pct / 100, honoraires_moe: org.moe_pct / 100, honoraires_syndic: org.syndic_pct / 100, cep_base_kwhep_m2_an: cepBase }, org);
}

/** Année où le poste est réellement attendu : nouvelle présentation si rejeté / reporté, sinon année prévue. */
export function anneeEffective(p: Pick<PosteCalcul, "annee_prevue" | "annee_prochaine_presentation">): number | null {
  return p.annee_prochaine_presentation ?? p.annee_prevue ?? null;
}

/** Rang k de l'année dans le tableau (AN+1 = 1) ; jamais négatif. */
export function rang(annee: number, anneeBase: number): number {
  return Math.max(0, annee - anneeBase);
}

/** TTC d'un poste : montant saisi par le syndic s'il existe, sinon TTC actualisé
 *  (formule du classeur), null si coût absent. */
export function montantTtcPoste(p: PosteCalcul, params: ParametresCalcul, annee: number | null = anneeEffective(p)): number | null {
  if (p.montant_syndic != null) return p.montant_syndic;
  if (p.cout_ht_base == null || annee == null) return null;
  const k = rang(annee, params.anneeBase);
  const tva = (p.tva_pct ?? (p.priorite === "energetique" ? params.tvaEnergetique * 100 : params.tvaFacades * 100)) / 100;
  const majorations = 1 + tva + (p.avec_moe ? params.moe : 0) + params.syndic;
  return arrondi(p.cout_ht_base * Math.pow(1 + params.inflation, k) * majorations);
}

/** HT actualisé (sans TVA ni honoraires) - assiette « ht » des honoraires. */
export function montantHtActualise(p: PosteCalcul, params: ParametresCalcul, annee: number | null = anneeEffective(p)): number | null {
  if (p.cout_ht_base == null || annee == null) return null;
  return arrondi(p.cout_ht_base * Math.pow(1 + params.inflation, rang(annee, params.anneeBase)));
}

/** Honoraires de suivi de travaux attendus sur un poste. */
export function honorairesPoste(p: PosteCalcul, params: ParametresCalcul, org: ParametresOrg): number | null {
  const assiette = org.base_honoraires === "ht" ? montantHtActualise(p, params) : montantTtcPoste(p, params);
  return assiette == null ? null : arrondi(assiette * (org.taux_honoraires_pct / 100));
}

/** Gain énergétique composé des postes énergétiques réalisés jusqu'à l'année incluse. */
export function gainCumule(postes: PosteCalcul[], annee: number): number {
  let produit = 1;
  for (const p of postes) {
    const a = anneeEffective(p);
    if (p.priorite !== "energetique" || p.gain_energetique_pct == null || a == null || a > annee) continue;
    if (p.statut === "abandonne") continue;
    const g = p.gain_energetique_pct > 1 ? p.gain_energetique_pct / 100 : p.gain_energetique_pct;
    produit *= 1 - Math.min(0.95, Math.max(0, g));
  }
  return 1 - produit;
}

/** Gain composé d'une liste de gains (fractions ou pourcents). */
export function gainCompose(gains: (number | null | undefined)[]): number {
  let produit = 1;
  for (const g0 of gains) {
    if (g0 == null) continue;
    const g = g0 > 1 ? g0 / 100 : g0;
    produit *= 1 - Math.min(0.95, Math.max(0, g));
  }
  return 1 - produit;
}

export function cepApres(cepBase: number | null, gain: number): number | null {
  return cepBase == null ? null : arrondi(cepBase * (1 - gain), 1);
}

export function etiquetteDepuisCep(cep: number | null | undefined): Etiquette | null {
  if (cep == null || !Number.isFinite(cep)) return null;
  return SEUILS_CEP.find((s) => cep <= s.max)?.classe ?? "G";
}

/** Total TTC par année (clé = millésime) pour un jeu de postes. */
export function totauxParAnnee(postes: PosteCalcul[], params: ParametresCalcul): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of postes) {
    const a = anneeEffective(p);
    const v = montantTtcPoste(p, params);
    if (a == null || v == null) continue;
    m.set(a, arrondi((m.get(a) ?? 0) + v));
  }
  return m;
}

export function arrondi(n: number, decimales = 2): number {
  const f = Math.pow(10, decimales);
  return Math.round(n * f) / f;
}

/** Postes de calcul à partir des travaux normalisés du JSON. */
export function postesDepuisJson(json: PpptVerifJson): PosteCalcul[] {
  return (json.travaux_normalises ?? []).map((t) => ({
    cout_ht_base: t.cout_ht_base_eur,
    tva_pct: t.tva_pct,
    avec_moe: t.avec_moe,
    annee_prevue: t.annee_prevue,
    gain_energetique_pct: t.gain_energetique_pct,
    priorite: codePriorite(t.priorite),
  }));
}
