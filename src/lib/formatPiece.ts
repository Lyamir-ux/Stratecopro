// Formats acceptés pour une pièce déposée (RIB, avis d'imposition, pièce d'identité) :
// PDF, JPG ou PNG. Retours de Cyrielle KLEIN du 09/10/2026 : un Word passait le
// sélecteur de fichiers (« Tous les fichiers ») sans être refusé. Module sans
// dépendance, importé aussi par api/portail.ts.

/** Formats acceptés pour une pièce : le même trio côté navigateur et côté serveur. */
export const ACCEPT_PIECE = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const LIBELLE_FORMATS_PIECE = "PDF, JPG ou PNG";

/** Type d'un fichier : celui du navigateur, à défaut déduit de l'extension (certains
 *  postes Windows ne renseignent pas le type). Chaîne vide si le format n'est pas accepté. */
export function typeMimePiece(f: { name: string; type: string }): "application/pdf" | "image/jpeg" | "image/png" | "" {
  const t = (f.type ?? "").toLowerCase();
  if (t === "application/pdf" || t === "image/jpeg" || t === "image/png") return t;
  if (t) return "";
  const ext = /\.([a-z0-9]+)$/i.exec(f.name ?? "")?.[1]?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return "";
}

/** Message à afficher quand le fichier choisi n'est pas un PDF, un JPG ou un PNG (ex. un .docx
 *  passé par le sélecteur « Tous les fichiers »). null si le format est accepté. */
export function erreurFormatPiece(f: { name: string; type: string }): string | null {
  return typeMimePiece(f)
    ? null
    : `Le fichier « ${f.name} » n'est pas dans un format accepté : déposez un ${LIBELLE_FORMATS_PIECE} (un document Word ou Excel n'est pas pris en charge).`;
}
