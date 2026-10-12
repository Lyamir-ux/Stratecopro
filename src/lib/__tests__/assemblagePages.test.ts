import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { assemblerPages, nomDocumentAssemble, orientationExif } from "../pdf/assemblagePages";

// PNG 1x1 valide : de quoi exercer l'embarquement d'une image
const PNG_1X1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

const fichier = (nom: string, type: string, octets: Uint8Array) => new File([octets as BlobPart], nom, { type });

async function pdf(pages: number, nom = "scan.pdf"): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return new File([(await doc.save()) as BlobPart], nom, { type: "application/pdf" });
}

const pagesDe = async (b: Blob) => (await PDFDocument.load(new Uint8Array(await b.arrayBuffer()))).getPageCount();

/** Début de JPEG avec un segment EXIF qui porte l'orientation demandée. */
function jpegExif(orientation: number, petitBoutiste = false): Uint8Array {
  const u16 = (v: number) => (petitBoutiste ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v: number) => (petitBoutiste ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
  const tiff = [
    ...(petitBoutiste ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8),
    ...u16(1), // une entrée
    ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0,
    ...u32(0),
  ];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, ...[(app1.length + 2) >> 8, (app1.length + 2) & 0xff], ...app1, 0xff, 0xda, 0, 2]);
}

describe("assemblerPages (pièces du portail en plusieurs fichiers)", () => {
  it("un PDF seul est déposé tel quel", async () => {
    const seul = await pdf(3);
    expect(await assemblerPages([seul])).toBe(seul);
  });

  it("trois photos d'un avis d'imposition : un PDF de trois pages", async () => {
    const r = await assemblerPages([
      fichier("page1.png", "image/png", PNG_1X1),
      fichier("page2.png", "image/png", PNG_1X1),
      fichier("page3.png", "image/png", PNG_1X1),
    ]);
    expect(r.type).toBe("application/pdf");
    expect(await pagesDe(r)).toBe(3);
  });

  it("une photo seule devient aussi un PDF d'une page", async () => {
    expect(await pagesDe(await assemblerPages([fichier("page1.png", "image/png", PNG_1X1)]))).toBe(1);
  });

  it("PDF et photos mêlés : toutes les pages, dans l'ordre choisi", async () => {
    const r = await assemblerPages([await pdf(2), fichier("annexe.png", "image/png", PNG_1X1), await pdf(1)]);
    expect(await pagesDe(r)).toBe(4);
  });

  it("type absent (certains postes Windows) : déduit de l'extension", async () => {
    const r = await assemblerPages([fichier("page1.png", "", PNG_1X1), fichier("page2.png", "", PNG_1X1)]);
    expect(await pagesDe(r)).toBe(2);
  });

  it("refuse un format hors PDF, JPG, PNG", async () => {
    await expect(assemblerPages([fichier("a.png", "image/png", PNG_1X1), fichier("note.docx", "application/msword", PNG_1X1)]))
      .rejects.toThrow("n'est pas un PDF, un JPG ou un PNG");
  });

  it("un PDF protégé ne peut pas être réuni : message en clair", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.context.trailerInfo.Encrypt = doc.context.obj({ Filter: PDFName.of("Standard") });
    const protege = new File([(await doc.save()) as BlobPart], "avis.pdf", { type: "application/pdf" });
    await expect(assemblerPages([protege, fichier("page2.png", "image/png", PNG_1X1)])).rejects.toThrow("est protégé");
  });

  it("au-delà de la limite, le document assemblé est refusé", async () => {
    await expect(
      assemblerPages([fichier("a.png", "image/png", PNG_1X1), fichier("b.png", "image/png", PNG_1X1)], { tailleMax: 100 }),
    ).rejects.toThrow("dépassent 0 Mo");
  });

  it("nom du PDF assemblé : celui du premier fichier", () => {
    expect(nomDocumentAssemble([new File([], "IMG_2041.JPG"), new File([], "IMG_2042.JPG")])).toBe("IMG_2041.pdf");
    expect(nomDocumentAssemble([new File([], "avis.pdf")])).toBe("avis.pdf");
  });
});

describe("orientationExif (photo de téléphone prise tournée)", () => {
  it("lit l'orientation, grand ou petit boutiste", () => {
    expect(orientationExif(jpegExif(6))).toBe(6);
    expect(orientationExif(jpegExif(8, true))).toBe(8);
    expect(orientationExif(jpegExif(1))).toBe(1);
  });

  it("1 sans EXIF, pour un PNG ou des octets tronqués", () => {
    expect(orientationExif(PNG_1X1)).toBe(1);
    expect(orientationExif(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1);
    expect(orientationExif(jpegExif(6).slice(0, 20))).toBe(1);
  });
});
