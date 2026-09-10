// Nomenclature des fichiers déposés sur la plateforme.
// Format : {COPRO} - {Type} - {Objet} - {ÉMETTEUR} - {AAAA-MM-JJ}[ - {état}].ext
// Le vocabulaire des types est contrôlé : c'est lui qui garantit qu'un devis
// s'appelle toujours « Devis ». Saisie manuelle dans RenommageDialog à chaque
// dépôt (l'analyse automatique par IA a été retirée - trop coûteuse à l'usage).

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
  { id: "etude_thermique", label: "Étude thermique", dossier: "Devis des études techniques et Frais Annexes" },
  { id: "test_etancheite", label: "Test d'étanchéité", dossier: "Devis des études techniques et Frais Annexes" },
  { id: "diag_amiante_plomb", label: "Diagnostic amiante-plomb", dossier: "Devis des études techniques et Frais Annexes" },
  // Vie de la copro
  { id: "pv_ag", label: "PV AG", dossier: "Assemblée générale" },
  { id: "convocation_ag", label: "Convocation AG", dossier: "Assemblée générale" },
  { id: "pv_reception", label: "PV de réception", dossier: "Marchés de travaux" },
  // Contrats
  { id: "contrat_amo", label: "Contrat AMO", dossier: "Devis des études techniques et Frais Annexes" },
  { id: "contrat_moe", label: "Contrat MOE", dossier: "Devis des études techniques et Frais Annexes" },
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
  { id: "beneficiaires_effectifs", label: "Liste des bénéficiaires effectifs", dossier: "Marchés de travaux" },
  { id: "rib", label: "RIB", dossier: "Plans de financement" },
  { id: "immatriculation", label: "Immatriculation registre", dossier: "Plans de financement" },
  { id: "plan_financement", label: "Plan de financement", dossier: "Plans de financement" },
  { id: "accord_subvention", label: "Accord de subvention", dossier: "Plans de financement" },
  { id: "offre_pret", label: "Offre de prêt", dossier: "Plans de financement" },
  // Montage bancaire éco-PTZ collectif (feedback Amir 10/09/2026 : les types du
  // menu de dépôt reflètent les pièces demandées par la banque)
  { id: "fiche_renseignements", label: "Fiche de renseignements", dossier: "Plans de financement" },
  { id: "attestation_impayes", label: "Attestation du taux d'impayés", dossier: "Plans de financement" },
  { id: "reglement_copropriete", label: "Règlement de copropriété", dossier: "Passation" },
  { id: "fiche_synthetique", label: "Fiche synthétique de la copropriété", dossier: "Plans de financement" },
  { id: "attestation_registre", label: "Attestation registre national", dossier: "Plans de financement" },
  { id: "avis_sirene", label: "Avis de situation SIRENE", dossier: "Plans de financement" },
  { id: "annexes_comptables", label: "Annexes comptables", dossier: "Plans de financement" },
  { id: "attestation_assurance", label: "Attestation d'assurance", dossier: "Plans de financement" },
  { id: "contrat_syndic", label: "Contrat de syndic", dossier: "Passation" },
  { id: "delegation_pouvoirs", label: "Délégation de pouvoirs", dossier: "Plans de financement" },
  { id: "formulaire_ppe", label: "Formulaire PPE", dossier: "Plans de financement" },
  { id: "demande_pret", label: "Demande de prêt", dossier: "Plans de financement" },
  { id: "cerfa_ecoptz", label: "Formulaire éco-PTZ (CERFA)", dossier: "Plans de financement" },
  { id: "attestation_non_recours", label: "Attestation de non-recours", dossier: "Plans de financement" },
  { id: "attestation_caution", label: "Attestation de cautionnement", dossier: "Plans de financement" },
  { id: "fiche_etat_anah", label: "Fiche État ANAH", dossier: "Plans de financement" },
  // Assurance dommages-ouvrage
  { id: "questionnaire_assurance", label: "Questionnaire assurance chantier", dossier: "Devis des études techniques et Frais Annexes" },
  { id: "offre_assurance", label: "Offre d'assurance", dossier: "Devis des études techniques et Frais Annexes" },
  { id: "autorisation_urbanisme", label: "Autorisation d'urbanisme", dossier: "Devis des études techniques et Frais Annexes" },
  { id: "declaration_chantier", label: "Déclaration d'ouverture de chantier", dossier: "Marchés de travaux" },
  { id: "rapport_ct", label: "Rapport de contrôle technique", dossier: "Marchés de travaux" },
  { id: "convention_ct", label: "Convention de contrôle technique", dossier: "Devis des études techniques et Frais Annexes" },
  { id: "etude_sol", label: "Étude de sol", dossier: "Devis des études techniques et Frais Annexes" },
  // Justificatifs personnels (portail copropriétaire)
  { id: "avis_imposition", label: "Avis d'imposition", dossier: "Plans de financement" },
  { id: "piece_identite", label: "Pièce d'identité", dossier: "Plans de financement" },
  { id: "justificatif_domicile", label: "Justificatif de domicile", dossier: "Plans de financement" },
  { id: "taxe_fonciere", label: "Taxe foncière", dossier: "Plans de financement" },
  // Divers
  { id: "doc_passation", label: "Document de passation", dossier: "Passation" },
  { id: "rapport", label: "Rapport", dossier: "Diagnostic & audit" },
  { id: "photo", label: "Photo", dossier: "Photos chantier" },
  { id: "plan", label: "Plan", dossier: "Devis des études techniques et Frais Annexes" },
  { id: "courrier", label: "Courrier", dossier: "Assemblée générale" },
  { id: "autre", label: "Autre document", dossier: "Diagnostic & audit" },
];

/** Même liste, classée par ordre alphabétique pour les menus déroulants
 *  (feedback Amir 10/09/2026) - « Autre document » reste en dernier, c'est le repli. */
export const TYPES_DOCUMENT_TRIES: typeof TYPES_DOCUMENT = [
  ...TYPES_DOCUMENT.filter((t) => t.id !== "autre").sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" })),
  ...TYPES_DOCUMENT.filter((t) => t.id === "autre"),
];

export const typeLabel = (id: string): string => TYPES_DOCUMENT.find((t) => t.id === id)?.label ?? id;

/** Retrouve le type (id TYPES_DOCUMENT) d'un fichier d'après son nom normalisé
 *  ({COPRO} - {Type} - …) - sert aux dossiers récapitulatifs par dispositif.
 *  Retourne null si le nom ne suit pas la nomenclature. */
export function typeDepuisNom(name: string): string | null {
  const sansExt = name.replace(/\.[a-zA-Z0-9]{1,8}$/, "");
  const egal = (a: string, b: string) => a.localeCompare(b, "fr", { sensitivity: "base" }) === 0;
  // le type est en 2e segment (préfixe copro) ou en 1er (nom sans préfixe)
  for (const seg of sansExt.split(" - ").slice(0, 2)) {
    const t = TYPES_DOCUMENT.find((x) => egal(x.label, seg.trim()));
    if (t) return t.id;
  }
  return null;
}

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

/**
 * Nom de fichier sans accent ni caractère spécial (feedback d'Amir du
 * 09/09/2026) : les en-têtes de téléchargement encodent les accents en
 * « %C3%A9 » et certains systèmes les refusent. On garde lettres, chiffres,
 * espaces, points, tirets, soulignés et parenthèses ; le reste devient un tiret.
 * Appliqué au dépôt (nom enregistré) et au téléchargement (fichiers anciens).
 */
export function nomFichierSansAccents(nom: string): string {
  const propre = nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9 ._()-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/ {2,}/g, " ")
    .replace(/ ?- ?\./g, ".")
    .trim();
  return propre || "fichier";
}

/** Recrée un File du même contenu sous un autre nom. */
export function renommerFile(file: File, nouveauNom: string): File {
  return new File([file], nouveauNom, { type: file.type, lastModified: file.lastModified });
}
