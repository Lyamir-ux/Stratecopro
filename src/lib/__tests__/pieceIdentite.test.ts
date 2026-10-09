import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  assemblerPieceIdentite,
  facesADeposer,
  libellesFaces,
  TAILLE_MAX_PIECE,
  verifierFacesPiece,
  versoRequis,
} from "../pdf/pieceIdentite";

// PNG 1x1 valide : de quoi exercer l'embarquement d'une image
const PNG_1X1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

const fichier = (nom: string, type: string, octets: number | Uint8Array = 10) =>
  new File([typeof octets === "number" ? new Uint8Array(octets) : (octets as BlobPart)], nom, { type });

async function pdfDeuxPages(): Promise<File> {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.addPage();
  return new File([(await doc.save()) as BlobPart], "scan.pdf", { type: "application/pdf" });
}

describe("verso demandé selon le type de pièce", () => {
  it("carte d'identité et titre de séjour : recto + verso ; passeport : une seule page", () => {
    expect(versoRequis("cni")).toBe(true);
    expect(versoRequis("titre_sejour")).toBe(true);
    expect(versoRequis("passeport")).toBe(false);
    expect(libellesFaces("cni")).toEqual({ recto: "Recto", verso: "Verso" });
    expect(libellesFaces("passeport").verso).toBeNull();
  });
});

describe("verifierFacesPiece", () => {
  const jpg = fichier("recto.jpg", "image/jpeg");
  const png = fichier("verso.png", "image/png");

  it("n'est complet qu'avec le recto ET le verso pour une carte d'identité", () => {
    expect(verifierFacesPiece("cni", null, null)).toEqual({ complet: false, erreur: null });
    expect(verifierFacesPiece("cni", jpg, null)).toEqual({ complet: false, erreur: null });
    expect(verifierFacesPiece("cni", null, png)).toEqual({ complet: false, erreur: null });
    expect(verifierFacesPiece("cni", jpg, png)).toEqual({ complet: true, erreur: null });
  });

  it("le passeport se contente de sa page d'identité, un verso choisi avant est ignoré", () => {
    expect(verifierFacesPiece("passeport", jpg, null).complet).toBe(true);
    expect(facesADeposer("passeport", jpg, png)).toEqual([jpg]);
    expect(facesADeposer("cni", jpg, png)).toEqual([jpg, png]);
  });

  it("refuse un format hors JPG, PNG, PDF et un fichier de plus de 10 Mo", () => {
    expect(verifierFacesPiece("cni", fichier("a.gif", "image/gif"), png)).toEqual({
      complet: false,
      erreur: "Formats acceptés : JPG, PNG ou PDF.",
    });
    expect(verifierFacesPiece("cni", jpg, fichier("gros.jpg", "image/jpeg", TAILLE_MAX_PIECE + 1))).toEqual({
      complet: false,
      erreur: "Chaque fichier doit faire moins de 10 Mo.",
    });
  });

  it("accepte désormais un PDF pour l'une des deux faces", () => {
    expect(verifierFacesPiece("cni", fichier("recto.pdf", "application/pdf"), png).complet).toBe(true);
  });
});

describe("assemblerPieceIdentite", () => {
  it("un PDF seul est déposé tel quel", async () => {
    const pdf = await pdfDeuxPages();
    const r = await assemblerPieceIdentite([pdf]);
    expect(r.ext).toBe("pdf");
    expect(r.blob).toBe(pdf);
  });

  it("recto + verso en photos : un PDF de deux pages", async () => {
    const r = await assemblerPieceIdentite([fichier("recto.png", "image/png", PNG_1X1), fichier("verso.png", "image/png", PNG_1X1)]);
    expect(r.ext).toBe("pdf");
    const doc = await PDFDocument.load(new Uint8Array(await r.blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(2);
  });

  it("recto en PDF et verso en photo : les pages sont réunies dans un seul PDF", async () => {
    const r = await assemblerPieceIdentite([await pdfDeuxPages(), fichier("verso.png", "image/png", PNG_1X1)]);
    const doc = await PDFDocument.load(new Uint8Array(await r.blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(3);
  });
});
