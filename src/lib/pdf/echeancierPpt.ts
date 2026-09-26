// Export PDF de l'échéancier PPT d'une copropriété (fiche copro, onglet
// Échéancier - feedback Amir 20/09/2026). Généré de zéro avec pdf-lib, en
// paysage, accent bleu énergie de la branche PPT, signé Strat Eco pro (logo pro
// blanc, feedback 20/09). Trois parties : synthèse,
// grille année par année (les décalages et montants saisis du syndic sont
// repris tels quels), détail des postes avec commentaires. Montants indicatifs.
// Le même module produit l'échéancier de tout le portefeuille (page
// Échéancier) et, depuis le 24/09/2026, le PDF du portefeuille complet du
// tableau de bord PPT (genererPortefeuillePptPdf).
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import { anneeEffective, cepApres, etiquetteDepuisCep, gainCumule, montantTtcPoste, type ParametresCalcul, type PosteCalcul } from "@/lib/ppt/formules";
import { plageAnnees, posteDeplacable } from "@/lib/ppt/echeancier";
import { ETATS_PPT, ETAT_PPT_LABEL, TAUX_PASSAGE_DEFAUT, repartitionProbable, type EtatPpt } from "@/lib/ppt/indicateurs";
import { echelleAxe, fmtKEur } from "@/lib/ppt/formats";

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
const BLEU_MOYEN = rgb(0.31, 0.533, 0.745); // #4F88BE (bleu PPT 400)
const BLEU_CLAIR = rgb(0.478, 0.651, 0.831); // #7AA6D4 (bleu PPT 300)
const GRIS_MOYEN = rgb(0.82, 0.831, 0.796); // #D1D4CB (--color-neutral-300)
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

  /** Titre de section ; `suite` = hauteur à garder sous le titre (en-tête et première ligne d'un tableau) pour ne pas le laisser seul en bas de page. */
  titreSection(s: string, suite = 0) {
    this.besoin(34 + suite);
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
  const postes = [...input.postes].sort((a, b) => (anneeEffective(a) ?? 9999) - (anneeEffective(b) ?? 9999) || a.position - b.position);

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

/** Logo Strat Eco pro blanc : fourni (tests) ou chargé depuis /logo-strateco-pro-white.png dans le navigateur. */
async function chargerLogo(doc: PDFDocument, logoPng?: Uint8Array | ArrayBuffer): Promise<PDFImage | null> {
  try {
    if (logoPng) return await doc.embedPng(logoPng);
    if (typeof fetch === "function" && typeof window !== "undefined") {
      const res = await fetch("/logo-strateco-pro-white.png");
      if (res.ok) return await doc.embedPng(await res.arrayBuffer());
    }
  } catch {
    /* logo facultatif : le texte « STRAT ECO pro » le remplace */
  }
  return null;
}

/** Bandeau bleu de première page : logo, titre, sous-titre à gauche, mention à droite. */
function bandeau(f: Flux, titre: string, sousTitre: string, droite: string) {
  const bandeauH = 78;
  f.page.drawRectangle({ x: 0, y: PAGE.h - bandeauH, width: PAGE.w, height: bandeauH, color: BLEU });
  if (f.logo) {
    const lh = 20;
    f.page.drawImage(f.logo, { x: MARGE, y: PAGE.h - 18 - lh, width: (f.logo.width / f.logo.height) * lh, height: lh });
  } else f.page.drawText("STRAT ECO pro", { x: MARGE, y: PAGE.h - 32, size: 14, font: f.bold, color: BLANC });
  f.page.drawText(txt(titre), { x: MARGE, y: PAGE.h - 56, size: 16, font: f.bold, color: BLANC });
  f.page.drawText(wrap(sousTitre, f.font, 9, LARGEUR * 0.6, 1)[0] ?? "", { x: MARGE, y: PAGE.h - 70, size: 9, font: f.font, color: BLANC });
  const d = txt(droite);
  f.page.drawText(d, { x: PAGE.w - MARGE - f.font.widthOfTextAtSize(d, 8.5), y: PAGE.h - 70, size: 8.5, font: f.font, color: BLANC });
  f.y = PAGE.h - bandeauH - 8;
}

/** Grille copro × année (blocs de 12 ans au plus), totaux par année et total général. */
function grillePortefeuille(f: Flux, lignes: LigneEcheancierPdf[], annees: number[], annee: number) {
  const { font, bold } = f;
  const total = lignes.reduce((s, l) => s + l.total, 0);
  const totaux = annees.map((a) => lignes.reduce((s, l) => s + (l.parAnnee.get(a) ?? 0), 0));
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
}

/** Note sous la grille : d'où viennent les montants retenus. */
const noteMontantsRetenus = (params: ParametresCalcul) =>
  `Montants TTC retenus par année : montant voté, sinon montant saisi par le syndic, sinon TTC actualisé du rapport (inflation ${pct(params.inflation)} par an depuis ${params.anneeBase}, TVA ${pct(params.tvaFacades)} ou ${pct(params.tvaEnergetique)} pour l'énergétique, maîtrise d'œuvre ${pct(params.moe)} le cas échéant, honoraires syndic ${pct(params.syndic)}). Un poste rejeté ou reporté figure à l'année de sa nouvelle présentation ; la dernière colonne cumule les années suivantes. Montants indicatifs, à confirmer par devis.`;

/** PDF de l'échéancier de toutes les copropriétés : copro × année, totaux (feedback 20/09). */
export async function genererEcheancierPortefeuillePdf(input: EcheancierPortefeuillePdfInput): Promise<Uint8Array> {
  const { params, annee, annees } = input;
  const lignes = [...input.lignes].sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, "fr"));

  const doc = await PDFDocument.create();
  doc.setTitle(`Échéancier PPT du portefeuille${input.nomEnseigne ? ` - ${input.nomEnseigne}` : ""}`);
  doc.setAuthor("Strat Eco pro");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await chargerLogo(doc, input.logoPng);
  const genereLe = input.genereLe ?? new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const f = new Flux(doc, font, bold, logo, genereLe, `Échéancier PPT du portefeuille${input.nomEnseigne ? ` - ${input.nomEnseigne}` : ""}`);

  bandeau(
    f,
    "Échéancier des travaux - toutes les copropriétés",
    [input.nomEnseigne, input.gestionnaire ? `gestionnaire : ${input.gestionnaire}` : "tout le portefeuille"].filter(Boolean).join(" - "),
    `${lignes.length} copropriété${lignes.length > 1 ? "s" : ""}  ·  édité le ${genereLe}`
  );

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

  f.titreSection("Échéancier par copropriété");
  grillePortefeuille(f, lignes, annees, annee);
  if (lignes.length === 0) f.paragraphe("Aucun poste programmé : les postes apparaissent une fois le PPPT analysé et validé par Strat Eco pro.", { size: 9, color: GRIS });
  f.paragraphe(noteMontantsRetenus(params), { size: 7.5, color: GRIS, interligne: 2.5 });

  numeroterPages(doc, font);
  return doc.save();
}

// ---------- portefeuille complet (page /syndic/ppt, feedback syndic 24/09/2026) ----------
// « Exporter le portefeuille complet en PDF » : tout ce que montre le tableau
// de bord, sur le périmètre affiché (direction ou gestionnaire, recherche et
// filtre d'état appliqués) - synthèse et états, comparatif par gestionnaire,
// copropriétés (mêmes colonnes que l'export CSV), échéancier à 10 ans,
// honoraires projetés (direction) ou points à préparer (gestionnaire), alertes.

const COULEUR_ETAT: Record<EtatPpt, RGB> = {
  inconnu: rgb(0.659, 0.678, 0.627), // --color-neutral-400 #A8ADA0
  analyse: rgb(0.361, 0.392, 0.439), // --color-neutral-600 #5C6470
  a_presenter: rgb(0.961, 0.62, 0.043), // --color-warning-500 #F59E0B
  presente: rgb(0.31, 0.533, 0.745), // bleu PPT 400 #4F88BE
  vote: BLEU_FONCE, // bleu PPT 700 #1E4F7C
  reno: rgb(0.478, 0.71, 0.173), // vert Strat Eco #7AB52C (dossier en rénovation globale)
};
/** En-têtes courts du comparatif (une colonne par état). */
const ETAT_COURT: Record<EtatPpt, string> = { inconnu: "À qualifier", analyse: "Analyse", a_presenter: "À présenter", presente: "Présenté", vote: "Voté", reno: "Rénovation" };
const COULEUR_NIVEAU: Record<"haute" | "moyenne" | "basse", RGB> = { haute: ROUGE, moyenne: rgb(0.961, 0.62, 0.043), basse: GRIS };
const NIVEAU_LABEL: Record<"haute" | "moyenne" | "basse", string> = { haute: "Haute", moyenne: "Moyenne", basse: "Basse" };
const NON_ATTRIBUE = "Non attribué";

export interface LignePortefeuillePptPdf {
  nom: string;
  commune?: string | null;
  gestionnaire?: string | null;
  etat: EtatPpt;
  /** Libellé d'état affiché (précisé par la phase du dossier de rénovation). */
  etatLibelle: string;
  dpe?: string | null;
  logements?: number | null;
  postes: number;
  /** TTC actualisé des postes à venir (montant voté s'il existe). */
  montantTtc: number;
  honorairesPotentiels: number;
  honorairesAcquis: number;
  prochaineAnnee: number | null;
  /** TTC des seuls postes à voter l'année du prochain jalon. */
  montantProchaineAnnee: number;
  alertes: number;
  alerteHaute: boolean;
  /** Échéancier : TTC retenu par année et total. */
  parAnnee: Map<number, number>;
  totalEcheancier: number;
}

export interface HonorairesAnneePdf {
  annee: number;
  nbPostes: number;
  montantTtc: number;
  acquis: number;
  potentiel: number;
}

export interface TauxPassagePdf {
  taux: number;
  constate: number | null;
  presentes: number;
  /** hypothèse par défaut, faute d'historique d'AG suffisant */
  hypothese: boolean;
  /** taux choisi au curseur */
  modifie: boolean;
}

export interface AlertePortefeuillePdf {
  copro: string;
  libelle: string;
  niveau: "haute" | "moyenne" | "basse";
}

export interface APreparerPdf {
  copro: string;
  prochaineAg: string | null;
  postes: string[];
  aRepresenter: string[];
}

export interface PortefeuillePptPdfInput {
  nomEnseigne?: string | null;
  /** Vue direction (toute l'enseigne) ; sinon portefeuille du gestionnaire connecté. */
  direction: boolean;
  /** Périmètre affiché (recherche, état filtré) ; null : tout le portefeuille. */
  filtre?: string | null;
  lignes: LignePortefeuillePptPdf[];
  /** Honoraires de suivi par année (direction). */
  honoraires?: HonorairesAnneePdf[];
  tauxHonorairesPct?: number;
  /** Taux de passage en AG de la répartition sécurisé / probable / en jeu (curseur de l'écran) ; défaut 50 % en hypothèse. */
  tauxPassage?: TauxPassagePdf;
  /** Ce qu'il faut préparer pour les prochaines AG (gestionnaire). */
  aPreparer?: APreparerPdf[];
  alertes: AlertePortefeuillePdf[];
  annees: number[];
  params: ParametresCalcul;
  annee: number;
  genereLe?: string;
  logoPng?: Uint8Array | ArrayBuffer;
}

export interface GroupeGestionnairePptPdf {
  nom: string;
  copros: number;
  logements: number;
  montantTtc: number;
  honoraires: number;
  parEtat: Record<EtatPpt, number>;
  alertes: number;
}

/** Comparatif par gestionnaire : du plus gros parc de logements au plus petit, « Non attribué » en dernier. */
export function regrouperGestionnairesPpt(lignes: LignePortefeuillePptPdf[]): GroupeGestionnairePptPdf[] {
  const groupes = new Map<string, GroupeGestionnairePptPdf>();
  for (const l of lignes) {
    const nom = l.gestionnaire?.trim() || NON_ATTRIBUE;
    const g = groupes.get(nom) ?? { nom, copros: 0, logements: 0, montantTtc: 0, honoraires: 0, parEtat: { inconnu: 0, analyse: 0, a_presenter: 0, presente: 0, vote: 0, reno: 0 }, alertes: 0 };
    g.copros += 1;
    g.logements += l.logements ?? 0;
    g.montantTtc += l.montantTtc;
    g.honoraires += l.honorairesPotentiels + l.honorairesAcquis;
    g.parEtat[l.etat] += 1;
    g.alertes += l.alertes;
    groupes.set(nom, g);
  }
  return [...groupes.values()].sort((a, b) =>
    a.nom === NON_ATTRIBUE ? 1 : b.nom === NON_ATTRIBUE ? -1 : b.logements - a.logements || a.nom.localeCompare(b.nom, "fr")
  );
}

interface ColPdf {
  titre: string;
  w: number;
  align?: "right";
}
type CellulePdf = string[] | { texte: string; couleur?: RGB; bold?: boolean; pastille?: RGB };

/** Tableau générique : en-tête bleu clair, lignes à hauteur variable, en-tête répété en haut de page, ligne de total facultative. */
function tableau(f: Flux, cols: ColPdf[], lignes: { cellules: CellulePdf[]; fond?: RGB }[], opts: { size?: number; total?: (string | null)[] } = {}) {
  const size = opts.size ?? 8;
  const xs: number[] = [];
  cols.reduce((x, c) => {
    xs.push(x);
    return x + c.w;
  }, MARGE);
  const wTotal = cols.reduce((s, c) => s + c.w, 0);
  const entete = () => {
    f.besoin(20 + 16);
    f.page.drawRectangle({ x: MARGE, y: f.y - 18, width: wTotal, height: 18, color: FOND_BLEU });
    cols.forEach((c, i) => {
      const s = txt(c.titre);
      const x = c.align === "right" ? xs[i] + c.w - 6 - f.bold.widthOfTextAtSize(s, size) : xs[i] + 6;
      f.page.drawText(s, { x, y: f.y - 12.5, size, font: f.bold, color: BLEU_FONCE });
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

/** Colonne élastique : la dernière prend la largeur restante. */
function completer(cols: ColPdf[]): ColPdf[] {
  cols[cols.length - 1].w = LARGEUR - cols.slice(0, -1).reduce((s, c) => s + c.w, 0);
  return cols;
}

const euroOuTiret = (n: number) => (n ? euroCourt(n) : "-");

interface ColonnePdf {
  label: string;
  /** segments flottants [bas, haut] en euros, empilés de bas en haut */
  segments: { bas: number; haut: number; couleur: RGB }[];
  etiquette?: string;
  gras?: boolean;
}

/** Colonnes de segments sur un axe en euros (cascade des honoraires, répartition probable) ; `connecteurs` relie le sommet de chaque colonne à la suivante. */
function graphiqueColonnes(f: Flux, colonnes: ColonnePdf[], opts: { hauteur?: number; connecteurs?: boolean; legende?: { label: string; couleur: RGB; trait?: boolean }[] } = {}) {
  const hLeg = opts.legende ? 16 : 0;
  const hGraph = opts.hauteur ?? 170;
  f.besoin(hLeg + hGraph + 8);
  if (opts.legende) {
    let x = MARGE;
    for (const l of opts.legende) {
      if (l.trait) f.page.drawLine({ start: { x, y: f.y - 6 }, end: { x: x + 12, y: f.y - 6 }, thickness: 1, color: l.couleur });
      else f.page.drawRectangle({ x, y: f.y - 10, width: 8, height: 8, color: l.couleur });
      const s = txt(l.label);
      f.page.drawText(s, { x: x + (l.trait ? 16 : 12), y: f.y - 9, size: 8, font: f.font, color: GRIS });
      x += (l.trait ? 16 : 12) + f.font.widthOfTextAtSize(s, 8) + 18;
    }
    f.y -= hLeg;
  }
  const haut0 = f.y - 14;
  const bas0 = f.y - hGraph + 16;
  const gauche = MARGE + 50;
  const droite = MARGE + LARGEUR;
  const max = Math.max(0, ...colonnes.flatMap((c) => c.segments.map((s) => s.haut)));
  const { haut, pas } = echelleAxe(max);
  const y = (v: number) => bas0 + (v / haut) * (haut0 - bas0);
  for (let v = 0; v <= haut + 1e-6; v += pas) {
    f.page.drawLine({ start: { x: gauche, y: y(v) }, end: { x: droite, y: y(v) }, thickness: v === 0 ? 0.8 : 0.4, color: v === 0 ? GRIS : GRIS_CLAIR });
    const s = txt(v === 0 ? "0" : fmtKEur(v));
    f.page.drawText(s, { x: gauche - 6 - f.font.widthOfTextAtSize(s, 7.5), y: y(v) - 2.5, size: 7.5, font: f.font, color: GRIS });
  }
  const slot = (droite - gauche) / Math.max(1, colonnes.length);
  const bw = Math.min(34, slot * 0.6);
  colonnes.forEach((c, i) => {
    const cx = gauche + slot * i + slot / 2;
    const x = cx - bw / 2;
    const pleins = c.segments.filter((s) => s.haut - s.bas > 0);
    pleins.forEach((s, k) => {
      // un liseré blanc entre deux segments empilés, jamais de trait autour
      const y1 = y(s.bas) + (k > 0 ? 1.2 : 0);
      f.page.drawRectangle({ x, y: y1, width: bw, height: Math.max(0.8, y(s.haut) - y1), color: s.couleur });
    });
    const sommet = Math.max(0, ...pleins.map((s) => s.haut));
    if (opts.connecteurs && i < colonnes.length - 1 && sommet > 0)
      f.page.drawLine({ start: { x: x + bw, y: y(sommet) }, end: { x: cx + slot - bw / 2, y: y(sommet) }, thickness: 0.6, color: GRIS });
    if (c.etiquette && sommet > 0) {
      const s = txt(c.etiquette);
      const fnt = c.gras ? f.bold : f.font;
      f.page.drawText(s, { x: cx - fnt.widthOfTextAtSize(s, 7.5) / 2, y: y(sommet) + 4, size: 7.5, font: fnt, color: ENCRE });
    }
    const lib = txt(c.label);
    const fl = c.gras ? f.bold : f.font;
    f.page.drawText(lib, { x: cx - fl.widthOfTextAtSize(lib, 8) / 2, y: bas0 - 12, size: 8, font: fl, color: c.gras ? ENCRE : GRIS });
  });
  f.y -= hGraph + 8;
}

export async function genererPortefeuillePptPdf(input: PortefeuillePptPdfInput): Promise<Uint8Array> {
  const { params, annee, annees } = input;
  const lignes = [...input.lignes].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const groupes = regrouperGestionnairesPpt(lignes);
  const multiGest = groupes.length > 1;
  const titreCourt = `Portefeuille PPT${input.nomEnseigne ? ` - ${input.nomEnseigne}` : ""}`;

  const doc = await PDFDocument.create();
  doc.setTitle(titreCourt);
  doc.setAuthor("Strat Eco pro");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await chargerLogo(doc, input.logoPng);
  const genereLe = input.genereLe ?? new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const f = new Flux(doc, font, bold, logo, genereLe, titreCourt);

  bandeau(
    f,
    input.direction ? "Suivi des PPT - portefeuille complet" : "Mes PPT - portefeuille complet",
    [input.nomEnseigne, input.filtre].filter(Boolean).join("  ·  ") || "Ensemble du portefeuille",
    `${lignes.length} copropriété${lignes.length > 1 ? "s" : ""}  ·  édité le ${genereLe}`
  );

  // ----- synthèse -----
  const logements = lignes.reduce((s, l) => s + (l.logements ?? 0), 0);
  const travaux = lignes.reduce((s, l) => s + l.montantTtc, 0);
  const acquis = lignes.reduce((s, l) => s + l.honorairesAcquis, 0);
  const honoraires = lignes.reduce((s, l) => s + l.honorairesPotentiels + l.honorairesAcquis, 0);
  const nbAlertes = lignes.reduce((s, l) => s + l.alertes, 0);
  const hautes = input.alertes.filter((a) => a.niveau === "haute").length;
  const avecPostes = lignes.filter((l) => l.postes > 0).length;
  const nbGest = groupes.filter((g) => g.nom !== NON_ATTRIBUE).length;
  f.titreSection("Synthèse du portefeuille");
  f.tuiles([
    { label: "Copropriétés", valeur: String(lignes.length), pied: input.direction && nbGest ? `${nbGest} gestionnaire${nbGest > 1 ? "s" : ""}` : undefined },
    { label: "Logements", valeur: logements.toLocaleString("fr-FR") },
    { label: "Travaux TTC à venir", valeur: euroOuTiret(travaux), pied: `${avecPostes} copropriété${avecPostes > 1 ? "s" : ""} avec un plan chiffré`, accent: true },
    { label: "Honoraires de suivi", valeur: euroOuTiret(honoraires), pied: acquis ? `dont ${euroCourt(acquis)} votés` : "aucun poste voté" },
    { label: "Alertes", valeur: String(nbAlertes), pied: hautes ? `dont ${hautes} haute${hautes > 1 ? "s" : ""}` : nbAlertes ? "aucune alerte haute" : "rien à signaler" },
  ]);
  // répartition par état : une ligne de pastilles
  f.besoin(16);
  let x = MARGE;
  const lib = "États de suivi :";
  f.page.drawText(txt(lib), { x, y: f.y - 10, size: 8.5, font: bold, color: ENCRE });
  x += bold.widthOfTextAtSize(txt(lib), 8.5) + 12;
  for (const e of ETATS_PPT) {
    const n = lignes.filter((l) => l.etat === e).length;
    f.page.drawCircle({ x: x + 3.5, y: f.y - 7, size: 3.5, color: COULEUR_ETAT[e] });
    const s = txt(`${ETAT_PPT_LABEL[e]} : ${n}`);
    f.page.drawText(s, { x: x + 11, y: f.y - 10, size: 8.5, font, color: n ? ENCRE : GRIS });
    x += 11 + font.widthOfTextAtSize(s, 8.5) + 16;
  }
  f.y -= 22;

  // ----- comparatif par gestionnaire -----
  if (multiGest) {
    f.titreSection("Comparatif par gestionnaire", 50);
    const cols = completer([
      { titre: "Gestionnaire", w: 150 },
      { titre: "Copros", w: 44, align: "right" },
      { titre: "Logements", w: 58, align: "right" },
      ...ETATS_PPT.map((e) => ({ titre: ETAT_COURT[e], w: 54, align: "right" as const })),
      { titre: "Travaux TTC", w: 78, align: "right" },
      { titre: "Honoraires", w: 0, align: "right" },
    ]);
    tableau(
      f,
      cols,
      groupes.map((g) => ({
        cellules: [
          { texte: g.nom, bold: true },
          { texte: String(g.copros) },
          { texte: g.logements ? String(g.logements) : "-" },
          ...ETATS_PPT.map((e) => ({ texte: g.parEtat[e] ? String(g.parEtat[e]) : "-", couleur: g.parEtat[e] ? COULEUR_ETAT[e] : GRIS, bold: g.parEtat[e] > 0 })),
          { texte: euroOuTiret(g.montantTtc) },
          { texte: euroOuTiret(g.honoraires) },
        ],
      })),
      {
        total: ["Total", String(lignes.length), logements ? String(logements) : "-", ...ETATS_PPT.map((e) => String(lignes.filter((l) => l.etat === e).length || "-")), euroOuTiret(travaux), euroOuTiret(honoraires)],
      }
    );
  }

  // ----- copropriétés -----
  f.titreSection("Copropriétés du portefeuille", 50);
  const colsC = completer([
    { titre: "Copropriété", w: multiGest ? 170 : 230 },
    ...(multiGest ? [{ titre: "Gestionnaire", w: 100 }] : []),
    { titre: "État", w: 108 },
    { titre: "DPE", w: 32 },
    { titre: "Lgts", w: 36, align: "right" as const },
    { titre: "Postes", w: 40, align: "right" as const },
    { titre: "Travaux TTC", w: 70, align: "right" as const },
    { titre: "Honoraires", w: 66, align: "right" as const },
    { titre: "Prochain jalon", w: 86, align: "right" as const },
    { titre: "Alertes", w: 0, align: "right" as const },
  ]);
  tableau(
    f,
    colsC,
    lignes.map((l) => ({
      cellules: [
        [...wrap(l.nom, bold, 8, colsC[0].w - 12, 1), ...(l.commune ? wrap(l.commune, font, 7, colsC[0].w - 12, 1) : [])],
        ...(multiGest ? [wrap(l.gestionnaire?.trim() || "-", font, 8, 100 - 12, 2)] : []),
        { texte: wrap(l.etatLibelle, font, 8, colsC[multiGest ? 2 : 1].w - 20, 1)[0] ?? "", pastille: COULEUR_ETAT[l.etat] },
        { texte: l.dpe || "-" },
        { texte: l.logements ? String(l.logements) : "-" },
        { texte: l.postes ? String(l.postes) : "-" },
        { texte: euroOuTiret(l.montantTtc) },
        { texte: euroOuTiret(l.honorairesPotentiels + l.honorairesAcquis) },
        { texte: l.prochaineAnnee != null ? `${l.prochaineAnnee} · ${euroOuTiret(l.montantProchaineAnnee)}` : "-" },
        { texte: l.alertes ? String(l.alertes) : "-", couleur: l.alerteHaute ? ROUGE_FONCE : undefined, bold: l.alerteHaute },
      ],
    })),
    {
      total: [
        `Total - ${lignes.length} copropriété${lignes.length > 1 ? "s" : ""}`,
        ...(multiGest ? [null] : []),
        null,
        null,
        logements ? String(logements) : "-",
        String(lignes.reduce((s, l) => s + l.postes, 0) || "-"),
        euroOuTiret(travaux),
        euroOuTiret(honoraires),
        null,
        nbAlertes ? String(nbAlertes) : "-",
      ],
    }
  );
  if (lignes.length === 0) f.paragraphe("Aucune copropriété dans le périmètre affiché.", { size: 9, color: GRIS });
  f.y -= 4;
  f.paragraphe(
    "Travaux TTC : postes du plan encore à venir, actualisés à l'année où ils passeront en AG (montant voté s'il existe). Honoraires : suivi de travaux au taux de l'enseigne, votés et potentiels. Prochain jalon : première année où un poste doit être présenté, avec le TTC des seuls postes à voter cette année-là.",
    { size: 7.5, color: GRIS, interligne: 2.5 }
  );

  // ----- échéancier à 10 ans -----
  const lignesEch: LigneEcheancierPdf[] = lignes
    .filter((l) => l.totalEcheancier > 0 || l.postes > 0)
    .map((l) => ({ nom: l.nom, commune: l.commune, gestionnaire_nom: multiGest ? l.gestionnaire : null, nb_logements: l.logements, parAnnee: l.parAnnee, total: l.totalEcheancier }))
    .sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, "fr"));
  f.titreSection("Échéancier des travaux par copropriété", 50);
  if (lignesEch.length === 0) f.paragraphe("Aucun poste programmé : les postes apparaissent une fois le PPPT analysé et validé par Strat Eco pro.", { size: 9, color: GRIS });
  else {
    grillePortefeuille(f, lignesEch, annees, annee);
    f.paragraphe(noteMontantsRetenus(params), { size: 7.5, color: GRIS, interligne: 2.5 });
  }

  // ----- honoraires projetés (direction) : cascade cumulée, répartition probable, détail -----
  // Feedback Amir 26/09/2026 : mêmes lectures que la vue Mosaïque, au taux de passage du curseur.
  if (input.direction && input.honoraires && input.honoraires.length > 0) {
    const h = input.honoraires;
    const fin = h[h.length - 1].annee;
    const libAnnee = (i: number) => (i === h.length - 1 ? `${h[i].annee}+` : String(h[i].annee));
    const totalH = h.reduce((s, l) => s + l.acquis + l.potentiel, 0);
    const acquisH = h.reduce((s, l) => s + l.acquis, 0);
    const postesH = h.reduce((s, l) => s + l.nbPostes, 0);
    const pctDe = (v: number) => `${totalH > 0 ? Math.round((v / totalH) * 100) : 0} %`;
    f.titreSection(`Honoraires de suivi de travaux cumulés, ${annee}-${fin}`, 250);
    if (totalH <= 0) f.paragraphe("Aucun poste chiffré sur le périmètre affiché.", { size: 9, color: GRIS });
    else {
      const pic = h.reduce((m, l) => (l.acquis + l.potentiel > m.acquis + m.potentiel ? l : m), h[0]);
      f.tuiles([
        { label: `Total ${annee}-${fin}`, valeur: euroCourt(totalH), pied: `${postesH} poste${postesH > 1 ? "s" : ""} du plan`, accent: true },
        { label: "Déjà votés en AG", valeur: euroOuTiret(acquisH), pied: `${pctDe(acquisH)} du total` },
        { label: "À faire voter", valeur: euroCourt(totalH - acquisH), pied: `${pctDe(totalH - acquisH)} du total` },
        { label: "Année la plus chargée", valeur: String(pic.annee), pied: `${euroCourt(pic.acquis + pic.potentiel)} · ${pic.nbPostes} poste${pic.nbPostes > 1 ? "s" : ""}` },
      ]);
      let cum = 0;
      const cascade: ColonnePdf[] = h.map((l, i) => {
        const bas = cum;
        cum += l.acquis + l.potentiel;
        return {
          label: libAnnee(i),
          segments: [
            { bas, haut: bas + l.acquis, couleur: BLEU_FONCE },
            { bas: bas + l.acquis, haut: cum, couleur: BLEU_CLAIR },
          ],
          etiquette: l.acquis + l.potentiel > 0 ? "+" + fmtKEur(l.acquis + l.potentiel) : undefined,
        };
      });
      cascade.push({
        label: "Total",
        gras: true,
        etiquette: fmtKEur(cum),
        segments: [
          { bas: 0, haut: acquisH, couleur: BLEU_FONCE },
          { bas: acquisH, haut: cum, couleur: BLEU },
        ],
      });
      graphiqueColonnes(f, cascade, {
        hauteur: 180,
        connecteurs: true,
        legende: [
          { label: "Votés (acquis)", couleur: BLEU_FONCE },
          { label: "À faire voter (potentiel)", couleur: BLEU_CLAIR },
          { label: "Cumul", couleur: GRIS, trait: true },
        ],
      });
      f.paragraphe(
        `Chaque colonne part du cumul des années précédentes : sa hauteur est ce que l'année ajoute, son sommet le cumul atteint ; la dernière colonne donne le total. Honoraires au taux de l'enseigne${input.tauxHonorairesPct != null ? ` (${txt(input.tauxHonorairesPct.toLocaleString("fr-FR"))} %)` : ""}. Votés : postes adoptés en AG, au montant voté. À faire voter : postes programmés, présentés ou à représenter, actualisés à l'année où ils passeront en AG. ${fin}+ cumule les années suivantes.`,
        { size: 7.5, color: GRIS, interligne: 2.5 }
      );

      // répartition sécurisé / probable / en jeu, au taux de passage retenu à l'écran
      const tp = input.tauxPassage ?? { taux: TAUX_PASSAGE_DEFAUT, constate: null, presentes: 0, hypothese: true, modifie: false };
      const r = repartitionProbable(h, tp.taux);
      const prevision = r.securise + r.probable;
      f.titreSection(`Ce que le PPT devrait rapporter - taux de passage en AG de ${tp.taux} %`, 240);
      f.tuiles([
        { label: "Sécurisé (voté)", valeur: euroOuTiret(r.securise), pied: "postes adoptés en AG" },
        { label: "Prévision réaliste", valeur: euroCourt(prevision), pied: `voté + ${tp.taux} % du potentiel`, accent: true },
        { label: "Plafond si tout est voté", valeur: euroCourt(totalH), pied: `dont ${euroCourt(r.enJeu)} en jeu` },
      ]);
      graphiqueColonnes(
        f,
        r.annees.map((a, i) => ({
          label: libAnnee(i),
          segments: [
            { bas: 0, haut: a.securise, couleur: BLEU_FONCE },
            { bas: a.securise, haut: a.securise + a.probable, couleur: BLEU_MOYEN },
            { bas: a.securise + a.probable, haut: a.securise + a.probable + a.enJeu, couleur: GRIS_MOYEN },
          ],
        })),
        {
          hauteur: 170,
          legende: [
            { label: "Sécurisé : voté", couleur: BLEU_FONCE },
            { label: `Probable : potentiel x ${tp.taux} %`, couleur: BLEU_MOYEN },
            { label: "En jeu : reste du potentiel", couleur: GRIS_MOYEN },
          ],
        }
      );
      const nb = (n: number) => `${n} poste${n > 1 ? "s" : ""} présenté${n > 1 ? "s" : ""}`;
      const origine = tp.modifie
        ? `taux choisi pour cette projection${tp.constate != null ? `, constaté : ${tp.constate} % sur ${nb(tp.presentes)}` : ""}`
        : tp.hypothese
          ? `hypothèse par défaut, l'historique des AG étant insuffisant : ${nb(tp.presentes)}`
          : `taux constaté sur ${nb(tp.presentes)} en AG, votés / présentés`;
      f.paragraphe(
        `Avec ${tp.taux} % des postes votés (${origine}), le PPT rapporterait environ ${euro(prevision)} d'honoraires de suivi d'ici ${fin}, soit ${euro(prevision / h.length)} par an en moyenne. Chaque point de taux de passage gagné en AG vaut ${euro((r.probable + r.enJeu) / 100)}.`,
        { size: 8.5, interligne: 3 }
      );

      // détail chiffré
      f.titreSection("Honoraires par année - détail", 50);
      const cols = completer([
        { titre: "Année", w: 90 },
        { titre: "Postes", w: 80, align: "right" },
        { titre: "Travaux TTC", w: 130, align: "right" },
        { titre: "Honoraires votés", w: 130, align: "right" },
        { titre: "Honoraires à faire voter", w: 150, align: "right" },
        { titre: "Total de l'année", w: 110, align: "right" },
        { titre: "Cumul", w: 0, align: "right" },
      ]);
      let cumul = 0;
      tableau(
        f,
        cols,
        h.map((l, i) => {
          cumul += l.acquis + l.potentiel;
          return {
            cellules: [
              { texte: String(l.annee) + (i === h.length - 1 ? " et +" : ""), bold: true },
              { texte: l.nbPostes ? String(l.nbPostes) : "-" },
              { texte: l.montantTtc ? euro(l.montantTtc) : "-" },
              { texte: l.acquis ? euro(l.acquis) : "-", couleur: l.acquis ? BLEU_FONCE : undefined },
              { texte: l.potentiel ? euro(l.potentiel) : "-" },
              { texte: l.acquis + l.potentiel ? euro(l.acquis + l.potentiel) : "-", bold: l.acquis + l.potentiel > 0 },
              { texte: euro(cumul), couleur: GRIS },
            ],
          };
        }),
        {
          total: ["Total", String(postesH || "-"), euro(h.reduce((s2, l) => s2 + l.montantTtc, 0)), euro(acquisH), euro(totalH - acquisH), euro(totalH), null],
        }
      );
    }
  }

  // ----- à préparer (gestionnaire) -----
  if (!input.direction && input.aPreparer) {
    f.titreSection("À préparer pour les prochaines AG", 50);
    if (input.aPreparer.length === 0) f.paragraphe(`Rien à présenter d'ici ${annee + 1} - ou aucun PPT validé pour l'instant.`, { size: 9, color: GRIS });
    for (const p of input.aPreparer) {
      f.besoin(30);
      f.paragraphe(`${p.copro} - ${p.prochaineAg ? `AG le ${new Date(p.prochaineAg).toLocaleDateString("fr-FR")}` : "aucune AG programmée"}`, { size: 9, bold: true });
      for (const s of p.postes) f.paragraphe(`· ${s}`, { size: 8.5 });
      for (const s of p.aRepresenter) f.paragraphe(`· À représenter : ${s}`, { size: 8.5, color: ORANGE });
      f.y -= 4;
    }
  }

  // ----- alertes -----
  f.titreSection(input.direction ? "Alertes" : "Points de vigilance", 50);
  if (input.alertes.length === 0) f.paragraphe("Aucune alerte sur le périmètre affiché.", { size: 9, color: GRIS });
  else {
    const ordre = { haute: 0, moyenne: 1, basse: 2 };
    const cols = completer([
      { titre: "Niveau", w: 80 },
      { titre: "Copropriété", w: 200 },
      { titre: "Alerte", w: 0 },
    ]);
    tableau(
      f,
      cols,
      [...input.alertes]
        .sort((a, b) => ordre[a.niveau] - ordre[b.niveau] || a.copro.localeCompare(b.copro, "fr"))
        .map((a) => ({
          cellules: [
            { texte: NIVEAU_LABEL[a.niveau], pastille: COULEUR_NIVEAU[a.niveau], couleur: a.niveau === "haute" ? ROUGE_FONCE : undefined, bold: a.niveau === "haute" },
            wrap(a.copro, bold, 8, 200 - 12, 2),
            wrap(a.libelle, font, 8, cols[2].w - 12, 3),
          ],
        }))
    );
  }

  numeroterPages(doc, font);
  return doc.save();
}
