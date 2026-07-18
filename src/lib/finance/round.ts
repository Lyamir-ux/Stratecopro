/** Arrondi monétaire au centime. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Arrondit une liste de montants au centime en préservant la somme :
 * l'écart d'arrondi résiduel est imputé à la plus grosse ligne
 * (technique classique de répartition — jamais de centime perdu).
 */
export function roundAllocate(values: number[]): number[] {
  if (values.length === 0) return [];
  const rounded = values.map(round2);
  const target = round2(values.reduce((a, b) => a + b, 0));
  const drift = round2(target - rounded.reduce((a, b) => round2(a + b), 0));
  if (drift !== 0) {
    let iMax = 0;
    for (let i = 1; i < rounded.length; i++) if (rounded[i] > rounded[iMax]) iMax = i;
    rounded[iMax] = round2(rounded[iMax] + drift);
  }
  return rounded;
}
