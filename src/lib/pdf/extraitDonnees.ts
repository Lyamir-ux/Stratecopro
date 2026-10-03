// Pré-remplissage du questionnaire éco-PTZ depuis le texte d'un PDF déposé
// (audit réglementaire, devis, DPGF) - 02/10/2026. Propositions seulement :
// le déposant vérifie et complète chaque champ avant d'enregistrer.
// PDF scanné sans texte : rien n'est proposé.

/** Texte des premières pages d'un PDF (pdfjs chargé à la demande). */
export async function extraireTextePdf(file: Blob, maxPages = 40): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    let text = "";
    for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      text += tc.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    return text;
  } catch {
    return "";
  }
}

const normaliser = (t: string) => t.replace(/[\u00a0\u202f\u2009]/g, " ").replace(/\s+/g, " ");

/** Premier SIRET (14 chiffres) annoncé comme tel, au format « 791 603 384 00045 ». */
export function trouverSiret(texte: string): string | null {
  const t = normaliser(texte);
  const m = /SIRET\s*(?:n°|no|:|\s)*\s*((?:\d[ .]?){13}\d)/i.exec(t);
  if (!m) return null;
  const d = m[1].replace(/\D/g, "");
  return d.length === 14 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : null;
}

/** Adresses e-mail du document, sans celles de Strat Eco. */
export function trouverEmails(texte: string): string[] {
  const vus = new Set<string>();
  for (const m of normaliser(texte).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) {
    const e = m[0].toLowerCase().replace(/\.$/, "");
    if (!e.endsWith("@strateco.fr")) vus.add(e);
  }
  return [...vus];
}

export interface PropositionAudit {
  reference?: string;
  date?: string;
  gain_pct?: string;
  siret?: string;
  contact_email?: string;
}

/** Propositions pour l'audit : numéro ADEME, date du rapport, gain, SIRET, e-mail. */
export function proposerAudit(texte: string): PropositionAudit {
  const t = normaliser(texte);
  const out: PropositionAudit = {};
  // numéro d'enregistrement ADEME (13 caractères : lettre, 11 chiffres, lettre ; ex. A25670370399R)
  const ademe = /\b([A-Z]\d{11}[A-Z])\b/.exec(t) ?? /\b(\d{4}[A-Z]\d{7}[A-Z])\b/.exec(t);
  if (ademe) out.reference = ademe[1];
  else {
    const ref = /r[ée]f[ée]rence\s+(?:de\s+l['’]audit|du\s+rapport|du\s+dossier)?\s*[:：]\s*([A-Z0-9][A-Z0-9._\/-]{3,30})/i.exec(t);
    if (ref) out.reference = ref[1];
  }
  const date =
    /(?:date\s+(?:de\s+r[ée]alisation|du\s+rapport|d['’][ée]tablissement|d['’][ée]dition|de\s+l['’]audit)|[ée]tabli\s+le|r[ée]alis[ée]\s+le)\s*[:]?\s*(\d{1,2}[/.]\d{1,2}[/.]\d{4})/i.exec(t);
  if (date) out.date = date[1].replace(/\./g, "/").replace(/^(\d)\//, "0$1/");
  const gain = /gain\s+(?:[ée]nerg[ée]tique|de\s+consommation|en\s+[ée]nergie\s+primaire)[^%]{0,40}?(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i.exec(t);
  if (gain) out.gain_pct = gain[1].replace(".", ",");
  const siret = trouverSiret(t);
  if (siret) out.siret = siret;
  const emails = trouverEmails(t);
  if (emails.length) out.contact_email = emails[0];
  return out;
}

export interface PropositionDevis {
  siret?: string;
  contact_email?: string;
  /** Numéros des lots du PF dont l'entreprise est citée dans le document. */
  lots: number[];
}

/** Propositions pour un devis / DPGF : SIRET, e-mail, lots du PF dont l'entreprise apparaît. */
export function proposerDevis(texte: string, lots: { numero: number; entreprise: string | null }[]): PropositionDevis {
  const t = normaliser(texte).toLowerCase();
  const out: PropositionDevis = { lots: [] };
  const siret = trouverSiret(texte);
  if (siret) out.siret = siret;
  const emails = trouverEmails(texte);
  if (emails.length) out.contact_email = emails[0];
  for (const l of lots) {
    const nom = (l.entreprise ?? "").trim().toLowerCase();
    if (nom.length >= 3 && t.includes(nom)) out.lots.push(l.numero);
  }
  return out;
}
