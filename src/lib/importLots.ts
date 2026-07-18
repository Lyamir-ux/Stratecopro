// Parsing & validation de l'import Excel/CSV des lots — logique pure, testée unitairement.
import type { UsageLot } from "./finance/types";

export interface ImportedRow {
  num: string;
  batiment: string | null;
  coproprietaire: string | null;
  usage: UsageLot;
  /** Tantièmes par code de clé ('MUN', 'ESC'…). */
  tantiemes: Record<string, number>;
}

export interface RowError {
  line: number; // ligne du fichier (1-indexée, hors en-tête)
  message: string;
}

export type ColumnRole = "num" | "batiment" | "coproprietaire" | "usage" | "tan_mun" | "tan_esc" | "ignore";

export const COLUMN_ROLES: { id: ColumnRole; label: string }[] = [
  { id: "num", label: "N° de lot" },
  { id: "batiment", label: "Bâtiment" },
  { id: "coproprietaire", label: "Copropriétaire" },
  { id: "usage", label: "Usage" },
  { id: "tan_mun", label: "Tantièmes MUN (‰)" },
  { id: "tan_esc", label: "Tantièmes escalier (‰)" },
  { id: "ignore", label: "— Ignorer —" },
];

/** "1 234,56" | "1.234,56" | 1234.56 → nombre JS (formats français acceptés). */
export function parseFrNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[\s  ]/g, "");
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
  return s === "" ? "habitation" : "autres";
}

/** Devine le rôle de chaque colonne à partir de son en-tête. */
export function guessMapping(headers: string[]): ColumnRole[] {
  const norm = (h: string) =>
    h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const used = new Set<ColumnRole>();
  return headers.map((h) => {
    const s = norm(h);
    let role: ColumnRole = "ignore";
    if (/(^|\b)(n.?\s*(de\s*)?lot|lot\b|num)/.test(s)) role = "num";
    else if (/bat|immeuble|entree/.test(s)) role = "batiment";
    else if (/(coproprietaire|proprietaire|nom)/.test(s)) role = "coproprietaire";
    else if (/usage|type|nature/.test(s)) role = "usage";
    else if (/esc|cage/.test(s) && /tant|mill|quote|cle/.test(s)) role = "tan_esc";
    else if (/tant|mill|quote|mun|(^|\b)cle/.test(s)) role = "tan_mun";
    if (role !== "ignore" && used.has(role)) role = "ignore";
    if (role !== "ignore") used.add(role);
    return role;
  });
}

export function buildRows(
  data: unknown[][],
  mapping: ColumnRole[]
): { rows: ImportedRow[]; errors: RowError[] } {
  const idx = (role: ColumnRole) => mapping.indexOf(role);
  const iNum = idx("num");
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
    for (const [role, code] of [
      ["tan_mun", "MUN"],
      ["tan_esc", "ESC"],
    ] as const) {
      const j = idx(role);
      if (j < 0) continue;
      const raw = cells[j];
      if (raw == null || String(raw).trim() === "") continue;
      const n = parseFrNumber(raw);
      if (n == null || n < 0) {
        errors.push({ line, message: `Tantièmes ${code} invalides : « ${String(raw)} »` });
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
      usage: parseUsage(idx("usage") >= 0 ? cells[idx("usage")] : ""),
      tantiemes,
    });
  });

  return { rows, errors };
}

/** Contrôle global : la clé MUN doit approcher 1000 ‰ (tolérance ±1). */
export function checkTotals(rows: ImportedRow[]): string | null {
  const tot = rows.reduce((a, r) => a + (r.tantiemes.MUN ?? 0), 0);
  if (tot === 0) return null; // pas de colonne MUN mappée
  if (Math.abs(tot - 1000) > 1) {
    return `La somme des tantièmes MUN vaut ${tot.toLocaleString("fr-FR")} ‰ au lieu de 1 000 ‰ — vérifiez le fichier.`;
  }
  return null;
}
