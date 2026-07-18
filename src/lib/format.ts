export const fmtEuro = (n: number | null | undefined): string =>
  n == null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";

export const fmtEuroFull = (n: number | null | undefined): string =>
  n == null
    ? "—"
    : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export const fmtDate = (iso: string | null | undefined): string =>
  iso == null
    ? "—"
    : new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
