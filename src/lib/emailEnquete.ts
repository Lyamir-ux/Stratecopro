// E-mail d'envoi du questionnaire d'enquête - idée d'Amir du 04/10/2026 :
// l'AMO vérifie l'e-mail envoyé aux copropriétaires et le modifie avant
// l'envoi (onglet Enquête, migration 0136). L'objet et le message sont
// modifiables ; la formule d'appel, la date limite, le bouton et la signature
// sont ajoutés par l'edge function creer-espace-coproprietaire (mode enquête),
// dont l'aperçu de l'écran reprend la mise en page.
import type { EtatEspace } from "@/api/espaces";

export const MAX_SUJET = 150;
export const MAX_MESSAGE = 4000;

export const sujetEnqueteParDefaut = (copro: string) => `Enquête sociale et technique - ${copro}`;

export const messageEnqueteParDefaut = (copro: string) =>
  `Strat Eco accompagne votre copropriété ${copro} dans son projet de rénovation énergétique.\n\n` +
  "Pour préparer le dépôt du dossier de financement et estimer les aides auxquelles vous pouvez prétendre, " +
  "nous vous remercions de bien vouloir répondre à l'enquête sociale et technique dans votre espace " +
  "copropriétaire. Vos réponses sont obligatoires et seront traitées de manière confidentielle par l'équipe " +
  "Strat Eco.";

/** Objet et message envoyés : le texte enregistré par l'AMO, sinon le texte proposé. */
export function texteEmailEnquete(
  enquete: { email_sujet: string | null; email_message: string | null },
  copro: string
) {
  const sujet = enquete.email_sujet?.trim() || sujetEnqueteParDefaut(copro);
  const message = enquete.email_message?.trim() || messageEnqueteParDefaut(copro);
  return { sujet, message, modifie: !!(enquete.email_sujet?.trim() || enquete.email_message?.trim()) };
}

/**
 * Valeur à enregistrer : null quand le texte saisi est celui proposé (il suivra
 * alors un changement de nom de la copropriété).
 */
export const aEnregistrer = (saisi: string, parDefaut: string): string | null => {
  const t = saisi.trim();
  return t === "" || t === parDefaut ? null : t;
};

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « 2026-10-15 » -> « 15 octobre 2026 » (même écriture que l'edge function). */
export function dateEnLettres(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const mois = MOIS[Number(m[2]) - 1];
  if (!mois) return null;
  const jour = Number(m[3]);
  return `${jour === 1 ? "1er" : jour} ${mois} ${m[1]}`;
}

/** Paragraphes du message : séparés par une ligne vide, retours à la ligne gardés. */
export const paragraphes = (message: string): string[][] =>
  message
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.split("\n").map((l) => l.trimEnd()))
    .filter((lignes) => lignes.some((l) => l.trim() !== ""));

export interface FicheDestinataire {
  id: string;
  nom: string;
  email: string | null;
  sortant_le: string | null;
}

export interface Destinataire {
  id: string;
  nom: string;
  email: string | null;
  /** true : espace déjà activé, l'e-mail mène à l'enquête ; sinon il porte le lien du mot de passe. */
  espaceActif: boolean;
}

/**
 * Destinataires de l'envoi : fiches présentes (pas les sortantes), toutes ou
 * celles qui n'ont pas encore de profil. Les fiches sans adresse utilisable
 * sont comptées à part, l'e-mail ne peut pas leur parvenir.
 */
export function classerDestinataires(
  fiches: FicheDestinataire[],
  espaces: Map<string, { etat: EtatEspace }> | undefined,
  cible: "tous" | "nonrep",
  aRepondu: (id: string) => boolean
) {
  const retenues = fiches.filter((f) => !f.sortant_le && (cible === "tous" || !aRepondu(f.id)));
  const envoyables: Destinataire[] = [];
  let sansEmail = 0;
  let emailPris = 0;
  for (const f of retenues) {
    const etat = espaces?.get(f.id)?.etat;
    if (etat === "actif" || etat === "invite" || etat === "a_creer") {
      envoyables.push({ id: f.id, nom: f.nom, email: f.email, espaceActif: etat === "actif" });
    } else if (etat === "email_pris") {
      emailPris++;
    } else {
      sansEmail++;
    }
  }
  return {
    retenues: retenues.length,
    envoyables,
    avecEspace: envoyables.filter((d) => d.espaceActif).length,
    sansEspace: envoyables.filter((d) => !d.espaceActif).length,
    sansEmail,
    emailPris,
  };
}

export type ClassementDestinataires = ReturnType<typeof classerDestinataires>;
