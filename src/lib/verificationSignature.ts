// Qualification par l'AMO (niveau 1) de la pièce d'identité d'un signataire et du
// RIB d'un bulletin (0155, retour de A CHELGHAM du 09/10/2026 : « elles doivent être
// validées par l'AMO »). Même liste que QUALIFICATIONS_SIGNATURE dans l'edge
// function signature-flux, qui fixe le statut et le motif envoyé par e-mail.

export interface QualificationSignature {
  id: string;
  label: string;
  statut: "valide" | "refuse";
  /** motif par défaut du refus, selon la pièce ; vide = motif libre */
  piece: string;
  rib: string;
}

export const QUALIFICATIONS_SIGNATURE: QualificationSignature[] = [
  { id: "conforme", label: "Conforme", statut: "valide", piece: "", rib: "" },
  {
    id: "illisible",
    label: "Illisible",
    statut: "refuse",
    piece: "la pièce est illisible (photo floue, coupée ou trop sombre)",
    rib: "le RIB est illisible (photo floue, coupée ou trop sombre)",
  },
  {
    id: "incomplet",
    label: "Incomplet",
    statut: "refuse",
    piece: "il manque le recto ou le verso de la pièce",
    rib: "le RIB est incomplet (titulaire, IBAN ou BIC manquant)",
  },
  { id: "perime", label: "Pièce expirée", statut: "refuse", piece: "la pièce n'est plus en cours de validité", rib: "" },
  {
    id: "titulaire",
    label: "Autre titulaire",
    statut: "refuse",
    piece: "la pièce n'est pas au nom du signataire",
    rib: "le compte n'est pas au nom du signataire principal",
  },
  {
    id: "mauvais_document",
    label: "Mauvais document",
    statut: "refuse",
    piece: "le fichier déposé n'est pas une pièce d'identité",
    rib: "le fichier déposé n'est pas un relevé d'identité bancaire",
  },
  { id: "autre", label: "Autre motif", statut: "refuse", piece: "", rib: "" },
];

/** Qualifications proposées pour une pièce : « Pièce expirée » n'a pas de sens pour un RIB. */
export function qualificationsPour(quoi: "piece" | "rib"): QualificationSignature[] {
  return QUALIFICATIONS_SIGNATURE.filter((q) => q.id === "autre" || q.statut === "valide" || q[quoi] !== "");
}

/** Une qualification sans motif par défaut attend un texte libre avant d'envoyer le refus. */
export function motifLibreRequis(quoi: "piece" | "rib", id: string): boolean {
  const q = QUALIFICATIONS_SIGNATURE.find((x) => x.id === id);
  return !!q && q.statut === "refuse" && q[quoi] === "";
}

export function libelleQualificationSignature(id: string | null | undefined): string {
  return QUALIFICATIONS_SIGNATURE.find((q) => q.id === id)?.label ?? (id ?? "");
}
