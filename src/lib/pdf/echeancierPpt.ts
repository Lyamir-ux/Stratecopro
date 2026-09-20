// Export PDF de l'échéancier PPT d'une copropriété (fiche copro, onglet
// Échéancier - feedback Amir 20/09/2026). Généré de zéro avec pdf-lib, en
// paysage, accent bleu énergie de la branche PPT, signé Strat Eco pro (logo pro
// blanc, feedback 20/09). Trois parties : synthèse,
// grille année par année (les décalages et montants saisis du syndic sont
// repris tels quels), détail des postes avec commentaires. Montants indicatifs.
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import { anneeEffective, cepApres, etiquetteDepuisCep, gainCumule, montantTtcPoste, type ParametresCalcul, type PosteCalcul } from "@/lib/ppt/formules";
import { plageAnnees, posteDeplacable } from "@/lib/ppt/echeancier";

/** Poste tel qu'attendu par l'export (sous-ensemble de ppt_postes). */
export interface PosteEcheancierPdf extends PosteCalcul {
  id: string;
  libelle: string;
  batiment?: string | null;
  statut: string;
  montant_vote: number | null;
  commentaire_syndic?: string | null;
  origine?: string | null;
  position: number;
}

export interface EcheancierPdfInput {
  copro: {
    nom: string;
    adresse?: string | null;
    code_postal?: string | null;
    commune?: string | null;
    nb_logements?: number | null;
    nb_lots?: number | null;
    etiquette_energie?: string | null;
    cep_kwhep_m2_an?: number | null;
    gestionnaire_nom?: string | null;
  };
  nomEnseigne?: string | null;
  postes: PosteEcheancierPdf[];
  params: ParametresCalcul;
  /** Année courante (première colonne de la grille). */
  annee: number;
  /** Date de génération (défaut : aujourd'hui) - injectable pour les tests. */
  genereLe?: string;
  /** Logo Strat Eco pro blanc (PNG) ; à défaut il est chargé depuis /logo-strateco-pro-white.png dans le navigateur. */
  logoPng?: Uint8Array | ArrayBuffer;
}

// ---------- constantes ----------

const PAGE = { w: 841.89, h: 595.28 }; // A4 paysage
const MARGE = 40;
const LARGEUR = PAGE.w - 2 * MARGE;

const BLEU = rgb(0.18, 0.435, 0.659); // #2E6FA8
const BLEU_FONCE = rgb(0.118, 0.31, 0.486); // #1E4F7C
const FOND_BLEU = rgb(0.918, 0.949, 0.98); // #EAF2FA
const ENCRE = rgb(0.102, 0.102, 0.102);
const GRIS = rgb(0.42, 0.45, 0.4);
const GRIS_CLAIR = rgb(0.898, 0.906, 0.882);
const FOND_DOUX = rgb(0.973, 0.976, 0.965);
const ORANGE = rgb(0.72, 0.43, 0);
const VERT = rgb(0.298, 0.686, 0.314); // --color-success-500
const VERT_FONCE = rgb(0.18, 0.49, 0.196); // --color-success-700
const VERT_CLAIR = rgb(0.91, 0.961, 0.914); // --color-success-50
const ROUGE = rgb(0.863, 0.149, 0.149); // --color-error-500
const ROUGE_FONCE = rgb(0.6, 0.106, 0.106); // --color-error-700
const ROUGE_CLAIR = rgb(0.992, 0.925, 0.925); // --color-error-50
const BLANC = rgb(1, 1, 1);

const PRIORITE: Record<string, string> = { preservation: "Préservation", energetique: "Énergétique", amelioration: "Amélioration", securite: "Sécurité", sante: "Santé" };
const STATUT: Record<string, string> = { programme: "Programmé", presente: "Présenté", vote: "Voté", rejete: "Rejeté", reporte: "Reporté", realise: "Réalisé", abandonne: "Abandonné" };

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

const euro = (n: number | null | undefined): string => (n == null ? "-" : txt(Math.round(n).toLocaleString("fr-FR") + " €"));
const euroCourt = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) return txt((n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " M€");
  if (Math.abs(n) >= 1_000) return txt(Math.round(n / 1_000).toLocaleString("fr-FR") + " k€");
  return euro(n);
};
const pct = (f: number): string => txt((f * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %");

/** Montant retenu : voté, sinon saisi par le syndic, sinon TTC actualisé (formules). */
export function montantRetenu(p: PosteEcheancierPdf, params: ParametresCalcul, annee: number | null = anneeEffective(p)): number | null {
  if (p.statut === "vote" && p.montant_vote != null) return p.montant_vote;
  return montantTtcPoste(p, params, annee);
}

/** Marqueur d'origine du montant retenu : (v) voté, (s) saisi par le syndic. */
export function marqueurMontant(p: PosteEcheancierPdf): string {
  if (p.statut === "vote" && p.montant_vote != null) return " (v)";
  if (p.montant_syndic != null) return " (s)";
  return "";
}

/** Découpe la grille en blocs de colonnes lisibles, équilibrés (15 ans -> 8 + 7). */
export function blocsAnnees(annees: number[], parBloc = 12): number[][] {
  if (annees.length === 0) return [];
  const nb = Math.ceil(annees.length / parBloc);
  const taille = Math.ceil(annees.length / nb);
  const out: number[][] = [];
  for (let i = 0; i < annees.length; i += taille) out.push(annees.slice(i, i + taille));
  return out;
}

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
  logo: PDFImage | null;
  genereLe: string;
  titreCourt: string;

  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont, logo: PDFImage | null, genereLe: string, titreCourt: string) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.logo = logo;
    this.genereLe = genereLe;
    this.titreCourt = titreCourt;
    this.nouvellePage();
  }

  nouvellePage() {
    this.page = this.doc.addPage([PAGE.w, PAGE.h]);
    this.y = PAGE.h - MARGE;
    this.page.drawLine({ start: { x: MARGE, y: 34 }, end: { x: PAGE.w - MARGE, y: 34 }, thickness: 0.5, color: GRIS_CLAIR });
    this.page.drawText(txt(`${this.titreCourt} - document indicatif généré le ${this.genereLe} - Strat Eco pro`), { x: MARGE, y: 22, size: 7.5, font: this.font, color: GRIS });
  }

  besoin(h: number) {
    if (this.y - h < 48) this.nouvellePage();
  }

  titreSection(s: string) {
    this.besoin(34);
    this.y -= 10;
    this.page.drawRectangle({ x: MARGE, y: this.y - 13, width: 3.5, height: 14, color: BLEU });
    this.page.drawText(txt(s.toUpperCase()), { x: MARGE + 10, y: this.y - 11, size: 11, font: this.bold, color: BLEU_FONCE });
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
      this.page.drawRectangle({ x, y: this.y - h, width: w, height: h, color: t.accent ? FOND_BLEU : FOND_DOUX, borderColor: GRIS_CLAIR, borderWidth: 0.5 });
      this.page.drawText(txt(t.label.toUpperCase()), { x: x + 9, y: this.y - 14, size: 7, font: this.bold, color: GRIS });
      this.page.drawText(txt(t.valeur), { x: x + 9, y: this.y - 32, size: 15, font: this.bold, color: t.accent ? BLEU_FONCE : ENCRE });
      if (t.pied) this.page.drawText(wrap(t.pied, this.font, 7, w - 18, 1)[0] ?? "", { x: x + 9, y: this.y - 45, size: 7, font: this.font, color: GRIS });
    });
    this.y -= h + 8;
  }
}

// ---------- génération ----------

export async function genererEcheancierPdf(input: EcheancierPdfInput): Promise<Uint8Array> {
  const { copro, params, annee } = input;
  const postes = [...input.postes].filter((p) => true).sort((a, b) => (anneeEffective(a) ?? 9999) - (anneeEffective(b) ?? 9999) || a.position - b.position);

  const doc = await PDFDocument.create();
  doc.setTitle(`Échéancier PPT - ${copro.nom}`);
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
  const f = new Flux(doc, font, bold, logo, genereLe, `Échéancier PPT - ${copro.nom}`);

  // ----- bandeau -----
  const bandeauH = 78;
  f.page.drawRectangle({ x: 0, y: PAGE.h - bandeauH, width: PAGE.w, height: bandeauH, color: BLEU });
  if (logo) {
    const lh = 20;
    f.page.drawImage(logo, { x: MARGE, y: PAGE.h - 18 - lh, width: (logo.width / logo.height) * lh, height: lh });
  } else {
    f.page.drawText("STRAT ECO pro", { x: MARGE, y: PAGE.h - 32, size: 14, font: bold, color: BLANC });
  }
  f.page.drawText(txt("Échéancier des travaux - plan pluriannuel"), { x: MARGE, y: PAGE.h - 56, size: 16, font: bold, color: BLANC });
  const adresse = [copro.adresse, [copro.code_postal, copro.commune].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  f.page.drawText(txt(`${copro.nom}${adresse ? " - " + adresse : ""}`), { x: MARGE, y: PAGE.h - 70, size: 9, font, color: BLANC });
  const droite = txt([input.nomEnseigne, copro.gestionnaire_nom ? `gestionnaire : ${copro.gestionnaire_nom}` : null, `édité le ${genereLe}`].filter(Boolean).join("  ·  "));
  f.page.drawText(droite, { x: PAGE.w - MARGE - font.widthOfTextAtSize(droite, 8.5), y: PAGE.h - 70, size: 8.5, font, color: BLANC });
  f.y = PAGE.h - bandeauH - 8;

  // ----- synthèse -----
  const actifs = postes;
  const estime = (p: PosteEcheancierPdf) => montantTtcPoste({ ...p, montant_syndic: null }, params, p.annee_prevue ?? annee);
  const totalEstime = actifs.reduce((s, p) => s + (estime(p) ?? 0), 0);
  const totalRetenu = actifs.reduce((s, p) => s + (montantRetenu(p, params) ?? 0), 0);
  const nonChiffres = actifs.filter((p) => montantRetenu(p, params) == null).length;
  const gain = gainCumule(actifs, annee + 10);
  const cepFinal = cepApres(copro.cep_kwhep_m2_an ?? null, gain);
  const votes = actifs.filter((p) => p.statut === "vote").length;
  const figes = actifs.filter((p) => !posteDeplacable(p)).length;

  f.titreSection("Synthèse");
  f.tuiles([
    { label: "Postes du plan", valeur: String(actifs.length), pied: `${votes} voté${votes > 1 ? "s" : ""} · ${nonChiffres} non chiffré${nonChiffres > 1 ? "s" : ""}` },
    { label: "TTC estimé (rapport)", valeur: euroCourt(totalEstime), pied: "aux années prévues au plan" },
    { label: "TTC retenu", valeur: euroCourt(totalRetenu), pied: "après décalages, saisies et votes", accent: true },
    { label: "Gain énergétique à terme", valeur: pct(gain), pied: copro.cep_kwhep_m2_an ? `Cep ${Math.round(copro.cep_kwhep_m2_an)} -> ${cepFinal != null ? Math.round(cepFinal) : "-"} kWh/m².an (${etiquetteDepuisCep(cepFinal) ?? "-"})` : "Cep de référence inconnu" },
    { label: "Copropriété", valeur: copro.nb_logements != null ? `${copro.nb_logements} logements` : "-", pied: [copro.nb_lots != null ? `${copro.nb_lots} lots` : null, copro.etiquette_energie ? `DPE ${copro.etiquette_energie}` : null].filter(Boolean).join(" · ") || undefined },
  ]);

  // ----- grille année par année -----
  f.titreSection("Échéancier année par année");
  const annees = plageAnnees(actifs, annee);
  const sansAnnee = actifs.filter((p) => anneeEffective(p) == null);
  const colPoste = 190;
  const blocs = blocsAnnees(annees, 12);
  const sizeCell = 8;

  const colW = (LARGEUR - colPoste) / Math.max(...blocs.map((b) => b.length), 1);
  blocs.forEach((bloc, iBloc) => {
    // premier bloc : tous les postes (dont ceux sans année) ; suivants : ceux du bloc seulement
    const lignesBloc = iBloc === 0 ? actifs.filter((p) => anneeEffective(p) == null || anneeEffective(p)! <= bloc[bloc.length - 1]) : actifs.filter((p) => bloc.includes(anneeEffective(p) ?? -1));
    const hEntete = 20;
    // en-tête
    f.besoin(hEntete + 24);
    const yTop = f.y;
    f.page.drawRectangle({ x: MARGE, y: yTop - hEntete, width: colPoste + colW * bloc.length, height: hEntete, color: FOND_BLEU });
    f.page.drawText("Poste", { x: MARGE + 6, y: yTop - 14, size: 8, font: bold, color: BLEU_FONCE });
    bloc.forEach((a, i) => {
      const s = String(a);
      const x = MARGE + colPoste + i * colW + colW - 6 - bold.widthOfTextAtSize(s, 8);
      f.page.drawText(s, { x, y: yTop - 14, size: 8, font: bold, color: a === annee ? BLEU : BLEU_FONCE });
    });
    f.y = yTop - hEntete;

    // lignes
    for (const p of lignesBloc) {
      const aEff = anneeEffective(p);
      const lignesLib = wrap(p.libelle + (p.origine === "syndic" ? " (ajouté)" : ""), font, sizeCell, colPoste - 12, 2);
      const h = 10 + lignesLib.length * 10;
      f.besoin(h);
      const y0 = f.y;
      f.page.drawLine({ start: { x: MARGE, y: y0 - h }, end: { x: MARGE + LARGEUR, y: y0 - h }, thickness: 0.4, color: GRIS_CLAIR });
      lignesLib.forEach((l, i) => f.page.drawText(l, { x: MARGE + 6, y: y0 - 12 - i * 10, size: sizeCell, font: i === 0 ? bold : font, color: ENCRE }));
      bloc.forEach((a, i) => {
        const x0 = MARGE + colPoste + i * colW;
        if (a === annee) f.page.drawRectangle({ x: x0, y: y0 - h, width: colW, height: h, color: FOND_DOUX, opacity: 0.6 });
        if (aEff !== a) return;
        const m = montantRetenu(p, params, a);
        const s = (m != null ? euroCourt(m) : "non chiffré") + marqueurMontant(p);
        const fige = !posteDeplacable(p);
        const w = bold.widthOfTextAtSize(s, sizeCell);
        const pw = Math.min(colW - 4, w + 10);
        const px = x0 + colW - 2 - pw;
        // couleur : voté en vert, rejeté en AG en rouge, figé (réalisé, abandonné) en gris, saisi bord bleu, sinon bleu doux
        const vote = p.statut === "vote";
        const rejete = p.statut === "rejete";
        const fond = vote ? VERT_CLAIR : rejete ? ROUGE_CLAIR : fige ? GRIS_CLAIR : p.montant_syndic != null ? BLANC : FOND_BLEU;
        const bord = vote ? VERT : rejete ? ROUGE : p.montant_syndic != null ? BLEU : fige ? GRIS_CLAIR : FOND_BLEU;
        const encre = vote ? VERT_FONCE : rejete ? ROUGE_FONCE : fige ? GRIS : BLEU_FONCE;
        f.page.drawRectangle({ x: px, y: y0 - h + (h - 14) / 2, width: pw, height: 14, color: fond, borderColor: bord, borderWidth: 0.8 });
        f.page.drawText(s, { x: px + (pw - w) / 2, y: y0 - h + (h - 14) / 2 + 4, size: sizeCell, font: bold, color: encre });
      });
      f.y = y0 - h;
    }

    // totaux
    f.besoin(20);
    const yT = f.y;
    const wBloc = colPoste + colW * bloc.length;
    f.page.drawRectangle({ x: MARGE, y: yT - 18, width: wBloc, height: 18, color: FOND_DOUX });
    f.page.drawLine({ start: { x: MARGE, y: yT }, end: { x: MARGE + wBloc, y: yT }, thickness: 1, color: GRIS });
    f.page.drawText(txt("Total TTC retenu"), { x: MARGE + 6, y: yT - 12.5, size: 8, font: bold, color: ENCRE });
    bloc.forEach((a, i) => {
      const t = actifs.reduce((s, p) => (anneeEffective(p) === a ? s + (montantRetenu(p, params, a) ?? 0) : s), 0);
      const s = t ? euroCourt(t) : "-";
      const x = MARGE + colPoste + i * colW + colW - 6 - bold.widthOfTextAtSize(s, 8);
      f.page.drawText(s, { x, y: yT - 12.5, size: 8, font: bold, color: ENCRE });
    });
    f.y = yT - 18 - (blocs.length > 1 ? 14 : 6);
  });
  if (sansAnnee.length > 0) {
    f.paragraphe(`Sans année fixée : ${sansAnnee.map((p) => p.libelle).join(" ; ")}.`, { size: 8, color: ORANGE });
  }
  f.paragraphe(
    `(v) montant voté en assemblée générale (pastille verte) · (s) montant saisi par le syndic · pastille rouge : poste rejeté en AG, à représenter · pastille grise : poste réalisé ou abandonné. Les autres montants sont le TTC actualisé du rapport à l'année affichée : inflation ${pct(params.inflation)} par an depuis ${params.anneeBase}, TVA ${pct(params.tvaFacades)} (${pct(params.tvaEnergetique)} pour l'énergétique), maîtrise d'œuvre ${pct(params.moe)} le cas échéant, honoraires syndic ${pct(params.syndic)}.`,
    { size: 7.5, color: GRIS, interligne: 2.5 }
  );

  // ----- détail des postes -----
  f.titreSection("Détail des postes");
  const cols: { titre: string; w: number; align?: "right" }[] = [
    { titre: "Poste", w: 215 },
    { titre: "Nature", w: 78 },
    { titre: "Année plan", w: 58, align: "right" },
    { titre: "Année retenue", w: 68, align: "right" },
    { titre: "TTC estimé", w: 78, align: "right" },
    { titre: "TTC retenu", w: 84, align: "right" },
    { titre: "Statut", w: 62 },
    { titre: "Commentaire du syndic", w: LARGEUR - (215 + 78 + 58 + 68 + 78 + 84 + 62) },
  ];
  const xs: number[] = [];
  cols.reduce((x, c) => {
    xs.push(x);
    return x + c.w;
  }, MARGE);
  const entete = () => {
    f.besoin(20);
    f.page.drawRectangle({ x: MARGE, y: f.y - 18, width: LARGEUR, height: 18, color: FOND_BLEU });
    cols.forEach((c, i) => {
      const s = txt(c.titre);
      const x = c.align === "right" ? xs[i] + c.w - 6 - bold.widthOfTextAtSize(s, 8) : xs[i] + 6;
      f.page.drawText(s, { x, y: f.y - 12.5, size: 8, font: bold, color: BLEU_FONCE });
    });
    f.y -= 18;
  };
  entete();
  for (const p of actifs) {
    const aEff = anneeEffective(p);
    const retenu = montantRetenu(p, params);
    const cellules: string[][] = [
      wrap(p.libelle + (p.batiment ? ` (${p.batiment})` : "") + (p.origine === "syndic" ? " - ajouté par le syndic" : ""), font, 8, cols[0].w - 12, 3),
      [txt(PRIORITE[p.priorite] ?? p.priorite)],
      [p.annee_prevue != null ? String(p.annee_prevue) : "-"],
      [aEff != null ? String(aEff) + (aEff !== p.annee_prevue ? " *" : "") : "à fixer"],
      [euro(estime(p))],
      [retenu != null ? euro(retenu) + marqueurMontant(p) : "non chiffré"],
      [txt(STATUT[p.statut] ?? p.statut)],
      wrap(p.commentaire_syndic ?? "", font, 8, cols[7].w - 12, 4),
    ];
    const nl = Math.max(1, ...cellules.map((c) => c.length));
    const h = 8 + nl * 10;
    if (f.y - h < 48) {
      f.nouvellePage();
      entete();
    }
    const y0 = f.y;
    f.page.drawLine({ start: { x: MARGE, y: y0 - h }, end: { x: MARGE + LARGEUR, y: y0 - h }, thickness: 0.4, color: GRIS_CLAIR });
    cellules.forEach((lignes, i) => {
      const c = cols[i];
      lignes.forEach((l, k) => {
        const fnt = i === 0 && k === 0 ? bold : font;
        const color = i === 7 ? BLEU_FONCE : i === 3 && aEff != null && aEff !== p.annee_prevue ? ORANGE : ENCRE;
        const x = c.align === "right" ? xs[i] + c.w - 6 - fnt.widthOfTextAtSize(l, 8) : xs[i] + 6;
        f.page.drawText(l, { x, y: y0 - 12 - k * 10, size: 8, font: fnt, color });
      });
    });
    f.y = y0 - h;
  }
  f.y -= 4;
  f.paragraphe("* année différente de celle prévue au plan (décalage décidé par le syndic ou report d'assemblée générale). Montants TTC indicatifs, à confirmer par devis ; le montant voté fait foi une fois la résolution adoptée.", { size: 7.5, color: GRIS, interligne: 2.5 });

  numeroterPages(doc, font);
  return doc.save();
}

function numeroterPages(doc: PDFDocument, font: PDFFont) {
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    const s = `page ${i + 1} / ${pages.length}`;
    pg.drawText(s, { x: PAGE.w - MARGE - font.widthOfTextAtSize(s, 7.5), y: 22, size: 7.5, font, color: GRIS });
  });
}

// ---------- échéancier du portefeuille (toutes les copropriétés) ----------

export interface LigneEcheancierPdf {
  nom: string;
  commune?: string | null;
  gestionnaire_nom?: string | null;
  nb_logements?: number | null;
  /** Montant TTC retenu par année. */
  parAnnee: Map<number, number>;
  total: number;
}

export interface EcheancierPortefeuillePdfInput {
  nomEnseigne?: string | null;
  /** Filtre affiché (gestionnaire), ou null pour tout le portefeuille. */
  gestionnaire?: string | null;
  lignes: LigneEcheancierPdf[];
  annees: number[];
  params: ParametresCalcul;
  annee: number;
  genereLe?: string;
  logoPng?: Uint8Array | ArrayBuffer;
}

/** PDF de l'échéancier de toutes les copropriétés : copro × année, totaux (feedback 20/09). */
export async function genererEcheancierPortefeuillePdf(input: EcheancierPortefeuillePdfInput): Promise<Uint8Array> {
  const { params, annee, annees } = input;
  const lignes = [...input.lignes].sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, "fr"));

  const doc = await PDFDocument.create();
  doc.setTitle(`Échéancier PPT du portefeuille${input.nomEnseigne ? ` - ${input.nomEnseigne}` : ""}`);
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
  const f = new Flux(doc, font, bold, logo, genereLe, `Échéancier PPT du portefeuille${input.nomEnseigne ? ` - ${input.nomEnseigne}` : ""}`);

  // bandeau
  const bandeauH = 78;
  f.page.drawRectangle({ x: 0, y: PAGE.h - bandeauH, width: PAGE.w, height: bandeauH, color: BLEU });
  if (logo) {
    const lh = 20;
    f.page.drawImage(logo, { x: MARGE, y: PAGE.h - 18 - lh, width: (logo.width / logo.height) * lh, height: lh });
  } else f.page.drawText("STRAT ECO pro", { x: MARGE, y: PAGE.h - 32, size: 14, font: bold, color: BLANC });
  f.page.drawText(txt("Échéancier des travaux - toutes les copropriétés"), { x: MARGE, y: PAGE.h - 56, size: 16, font: bold, color: BLANC });
  f.page.drawText(txt([input.nomEnseigne, input.gestionnaire ? `gestionnaire : ${input.gestionnaire}` : "tout le portefeuille"].filter(Boolean).join(" - ")), { x: MARGE, y: PAGE.h - 70, size: 9, font, color: BLANC });
  const droite = txt(`${lignes.length} copropriété${lignes.length > 1 ? "s" : ""}  ·  édité le ${genereLe}`);
  f.page.drawText(droite, { x: PAGE.w - MARGE - font.widthOfTextAtSize(droite, 8.5), y: PAGE.h - 70, size: 8.5, font, color: BLANC });
  f.y = PAGE.h - bandeauH - 8;

  // synthèse
  const total = lignes.reduce((s, l) => s + l.total, 0);
  const totaux = annees.map((a) => lignes.reduce((s, l) => s + (l.parAnnee.get(a) ?? 0), 0));
  const iMax = totaux.indexOf(Math.max(...totaux));
  const logements = lignes.reduce((s, l) => s + (l.nb_logements ?? 0), 0);
  f.titreSection("Synthèse");
  f.tuiles([
    { label: "Copropriétés", valeur: String(lignes.length), pied: logements ? `${logements} logements` : undefined },
    { label: "TTC retenu sur la période", valeur: euroCourt(total), pied: `${annees[0]} à ${annees[annees.length - 1]}`, accent: true },
    { label: "Année la plus chargée", valeur: iMax >= 0 && totaux[iMax] > 0 ? String(annees[iMax]) : "-", pied: iMax >= 0 && totaux[iMax] > 0 ? euroCourt(totaux[iMax]) : undefined },
    { label: "Moyenne par an", valeur: euroCourt(total / Math.max(1, annees.length)), pied: "sur la période affichée" },
  ]);

  // grille copro × année
  f.titreSection("Échéancier par copropriété");
  const colCopro = 200;
  const colTotal = 62;
  const blocs = blocsAnnees(annees, 12);
  const colW = (LARGEUR - colCopro - colTotal) / Math.max(...blocs.map((b) => b.length), 1);
  const size = 8;
  blocs.forEach((bloc, iBloc) => {
    const wBloc = colCopro + colW * bloc.length + colTotal;
    const entete = () => {
      f.besoin(20 + 22);
      const yTop = f.y;
      f.page.drawRectangle({ x: MARGE, y: yTop - 20, width: wBloc, height: 20, color: FOND_BLEU });
      f.page.drawText(txt("Copropriété"), { x: MARGE + 6, y: yTop - 14, size, font: bold, color: BLEU_FONCE });
      bloc.forEach((a, i) => {
        const s = String(a) + (a === annee + 10 ? "+" : "");
        f.page.drawText(s, { x: MARGE + colCopro + i * colW + colW - 6 - bold.widthOfTextAtSize(s, size), y: yTop - 14, size, font: bold, color: a === annee ? BLEU : BLEU_FONCE });
      });
      const t = iBloc === blocs.length - 1 ? "Total" : "";
      if (t) f.page.drawText(t, { x: MARGE + wBloc - 6 - bold.widthOfTextAtSize(t, size), y: yTop - 14, size, font: bold, color: BLEU_FONCE });
      f.y = yTop - 20;
    };
    entete();
    for (const l of lignes) {
      const sous = [l.gestionnaire_nom, l.commune, l.nb_logements != null ? `${l.nb_logements} lgts` : null].filter(Boolean).join(" · ");
      const h = sous ? 24 : 16;
      if (f.y - h < 48) {
        f.nouvellePage();
        entete();
      }
      const y0 = f.y;
      f.page.drawLine({ start: { x: MARGE, y: y0 - h }, end: { x: MARGE + wBloc, y: y0 - h }, thickness: 0.4, color: GRIS_CLAIR });
      f.page.drawText(wrap(l.nom, bold, size, colCopro - 12, 1)[0] ?? "", { x: MARGE + 6, y: y0 - 11, size, font: bold, color: ENCRE });
      if (sous) f.page.drawText(wrap(sous, font, 7, colCopro - 12, 1)[0] ?? "", { x: MARGE + 6, y: y0 - 20, size: 7, font, color: GRIS });
      bloc.forEach((a, i) => {
        const x0 = MARGE + colCopro + i * colW;
        if (a === annee) f.page.drawRectangle({ x: x0, y: y0 - h, width: colW, height: h, color: FOND_DOUX, opacity: 0.6 });
        const v = l.parAnnee.get(a);
        if (!v) return;
        const s = euroCourt(v);
        f.page.drawText(s, { x: x0 + colW - 6 - font.widthOfTextAtSize(s, size), y: y0 - 11 - (sous ? 4 : 0), size, font, color: ENCRE });
      });
      if (iBloc === blocs.length - 1) {
        const s = l.total ? euroCourt(l.total) : "-";
        f.page.drawText(s, { x: MARGE + wBloc - 6 - bold.widthOfTextAtSize(s, size), y: y0 - 11 - (sous ? 4 : 0), size, font: bold, color: BLEU_FONCE });
      }
      f.y = y0 - h;
    }
    // totaux
    f.besoin(20);
    const yT = f.y;
    f.page.drawRectangle({ x: MARGE, y: yT - 18, width: wBloc, height: 18, color: FOND_DOUX });
    f.page.drawLine({ start: { x: MARGE, y: yT }, end: { x: MARGE + wBloc, y: yT }, thickness: 1, color: GRIS });
    f.page.drawText(txt("Total TTC retenu"), { x: MARGE + 6, y: yT - 12.5, size, font: bold, color: ENCRE });
    bloc.forEach((a, i) => {
      const t = totaux[annees.indexOf(a)] ?? 0;
      const s = t ? euroCourt(t) : "-";
      f.page.drawText(s, { x: MARGE + colCopro + i * colW + colW - 6 - bold.widthOfTextAtSize(s, size), y: yT - 12.5, size, font: bold, color: ENCRE });
    });
    if (iBloc === blocs.length - 1) {
      const s = euroCourt(total);
      f.page.drawText(s, { x: MARGE + wBloc - 6 - bold.widthOfTextAtSize(s, size), y: yT - 12.5, size, font: bold, color: BLEU_FONCE });
    }
    f.y = yT - 18 - (blocs.length > 1 ? 14 : 6);
  });
  if (lignes.length === 0) f.paragraphe("Aucun poste programmé : les postes apparaissent une fois le PPPT analysé et validé par Strat Eco pro.", { size: 9, color: GRIS });
  f.paragraphe(
    `Montants TTC retenus par année : montant voté, sinon montant saisi par le syndic, sinon TTC actualisé du rapport (inflation ${pct(params.inflation)} par an depuis ${params.anneeBase}, TVA ${pct(params.tvaFacades)} ou ${pct(params.tvaEnergetique)} pour l'énergétique, maîtrise d'œuvre ${pct(params.moe)} le cas échéant, honoraires syndic ${pct(params.syndic)}). Un poste rejeté ou reporté figure à l'année de sa nouvelle présentation ; la dernière colonne cumule les années suivantes. Montants indicatifs, à confirmer par devis.`,
    { size: 7.5, color: GRIS, interligne: 2.5 }
  );

  numeroterPages(doc, font);
  return doc.save();
}
