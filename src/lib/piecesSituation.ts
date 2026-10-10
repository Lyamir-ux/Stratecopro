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
//   question de l'enquête, pas une pièce) ;
// - adhérent au prêt collectif (dossier suivi par Strat Eco, 08/10/2026) : en plus,
//   les pièces de la nomenclature de la Caisse d'Épargne Grand Est - justificatif de
//   domicile, taxe foncière ou attestation notariée, et pour une SCI l'extrait
//   Kbis, les statuts et les avis d'imposition des associés. Au portail, elles se
//   déposent après la signature des bulletins (piecesDossierPret, 09/10/2026).
import type { Enums } from "@/lib/database.types";
import { fmtDate } from "@/lib/format";

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
  justificatif_domicile: {
    nom: "Justificatif de domicile de moins de 3 mois",
    aide: "Facture d'énergie, d'eau ou de téléphone, ou quittance de loyer, datée de moins de 3 mois à la date de signature de votre bulletin d'adhésion.",
  },
  taxe_fonciere: {
    nom: "Taxe foncière ou attestation notariée de propriété du lot",
    aide: "Dernier avis de taxe foncière, toutes les pages, ou attestation du notaire.",
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
    aide: "Statuts à jour, signés, avec le PV d'AG autorisant le gérant à emprunter au nom de la SCI le cas échéant (un seul fichier).",
  },
  avis_associes_sci: {
    nom: "Avis d'imposition de tous les associés",
    aide: "Avis définitifs, toutes les pages, réunis en un seul fichier.",
  },
  jugement_protection: {
    nom: "Jugement de tutelle ou de curatelle",
    aide: "Jugement désignant le représentant légal. Pour une tutelle, joignez dans le même fichier l'accord du juge pour l'emprunt.",
  },
};

const MENAGE = ["Personne physique", "Indivision"];
export const REPONSE_DEUX_AVIS = "Deux avis (deux déclarants)";
export const REPONSE_USUFRUITIER = "Oui, je suis usufruitier";
const SCI_IR = "SCI soumise à l'impôt sur le revenu";

/** Raison affichée pour une pièce demandée par la banque (adhérent au prêt collectif). */
export const RAISON_PRET = "dossier de prêt de la banque";

/** Contexte de la demande : ce que les réponses à l'enquête ne disent pas. */
export interface ContextePieces {
  /** Adhérent au prêt collectif par le parcours interne : la banque demande des pièces en plus. */
  pretCollectif?: boolean;
  /** Société civile immobilière reconnue à son nom quand le type n'a pas été répondu. */
  sci?: boolean;
}

/** SCI d'après le type répondu à l'enquête, à défaut d'après le nom (« SCI DU RIED »). */
export function estSci(typeReponse: unknown, nom?: string | null): boolean {
  if (typeof typeReponse === "string" && typeReponse !== "") return typeReponse.startsWith("SCI");
  return /^\s*(sci|s\.c\.i\.?)(\s|$)/i.test(nom ?? "");
}

const piece = (type: TypePiece, raison: string): PieceAttendue => ({
  type,
  nom: PIECES_SITUATION[type].nom,
  aide: PIECES_SITUATION[type].aide,
  raison,
});

export function piecesAttendues(rep: ReponsesPieces | null | undefined, contexte: ContextePieces = {}): PieceAttendue[] {
  const copro = rep?.copro ?? {};
  const lots = Object.values(rep?.lots ?? {});
  const type = copro["type-coproprietaire"];
  const sci = estSci(type, null) || (!!contexte.sci && (typeof type !== "string" || type === ""));
  const menage = !sci && (typeof type !== "string" || type === "" || MENAGE.includes(type));
  const out: PieceAttendue[] = [];
  const ajouter = (t: TypePiece, raison: string) => {
    if (!out.some((p) => p.type === t)) out.push(piece(t, raison));
  };

  if (menage) {
    ajouter("avis_imposition", "ressources du ménage");
    if (copro["nb-avis-imposition"] === REPONSE_DEUX_AVIS) ajouter("avis_imposition_2", "deux déclarants");
  }
  // pièces de la nomenclature de la banque (08/10/2026), dans l'ordre de son dossier adhérent
  if (contexte.pretCollectif) {
    ajouter("justificatif_domicile", RAISON_PRET);
    if (sci) for (const t of ["kbis_sci", "statuts_sci", "avis_associes_sci"] as const) ajouter(t, RAISON_PRET);
    ajouter("taxe_fonciere", RAISON_PRET);
  }
  if (lots.some((l) => l["demembrement"] === REPONSE_USUFRUITIER)) {
    ajouter("justificatif_usufruit", "usufruitier");
  }
  const associeOccupant = lots.some((l) => typeof l["associes-occupants"] === "number" && (l["associes-occupants"] as number) > 0);
  if (type === SCI_IR && associeOccupant) {
    const raison = "SCI à l'IR occupée par un associé";
    for (const t of ["pret_usage_notarie", "kbis_sci", "statuts_sci", "avis_associes_sci"] as const) ajouter(t, raison);
  }
  const protection = copro["curatelle-tutelle"];
  if (protection === "Tutelle" || protection === "Curatelle") {
    ajouter("jugement_protection", protection === "Tutelle" ? "tutelle" : "curatelle");
  }
  return out;
}

// Où chaque pièce se dépose au portail (retour de A CHELGHAM, 09/10/2026 : les pièces
// du prêt « sont la continuité de la signature du bulletin ») : l'enquête sociale ne
// demande que les pièces de la situation déclarée ; les pièces que la banque demande
// en plus se déposent dans « Mon financement », une fois les bulletins signés.
// L'espace AMO garde la liste complète (piecesAttendues).

/** Pièces demandées dans l'enquête sociale : la situation déclarée, jamais le dossier de prêt. */
export function piecesEnquete(rep: ReponsesPieces | null | undefined, contexte: ContextePieces = {}): PieceAttendue[] {
  return piecesAttendues(rep, { ...contexte, pretCollectif: false });
}

/**
 * Pièces du dossier de prêt collectif à déposer dans « Mon financement » : celles de
 * la banque que l'enquête ne demande pas déjà (une SCI à l'IR occupée par un associé
 * dépose son Kbis dans l'enquête, une seule fois).
 */
export function piecesDossierPret(rep: ReponsesPieces | null | undefined, contexte: ContextePieces = {}): PieceAttendue[] {
  if (!contexte.pretCollectif) return [];
  const dansEnquete = new Set(piecesEnquete(rep, contexte).map((p) => p.type));
  return piecesAttendues(rep, contexte).filter((p) => p.raison === RAISON_PRET && !dansEnquete.has(p.type));
}

/**
 * Bulletins d'adhésion signés par le copropriétaire : au moins un bulletin, et aucun
 * encore en préparation (les cosignataires peuvent rester à signer). Un ancien
 * dossier signé avant la signature électronique compte aussi.
 */
export function bulletinsSignes(bulletins: { statut: string }[] | null | undefined, ancienDossierSigne = false): boolean {
  const actifs = (bulletins ?? []).filter((b) => b.statut !== "annule");
  return ancienDossierSigne || (actifs.length > 0 && actifs.every((b) => b.statut !== "brouillon"));
}

/** Ce que le dossier de prêt lit d'un bulletin et de ses signataires. */
export interface BulletinPieces {
  id: string;
  statut: string;
  purge_effectuee_le: string | null;
  rib_path: string | null;
  iban_dernier4: string | null;
  mandat_signe_le: string | null;
  rib_statut: StatutPieceSignature | null;
  rib_motif_refus: string | null;
  rib_verifiee_le: string | null;
  signataires: {
    id: string;
    role: string;
    ordre: number;
    prenom: string;
    nom: string;
    email: string;
    signe_le: string | null;
    piece_identite_path: string | null;
    piece_deposee_le: string | null;
    piece_identite_type: string | null;
    piece_statut: StatutPieceSignature | null;
    piece_motif_refus: string | null;
    piece_verifiee_le: string | null;
    piece_remplacee_le: string | null;
  }[];
}

export type StatutPieceSignature = "a_verifier" | "valide" | "refuse";

/** Une ligne concernée par une pièce de la signature : un bulletin (et son signataire). */
export interface CiblePieceSignature {
  bulletinId: string;
  signataireId: string | null;
  path: string | null;
}

/** Pièce du dossier de prêt fournie à la signature, avec sa validation par l'AMO (0155). */
export interface PieceSignature {
  cle: string;
  quoi: "piece" | "rib";
  nom: string;
  /** null : pas encore déposée (un cosignataire la dépose depuis son lien) */
  statut: StatutPieceSignature | null;
  motif: string | null;
  detail: string;
  /** le signataire a signé : sa pièce (ou le RIB) se remplace depuis le portail */
  remplacable: boolean;
  /** pièce effacée après l'instruction du dossier (CGU art. 7.4.1) */
  purgee: boolean;
  principal: boolean;
  personne: string;
  /** une par bulletin signé : même personne, ou même RIB */
  cibles: CiblePieceSignature[];
  /** fichier à montrer pour « Voir » (null : rien de déposé, ou pièce purgée) */
  apercu: CiblePieceSignature | null;
}

const LIBELLES_PIECE_IDENTITE: Record<string, string> = {
  cni: "Carte nationale d'identité",
  passeport: "Passeport",
  titre_sejour: "Titre de séjour",
};

/** Statut d'une pièce déposée sur plusieurs bulletins : le moins avancé l'emporte. */
function statutCommun(statuts: (StatutPieceSignature | null)[]): StatutPieceSignature | null {
  const deposes = statuts.filter((x): x is StatutPieceSignature => !!x);
  if (deposes.length === 0) return null;
  if (deposes.includes("refuse")) return "refuse";
  if (deposes.includes("a_verifier")) return "a_verifier";
  return "valide";
}

/** Fin du détail d'une pièce : où en est sa validation par Strat Eco. */
function suiteStatut(statut: StatutPieceSignature | null, verifieeLe: string | null, e: "" | "e"): string {
  if (statut === "valide") return `validé${e} par Strat Eco le ${fmtDate(verifieeLe)}`;
  if (statut === "refuse") return `refusé${e} le ${fmtDate(verifieeLe)}`;
  return "en attente de validation par Strat Eco";
}

/**
 * Pièces du dossier de prêt fournies à la signature : la pièce d'identité de chaque
 * signataire (une fois par personne, quel que soit le nombre de bulletins) et le RIB
 * du prélèvement, chacune avec sa validation par l'AMO (retours de A CHELGHAM,
 * 09/10/2026 : « remettre dans l'encadré les pièces déjà fournies », puis « pouvoir
 * les visualiser et les remplacer ; elles doivent être validées par l'AMO »).
 */
export function piecesFourniesSignature(bulletins: BulletinPieces[] | null | undefined): PieceSignature[] {
  const actifs = (bulletins ?? []).filter((b) => b.statut !== "annule" && b.statut !== "brouillon");
  type Ligne = BulletinPieces["signataires"][number] & { bulletin: BulletinPieces };
  const personnes = new Map<string, Ligne[]>();
  for (const b of actifs) {
    for (const s of b.signataires) {
      const cle = (s.email || `${s.prenom} ${s.nom}`).trim().toLowerCase();
      personnes.set(cle, [...(personnes.get(cle) ?? []), { ...s, bulletin: b }]);
    }
  }
  const out: PieceSignature[] = [...personnes.entries()]
    .map(([cle, lignes]) => ({
      cle,
      lignes,
      principal: lignes.some((l) => l.role === "principal"),
      ordre: Math.min(...lignes.map((l) => l.ordre)),
    }))
    .sort((a, b) => Number(b.principal) - Number(a.principal) || a.ordre - b.ordre)
    .map(({ cle, lignes, principal }) => {
      const personne = `${lignes[0].prenom} ${lignes[0].nom}`.trim();
      const deposees = lignes.filter((l) => !!l.piece_deposee_le);
      const statut = statutCommun(deposees.map((l) => l.piece_statut ?? "a_verifier"));
      // la ligne de référence : la pièce la moins avancée dans sa validation
      const ref = deposees.find((l) => (l.piece_statut ?? "a_verifier") === statut) ?? lignes[0];
      const purgee = lignes.every((l) => !!l.bulletin.purge_effectuee_le);
      const type = LIBELLES_PIECE_IDENTITE[ref.piece_identite_type ?? ""] ?? "Pièce d'identité";
      const depot = ref.piece_remplacee_le
        ? `remplacée le ${fmtDate(ref.piece_remplacee_le)}`
        : `déposée le ${fmtDate(ref.piece_deposee_le)}, à la signature`;
      return {
        cle: "identite:" + cle,
        quoi: "piece" as const,
        nom: `Pièce d'identité de ${personne}${principal ? " (vous)" : ""}`,
        statut,
        motif: statut === "refuse" ? ref.piece_motif_refus : null,
        detail: purgee
          ? "Supprimée après l'instruction de votre dossier (conservation limitée)"
          : deposees.length === 0
            ? "À déposer depuis le lien personnel de signature reçu par e-mail"
            : `${type} · ${depot} · ${suiteStatut(statut, ref.piece_verifiee_le, "e")}`,
        remplacable: !purgee && lignes.some((l) => !!l.signe_le && !!l.piece_identite_path),
        purgee,
        principal,
        personne,
        cibles: lignes
          .filter((l) => !!l.signe_le && !l.bulletin.purge_effectuee_le)
          .map((l) => ({ bulletinId: l.bulletin.id, signataireId: l.id, path: l.piece_identite_path })),
        apercu: ref.piece_identite_path && !ref.bulletin.purge_effectuee_le
          ? { bulletinId: ref.bulletin.id, signataireId: ref.id, path: ref.piece_identite_path }
          : null,
      };
    });

  const avecRib = actifs.filter((b) => !!b.rib_path);
  if (avecRib.length > 0) {
    const fins = [...new Set(avecRib.map((b) => b.iban_dernier4).filter((x): x is string => !!x))];
    const mandats = avecRib.map((b) => b.mandat_signe_le).filter((x): x is string => !!x).sort();
    const statut = statutCommun(avecRib.map((b) => b.rib_statut ?? "a_verifier"));
    const ref = avecRib.find((b) => (b.rib_statut ?? "a_verifier") === statut) ?? avecRib[0];
    const principalSigne = (b: BulletinPieces) => b.signataires.some((s) => s.role === "principal" && !!s.signe_le);
    out.push({
      cle: "rib",
      quoi: "rib",
      nom: "RIB du compte de prélèvement",
      statut,
      motif: statut === "refuse" ? ref.rib_motif_refus : null,
      detail: [
        fins.length ? `IBAN se terminant par ${fins.join(", ")}` : "Déposé avec votre bulletin",
        mandats.length ? `mandat SEPA signé le ${fmtDate(mandats[mandats.length - 1])}` : "",
        suiteStatut(statut, ref.rib_verifiee_le, ""),
      ]
        .filter(Boolean)
        .join(" · "),
      remplacable: avecRib.some(principalSigne),
      purgee: false,
      principal: true,
      personne: "",
      cibles: avecRib.filter(principalSigne).map((b) => ({ bulletinId: b.id, signataireId: null, path: b.rib_path })),
      apercu: { bulletinId: ref.id, signataireId: null, path: ref.rib_path },
    });
  }
  return out;
}

/** Libellé d'une pièce, quelle qu'elle soit (situation ou pièce historique). */
export function libellePieceSituation(type: string): string | null {
  return PIECES_SITUATION[type]?.nom ?? null;
}
