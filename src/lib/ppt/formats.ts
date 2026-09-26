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

/** Graduation « ronde » d'un axe en euros : pas de 1, 2, 2,5 ou 5 × 10^n, le plus fin qui tienne en 5 intervalles au plus
 *  (202 600 → 0 à 250 k€ par 50 k€) - graphiques d'honoraires, écran et PDF. */
export function echelleAxe(max: number, intervallesMax = 5): { haut: number; pas: number } {
  if (!(max > 0)) return { haut: 1000, pas: 250 };
  const mag = Math.pow(10, Math.floor(Math.log10(max / intervallesMax)));
  const pas = [1, 2, 2.5, 5, 10, 20].map((m) => m * mag).find((p) => Math.ceil(max / p - 1e-9) <= intervallesMax) ?? 20 * mag;
  return { haut: Math.ceil(max / pas - 1e-9) * pas, pas };
}

/** Montant d'étiquette de graphique : « 45,4 k€ » sous 100 k€, « 128 k€ » au-delà, « 1,2 M€ » au million. */
export const fmtKEur = (v: number): string => {
  if (v >= 1e6) return (v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " M€";
  if (v >= 1e3) return (v / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: v < 1e5 ? 1 : 0 }) + " k€";
  return Math.round(v).toLocaleString("fr-FR") + " €";
};
