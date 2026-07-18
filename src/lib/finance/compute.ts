// Calculs collectifs du scénario — port généralisé de computeFinance (design-reference/project/ingenierie.jsx).
import type { Bareme, CoproContext, FinanceParams, FinanceResult } from "./types";
import { PROFILS } from "./types";

export function computeFinance(p: FinanceParams, ctx: CoproContext, bareme: Bareme): FinanceResult {
  const coutTotal = p.travaux + p.honoraires + p.aleas;
  const tauxMpr = (p.mprCoproPct + (p.bonusPassoire ? bareme.mprCopro.bonusPassoire : 0)) / 100;
  const mprCopro = p.travaux * tauxMpr;
  const aidesColl = mprCopro + p.cee + p.fonds;
  const aidesIndiv = PROFILS.reduce((sum, prof) => sum + (p.profils[prof] ?? 0) * (p.primeIndiv[prof] ?? 0), 0);
  const resteAvantPret = Math.max(0, coutTotal - aidesColl - aidesIndiv);
  const plafondEcoPtz = bareme.ecoPtz.plafondParLogement * (ctx.lotsHab || ctx.lots);
  const ecoPtzMontant = p.ecoPtz ? Math.min(resteAvantPret * (p.ecoPtzPct / 100), plafondEcoPtz) : 0;
  const pretsMobilises = ecoPtzMontant;
  const resteACharge = Math.max(0, resteAvantPret - pretsMobilises);
  const parLot = ctx.lots > 0 ? resteAvantPret / ctx.lots : 0;
  const mensualiteEcoPtz = p.ecoPtzDuree > 0 ? ecoPtzMontant / (p.ecoPtzDuree * 12) : 0;
  const tauxAides = coutTotal ? (aidesColl + aidesIndiv) / coutTotal : 0;
  return {
    coutTotal,
    tauxMpr,
    mprCopro,
    aidesColl,
    aidesIndiv,
    resteAvantPret,
    plafondEcoPtz,
    ecoPtzMontant,
    pretsMobilises,
    resteACharge,
    parLot,
    mensualiteEcoPtz,
    tauxAides,
  };
}

/**
 * Taux MPR Copro suggéré selon le gain énergétique.
 * Retourne null si le gain est sous le seuil d'éligibilité (35 % au barème 2024).
 */
export function suggestMprCoproPct(gainPct: number, bareme: Bareme): number | null {
  if (gainPct >= bareme.mprCopro.seuilMajore) return bareme.mprCopro.tauxMajore;
  if (gainPct >= bareme.mprCopro.seuilMin) return bareme.mprCopro.tauxStandard;
  return null;
}

/** Bonus « sortie de passoire » : étiquette F ou G avant travaux. */
export function isPassoire(energyBefore: string | null | undefined): boolean {
  return energyBefore === "F" || energyBefore === "G";
}
