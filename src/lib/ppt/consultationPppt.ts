// Demande de consultation « PPPT + DPE collectif » (feedback Amir 27/09/2026,
// page /syndic/ppt) : un clic sur une copropriété de la colonne « Sans PPPT »
// propose au syndic de faire réaliser le PPPT et le DPE collectif. La réponse
// « oui » est une demande à Strat Eco (table demandes_amo, objet
// consultation_pppt_dpe, migration 0107), que l'équipe transforme en
// consultation des prestataires du métier « PPPT + DPE collectif » depuis « Demandes des syndics ».
// Depuis 0109, la demande publie directement la consultation (contenu construit
// en base par ppt_demander_consultation_pppt). Logique pure : demande en cours
// d'une copropriété, pré-remplissage du formulaire de consultation (demandes
// déposées avant 0109, sans consultation liée).

export const OBJET_CONSULTATION_PPPT = "consultation_pppt_dpe";

export const LIBELLE_CONSULTATION_PPPT = "Consultation PPPT + DPE collectif";

/** Demande vue depuis le suivi PPT (sous-ensemble de demandes_amo). */
export interface DemandeConsultationLite {
  id: string;
  ppt_copro_id: string | null;
  statut: string;
  created_at: string;
  demandeur_nom: string;
  commentaire_amo: string | null;
  traite_le: string | null;
}

/**
 * Demande qui compte pour la copropriété : la plus récente. Une demande classée
 * sans suite ne bloque pas (le syndic peut en refaire une) ; une demande à
 * traiter ou prise en charge s'affiche à la place de la question.
 */
export function demandeEnCours<D extends DemandeConsultationLite>(demandes: D[], pptCoproId: string): D | null {
  const d = demandes
    .filter((x) => x.ppt_copro_id === pptCoproId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return d && d.statut !== "classee" ? d : null;
}

/** Brouillon du formulaire « Consulter un intervenant » (copropriété hors plateforme, métier « PPPT + DPE collectif », 0108). */
export interface PreremplissageConsultation {
  demandeId: string;
  type: string;
  cible: "externe";
  ext_nom: string;
  ext_adresse: string;
  ext_ville: string;
  ext_lots: string;
  ext_batiments: string;
  mission: string;
}

/** Ville en fin d'adresse (« …, 67000 Strasbourg ») séparée du reste, comme à la création d'un dossier. */
function decouper(adresse: string): { rue: string; ville: string } {
  const m = adresse.match(/(\d{5})\s+([^,]+)\s*$/);
  if (!m) return { rue: adresse.trim(), ville: "" };
  return { rue: adresse.slice(0, m.index).replace(/[,\s]+$/, "").trim(), ville: `${m[1]} ${m[2].trim()}` };
}

/** Pré-remplissage de la consultation à partir d'une demande reçue. */
export function preremplissageConsultation(d: { id: string; copro_nom: string; adresse: string; nb_lots: number | null; chauffage: string | null }): PreremplissageConsultation {
  const { rue, ville } = decouper(d.adresse ?? "");
  const precisions = [d.nb_lots ? `${d.nb_lots} lots` : null, d.chauffage ? `chauffage : ${d.chauffage.toLowerCase()}` : null].filter(Boolean).join(", ");
  return {
    demandeId: d.id,
    type: "pppt_dpe",
    cible: "externe",
    ext_nom: d.copro_nom,
    ext_adresse: rue,
    ext_ville: ville,
    ext_lots: d.nb_lots ? String(d.nb_lots) : "",
    ext_batiments: "",
    mission:
      "Réalisation du projet de plan pluriannuel de travaux (PPPT, article 14-2 de la loi du 10 juillet 1965) " +
      "et du diagnostic de performance énergétique (DPE) collectif de la copropriété" +
      (precisions ? ` (${precisions})` : "") +
      ". Visite des parties communes et d'un échantillon de logements, rapports remis au syndic pour présentation en assemblée générale.",
  };
}
