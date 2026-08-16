// Nomenclature des fichiers déposés sur la plateforme.
// Format : {COPRO} - {Type} - {Objet} - {ÉMETTEUR} - {AAAA-MM-JJ}[ - {état}].ext
// Le vocabulaire des types est contrôlé : c'est lui qui garantit qu'un devis
// s'appelle toujours « Devis ». Saisie manuelle dans RenommageDialog à chaque
// dépôt (l'analyse automatique par IA a été retirée — trop coûteuse à l'usage).

/** Types de documents reconnus, avec le dossier de classement suggéré par défaut. */
export const TYPES_DOCUMENT: { id: string; label: string; dossier: string }[] = [
  // Chiffrage
  { id: "devis", label: "Devis", dossier: "Marchés de travaux" },
  { id: "facture", label: "Facture", dossier: "Marchés de travaux" },
  { id: "situation_travaux", label: "Situation de travaux", dossier: "Marchés de travaux" },
  // Études
  { id: "audit_energetique", label: "Audit énergétique", dossier: "Diagnostic & audit" },
  { id: "dpe_collectif", label: "DPE collectif", dossier: "Diagnostic & audit" },
  { id: "pppt", label: "PPPT", dossier: "Diagnostic & audit" },
  { id: "etude_thermique", label: "Étude thermique", dossier: "Études techniques" },
  { id: "test_etancheite", label: "Test d'étanchéité", dossier: "Études techniques" },
  { id: "diag_amiante_plomb", label: "Diagnostic amiante-plomb", dossier: "Études techniques" },
  // Vie de la copro
  { id: "pv_ag", label: "PV AG", dossier: "Assemblée générale" },
  { id: "convocation_ag", label: "Convocation AG", dossier: "Assemblée générale" },
  { id: "pv_reception", label: "PV de réception", dossier: "Marchés de travaux" },
  // Contrats
  { id: "contrat_amo", label: "Contrat AMO", dossier: "Études techniques" },
  { id: "contrat_moe", label: "Contrat MOE", dossier: "Études techniques" },
  { id: "marche_travaux", label: "Marché de travaux", dossier: "Marchés de travaux" },
  { id: "ordre_service", label: "Ordre de service", dossier: "Marchés de travaux" },
  { id: "cctp_dce", label: "CCTP / DCE", dossier: "Marchés de travaux" },
  // Attestations
  { id: "attestation_rge", label: "Attestation RGE", dossier: "Marchés de travaux" },
  { id: "attestation_decennale", label: "Attestation décennale", dossier: "Marchés de travaux" },
  { id: "ah_cee", label: "Attestation sur l'honneur CEE", dossier: "Plans de financement" },
  { id: "cadre_cee", label: "Cadre contribution CEE", dossier: "Plans de financement" },
  // Administratif / financement
  { id: "kbis", label: "Kbis", dossier: "Marchés de travaux" },
  { id: "rib", label: "RIB", dossier: "Plans de financement" },
  { id: "immatriculation", label: "Immatriculation registre", dossier: "Plans de financement" },
  { id: "plan_financement", label: "Plan de financement", dossier: "Plans de financement" },
  { id: "accord_subvention", label: "Accord de subvention", dossier: "Plans de financement" },
  { id: "offre_pret", label: "Offre de prêt", dossier: "Plans de financement" },
  // Justificatifs personnels (portail copropriétaire)
  { id: "avis_imposition", label: "Avis d'imposition", dossier: "Plans de financement" },
  { id: "piece_identite", label: "Pièce d'identité", dossier: "Plans de financement" },
  { id: "justificatif_domicile", label: "Justificatif de domicile", dossier: "Plans de financement" },
  { id: "taxe_fonciere", label: "Taxe foncière", dossier: "Plans de financement" },
  // Divers
  { id: "rapport", label: "Rapport", dossier: "Diagnostic & audit" },
  { id: "photo", label: "Photo", dossier: "Photos chantier" },
  { id: "plan", label: "Plan", dossier: "Études techniques" },
  { id: "courrier", label: "Courrier", dossier: "Assemblée générale" },
  { id: "autre", label: "Autre document", dossier: "Diagnostic & audit" },
];

export const typeLabel = (id: string): string => TYPES_DOCUMENT.find((t) => t.id === id)?.label ?? id;

export const dossierSuggere = (typeId: string): string | null =>
  TYPES_DOCUMENT.find((t) => t.id === typeId)?.dossier ?? null;

export interface ChampsNom {
  /** Préfixe identitaire : nom court de la copro (ou du copropriétaire au portail). */
  prefixe: string | null;
  type: string; // id TYPES_DOCUMENT
  objet: string | null;
  emetteur: string | null;
  date: string | null;
  etat: string | null;
}

/** Caractères interdits dans un nom de fichier (Windows + Storage), compactés. */
function nettoyerSegment(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extensionDe(filename: string): string {
  const m = /\.([a-zA-Z0-9]{1,8})$/.exec(filename);
  return m ? m[1].toLowerCase() : "";
}

/** Assemble le nom final : segments non vides joints par « - », extension conservée. */
export function construireNomFichier(champs: ChampsNom, extension: string): string {
  const segments = [
    champs.prefixe ? nettoyerSegment(champs.prefixe).toUpperCase() : null,
    typeLabel(champs.type),
    champs.objet ? nettoyerSegment(champs.objet) : null,
    champs.emetteur ? nettoyerSegment(champs.emetteur).toUpperCase() : null,
    champs.date && /^\d{4}-\d{2}-\d{2}$/.test(champs.date) ? champs.date : null,
    champs.etat ? nettoyerSegment(champs.etat) : null,
  ].filter((s): s is string => !!s && s.length > 0);
  const nom = segments.join(" - ");
  return extension ? `${nom}.${extension}` : nom;
}

/** Recrée un File du même contenu sous un autre nom. */
export function renommerFile(file: File, nouveauNom: string): File {
  return new File([file], nouveauNom, { type: file.type, lastModified: file.lastModified });
}
