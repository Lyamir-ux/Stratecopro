// Formats d'affichage des pourcentages de la branche PPT. Deux unités, jamais
// devinées d'après la valeur : une fraction (gain cumulé calculé, taux de
// couverture : 0.279 = 27,9 %) est multipliée par 100 au rendu ; un champ `_pct`
// du schéma est déjà en points (0.5 = 0,5 %) et s'affiche tel quel.

/** Fraction → % (0.279 = 27,9 %). */
export const fmtPct = (f: number | null | undefined): string =>
  f == null ? "-" : (f * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %";

/** Points de pourcentage → % sans conversion (0.5 = 0,5 % ; 23.8 = 23,8 %). */
export const fmtPoints = (p: number | null | undefined): string =>
  p == null ? "-" : p.toLocaleString("fr-FR", { minimumFractionDigits: p !== 0 && Math.abs(p) < 10 ? 1 : 0, maximumFractionDigits: 1 }) + " %";
