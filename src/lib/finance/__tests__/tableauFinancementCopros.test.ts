// Tableau de financement de tous les copropriétaires (feedback Amir 05/10/2026) :
// les lignes doivent retomber sur les indicateurs du PF définitif (variante
// collectif avec avance, variante individuelle) et sur les exemples par tantième.
import { describe, expect, it } from "vitest";
import { computePlanDefinitif } from "../planDefinitif";
import { repartirPfDepuisLots, type LotPourRepartition } from "../repartitionPf";
import { tableauDepuisRepartition } from "../tableauFinancementCopros";
import { makeViolettes } from "./fixtureViolettes";

const lot = (cp: string, nom: string, mun: number): LotPourRepartition => ({
  coproprietaire_id: cp,
  coproprietaire: { nom },
  tantiemes: { MUN: mun },
});

// 1 000 millièmes : 400 / 350 / 250 - noms volontairement hors ordre alphabétique
const lots = [lot("a", "Marie MARTIN", 400), lot("b", "Paul DURAND", 350), lot("c", "Anne BERNARD", 250)];
const cles = [{ code: "MUN", is_default: true }];

const data = makeViolettes();
const pv = computePlanDefinitif(data);
const rep = repartirPfDepuisLots(data, pv, lots, cles);
const mois = data.params.dureeEcoPtzAns * 12;

describe("tableauDepuisRepartition - prêt collectif avec avance", () => {
  const t = tableauDepuisRepartition("collectif", data, rep);

  it("classe les copropriétaires par nom de famille et reprend les tantièmes de la clé", () => {
    expect(t.lignes.map((l) => l.nom)).toEqual(["Anne BERNARD", "Paul DURAND", "Marie MARTIN"]);
    expect(t.lignes.map((l) => l.tantiemes)).toEqual([250, 350, 400]);
    expect(t.avance).toBe(true);
    expect(t.cleRef).toBe("MUN");
    expect(t.totalCleRef).toBe(1000);
    expect(t.totaux.tantiemes).toBe(1000);
  });

  it("la somme des lignes retombe sur les indicateurs du PF", () => {
    expect(t.totaux.quotePartAvant).toBeCloseTo(pv.totalOperationTtc, 1);
    expect(t.totaux.resteAFinancer).toBeCloseTo(pv.collectif.resteAFinancer, 1);
    expect(t.totaux.primeCee).toBeCloseTo(pv.primeCee, 1);
    expect(t.totaux.coutPretAvance).toBeCloseTo((pv.totalAidesPubliques * data.params.tauxPretAvancePct) / 100, 1);
    expect(t.totaux.prixRevient).toBeCloseTo(
      pv.collectif.resteAFinancer - pv.primeCee + t.totaux.coutPretAvance,
      1
    );
    // la prime C2E, versée en fin de chantier, n'est pas déduite du reste à financer
    expect(t.totaux.remboursementFinChantier).toBe(0);
  });

  it("une ligne reprend les formules des exemples du PF (400 / 1 000 tantièmes)", () => {
    const martin = t.lignes.find((l) => l.nom === "Marie MARTIN")!;
    const part = 400 / 1000;
    expect(martin.quotePartAvant).toBeCloseTo(pv.totalOperationTtc * part, 1);
    expect(martin.resteAFinancer).toBeCloseTo(pv.collectif.resteAFinancer * part, 1);
    expect(martin.mensualite).toBeCloseTo(((pv.collectif.resteAFinancer * part) / mois) * data.params.coefAssurance, 1);
    expect(martin.coutPretAvance).toBeCloseTo(pv.totalAidesPubliques * (data.params.tauxPretAvancePct / 100) * part, 1);
    expect(martin.primeCee).toBeCloseTo(pv.primeCee * part, 1);
    expect(martin.prixRevient).toBeCloseTo(
      pv.collectif.resteAFinancer * part - pv.primeCee * part + martin.coutPretAvance,
      1
    );
  });

  it("variante sans avance de subventions seule : aucun coût d'avance", () => {
    const sans = { ...data, variantes: { collectif: false, collectifSansAvance: true, individuel: false } };
    const ts = tableauDepuisRepartition("collectif", sans, rep);
    expect(ts.avance).toBe(false);
    expect(ts.totaux.coutPretAvance).toBe(0);
    expect(ts.totaux.prixRevient).toBeCloseTo(pv.collectif.resteAFinancer - pv.primeCee, 1);
  });

  it("durée nulle : mensualité à 0, pas de division par zéro", () => {
    const zero = { ...data, params: { ...data.params, dureeEcoPtzAns: 0 } };
    const tz = tableauDepuisRepartition("collectif", zero, rep);
    expect(tz.lignes.every((l) => l.mensualite === 0)).toBe(true);
  });
});

describe("tableauDepuisRepartition - éco-PTZ individuel", () => {
  const t = tableauDepuisRepartition("individuel", data, rep);

  it("la somme des lignes retombe sur les appels de fonds et le prix de revient du PF", () => {
    expect(t.totaux.quotePartAvant).toBeCloseTo(pv.totalOperationTtc, 1);
    expect(t.totaux.resteAFinancer).toBeCloseTo(pv.individuel.appelsFonds, 1);
    expect(t.totaux.prixRevient).toBeCloseTo(pv.resteACharge, 1);
    // aides restantes + prime C2E, versées après les travaux
    expect(t.totaux.remboursementFinChantier).toBeCloseTo(pv.individuel.appelsFonds - pv.resteACharge, 1);
    expect(t.totaux.coutPretAvance).toBe(0);
  });

  it("une ligne reprend les formules des exemples individuels du PF", () => {
    const martin = t.lignes.find((l) => l.nom === "Marie MARTIN")!;
    const part = 400 / 1000;
    expect(martin.resteAFinancer).toBeCloseTo(pv.individuel.appelsFonds * part, 1);
    expect(martin.prixRevient).toBeCloseTo(pv.resteACharge * part, 1);
    expect(martin.mensualite).toBeCloseTo(((pv.individuel.appelsFonds * part) / mois) * data.params.coefAssurance, 1);
    expect(martin.remboursementFinChantier).toBeCloseTo((pv.individuel.appelsFonds - pv.resteACharge) * part, 1);
  });
});

describe("computePlansIndividuelsPf - ventilation des aides", () => {
  it("aidesPubliques + primeCee + fondsTravaux = aidesEtFonds", () => {
    for (const p of rep.plans) {
      expect(p.aidesPubliques + p.primeCee + p.fondsTravaux).toBeCloseTo(p.aidesEtFonds, 1);
      expect(p.fondsTravaux).toBeGreaterThan(0); // le PF Violettes mobilise un fonds travaux
    }
  });
});
