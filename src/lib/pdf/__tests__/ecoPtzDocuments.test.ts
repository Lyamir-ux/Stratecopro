// CERFA Annexe 3.1 et attestation éco-PTZ individuel : pages, emplacements de
// signature et caractères hors police standard.
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { genCerfaEcoPtz, type CerfaEcoPtzInput } from "../cerfaEcoPtz";
import { genAttestationEcoPtz } from "../attestationEcoPtz";

const gabarit = readFileSync("public/modeles/cerfa-ecoptz-annexe-3-1-peg.pdf");

const POSTES: [string, string, number][] = [
  ["Façades ITE biosourcée", "DECOPEINT", 5557.29],
  ["Dalle haute ITE", "SOPREMA", 934.93],
  ["Menuiseries extérieures PVC", "FUBAT", 842.98],
  ["Étanchéité à l'air", "AIR ÉNERGIE", 969.91],
  ["Isolation projetée / Plâtrerie", "ISOPROM", 416.82],
  ["CVC / Ventilation", "SCHUCH", 872.64],
  ["Raccordement réseau de chaleur", "ŁUKASZ ŻUREK BTP", 100.1],
];

function entree(n: number): CerfaEcoPtzInput {
  return {
    gabarit,
    adresse: { num: "4", voie: "route d'Oberhausbergen", cp: "67200", ville: "STRASBOURG" },
    batiment: "LE CATALPA - BINDER Etienne (lot n°12, cave n°45)",
    syndic: "CITYA RUHL SEGESCA",
    sci: true,
    audit: {
      reference: "A25670370399R",
      date: "02/12/2025",
      scenario: "Scénario 1 – Rénovation en une fois / raccordement réseau de chaleur",
      coutTtc: "1 650",
      classeAvant: "E",
      consoAvant: "243",
      classeApres: "C",
      consoApres: "96",
      gain: "60",
      prestataire: "INGEDAIR - Camille STADELMANN",
      siret: "79 160 338 400 045",
    },
    postes: POSTES.slice(0, n).map(([d, e, m], i) => ({
      description: d,
      entreprise: e,
      siret: "82 443 189 400 024",
      montant: m,
      signataire: `ent${i}`,
    })),
    signataireSyndic: "syndic",
    signataireAuditeur: "auditeur",
  };
}

describe("genCerfaEcoPtz", () => {
  it("1 poste : pages 1 et 2 seulement, total = somme des postes", async () => {
    const r = await genCerfaEcoPtz(entree(1));
    expect(r.pages).toBe(2);
    expect(r.total).toBeCloseTo(5557.29, 9);
    expect(r.emplacements.map((e) => e.signataire)).toEqual(["syndic", "auditeur", "ent0"]);
  });

  it("7 postes : poste 1 en page 2, puis 3 postes par page avec feuille complémentaire", async () => {
    const r = await genCerfaEcoPtz(entree(7));
    expect(r.pages).toBe(4);
    const doc = await PDFDocument.load(r.bytes);
    expect(doc.getPageCount()).toBe(4);
    const postes = r.emplacements.filter((e) => e.signataire.startsWith("ent"));
    expect(postes.map((e) => e.page)).toEqual([1, 2, 2, 2, 3, 3, 3]);
    for (const e of r.emplacements) {
      expect(e.signature.y).toBeGreaterThan(0);
      expect(e.signature.y + e.signature.h).toBeLessThan(842.04);
    }
    expect(r.total).toBeCloseTo(POSTES.reduce((s, p) => s + p[2], 0), 9);
    if (process.env.ECOPTZ_OUT) writeFileSync(`${process.env.ECOPTZ_OUT}/cerfa.pdf`, r.bytes);
  });

  it("refuse un CERFA sans poste", async () => {
    await expect(genCerfaEcoPtz(entree(0))).rejects.toThrow(/Aucun poste/);
  });
});

describe("genAttestationEcoPtz", () => {
  it("une page, total des quotes-parts, emplacement du syndic", async () => {
    const r = await genAttestationEcoPtz({
      copro: { nom: "LE CATALPA", adresse: "4 route d'Oberhausbergen, 67200 STRASBOURG" },
      emprunteur: "BINDER Etienne",
      logement: "Lot n°12 avec cave n°45",
      syndic: "CITYA RUHL SEGESCA",
      audit: { reference: "2023071", scenario: "Scénario V3C", gain: "50,5", consoAvant: "166,8", consoApres: "82,6", classeAvant: "C", classeApres: "B" },
      lignes: POSTES.map(([tr, e, m]) => ({ travaux: tr, entreprise: e, montantCopro: m * 50, tantiemes: "210 / 10 000", quotePart: m })),
      signataireSyndic: "syndic",
    });
    expect(r.total).toBeCloseTo(POSTES.reduce((s, p) => s + p[2], 0), 9);
    const doc = await PDFDocument.load(r.bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(r.emplacements).toHaveLength(1);
    expect(r.emplacements[0]).toMatchObject({ signataire: "syndic", page: 0 });
    if (process.env.ECOPTZ_OUT) writeFileSync(`${process.env.ECOPTZ_OUT}/attestation.pdf`, r.bytes);
  });
});
