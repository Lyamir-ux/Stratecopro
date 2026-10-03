// Éco-PTZ individuel (02/10/2026) : données du CERFA saisies au dépôt de
// l'audit réglementaire et des devis / CCTP / DPGF, et leurs contrôles.
// Module pur (sans accès réseau), partagé par l'API, le questionnaire et
// l'assemblage des documents.

/** Données de l'audit réglementaire reprises sur le CERFA (page 1). */
export interface AuditEcoPtz {
  reference?: string;
  date?: string;
  scenario?: string;
  cout_ttc?: string;
  classe_avant?: string;
  conso_avant?: string;
  classe_apres?: string;
  conso_apres?: string;
  gain_pct?: string;
  /** Auditeur (prestataire) et son interlocuteur signataire. */
  raison_sociale?: string;
  siret?: string;
  contact_nom?: string;
  contact_email?: string;
  contact_telephone?: string;
  /** Ville de l'auditeur, proposée pour « Fait à » à la signature. */
  ville?: string;
  /** Nom du fichier déposé qui a déclenché la saisie. */
  fichier?: string;
  prestataire_id?: string | null;
  saisi_par_role?: string;
  saisi_le?: string;
}

/** Entreprise d'un lot de travaux du PF (une ligne du CERFA). */
export interface PosteEcoPtzSaisi {
  lot_numero: number | string;
  titre?: string;
  /** Description du poste sur le CERFA (par défaut : titre du lot). */
  designation?: string;
  raison_sociale: string;
  siret?: string;
  contact_nom?: string;
  contact_email?: string;
  contact_telephone?: string;
  ville?: string;
  fichier?: string;
  prestataire_id?: string | null;
  statut?: "a_verifier" | "valide";
  saisi_par_role?: string;
  saisi_le?: string;
  supprimer?: boolean;
}

export interface DossierEcoPtz {
  copro_id: string;
  audit: AuditEcoPtz;
  audit_statut: "a_completer" | "a_verifier" | "valide";
  audit_valide_le: string | null;
  postes: Record<string, PosteEcoPtzSaisi>;
  updated_at: string;
}

export const CHAMPS_AUDIT_REQUIS: { cle: keyof AuditEcoPtz; label: string }[] = [
  { cle: "reference", label: "Référence de l'audit" },
  { cle: "date", label: "Date de réalisation" },
  { cle: "scenario", label: "Scénario de travaux retenu" },
  { cle: "classe_avant", label: "Classe avant travaux" },
  { cle: "conso_avant", label: "Consommation avant travaux" },
  { cle: "classe_apres", label: "Classe après travaux" },
  { cle: "conso_apres", label: "Consommation après travaux" },
  { cle: "gain_pct", label: "Gain énergétique" },
  { cle: "raison_sociale", label: "Nom de l'auditeur" },
  { cle: "siret", label: "SIRET de l'auditeur" },
  { cle: "contact_nom", label: "Interlocuteur de l'auditeur" },
  { cle: "contact_email", label: "E-mail de l'interlocuteur" },
];

export const emailValide = (e: string | null | undefined) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e ?? "").trim());
export const siretValide = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").length === 14;

/** Champs manquants de l'audit (libellés). */
export function manquantsAudit(a: AuditEcoPtz | undefined): string[] {
  const out = CHAMPS_AUDIT_REQUIS.filter((c) => !String(a?.[c.cle] ?? "").trim()).map((c) => c.label);
  if (a?.siret && !siretValide(a.siret)) out.push("SIRET de l'auditeur (14 chiffres)");
  if (a?.contact_email && !emailValide(a.contact_email)) out.push("E-mail de l'interlocuteur (format)");
  return out;
}

/** Champs manquants d'une entreprise de lot. */
export function manquantsPoste(p: PosteEcoPtzSaisi | undefined): string[] {
  if (!p?.raison_sociale?.trim()) return ["entreprise"];
  const out: string[] = [];
  if (!siretValide(p.siret)) out.push("SIRET");
  if (!p.contact_nom?.trim()) out.push("interlocuteur");
  if (!emailValide(p.contact_email)) out.push("e-mail du contact");
  return out;
}

/** Le dépôt d'un fichier de ce type ouvre le questionnaire éco-PTZ. */
export function questionnaireEcoPtzPour(type: string | null | undefined): "audit" | "travaux" | null {
  if (!type) return null;
  if (type === "audit_energetique") return "audit";
  if (["devis_travaux", "devis", "cctp_dce", "marche_travaux"].includes(type)) return "travaux";
  return null;
}

