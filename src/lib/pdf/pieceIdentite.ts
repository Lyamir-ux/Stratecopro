// Pièce d'identité d'un signataire : recto et verso déposés séparément (feedback
// de Pierre MAXTAFF, 09/10/2026), puis assemblés en UN SEUL fichier avant dépôt :
// le serveur ne gère (hash, purge) qu'un fichier par signataire. Chaque face
// peut être une photo (JPG, PNG) ou un PDF ; l'ensemble devient un PDF d'une
// page par image, les pages des PDF étant reprises telles quelles.
import { PDFDocument } from "pdf-lib";

const A4 = { w: 595.28, h: 841.89 };

/** Limite du serveur (signature-flux : PIECE_TAILLE_MAX), appliquée au fichier assemblé. */
export const TAILLE_MAX_PIECE = 10 * 1024 * 1024;

const FORMATS = ["image/jpeg", "image/png", "application/pdf"];

/** Une photo de téléphone dépasse vite 5 Mo : au-delà de ce seuil on la réduit. */
const SEUIL_REDUCTION = 1.5 * 1024 * 1024;
const COTE_MAX_PX = 2200;

export const TYPES_PIECE_IDENTITE = [
  { id: "cni", label: "Carte nationale d'identité" },
  { id: "passeport", label: "Passeport" },
  { id: "titre_sejour", label: "Titre de séjour" },
] as const;

/** Le passeport n'a qu'une page d'identité à fournir : pas de verso. */
export const versoRequis = (type: string): boolean => type !== "passeport";

export function libellesFaces(type: string): { recto: string; verso: string | null } {
  return versoRequis(type)
    ? { recto: "Recto", verso: "Verso" }
    : { recto: "Page d'identité (celle avec la photo)", verso: null };
}

/** Fichiers à déposer, dans l'ordre : recto puis verso (si le type en demande un). */
export function facesADeposer(type: string, recto: File | null, verso: File | null): File[] {
  return [recto, versoRequis(type) ? verso : null].filter((f): f is File => !!f);
}

/** `complet` : toutes les faces demandées sont là et valides ; `erreur` : motif
 *  d'un fichier refusé (null tant que rien n'est choisi ou que tout est valide). */
export function verifierFacesPiece(
  type: string,
  recto: File | null,
  verso: File | null,
): { complet: boolean; erreur: string | null } {
  const faces = facesADeposer(type, recto, verso);
  for (const f of faces) {
    if (!FORMATS.includes(f.type)) return { complet: false, erreur: "Formats acceptés : JPG, PNG ou PDF." };
    if (f.size > TAILLE_MAX_PIECE) return { complet: false, erreur: "Chaque fichier doit faire moins de 10 Mo." };
  }
  const attendues = versoRequis(type) ? 2 : 1;
  return { complet: faces.length === attendues, erreur: null };
}

/** Photo lourde ramenée à ~2 200 px de côté en JPEG ; en cas de doute (pas de
 *  canvas, image illisible, aucun gain) le fichier d'origine est conservé. */
async function reduireImage(f: File): Promise<{ bytes: Uint8Array; png: boolean }> {
  const brut = new Uint8Array(await f.arrayBuffer());
  const original = { bytes: brut, png: f.type === "image/png" };
  if (f.size <= SEUIL_REDUCTION || typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return original;
  }
  try {
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
    if (!blob || blob.size >= f.size) return original;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), png: false };
  } catch {
    return original;
  }
}

export async function assemblerPieceIdentite(
  fichiers: File[],
): Promise<{ blob: Blob; ext: "pdf" | "jpg" | "png" }> {
  if (fichiers.length === 1 && fichiers[0].type === "application/pdf") {
    return { blob: fichiers[0], ext: "pdf" };
  }
  const pdf = await PDFDocument.create();
  for (const f of fichiers) {
    if (f.type === "application/pdf") {
      const source = await PDFDocument.load(new Uint8Array(await f.arrayBuffer()));
      for (const page of await pdf.copyPages(source, source.getPageIndices())) pdf.addPage(page);
      continue;
    }
    const { bytes, png } = await reduireImage(f);
    const image = png ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([A4.w, A4.h]);
    const marge = 40;
    const echelle = Math.min((A4.w - 2 * marge) / image.width, (A4.h - 2 * marge) / image.height, 1);
    const w = image.width * echelle;
    const h = image.height * echelle;
    page.drawImage(image, { x: (A4.w - w) / 2, y: (A4.h - h) / 2, width: w, height: h });
  }
  const bytes = await pdf.save();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  if (blob.size > TAILLE_MAX_PIECE) {
    throw new Error("Les deux fichiers réunis dépassent 10 Mo : choisissez des photos plus légères.");
  }
  return { blob, ext: "pdf" };
}
