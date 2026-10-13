// Saisie d'un nombre à la main (bug d'Amir du 13/10/2026, éditeur du PF définitif) :
// un champ type="number" suit la langue du navigateur - en français il refuse le
// point du pavé numérique. Les champs de montant sont donc des champs texte
// (clavier décimal sur téléphone) qui comprennent la virgule comme le point.

/**
 * Ne garde que ce qui peut faire partie d'un nombre : chiffres, espaces (milliers), virgule, point,
 * signe. Une lettre tapée disparaît ; un texte collé (« 12 € ») garde sa partie numérique.
 */
export function nettoyerSaisieNombre(texte: string): string {
  return texte.replace(/[^\d\s\u00a0\u202f,.\-+\u2212]/g, "");
}

/**
 * Lit un nombre saisi : « 12,5 », « 12.5 », « 1 234,56 », « 1.234,56 », « -3 ».
 * Un seul séparateur (virgule ou point) est décimal ; quand les deux sont
 * présents, le point sépare les milliers. null si la saisie n'est pas (encore)
 * un nombre : vide, « - », « , »…
 */
export function lireNombreSaisi(texte: string): number | null {
  let s = texte.replace(/[\s\u00a0\u202f]/g, "").replace(/\u2212/g, "-");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return Number(s);
}

/** Affichage d'un nombre dans un champ de saisie : virgule décimale, sans séparateur de milliers. */
export function formaterNombreSaisi(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(Math.round(n * 1e6) / 1e6).replace(".", ",");
}
