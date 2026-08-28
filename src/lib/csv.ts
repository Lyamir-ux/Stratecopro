// Export CSV partagé (séparateur ; + BOM UTF-8 : ouverture directe dans Excel
// français) - même format que les exports du tableau de bord et de l'ingénierie.

export function telechargerCsv(
  nomFichier: string,
  head: string[],
  lignes: (string | number | null | undefined)[][]
) {
  const rows = lignes.map((cells) =>
    cells.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")
  );
  const blob = new Blob(["﻿" + [head.join(";"), ...rows].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  a.click();
  URL.revokeObjectURL(url);
}
