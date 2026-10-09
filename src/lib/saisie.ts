// Aides à la saisie du dossier d'adhésion (retours de A CHELGHAM et de Cyrielle
// KLEIN, 09/10/2026) : IBAN regroupé par blocs de 4, BIC en majuscules sur 11
// caractères au plus, dates choisies dans un calendrier plutôt que tapées,
// téléphone repris de l'enquête. (Formats de fichier : lib/formatPiece.ts.)
import { isValidBic, isValidIban, normalizeIban } from "@/lib/pdf/adhesion";

// ========== IBAN / BIC ==========

/** Longueur d'un IBAN français : FR + clé (4) + 5 blocs de 4 + 1 bloc de 3. */
export const LONGUEUR_IBAN_FR = 27;

/** IBAN regroupé par blocs de 4 pendant la frappe : « FR76 3000 1007 9412 3456 7890 185 ». */
export function formaterIban(brut: string): string {
  const compact = brut.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 34);
  return compact.replace(/(.{4})(?=.)/g, "$1 ");
}

/** BIC sans espace, en majuscules, 11 caractères au plus. */
export function formaterBic(brut: string): string {
  return brut.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 11);
}

/** Position du curseur dans le texte reformaté, à partir du nombre de caractères
 *  utiles (hors espaces) qui le précédaient : l'insertion des espaces ne le déplace pas. */
export function positionCurseur(formate: string, nbAvant: number): number {
  if (nbAvant <= 0) return 0;
  let vus = 0;
  for (let i = 0; i < formate.length; i++) {
    if (formate[i] !== " ") vus++;
    if (vus === nbAvant) return i + 1;
  }
  return formate.length;
}

export interface Diagnostic {
  /** « incomplet » : encore en cours de saisie (ton neutre) ; « erreur » : à corriger. */
  niveau: "incomplet" | "erreur";
  message: string;
}

/** Retour de saisie pour l'IBAN : null si vide ou valide. */
export function diagnosticIban(brut: string): Diagnostic | null {
  const iban = normalizeIban(brut);
  if (!iban || isValidIban(iban)) return null;
  const fr = iban.startsWith("FR");
  if (fr && iban.length < LONGUEUR_IBAN_FR) {
    return {
      niveau: "incomplet",
      message: `IBAN français : ${iban.length} caractères saisis sur ${LONGUEUR_IBAN_FR} (FR76, puis 5 blocs de 4 caractères et un dernier bloc de 3).`,
    };
  }
  if (fr && iban.length > LONGUEUR_IBAN_FR) {
    return { niveau: "erreur", message: `IBAN français trop long : ${LONGUEUR_IBAN_FR} caractères attendus, ${iban.length} saisis.` };
  }
  if (!/^[A-Z]{2}\d{2}/.test(iban)) {
    if (iban.length < 4) return { niveau: "incomplet", message: "Un IBAN commence par 2 lettres (le pays) puis 2 chiffres, par exemple FR76." };
    return { niveau: "erreur", message: "Un IBAN commence par 2 lettres (le pays) puis 2 chiffres, par exemple FR76." };
  }
  if (iban.length < 15) return { niveau: "incomplet", message: "IBAN incomplet." };
  return { niveau: "erreur", message: "IBAN invalide - la clé de contrôle ne correspond pas : vérifiez chaque caractère." };
}

/** Retour de saisie pour le BIC : null si vide ou valide. */
export function diagnosticBic(brut: string): Diagnostic | null {
  const bic = brut.replace(/\s/g, "").toUpperCase();
  if (!bic || isValidBic(bic)) return null;
  if (bic.length < 8 || (bic.length > 8 && bic.length < 11)) {
    return { niveau: "incomplet", message: `BIC : ${bic.length} caractères saisis, 8 ou 11 attendus (ex. CEPAFRPP513).` };
  }
  return {
    niveau: "erreur",
    message: "BIC invalide - 4 lettres (banque), 2 lettres (pays), 2 caractères (ville), puis 3 facultatifs (agence), ex. CEPAFRPP513.",
  };
}

// ========== Dates ==========

const dateReelle = (j: number, m: number, a: number) => {
  const d = new Date(a, m - 1, j);
  return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j;
};

/** « 01/09/2015 » vers « 2015-09-01 » (valeur d'un champ date) ; chaîne vide si ce n'est pas une date. */
export function dateFrVersIso(fr: string): string {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(fr ?? "");
  if (!m) return "";
  const [j, mo, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!dateReelle(j, mo, a)) return "";
  return `${a}-${String(mo).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
}

/** « 2015-09-01 » vers « 01/09/2015 » (format imprimé sur le bulletin). */
export function dateIsoVersFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Le bulletin porte « date et lieu de naissance » dans une seule case : « 12/05/1980 à Colmar ».
 *  Deux champs côté saisie, une seule chaîne côté dossier (les brouillons existants restent lisibles). */
export function decouperDateLieu(valeur: string): { dateIso: string; lieu: string } {
  const v = valeur ?? "";
  const avecDate = /^\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\s*(?:(?:à|a|,|-)\s*)?([\s\S]*)$/i.exec(v);
  if (avecDate) {
    const dateIso = dateFrVersIso(avecDate[1]);
    if (dateIso) return { dateIso, lieu: avecDate[2] };
  }
  const sansDate = /^\s*à\s+([\s\S]*)$/i.exec(v);
  return { dateIso: "", lieu: sansDate ? sansDate[1] : v.trim() };
}

/** Inverse de `decouperDateLieu`. Le lieu n'est pas rogné : l'espace tapé entre deux mots doit survivre. */
export function composerDateLieu(dateIso: string, lieu: string): string {
  const date = dateIsoVersFr(dateIso);
  const reste = lieu.trim() ? `à ${lieu.replace(/^\s+/, "")}` : "";
  return [date, reste].filter(Boolean).join(" ");
}

/** Date ET lieu renseignés. */
export function dateLieuComplet(valeur: string): boolean {
  const { dateIso, lieu } = decouperDateLieu(valeur);
  return !!dateIso && !!lieu.trim();
}

// ========== Téléphone ==========

/** Numéro repris de l'enquête : mobile (06/07, ou étranger) pour le champ portable, fixe pour le domicile. */
export function classerTelephone(brut: string): "portable" | "fixe" {
  const t = (brut ?? "").replace(/[\s.\-()]/g, "").replace(/^(\+33|0033)/, "0");
  return /^0[1-59]\d{8}$/.test(t) ? "fixe" : "portable";
}
