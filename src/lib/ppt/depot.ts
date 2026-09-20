// Dépôt de fichiers par le syndic (zone « Déposer un fichier » de la liste des
// copropriétés) : logique pure, testée à part de l'écran.
import type { Tables } from "@/lib/database.types";
import { normaliser } from "./referentiels";

export type TypeRapport = Tables<"ppt_rapports">["type"];

/** Types proposés au dépôt, dans l'ordre du menu. */
export const TYPES_DEPOT: TypeRapport[] = ["pppt", "ppt_adopte", "dpe_collectif", "pv_ag", "tableau_ppt", "autre"];

/** Types dont le dépôt déclenche une analyse par Strat Eco (alerte e-mail au dirigeant). */
export const TYPES_ANALYSES: TypeRapport[] = ["pppt", "ppt_adopte", "dpe_collectif"];

/** Type de document deviné d'après le nom du fichier ; le déposant peut le corriger. */
export function typeDevine(nomFichier: string): TypeRapport {
  const n = normaliser(nomFichier);
  if (/(^|[^a-z])dpe([^a-z]|$)/.test(n)) return "dpe_collectif";
  if (/(^|[^a-z])(pv|proces|assemblee|ag)([^a-z]|$)/.test(n)) return "pv_ag";
  if (/tableau/.test(n) || /\.xlsx?$/.test(n)) return "tableau_ppt";
  if (/adopt/.test(n)) return "ppt_adopte";
  return "pppt";
}

/** Copropriété dont le nom correspond (accents, casse et espaces de bord ignorés). */
export function trouverCopro<T extends { nom: string }>(copros: T[], nom: string): T | undefined {
  const n = normaliser(nom).trim();
  if (!n) return undefined;
  return copros.find((c) => normaliser(c.nom).trim() === n);
}
