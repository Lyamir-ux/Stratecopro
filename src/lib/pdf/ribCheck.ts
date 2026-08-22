// Vérification de concordance entre l'IBAN saisi et le RIB téléversé.
// PDF texte : extraction pdfjs (import dynamique - chargé à la demande).
// Image ou PDF scanné sans texte : « non_verifie » (contrôle manuel AMO).
import { isValidIban, normalizeIban } from "./adhesion";

export type RibConcordance = "concordant" | "discordant" | "non_verifie";

const IBAN_RE = /[A-Z]{2}\s?\d{2}(?:\s?[A-Z0-9]{2,4}){3,9}/g;

export function extractIbans(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.toUpperCase().matchAll(IBAN_RE)) {
    // la regex peut avaler un mot de trop (« … 185 BIC ») : on raccourcit
    // le candidat jusqu'à obtenir un IBAN dont la clé de contrôle est valide
    const raw = normalizeIban(m[0]);
    for (let len = Math.min(34, raw.length); len >= 14; len--) {
      const candidate = raw.slice(0, len);
      if (isValidIban(candidate)) {
        found.add(candidate);
        break;
      }
    }
  }
  return [...found];
}

/** Compare l'IBAN saisi au contenu du RIB (fichier PDF). */
export async function checkRibConcordance(file: Blob, mime: string | null, ibanSaisi: string): Promise<RibConcordance> {
  if (!mime?.includes("pdf")) return "non_verifie";
  try {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    let text = "";
    for (let p = 1; p <= Math.min(pdf.numPages, 3); p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      text += tc.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    const ibans = extractIbans(text);
    if (ibans.length === 0) return "non_verifie";
    return ibans.includes(normalizeIban(ibanSaisi)) ? "concordant" : "discordant";
  } catch {
    return "non_verifie";
  }
}
