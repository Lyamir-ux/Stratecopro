import { describe, expect, it } from "vitest";
import { computePlansIndividuelsPf, type CoproTantiemes, type ItemRepartitionPf } from "../repartitionPf";

const items: ItemRepartitionPf[] = [
  { id: "lot:1", libelle: "Lot 1 - ITE", montantTtc: 100000 },
  { id: "lot:2", libelle: "Lot 2 - Chauffage", montantTtc: 50000 },
  { id: "moe:0", libelle: "MOE phase travaux", montantTtc: 10000 },
];

const copros: CoproTantiemes[] = [
  { coproprietaireId: "a", nom: "Dupont", tantiemes: { GEN: 600, CHAUF: 300 } },
  { coproprietaireId: "b", nom: "Martin", tantiemes: { GEN: 400, CHAUF: 700 } },
];

const totauxCles = { GEN: 1000, CHAUF: 1000 };

describe("computePlansIndividuelsPf", () => {
  it("répartit tout suivant une clé unique", () => {
    const cleParItem = { "lot:1": "GEN", "lot:2": "GEN", "moe:0": "GEN" };
    const { plans, manquants } = computePlansIndividuelsPf({
      items,
      cleParItem,
      copros,
      totauxCles,
      totalAides: 0,
      fondsTravaux: 0,
      totalPhaseTravauxTtc: 160000,
    });
    expect(manquants).toHaveLength(0);
    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({ nom: "Dupont", quotePartAvant: 96000, reste: 96000 });
    expect(plans[1]).toMatchObject({ nom: "Martin", quotePartAvant: 64000, reste: 64000 });
  });

  it("répartit item par item suivant des clés différentes", () => {
    const cleParItem = { "lot:1": "GEN", "lot:2": "CHAUF", "moe:0": "GEN" };
    const { plans, manquants } = computePlansIndividuelsPf({
      items,
      cleParItem,
      copros,
      totauxCles,
      totalAides: 0,
      fondsTravaux: 0,
      totalPhaseTravauxTtc: 160000,
    });
    expect(manquants).toHaveLength(0);
    const dupont = plans.find((p) => p.nom === "Dupont")!;
    const martin = plans.find((p) => p.nom === "Martin")!;
    // Dupont : 60 % de 110 000 (GEN) + 30 % de 50 000 (CHAUF)
    expect(dupont.quotePartAvant).toBeCloseTo(66000 + 15000, 2);
    // Martin : 40 % de 110 000 + 70 % de 50 000
    expect(martin.quotePartAvant).toBeCloseTo(44000 + 35000, 2);
    // la somme des quotes-parts couvre le total
    expect(dupont.quotePartAvant + martin.quotePartAvant).toBeCloseTo(160000, 2);
  });

  it("déduit aides et fonds travaux au prorata de la quote-part", () => {
    const cleParItem = { "lot:1": "GEN", "lot:2": "GEN", "moe:0": "GEN" };
    const { plans } = computePlansIndividuelsPf({
      items,
      cleParItem,
      copros,
      totauxCles,
      totalAides: 40000,
      fondsTravaux: 8000,
      totalPhaseTravauxTtc: 160000,
    });
    const dupont = plans.find((p) => p.nom === "Dupont")!;
    // 96 000 × (48 000 / 160 000) = 28 800 d'aides et fonds
    expect(dupont.aidesEtFonds).toBeCloseTo(28800, 2);
    expect(dupont.reste).toBeCloseTo(96000 - 28800, 2);
  });

  it("signale les items sans clé choisie ou dont la clé n'a aucun tantième", () => {
    const cleParItem = { "lot:1": "GEN", "lot:2": "VIDE" };
    const { plans, manquants } = computePlansIndividuelsPf({
      items,
      cleParItem,
      copros,
      totauxCles: { GEN: 1000, VIDE: 0 },
      totalAides: 0,
      fondsTravaux: 0,
      totalPhaseTravauxTtc: 160000,
    });
    expect(manquants.map((m) => m.id)).toEqual(["lot:2", "moe:0"]);
    // les items affectés sont quand même répartis (plan partiel)
    expect(plans.find((p) => p.nom === "Dupont")?.quotePartAvant).toBeCloseTo(60000, 2);
  });
});
