// Assemblage de plusieurs fichiers en UN SEUL PDF avant dépôt. Né pour la pièce
// d'identité (recto et verso, 09/10/2026), étendu à toutes les pièces du portail
// le 12/10/2026 (remarque d'Amir : « permettre aux copropriétaires de déposer
// plusieurs documents, notamment s'ils prennent en photo leurs documents », par
// exemple un avis d'imposition page par page). Le serveur, la vérification par
// l'AMO, l'aperçu et la purge ne connaissent qu'un fichier par pièce : les pages
// sont réunies côté navigateur. Chaque photo (JPG, PNG) devient une page A4, les
// pages des PDF sont reprises telles quelles, dans l'ordre choisi.
import { PDFDocument } from "pdf-lib";
import { typeMimePiece } from "@/lib/formatPiece";

const A4 = { w: 595.28, h: 841.89 };

/** Une photo de téléphone dépasse vite 5 Mo : au-delà de ce seuil on la réduit. */
const SEUIL_REDUCTION = 1.5 * 1024 * 1024;
const COTE_MAX_PX = 2200;

/** Limite par défaut du document assemblé (pièces justificatives du portail). */
export const TAILLE_MAX_DOCUMENT = 20 * 1024 * 1024;

/**
 * Orientation EXIF d'un JPEG (1 = droite, 3, 6, 8 = photo prise tournée), lue dans le
 * segment APP1 ; 1 si absente ou illisible. pdf-lib l'ignore : une photo de téléphone
 * tournée doit repasser par le canevas, qui l'applique.
 */
export function orientationExif(octets: Uint8Array): number {
  if (octets.length < 4 || octets[0] !== 0xff || octets[1] !== 0xd8) return 1;
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  let i = 2;
  while (i + 4 <= octets.length) {
    if (octets[i] !== 0xff) return 1;
    const marqueur = octets[i + 1];
    const longueur = vue.getUint16(i + 2);
    if (marqueur === 0xda || longueur < 2) return 1; // début de l'image : pas d'EXIF avant
    if (marqueur === 0xe1 && i + 10 <= octets.length && vue.getUint32(i + 4) === 0x45786966) {
      const tiff = i + 10; // « Exif\0\0 » passé
      if (tiff + 8 > octets.length) return 1;
      const le = vue.getUint16(tiff) === 0x4949;
      const ifd = tiff + vue.getUint32(tiff + 4, le);
      if (ifd + 2 > octets.length) return 1;
      const n = vue.getUint16(ifd, le);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (e + 10 > octets.length) return 1;
        if (vue.getUint16(e, le) === 0x0112) {
          const o = vue.getUint16(e + 8, le);
          return o >= 1 && o <= 8 ? o : 1;
        }
      }
      return 1;
    }
    i += 2 + longueur;
  }
  return 1;
}

/** Photo lourde (ou tournée) ramenée à ~2 200 px de côté en JPEG ; en cas de doute
 *  (pas de canevas, image illisible, aucun gain) le fichier d'origine est conservé. */
async function preparerImage(f: File, png: boolean): Promise<{ bytes: Uint8Array; png: boolean }> {
  const brut = new Uint8Array(await f.arrayBuffer());
  const original = { bytes: brut, png };
  const tournee = !png && orientationExif(brut) !== 1;
  if ((f.size <= SEUIL_REDUCTION && !tournee) || typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return original;
  }
  try {
    // createImageBitmap applique l'orientation EXIF (imageOrientation « from-image »)
    const bitmap = await createImageBitmap(f);
    const echelle = Math.min(1, COTE_MAX_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * echelle));
    canvas.height = Math.max(1, Math.round(bitmap.height * echelle));
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.fillStyle = "#fff"; // un PNG transparent devient un JPEG sur fond blanc
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    // une photo tournée garde la version redressée, même un peu plus lourde
    if (!blob || (blob.size >= f.size && !tournee)) return original;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), png: false };
  } catch {
    return original;
  }
}

/**
 * Réunit les fichiers dans un PDF, dans l'ordre donné. Un PDF seul est rendu tel quel.
 * Erreurs en clair : format refusé, PDF protégé ou illisible, document trop lourd.
 */
export async function assemblerPages(
  fichiers: File[],
  options: { tailleMax?: number; messageTropLourd?: string } = {},
): Promise<Blob> {
  const tailleMax = options.tailleMax ?? TAILLE_MAX_DOCUMENT;
  if (fichiers.length === 0) throw new Error("Aucun fichier à déposer.");
  if (fichiers.length === 1 && typeMimePiece(fichiers[0]) === "application/pdf") {
    if (fichiers[0].size > tailleMax) throw new Error(options.messageTropLourd ?? messageTrop(tailleMax));
    return fichiers[0];
  }
  const pdf = await PDFDocument.create();
  for (const f of fichiers) {
    const type = typeMimePiece(f);
    if (!type) throw new Error(`Le fichier « ${f.name} » n'est pas un PDF, un JPG ou un PNG.`);
    if (type === "application/pdf") {
      let source: PDFDocument;
      try {
        source = await PDFDocument.load(new Uint8Array(await f.arrayBuffer()));
      } catch (e) {
        const protege = e instanceof Error && /encrypt/i.test(e.message);
        throw new Error(
          protege
            ? `Le PDF « ${f.name} » est protégé : il ne peut pas être réuni avec d'autres fichiers. Déposez-le seul, il contient déjà toutes ses pages.`
            : `Le PDF « ${f.name} » n'a pas pu être lu : déposez-le seul ou enregistrez-le de nouveau.`,
        );
      }
      for (const page of await pdf.copyPages(source, source.getPageIndices())) pdf.addPage(page);
      continue;
    }
    const { bytes, png } = await preparerImage(f, type === "image/png");
    let image;
    try {
      image = png ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch {
      throw new Error(`L'image « ${f.name} » n'a pas pu être lue : reprenez la photo ou choisissez un autre fichier.`);
    }
    const page = pdf.addPage([A4.w, A4.h]);
    const marge = 40;
    const echelle = Math.min((A4.w - 2 * marge) / image.width, (A4.h - 2 * marge) / image.height, 1);
    const w = image.width * echelle;
    const h = image.height * echelle;
    page.drawImage(image, { x: (A4.w - w) / 2, y: (A4.h - h) / 2, width: w, height: h });
  }
  const blob = new Blob([(await pdf.save()) as BlobPart], { type: "application/pdf" });
  if (blob.size > tailleMax) throw new Error(options.messageTropLourd ?? messageTrop(tailleMax));
  return blob;
}

function messageTrop(tailleMax: number): string {
  return `Les fichiers réunis dépassent ${Math.round(tailleMax / (1024 * 1024))} Mo : choisissez des photos plus légères ou moins de pages.`;
}

/** Nom du PDF assemblé : celui du premier fichier, en .pdf. */
export function nomDocumentAssemble(fichiers: File[]): string {
  const base = (fichiers[0]?.name ?? "document").replace(/\.[a-z0-9]+$/i, "");
  return `${base || "document"}.pdf`;
}
