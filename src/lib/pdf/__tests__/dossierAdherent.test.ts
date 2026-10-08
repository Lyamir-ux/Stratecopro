// Fusion des pièces d'un adhérent en un seul PDF (nomenclature de la Caisse d'Épargne Grand Est,
// 08/10/2026) : PDF repris page à page, photos en pages A4, pièce illisible signalée sans bloquer.
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { fusionnerPieces, type ImageNormalisee } from "../dossierAdherent";

// PNG de 1 pixel
const PNG_1PX = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0)
);

async function pdfDe(pages: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([300, 400]);
  return d.save();
}

const identite = async (octets: Uint8Array, ext: string): Promise<ImageNormalisee> => ({ octets, ext: ext === "png" ? "png" : "jpg" });

describe("fusionnerPieces", () => {
  it("reprend les PDF page à page puis les photos, dans l'ordre reçu", async () => {
    const r = await fusionnerPieces(
      [
        { label: "Bulletin", ext: "pdf", octets: await pdfDe(2) },
        { label: "Pièce d'identité", ext: "png", octets: PNG_1PX },
        { label: "RIB", ext: "pdf", octets: await pdfDe(1) },
      ],
      { normaliserImage: identite, titre: "DUPONT Jean - LE FORUM" }
    );
    expect(r.pages).toBe(4);
    expect(r.ignorees).toEqual([]);
    const doc = await PDFDocument.load(r.pdf);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getTitle()).toBe("DUPONT Jean - LE FORUM");
    // le bulletin (300 x 400) ouvre le fichier, la photo est une page A4
    expect(doc.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
    expect(Math.round(doc.getPage(2).getWidth())).toBe(595);
    expect(doc.getPage(3).getSize()).toEqual({ width: 300, height: 400 });
  });

  it("signale une pièce illisible ou d'un format non repris, sans bloquer les autres", async () => {
    const r = await fusionnerPieces(
      [
        { label: "Taxe foncière", ext: "pdf", octets: Uint8Array.from([1, 2, 3, 4]) },
        { label: "Attestation notariée", ext: "docx", octets: new Uint8Array([1]) },
        { label: "Photo cassée", ext: "jpg", octets: Uint8Array.from([0, 1, 2]) },
        { label: "Bulletin", ext: "pdf", octets: await pdfDe(1) },
      ],
      { normaliserImage: identite }
    );
    expect(r.pages).toBe(1);
    expect(r.ignorees).toEqual([
      { label: "Taxe foncière", raison: "fichier illisible" },
      { label: "Attestation notariée", raison: "format .docx non repris dans le PDF" },
      { label: "Photo cassée", raison: "fichier illisible" },
    ]);
  });

  it("sans canevas (hors navigateur), la photo est reprise telle quelle", async () => {
    const r = await fusionnerPieces([{ label: "Identité", ext: "png", octets: PNG_1PX }]);
    expect(r.pages).toBe(1);
    expect(r.ignorees).toEqual([]);
  });
});
