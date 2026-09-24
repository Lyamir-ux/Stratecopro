// Propositions du skill pppt-verif (schéma 1.1) : « le skill décide,
// l'utilisateur valide en bloc ». Sur la revue, le dirigeant accepte, refuse ou
// modifie chaque décision avant de matérialiser les postes ; tant qu'une
// proposition reste « à valider », le rapport ne peut pas être validé (UI et
// RPC ppt_valider_rapport). Fonctions pures, testées.
//
// Lecture d'une décision selon que le skill l'a appliquée au tableau ou non :
//   appliquée   + VALIDEE  → rien à faire, le tableau est déjà bon
//   appliquée   + REFUSEE  → les lignes concernées sont à reprendre à la main
//   alternative + VALIDEE  → l'alternative est retenue : lignes à reprendre
//   alternative + REFUSEE  → rien à faire, on reste sur le tableau du skill
//   MODIFIEE (les deux)    → lignes à reprendre selon le commentaire

import type { PpptVerifJson, Proposition, StatutValidationGlobal, StatutValidationProposition } from "./schema";

export const STATUT_VALIDATION_LABEL: Record<StatutValidationProposition, string> = {
  A_VALIDER: "À valider",
  VALIDEE: "Acceptée",
  REFUSEE: "Refusée",
  MODIFIEE: "Modifiée",
};

/** Libellé des choix offerts, selon que la décision est déjà appliquée au tableau. */
export function libelleChoix(p: Pick<Proposition, "appliquee_dans_ppt">, statut: StatutValidationProposition): string {
  if (statut === "VALIDEE") return p.appliquee_dans_ppt ? "Accepter" : "Appliquer";
  if (statut === "REFUSEE") return p.appliquee_dans_ppt ? "Refuser" : "Ne pas retenir";
  if (statut === "MODIFIEE") return "Modifier";
  return "À valider";
}

export const propositionsDe = (json: Pick<PpptVerifJson, "propositions">): Proposition[] => json.propositions ?? [];

/** Propositions encore sans décision : elles bloquent la validation du rapport. */
export function propositionsEnAttente(json: Pick<PpptVerifJson, "propositions">): Proposition[] {
  return propositionsDe(json).filter((p) => p.statut_validation === "A_VALIDER");
}

/**
 * 1.2 : décisions que le skill a déjà répercutées dans le fichier importé
 * (`revision.propositions_appliquees`) et qui n'ont pas changé depuis sur la
 * plateforme - leurs lignes sont déjà reprises (P07 modifiée puis appliquée).
 */
export function decisionsDejaAppliquees(travail: Pick<PpptVerifJson, "propositions">, importe: Pick<PpptVerifJson, "propositions" | "revision"> | null): Set<string> {
  const appliquees = new Set(importe?.revision?.propositions_appliquees ?? []);
  if (!importe || !appliquees.size) return new Set();
  const avant = new Map(propositionsDe(importe).map((p) => [p.code, p]));
  return new Set(
    propositionsDe(travail)
      .filter((p) => {
        const a = avant.get(p.code);
        return !!a && appliquees.has(p.code) && a.statut_validation === p.statut_validation && (a.commentaire_validateur ?? "") === (p.commentaire_validateur ?? "");
      })
      .map((p) => p.code)
  );
}

/** La décision prise oblige-t-elle à retoucher les postes du tableau ? */
export function aReprendre(p: Pick<Proposition, "appliquee_dans_ppt" | "statut_validation"> & { code?: string }, dejaAppliquees?: Set<string>): boolean {
  if (p.code && dejaAppliquees?.has(p.code)) return false;
  if (p.statut_validation === "MODIFIEE") return true;
  if (p.statut_validation === "VALIDEE") return !p.appliquee_dans_ppt;
  if (p.statut_validation === "REFUSEE") return p.appliquee_dans_ppt;
  return false;
}

/** Refuser ou modifier exige un commentaire : il dit ce qui a été fait à la place. */
export function commentaireRequis(p: Pick<Proposition, "appliquee_dans_ppt" | "statut_validation">): boolean {
  return p.statut_validation === "MODIFIEE" || (p.statut_validation === "REFUSEE" && p.appliquee_dans_ppt);
}

/** Propositions décidées mais dont le commentaire obligatoire manque. */
export function propositionsSansCommentaire(json: Pick<PpptVerifJson, "propositions">): Proposition[] {
  return propositionsDe(json).filter((p) => commentaireRequis(p) && !(p.commentaire_validateur ?? "").trim());
}

/** Postes à reprendre à la main : id de ligne → codes des propositions qui l'imposent. */
export function lignesAReprendre(json: Pick<PpptVerifJson, "propositions">, dejaAppliquees?: Set<string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of propositionsDe(json)) {
    if (!aReprendre(p, dejaAppliquees)) continue;
    for (const id of p.lignes_concernees ?? []) out.set(id, [...(out.get(id) ?? []), p.code]);
  }
  return out;
}

export interface BilanPropositions {
  total: number;
  en_attente: number;
  validees: number;
  refusees: number;
  modifiees: number;
  a_reprendre: number;
}

export function bilanPropositions(json: Pick<PpptVerifJson, "propositions">, dejaAppliquees?: Set<string>): BilanPropositions {
  const liste = propositionsDe(json);
  return {
    total: liste.length,
    en_attente: liste.filter((p) => p.statut_validation === "A_VALIDER").length,
    validees: liste.filter((p) => p.statut_validation === "VALIDEE").length,
    refusees: liste.filter((p) => p.statut_validation === "REFUSEE").length,
    modifiees: liste.filter((p) => p.statut_validation === "MODIFIEE").length,
    a_reprendre: liste.filter((p) => aReprendre(p, dejaAppliquees)).length,
  };
}

/** Date du jour au format du schéma (AAAA-MM-JJ, heure locale). */
export function dateIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Date de validation après une décision : posée au changement de statut, effacée au retour « à valider ». */
function dateApres(p: Proposition, statut: StatutValidationProposition, aujourdHui: Date): string | null {
  if (statut === "A_VALIDER") return null;
  if (statut === p.statut_validation && p.date_validation) return p.date_validation;
  return dateIso(aujourdHui);
}

/** Décider une proposition (immuable). Un commentaire vide devient null ; la date de validation suit la décision. */
export function decider<T extends Pick<PpptVerifJson, "propositions">>(json: T, code: string, statut: StatutValidationProposition, commentaire?: string | null, aujourdHui: Date = new Date()): T {
  return {
    ...json,
    propositions: propositionsDe(json).map((p) =>
      p.code === code
        ? { ...p, statut_validation: statut, date_validation: dateApres(p, statut, aujourdHui), commentaire_validateur: commentaire === undefined ? p.commentaire_validateur : (commentaire ?? "").trim() || null }
        : p
    ),
  };
}

/**
 * Validation en bloc : tout ce qui reste « à valider » est tranché dans le sens
 * du skill - une décision appliquée est acceptée, une alternative non appliquée
 * n'est pas retenue. Le tableau ne bouge donc pas ; les décisions déjà prises
 * sont conservées.
 */
export function accepterEnBloc<T extends Pick<PpptVerifJson, "propositions">>(json: T, aujourdHui: Date = new Date()): T {
  return {
    ...json,
    propositions: propositionsDe(json).map((p) => {
      if (p.statut_validation !== "A_VALIDER") return p;
      const statut: StatutValidationProposition = p.appliquee_dans_ppt ? "VALIDEE" : "REFUSEE";
      return { ...p, statut_validation: statut, date_validation: dateApres(p, statut, aujourdHui) };
    }),
  };
}

/** État du dossier (1.2) : VALIDE quand plus aucune proposition n'attend de décision. */
export function statutGlobal(json: Pick<PpptVerifJson, "propositions">): StatutValidationGlobal {
  return propositionsEnAttente(json).length ? "A_VALIDER" : "VALIDE";
}

/** Propositions retenues par Strat Eco (acceptées ou modifiées) : `revision.propositions_appliquees`. */
export function codesRetenus(json: Pick<PpptVerifJson, "propositions">): string[] {
  return propositionsDe(json)
    .filter((p) => p.statut_validation === "VALIDEE" || p.statut_validation === "MODIFIEE")
    .map((p) => p.code);
}

/**
 * Liste des décisions à renvoyer au skill pour régénérer le classeur Excel
 * (« P04 oui, P11 non (motif) ») - format attendu par pppt-verif, étape 5.
 */
export function texteDecisions(json: Pick<PpptVerifJson, "propositions">): string {
  const mot: Record<StatutValidationProposition, string> = { A_VALIDER: "à valider", VALIDEE: "oui", REFUSEE: "non", MODIFIEE: "modifier" };
  return propositionsDe(json)
    .map((p) => `${p.code} ${mot[p.statut_validation]}${(p.commentaire_validateur ?? "").trim() ? ` (${p.commentaire_validateur!.trim()})` : ""}`)
    .join(", ");
}
