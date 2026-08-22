// Classement d'un foyer en profil MaPrimeRénov' - port de determineProfil (design-reference/project/data.js).
import type { Bareme, Profil } from "./types";

export function determineProfil(persons: number, rfr: number, bareme: Bareme): Profil {
  const n = Math.max(1, Math.trunc(persons));
  const { seuils, parPers } = bareme.mprSeuils;
  let s: [number, number, number] = seuils[Math.min(n, 5) as 1 | 2 | 3 | 4 | 5];
  if (n > 5) {
    const base = seuils[5];
    const extra = n - 5;
    s = [base[0] + parPers[0] * extra, base[1] + parPers[1] * extra, base[2] + parPers[2] * extra];
  }
  if (rfr <= s[0]) return "Bleu";
  if (rfr <= s[1]) return "Jaune";
  if (rfr <= s[2]) return "Violet";
  return "Rose";
}
