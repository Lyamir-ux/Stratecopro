// Export des PDF de la facturation (demande d'Amir du 06/10/2026) : noms de l'archive et des
// fichiers, pièces concernées.
import { describe, expect, it } from "vitest";
import { nomArchiveFactures, nomFichierPiece, nomsUniques, piecesExportables, type PieceFacture } from "../factureDoc";

const piece = (p: Partial<PieceFacture>) => p as PieceFacture;

describe("export des PDF de facturation", () => {
  it("nomme l'archive avec la date du jour", () => {
    expect(nomArchiveFactures("2026-10-06")).toBe("factures-strat-eco-2026-10-06.zip");
  });

  it("n'exporte que les pièces émises et numérotées", () => {
    const pieces = [
      piece({ id: "a", statut: "emise", numero: "FAC00000766", type: "facture" }),
      piece({ id: "b", statut: "brouillon", numero: null, type: "facture" }),
      piece({ id: "c", statut: "emise", numero: "AVR00000073", type: "avoir" }),
      piece({ id: "d", statut: "emise", numero: null, type: "facture" }),
    ];
    expect(piecesExportables(pieces).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("nomme le PDF d'une pièce d'après son type, son numéro, la copropriété et le jalon", () => {
    expect(nomFichierPiece({ type: "facture", numero: "FAC00000766", jalon: "P1b" }, "3 rue Mariano")).toBe(
      "Facture FAC00000766 - 3 rue Mariano - P1b.pdf"
    );
    expect(nomFichierPiece({ type: "avoir", numero: "AVR00000073", jalon: "P1b" }, "Résidence Éléonore")).toBe(
      "Avoir AVR00000073 - Residence Eleonore - P1b.pdf"
    );
  });

  it("rend distincts les noms identiques d'une même archive, sans toucher aux autres", () => {
    expect(nomsUniques(["a.pdf", "b.pdf", "a.pdf", "A.pdf", "a.pdf"])).toEqual(["a.pdf", "b.pdf", "a (2).pdf", "A (3).pdf", "a (4).pdf"]);
    expect(nomsUniques(["sans-extension", "sans-extension"])).toEqual(["sans-extension", "sans-extension (2)"]);
    expect(nomsUniques([])).toEqual([]);
  });
});
