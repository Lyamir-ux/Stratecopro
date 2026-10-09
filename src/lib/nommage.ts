// Nomenclature des fichiers déposés sur la plateforme.
// Format : {COPRO} - {Type} - {Objet} - {ÉMETTEUR} - {AAAA-MM-JJ}[ - {état}].ext
// Le vocabulaire des types est contrôlé : c'est lui qui garantit qu'un devis
// s'appelle toujours « Devis ». Saisie manuelle dans RenommageDialog à chaque
// dépôt (l'analyse automatique par IA a été retirée - trop coûteuse à l'usage).
//
// Pièces du dossier de prêt de la Caisse d'Épargne Grand Est (08/10/2026) : le
// nom commence par le terme de la colonne D de sa « nomenclature de
// numérisation » (NOMENCLATURE_CEGEE), le nom de la copropriété vient après :
//   {TERME CEGEE} - {COPRO} - {Objet} - {ÉMETTEUR} - {AAAA-MM-JJ}[ - {état}].ext
// Devis et contrats (feedback Amir du 09/10/2026) : l'entreprise suit le terme,
// la copropriété vient ensuite (TERMES_ENTREPRISE_EN_TETE) :
//   DEVIS ENTREPRISE - {ÉMETTEUR} - {COPRO} - {Objet} - {AAAA-MM-JJ}[ - {état}].ext
// Certificat RGE : l'entreprise est collée au terme, sans la copropriété :
//   RGE {ÉMETTEUR} - {Objet} - {AAAA-MM-JJ}[ - {état}].ext
// Les formats coexistent : les fichiers déjà déposés sont toujours reconnus
// (typesDepuisNom, champsDepuisNom).

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
  // Pièces du dossier CEGEE qui n'avaient pas de type propre (08/10/2026) : un type
  // par pièce, pour que chacune reçoive le terme de la nomenclature de la banque
  { id: "attestation_mri", label: "Attestation d'assurance multirisque immeuble", dossier: "Plans de financement" },
  { id: "cni_signataire", label: "Pièce d'identité du signataire de l'offre de prêt", dossier: "Plans de financement" },
  { id: "rib_compte_copro", label: "RIB du compte de la copropriété", dossier: "Plans de financement" },
  { id: "preuve_envoi_convocation", label: "Preuve d'envoi des convocations d'AG", dossier: "Assemblée générale" },
  { id: "accord_sub_rib", label: "Attestation de prise en compte du RIB (subventions)", dossier: "Plans de financement" },
  // Pièces communes à plusieurs dispositifs (feedback Amir 13/09/2026 : un
  // type par pièce de checklist, pour qu'un dépôt coche la pièce partout où
  // elle est attendue - ANAH, EMS & Climaxion, éco-PTZ, CEE, assurance)
  { id: "pv_ag_travaux", label: "PV AG vote des travaux", dossier: "Assemblée générale" },
  { id: "pv_ag_mandat", label: "PV AG mandat du syndic", dossier: "Assemblée générale" },
  { id: "pv_ag_moe", label: "PV AG choix de la maîtrise d'œuvre", dossier: "Assemblée générale" },
  { id: "pv_ag_lancement_amo", label: "PV AG lancement de l'AMO", dossier: "Assemblée générale" },
  { id: "rib_compte_travaux", label: "RIB du compte travaux", dossier: "Plans de financement" },
  { id: "rib_entreprises", label: "RIB entreprise", dossier: "Marchés de travaux" },
  { id: "devis_travaux", label: "Devis / DPGF des travaux", dossier: "Marchés de travaux" },
  { id: "devis_honoraires_moe", label: "Devis honoraires MOE et études", dossier: "Devis des études techniques et Frais Annexes" },
  { id: "devis_fenetres", label: "Devis remplacement des fenêtres", dossier: "Marchés de travaux" },
  { id: "pf_definitif", label: "Plan de financement définitif", dossier: "Plans de financement" },
  { id: "liste_primes_individuelles", label: "Liste des primes individuelles", dossier: "Plans de financement" },
  { id: "rapport_enquete_sociale", label: "Rapport d'enquête sociale", dossier: "Diagnostic & audit" },
  { id: "ah_cee_a", label: "Attestation sur l'honneur CEE partie A", dossier: "Plans de financement" },
  { id: "ah_cee_b", label: "Attestation sur l'honneur CEE partie B", dossier: "Plans de financement" },
  { id: "attestation_rge_facture", label: "Attestation RGE à date de facture", dossier: "Marchés de travaux" },
  { id: "cerfa_ecoptz_emprunteur", label: "Formulaire éco-PTZ emprunteur", dossier: "Plans de financement" },
  { id: "cerfa_ecoptz_entreprise", label: "Formulaire éco-PTZ entreprise", dossier: "Plans de financement" },
  // éco-PTZ individuel (02/10/2026) : attestation des montants éligibles d'un logement, signée par le syndic
  { id: "attestation_ecoptz_individuel", label: "Attestation éco-PTZ individuel", dossier: "Plans de financement" },
  { id: "liste_participants_pret", label: "Liste des copropriétaires participant au prêt", dossier: "Plans de financement" },
  { id: "dossier_demande_aide", label: "Dossier de demande d'aide", dossier: "Plans de financement" },
  // Dossier CEE en 3 étapes (feedback Amir 13/09/2026)
  { id: "aif_cee", label: "AIF CEE à signer", dossier: "Plans de financement" },
  { id: "aif_cee_signee", label: "AIF CEE signée", dossier: "Plans de financement" },
  { id: "rapport_cofrac_1", label: "Rapport complémentaire COFRAC 1", dossier: "Marchés de travaux" },
  { id: "rapport_cofrac_2", label: "Rapport complémentaire COFRAC 2", dossier: "Marchés de travaux" },
  // Dossier EMS & Climaxion (feedback Amir 13/09/2026)
  { id: "attestation_composition", label: "Attestation de composition de la copropriété", dossier: "Plans de financement" },
  { id: "attestation_logement_decent", label: "Attestation logement décent", dossier: "Plans de financement" },
  { id: "mandat_delegation_depot", label: "Mandat de délégation de dépôt", dossier: "Plans de financement" },
  { id: "offre_moe", label: "Offre de maîtrise d'œuvre", dossier: "Devis des études techniques et Frais Annexes" },
  { id: "memoire_technique", label: "Mémoire technique", dossier: "Marchés de travaux" },
  { id: "attestation_conformite_offres", label: "Attestation de conformité des offres", dossier: "Marchés de travaux" },
  { id: "rapport_conformite_offres", label: "Rapport de conformité des offres", dossier: "Marchés de travaux" },
  { id: "planning", label: "Planning prévisionnel", dossier: "Marchés de travaux" },
  { id: "liste_beneficiaires", label: "Liste des bénéficiaires", dossier: "Plans de financement" },
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
  // pièces demandées selon la situation (enquête sociale, 0118)
  { id: "avis_imposition_2", label: "Avis d'imposition second déclarant", dossier: "Plans de financement" },
  { id: "justificatif_usufruit", label: "Justificatif d'usufruit", dossier: "Plans de financement" },
  { id: "pret_usage_notarie", label: "Contrat de prêt à usage", dossier: "Plans de financement" },
  { id: "kbis_sci", label: "Extrait Kbis", dossier: "Plans de financement" },
  { id: "statuts_sci", label: "Statuts de SCI", dossier: "Plans de financement" },
  { id: "avis_associes_sci", label: "Avis d'imposition des associés", dossier: "Plans de financement" },
  { id: "jugement_protection", label: "Jugement de tutelle ou curatelle", dossier: "Plans de financement" },
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

// ========== Nomenclature de numérisation de la Caisse d'Épargne Grand Est ==========

/**
 * Termes de la colonne D du classeur « 00 - NOMENCLATURE A RESPECTER » de la
 * CEGEE (reçu le 08/10/2026), par type de document : un fichier de ce type
 * commence par ce terme, la copropriété vient après. Orthographe de la banque
 * conservée (« Mail CEGC », « PROJET de CONTRAT »).
 *
 * - Plusieurs types peuvent partager un terme (le RIB du compte de la copropriété et
 *   celui du compte travaux : « RIB COMPTE TRAVAUX » chez la banque ; tous les devis
 *   et marchés de travaux : « DEVIS ENTREPRISE » ; devis d'honoraires et contrats
 *   AMO, MOE, DO, contrôle technique : « DEVIS HONORAIRES »).
 * - Une cellule à « / » de la banque (« KBIS SYNDIC / STATUTS SYNDIC ») désigne
 *   deux pièces : « / » est interdit dans un nom de fichier, chaque pièce
 *   prend son terme.
 * - Les justificatifs d'un adhérent (pièce d'identité, avis d'imposition, RIB,
 *   bulletin…) n'y figurent pas : la banque les veut regroupés dans un seul PDF
 *   « NOM prénom ».
 * - Les pièces de la banque sans terme (offre de prêt, compte travaux) et les
 *   pièces propres à Strat Eco gardent le format « {COPRO} - {Type} ».
 */
export const NOMENCLATURE_CEGEE: Record<string, string> = {
  // 01 - Demande de prêt + documents du syndicat
  demande_pret: "DEMANDE DE PRET",
  fiche_synthetique: "FICHE ANAH",
  attestation_registre: "MISE A JOUR ANNUELLE",
  avis_sirene: "SIRENE",
  attestation_impayes: "TAUX DE DEFAILLANCE",
  fiche_etat_anah: "FICHE ETAT",
  accord_subvention: "NOTIF ACCORD SUB",
  accord_sub_rib: "ACCORD SUB RIB",
  // 02 - Syndic
  delegation_pouvoirs: "DELEGATION POUVOIRS",
  formulaire_ppe: "PPE SIGNATAIRE",
  cni_signataire: "CNI SIGNATAIRE",
  contrat_syndic: "CONTRAT SYNDIC",
  // 04 - Projet
  pv_ag_travaux: "PV AG TRAVAUX",
  pv_ag_mandat: "PV AG SYNDIC",
  attestation_non_recours: "ATT. NON RECOURS",
  annexes_comptables: "ANNEXES COMPTABLES",
  attestation_mri: "MRI",
  // « Devis détaillés des travaux - 1 an / Marché de travaux »
  devis_travaux: "DEVIS ENTREPRISE",
  devis: "DEVIS ENTREPRISE", // devis du dossier des études : DEVIS HONORAIRES (termeNomenclature)
  devis_fenetres: "DEVIS ENTREPRISE",
  marche_travaux: "DEVIS ENTREPRISE",
  // « Devis des honoraires (syndic, maîtrise d'oeuvre, SPS, DO, bureau de contrôle,
  // diagnostic amiante...) » : contrats AMO et MOE compris (feedback Amir 09/10/2026)
  devis_honoraires_moe: "DEVIS HONORAIRES",
  contrat_amo: "DEVIS HONORAIRES",
  contrat_moe: "DEVIS HONORAIRES",
  offre_moe: "DEVIS HONORAIRES",
  offre_assurance: "DEVIS HONORAIRES",
  convention_ct: "DEVIS HONORAIRES",
  // 05 - Éco-PTZ copropriété
  audit_energetique: "AUDIT",
  cerfa_ecoptz_emprunteur: "FORMULAIRE EMPRUNTEUR",
  cerfa_ecoptz_entreprise: "FORMULAIRE ENTREPRISES",
  attestation_rge: "RGE", // « RGE XX » comme « RIB XX », sans la copropriété (Amir 09/10/2026)
  convocation_ag: "CONVOC AG",
  preuve_envoi_convocation: "PREUVE ENVOI CONVOC",
  // 06 - RIB (« RIB XX » : XX = l'entreprise)
  rib_entreprises: "RIB",
  rib_compte_copro: "RIB COMPTE TRAVAUX",
  rib_compte_travaux: "RIB COMPTE TRAVAUX",
  // 07 - Garantie CEGC
  attestation_caution: "ATTESTATION CAUTIONNEMENT",
};

/** « RIB XX », « RGE XX » : le terme est complété par l'entreprise émettrice (XX), au lieu de la suivre. */
const TERME_AVEC_EMETTEUR = new Set(["rib_entreprises", "attestation_rge"]);

/** Pièces propres à l'entreprise, nommées sans la copropriété : « RGE DECOPEINT - Qualibat - … »
 *  (Amir 09/10/2026). */
const SANS_COPRO = new Set(["attestation_rge"]);

/** Devis et contrats : l'entreprise vient juste après le terme, avant la copropriété
 *  (« DEVIS ENTREPRISE - DECOPEINT - 53 RUE DE LA COURSE - ITE - … », Amir 09/10/2026). */
const TERMES_ENTREPRISE_EN_TETE = new Set(["DEVIS ENTREPRISE", "DEVIS HONORAIRES"]);

/** Entreprise d'un type quand le déposant ne la saisit pas : le contrat AMO est le nôtre. */
const EMETTEUR_PAR_DEFAUT: Record<string, string> = { contrat_amo: "STRAT ECO" };

/** Dossier des devis d'études : un « Devis » qui y est classé est un devis d'honoraires. */
const DOSSIER_ETUDES = "Devis des études techniques et Frais Annexes";

const egalBase = (a: string, b: string) => a.localeCompare(b, "fr", { sensitivity: "base" }) === 0;

/** Terme de la nomenclature de la banque pour ce type de document, ou null. Un
 *  « Devis » du dossier des études est un devis d'honoraires (SPS, contrôle
 *  technique, diagnostics…), ailleurs un devis d'entreprise. */
export const termeNomenclature = (typeId: string, dossier?: string | null): string | null =>
  typeId === "devis" && dossier === DOSSIER_ETUDES ? "DEVIS HONORAIRES" : (NOMENCLATURE_CEGEE[typeId] ?? null);

/** Lit un premier segment de nom comme terme de la nomenclature : types concernés
 *  (plusieurs si le terme est partagé) et, pour « RIB XX », l'entreprise. */
function lireTerme(segment: string): { types: string[]; emetteur: string | null } | null {
  const s = segment.trim();
  const exacts = Object.entries(NOMENCLATURE_CEGEE)
    .filter(([id, terme]) => !TERME_AVEC_EMETTEUR.has(id) && egalBase(terme, s))
    .map(([id]) => id);
  if (exacts.length) return { types: exacts, emetteur: null };
  for (const id of TERME_AVEC_EMETTEUR) {
    const terme = NOMENCLATURE_CEGEE[id];
    if (egalBase(s, terme)) return { types: [id], emetteur: null }; // « RIB » déposé sans entreprise
    if (s.length > terme.length + 1 && egalBase(s.slice(0, terme.length), terme) && s[terme.length] === " ")
      return { types: [id], emetteur: s.slice(terme.length + 1).trim() || null };
  }
  return null;
}

/** Types (ids TYPES_DOCUMENT) d'un fichier d'après son nom normalisé : terme de la
 *  banque en tête de nom (« PV AG TRAVAUX - {COPRO} - … »), ou ancien format
 *  « {COPRO} - {Type} - … ». Plusieurs types quand le terme est partagé ; liste
 *  vide si le nom ne suit aucune des deux nomenclatures. */
export function typesDepuisNom(name: string): string[] {
  const sansExt = name.replace(/\.[a-zA-Z0-9]{1,8}$/, "");
  const segs = sansExt.split(" - ");
  const terme = lireTerme(segs[0]);
  if (terme) return terme.types;
  // ancien format : le type est en 2e segment (préfixe copro) ou en 1er (nom sans préfixe)
  for (const seg of segs.slice(0, 2)) {
    const t = TYPES_DOCUMENT.find((x) => egalBase(x.label, seg.trim()));
    if (t) return [t.id];
  }
  return [];
}

/** Retrouve le type (id TYPES_DOCUMENT) d'un fichier d'après son nom normalisé -
 *  sert aux dossiers récapitulatifs par dispositif. Null si le nom ne suit pas la
 *  nomenclature ou si son terme est partagé par deux types (voir typesDepuisNom). */
export function typeDepuisNom(name: string): string | null {
  const types = typesDepuisNom(name);
  return types.length === 1 ? types[0] : null;
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
  /** Dossier de classement : départage un « Devis » d'entreprise d'un devis d'honoraires. */
  dossier?: string | null;
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

/** Assemble le nom final : segments non vides joints par « - », extension conservée.
 *  Un type de la nomenclature bancaire (NOMENCLATURE_CEGEE) ouvre le nom par son
 *  terme, la copropriété vient ensuite (après l'entreprise pour un devis ou un
 *  contrat) ; sinon l'ancien ordre « {COPRO} - {Type} ». */
export function construireNomFichier(champs: ChampsNom, extension: string): string {
  const prefixe = champs.prefixe ? nettoyerSegment(champs.prefixe).toUpperCase() : null;
  const objet = champs.objet ? nettoyerSegment(champs.objet) : null;
  const saisi = champs.emetteur ? nettoyerSegment(champs.emetteur) : "";
  const emetteur = (saisi || EMETTEUR_PAR_DEFAUT[champs.type] || "").toUpperCase() || null;
  const date = champs.date && /^\d{4}-\d{2}-\d{2}$/.test(champs.date) ? champs.date : null;
  const etat = champs.etat ? nettoyerSegment(champs.etat) : null;
  const terme = termeNomenclature(champs.type, champs.dossier);
  const emetteurDansTerme = !!terme && TERME_AVEC_EMETTEUR.has(champs.type);
  const segments = (
    !terme
      ? [prefixe, typeLabel(champs.type), objet, emetteur, date, etat]
      : TERMES_ENTREPRISE_EN_TETE.has(terme)
        ? [terme, emetteur, prefixe, objet, date, etat]
        : [
            emetteurDansTerme && emetteur ? `${terme} ${emetteur}` : terme,
            SANS_COPRO.has(champs.type) ? null : prefixe,
            objet,
            emetteurDansTerme ? null : emetteur,
            date,
            etat,
          ]
  ).filter((s): s is string => !!s && s.length > 0);
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

/** Nom d'un fichier sans son extension (champ « Modifier » de l'onglet Fichiers). */
export function nomSansExtension(nom: string): string {
  const ext = extensionDe(nom);
  return ext ? nom.slice(0, -(ext.length + 1)) : nom;
}

/** Nouveau nom d'un fichier déjà déposé : l'extension d'origine est toujours
 *  conservée (retapée ou non), le nom est enregistré sans accent comme au
 *  dépôt. Retourne null si la saisie est vide. */
export function nomRenomme(saisie: string, ancienNom: string): string | null {
  const ext = extensionDe(ancienNom);
  let base = saisie.trim();
  if (ext && base.toLowerCase().endsWith("." + ext)) base = base.slice(0, -(ext.length + 1)).trim();
  if (!base) return null;
  return nomFichierSansAccents(ext ? `${base}.${ext}` : base);
}

/** Relit les champs d'un nom normalisé ({COPRO} - {Type} - {Objet} - {ÉMETTEUR} - {Date},
 *  {TERME CEGEE} - {COPRO} - {Objet} - {ÉMETTEUR} - {Date}, ou pour un devis
 *  {TERME} - {ÉMETTEUR} - {COPRO} - {Objet} - {Date}) : sert à vérifier après coup
 *  un devis déjà déposé (vérification RGE, 07/10/2026). `copro` (nom de la
 *  copropriété du dossier) situe la copropriété dans le nom d'un devis ; sans lui,
 *  deux segments en majuscules après le terme se lisent « ENTREPRISE - COPRO ».
 *  Sinon l'émetteur est le segment en majuscules qui précède la date ; null si absent. */
export function champsDepuisNom(
  name: string,
  copro?: string | null
): { type: string | null; objet: string | null; emetteur: string | null; date: string | null } {
  const vide = { type: null, objet: null, emetteur: null, date: null };
  const segs = nomSansExtension(name)
    .split(" - ")
    .map((s) => s.trim())
    .filter(Boolean);
  const egal = egalBase;
  const majuscules = (s: string) => s === s.toUpperCase() && /[A-Z]/.test(s);
  let type: string | null = null;
  let suite = -1;
  let emetteurTerme: string | null = null;
  // nomenclature de la banque : le terme ouvre le nom, la copropriété est le segment suivant
  const terme = segs.length ? lireTerme(segs[0]) : null;
  if (terme) [type, suite, emetteurTerme] = [terme.types[0], 2, terme.emetteur];
  // « RGE XX - … » : pas de copropriété après le terme (avant le 09/10/2026 : « RGE - COPRO - … »)
  if (terme && terme.emetteur && SANS_COPRO.has(terme.types[0])) suite = 1;
  if (terme && TERMES_ENTREPRISE_EN_TETE.has(segs[0].toUpperCase())) {
    // devis : « {TERME} - {ÉMETTEUR} - {COPRO} - … » ; avant le 09/10/2026 « {TERME} - {COPRO} - … »
    const c = copro ? nomFichierSansAccents(nettoyerSegment(copro).toUpperCase()).split(" - ") : null;
    const coproEn = (i: number) => !!c && egal(segs.slice(i, i + c.length).join(" - "), c.join(" - "));
    if (c && coproEn(2)) [suite, emetteurTerme] = [2 + c.length, segs[1]];
    else if (c && coproEn(1)) suite = 1 + c.length;
    else if (segs.length >= 3 && majuscules(segs[1]) && majuscules(segs[2])) [suite, emetteurTerme] = [3, segs[1]];
  }
  // libellé à « / » coupé en deux au dépôt (« Devis / DPGF des travaux » -> « Devis - DPGF des travaux »)
  for (let i = 0; i < Math.min(2, segs.length) && !type; i++) {
    const double = segs[i + 1] ? TYPES_DOCUMENT.find((t) => egal(nomFichierSansAccents(t.label), `${segs[i]} - ${segs[i + 1]}`)) : undefined;
    const simple = TYPES_DOCUMENT.find((t) => egal(t.label, segs[i]));
    if (double) [type, suite] = [double.id, i + 2];
    else if (simple) [type, suite] = [simple.id, i + 1];
  }
  if (!type) return vide;
  const reste = segs.slice(suite);
  const iDate = reste.findIndex((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
  const avant = iDate >= 0 ? reste.slice(0, iDate) : reste;
  let objet: string | null = null;
  let emetteur: string | null = null;
  if (emetteurTerme) {
    // « RIB XX », « RGE XX » ou devis : l'entreprise est déjà lue, le reste est l'objet
    emetteur = emetteurTerme;
    objet = avant.length ? avant.join(" - ") : null;
  } else if (avant.length >= 2 && majuscules(avant[avant.length - 1])) {
    emetteur = avant[avant.length - 1];
    objet = avant.slice(0, -1).join(" - ");
  } else if (avant.length === 1 && majuscules(avant[0])) emetteur = avant[0];
  else if (avant.length) objet = avant.join(" - ");
  return { type, objet, emetteur, date: iDate >= 0 ? reste[iDate] : null };
}

/** Recrée un File du même contenu sous un autre nom. */
export function renommerFile(file: File, nouveauNom: string): File {
  return new File([file], nouveauNom, { type: file.type, lastModified: file.lastModified });
}
