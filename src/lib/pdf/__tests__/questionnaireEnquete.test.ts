import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { defaultConfig, CATALOGUE } from "@/lib/enqueteCatalogue";
import { questionnairePapier } from "@/lib/questionnairePapier";
import { genererQuestionnaireEnquetePdf, nomFichierQuestionnaireEnquete, type QuestionnairePdfInput } from "../questionnaireEnquete";

const base = (): QuestionnairePdfInput => ({
  copro: { nom: "RÉSIDENCE LES TILLEULS", adresse: "8 rue des Tilleuls", codePostal: "67000", ville: "Strasbourg", denominationBatiments: "batiment" },
  dateLimite: "2026-10-30",
  questionnaire: questionnairePapier(defaultConfig()),
  logoPng: readFileSync("public/logo-strateco.png"),
});

describe("genererQuestionnaireEnquetePdf", () => {
  it("produit un PDF A4 titré, sur plusieurs pages, avec les questions activées", async () => {
    const bytes = await genererQuestionnaireEnquetePdf(base());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe("Questionnaire d'enquête sociale et technique - RÉSIDENCE LES TILLEULS");
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("tient avec toutes les questions activées, sans logo ni date limite", async () => {
    const tout = CATALOGUE.map((q) => ({ id: q.id, on: true }));
    const complet = await PDFDocument.load(
      await genererQuestionnaireEnquetePdf({ ...base(), logoPng: null, dateLimite: null, questionnaire: questionnairePapier(tout) })
    );
    const defaut = await PDFDocument.load(await genererQuestionnaireEnquetePdf(base()));
    expect(complet.getPageCount()).toBeGreaterThan(defaut.getPageCount());
  });

  it("une question personnalisée très longue et une copropriété sans adresse ne cassent pas la mise en page", async () => {
    const input = base();
    input.copro = { nom: "A".repeat(120), adresse: null, codePostal: null, ville: null, denominationBatiments: "entree" };
    input.questionnaire = questionnairePapier([...defaultConfig(), { id: "custom-1", on: true, custom: true, q: "Question libre ".repeat(60) }]);
    const doc = await PDFDocument.load(await genererQuestionnaireEnquetePdf(input));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
  });
});

describe("nomFichierQuestionnaireEnquete", () => {
  it("retire les caractères interdits d'un nom de fichier", () => {
    expect(nomFichierQuestionnaireEnquete("LE 12/14 RUE")).toBe("LE 12 14 RUE - Questionnaire d'enquête sociale et technique.pdf");
  });
});
