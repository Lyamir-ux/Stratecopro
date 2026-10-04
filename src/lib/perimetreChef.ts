// Dossiers d'un chef de projet. Le chef de projet est saisi en clair sur la
// fiche (« Radia ») ; le filtre « Chef de projet » du tableau de bord (persisté)
// et la page « Vos tâches » s'appuient sur les mêmes règles.
//
// « Vos tâches » (bug d'Amir du 04/10/2026) : la page et la pastille du menu
// suivent le chef de projet choisi dans le filtre du tableau de bord ; sans
// choix (« tous »), les dossiers du compte connecté.

/** Choix « Non attribués » du filtre Chef de projet (remarque d'Amir du 04/10/2026). */
export const CHEF_NON_ATTRIBUE = "__non_attribue__";

const nomComparable = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Le dossier est-il au nom de ce collaborateur ? Chef de projet de la fiche
 * comparé au nom du profil ou à son prénom, casse et accents ignorés.
 */
export function chefProjetEst(chefProjet: string | null | undefined, nomProfil: string | null | undefined): boolean {
  const chef = nomComparable(chefProjet ?? "");
  const nom = nomComparable(nomProfil ?? "");
  return !!chef && !!nom && (chef === nom || chef === nom.split(" ")[0]);
}

export type PerimetreChef =
  | { type: "chef"; chef: string }
  | { type: "non_attribues" }
  | { type: "moi"; nom: string };

/** Périmètre de « Vos tâches » : le filtre du tableau de bord, à défaut le compte connecté. */
export function perimetreTaches(filtreChef: string, nomProfil: string | null | undefined): PerimetreChef {
  if (filtreChef === CHEF_NON_ATTRIBUE) return { type: "non_attribues" };
  if (filtreChef) return { type: "chef", chef: filtreChef };
  return { type: "moi", nom: nomProfil?.trim() ?? "" };
}

/** Le dossier de ce chef de projet entre-t-il dans le périmètre ? */
export function dansPerimetre(p: PerimetreChef, chefProjet: string | null | undefined): boolean {
  if (p.type === "non_attribues") return !chefProjet?.trim();
  // choix du filtre : la valeur exacte de la liste du tableau de bord
  if (p.type === "chef") return chefProjet === p.chef;
  return chefProjetEst(chefProjet, p.nom);
}

/** « vos dossiers », « les dossiers de Radia », « les dossiers sans chef de projet ». */
export function libellePerimetre(p: PerimetreChef): string {
  if (p.type === "non_attribues") return "les dossiers sans chef de projet";
  if (p.type === "chef") return `les dossiers de ${p.chef}`;
  return "vos dossiers";
}
