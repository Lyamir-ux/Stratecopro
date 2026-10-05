// Export PDF du tableau de financement de tous les copropriétaires (feedback
// Amir 05/10/2026, sous « Plans individuels » de l'onglet Financement) : un seul
// tableau, une ligne par copropriétaire. Deux variantes du PF définitif validé :
// prêt collectif (colonnes des exemples du PF) et éco-PTZ individuel.
// Généré de zéro avec pdf-lib, en paysage, charte Strat Eco pro.
// Les lignes viennent de tableauFinancementCopros (lib/finance) : mêmes montants
// que l'onglet Financement et la vue Copropriétaires, au centime.
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import type { TableauFinancementCopros } from "@/lib/finance/tableauFinancementCopros";

export interface TableauCoproprietairesPdfInput {
  coproNom: string;
  /** Nom du plan de financement définitif validé. */
  planNom?: string | null;
  tableau: TableauFinancementCopros;
  /** Date de génération (défaut : aujourd'hui) - injectable pour les tests. */
  genereLe?: string;
  /** Logo Strat Eco pro blanc (PNG) ; à défaut chargé depuis /logo-strateco-pro-white.png dans le navigateur. */
  logoPng?: Uint8Array | ArrayBuffer;
}

// ---------- constantes ----------

const PAGE = { w: 841.89, h: 595.28 }; // A4 paysage
const MARGE = 40;
const LARGEUR = PAGE.w - 2 * MARGE;

const VERT_FONCE = rgb(0.29, 0.478, 0.122); // #4A7A1F
const VERT_PROFOND = rgb(0.208, 0.341, 0.09); // #355717
const FOND_VERT = rgb(0.91, 0.945, 0.843); // #E8F1D7
const ENCRE = rgb(0.102, 0.102, 0.102);
const GRIS = rgb(0.42, 0.45, 0.4);
const GRIS_CLAIR = rgb(0.898, 0.906, 0.882);
const FOND_DOUX = rgb(0.973, 0.976, 0.965);
const BLANC = rgb(1, 1, 1);

/** WinAnsi (Helvetica) : caractères hors plage remplacés. */
const txt = (s: string): string =>
  s
    .replace(/[   ]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‑–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/…/g, "...")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/[^\x20-\xFF€]/g, "?");

const euro = (n: number): string =>
  txt(n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €");
const nombre = (n: number): string => txt(n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

function wrap(s: string, font: PDFFont, size: number, maxW: number, maxLignes = 99): string[] {
  const mots = txt(s).split(/\s+/).filter(Boolean);
  const lignes: string[] = [];
  let ligne = "";
  for (const m of mots) {
    const test = ligne ? ligne + " " + m : m;
    if (font.widthOfTextAtSize(test, size) > maxW && ligne) {
      lignes.push(ligne);
      ligne = m;
    } else ligne = test;
  }
  if (ligne) lignes.push(ligne);
  if (lignes.length > maxLignes) {
    const g = lignes.slice(0, maxLignes);
    let der = g[maxLignes - 1];
    while (font.widthOfTextAtSize(der + "...", size) > maxW && der.length > 1) der = der.slice(0, -1);
    g[maxLignes - 1] = der + "...";
    return g;
  }
  return lignes;
}

interface Col {
  titre: string;
  w: number;
  align?: "right";
  /** Colonne en gras (nom, prix de revient). */
  fort?: boolean;
  /** Valeur de la colonne pour une ligne ou pour les totaux. */
  valeur: (l: Cellules) => string;
}

type Cellules = Pick<
  TableauFinancementCopros["lignes"][number],
  | "tantiemes"
  | "quotePartAvant"
  | "resteAFinancer"
  | "mensualite"
  | "coutPretAvance"
  | "primeCee"
  | "remboursementFinChantier"
  | "prixRevient"
>;

/** Colonnes du tableau selon la variante ; la colonne du nom prend la largeur restante. */
export function colonnesTableau(t: TableauFinancementCopros): Col[] {
  const duree = `${t.dureeAns.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ans`;
  const montants: Omit<Col, "w">[] =
    t.variante === "collectif"
      ? [
          { titre: "Quote-part avant aides", valeur: (l) => euro(l.quotePartAvant), align: "right" },
          { titre: "Reste à financer", valeur: (l) => euro(l.resteAFinancer), align: "right" },
          { titre: `Mensualité sur ${duree}`, valeur: (l) => euro(l.mensualite), align: "right" },
          ...(t.avance
            ? [{ titre: "Coût du prêt avance de subvention", valeur: (l: Cellules) => euro(l.coutPretAvance), align: "right" as const }]
            : []),
          { titre: "Prime C2E", valeur: (l) => euro(l.primeCee), align: "right" },
          { titre: "Prix de revient", valeur: (l) => euro(l.prixRevient), align: "right", fort: true },
        ]
      : [
          { titre: "Quote-part avant aides", valeur: (l) => euro(l.quotePartAvant), align: "right" },
          { titre: "Reste à financer (appels de fonds)", valeur: (l) => euro(l.resteAFinancer), align: "right" },
          { titre: `Mensualité sur ${duree}`, valeur: (l) => euro(l.mensualite), align: "right" },
          { titre: "Remboursé en fin de chantier", valeur: (l) => euro(l.remboursementFinChantier), align: "right" },
          { titre: "dont prime C2E", valeur: (l) => euro(l.primeCee), align: "right" },
          { titre: "Prix de revient", valeur: (l) => euro(l.prixRevient), align: "right", fort: true },
        ];
  const wTantiemes = 60;
  const wMontant = 88;
  const wNom = LARGEUR - wTantiemes - wMontant * montants.length;
  return [
    { titre: "Nom du copropriétaire", w: wNom, fort: true, valeur: () => "" },
    { titre: "Tantièmes", w: wTantiemes, align: "right", valeur: (l) => nombre(l.tantiemes) },
    ...montants.map((m) => ({ ...m, w: wMontant })),
  ];
}

/** Notes de bas de tableau : comment chaque colonne est calculée. */
export function notesTableau(t: TableauFinancementCopros): string[] {
  const pct = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
  const assurance = t.coefAssurance > 1 ? `, assurance emprunteur de ${pct((t.coefAssurance - 1) * 100)} comprise` : "";
  const tantiemes = t.cleRef
    ? `Tantièmes : clé de répartition « ${t.cleRef} »${t.totalCleRef ? ` (total ${t.totalCleRef.toLocaleString("fr-FR")})` : ""}.`
    : "";
  if (t.variante === "collectif") {
    return [
      "Quote-part avant aides : part du coût total de l'opération TTC (travaux, imprévus, maîtrise d'œuvre et frais annexes), répartie suivant la clé de chaque ligne.",
      `Reste à financer : quote-part moins les aides publiques et le fonds travaux ; la prime C2E, versée en fin de chantier, n'est pas déduite. Mensualité : reste à financer sur ${t.dureeAns.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ans${assurance}.`,
      t.avance
        ? `Coût du prêt avance de subvention : ${pct(t.tauxPretAvancePct)} des aides publiques du copropriétaire, payé en une fois. Prix de revient : reste à financer - prime C2E + coût du prêt avance de subvention.`
        : "Prêt collectif sans avance de subventions : aucun coût d'avance n'est facturé. Prix de revient : reste à financer - prime C2E.",
      tantiemes,
    ].filter(Boolean);
  }
  return [
    "Quote-part avant aides : part du coût total de l'opération TTC (travaux, imprévus, maîtrise d'œuvre et frais annexes), répartie suivant la clé de chaque ligne.",
    `Reste à financer (appels de fonds) : quote-part moins ${pct(t.pctAvanceAides)} des aides publiques et le fonds travaux. Mensualité : appels de fonds sur ${t.dureeAns.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ans${assurance}.`,
    `Remboursé en fin de chantier : ${pct(100 - t.pctAvanceAides)} des aides publiques et prime C2E, versées après les travaux. Prix de revient : quote-part moins toutes les aides et le fonds travaux.`,
    tantiemes,
  ].filter(Boolean);
}

// ---------- génération ----------

export async function genererTableauCoproprietairesPdf(input: TableauCoproprietairesPdfInput): Promise<Uint8Array> {
  const { tableau: t } = input;
  const titreCourt = `Tableau de financement - ${t.variante === "collectif" ? "prêt collectif" : "éco-PTZ individuel"}`;

  const doc = await PDFDocument.create();
  doc.setTitle(txt(`${titreCourt} - ${input.coproNom}`));
  doc.setAuthor("Strat Eco pro");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: PDFImage | null = null;
  try {
    if (input.logoPng) logo = await doc.embedPng(input.logoPng);
    else if (typeof fetch === "function" && typeof window !== "undefined") {
      const res = await fetch("/logo-strateco-pro-white.png");
      if (res.ok) logo = await doc.embedPng(await res.arrayBuffer());
    }
  } catch {
    logo = null;
  }

  const genereLe = input.genereLe ?? new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  let page!: PDFPage;
  let y = 0;
  const nouvellePage = () => {
    page = doc.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - MARGE;
    page.drawLine({ start: { x: MARGE, y: 34 }, end: { x: PAGE.w - MARGE, y: 34 }, thickness: 0.5, color: GRIS_CLAIR });
    page.drawText(txt(`${titreCourt} - ${input.coproNom} - document généré le ${genereLe} - Strat Eco pro`), { x: MARGE, y: 22, size: 7.5, font, color: GRIS });
  };
  const besoin = (h: number) => {
    if (y - h < 48) nouvellePage();
  };
  const paragraphe = (s: string, size: number, couleur: RGB = ENCRE, interligne = 2.5) => {
    for (const l of wrap(s, font, size, LARGEUR)) {
      besoin(size + 3);
      page.drawText(l, { x: MARGE, y: y - size, size, font, color: couleur });
      y -= size + interligne;
    }
  };

  nouvellePage();

  // ----- bandeau -----
  const bandeauH = 78;
  page.drawRectangle({ x: 0, y: PAGE.h - bandeauH, width: PAGE.w, height: bandeauH, color: VERT_PROFOND });
  if (logo) {
    const lh = 20;
    page.drawImage(logo, { x: MARGE, y: PAGE.h - 18 - lh, width: (logo.width / logo.height) * lh, height: lh });
  } else {
    page.drawText("STRAT ECO pro", { x: MARGE, y: PAGE.h - 32, size: 14, font: bold, color: BLANC });
  }
  page.drawText(txt(titreCourt), { x: MARGE, y: PAGE.h - 56, size: 16, font: bold, color: BLANC });
  const sousTitre = [input.coproNom, input.planNom].filter(Boolean).join("  ·  ");
  page.drawText(wrap(sousTitre, font, 9, LARGEUR - 220, 1)[0] ?? "", { x: MARGE, y: PAGE.h - 70, size: 9, font, color: BLANC });
  const droite = txt(`${t.lignes.length} copropriétaire${t.lignes.length > 1 ? "s" : ""}  ·  édité le ${genereLe}`);
  page.drawText(droite, { x: PAGE.w - MARGE - font.widthOfTextAtSize(droite, 8.5), y: PAGE.h - 70, size: 8.5, font, color: BLANC });
  y = PAGE.h - bandeauH - 14;

  // ----- tableau -----
  const cols = colonnesTableau(t);
  const xs: number[] = [];
  cols.reduce((x, c) => {
    xs.push(x);
    return x + c.w;
  }, MARGE);
  const size = 8;

  const entete = () => {
    const titres = cols.map((c) => wrap(c.titre, bold, size, c.w - 12, 3));
    const nl = Math.max(1, ...titres.map((l) => l.length));
    const h = 8 + nl * 10;
    besoin(h + 24);
    page.drawRectangle({ x: MARGE, y: y - h, width: LARGEUR, height: h, color: FOND_VERT });
    cols.forEach((c, i) => {
      titres[i].forEach((s, k) => {
        const x = c.align === "right" ? xs[i] + c.w - 6 - bold.widthOfTextAtSize(s, size) : xs[i] + 6;
        page.drawText(s, { x, y: y - 12 - k * 10, size, font: bold, color: VERT_PROFOND });
      });
    });
    y -= h;
  };
  entete();

  const hLigne = 18;
  t.lignes.forEach((l, idx) => {
    if (y - hLigne < 48) {
      nouvellePage();
      entete();
    }
    if (idx % 2 === 1) page.drawRectangle({ x: MARGE, y: y - hLigne, width: LARGEUR, height: hLigne, color: FOND_DOUX });
    page.drawLine({ start: { x: MARGE, y: y - hLigne }, end: { x: MARGE + LARGEUR, y: y - hLigne }, thickness: 0.4, color: GRIS_CLAIR });
    cols.forEach((c, i) => {
      const s = i === 0 ? (wrap(l.nom, bold, size, c.w - 12, 1)[0] ?? "") : c.valeur(l);
      const fnt = c.fort ? bold : font;
      const x = c.align === "right" ? xs[i] + c.w - 6 - fnt.widthOfTextAtSize(s, size) : xs[i] + 6;
      page.drawText(s, { x, y: y - 12, size, font: fnt, color: ENCRE });
    });
    y -= hLigne;
  });

  if (t.lignes.length === 0) {
    y -= 6;
    paragraphe("Aucun copropriétaire n'est rattaché à des lots dans ce dossier.", 9, GRIS);
  } else {
    // ligne de total
    besoin(24);
    const yT = y;
    page.drawRectangle({ x: MARGE, y: yT - 20, width: LARGEUR, height: 20, color: FOND_VERT });
    page.drawLine({ start: { x: MARGE, y: yT }, end: { x: MARGE + LARGEUR, y: yT }, thickness: 1, color: VERT_FONCE });
    cols.forEach((c, i) => {
      const s = i === 0 ? `Total - ${t.lignes.length} copropriétaire${t.lignes.length > 1 ? "s" : ""}` : c.valeur(t.totaux);
      const x = c.align === "right" ? xs[i] + c.w - 6 - bold.widthOfTextAtSize(s, size) : xs[i] + 6;
      page.drawText(s, { x, y: yT - 13.5, size, font: bold, color: VERT_PROFOND });
    });
    y = yT - 20 - 10;
  }

  // ----- notes -----
  for (const n of notesTableau(t)) paragraphe(n, 7.5, GRIS);
  y -= 2;
  paragraphe(
    "Montants indicatifs, issus du plan de financement définitif validé. Le prêt et les aides restent soumis à l'accord des organismes concernés et, pour les aides individuelles, à la situation de chaque copropriétaire.",
    7.5,
    GRIS
  );

  // numérotation
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    const s = `page ${i + 1} / ${pages.length}`;
    pg.drawText(s, { x: PAGE.w - MARGE - font.widthOfTextAtSize(s, 7.5), y: 22, size: 7.5, font, color: GRIS });
  });
  return doc.save();
}

export function nomFichierTableauCoproprietaires(coproNom: string, variante: "collectif" | "individuel", date = new Date()): string {
  const objet = variante === "collectif" ? "Tableau de financement - prêt collectif" : "Tableau de financement - éco-PTZ individuel";
  return `${coproNom} - ${objet} - ${date.toISOString().slice(0, 10)}.pdf`.replace(/[\\/:*?"<>|]/g, " ");
}
