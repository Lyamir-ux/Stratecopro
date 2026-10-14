// Tampon du syndic imprimé dans le cadre « À retourner à : (cachet du Syndic) » du bulletin
// d'adhésion CEGEE (demande d'Amir du 14/10/2026). Un tampon par organisation, importé par l'AMO
// (onglet Financement), gardé en base comme data URL PNG ou JPEG (0163). Module sans dépendance :
// la fabrication du PDF est dans pdf/adhesion.ts, l'accès à la base dans api/tamponSyndic.ts.
import { typeMimePiece } from "./formatPiece";

export const ACCEPT_TAMPON = ".png,.jpg,.jpeg,image/png,image/jpeg";
export const LIBELLE_FORMATS_TAMPON = "PNG ou JPG";

/** Côté maximal de l'image conservée : large pour un tampon de 6 cm imprimé, léger en base. */
export const TAMPON_COTE_MAX_PX = 900;
/** Fichier source accepté : une photo de téléphone dépasse souvent 5 Mo, elle est réduite ensuite. */
export const TAMPON_TAILLE_MAX_FICHIER = 15 * 1024 * 1024;
/** Garde de la base (0163) : longueur maximale du data URL. */
export const TAMPON_LONGUEUR_MAX = 700_000;
/** Au-delà, un PNG est remis à plat en JPEG (la transparence est perdue, le tampon reste lisible). */
const SEUIL_PNG = 500_000;

/** Message à afficher si le fichier choisi ne peut pas servir de tampon ; null s'il est accepté. */
export function erreurFichierTampon(f: { name: string; type: string; size: number }): string | null {
  const type = typeMimePiece(f);
  if (type !== "image/png" && type !== "image/jpeg") {
    return `Le fichier « ${f.name} » n'est pas une image du tampon : importez un ${LIBELLE_FORMATS_TAMPON} (photographie ou scan du tampon).`;
  }
  if (f.size > TAMPON_TAILLE_MAX_FICHIER) {
    return `L'image « ${f.name} » est trop lourde (15 Mo maximum).`;
  }
  return null;
}

/** Octets et format d'un data URL de tampon ; null s'il n'est pas un PNG ou un JPEG en base 64. */
export function octetsDuTampon(dataUrl: string): { octets: Uint8Array; format: "png" | "jpg" } | null {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl.trim());
  if (!m) return null;
  const binaire = atob(m[2]);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return { octets, format: m[1] === "png" ? "png" : "jpg" };
}

export interface Cadre {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Emprise d'une image de `largeur` x `hauteur` dans un cadre : la plus grande possible, proportions
 * gardées, centrée dans le cadre (origine en bas à gauche, convention PDF).
 */
export function ajusterDansCadre(largeur: number, hauteur: number, cadre: Cadre) {
  const echelle = Math.min(cadre.w / largeur, cadre.h / hauteur);
  const width = largeur * echelle;
  const height = hauteur * echelle;
  return { x: cadre.x + (cadre.w - width) / 2, y: cadre.y + (cadre.h - height) / 2, width, height };
}

/**
 * Image du tampon prête à être gardée : redressée selon son orientation EXIF, réduite à
 * TAMPON_COTE_MAX_PX, PNG (transparence conservée) ou JPEG selon le fichier d'origine. Navigateur
 * seulement. Une image qui reste trop lourde est rejetée avec un message clair.
 */
export async function preparerTampon(fichier: File): Promise<string> {
  const refus = erreurFichierTampon(fichier);
  if (refus) throw new Error(refus);
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    throw new Error("Ce navigateur ne sait pas préparer l'image du tampon : utilisez un navigateur récent.");
  }
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`L'image « ${fichier.name} » est illisible : importez le tampon en PNG ou en JPG.`);
  }
  const echelle = Math.min(1, TAMPON_COTE_MAX_PX / Math.max(image.width, image.height));
  const canevas = document.createElement("canvas");
  canevas.width = Math.max(1, Math.round(image.width * echelle));
  canevas.height = Math.max(1, Math.round(image.height * echelle));
  const ctx = canevas.getContext("2d");
  if (!ctx) throw new Error("Ce navigateur ne sait pas préparer l'image du tampon : utilisez un navigateur récent.");

  const dessiner = (fondBlanc: boolean) => {
    ctx.clearRect(0, 0, canevas.width, canevas.height);
    if (fondBlanc) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canevas.width, canevas.height);
    }
    ctx.drawImage(image, 0, 0, canevas.width, canevas.height);
  };

  const enPng = typeMimePiece(fichier) === "image/png";
  if (enPng) {
    dessiner(false);
    const png = canevas.toDataURL("image/png");
    if (png.length <= SEUIL_PNG) return png;
  }
  // JPEG : fond blanc (pas de transparence), qualité abaissée tant que l'image est trop lourde
  dessiner(true);
  for (const qualite of [0.9, 0.8, 0.7]) {
    const jpeg = canevas.toDataURL("image/jpeg", qualite);
    if (jpeg.length <= TAMPON_LONGUEUR_MAX) return jpeg;
  }
  throw new Error(`L'image « ${fichier.name} » est trop détaillée : recadrez-la sur le tampon et réessayez.`);
}
