// Désigner le gestionnaire d'une copropriété PPT parmi les comptes de son
// enseigne (feedback Amir 23/09 sur /ppt : « adresser une copropriété »).
// La fiche garde le nom et l'e-mail en clair ; le trigger ppt_sync_affectation
// (0072) en déduit l'affectation : l'ancien gestionnaire perd l'accès, le
// nouveau l'obtient, l'historique est conservé. Logique pure, testée à part.

export interface MembreEnseigne {
  user_id: string;
  nom: string;
  email: string | null;
  org_role: string;
}

export interface GestionnaireActuel {
  gestionnaire_nom: string | null;
  gestionnaire_email: string | null;
}

export interface OptionGestionnaire {
  /** E-mail en minuscules, ou « nom:… » pour un gestionnaire saisi sans e-mail. */
  valeur: string;
  libelle: string;
  /** Gestionnaire de la fiche qui n'a pas de compte dans l'enseigne. */
  horsListe: boolean;
}

/** Valeur du menu pour « aucun gestionnaire ». */
export const NON_ATTRIBUE = "";

const ROLE_COURT: Record<string, string> = {
  directeur: "direction",
  gestionnaire: "gestionnaire",
  administratif: "administratif",
  comptable: "comptable",
};

const courriel = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

/** Valeur du menu correspondant au gestionnaire de la fiche. */
export function valeurActuelle(c: GestionnaireActuel): string {
  const email = courriel(c.gestionnaire_email);
  if (email) return email;
  const nom = c.gestionnaire_nom?.trim();
  return nom ? `nom:${nom}` : NON_ATTRIBUE;
}

/**
 * Comptes de l'enseigne qui peuvent recevoir le dossier (ceux qui ont un
 * e-mail), triés par nom, précédés du gestionnaire de la fiche s'il n'en fait
 * pas partie : un gestionnaire saisi à la main ou importé sans compte reste
 * affiché tel quel, rien n'est remplacé sans un choix explicite.
 */
export function optionsGestionnaire(membres: MembreEnseigne[], c: GestionnaireActuel): OptionGestionnaire[] {
  const comptes = membres
    .filter((m) => courriel(m.email))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
    .map((m) => ({
      valeur: courriel(m.email),
      libelle: `${m.nom}${ROLE_COURT[m.org_role] ? ` (${ROLE_COURT[m.org_role]})` : ""}`,
      horsListe: false,
    }));
  const actuelle = valeurActuelle(c);
  if (actuelle === NON_ATTRIBUE || comptes.some((o) => o.valeur === actuelle)) return comptes;
  const nom = c.gestionnaire_nom?.trim();
  const email = courriel(c.gestionnaire_email);
  const libelle = `${nom || email}${nom && email ? ` <${email}>` : ""} - sans compte dans l'enseigne`;
  return [{ valeur: actuelle, libelle, horsListe: true }, ...comptes];
}

/**
 * Champs de la fiche à écrire pour une valeur du menu, ou null si rien ne
 * change (valeur actuelle, ou gestionnaire hors liste reconduit).
 */
export function patchGestionnaire(membres: MembreEnseigne[], c: GestionnaireActuel, valeur: string): GestionnaireActuel | null {
  if (valeur === valeurActuelle(c)) return null;
  if (valeur === NON_ATTRIBUE) return { gestionnaire_nom: null, gestionnaire_email: null };
  const m = membres.find((x) => courriel(x.email) === valeur);
  if (!m) return null;
  return { gestionnaire_nom: m.nom, gestionnaire_email: courriel(m.email) };
}

/** Question posée avant de changer le gestionnaire d'une copropriété. */
export function messageTransfert(copro: GestionnaireActuel & { nom: string }, patch: GestionnaireActuel): string {
  const ancien = copro.gestionnaire_nom?.trim() || copro.gestionnaire_email;
  const nouveau = patch.gestionnaire_nom?.trim() || patch.gestionnaire_email;
  return nouveau
    ? `Confier « ${copro.nom} » à ${nouveau} ?${ancien ? ` ${ancien} n'y aura plus accès.` : ""} L'historique est conservé.`
    : `Retirer ${ancien ?? "le gestionnaire"} de « ${copro.nom} » ? Seule la direction de l'enseigne y aura accès.`;
}
