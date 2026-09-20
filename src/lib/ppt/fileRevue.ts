// File de revue des rapports PPT (/ppt) : logique pure de tri, testée à part de
// l'écran. Le type d'un document est deviné au dépôt d'après le nom du fichier
// (voir typeDevine) : seuls un PPPT et un PPT adopté passent par l'analyse, les
// autres documents sont rangés dans la copropriété. Aucun dépôt ne doit pour
// autant devenir introuvable : d'où la vue « Autres documents » et une
// recherche qui porte sur l'ensemble des dépôts, filtre de statut ignoré.
import type { TypeRapport } from "./depot";
import { TYPE_RAPPORT_LABEL, normaliser } from "./referentiels";

/** Types de document qui passent par l'analyse pppt-verif et la file de revue. */
export const TYPES_REVUE: TypeRapport[] = ["pppt", "ppt_adopte"];

/** Statuts d'un rapport encore en attente d'analyse ou de revue. */
export const STATUTS_A_TRAITER = ["depose", "en_analyse", "a_relire", "echec"];

/** Statuts pendant lesquels le dirigeant peut encore corriger le type deviné. */
export const STATUTS_REQUALIFIABLES = ["depose", "en_analyse", "echec", "rejete"];

/** Ce qui est nécessaire pour trier une ligne ; le reste de la ligne est ignoré ici. */
export interface LigneRevue {
  type: TypeRapport;
  statut: string;
  name: string;
  enseigne: string | null;
  copro: { nom: string; commune: string | null; gestionnaire_nom: string | null } | null;
}

/** Le document passe-t-il par l'analyse et la revue ? */
export function aRevoir(r: Pick<LigneRevue, "type">): boolean {
  return TYPES_REVUE.includes(r.type);
}

export function requalifiable(r: Pick<LigneRevue, "statut">, dirigeant: boolean): boolean {
  return dirigeant && STATUTS_REQUALIFIABLES.includes(r.statut);
}

/** Recherche libre : copropriété, commune, gestionnaire, fichier, enseigne, type. */
export function correspond(r: LigneRevue, recherche: string): boolean {
  const q = normaliser(recherche).trim();
  if (!q) return true;
  return [r.copro?.nom, r.copro?.commune, r.copro?.gestionnaire_nom, r.name, r.enseigne, TYPE_RAPPORT_LABEL[r.type]].some((v) => normaliser(v).includes(q));
}

/** Vue courante : « a_traiter », « autres », « tous » ou un statut de rapport. */
export function dansLaVue(r: LigneRevue, vue: string): boolean {
  if (vue === "a_traiter") return aRevoir(r) && STATUTS_A_TRAITER.includes(r.statut);
  if (vue === "autres") return !aRevoir(r);
  if (vue === "tous") return true;
  return aRevoir(r) && r.statut === vue;
}

/**
 * Lignes affichées. Dès qu'une recherche est saisie, elle porte sur tous les
 * dépôts : un document rangé hors analyse (tableau PPT, PV d'AG) se retrouve
 * par le nom de sa copropriété sans avoir à deviner le bon onglet.
 */
export function filtrerRevue<T extends LigneRevue>(rapports: T[], vue: string, enseigne: string, recherche: string): T[] {
  const cherche = normaliser(recherche).trim() !== "";
  return rapports
    .filter((r) => (cherche ? true : dansLaVue(r, vue)))
    .filter((r) => correspond(r, recherche))
    .filter((r) => enseigne === "toutes" || r.enseigne === enseigne);
}
