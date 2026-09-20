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

/** Préfixe de nom de fichier par type de document. */
const PREFIXE_TYPE: Record<TypeRapport, string> = {
  pppt: "PPPT",
  ppt_adopte: "PPT_adopte",
  tableau_ppt: "PPT",
  dpe_collectif: "DPE",
  pv_ag: "PV_AG",
  autre: "Document",
};

/** Nom de copropriété en CamelCase sans accents ni séparateurs (Porte du Soleil → PorteDuSoleil). */
export function coproEnNomFichier(nom: string): string {
  return normaliser(nom)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((m) => m[0].toUpperCase() + m.slice(1))
    .join("");
}

/**
 * Nom de fichier proposé quand un document change de copropriété : le fichier
 * déposé porte presque toujours le nom de la copropriété (« PPT_LaPorteDuSoleil_2026.xlsx »),
 * qui devient faux après correction. L'extension d'origine est conservée.
 */
export function nomPourCopro(nomActuel: string, copro: string, type: TypeRapport, annee: number | string | null): string {
  const point = nomActuel.lastIndexOf(".");
  const ext = point > 0 ? nomActuel.slice(point) : "";
  const nom = coproEnNomFichier(copro);
  const a = annee == null ? "" : String(annee).slice(0, 4);
  return [PREFIXE_TYPE[type] ?? "Document", nom || "Copropriete", a].filter(Boolean).join("_") + ext;
}

/** Chemin de stockage d'un document : <organisation>/<copropriété>/<horodatage>-<nom>. */
export function cheminDepot(organisationId: string, coproId: string, nomFichier: string, horodatage = Date.now()): string {
  return `${organisationId}/${coproId}/${horodatage}-${nomFichier.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}
