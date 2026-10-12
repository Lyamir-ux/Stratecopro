// Pièce d'identité d'un signataire : recto et verso déposés séparément (feedback
// de Pierre MAXTAFF, 09/10/2026), puis assemblés en UN SEUL fichier avant dépôt :
// le serveur ne gère (hash, purge) qu'un fichier par signataire. Chaque face
// peut être une photo (JPG, PNG) ou un PDF ; l'ensemble devient un PDF d'une
// page par image, les pages des PDF étant reprises telles quelles (assemblage commun
// à toutes les pièces du portail depuis le 12/10/2026 : lib/pdf/assemblagePages).
import { assemblerPages } from "./assemblagePages";

/** Limite du serveur (signature-flux : PIECE_TAILLE_MAX), appliquée au fichier assemblé. */
export const TAILLE_MAX_PIECE = 10 * 1024 * 1024;

const FORMATS = ["image/jpeg", "image/png", "application/pdf"];

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

export async function assemblerPieceIdentite(
  fichiers: File[],
): Promise<{ blob: Blob; ext: "pdf" | "jpg" | "png" }> {
  const blob = await assemblerPages(fichiers, {
    tailleMax: TAILLE_MAX_PIECE,
    messageTropLourd: "Les deux fichiers réunis dépassent 10 Mo : choisissez des photos plus légères.",
  });
  return { blob, ext: "pdf" };
}
