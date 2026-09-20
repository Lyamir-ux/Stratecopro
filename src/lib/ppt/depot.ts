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

/** Lettres accentuées ramenées à leur base, longueur du texte conservée (indices comparables). */
const aplatir = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const echapperRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Renommage d'un fichier quand sa copropriété change de nom : le nom du fichier
 * porte presque toujours celui de la copropriété (« PPT_LaPorteDuSoleil_2026.xlsx »),
 * écrit avec n'importe quel séparateur. On remplace ce seul morceau, dans le
 * style rencontré (collé, tiret bas, tiret, espace), et on rend null si le nom
 * ne mentionne pas l'ancienne copropriété : rien à renommer.
 */
export function remplacerCoproDansNom(nomFichier: string, ancienne: string, nouvelle: string): string | null {
  const mots = normaliser(ancienne).split(/[^a-z0-9]+/).filter(Boolean);
  const nouveaux = normaliser(nouvelle).split(/[^a-z0-9]+/).filter(Boolean);
  if (!mots.length || !nouveaux.length) return null;
  const point = nomFichier.lastIndexOf(".");
  const base = point > 0 ? nomFichier.slice(0, point) : nomFichier;
  const ext = point > 0 ? nomFichier.slice(point) : "";
  const motif = new RegExp(mots.map(echapperRegex).join("[ _.-]*") + "(?![a-z])", "i");
  const trouve = motif.exec(aplatir(base));
  if (!trouve) return null;
  const morceau = base.slice(trouve.index, trouve.index + trouve[0].length);
  const separateur = morceau.includes("_") ? "_" : morceau.includes("-") ? "-" : morceau.includes(" ") ? " " : "";
  const minuscules = morceau === morceau.toLowerCase();
  const remplacement = nouveaux
    .map((m) => (minuscules ? m : m[0].toUpperCase() + m.slice(1)))
    .join(separateur);
  return base.slice(0, trouve.index) + remplacement + base.slice(trouve.index + trouve[0].length) + ext;
}
