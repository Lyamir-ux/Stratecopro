// Export PDF du portefeuille de l'espace syndic (page /syndic, feedback Amir
// 20/09/2026 : « un export PDF qui reprend la vue du portefeuille »). Généré
// de zéro avec pdf-lib, en paysage, accent vert Strat Eco de la branche
// rénovations globales, signé Strat Eco pro. Trois parties : synthèse du
// portefeuille, comparatif par gestionnaire (si plusieurs), tableau des
// copropriétés (mêmes colonnes que l'export CSV, même ordre alphabétique).
// Les lignes reçues sont celles affichées à l'écran : la recherche en cours et
// le périmètre (direction, gestionnaire, aperçu AMO) s'appliquent tels quels.
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import { PHASES, type PhaseId } from "@/lib/referentiels";

export interface LignePortefeuillePdf {
  nom: string;
  ville?: string | null;
  gestionnaire?: string | null;
  /** Phase d'avancement affichée (d'après les tâches validées du syndic). */
  phase: PhaseId;
  dpeAvant?: string | null;
  dpeApres?: string | null;
  gainPct?: number | null;
  logements: number;
  lots?: number | null;
  coproprietaires?: number | null;
  montantTtc?: number | null;
  honoraires?: number | null;
  /** Avancement des tâches du syndic, en %. */
  avancement: number;
  fragile: boolean;
  /** Tâches du syndic en retard. */
  retard: number;
}

export interface PortefeuillePdfInput {
  /** Enseigne du syndic (à la suite du titre). */
  syndicNom?: string | null;
  /** Périmètre affiché : portefeuille d'un gestionnaire, recherche en cours… */
  filtre?: string | null;
  lignes: LignePortefeuillePdf[];
  /** Date de génération (défaut : aujourd'hui) - injectable pour les tests. */
  genereLe?: string;
  /** Logo Strat Eco pro blanc (PNG) ; à défaut chargé depuis /logo-strateco-pro-white.png dans le navigateur. */
  logoPng?: Uint8Array | ArrayBuffer;
}

export interface GroupeGestionnairePdf {
  nom: string;
  copros: number;
  logements: number;
  montant: number;
  honoraires: number;
  phases: Record<PhaseId, number>;
  retard: number;
}

const NON_ATTRIBUE = "Non attribué";

/** Comparatif par gestionnaire : mêmes agrégats que la vue Tableau, triés par logements décroissants, « Non attribué » en dernier. */
export function regrouperParGestionnaire(lignes: LignePortefeuillePdf[]): GroupeGestionnairePdf[] {
  const groupes = new Map<string, GroupeGestionnairePdf>();
  for (const l of lignes) {
    const nom = l.gestionnaire?.trim() || NON_ATTRIBUE;
    const g = groupes.get(nom) ?? { nom, copros: 0, logements: 0, montant: 0, honoraires: 0, phases: { diagnostic: 0, etudes: 0, travaux: 0 }, retard: 0 };
    g.copros += 1;
    g.logements += l.logements;
    g.montant += l.montantTtc ?? 0;
    g.honoraires += l.honoraires ?? 0;
    g.phases[l.phase] += 1;
    g.retard += l.retard;
    groupes.set(nom, g);
  }
  return [...groupes.values()].sort((a, b) =>
    a.nom === NON_ATTRIBUE ? 1 : b.nom === NON_ATTRIBUE ? -1 : b.logements - a.logements || a.nom.localeCompare(b.nom, "fr")
  );
}

// ---------- constantes ----------

const PAGE = { w: 841.89, h: 595.28 }; // A4 paysage
const MARGE = 40;
const LARGEUR = PAGE.w - 2 * MARGE;

const VERT = rgb(0.478, 0.71, 0.173); // #7AB52C
const VERT_FONCE = rgb(0.29, 0.478, 0.122); // #4A7A1F
const VERT_PROFOND = rgb(0.208, 0.341, 0.09); // #355717
const FOND_VERT = rgb(0.91, 0.945, 0.843); // #E8F1D7
const ENCRE = rgb(0.102, 0.102, 0.102);
const GRIS = rgb(0.42, 0.45, 0.4);
const GRIS_CLAIR = rgb(0.898, 0.906, 0.882);
const FOND_DOUX = rgb(0.973, 0.976, 0.965);
const ORANGE = rgb(0.85, 0.52, 0.05); // diagnostic (warning)
const BLEU = rgb(0.18, 0.435, 0.659); // études (secondaire #2E6FA8)
const ROUGE_FONCE = rgb(0.6, 0.106, 0.106);
const BLANC = rgb(1, 1, 1);

const COULEUR_PHASE: Record<PhaseId, RGB> = { diagnostic: ORANGE, etudes: BLEU, travaux: VERT };

/** WinAnsi (Helvetica) : caractères hors plage remplacés. */
const txt = (s: string): string =>
  s
    .replace(/[\u00A0\u202F\u2009]/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2011\u2013\u2014]/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/\u2026/g, "...")
    .replace(/\u0153/g, "oe")
    .replace(/\u0152/g, "OE")
    .replace(/[^\x20-\xFF€]/g, "?");

const euro = (n: number | null | undefined): string => (n == null ? "-" : txt(Math.round(n).toLocaleString("fr-FR") + " €"));
const euroCourt = (n: number | null | undefined): string => {
  if (n == null || n === 0) return "-";
  if (Math.abs(n) >= 1_000_000) return txt((n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " M€");
  if (Math.abs(n) >= 1_000) return txt(Math.round(n / 1_000).toLocaleString("fr-FR") + " k€");
  return euro(n);
};
const nombre = (n: number): string => txt(n.toLocaleString("fr-FR"));
const labelPhase = (id: PhaseId): string => PHASES.find((p) => p.id === id)?.label ?? id;

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

// ---------- flux de mise en page ----------

class Flux {
  doc: PDFDocument;
  page!: PDFPage;
  y = 0;
  font: PDFFont;
  bold: PDFFont;
  genereLe: string;
  titreCourt: string;

  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont, genereLe: string, titreCourt: string) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.genereLe = genereLe;
    this.titreCourt = titreCourt;
    this.nouvellePage();
  }

  nouvellePage() {
    this.page = this.doc.addPage([PAGE.w, PAGE.h]);
    this.y = PAGE.h - MARGE;
    this.page.drawLine({ start: { x: MARGE, y: 34 }, end: { x: PAGE.w - MARGE, y: 34 }, thickness: 0.5, color: GRIS_CLAIR });
    this.page.drawText(txt(`${this.titreCourt} - document généré le ${this.genereLe} - Strat Eco pro`), { x: MARGE, y: 22, size: 7.5, font: this.font, color: GRIS });
  }

  besoin(h: number) {
    if (this.y - h < 48) this.nouvellePage();
  }

  titreSection(s: string) {
    this.besoin(34);
    this.y -= 10;
    this.page.drawRectangle({ x: MARGE, y: this.y - 13, width: 3.5, height: 14, color: VERT });
    this.page.drawText(txt(s.toUpperCase()), { x: MARGE + 10, y: this.y - 11, size: 11, font: this.bold, color: VERT_FONCE });
    this.y -= 24;
  }

  paragraphe(s: string, opts: { size?: number; color?: RGB; bold?: boolean; interligne?: number } = {}) {
    const size = opts.size ?? 9;
    const font = opts.bold ? this.bold : this.font;
    for (const l of wrap(s, font, size, LARGEUR)) {
      this.besoin(size + 3);
      this.page.drawText(l, { x: MARGE, y: this.y - size, size, font, color: opts.color ?? ENCRE });
      this.y -= size + (opts.interligne ?? 3);
    }
  }

  /** Tuiles de synthèse sur une ligne. */
  tuiles(items: { label: string; valeur: string; pied?: string; accent?: boolean }[]) {
    const h = 52;
    const gap = 10;
    const w = (LARGEUR - gap * (items.length - 1)) / items.length;
    this.besoin(h + 6);
    items.forEach((t, i) => {
      const x = MARGE + i * (w + gap);
      this.page.drawRectangle({ x, y: this.y - h, width: w, height: h, color: t.accent ? FOND_VERT : FOND_DOUX, borderColor: GRIS_CLAIR, borderWidth: 0.5 });
      this.page.drawText(txt(t.label.toUpperCase()), { x: x + 9, y: this.y - 14, size: 7, font: this.bold, color: GRIS });
      this.page.drawText(txt(t.valeur), { x: x + 9, y: this.y - 32, size: 15, font: this.bold, color: t.accent ? VERT_PROFOND : ENCRE });
      if (t.pied) this.page.drawText(wrap(t.pied, this.font, 7, w - 18, 1)[0] ?? "", { x: x + 9, y: this.y - 45, size: 7, font: this.font, color: GRIS });
    });
    this.y -= h + 8;
  }
}

interface Col {
  titre: string;
  w: number;
  align?: "right";
}

/** Tableau générique : en-tête vert clair, lignes à hauteur variable, répétition de l'en-tête en haut de page. */
function tableau(
  f: Flux,
  cols: Col[],
  lignes: { cellules: (string[] | { texte: string; couleur?: RGB; bold?: boolean; pastille?: RGB })[]; fond?: RGB }[],
  opts: { size?: number; total?: (string | null)[] } = {}
) {
  const size = opts.size ?? 8;
  const xs: number[] = [];
  cols.reduce((x, c) => {
    xs.push(x);
    return x + c.w;
  }, MARGE);
  const wTotal = cols.reduce((s, c) => s + c.w, 0);

  const entete = () => {
    f.besoin(20 + 16);
    f.page.drawRectangle({ x: MARGE, y: f.y - 18, width: wTotal, height: 18, color: FOND_VERT });
    cols.forEach((c, i) => {
      const s = txt(c.titre);
      const x = c.align === "right" ? xs[i] + c.w - 6 - f.bold.widthOfTextAtSize(s, size) : xs[i] + 6;
      f.page.drawText(s, { x, y: f.y - 12.5, size, font: f.bold, color: VERT_PROFOND });
    });
    f.y -= 18;
  };
  entete();

  for (const l of lignes) {
    const rendu = l.cellules.map((c) => (Array.isArray(c) ? { lignes: c } : { lignes: [txt(c.texte)], couleur: c.couleur, bold: c.bold, pastille: c.pastille }));
    const nl = Math.max(1, ...rendu.map((r) => r.lignes.length));
    const h = 8 + nl * 10;
    if (f.y - h < 48) {
      f.nouvellePage();
      entete();
    }
    const y0 = f.y;
    if (l.fond) f.page.drawRectangle({ x: MARGE, y: y0 - h, width: wTotal, height: h, color: l.fond });
    f.page.drawLine({ start: { x: MARGE, y: y0 - h }, end: { x: MARGE + wTotal, y: y0 - h }, thickness: 0.4, color: GRIS_CLAIR });
    rendu.forEach((r, i) => {
      const c = cols[i];
      r.lignes.forEach((s, k) => {
        const fnt = r.bold || (i === 0 && k === 0) ? f.bold : f.font;
        const sz = i === 0 && k > 0 ? 7 : size;
        const decal = r.pastille ? 11 : 0;
        const x = c.align === "right" ? xs[i] + c.w - 6 - fnt.widthOfTextAtSize(s, sz) : xs[i] + 6 + decal;
        if (r.pastille && k === 0) f.page.drawCircle({ x: xs[i] + 9.5, y: y0 - 9, size: 3.2, color: r.pastille });
        f.page.drawText(s, { x, y: y0 - 12 - k * 10, size: sz, font: fnt, color: r.couleur ?? (i === 0 && k > 0 ? GRIS : ENCRE) });
      });
    });
    f.y = y0 - h;
  }

  if (opts.total) {
    f.besoin(20);
    const yT = f.y;
    f.page.drawRectangle({ x: MARGE, y: yT - 18, width: wTotal, height: 18, color: FOND_DOUX });
    f.page.drawLine({ start: { x: MARGE, y: yT }, end: { x: MARGE + wTotal, y: yT }, thickness: 1, color: GRIS });
    opts.total.forEach((s, i) => {
      if (s == null) return;
      const c = cols[i];
      const t = txt(s);
      const x = c.align === "right" ? xs[i] + c.w - 6 - f.bold.widthOfTextAtSize(t, size) : xs[i] + 6;
      f.page.drawText(t, { x, y: yT - 12.5, size, font: f.bold, color: ENCRE });
    });
    f.y = yT - 18 - 6;
  }
}

// ---------- génération ----------

export async function genererPortefeuilleSyndicPdf(input: PortefeuillePdfInput): Promise<Uint8Array> {
  const lignes = [...input.lignes].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const groupes = regrouperParGestionnaire(lignes);

  const doc = await PDFDocument.create();
  doc.setTitle(`Portefeuille${input.syndicNom ? ` - ${input.syndicNom}` : ""}`);
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
  const f = new Flux(doc, font, bold, genereLe, `Portefeuille${input.syndicNom ? ` - ${input.syndicNom}` : ""}`);

  // ----- bandeau -----
  const bandeauH = 78;
  f.page.drawRectangle({ x: 0, y: PAGE.h - bandeauH, width: PAGE.w, height: bandeauH, color: VERT_PROFOND });
  if (logo) {
    const lh = 20;
    f.page.drawImage(logo, { x: MARGE, y: PAGE.h - 18 - lh, width: (logo.width / logo.height) * lh, height: lh });
  } else {
    f.page.drawText("STRAT ECO pro", { x: MARGE, y: PAGE.h - 32, size: 14, font: bold, color: BLANC });
  }
  f.page.drawText(txt("Votre portefeuille - rénovations globales"), { x: MARGE, y: PAGE.h - 56, size: 16, font: bold, color: BLANC });
  f.page.drawText(txt([input.syndicNom, input.filtre].filter(Boolean).join("  ·  ") || "Ensemble du portefeuille"), { x: MARGE, y: PAGE.h - 70, size: 9, font, color: BLANC });
  const droite = txt(`${lignes.length} copropriété${lignes.length > 1 ? "s" : ""}  ·  édité le ${genereLe}`);
  f.page.drawText(droite, { x: PAGE.w - MARGE - font.widthOfTextAtSize(droite, 8.5), y: PAGE.h - 70, size: 8.5, font, color: BLANC });
  f.y = PAGE.h - bandeauH - 8;

  // ----- synthèse -----
  const totalLogements = lignes.reduce((s, l) => s + l.logements, 0);
  const totalLots = lignes.reduce((s, l) => s + (l.lots ?? 0), 0);
  const totalMontant = lignes.reduce((s, l) => s + (l.montantTtc ?? 0), 0);
  const chiffrees = lignes.filter((l) => (l.montantTtc ?? 0) > 0).length;
  const totalHonoraires = lignes.reduce((s, l) => s + (l.honoraires ?? 0), 0);
  const totalRetard = lignes.reduce((s, l) => s + l.retard, 0);
  const dossiersEnRetard = lignes.filter((l) => l.retard > 0).length;
  const fragiles = lignes.filter((l) => l.fragile).length;
  const parPhase = PHASES.map((ph) => ({ ph, n: lignes.filter((l) => l.phase === ph.id).length }));
  const nbGest = groupes.filter((g) => g.nom !== NON_ATTRIBUE).length;

  f.titreSection("Synthèse du portefeuille");
  f.tuiles([
    { label: "Copropriétés", valeur: String(lignes.length), pied: [nbGest ? `${nbGest} gestionnaire${nbGest > 1 ? "s" : ""}` : null, fragiles ? `${fragiles} fragile${fragiles > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ") || undefined },
    { label: "Logements", valeur: nombre(totalLogements), pied: totalLots ? `${nombre(totalLots)} lots` : undefined },
    { label: "Montant TTC des opérations", valeur: euroCourt(totalMontant), pied: chiffrees ? `${chiffrees} dossier${chiffrees > 1 ? "s" : ""} chiffré${chiffrees > 1 ? "s" : ""} (PF validé ou scénario partagé)` : "aucun dossier chiffré", accent: true },
    { label: "Honoraires syndic TTC", valeur: euroCourt(totalHonoraires), pied: "ligne syndic des frais annexes du PF validé" },
    { label: "Tâches en retard", valeur: String(totalRetard), pied: dossiersEnRetard ? `sur ${dossiersEnRetard} dossier${dossiersEnRetard > 1 ? "s" : ""}` : "aucune échéance dépassée" },
  ]);
  // répartition par phase : une ligne de pastilles
  f.besoin(16);
  let x = MARGE;
  f.page.drawText(txt("Avancement des dossiers :"), { x, y: f.y - 10, size: 8.5, font: bold, color: ENCRE });
  x += bold.widthOfTextAtSize("Avancement des dossiers :", 8.5) + 12;
  for (const { ph, n } of parPhase) {
    f.page.drawCircle({ x: x + 3.5, y: f.y - 7, size: 3.5, color: COULEUR_PHASE[ph.id] });
    const s = txt(`${ph.label} : ${n}`);
    f.page.drawText(s, { x: x + 11, y: f.y - 10, size: 8.5, font, color: ENCRE });
    x += 11 + font.widthOfTextAtSize(s, 8.5) + 18;
  }
  f.y -= 22;

  // ----- comparatif par gestionnaire -----
  if (groupes.length > 1) {
    f.titreSection("Comparatif par gestionnaire");
    const cols: Col[] = [
      { titre: "Gestionnaire", w: 190 },
      { titre: "Copros", w: 60, align: "right" },
      { titre: "Logements", w: 72, align: "right" },
      { titre: "Montant TTC", w: 90, align: "right" },
      { titre: "Honoraires", w: 84, align: "right" },
      ...PHASES.map((ph) => ({ titre: ph.label, w: 66, align: "right" as const })),
      { titre: "Tâches en retard", w: LARGEUR - (190 + 60 + 72 + 90 + 84 + 66 * PHASES.length), align: "right" },
    ];
    tableau(
      f,
      cols,
      groupes.map((g) => ({
        cellules: [
          { texte: g.nom, bold: true },
          { texte: String(g.copros) },
          { texte: nombre(g.logements) },
          { texte: euroCourt(g.montant) },
          { texte: euroCourt(g.honoraires) },
          ...PHASES.map((ph) => ({ texte: g.phases[ph.id] ? String(g.phases[ph.id]) : "-" })),
          { texte: g.retard ? String(g.retard) : "-", couleur: g.retard ? ROUGE_FONCE : undefined, bold: g.retard > 0 },
        ],
      })),
      {
        total: ["Total", String(lignes.length), nombre(totalLogements), euroCourt(totalMontant), euroCourt(totalHonoraires), ...parPhase.map(({ n }) => (n ? String(n) : "-")), totalRetard ? String(totalRetard) : "-"],
      }
    );
  }

  // ----- copropriétés du portefeuille -----
  f.titreSection("Copropriétés du portefeuille");
  const multiGest = groupes.length > 1;
  const wGest = multiGest ? 120 : 0;
  const colsC: Col[] = [
    { titre: "Copropriété", w: multiGest ? 200 : 260 },
    ...(multiGest ? [{ titre: "Gestionnaire", w: wGest }] : []),
    { titre: "Phase", w: 74 },
    { titre: "DPE", w: 56 },
    { titre: "Logements", w: 62, align: "right" },
    { titre: "Montant TTC", w: 84, align: "right" },
    { titre: "Honoraires", w: 78, align: "right" },
    { titre: "Avancement", w: 66, align: "right" },
    { titre: "Tâches en retard", w: 0, align: "right" },
  ];
  colsC[colsC.length - 1].w = LARGEUR - colsC.slice(0, -1).reduce((s, c) => s + c.w, 0);
  tableau(
    f,
    colsC,
    lignes.map((l) => ({
      cellules: [
        [
          ...wrap(l.nom + (l.fragile ? " (fragile)" : ""), bold, 8, colsC[0].w - 12, 1),
          ...(l.ville ? wrap(l.ville, font, 7, colsC[0].w - 12, 1) : []),
        ],
        ...(multiGest ? [{ texte: l.gestionnaire?.trim() || "-" }] : []),
        { texte: labelPhase(l.phase), pastille: COULEUR_PHASE[l.phase] },
        { texte: l.dpeAvant || l.dpeApres ? `${l.dpeAvant ?? "?"} -> ${l.dpeApres ?? "?"}` : "-" },
        { texte: l.logements ? nombre(l.logements) : "-" },
        { texte: euroCourt(l.montantTtc) },
        { texte: euroCourt(l.honoraires) },
        { texte: `${Math.round(l.avancement)} %` },
        { texte: l.retard ? String(l.retard) : "-", couleur: l.retard ? ROUGE_FONCE : undefined, bold: l.retard > 0 },
      ],
    })),
    {
      total: [
        `Total - ${lignes.length} copropriété${lignes.length > 1 ? "s" : ""}`,
        ...(multiGest ? [null] : []),
        null,
        null,
        nombre(totalLogements),
        euroCourt(totalMontant),
        euroCourt(totalHonoraires),
        lignes.length ? `${Math.round(lignes.reduce((s, l) => s + l.avancement, 0) / lignes.length)} %` : "-",
        totalRetard ? String(totalRetard) : "-",
      ],
    }
  );
  if (lignes.length === 0) f.paragraphe("Aucune copropriété dans le périmètre affiché.", { size: 9, color: GRIS });
  f.y -= 4;
  f.paragraphe(
    "Phase : état d'avancement du dossier d'après les tâches validées par le syndic (diagnostic, études, travaux), comme dans les vues Bulles, Kanban et Tableau. DPE : étiquette avant -> après travaux. Le montant est celui du plan de financement validé (à défaut, du scénario partagé) ; les honoraires du syndic sont la ligne correspondante des frais annexes du PF validé. Avancement : part des tâches du syndic réalisées sur le dossier. Tâches en retard : tâches du syndic dont l'échéance est dépassée (page « Vos tâches »).",
    { size: 7.5, color: GRIS, interligne: 2.5 }
  );

  // numérotation
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    const s = `page ${i + 1} / ${pages.length}`;
    pg.drawText(s, { x: PAGE.w - MARGE - font.widthOfTextAtSize(s, 7.5), y: 22, size: 7.5, font, color: GRIS });
  });
  return doc.save();
}
