import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { genererPortefeuilleSyndicPdf, regrouperParGestionnaire, type LignePortefeuillePdf } from "../portefeuilleSyndic";

const ligne = (o: Partial<LignePortefeuillePdf> & { nom: string }): LignePortefeuillePdf => ({
  ville: "Strasbourg",
  gestionnaire: "Claude LOBSTEIN",
  phase: "etudes",
  dpeAvant: "F",
  dpeApres: "C",
  gainPct: 55,
  logements: 40,
  lots: 52,
  coproprietaires: 38,
  montantTtc: 1_850_000,
  honoraires: 42_000,
  avancement: 45,
  fragile: false,
  retard: 0,
  ...o,
});

const lignes: LignePortefeuillePdf[] = [
  ligne({ nom: "LE BAYARD", logements: 46, phase: "travaux", montantTtc: 3_200_000, honoraires: 61_000, avancement: 80 }),
  ligne({ nom: "ANEMONES", ville: "Illkirch-Graffenstaden", logements: 11, phase: "diagnostic", montantTtc: null, honoraires: null, avancement: 10, retard: 2, gestionnaire: "Jean-François ROUSSET" }),
  ligne({ nom: "STOSSWIHR", logements: 24, fragile: true, gestionnaire: "Jean-François ROUSSET", retard: 1 }),
  ligne({ nom: "Résidence Œillets - Bât. A", logements: 8, gestionnaire: null, montantTtc: 0 }),
];

describe("regrouperParGestionnaire", () => {
  it("agrège copros, logements, montants, phases et retards - Non attribué en dernier", () => {
    const g = regrouperParGestionnaire(lignes);
    expect(g.map((x) => x.nom)).toEqual(["Claude LOBSTEIN", "Jean-François ROUSSET", "Non attribué"]);
    expect(g[0]).toMatchObject({ copros: 1, logements: 46, montant: 3_200_000, honoraires: 61_000, retard: 0 });
    expect(g[0].phases).toEqual({ diagnostic: 0, etudes: 0, travaux: 1 });
    expect(g[1]).toMatchObject({ copros: 2, logements: 35, retard: 3 });
    expect(g[1].phases).toEqual({ diagnostic: 1, etudes: 1, travaux: 0 });
    expect(g[2].copros).toBe(1);
  });
});

describe("genererPortefeuilleSyndicPdf", () => {
  it("produit un PDF paysage lisible avec titre, synthèse, comparatif et tableau", async () => {
    const bytes = await genererPortefeuilleSyndicPdf({ syndicNom: "SYNDIC HORIZON GRAND EST", lignes, genereLe: "20 septembre 2026" });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toBe("Portefeuille - SYNDIC HORIZON GRAND EST");
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
  });

  it("supporte un portefeuille vide et un seul gestionnaire (pas de comparatif)", async () => {
    const vide = await genererPortefeuilleSyndicPdf({ lignes: [], genereLe: "20 septembre 2026" });
    expect((await PDFDocument.load(vide)).getPageCount()).toBe(1);
    const un = await genererPortefeuilleSyndicPdf({ lignes: lignes.slice(0, 1), filtre: "portefeuille de Claude LOBSTEIN", genereLe: "20 septembre 2026" });
    expect((await PDFDocument.load(un)).getPageCount()).toBe(1);
  });

  it("tient sur plusieurs pages avec un grand portefeuille", async () => {
    const beaucoup = Array.from({ length: 60 }, (_, i) => ligne({ nom: `Copropriété ${String(i + 1).padStart(2, "0")}`, gestionnaire: i % 3 ? "Claude LOBSTEIN" : "Jean-François ROUSSET" }));
    const bytes = await genererPortefeuilleSyndicPdf({ lignes: beaucoup, genereLe: "20 septembre 2026" });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });
});
