// Adresse e-mail d'un copropriétaire modifiable en un clic (bug d'Amir du 08/10/2026,
// onglet Données d'un dossier, « comme le nom »). Calculs purs : nettoyage de la saisie et
// verdict avant enregistrement. L'edge function modifier-email-coproprietaire refait les
// mêmes contrôles côté serveur (même nettoyage, même règle de stockage) : à garder alignés.
import { premiereAdresse } from "@/lib/adresseEmail";

export const LONGUEUR_EMAIL_COPROPRIETAIRE = 200;

/** Saisie nettoyée : espaces de bord retirés, espaces multiples (et insécables) ramenés à un seul. */
export function nettoyerEmail(saisie: string): string {
  return saisie.replace(/\s+/g, " ").trim();
}

export type VerdictEmail =
  | { etat: "inchange" }
  | { etat: "invalide" }
  /** `email` null = adresse effacée. Une adresse seule est stockée en minuscules ; plusieurs, telles que saisies. */
  | { etat: "modifie"; email: string | null };

/** Ce que vaut la saisie par rapport à l'adresse actuelle de la fiche. */
export function verdictEmail(saisie: string, actuel: string | null | undefined): VerdictEmail {
  const propre = nettoyerEmail(saisie);
  const avant = nettoyerEmail(actuel ?? "");
  if (!propre) return avant ? { etat: "modifie", email: null } : { etat: "inchange" };
  const premiere = premiereAdresse(propre);
  if (!premiere) return { etat: "invalide" };
  const stockee = propre.toLowerCase() === premiere ? premiere : propre;
  return stockee === avant ? { etat: "inchange" } : { etat: "modifie", email: stockee };
}

/** Ce que le serveur a fait du compte du portail de la fiche. */
export type EtatCompteEmail = "aucun" | "suit" | "garde" | "introuvable" | "relie";

/** Phrase affichée sous l'adresse après un changement, selon le sort du compte (null = rien à dire).
 *  `nomCompte` : titulaire du compte repris quand la fiche a été reliée à un compte existant. */
export function noteApresChangement(
  compte: EtatCompteEmail,
  autresFiches: number,
  nomCompte?: string | null,
): string | null {
  if (compte === "suit") {
    const autres =
      autresFiches > 0
        ? ` Ce compte est aussi relié à ${autresFiches} autre${autresFiches > 1 ? "s" : ""} fiche${autresFiches > 1 ? "s" : ""} : leur adresse n'a pas changé.`
        : "";
    return `Adresse de connexion mise à jour aussi (l'invitation n'avait pas servi). Renvoyez l'invitation pour qu'elle parte à la nouvelle adresse.${autres}`;
  }
  if (compte === "relie") {
    const qui = nomCompte ? ` (${nomCompte})` : "";
    return `Cette adresse avait déjà un compte${qui}, sans aucune fiche : il est maintenant relié à cette fiche. Il retrouvera cette copropriété à sa prochaine connexion avec son mot de passe habituel, aucun e-mail n'est envoyé. L'ancien compte de la fiche, jamais utilisé, est laissé sans fiche.`;
  }
  if (compte === "garde") {
    return "Ce copropriétaire s'est déjà connecté : il garde son ancien identifiant de connexion, seule l'adresse de la fiche a changé.";
  }
  return null;
}
