import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { genererRapportEnquetePdf, nomFichierRapportEnquete, t, type RapportEnquetePdfInput } from "../rapportEnquete";
import { syntheseEnquete } from "@/lib/rapportEnquete";
import { grandJeu, petitJeu } from "@/lib/__tests__/fixtureRapportEnquete";

const base = (synthese: RapportEnquetePdfInput["synthese"]): RapportEnquetePdfInput => ({
  copro: { nom: "RÉSIDENCE LES TILLEULS", adresse: "8 rue des Tilleuls", codePostal: "67000", ville: "Strasbourg", syndic: "SYNDIC 3000 GRAND EST", denominationBatiments: "batiment" },
  envoyeeLe: "2026-09-01T08:00:00Z",
  dateLimite: "2026-09-30",
  arreteLe: new Date("2026-10-04T12:00:00Z"),
  synthese,
  observations: "Premier paragraphe.\n\nSecond paragraphe — avec un tiret long.",
  logoPng: readFileSync("public/logo-strateco.png"),
});

describe("genererRapportEnquetePdf", () => {
  it("produit un PDF A4 titré : synthèse, détail chiffré et annexe nominative", async () => {
    const bytes = await genererRapportEnquetePdf(base(syntheseEnquete(petitJeu())));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe("Rapport d'enquête sociale - RÉSIDENCE LES TILLEULS");
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("tient sur plusieurs pages pour une grande copropriété, sans logo ni observations", async () => {
    const bytes = await genererRapportEnquetePdf({ ...base(syntheseEnquete(grandJeu())), logoPng: null, observations: null });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it("sans propriétaire occupant : pas d'annexe", async () => {
    const jeu = petitJeu();
    const s = syntheseEnquete(jeu);
    const avec = await PDFDocument.load(await genererRapportEnquetePdf(base(s)));
    const sans = await PDFDocument.load(await genererRapportEnquetePdf(base({ ...s, occupants: [] })));
    expect(sans.getPageCount()).toBe(avec.getPageCount() - 1);
  });
});

describe("t (texte Helvetica)", () => {
  it("garde les caractères WinAnsi, remplace espaces fines, tirets longs et le reste", () => {
    expect(t("Œnone — 12 000 € – ok")).toBe("Œnone - 12 000 € - ok");
    expect(t("→ ✓")).toBe("? ?");
    expect(t("ligne\nsuivante")).toBe("ligne suivante");
  });
});

describe("nomFichierRapportEnquete", () => {
  it("date du jour et caractères interdits retirés", () => {
    expect(nomFichierRapportEnquete("LE 12/14 RUE", new Date("2026-10-04T10:00:00Z"))).toBe("LE 12 14 RUE - Rapport d'enquête sociale - 2026-10-04.pdf");
  });
});
