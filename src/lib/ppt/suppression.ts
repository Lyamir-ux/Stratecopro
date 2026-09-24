// Suppression d'un document de la branche PPT (0082, étendue aux rapports
// validés en 0095 - feedback Amir 24/09 : « supprimer un PPPT, un PPT, un
// fichier, afin de recommencer en cas de validation »). Ce que la suppression
// emporte, calculé avant la confirmation avec les mêmes règles que la RPC
// ppt_supprimer_rapport. Logique pure, testée à part.

export interface RapportSuppression {
  id: string;
  type: string;
  statut: string;
  valide_le: string | null;
  name: string;
}

export interface PosteSuppression {
  id: string;
  rapport_id: string | null;
  statut: string;
  montant_vote: number | null;
  montant_syndic: number | null;
  commentaire_syndic: string | null;
  annee_prochaine_presentation: number | null;
  retire_le: string | null;
}

export interface ImpactSuppression {
  /** Rapport validé : suppression réservée au dirigeant, le plan part avec. */
  valide: boolean;
  /** Postes du rapport supprimés (plan en vigueur ou version archivée). */
  postes: number;
  /** Dont postes retouchés par le cabinet : vote, montant, commentaire, décalage, retrait. */
  travailles: number;
  /** Dont postes votés ou réalisés. */
  votes: number;
  remarques: number;
  /** Le rapport porte le plan en vigueur (dernier validé de son type). */
  enVigueur: boolean;
  /** Version validée précédente qui redevient le plan en vigueur. */
  versionRestauree: RapportSuppression | null;
  /** Plus aucun document, poste ni AG dans la copropriété après la suppression. */
  coproVidee: boolean;
}

/** Même critère que la RPC (0084 / 0087 / 0095) : le cabinet a travaillé ce poste. */
export function posteTravaille(p: PosteSuppression): boolean {
  return (
    p.statut !== "programme" ||
    p.montant_vote != null ||
    p.montant_syndic != null ||
    p.commentaire_syndic != null ||
    p.annee_prochaine_presentation != null ||
    p.retire_le != null
  );
}

const parValidation = (a: RapportSuppression, b: RapportSuppression) => (b.valide_le ?? "").localeCompare(a.valide_le ?? "");

export function impactSuppression(
  rapport: RapportSuppression,
  copro: { rapports: RapportSuppression[]; postes: PosteSuppression[]; remarques: { rapport_id: string }[]; nbAg: number },
): ImpactSuppression {
  const valide = rapport.statut === "valide";
  const siens = copro.postes.filter((p) => p.rapport_id === rapport.id);
  // plan en vigueur = dernier rapport validé du même type (règle de ppt_valider_rapport)
  const validesDuType = copro.rapports.filter((r) => r.type === rapport.type && r.statut === "valide").sort(parValidation);
  const enVigueur = valide && validesDuType[0]?.id === rapport.id;
  return {
    valide,
    postes: siens.length,
    travailles: siens.filter(posteTravaille).length,
    votes: siens.filter((p) => p.statut === "vote" || p.statut === "realise").length,
    remarques: copro.remarques.filter((m) => m.rapport_id === rapport.id).length,
    enVigueur,
    versionRestauree: enVigueur ? (validesDuType.find((r) => r.id !== rapport.id) ?? null) : null,
    coproVidee:
      copro.rapports.every((r) => r.id === rapport.id) &&
      copro.postes.every((p) => p.rapport_id === rapport.id) &&
      copro.nbAg === 0,
  };
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/** Ce qui part et ce qui reste, en phrases courtes pour la fenêtre de confirmation. */
export function consequencesSuppression(i: ImpactSuppression): { part: string[]; reste: string[] } {
  if (!i.valide) {
    return { part: ["Le document et son fichier sont retirés définitivement."], reste: ["L'échéancier et les AG de la copropriété ne changent pas."] };
  }
  const part: string[] = [];
  const reste: string[] = [];
  if (i.postes) {
    part.push(
      `${pluriel(i.postes, "poste")} du plan${i.enVigueur ? "" : " (version archivée)"}` +
        (i.travailles ? `, dont ${i.travailles} retouché${i.travailles > 1 ? "s" : ""} par le cabinet${i.votes ? ` (${i.votes} voté${i.votes > 1 ? "s" : ""} ou réalisé${i.votes > 1 ? "s" : ""})` : ""}` : "") +
        ".",
    );
  }
  if (i.remarques) part.push(`${pluriel(i.remarques, "remarque")} du rapport.`);
  part.push("L'analyse importée, la revue et le fichier.");
  if (i.versionRestauree) reste.push(`La version validée précédente (« ${i.versionRestauree.name} ») redevient le plan en vigueur.`);
  else if (i.enVigueur) reste.push("La copropriété n'a plus de plan validé de ce type : déposez le document à nouveau pour recommencer.");
  reste.push("Les lignes ajoutées par le cabinet, les assemblées générales et leurs résolutions sont conservées.");
  reste.push("Les données de la fiche complétées à la validation (adresse, DPE…) sont gardées.");
  return { part, reste };
}
