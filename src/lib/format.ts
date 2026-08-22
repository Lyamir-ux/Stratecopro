export const fmtEuro = (n: number | null | undefined): string =>
  n == null ? "-" : n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";

/** Montant abrégé pour les espaces contraints (bulles, pastilles) : « 1,2 M€ », « 328 k€ ». */
export const fmtEuroCourt = (n: number | null | undefined): string => {
  if (n == null || n === 0) return "-";
  if (n >= 1e6) return (n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " M€";
  if (n >= 1e3) return Math.round(n / 1e3).toLocaleString("fr-FR") + " k€";
  return Math.round(n).toLocaleString("fr-FR") + " €";
};

export const fmtEuroFull = (n: number | null | undefined): string =>
  n == null
    ? "-"
    : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export const fmtDate = (iso: string | null | undefined): string =>
  iso == null
    ? "-"
    : new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
