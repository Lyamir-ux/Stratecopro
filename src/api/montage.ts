// Montage bancaire — préparation des dossiers de financement et d'assurance
// par le syndic. Catalogues déclaratifs des documents attendus par chaque
// organisme (CEGEE pour l'éco-PTZ collectif, ROEDERER pour la dommages-
// ouvrage) + hooks de dépôt/suivi. Les fichiers vivent dans le bucket
// copro-files sous montage/<copro_id>/<montage>/<doc_key>/…
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, Tables } from "@/lib/database.types";
import type { IconName } from "@/components/Icon";

export type MontageId = "ecoptz" | "anah" | "cee" | "climaxion" | "do";
export type MontageDoc = Tables<"montage_docs">;
export type MontageFormulaire = Tables<"montage_formulaires">;
export type FormulaireType = "fiche_avant_ag" | "demande_pret";

/** Un fichier déposé sur un document du montage (montage_docs.files). */
export interface MontageFile {
  name: string;
  /** Nom d'origine avant renommage assisté (traçabilité). */
  name_original?: string | null;
  path: string;
  size: number | null;
  mime: string | null;
  uploaded_at: string;
  /** Auteur du dépôt — sert à afficher son origine (absent avant août 2026). */
  uploaded_by?: string | null;
}

export function docFiles(doc: MontageDoc | undefined): MontageFile[] {
  return Array.isArray(doc?.files) ? (doc!.files as unknown as MontageFile[]) : [];
}

// ========== Les montages financiers du dossier ==========

export const MONTAGES: {
  id: MontageId;
  label: string;
  sub: string;
  icon: IconName;
  dispo: boolean;
}[] = [
  {
    id: "ecoptz",
    label: "Éco-PTZ collectif",
    sub: "CEGEE — Caisse d'Épargne Grand Est Europe",
    icon: "users",
    dispo: true,
  },
  { id: "anah", label: "ANAH — MaPrimeRénov' Copro", sub: "Subvention collective de l'Anah", icon: "fileCheck", dispo: false },
  { id: "cee", label: "CEE", sub: "Certificats d'économies d'énergie", icon: "zap", dispo: false },
  { id: "climaxion", label: "Climaxion", sub: "Eurométropole de Strasbourg / Région Grand Est", icon: "leaf", dispo: false },
  { id: "do", label: "Dommages-ouvrage", sub: "ROEDERER — assurances de chantier", icon: "hammer", dispo: true },
];

// ========== Catalogue documentaire de l'éco-PTZ collectif (CEGEE) ==========

/** Qui produit le document : le syndic le dépose, l'AMO le fournit,
 *  la MOE l'a déjà versé au dossier projet. */
export type Fournisseur = "syndic" | "amo" | "moe";

export interface DocDef {
  key: string;
  name: string;
  hint?: string;
  fournisseur: Fournisseur;
  /** Modèle à télécharger (fichier de public/modeles). */
  modele?: string;
  /** Lien externe utile (ex. avis SIRENE). */
  lien?: { label: string; url: string };
  /** À fournir uniquement si le signataire n'est pas le dirigeant. */
  conditionnel?: boolean;
}

export interface GroupeDef {
  titre?: string;
  note?: string;
  docs: DocDef[];
}

export interface EtapeDef {
  id: string;
  num: number;
  label: string;
  intro: string;
  /** Formulaires in-app rattachés à l'étape. */
  formulaires?: { type: FormulaireType; name: string; hint: string }[];
  groupes: GroupeDef[];
}

export const ECOPTZ_ETAPES: EtapeDef[] = [
  {
    id: "resolutions",
    num: 1,
    label: "Résolutions de prêt et projet de contrat",
    intro:
      "Avant la convocation de l'assemblée générale : la banque prépare les résolutions d'emprunt et le projet de contrat à partir de la fiche de renseignements et de l'attestation d'impayés.",
    formulaires: [
      {
        type: "fiche_avant_ag",
        name: "Fiche de renseignements avant AG",
        hint: "Pré-remplie avec les données du projet — complétez les champs manquants",
      },
    ],
    groupes: [
      {
        docs: [
          {
            key: "attestation_impayes",
            name: "Attestation du taux d'impayés",
            hint: "En-tête du cabinet, cachet + signature. Tantièmes des copropriétaires en retard de plus de 2 trimestres de charges courantes / tantièmes généraux × 100 — limite : 15 %.",
            fournisseur: "syndic",
            modele: "attestation-taux-impayes-cegee.docx",
          },
        ],
      },
    ],
  },
  {
    id: "compte_travaux",
    num: 2,
    label: "Ouverture du compte travaux",
    intro:
      "La CEGEE ouvre un compte travaux au nom du syndicat des copropriétaires. Déposez l'ensemble des pièces ci-dessous.",
    groupes: [
      {
        docs: [
          {
            key: "reglement_copropriete",
            name: "Règlement de copropriété",
            hint: "Dans son intégralité",
            fournisseur: "syndic",
          },
          {
            key: "fiche_synthetique",
            name: "Fiche synthétique de la copropriété",
            hint: "Extraite du Registre national des copropriétés, avec le numéro d'immatriculation",
            fournisseur: "syndic",
          },
          {
            key: "attestation_registre",
            name: "Attestation de mise à jour annuelle du Registre national",
            fournisseur: "syndic",
          },
          {
            key: "avis_sirene",
            name: "Avis de situation SIRENE",
            hint: "Daté de moins de 3 mois — téléchargeable gratuitement sur le site de l'Insee",
            fournisseur: "syndic",
            lien: { label: "avis-situation-sirene.insee.fr", url: "https://avis-situation-sirene.insee.fr/" },
          },
          {
            key: "attestation_impayes",
            name: "Attestation du taux d'impayés",
            hint: "La même qu'à l'étape 1 — déposée une seule fois",
            fournisseur: "syndic",
            modele: "attestation-taux-impayes-cegee.docx",
          },
          {
            key: "rib_copro",
            name: "RIB du compte de la copropriété",
            fournisseur: "syndic",
          },
          {
            key: "pv_ag_mandat",
            name: "PV d'AG — mandat du syndic",
            hint: "Signé(s), cacheté(s) et certifié(s) conforme(s) : désignation et renouvellement du mandat pour la période en cours",
            fournisseur: "syndic",
          },
          {
            key: "pv_ag_travaux",
            name: "PV d'AG — vote des travaux et de la résolution d'emprunt",
            hint: "Signé(s), cacheté(s) et certifié(s) conforme(s)",
            fournisseur: "syndic",
          },
          {
            key: "annexes_comptables",
            name: "« Annexes 1 à 5 » du dernier exercice",
            fournisseur: "syndic",
          },
          {
            key: "assurance_mri",
            name: "Attestation d'assurance multirisque habitation de l'immeuble",
            hint: "Période en cours (pas l'appel de cotisation), précisant le nom ou l'adresse de la copropriété",
            fournisseur: "syndic",
          },
          {
            key: "contrat_syndic",
            name: "Contrat de syndic signé avec la copropriété",
            hint: "Période en cours",
            fournisseur: "syndic",
          },
        ],
      },
      {
        titre: "Si la personne habilitée à signer n'est pas le dirigeant",
        note: "Ses coordonnées (mobile et courriel) sont à renseigner dans le formulaire de demande de prêt (étape 3). Marquez « Non concerné » si le dirigeant signe lui-même.",
        docs: [
          {
            key: "delegation_pouvoir",
            name: "Délégation de pouvoirs",
            hint: "Sur papier à en-tête du syndic — signée par le délégant et le délégataire",
            fournisseur: "syndic",
            modele: "delegation-pouvoirs-cegee.docx",
            conditionnel: true,
          },
          {
            key: "cni_signataire",
            name: "Pièce d'identité du signataire",
            hint: "Recto-verso, en cours de validité",
            fournisseur: "syndic",
            conditionnel: true,
          },
          {
            key: "formulaire_ppe",
            name: "Formulaire de personne politiquement exposée (PPE)",
            hint: "Daté et signé par la personne habilitée + mention « Lu et approuvé »",
            fournisseur: "syndic",
            modele: "formulaire-ppe-cegee.docx",
            conditionnel: true,
          },
        ],
      },
    ],
  },
  {
    id: "offre_pret",
    num: 3,
    label: "Dépôt du dossier de demande d'offre de prêt",
    intro:
      "Le dossier complet est adressé à la CEGEE (agence.copro@cegee.caisse-epargne.fr). Le classeur Excel « COPRO CEGEE Demande de prêt » est produit par Strat Eco à partir de votre formulaire, puis imprimé, tamponné et signé par vos soins.",
    formulaires: [
      {
        type: "demande_pret",
        name: "Demande de prêt CEGEE — onglet 1",
        hint: "Renseignez les informations du syndic pour que Strat Eco produise le classeur Excel",
      },
    ],
    groupes: [
      {
        titre: "Dossier éco-PTZ",
        docs: [
          {
            key: "excel_demande_pret",
            name: "Classeur « COPRO CEGEE Demande de prêt » signé",
            hint: "Les 3 onglets (demande de prêt, liste des copropriétaires adhérents, plan de financement) complétés par Strat Eco, puis tamponnés et signés par le syndic",
            fournisseur: "amo",
            modele: "copro-cegee-demande-de-pret.xlsx",
          },
          {
            key: "audit_energetique",
            name: "Audit énergétique",
            hint: "Si éco-PTZ « amélioration de la performance globale » — fourni par la maîtrise d'œuvre",
            fournisseur: "moe",
          },
          {
            key: "devis_travaux",
            name: "Devis des travaux ou ordres de service",
            hint: "Datés de moins d'un an, correspondant aux montants votés en AG — fournis par la maîtrise d'œuvre",
            fournisseur: "moe",
          },
          {
            key: "rib_entreprises",
            name: "RIB des entreprises intervenantes",
            hint: "Format IBAN-BIC — fournis par la maîtrise d'œuvre",
            fournisseur: "moe",
          },
          {
            key: "cerfa_emprunteur",
            name: "Formulaire réglementaire éco-PTZ « Emprunteur »",
            hint: "Fourni par Strat Eco — complété, tamponné et signé par le syndic",
            fournisseur: "amo",
          },
          {
            key: "cerfa_entreprises",
            name: "Formulaires réglementaires éco-PTZ « Entreprises »",
            hint: "Fournis par Strat Eco, signés par les entreprises RGE. Les cases « coût total éligible revenant aux seuls copropriétaires participant au prêt » restent vides jusqu'à la fin de l'instruction.",
            fournisseur: "amo",
          },
          {
            key: "preuve_convocation_ag",
            name: "Preuve de la convocation à l'AG",
            hint: "Accusés de réception",
            fournisseur: "syndic",
          },
          {
            key: "annexe_2bis_cegc",
            name: "Annexe 2 bis — attestation pour la demande de cautionnement CEGC",
            hint: "Signée et tamponnée par le syndic",
            fournisseur: "syndic",
            modele: "attestation-caution-cegc-annexe-2bis.docx",
          },
          {
            key: "attestation_non_recours",
            name: "Attestation de non-recours",
            hint: "Complétée, signée et tamponnée par le syndic",
            fournisseur: "syndic",
          },
        ],
      },
      {
        titre: "Prêt « avance de subventions »",
        docs: [
          {
            key: "fiche_etat_anah",
            name: "Fiche « État » adressée à l'ANAH",
            hint: "Mentionne le taux d'impayés rapporté au budget de l'année n-1 — fournie par Strat Eco",
            fournisseur: "amo",
          },
          {
            key: "notifications_subventions",
            name: "Notifications d'octroi des subventions au syndicat",
            hint: "Délivrées par les organismes concernés (reçues par courrier)",
            fournisseur: "syndic",
          },
          {
            key: "mail_beneficiaire_compte",
            name: "Confirmation d'enregistrement du compte travaux en bénéficiaire",
            hint: "Mail des organismes subventionneurs — fourni par Strat Eco",
            fournisseur: "amo",
          },
        ],
      },
    ],
  },
];

// ========== Catalogue documentaire de la dommages-ouvrage (ROEDERER) ==========
// Source : « Questionnaire de présentation Assurances de chantier » + liste
// récapitulative des documents à transmettre (ROEDERER, Département Assurances
// Construction — construction@roederer.fr). Les rôles reprennent les
// annotations du dossier : MOE, AMO (Strat Eco) ou syndic.

export const DO_ETAPES: EtapeDef[] = [
  {
    id: "tarification",
    num: 1,
    label: "Demande de tarification",
    intro:
      "Éléments indispensables pour que ROEDERER tarife l'assurance du chantier. Réponse sous 24 h si le dossier est complet et sans problème technique spécifique (10 jours au maximum). Conditions : travaux de technique courante, maîtrise d'œuvre indépendante en mission complète, contrôleur technique avec avis favorables, intervenants tous assurés en RC décennale à l'ouverture du chantier.",
    groupes: [
      {
        docs: [
          {
            key: "questionnaire_chantier",
            name: "Questionnaire « Assurances de chantier » complété",
            hint: "Proposant, opération, maîtrise d'œuvre, étude de sol, contrôle technique, caractéristiques et intervenants — complété par la maîtrise d'œuvre",
            fournisseur: "moe",
            modele: "questionnaire-chantier-roederer.docx",
          },
          {
            key: "cout_previsionnel",
            name: "Détail du coût total prévisionnel des travaux (plan de financement)",
            hint: "Y compris honoraires techniques — le descriptif sommaire des travaux y figure. Fourni par Strat Eco.",
            fournisseur: "amo",
          },
          {
            key: "permis_construire",
            name: "Permis de construire ou déclaration préalable de travaux",
            fournisseur: "moe",
          },
          {
            key: "doc_chantier",
            name: "Déclaration d'ouverture de chantier ou date prévisionnelle",
            fournisseur: "moe",
          },
          {
            key: "rapport_ct_initial",
            name: "Rapport initial du contrôleur technique",
            hint: "Sans avis défavorable — mission minimum L ou LP (+ LE en cas de travaux sur existants)",
            fournisseur: "moe",
          },
          {
            key: "convention_moe",
            name: "Convention de maîtrise d'œuvre",
            hint: "Mission complète : conception, direction et suivi des travaux — fournie par Strat Eco",
            fournisseur: "amo",
          },
          {
            key: "jeu_plans",
            name: "Jeu de plans (masse, coupes, élévations…)",
            fournisseur: "moe",
          },
          {
            key: "etude_sol",
            name: "Rapport d'étude de sol",
            hint: "Le cas échéant — G2PRO minimum en cas de travaux neufs ou d'extension",
            fournisseur: "moe",
            conditionnel: true,
          },
        ],
      },
    ],
  },
  {
    id: "contrat",
    num: 2,
    label: "Accord sur l'offre et établissement du contrat",
    intro:
      "En cas d'accord sur les conditions proposées, retournez l'offre signée pour obtenir rapidement une attestation d'assurance valable, puis complétez le dossier avec les pièces du contrat.",
    groupes: [
      {
        titre: "Retour d'accord",
        docs: [
          {
            key: "offre_bon_accord",
            name: "Offre signée « Bon pour accord » + document d'information et conseils",
            hint: "Copie des offres signées, retournée à ROEDERER avec le document d'information et conseils",
            fournisseur: "syndic",
          },
          {
            key: "intervenants_designes",
            name: "Liste des intervenants désignés et attestations RC décennale",
            hint: "Au minimum : maîtrise d'œuvre et entreprises de clos/couvert — attestations valables à la date d'ouverture du chantier",
            fournisseur: "moe",
          },
        ],
      },
      {
        titre: "Pièces du contrat",
        docs: [
          {
            key: "convention_ct",
            name: "Convention de contrôle technique",
            hint: "Déjà versée au dossier projet — suivie par Strat Eco",
            fournisseur: "amo",
          },
          {
            key: "honoraires_bet",
            name: "Conventions ou notes d'honoraires des BET de l'opération",
            hint: "Déjà versées au dossier projet — suivies par Strat Eco",
            fournisseur: "amo",
          },
          {
            key: "liste_intervenants_lots",
            name: "Liste de l'ensemble des intervenants prévus, ventilée par lot",
            hint: "CCTP, DPGF ou devis — vaut aussi devis descriptifs des travaux et cahiers des clauses techniques particulières",
            fournisseur: "moe",
          },
          {
            key: "attestations_rcd",
            name: "Attestations RC décennale de l'ensemble des intervenants",
            hint: "Valables expressément à la date d'ouverture du chantier et mentionnant les activités garanties",
            fournisseur: "moe",
          },
          {
            key: "marches_travaux",
            name: "Marchés de travaux signés avec les entreprises",
            hint: "Le cas échéant — à déposer par le syndic",
            fournisseur: "syndic",
            conditionnel: true,
          },
        ],
      },
      {
        titre: "Lutte contre le blanchiment (LCB-FT)",
        note: "Le souscripteur étant une personne morale, la réglementation impose de fournir impérativement :",
        docs: [
          {
            key: "kbis",
            name: "Extrait Kbis du Registre du commerce",
            hint: "Daté de moins de 3 mois",
            fournisseur: "syndic",
          },
          {
            key: "beneficiaires_effectifs",
            name: "Liste des bénéficiaires effectifs et leur pièce d'identité",
            hint: "Carte nationale d'identité en cours de validité de chaque bénéficiaire effectif",
            fournisseur: "syndic",
          },
        ],
      },
    ],
  },
  {
    id: "regularisation",
    num: 3,
    label: "Régularisation définitive du contrat",
    intro:
      "À transmettre dans les 6 mois suivant la réception des travaux pour la régularisation définitive du contrat.",
    groupes: [
      {
        docs: [
          {
            key: "cout_definitif",
            name: "Coût total définitif des travaux, y compris honoraires des BET",
            hint: "Factures de travaux transmises par la maîtrise d'œuvre, cachetées par le syndic",
            fournisseur: "syndic",
          },
          {
            key: "pv_reception",
            name: "PV de réception des travaux TCE et levée des réserves éventuelles",
            hint: "Transmis et signés par le syndic et les entreprises",
            fournisseur: "syndic",
          },
          {
            key: "rapport_ct_final",
            name: "Rapport final du contrôleur technique",
            hint: "Sans réserve",
            fournisseur: "moe",
          },
          {
            key: "rcd_non_declares",
            name: "Liste et attestations RC décennale des intervenants non déclarés",
            hint: "Uniquement si des intervenants n'étaient pas déclarés lors de la mise en place du contrat",
            fournisseur: "moe",
            conditionnel: true,
          },
        ],
      },
    ],
  },
];

// ========== Registre des parcours ==========

export interface ParcoursDef {
  titre: string;
  intro: string;
  etapes: EtapeDef[];
}

export const PARCOURS: Partial<Record<MontageId, ParcoursDef>> = {
  ecoptz: {
    titre: "Éco-PTZ collectif — CEGEE",
    intro:
      "Prêt collectif souscrit par le syndicat des copropriétaires auprès de la Caisse d'Épargne Grand Est Europe. Préparez les trois étapes dans l'ordre — l'équipe Strat Eco est notifiée de vos dépôts.",
    etapes: ECOPTZ_ETAPES,
  },
  do: {
    titre: "Assurance dommages-ouvrage — ROEDERER",
    intro:
      "Assurance obligatoire du maître d'ouvrage (art. L.242-1 du Code des assurances) : elle préfinance, pendant les dix ans suivant la réception, la réparation des dommages de nature décennale sans recherche de responsabilité. Dossier monté avec le courtier ROEDERER (Département Assurances Construction, Schiltigheim — construction@roederer.fr, 03 88 76 75 20).",
    etapes: DO_ETAPES,
  },
};

/** Tous les documents (dédoublonnés) d'une étape. */
export function docsOfEtape(etape: EtapeDef): DocDef[] {
  return etape.groupes.flatMap((g) => g.docs);
}

/** Avancement d'une étape : documents déposés ou non applicables / total. */
export function etapeProgress(
  etape: EtapeDef,
  docs: Map<string, MontageDoc>,
  forms: Map<FormulaireType, MontageFormulaire>
): { done: number; total: number } {
  const defs = docsOfEtape(etape);
  let done = defs.filter((d) => {
    const row = docs.get(d.key);
    return row && (docFiles(row).length > 0 || row.statut === "non_applicable");
  }).length;
  let total = defs.length;
  for (const f of etape.formulaires ?? []) {
    total += 1;
    if (forms.get(f.type)?.statut === "transmis") done += 1;
  }
  return { done, total };
}

// ========== Hooks ==========

export function useMontageDocs(coproId: string | undefined, montage: MontageId) {
  return useQuery({
    queryKey: ["montage", "docs", coproId, montage],
    enabled: !!coproId,
    queryFn: async (): Promise<MontageDoc[]> => {
      const { data, error } = await supabase
        .from("montage_docs")
        .select("*")
        .eq("copro_id", coproId!)
        .eq("montage", montage);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFormulairesMontage(coproId: string | undefined) {
  return useQuery({
    queryKey: ["montage", "formulaires", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<MontageFormulaire[]> => {
      const { data, error } = await supabase
        .from("montage_formulaires")
        .select("*")
        .eq("copro_id", coproId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

async function currentUid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Session expirée");
  return uid;
}

/** Dépose un fichier sur un document du montage (ajout — plusieurs PV possibles). */
export function useUploadMontageDoc(coproId: string, montage: MontageId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docKey, file, nameOriginal }: { docKey: string; file: File; nameOriginal?: string }) => {
      const uid = await currentUid();
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `montage/${coproId}/${montage}/${docKey}/${Date.now()}-${safe}`;
      const { error: eUp } = await supabase.storage.from("copro-files").upload(path, file);
      if (eUp) throw eUp;
      const { data: prev } = await supabase
        .from("montage_docs")
        .select("files")
        .eq("copro_id", coproId)
        .eq("montage", montage)
        .eq("doc_key", docKey)
        .maybeSingle();
      const entry: MontageFile = {
        name: file.name,
        name_original: nameOriginal && nameOriginal !== file.name ? nameOriginal : null,
        path,
        size: file.size,
        mime: file.type || null,
        uploaded_at: new Date().toISOString(),
        uploaded_by: uid ?? null,
      };
      const files = [...(Array.isArray(prev?.files) ? (prev!.files as unknown as MontageFile[]) : []), entry];
      const { error: eDb } = await supabase.from("montage_docs").upsert(
        {
          copro_id: coproId,
          montage,
          doc_key: docKey,
          statut: "depose",
          files: files as unknown as Json,
          updated_by: uid,
        },
        { onConflict: "copro_id,montage,doc_key" }
      );
      if (eDb) throw eDb;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["montage", "docs", coproId, montage] }),
  });
}

/** Retire un fichier déposé (Storage + ligne). */
export function useRemoveMontageFile(coproId: string, montage: MontageId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docKey, path }: { docKey: string; path: string }) => {
      const uid = await currentUid();
      const { data: row, error: eSel } = await supabase
        .from("montage_docs")
        .select("id, files")
        .eq("copro_id", coproId)
        .eq("montage", montage)
        .eq("doc_key", docKey)
        .maybeSingle();
      if (eSel) throw eSel;
      if (!row) return;
      const files = (Array.isArray(row.files) ? (row.files as unknown as MontageFile[]) : []).filter(
        (f) => f.path !== path
      );
      const { error: eDb } = await supabase
        .from("montage_docs")
        .update({
          files: files as unknown as Json,
          statut: files.length > 0 ? "depose" : "a_fournir",
          updated_by: uid,
        })
        .eq("id", row.id);
      if (eDb) throw eDb;
      await supabase.storage.from("copro-files").remove([path]);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["montage", "docs", coproId, montage] }),
  });
}

/** Marque un document conditionnel « non concerné » (ou le réactive). */
export function useSetDocNonApplicable(coproId: string, montage: MontageId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docKey, nonApplicable }: { docKey: string; nonApplicable: boolean }) => {
      const uid = await currentUid();
      const { error } = await supabase.from("montage_docs").upsert(
        {
          copro_id: coproId,
          montage,
          doc_key: docKey,
          statut: nonApplicable ? "non_applicable" : "a_fournir",
          updated_by: uid,
        },
        { onConflict: "copro_id,montage,doc_key" }
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["montage", "docs", coproId, montage] }),
  });
}

/** Télécharge un fichier déposé (URL signée 5 min). */
export async function downloadMontageFile(f: MontageFile) {
  const { data, error } = await supabase.storage.from("copro-files").createSignedUrl(f.path, 300);
  if (error || !data) throw error ?? new Error("URL de téléchargement indisponible");
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = f.name;
  a.click();
}

/** Enregistre un formulaire du montage (brouillon ou transmis). */
export function useSaveFormulaireMontage(coproId: string, type: FormulaireType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ data, statut }: { data: Json; statut?: "brouillon" | "transmis" }) => {
      const uid = await currentUid();
      const { data: prev } = await supabase
        .from("montage_formulaires")
        .select("statut")
        .eq("copro_id", coproId)
        .eq("type", type)
        .maybeSingle();
      const { error } = await supabase.from("montage_formulaires").upsert(
        {
          copro_id: coproId,
          type,
          data,
          statut: statut ?? prev?.statut ?? "brouillon",
          updated_by: uid,
        },
        { onConflict: "copro_id,type" }
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["montage", "formulaires", coproId] }),
  });
}
