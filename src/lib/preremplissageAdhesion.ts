// Préremplissage du dossier d'adhésion au prêt collectif d'après ce qu'on sait déjà du
// copropriétaire : sa réponse à l'enquête sociale d'abord, à défaut le libellé de sa fiche,
// jamais par-dessus ce qu'il a saisi ou enregistré (retours de A CHELGHAM du 11/10/2026 :
// « nom et prénom n'ont pas été repris de l'enquête sociale », « le lieu de la signature
// prérempli doit être la ville de l'adresse postale écrite dans l'enquête sociale »).

import { nomPrenomEnquete, separerNomPrenom } from "./nomFamille";

/** Nom et prénom tirés du libellé de la fiche quand on peut les trancher (ni couple, ni société,
 *  ni initiale seule comme « A CHELGHAM ») ; sinon champs vides, à saisir. */
export function identiteDeLaFiche(libelle: string): { nom?: string; prenom?: string } {
  return nomPrenomEnquete({}, libelle);
}

/** « NOM Prénom » d'après le libellé de la fiche quand on peut le trancher, sinon le libellé tel quel. */
export function nomPrenomDeLaFiche(libelle: string): string {
  const d = identiteDeLaFiche(libelle);
  return d.nom && d.prenom ? `${d.nom} ${d.prenom}` : libelle;
}

/**
 * Nom et prénom à proposer :
 * - `principal` : signataire principal (prénom et nom séparés) ; null = garder ceux de la fiche ;
 * - `adherent1` : « Nom et prénom » de l'adhérent 1 ; null = garder la saisie.
 * Un brouillon dont le « Nom et prénom » n'est plus celui de la fiche a été saisi par le
 * copropriétaire : il l'emporte et donne aussi le signataire principal. Sinon, les nom et prénom
 * de l'enquête, s'ils sont tous deux répondus.
 */
export function identiteProposee(
  libelleFiche: string,
  nomPrenomEnregistre: string | null | undefined,
  enquete: { nom?: string; prenom?: string },
): { principal: { nom: string; prenom: string } | null; adherent1: string | null } {
  const saisi = (nomPrenomEnregistre ?? "").trim();
  if (saisi && saisi !== nomPrenomDeLaFiche(libelleFiche).trim()) {
    return { principal: separerNomPrenom(saisi), adherent1: null };
  }
  const nom = enquete.nom?.trim();
  const prenom = enquete.prenom?.trim();
  if (!nom || !prenom) return { principal: null, adherent1: null };
  return { principal: { nom, prenom }, adherent1: `${nom} ${prenom}` };
}

/** Le lieu de signature n'a pas été choisi : vide, ou encore la ville de la copropriété (défaut). */
export function lieuParDefaut(lieu: string | null | undefined, villeCopro: string | null | undefined): boolean {
  const l = (lieu ?? "").trim();
  return !l || l === (villeCopro ?? "").trim();
}

/** Ville de l'adresse postale à proposer comme lieu de signature, ou null (lieu déjà choisi,
 *  ville inconnue). */
export function lieuSignaturePropose(
  lieuEnregistre: string | null | undefined,
  villeCopro: string | null | undefined,
  villeAdresse: string | null | undefined,
): string | null {
  const ville = (villeAdresse ?? "").trim();
  return ville && lieuParDefaut(lieuEnregistre, villeCopro) ? ville : null;
}
