// Dossier d'un adhérent au prêt collectif, tel que la Caisse d'Épargne Grand Est le
// veut (classeur « 00 - NOMENCLATURE A RESPECTER » reçu le 08/10/2026, section
// « 03 - ADHERENTS ») : les pièces dans l'ordre de la nomenclature, et un seul PDF
// par adhérent, nommé « NOM prénom » (« NOM SCI » pour une société), copropriété
// ensuite. Fonctions pures : l'état de chaque pièce vient de assemblerDossiers.
import { cleNomFamille, type ConventionNoms } from "@/lib/nomFamille";
import { nomFichierSansAccents } from "@/lib/nommage";

/** « personne physique » : adhérent ou indivision ; « sci » : société civile immobilière. */
export type NatureAdherent = "physique" | "sci";

export type EtatLigne = "ok" | "en_cours" | "manquant" | "na";

export type CleLigne =
  | "bulletin"
  | "identite"
  | "domicile"
  | "irpp"
  | "sepa"
  | "rib"
  | "taxe_fonciere"
  | "juge"
  | "kbis"
  | "statuts";

export interface LigneBanque {
  cle: CleLigne;
  /** Numéro de la ligne dans la nomenclature de la banque (01, 02, …). */
  rang: number;
  label: string;
  etat: EtatLigne;
}

interface ModeleLigne {
  cle: CleLigne;
  rang: number;
  label: string;
}

/**
 * Personne physique - lignes 01 à 08 de la banque. L'accord du juge ne concerne que
 * l'adhérent sous tutelle : sans tutelle la ligne est « sans objet ».
 */
const PHYSIQUE: ModeleLigne[] = [
  { cle: "bulletin", rang: 1, label: "Bulletin d'adhésion" },
  { cle: "identite", rang: 2, label: "Pièce d'identité" },
  { cle: "domicile", rang: 3, label: "Justificatif de domicile de moins de 3 mois" },
  { cle: "irpp", rang: 4, label: "Avis d'imposition (IRPP)" },
  { cle: "sepa", rang: 5, label: "Mandat SEPA" },
  { cle: "rib", rang: 6, label: "RIB" },
  { cle: "taxe_fonciere", rang: 7, label: "Taxe foncière ou attestation notariée de propriété du lot" },
  { cle: "juge", rang: 8, label: "Accord du juge (tutelle)" },
];

/**
 * SCI - lignes 01 à 10 de la banque, sauf la ligne 07 (formulaire n° 2072) : le
 * logiciel n'a pas de pièce « 2072 », elle reste à ajouter à la main avant l'envoi.
 */
const SCI: ModeleLigne[] = [
  { cle: "bulletin", rang: 1, label: "Bulletin d'adhésion au nom de la SCI" },
  { cle: "identite", rang: 2, label: "Pièce d'identité du ou des gérants" },
  { cle: "kbis", rang: 3, label: "Extrait Kbis de moins de 3 mois" },
  { cle: "statuts", rang: 4, label: "Statuts de la SCI (et PV d'AG autorisant le gérant à emprunter)" },
  { cle: "domicile", rang: 5, label: "Justificatif de domicile de moins de 3 mois" },
  { cle: "irpp", rang: 6, label: "Avis d'imposition des associés (IRPP)" },
  { cle: "sepa", rang: 8, label: "Mandat SEPA de la SCI" },
  { cle: "rib", rang: 9, label: "RIB de la SCI" },
  { cle: "taxe_fonciere", rang: 10, label: "Taxe foncière ou attestation notariée de propriété du lot" },
];

/** Lignes du dossier adhérent dans l'ordre de la nomenclature, avec l'état de chacune. */
export function lignesDossierBanque(nature: NatureAdherent, etats: Partial<Record<CleLigne, EtatLigne>>): LigneBanque[] {
  return (nature === "sci" ? SCI : PHYSIQUE).map((m) => ({ ...m, etat: etats[m.cle] ?? "na" }));
}

/** Toutes les lignes utiles sont fournies (celles « sans objet » ne comptent pas). */
export const dossierBanqueComplet = (lignes: LigneBanque[]): boolean => lignes.every((l) => l.etat === "ok" || l.etat === "na");

/** Le moins avancé de plusieurs états (un avis par déclarant : le dossier vaut son avis le plus en retard). */
export function pireEtat(...etats: EtatLigne[]): EtatLigne {
  const utiles = etats.filter((e) => e !== "na");
  if (!utiles.length) return "na";
  return utiles.includes("manquant") ? "manquant" : utiles.includes("en_cours") ? "en_cours" : "ok";
}

/**
 * Nom du fichier unique d'un adhérent : « NOM prénom - COPRO.pdf » - le nom de la
 * banque d'abord, la copropriété après (règle d'Amir du 08/10/2026). La convention de
 * saisie de la liste (« NOM Prénom » ou « Prénom NOM ») est lue par conventionNoms.
 */
export function nomFichierDossierAdherent(nom: string, coproNom: string, convention: ConventionNoms): string {
  const adherent = cleNomFamille(nom, convention);
  return nomFichierSansAccents(`${adherent} - ${coproNom.trim().toUpperCase()}.pdf`);
}

/** Nom unique dans une série : un homonyme reçoit « (2) », « (3) »… avant l'extension. */
export function nomUniqueDansSerie(nom: string, deja: Set<string>): string {
  let candidat = nom;
  for (let i = 2; deja.has(candidat.toLowerCase()); i++) candidat = nom.replace(/(\.[a-z0-9]+)?$/i, ` (${i})$1`);
  deja.add(candidat.toLowerCase());
  return candidat;
}
