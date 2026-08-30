// Assemble la pièce d'identité en UN SEUL fichier avant dépôt : le serveur ne
// gère (hash, purge) qu'un fichier par signataire. 1 ou 2 photos (recto +
// verso) deviennent un PDF d'une page par image ; un PDF est envoyé tel quel.
import { PDFDocument } from "pdf-lib";

const A4 = { w: 595.28, h: 841.89 };

export async function assemblerPieceIdentite(
  fichiers: File[],
): Promise<{ blob: Blob; ext: "pdf" | "jpg" | "png" }> {
  if (fichiers.length === 1 && fichiers[0].type === "application/pdf") {
    return { blob: fichiers[0], ext: "pdf" };
  }
  const pdf = await PDFDocument.create();
  for (const f of fichiers) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const image = f.type === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([A4.w, A4.h]);
    const marge = 40;
    const echelle = Math.min((A4.w - 2 * marge) / image.width, (A4.h - 2 * marge) / image.height, 1);
    const w = image.width * echelle;
    const h = image.height * echelle;
    page.drawImage(image, { x: (A4.w - w) / 2, y: (A4.h - h) / 2, width: w, height: h });
  }
  const bytes = await pdf.save();
  return { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), ext: "pdf" };
}

export function validerFichiersPiece(fichiers: File[]): string | null {
  if (!fichiers.length) return "Sélectionnez un fichier.";
  if (fichiers.length > 2) return "2 fichiers maximum (recto et verso).";
  for (const f of fichiers) {
    if (!["image/jpeg", "image/png", "application/pdf"].includes(f.type)) {
      return "Formats acceptés : JPG, PNG ou PDF.";
    }
    if (f.size > 10 * 1024 * 1024) return "Chaque fichier doit faire moins de 10 Mo.";
  }
  if (fichiers.length === 2 && fichiers.some((f) => f.type === "application/pdf")) {
    return "Pour un dépôt en deux fichiers, utilisez deux photos (JPG ou PNG).";
  }
  return null;
}
