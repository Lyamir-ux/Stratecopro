// Pièces justificatives attendues d'un copropriétaire selon ses réponses à
// l'enquête sociale (feedback Marius MAZZANTE 30/09/2026 : « chaque réponse
// déclenche la pièce à fournir, avec envoi du fichier et statut reçue /
// manquante »). Fonction pure, partagée par le portail (liste à déposer) et la
// fiche copropriétaire côté AMO (pièces manquantes du dossier).
//
// Règles :
// - ménage (personne physique, indivision, ou type pas encore répondu) : avis
//   d'imposition DÉFINITIF, toutes les pages (l'Anah refuse l'avis de situation
//   déclarative) ; deux déclarants = deux avis ;
// - usufruitier : taxe foncière à son nom ou acte mentionnant l'usufruit ;
// - SCI à l'impôt sur le revenu dont un associé occupe le logement : prêt à
//   usage notarié, Kbis de moins de 3 mois, statuts, avis de tous les associés ;
// - tutelle ou curatelle : jugement (les coordonnées du représentant sont une
//   question de l'enquête, pas une pièce).
import type { Enums } from "@/lib/database.types";

export type TypePiece = Enums<"type_piece">;

type Val = string | number | string[] | undefined;
type Reponses = Record<string, Val>;
export interface ReponsesPieces {
  copro?: Reponses;
  lots?: Record<string, Reponses>;
}

export interface PieceAttendue {
  type: TypePiece;
  nom: string;
  /** consigne affichée sous le nom (ce qui est accepté) */
  aide: string;
  /** réponse qui déclenche la demande */
  raison: string;
}

/** Libellés des pièces demandées selon la situation (hors pièces historiques du portail). */
export const PIECES_SITUATION: Record<string, { nom: string; aide: string }> = {
  avis_imposition: {
    nom: "Avis d'imposition définitif (N-1)",
    aide: "Toutes les pages. L'avis de situation déclarative n'est pas accepté par l'Anah.",
  },
  avis_imposition_2: {
    nom: "Second avis d'imposition définitif (N-1)",
    aide: "Avis du second déclarant du ménage, toutes les pages.",
  },
  justificatif_usufruit: {
    nom: "Justificatif d'usufruit",
    aide: "Taxe foncière à votre nom, ou acte mentionnant l'usufruit.",
  },
  pret_usage_notarie: {
    nom: "Contrat de prêt à usage notarié",
    aide: "Commodat passé devant notaire entre la SCI et l'associé occupant.",
  },
  kbis_sci: {
    nom: "Extrait Kbis de la SCI",
    aide: "De moins de 3 mois.",
  },
  statuts_sci: {
    nom: "Statuts de la SCI",
    aide: "Statuts à jour, signés.",
  },
  avis_associes_sci: {
    nom: "Avis d'imposition de tous les associés",
    aide: "Avis définitifs, toutes les pages, réunis en un seul fichier.",
  },
  jugement_protection: {
    nom: "Jugement de tutelle ou de curatelle",
    aide: "Jugement désignant le représentant légal.",
  },
};

const MENAGE = ["Personne physique", "Indivision"];
export const REPONSE_DEUX_AVIS = "Deux avis (deux déclarants)";
export const REPONSE_USUFRUITIER = "Oui, je suis usufruitier";
const SCI_IR = "SCI soumise à l'impôt sur le revenu";

const piece = (type: TypePiece, raison: string): PieceAttendue => ({
  type,
  nom: PIECES_SITUATION[type].nom,
  aide: PIECES_SITUATION[type].aide,
  raison,
});

export function piecesAttendues(rep: ReponsesPieces | null | undefined): PieceAttendue[] {
  const copro = rep?.copro ?? {};
  const lots = Object.values(rep?.lots ?? {});
  const type = copro["type-coproprietaire"];
  const menage = typeof type !== "string" || type === "" || MENAGE.includes(type);
  const out: PieceAttendue[] = [];

  if (menage) {
    out.push(piece("avis_imposition", "ressources du ménage"));
    if (copro["nb-avis-imposition"] === REPONSE_DEUX_AVIS) out.push(piece("avis_imposition_2", "deux déclarants"));
  }
  if (lots.some((l) => l["demembrement"] === REPONSE_USUFRUITIER)) {
    out.push(piece("justificatif_usufruit", "usufruitier"));
  }
  const associeOccupant = lots.some((l) => typeof l["associes-occupants"] === "number" && (l["associes-occupants"] as number) > 0);
  if (type === SCI_IR && associeOccupant) {
    const raison = "SCI à l'IR occupée par un associé";
    out.push(piece("pret_usage_notarie", raison), piece("kbis_sci", raison), piece("statuts_sci", raison), piece("avis_associes_sci", raison));
  }
  const protection = copro["curatelle-tutelle"];
  if (protection === "Tutelle" || protection === "Curatelle") {
    out.push(piece("jugement_protection", protection === "Tutelle" ? "tutelle" : "curatelle"));
  }
  return out;
}

/** Libellé d'une pièce, quelle qu'elle soit (situation ou pièce historique). */
export function libellePieceSituation(type: string): string | null {
  return PIECES_SITUATION[type]?.nom ?? null;
}
