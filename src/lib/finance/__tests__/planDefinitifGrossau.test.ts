// PF définitif Grossau : valeurs attendues = valeurs calculées par Excel dans
// « Plan de financement définitif Grossau.xlsx » (onglet « PF définitif ACT », colonne D).
import { describe, expect, it } from "vitest";
import { computePlanDefinitif } from "../planDefinitif";
import { makeGrossau } from "./fixtureGrossau";

const r = computePlanDefinitif(makeGrossau());
/** Montant arrondi au centime, tel qu'affiché (aides manuelles saisies au centime). */
const c = (n: number) => Math.round(n * 100) / 100;

describe("PF définitif Grossau - travaux", () => {
  it("reproduit les totaux des onglets de lots (HT hors imprévus, retenu, TTC avec imprévus)", () => {
    const attendus: [number, number, number, number][] = [
      [1, 21329, 21329, 26194.8],
      [2, 100221.8, 96113.8, 115995.17],
      [3, 14276, 14276, 16561.18],
      [4, 49070.6, 49070.6, 55398.14],
      [5, 4986, 4986, 5984.6],
      [6, 22632, 22632, 28736.08],
      [7, 70973.49, 40300.76, 85763.42],
    ];
    for (const [numero, ht, retenu, ttc] of attendus) {
      const lot = r.lots.find((x) => x.numero === numero)!;
      expect(lot.totalHtApresRemise).toBeCloseTo(ht, 2);
      expect(lot.totalHtRetenu).toBeCloseTo(retenu, 2);
      expect(lot.totalTtc).toBeCloseTo(ttc, 1);
    }
  });

  it("garde les imprévus hors de la base des honoraires en % (D27, D29, D32)", () => {
    expect(r.totalTravauxHt).toBeCloseTo(283488.89, 2);
    expect(r.assietteMprTravaux).toBeCloseTo(248708.16, 2);
    expect(r.totalTravauxTtcImprevus).toBeCloseTo(334633.39, 2);
  });
});

describe("PF définitif Grossau - MOE, aides et financement", () => {
  it("reproduit la MOE et le total de l'opération (D45, D50, D52, D55)", () => {
    const ttc = (designation: string) => r.moe.find((m) => m.designation === designation)!.montantTtc;
    expect(ttc("Maîtrise d'œuvre phase travaux")).toBeCloseTo(14056.79661, 4);
    expect(ttc("Honoraires syndic")).toBeCloseTo(15648.58673, 4);
    expect(r.totalMoeTtc).toBeCloseTo(96716.17934, 4);
    expect(r.totalOperationTtc).toBeCloseTo(431349.5693, 2);
  });

  it("reproduit chaque aide du classeur (D60 à D72)", () => {
    const attendus: Record<string, number> = {
      cee: 22714,
      "mpr-travaux": 100726.8048,
      "mpr-etudes": 18225.19,
      "mpr-amo": 5059.998333,
      "mpr-bonus-passoire": 24870.816,
      "climaxion-travaux": 37500,
      "climaxion-ecs-solaire": 19440,
      "ems-travaux": 11000,
      "ems-moe": 9607.95,
      "ems-amo": 1500,
    };
    for (const [id, montant] of Object.entries(attendus))
      expect(r.aides.find((a) => a.id === id)!.montant).toBeCloseTo(montant, 2);
    expect(c(r.totalAides)).toBe(250644.76);
    expect(r.primeCee).toBeCloseTo(22714, 2);
    expect(r.tauxCouverture).toBeCloseTo(0.5810710877, 6);
  });

  it("reproduit le reste à charge, le reste à financer et les exemples (D79 à D106)", () => {
    expect(c(r.resteACharge)).toBe(129538.36);
    expect(c(r.collectif.resteAFinancer)).toBe(152252.36);
    const [e43, e114, e204] = r.collectif.exemples;
    expect(e204.quotePartAvant).toBeCloseTo(87995.31215, 2);
    expect(e204.mensualiteEcoPtz).toBeCloseTo(133.2969376, 3);
    expect(e114.mensualiteEcoPtz).toBeCloseTo(74.48946513, 3);
    expect(e43.mensualiteEcoPtz).toBeCloseTo(28.09690351, 3);
    expect(e204.coutPretAvance).toBeCloseTo(2534.134228, 2);
    expect(e204.primeCee).toBeCloseTo(4633.656, 2);
  });

  it("applique le plafond AMO de 1 000 €/logt d'une copropriété de 20 logements ou moins", () => {
    const [travaux, mpr, amo] = r.gardeFous;
    expect(travaux.valeur).toBeCloseTo(22609.83273, 4);
    expect(mpr.valeur).toBeCloseTo(9156.982255, 4);
    expect(amo.valeur).toBeCloseTo(919.999697, 4);
    expect(amo.plafond).toBe(1000);
    expect(r.gardeFous.every((g) => g.ok)).toBe(true);
  });
});
