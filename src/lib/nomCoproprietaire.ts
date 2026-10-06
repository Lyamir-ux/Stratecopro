// Correction du nom d'un copropriétaire en un clic (idée d'Amir du 06/10/2026,
// onglet Données d'un dossier) : fautes de frappe, lettres à changer.
// Calculs purs : nettoyage de la saisie et verdict avant enregistrement (la fonction SQL
// coproprietaire_renommer, 0143, refait le même nettoyage côté base).

export const LONGUEUR_NOM_COPROPRIETAIRE = 120;

/** Saisie nettoyée : espaces de bord retirés, espaces multiples (et insécables) ramenés à un seul. */
export function nettoyerNom(saisie: string): string {
  return saisie.replace(/\s+/g, " ").trim();
}

export type VerdictNom =
  | { etat: "vide" }
  | { etat: "inchange" }
  | { etat: "modifie"; nom: string };

/** Ce que vaut la saisie par rapport au nom actuel : rien à enregistrer, refus (vide) ou nouveau nom. */
export function verdictNom(saisie: string, actuel: string): VerdictNom {
  const nom = nettoyerNom(saisie);
  if (!nom) return { etat: "vide" };
  return nom === nettoyerNom(actuel) ? { etat: "inchange" } : { etat: "modifie", nom };
}
