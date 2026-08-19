// Parsing & validation de l'import Excel/CSV des lots — logique pure, testée unitairement.
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
  /** Tantièmes par clé — le code de clé est l'en-tête de colonne du fichier. */
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
  { id: "ignore", label: "— Ignorer —" },
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
