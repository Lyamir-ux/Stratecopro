import { describe, expect, it } from "vitest";
import { computeFinance, isPassoire, suggestMprCoproPct } from "../compute";
import { BAREME_2024_HORS_IDF as B } from "../bareme2024";
import type { FinanceParams } from "../types";

const baseParams: FinanceParams = {
  travaux: 0,
  honoraires: 0,
  aleas: 0,
  cle: "tantiemes",
  mprCoproPct: 30,
  bonusPassoire: false,
  cee: 0,
  fonds: 0,
  profils: { Bleu: 0, Jaune: 0, Violet: 0, Rose: 0 },
  primeIndiv: B.primesIndiv,
  ecoPtz: true,
  ecoPtzDuree: 15,
  ecoPtzPct: 100,
  avancePct: 70,
  pretComplActif: false,
  pretComplDuree: 12,
};

describe("golden — dossier Renaissance (doc AMOA Pro)", () => {
  // Scénario « Rénovation > 35 % » : gain 35-50 %, classe E (pas de bonus passoire)
  const p: FinanceParams = {
    ...baseParams,
    travaux: 327944.81,
    honoraires: 92156.67,
    aleas: 34000,
    cee: 21366,
    fonds: 41283,
  };
  const d = computeFinance(p, { lots: 40, lotsHab: 14 }, B);

  it("coût total de l'opération = 454 101,48 € TTC", () => {
    expect(d.coutTotal).toBeCloseTo(454101.48, 2);
  });

  it("MPR Copro à 30 % des travaux = 98 383,44 €", () => {
    expect(d.mprCopro).toBeCloseTo(98383.44, 2);
  });

  it("aides collectives (MPR + CEE + fonds) = 161 032,44 €", () => {
    expect(d.aidesColl).toBeCloseTo(161032.44, 2);
  });

  it("identité du doc : déductions 187 727,40 € = aides collectives + 26 694,96 € d'aides individuelles réelles", () => {
    // Les aides individuelles du dossier réel (26 694,96 €) viennent de l'enquête sociale,
    // pas des primes forfaitaires — on vérifie l'identité comptable du document.
    expect(d.aidesColl + 26694.96).toBeCloseTo(187727.4, 2);
  });

  it("subventions préfinançables du doc = MPR Copro + aides individuelles réelles", () => {
    expect(d.mprCopro + 26694.96).toBeCloseTo(125078.4, 2);
  });
});

describe("computeFinance — règles unitaires", () => {
  it("bonus passoire : +10 points sur le taux MPR Copro", () => {
    const p = { ...baseParams, travaux: 100000, bonusPassoire: true };
    const d = computeFinance(p, { lots: 10, lotsHab: 10 }, B);
    expect(d.tauxMpr).toBeCloseTo(0.4);
    expect(d.mprCopro).toBeCloseTo(40000);
  });

  it("aides individuelles = Σ (nb logements par profil × prime)", () => {
    const p = { ...baseParams, travaux: 500000, profils: { Bleu: 2, Jaune: 3, Violet: 1, Rose: 4 } };
    const d = computeFinance(p, { lots: 10, lotsHab: 10 }, B);
    expect(d.aidesIndiv).toBe(2 * 3000 + 3 * 2250 + 1 * 1500 + 0);
  });

  it("éco-PTZ plafonné à 50 000 € × logements habitation", () => {
    const p = { ...baseParams, travaux: 700000 };
    const d = computeFinance(p, { lots: 20, lotsHab: 10 }, B);
    // reste avant prêt = 700000 − 210000 (MPR 30 %) = 490000 ; plafond = 500000 → non plafonné
    expect(d.ecoPtzMontant).toBeCloseTo(490000);
    const d2 = computeFinance({ ...p, travaux: 900000 }, { lots: 20, lotsHab: 10 }, B);
    // reste = 900000 − 270000 = 630000 > plafond 500000 → plafonné
    expect(d2.ecoPtzMontant).toBe(500000);
    expect(d2.resteACharge).toBeCloseTo(130000);
  });

  it("éco-PTZ désactivé → aucun prêt mobilisé, reste à charge plein", () => {
    const p = { ...baseParams, travaux: 100000, ecoPtz: false };
    const d = computeFinance(p, { lots: 10, lotsHab: 10 }, B);
    expect(d.ecoPtzMontant).toBe(0);
    expect(d.resteACharge).toBeCloseTo(70000);
  });

  it("mensualité = montant éco-PTZ / (durée × 12)", () => {
    const p = { ...baseParams, travaux: 100000, ecoPtzDuree: 20 };
    const d = computeFinance(p, { lots: 10, lotsHab: 10 }, B);
    expect(d.mensualiteEcoPtz).toBeCloseTo(70000 / 240, 6);
  });

  it("copropriété vide : aucun NaN / Infinity", () => {
    const d = computeFinance(baseParams, { lots: 0, lotsHab: 0 }, B);
    expect(d.coutTotal).toBe(0);
    expect(d.parLot).toBe(0);
    expect(d.tauxAides).toBe(0);
    expect(Number.isFinite(d.mensualiteEcoPtz)).toBe(true);
  });

  it("les aides ne rendent jamais le reste négatif", () => {
    const p = { ...baseParams, travaux: 10000, cee: 50000 };
    const d = computeFinance(p, { lots: 5, lotsHab: 5 }, B);
    expect(d.resteAvantPret).toBe(0);
    expect(d.resteACharge).toBe(0);
  });
});

describe("suggestMprCoproPct / isPassoire", () => {
  it("gain < 35 % → non éligible (null)", () => {
    expect(suggestMprCoproPct(34.9, B)).toBeNull();
  });
  it("gain 35-50 % → 30 %", () => {
    expect(suggestMprCoproPct(35, B)).toBe(30);
    expect(suggestMprCoproPct(49.9, B)).toBe(30);
  });
  it("gain ≥ 50 % → 45 %", () => {
    expect(suggestMprCoproPct(50, B)).toBe(45);
    expect(suggestMprCoproPct(72, B)).toBe(45);
  });
  it("passoire = F ou G uniquement", () => {
    expect(isPassoire("F")).toBe(true);
    expect(isPassoire("G")).toBe(true);
    expect(isPassoire("E")).toBe(false);
    expect(isPassoire(null)).toBe(false);
  });
});
