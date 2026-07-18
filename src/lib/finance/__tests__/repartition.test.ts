import { describe, expect, it } from "vitest";
import { computeFinance } from "../compute";
import { computePlansIndividuels } from "../repartition";
import { round2, roundAllocate } from "../round";
import { BAREME_2024_HORS_IDF as B } from "../bareme2024";
import type { FinanceParams, OwnerInput } from "../types";

const params: FinanceParams = {
  travaux: 327944.81,
  honoraires: 92156.67,
  aleas: 34000,
  cle: "tantiemes",
  mprCoproPct: 30,
  bonusPassoire: false,
  cee: 21366,
  fonds: 41283,
  profils: { Bleu: 4, Jaune: 5, Violet: 3, Rose: 2 },
  primeIndiv: B.primesIndiv,
  ecoPtz: true,
  ecoPtzDuree: 15,
  ecoPtzPct: 100,
  avancePct: 70,
  pretComplActif: false,
  pretComplDuree: 12,
};

const ctx = { lots: 40, lotsHab: 14 };

/** 5 copropriétaires couvrant la clé complète (Σ = 1000 ‰). */
const owners: OwnerInput[] = [
  { id: "o1", nom: "Copropriétaire 1", profil: "Jaune", lots: [{ id: "l1", num: "3", usage: "habitation", tantiemes: 220 }] },
  { id: "o2", nom: "Copropriétaire 2", profil: "Bleu", lots: [{ id: "l2", num: "7", usage: "habitation", tantiemes: 180 }] },
  {
    id: "o3",
    nom: "Copropriétaire 3",
    profil: "Violet",
    lots: [
      { id: "l3", num: "11", usage: "habitation", tantiemes: 200 },
      { id: "l4", num: "12", usage: "garage", tantiemes: 30 },
    ],
  },
  { id: "o4", nom: "Copropriétaire 4", profil: null, lots: [{ id: "l5", num: "14", usage: "habitation", tantiemes: 170 }] },
  { id: "o5", nom: "Copropriétaire 5", profil: "Rose", lots: [{ id: "l6", num: "18", usage: "habitation", tantiemes: 200 }] },
];

describe("computePlansIndividuels", () => {
  const d = computeFinance(params, ctx, B);
  const { plans, totals } = computePlansIndividuels(params, d, owners, B);

  it("invariant : Σ quote-parts = coût total (clé couverte à 1000 ‰, au centime près)", () => {
    expect(totals.quotePart).toBeCloseTo(round2(d.coutTotal), 2);
  });

  it("invariant : Σ CEE répartis = CEE du scénario ; Σ subv. collectives = MPR Copro + fonds", () => {
    expect(totals.cee).toBeCloseTo(round2(params.cee), 2);
    expect(totals.subvColl).toBeCloseTo(round2(d.mprCopro + params.fonds), 2);
  });

  it("chaque ligne est cohérente : reste = quote-part − aides − éco-PTZ", () => {
    for (const r of plans) {
      const resteAvant = Math.max(0, round2(r.quotePart - r.mprIndiv - r.cee - r.subvColl));
      expect(r.resteACharge).toBeCloseTo(round2(resteAvant - r.ecoPtz), 2);
    }
  });

  it("copropriétaire multi-lots : tantièmes additionnés (200 + 30 = 230)", () => {
    const o3 = plans.find((r) => r.ownerId === "o3")!;
    expect(o3.tantiemes).toBe(230);
    expect(o3.quotePart).toBeCloseTo(d.coutTotal * 0.23, 1);
  });

  it("profil null (enquête non répondue) → MPR individuelle 0", () => {
    const o4 = plans.find((r) => r.ownerId === "o4")!;
    expect(o4.mprIndiv).toBe(0);
  });

  it("prime du profil appliquée telle quelle (forfait, pas de prorata)", () => {
    expect(plans.find((r) => r.ownerId === "o2")!.mprIndiv).toBe(3000);
    expect(plans.find((r) => r.ownerId === "o5")!.mprIndiv).toBe(0);
  });

  it("éco-PTZ individuel plafonné à 50 000 € par logement du copropriétaire", () => {
    // Copropriétaire sans lot habitation → plafond 0 → pas d'éco-PTZ
    const garageOnly: OwnerInput[] = [
      { id: "g1", nom: "Garage seul", profil: null, lots: [{ id: "lg", num: "99", usage: "garage", tantiemes: 1000 }] },
    ];
    const r = computePlansIndividuels(params, d, garageOnly, B).plans[0];
    expect(r.ecoPtz).toBe(0);
    expect(r.resteACharge).toBeGreaterThan(0);
  });

  it("mensualité = éco-PTZ / (durée × 12)", () => {
    const o1 = plans.find((r) => r.ownerId === "o1")!;
    expect(o1.mensualite).toBeCloseTo(round2(o1.ecoPtz / (15 * 12)), 2);
  });

  it("liste vide → totaux à zéro, pas d'erreur", () => {
    const empty = computePlansIndividuels(params, d, [], B);
    expect(empty.plans).toHaveLength(0);
    expect(empty.totals.quotePart).toBe(0);
  });

  it("totalCle invalide → erreur explicite", () => {
    expect(() => computePlansIndividuels(params, d, owners, B, 0)).toThrow();
  });
});

describe("roundAllocate", () => {
  it("préserve la somme au centime près (le drift va à la plus grosse ligne)", () => {
    const vals = [100.005, 200.005, 300.005];
    const out = roundAllocate(vals);
    const target = round2(vals.reduce((a, b) => a + b, 0));
    expect(round2(out.reduce((a, b) => a + b, 0))).toBe(target);
  });

  it("tiers de 100 € : 33,33 + 33,33 + 33,34 = 100,00", () => {
    const out = roundAllocate([100 / 3, 100 / 3, 100 / 3]);
    expect(round2(out.reduce((a, b) => a + b, 0))).toBe(100);
  });

  it("liste vide → liste vide", () => {
    expect(roundAllocate([])).toEqual([]);
  });
});
