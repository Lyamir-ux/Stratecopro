import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { genererAnalyseOffresPdf } from "../analyseOffresPpt";
import { comparerOffres } from "@/lib/ppt/analyseOffres";

describe("PDF d'analyse des offres PPPT + DPE collectif (0109)", () => {
  it("génère le comparatif, l'avis et le projet de résolution", async () => {
    const offres = comparerOffres(
      [
        { id: "a", org_name: "Ingedair", montant: 6200, tarif_pppt: 4000, tarif_dpe: 2200, delai_pppt_semaines: 10, delai_dpe_semaines: 6, message: "Visite de 12 logements, restitution en AG comprise.", fichier_path: "u/a.pdf", fichier_name: "Offre Ingedair PPPT DPE.pdf", received_at: "2026-10-02T09:00:00Z" },
        { id: "b", org_name: "Atelier G5", montant: 5400, tarif_pppt: 3200, tarif_dpe: 2200, delai_pppt_semaines: 8, delai_dpe_semaines: 5, message: "Option : présentation du PPPT en assemblée générale (450 € HT).", fichier_path: "u/b.pdf", fichier_name: "G5 - offre.pdf", received_at: "2026-10-05T09:00:00Z" },
        { id: "c", org_name: "Thermi'Est Diagnostics", montant: null, message: null, fichier_path: null, fichier_name: null, received_at: "2026-10-06T09:00:00Z" },
      ],
      "b"
    );
    const bytes = await genererAnalyseOffresPdf({
      copro: { nom: "Les Tilleuls", adresse: "12 rue des Vosges", code_postal: "67000", commune: "Strasbourg", nb_logements: 24, nb_lots: 30 },
      nomEnseigne: "SYNDIC 3000 GRAND EST",
      mission: "Réalisation du projet de plan pluriannuel de travaux (PPPT) et du diagnostic de performance énergétique (DPE) collectif de la copropriété (30 lots).",
      publieeLe: "2026-09-27T16:00:00Z",
      dateLimite: "2026-10-18",
      bureauxConsultes: 3,
      offres,
      avis: "Atelier G5 propose l'offre la moins chère et un délai court.\n\nNous recommandons de retenir Atelier G5 ; l'offre d'Ingedair reste une bonne alternative.",
      genereLe: "20 octobre 2026",
      logoPng: readFileSync("public/logo-strateco-pro-white.png"),
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getTitle()).toBe("Analyse des offres PPPT + DPE collectif - Les Tilleuls");
    if (process.env.PDF_OUT_ANALYSE) writeFileSync(process.env.PDF_OUT_ANALYSE, bytes);
  });
});
