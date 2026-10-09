// Chargement de pdf.js, à la demande, dans sa version « legacy ».
//
// La version standard de pdfjs-dist 6 appelle des fonctions JavaScript très
// récentes (Map.prototype.getOrInsertComputed, Math.sumPrecise, Promise.try…)
// sans les fournir : sur un téléphone dont le navigateur n'est pas à jour, le
// document s'ouvre mais le dessin de la page plante (09/10/2026, test de
// H CHELGHAM sur la page de signature : « Le document n'a pas pu être
// affiché »). La version legacy embarque ces fonctions (core-js), pour la page
// comme pour le worker.
export async function chargerPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}
