// Tampon de fichiers à déposer : le bouton « Déposer un fichier » de l'en-tête
// de la branche PPT (visible sur toutes les pages) choisit les fichiers, puis
// renvoie vers la liste des copropriétés qui ouvre la fenêtre de dépôt avec ces
// fichiers (feedback Amir 20/09/2026 : doublon du dépôt de l'onglet Copropriétés).
// Un objet File ne se sérialise pas : le tampon vit en mémoire le temps de la
// navigation, et un événement prévient la page si elle est déjà affichée.

let tampon: File[] = [];

export const EVENEMENT_DEPOT = "ppt-depot-fichiers";

/** Dépose des fichiers dans le tampon et prévient la page de dépôt. */
export function deposerDansTampon(fichiers: File[]) {
  if (fichiers.length === 0) return;
  tampon = [...tampon, ...fichiers];
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENEMENT_DEPOT));
}

/** Vide le tampon et renvoie son contenu. */
export function prendreTampon(): File[] {
  const f = tampon;
  tampon = [];
  return f;
}
