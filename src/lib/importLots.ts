// Parsing & validation de l'import Excel/CSV des lots - logique pure, testée unitairement.
// Les clés de tantièmes ne sont pas codées en dur : chaque colonne mappée « tantièmes »
// crée/alimente une clé de répartition dont le code est l'en-tête de la colonne du fichier.
import type { UsageLot } from "./finance/types";

export interface ImportedRow {
  num: string;
  batiment: string | null;
  coproprietaire: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  usage: UsageLot;
  /** Tantièmes par clé - le code de clé est l'en-tête de colonne du fichier. */
  tantiemes: Record<string, number>;
}

export interface RowError {
  line: number; // ligne du fichier (1-indexée, hors en-tête)
  message: string;
}

export type ColumnRole =
  | "num"
  | "batiment"
  | "coproprietaire"
  | "email"
  | "telephone"
  | "adresse"
  | "usage"
  | "tantiemes"
  | "ignore";

export const COLUMN_ROLES: { id: ColumnRole; label: string }[] = [
  { id: "num", label: "N° de lot" },
  { id: "batiment", label: "Bâtiment" },
  { id: "coproprietaire", label: "Copropriétaire" },
  { id: "email", label: "Adresse mail" },
  { id: "telephone", label: "Téléphone" },
  { id: "adresse", label: "Adresse postale" },
  { id: "usage", label: "Usage" },
  { id: "tantiemes", label: "Tantièmes (clé du fichier)" },
  { id: "ignore", label: "- Ignorer -" },
];

/** Code de clé de répartition tiré de l'en-tête de colonne du fichier, repris tel quel. */
export function cleCodeFromHeader(header: string, index: number): string {
  return header.trim() || `Colonne ${index + 1}`;
}

/** Colonnes mappées « tantièmes » : index + code de clé dérivé de l'en-tête. */
export function tantiemeColumns(
  mapping: ColumnRole[],
  headers: string[]
): { index: number; code: string }[] {
  return mapping
    .map((role, index) => ({ role, index }))
    .filter((c) => c.role === "tantiemes")
    .map((c) => ({ index: c.index, code: cleCodeFromHeader(headers[c.index] ?? "", c.index) }));
}

/** "1 234,56" | "1.234,56" | 1234.56 → nombre JS (formats français acceptés). */
export function parseFrNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[\s  ]/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseUsage(v: unknown): UsageLot {
  const s = String(v ?? "").toLowerCase().trim();
  if (/(habitation|logement|appart|studio|maison)/.test(s)) return "habitation";
  if (/(garage|parking|stationnement|box)/.test(s)) return "garage";
  if (/(cave|cellier)/.test(s)) return "caves";
  if (/(commerc|boutique|magasin)/.test(s)) return "commerces";
  if (/bureau/.test(s)) return "bureaux";
  return s === "" ? "habitation" : "autres";
}

/** Devine le rôle de chaque colonne à partir de son en-tête (plusieurs colonnes « tantièmes » possibles). */
export function guessMapping(headers: string[]): ColumnRole[] {
  const norm = (h: string) =>
    h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const used = new Set<ColumnRole>();
  return headers.map((h) => {
    const s = norm(h);
    let role: ColumnRole = "ignore";
    if (/(^|\b)(n.?\s*(de\s*)?lot|lot\b|num)/.test(s)) role = "num";
    else if (/mail|courriel/.test(s)) role = "email";
    else if (/(^|\b)(tel|telephone|portable|mobile|phone)/.test(s)) role = "telephone";
    else if (/bat|immeuble|entree/.test(s)) role = "batiment";
    else if (/adresse|address/.test(s)) role = "adresse";
    else if (/(coproprietaire|proprietaire|nom)/.test(s)) role = "coproprietaire";
    else if (/usage|type|nature/.test(s)) role = "usage";
    else if (/tant|mill|quote|cle|charge/.test(s)) role = "tantiemes";
    if (role !== "ignore" && role !== "tantiemes" && used.has(role)) role = "ignore";
    if (role !== "ignore") used.add(role);
    return role;
  });
}

export function buildRows(
  data: unknown[][],
  mapping: ColumnRole[],
  headers: string[]
): { rows: ImportedRow[]; errors: RowError[] } {
  const idx = (role: ColumnRole) => mapping.indexOf(role);
  const iNum = idx("num");
  const tanCols = tantiemeColumns(mapping, headers);
  const rows: ImportedRow[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();

  data.forEach((cells, i) => {
    const line = i + 1;
    const isEmpty = cells.every((c) => c == null || String(c).trim() === "");
    if (isEmpty) return;

    const num = iNum >= 0 ? String(cells[iNum] ?? "").trim() : "";
    if (!num) {
      errors.push({ line, message: "N° de lot manquant" });
      return;
    }
    if (seen.has(num)) {
      errors.push({ line, message: `Lot ${num} en double dans le fichier` });
      return;
    }
    seen.add(num);

    const tantiemes: Record<string, number> = {};
    for (const { index, code } of tanCols) {
      const raw = cells[index];
      if (raw == null || String(raw).trim() === "") continue;
      const n = parseFrNumber(raw);
      if (n == null || n < 0) {
        errors.push({ line, message: `Tantièmes « ${code} » invalides : « ${String(raw)} »` });
        return;
      }
      tantiemes[code] = n;
    }

    const j = (r: ColumnRole) => {
      const k = idx(r);
      return k >= 0 ? String(cells[k] ?? "").trim() || null : null;
    };
    rows.push({
      num,
      batiment: j("batiment"),
      coproprietaire: j("coproprietaire"),
      email: j("email"),
      telephone: j("telephone"),
      adresse: j("adresse"),
      usage: parseUsage(idx("usage") >= 0 ? cells[idx("usage")] : ""),
      tantiemes,
    });
  });

  return { rows, errors };
}

// ========== Rapprochement des bâtiments du fichier avec ceux du dossier ==========
// Bug du 29/09 (Amir, 317 avenue de Colmar) : le fichier nommait le bâtiment « 1 »,
// l'import créait un bâtiment « 1 » à côté du « 01 » déclaré à la création du
// dossier, qui restait affiché vide.

const PREFIXE_BATIMENT = /^(b[aâ]timent|b[aâ]t|immeuble|entr[ée]e)\b\.?\s*/i;

/** Clé de rapprochement : « 1 », « 01 », « Bât. 1 » et « BAT.01 » désignent le même bâtiment. */
export function cleBatiment(valeur: string): string {
  const sansAccents = valeur.normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const nu = sansAccents.replace(PREFIXE_BATIMENT, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const cle = nu || sansAccents.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return /^\d+$/.test(cle) ? String(Number(cle)) : cle;
}

/** Code d'un bâtiment créé par l'import : « 1 » → « 01 » comme à la création du dossier, sans préfixe « Bât. ». */
export function codeBatimentImporte(valeur: string): string {
  const brut = valeur.normalize("NFC").trim();
  const nu = brut.replace(PREFIXE_BATIMENT, "").trim() || brut;
  return /^\d+$/.test(nu) ? String(Number(nu)).padStart(2, "0") : nu;
}

export interface BatimentDossier {
  id: string;
  code: string;
  declare_creation: boolean;
  /** Lots déjà rangés dans ce bâtiment que le fichier ne réimporte pas. */
  autresLots: number;
}

export interface RapprochementBatiments {
  /** Valeur du fichier → bâtiment du dossier. */
  existants: Map<string, string>;
  /** Valeur du fichier → code du bâtiment à créer (plusieurs valeurs peuvent partager un code). */
  aCreer: Map<string, string>;
  /** Bâtiment des lignes sans bâtiment dans le fichier, null s'il n'y en a pas d'évident. */
  parDefaut: string | null;
}

/**
 * Range les bâtiments cités par le fichier dans ceux du dossier.
 * - Rapprochement par clé (« 1 » = « 01 »), un bâtiment déclaré à la création passant
 *   avant un bâtiment créé par un import précédent.
 * - Dossier à bâtiment unique (le déclaré, ou le seul existant) qui ne porte pas
 *   d'autres lots, et fichier citant au plus un bâtiment : c'est le même bâtiment,
 *   tous les lots y vont, même sans bâtiment ou sous un autre nom (« principal »).
 */
export function rapprocherBatiments(
  valeurs: (string | null)[],
  batiments: BatimentDossier[]
): RapprochementBatiments {
  const distinctes = Array.from(new Set(valeurs.filter((v): v is string => !!v?.trim())));
  const cles = new Set(distinctes.map(cleBatiment));

  const declares = batiments.filter((b) => b.declare_creation);
  const unique = declares.length === 1 ? declares[0] : declares.length === 0 && batiments.length === 1 ? batiments[0] : null;
  if (unique && unique.autresLots === 0 && cles.size <= 1) {
    return {
      existants: new Map(distinctes.map((v) => [v, unique.id])),
      aCreer: new Map(),
      parDefaut: unique.id,
    };
  }

  const existants = new Map<string, string>();
  const aCreer = new Map<string, string>();
  const codeParCle = new Map<string, string>();
  for (const v of distinctes) {
    const cle = cleBatiment(v);
    const candidats = batiments.filter((b) => cleBatiment(b.code) === cle);
    const choisi =
      candidats.find((b) => b.declare_creation) ?? candidats.find((b) => b.code === v.trim()) ?? candidats[0];
    if (choisi) {
      existants.set(v, choisi.id);
    } else {
      if (!codeParCle.has(cle)) codeParCle.set(cle, codeBatimentImporte(v));
      aCreer.set(v, codeParCle.get(cle)!);
    }
  }
  return { existants, aCreer, parDefaut: null };
}

/**
 * Ménage des bâtiments après un import : ceux qui n'ont aucun lot disparaissent.
 * Un bâtiment déclaré à la création avec son adresse fait foi et reste toujours
 * (règle du 14/08). Le « 01 » sans adresse posé d'office à la création ne reste
 * que tant qu'aucun lot n'est rangé ailleurs (bug du 29/09, Le Churchill : fichier
 * en « 1 et 2 », « Commun » et « 3 », ligne « Bât. 01 » vide).
 */
export function batimentsVidesASupprimer(
  batiments: { id: string; declare_creation: boolean; adresse: string | null; lots: number }[]
): string[] {
  const lotsRanges = batiments.some((b) => b.lots > 0);
  return batiments
    .filter((b) => b.lots === 0 && (!b.declare_creation || (lotsRanges && !b.adresse?.trim())))
    .map((b) => b.id);
}
