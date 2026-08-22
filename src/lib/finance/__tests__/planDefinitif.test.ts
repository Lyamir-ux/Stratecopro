// Non-régression du moteur « plan de financement définitif » contre le classeur
// de référence Les Violettes : chaque valeur attendue est la valeur calculée par Excel.
import { describe, expect, it } from "vitest";
import { computePlanDefinitif } from "../planDefinitif";
import { makeViolettes } from "./fixtureViolettes";

const r = computePlanDefinitif(makeViolettes());

describe("planDefinitif - lots de travaux", () => {
  it("reproduit chaque total de lot (HT, retenu, TTC)", () => {
    const attendus: [number, number, number, number][] = [
      // [numéro, HT après remise, HT retenu, TTC]
      [2, 49291.8, 0, 54220.98],
      [3, 340100.4446, 312258.38, 361658.6766],
      [4, 9485.25, 0, 10433.775],
      [5, 46725, 19568, 51397.5],
      [6, 68500.4, 68500.4, 72267.922],
      [7, 6785.64, 6785.64, 7158.8502],
      [8, 115503.06, 115503.06, 121855.7283],
      [9, 37119.77, 0, 40831.747],
      [10, 91592.72, 91592.72, 96630.3196],
    ];
    for (const [num, ht, retenu, ttc] of attendus) {
      const lot = r.lots.find((l) => l.numero === num)!;
      expect(lot.totalHtApresRemise, `lot ${num} HT`).toBeCloseTo(ht, 2);
      expect(lot.totalHtRetenu, `lot ${num} retenu`).toBeCloseTo(retenu, 2);
      expect(lot.totalTtc, `lot ${num} TTC`).toBeCloseTo(ttc, 2);
    }
  });

  it("détaille la TVA du lot 3 par taux (sur montants avant remise)", () => {
    const lot3 = r.lots.find((l) => l.numero === 3)!;
    expect(lot3.tvaParTaux.find((t) => t.taux === 10)!.montant).toBeCloseTo(5491.027, 2);
    expect(lot3.tvaParTaux.find((t) => t.taux === 5.5)!.montant).toBeCloseTo(16067.205, 2);
    expect(lot3.remise).toBeCloseTo(6940.8254, 2);
  });

  it("agrège les travaux et plafonne l'assiette MPR à 25 K€/logement", () => {
    expect(r.totalTravauxHt).toBeCloseTo(765104.0846, 2);
    expect(r.travauxRetenusHt).toBeCloseTo(614208.2, 2); // au-dessus du plafond
    expect(r.assietteMprTravaux).toBeCloseTo(600000, 2); // 25 000 × 24
    expect(r.totalTravauxTtc).toBeCloseTo(816455.4987, 2);
    expect(r.totalTravauxTtcImprevus).toBeCloseTo(873607.3836, 2);
  });
});

describe("planDefinitif - MOE et frais annexes", () => {
  it("calcule les lignes en % des travaux (MOE travaux, syndic, dommage-ouvrage)", () => {
    const byName = (n: string) => r.moe.find((l) => l.designation === n)!;
    expect(byName("Maîtrise d'œuvre phase travaux").montantTtc).toBeCloseTo(44395.16451, 2);
    expect(byName("Honoraires syndic").montantTtc).toBeCloseTo(34000.00135, 2);
    expect(byName("Dommage ouvrage").montantTtc).toBeCloseTo(15512.65448, 2);
  });

  it("totalise MOE, opération et phase travaux", () => {
    expect(r.totalMoeTtc).toBeCloseTo(148326.6203, 2);
    expect(r.totalOperationTtc).toBeCloseTo(1021934.004, 2);
    expect(r.totalPhaseTravauxTtc).toBeCloseTo(979619.6039, 2);
  });
});

describe("planDefinitif - aides", () => {
  const aide = (id: string) => r.aides.find((a) => a.id === id)!;

  it("reproduit chaque aide du classeur", () => {
    expect(aide("cee").montant).toBeCloseTo(35487.72, 2); // 1460,4 m² × 27 € × 0,9
    expect(aide("mpr-travaux").montant).toBeCloseTo(243000, 2); // 45 % × 0,9 × 600 000
    expect(aide("mpr-etudes").montant).toBeCloseTo(22130.86615, 2); // prorata énergétique
    expect(aide("mpr-amo").montant).toBeCloseTo(7200, 2); // 50 % de 14 400 HT
    expect(aide("climaxion-travaux").montant).toBeCloseTo(82500, 2); // 10 000 + 29 × 2 500
    expect(aide("ems-travaux").montant).toBeCloseTo(29000, 2);
    expect(aide("ems-moe").montant).toBeCloseTo(15000, 2);
    expect(aide("ems-amo").montant).toBeCloseTo(3000, 2);
    expect(aide("ems-bbc").montant).toBeCloseTo(12000, 2); // 500 × 24
    expect(aide("mpr-indiv").montant).toBeNull(); // ligne informative
  });

  it("totalise aides nettes et aides publiques (CEE exclue)", () => {
    expect(r.totalAides).toBeCloseTo(449318.5862, 2);
    expect(r.totalAidesPubliques).toBeCloseTo(413830.8662, 2);
    expect(r.primeCee).toBeCloseTo(35487.72, 2);
  });
});

describe("planDefinitif - variante éco-PTZ collectif + avance de subventions", () => {
  it("calcule couverture, reste à charge et reste à financer", () => {
    expect(r.tauxCouverture).toBeCloseTo(0.4586663888, 6);
    expect(r.resteACharge).toBeCloseTo(524659.3578, 2);
    expect(r.collectif.resteAFinancer).toBeCloseTo(560147.0778, 2);
    expect(r.coutTantiemeAvant).toBeCloseTo(97.96196039, 4);
    expect(r.collectif.coutTantiemeApres).toBeCloseTo(56.01470778, 4);
  });

  it("reproduit les exemples par tantièmes (310 / 348 / 386)", () => {
    const [e310, e348, e386] = r.collectif.exemples;
    expect(e310.quotePartAvant).toBeCloseTo(30368.20772, 2);
    expect(e348.quotePartAvant).toBeCloseTo(34090.76222, 2);
    expect(e386.quotePartAvant).toBeCloseTo(37813.31671, 2);
    expect(e310.resteAFinancer).toBeCloseTo(17364.55941, 2);
    expect(e310.mensualiteEcoPtz).toBeCloseTo(74.52290081, 4);
    expect(e348.mensualiteEcoPtz).toBeCloseTo(83.65796607, 4);
    expect(e386.mensualiteEcoPtz).toBeCloseTo(92.79303133, 4);
    expect(e310.subventionsPubliques).toBeCloseTo(12828.75685, 2);
    expect(e310.coutPretAvance).toBeCloseTo(699.1672484, 3); // 5,45 % des aides publiques
    expect(e310.primeCee).toBeCloseTo(1100.11932, 3);
    expect(e310.prixRevient).toBeCloseTo(16963.60734, 2);
    expect(e348.prixRevient).toBeCloseTo(19043.01727, 2);
    expect(e386.prixRevient).toBeCloseTo(21122.4272, 2);
  });
});

describe("planDefinitif - variante éco-PTZ collectif sans avance de subventions", () => {
  it("reprend les montants du collectif sans le coût d'avance", () => {
    // mêmes montants financés que la variante avec avance…
    expect(r.collectifSansAvance.resteAFinancer).toBeCloseTo(r.collectif.resteAFinancer, 6);
    expect(r.collectifSansAvance.coutTantiemeApres).toBeCloseTo(r.collectif.coutTantiemeApres, 6);
    const [s310] = r.collectifSansAvance.exemples;
    const [e310] = r.collectif.exemples;
    expect(s310.resteAFinancer).toBeCloseTo(e310.resteAFinancer, 6);
    expect(s310.mensualiteEcoPtz).toBeCloseTo(e310.mensualiteEcoPtz, 6);
    // …mais le prix de revient baisse exactement du coût du prêt d'avance (5,45 %)
    expect(s310.prixRevient).toBeCloseTo(e310.prixRevient - e310.coutPretAvance, 6);
    expect(s310.prixRevient).toBeCloseTo(16264.44009, 2);
  });
});

describe("planDefinitif - variante éco-PTZ individuel (70 % / 30 %)", () => {
  it("calcule les appels de fonds avec 70 % des aides déduites", () => {
    expect(r.individuel.aidesAvancees).toBeCloseTo(289681.6063, 2);
    expect(r.individuel.aidesFinChantier).toBeCloseTo(124149.2598, 2);
    expect(r.individuel.appelsFonds).toBeCloseTo(684296.3376, 2);
    expect(r.individuel.coutTantiemeApresAides).toBeCloseTo(52.46593578, 4);
    expect(r.individuel.coutTantiemeAvecAvance).toBeCloseTo(68.42963376, 4);
  });

  it("reproduit les exemples par tantièmes", () => {
    const [e310, e348, e386] = r.individuel.exemples;
    expect(e310.prixRevient).toBeCloseTo(16264.44009, 2);
    expect(e348.prixRevient).toBeCloseTo(18258.14565, 2);
    expect(e386.prixRevient).toBeCloseTo(20251.85121, 2);
    expect(e310.appelsFonds).toBeCloseTo(21213.18647, 2);
    expect(e310.remboursementFinChantier).toBeCloseTo(4948.746375, 2);
    expect(e310.mensualiteEcoPtz).toBeCloseTo(91.03992525, 4);
    expect(e348.mensualiteEcoPtz).toBeCloseTo(102.199658, 4);
    expect(e386.mensualiteEcoPtz).toBeCloseTo(113.3593908, 4);
  });
});

describe("planDefinitif - garde-fous et divers", () => {
  it("vérifie les trois garde-fous du classeur", () => {
    const [travaux, mpr, amo] = r.gardeFous;
    expect(travaux.valeur).toBeCloseTo(25000, 2);
    expect(travaux.ok).toBe(true);
    expect(mpr.valeur).toBeCloseTo(10125, 2);
    expect(mpr.ok).toBe(true);
    expect(amo.valeur).toBeCloseTo(600, 2);
    expect(amo.ok).toBe(true);
  });

  it("calcule la performance énergétique", () => {
    expect(r.performancePct).toBeCloseTo(63.02816901, 4);
  });
});
