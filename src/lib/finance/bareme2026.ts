import type { Bareme } from "./types";

/**
 * Barèmes Anah au 1ᵉʳ janvier 2026 - plafonds de ressources MaPrimeRénov'
 * (très modeste / modeste / intermédiaire ; au-delà : supérieur).
 * Le hors Île-de-France est le barème par défaut de l'app (zone Grand Est).
 * Primes individuelles et règles MPR Copro / éco-PTZ reconduites du barème 2024
 * en l'absence de nouvelle donnée.
 */
export const BAREME_2026_HORS_IDF: Bareme = {
  millesime: 2026,
  zone: "hors_idf",
  mprSeuils: {
    seuils: {
      1: [17363, 22259, 31185],
      2: [25393, 32553, 45842],
      3: [30540, 39148, 55196],
      4: [35676, 45735, 64550],
      5: [40835, 52348, 73907],
    },
    parPers: [5151, 6598, 9357],
  },
  primesIndiv: { Bleu: 3000, Jaune: 2250, Violet: 1500, Rose: 0 },
  mprCopro: {
    tauxStandard: 30,
    tauxMajore: 45,
    seuilMin: 35,
    seuilMajore: 50,
    bonusPassoire: 10,
  },
  ecoPtz: {
    plafondParLogement: 50000,
    dureeMin: 3,
    dureeMax: 20,
  },
};

export const BAREME_2026_IDF: Bareme = {
  ...BAREME_2026_HORS_IDF,
  zone: "idf",
  mprSeuils: {
    seuils: {
      1: [24031, 29253, 40851],
      2: [35270, 42933, 60051],
      3: [42357, 51564, 71846],
      4: [49455, 60208, 84562],
      5: [56580, 68877, 96817],
    },
    parPers: [7116, 8663, 12257],
  },
};
