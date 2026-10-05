// Particularités d'affichage du portail propres à une copropriété, décidées par
// l'AMO en réponse à un feedback (05/10/2026, Armorial). Une entrée n'agit que
// sur le dossier dont l'identifiant est listé : les autres copropriétés gardent
// le texte standard.

/** Phrase standard sous l'étiquette énergie visée (accueil du portail et PDF individuel). */
const ETIQUETTE_STANDARD =
  "Il s'agit de l'étiquette visée pour l'ensemble du bâtiment après travaux (DPE collectif de la copropriété) - et non de l'étiquette individuelle de votre logement, qui peut différer selon son étage, son exposition ou ses équipements.";

type Specificite = {
  /** Remplace la phrase sous l'étiquette énergie visée. */
  etiquetteTexte?: string;
  /** Rappel affiché là où le reste à financer apparaît ; aucun calcul associé. */
  noteResteAFinancer?: string;
};

const SPECIFICITES: Record<string, Specificite> = {
  // Armorial (7 rue Twinger)
  "48ad2833-ab56-43ee-ad17-0053734d4032": {
    // Feedback INDIVISION KOENIGSAE, 05/10/2026 : la fin de la phrase donnerait
    // l'idée d'une clé de répartition fondée sur l'étage ou l'orientation.
    etiquetteTexte:
      "Il s'agit de l'étiquette visée pour l'ensemble du bâtiment après travaux (DPE collectif de la copropriété) - et non de l'étiquette individuelle de votre logement.",
    // Feedback INDIVISION KOENIGSAE, 05/10/2026 : l'AMO ne dispose pas du calcul
    // avec la vente des combles, donc rappel seul, sans montant.
    noteResteAFinancer: "Le reste à financer s'entend hors vente des combles.",
  },
};

/** Phrase à afficher sous l'étiquette énergie visée de cette copropriété. */
export function texteEtiquetteVisee(coproId: string | null | undefined): string {
  return (coproId && SPECIFICITES[coproId]?.etiquetteTexte) || ETIQUETTE_STANDARD;
}

/** Rappel à placer près du reste à financer, ou null si la copropriété n'en a pas. */
export function noteResteAFinancer(coproId: string | null | undefined): string | null {
  return (coproId && SPECIFICITES[coproId]?.noteResteAFinancer) || null;
}
