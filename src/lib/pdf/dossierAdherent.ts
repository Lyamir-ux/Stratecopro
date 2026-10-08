// Fusion des pièces d'un adhérent en UN SEUL PDF : la Caisse d'Épargne Grand Est
// demande « NOM prénom.PDF » en regroupant tous les justificatifs
// (nomenclature de numérisation, 08/10/2026). Les PDF sont repris page à page ;
// les photos (JPG, PNG) deviennent une page A4 chacune. Aucune page ajoutée :
// la banque numérise le fichier tel quel.
import { PDFDocument } from "pdf-lib";

export interface PieceAFusionner {
  /** Libellé affiché dans le bilan de l'export. */
  label: string;
  /** Extension du fichier source, sans point, en minuscules. */
  ext: string;
  octets: Uint8Array;
}

export interface ResultatFusion {
  pdf: Uint8Array;
  pages: number;
  /** Pièces laissées de côté (format ou fichier illisible) : à ajouter à la main. */
  ignorees: { label: string; raison: string }[];
}

const A4 = { w: 595.28, h: 841.89 };
const MARGE = 36;
/** Côté maximal d'une photo réencodée : A4 à 250 dpi, lisible sans alourdir le dossier. */
const COTE_MAX_PX = 2050;

export type ImageNormalisee = { octets: Uint8Array; ext: "jpg" | "png" };

/**
 * Photo redressée selon son orientation EXIF et réduite : les photos de téléphone
 * portent leur sens dans l'EXIF, que pdf-lib ignore (la page sortirait couchée), et
 * pèsent plusieurs Mo. Navigateur seulement ; sans canevas, la photo est reprise telle quelle.
 */
export async function normaliserImageNavigateur(octets: Uint8Array, ext: string): Promise<ImageNormalisee> {
  const brut = { octets, ext: (ext === "png" ? "png" : "jpg") as "jpg" | "png" };
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return brut;
  try {
    const image = await createImageBitmap(new Blob([octets as BlobPart]), { imageOrientation: "from-image" });
    const echelle = Math.min(1, COTE_MAX_PX / Math.max(image.width, image.height));
    const canevas = document.createElement("canvas");
    canevas.width = Math.max(1, Math.round(image.width * echelle));
    canevas.height = Math.max(1, Math.round(image.height * echelle));
    const ctx = canevas.getContext("2d");
    if (!ctx) return brut;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canevas.width, canevas.height);
    ctx.drawImage(image, 0, 0, canevas.width, canevas.height);
    const blob = await new Promise<Blob | null>((ok) => canevas.toBlob(ok, "image/jpeg", 0.9));
    if (!blob) return brut;
    return { octets: new Uint8Array(await blob.arrayBuffer()), ext: "jpg" };
  } catch {
    return brut;
  }
}

const EXTENSIONS_IMAGE = new Set(["jpg", "jpeg", "png"]);

/** Fusionne les pièces dans l'ordre reçu. Une pièce illisible est signalée, pas bloquante. */
export async function fusionnerPieces(
  pieces: PieceAFusionner[],
  options: { titre?: string; normaliserImage?: (octets: Uint8Array, ext: string) => Promise<ImageNormalisee> } = {}
): Promise<ResultatFusion> {
  const normaliser = options.normaliserImage ?? normaliserImageNavigateur;
  const doc = await PDFDocument.create();
  const ignorees: ResultatFusion["ignorees"] = [];

  for (const p of pieces) {
    try {
      if (p.ext === "pdf") {
        const source = await PDFDocument.load(p.octets, { ignoreEncryption: true });
        const pages = await doc.copyPages(source, source.getPageIndices());
        for (const page of pages) doc.addPage(page);
      } else if (EXTENSIONS_IMAGE.has(p.ext)) {
        const image = await normaliser(p.octets, p.ext);
        const incrustee = image.ext === "png" ? await doc.embedPng(image.octets) : await doc.embedJpg(image.octets);
        const page = doc.addPage([A4.w, A4.h]);
        const echelle = Math.min((A4.w - 2 * MARGE) / incrustee.width, (A4.h - 2 * MARGE) / incrustee.height);
        const w = incrustee.width * echelle;
        const h = incrustee.height * echelle;
        page.drawImage(incrustee, { x: (A4.w - w) / 2, y: (A4.h - h) / 2, width: w, height: h });
      } else {
        ignorees.push({ label: p.label, raison: `format .${p.ext || "?"} non repris dans le PDF` });
      }
    } catch {
      ignorees.push({ label: p.label, raison: "fichier illisible" });
    }
  }

  if (options.titre) doc.setTitle(options.titre);
  doc.setProducer("Strat Eco Pro");
  doc.setCreator("Strat Eco Pro");
  return { pdf: await doc.save(), pages: doc.getPageCount(), ignorees };
}
