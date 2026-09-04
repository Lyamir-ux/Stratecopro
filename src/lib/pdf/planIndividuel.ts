// Export PDF du plan de financement individuel - document indicatif remis au
// copropriétaire (téléchargeable depuis « Mes quotes-parts » ; l'AMO peut le
// générer pour n'importe quel copropriétaire via l'aperçu du portail).
// Généré de zéro avec pdf-lib (pas de gabarit), charte Strat Eco.
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import { DPE, libellesBatiments, PROFILS_MPR, USAGE_LOT_LABEL, type DpeClass } from "@/lib/referentiels";
import { MENTIONS_PRUDENCE } from "@/pages/Portail/Mentions";
import type { IndivBreakdown, Membership } from "@/api/portail";
import type { Bareme, FinanceParams, Profil } from "@/lib/finance";

export interface PlanIndividuelPdfInput {
  membership: Membership;
  scenarioName: string;
  params: FinanceParams;
  bareme: Bareme;
  /** Décomposition sur l'ensemble des lots du copropriétaire. */
  indiv: IndivBreakdown;
  profil: Profil | null;
  cle: string;
}

// ---------- utilitaires ----------

const A4 = { w: 595.28, h: 841.89 };
const MARGE = 48;

const VERT = rgb(0.478, 0.71, 0.173); // --color-primary-500 #7AB52C
const VERT_FONCE = rgb(0.29, 0.478, 0.122); // --color-primary-700
const ENCRE = rgb(0.102, 0.102, 0.102);
const GRIS = rgb(0.42, 0.45, 0.4);
const GRIS_CLAIR = rgb(0.898, 0.906, 0.882);
const FOND_DOUX = rgb(0.949, 0.973, 0.902); // --color-primary-50

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** WinAnsi (Helvetica) : espaces insécables, tirets et flèches hors plage remplacés. */
const txt = (s: string): string =>
  s
    .replace(/[   ]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[-–]/g, "-")
    .replace(/→/g, "->")
    .replace(/[^\x20-\xFF€]/g, "?");

const euro = (n: number): string =>
  txt(n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €");

// ---------- flux de mise en page ----------

class Flux {
  doc: PDFDocument;
  page!: PDFPage;
  y = 0;
  font: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
  genereLe: string;

  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont, logo: PDFImage | null, genereLe: string) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.logo = logo;
    this.genereLe = genereLe;
    this.nouvellePage();
  }

  nouvellePage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.y = A4.h - MARGE;
    this.piedDePage();
  }

  piedDePage() {
    this.page.drawLine({
      start: { x: MARGE, y: 40 },
      end: { x: A4.w - MARGE, y: 40 },
      thickness: 0.5,
      color: GRIS_CLAIR,
    });
    this.page.drawText(txt(`Document indicatif généré le ${this.genereLe} - Strat Eco`), {
      x: MARGE,
      y: 28,
      size: 8,
      font: this.font,
      color: GRIS,
    });
  }

  /** Saute à la page suivante si moins de `h` points disponibles. */
  besoin(h: number) {
    if (this.y - h < 56) this.nouvellePage();
  }

  texte(s: string, opts: { size?: number; bold?: boolean; color?: RGB; x?: number } = {}) {
    const size = opts.size ?? 10;
    this.besoin(size + 4);
    this.page.drawText(txt(s), {
      x: opts.x ?? MARGE,
      y: this.y - size,
      size,
      font: opts.bold ? this.bold : this.font,
      color: opts.color ?? ENCRE,
    });
    this.y -= size + 4;
  }

  /** Paragraphe avec retour à la ligne automatique. */
  paragraphe(s: string, opts: { size?: number; color?: RGB; bold?: boolean; interligne?: number } = {}) {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? this.bold : this.font;
    const maxW = A4.w - 2 * MARGE;
    const mots = txt(s).split(" ");
    let ligne = "";
    const lignes: string[] = [];
    for (const m of mots) {
      const test = ligne ? ligne + " " + m : m;
      if (font.widthOfTextAtSize(test, size) > maxW && ligne) {
        lignes.push(ligne);
        ligne = m;
      } else ligne = test;
    }
    if (ligne) lignes.push(ligne);
    for (const l of lignes) {
      this.besoin(size + 3);
      this.page.drawText(l, {
        x: MARGE,
        y: this.y - size,
        size,
        font,
        color: opts.color ?? ENCRE,
      });
      this.y -= size + (opts.interligne ?? 3);
    }
  }

  titreSection(s: string) {
    this.besoin(34);
    this.y -= 12;
    this.page.drawRectangle({ x: MARGE, y: this.y - 13, width: 3.5, height: 14, color: VERT });
    this.page.drawText(txt(s.toUpperCase()), {
      x: MARGE + 10,
      y: this.y - 11,
      size: 11.5,
      font: this.bold,
      color: VERT_FONCE,
    });
    this.y -= 24;
  }

  /** Ligne clé/valeur alignée à droite, avec option soustraction/total. */
  ligne(l: string, v: string, opts: { bold?: boolean; moins?: boolean; color?: RGB; indent?: number } = {}) {
    const size = opts.bold ? 10.5 : 9.5;
    this.besoin(size + 8);
    const font = opts.bold ? this.bold : this.font;
    const label = (opts.moins ? "-  " : "") + l;
    this.page.drawText(txt(label), {
      x: MARGE + (opts.indent ?? 0),
      y: this.y - size,
      size,
      font,
      color: opts.color ?? (opts.moins ? GRIS : ENCRE),
    });
    const vv = txt(v);
    const w = font.widthOfTextAtSize(vv, size);
    this.page.drawText(vv, {
      x: A4.w - MARGE - w,
      y: this.y - size,
      size,
      font,
      color: opts.color ?? ENCRE,
    });
    this.y -= size + 7;
  }

  separateur() {
    this.besoin(8);
    this.page.drawLine({
      start: { x: MARGE, y: this.y - 2 },
      end: { x: A4.w - MARGE, y: this.y - 2 },
      thickness: 0.5,
      color: GRIS_CLAIR,
    });
    this.y -= 8;
  }

  /** Encadré vert de total (reste à financer / reste final). */
  encadreTotal(l: string, v: string, plein: boolean) {
    const h = 26;
    this.besoin(h + 6);
    this.page.drawRectangle({
      x: MARGE,
      y: this.y - h,
      width: A4.w - 2 * MARGE,
      height: h,
      color: plein ? VERT : FOND_DOUX,
      borderColor: VERT,
      borderWidth: plein ? 0 : 0.8,
    });
    const c = plein ? rgb(1, 1, 1) : VERT_FONCE;
    this.page.drawText(txt(l), { x: MARGE + 10, y: this.y - h + 9, size: 10, font: this.bold, color: c });
    const vv = txt(v);
    const w = this.bold.widthOfTextAtSize(vv, 12);
    this.page.drawText(vv, { x: A4.w - MARGE - 10 - w, y: this.y - h + 8, size: 12, font: this.bold, color: c });
    this.y -= h + 6;
  }
}

// ---------- génération ----------

export async function genererPlanIndividuelPdf(input: PlanIndividuelPdfInput): Promise<Uint8Array> {
  const { membership, params, bareme, indiv, profil, cle, scenarioName } = input;
  const copro = membership.copro;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: PDFImage | null = null;
  try {
    const res = await fetch("/logo-strateco-pro-white.png");
    if (res.ok) logo = await doc.embedPng(await res.arrayBuffer());
  } catch {
    logo = null;
  }

  const genereLe = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const f = new Flux(doc, font, bold, logo, genereLe);

  // ----- bandeau d'en-tête -----
  const bandeauH = 84;
  f.page.drawRectangle({ x: 0, y: A4.h - bandeauH, width: A4.w, height: bandeauH, color: VERT });
  if (logo) {
    const lh = 22;
    const lw = (logo.width / logo.height) * lh;
    f.page.drawImage(logo, { x: MARGE, y: A4.h - 20 - lh, width: lw, height: lh });
  } else {
    f.page.drawText("STRAT ECO", { x: MARGE, y: A4.h - 36, size: 15, font: bold, color: rgb(1, 1, 1) });
  }
  f.page.drawText(txt("Plan de financement individuel"), {
    x: MARGE,
    y: A4.h - 62,
    size: 17,
    font: bold,
    color: rgb(1, 1, 1),
  });
  const sousTitre = txt(`${copro.name} - scénario « ${scenarioName} »`);
  f.page.drawText(sousTitre, { x: MARGE, y: A4.h - 77, size: 9.5, font, color: rgb(1, 1, 1) });
  f.y = A4.h - bandeauH - 10;

  // ----- vous & votre copropriété -----
  f.titreSection("Vous et votre copropriété");
  f.ligne("Copropriétaire", membership.nom, { bold: true });
  f.ligne(
    "Copropriété",
    `${copro.name}${copro.city ? " - " + [copro.code_postal, copro.city].filter(Boolean).join(" ") : ""}`
  );
  const prefixeBat = libellesBatiments(copro.denomination_batiments).court.toLowerCase();
  for (const lot of membership.lots) {
    f.ligne(
      `Lot n°${lot.num}${lot.batiment ? ` (${prefixeBat} ` + lot.batiment + ")" : ""} - ${(USAGE_LOT_LABEL[lot.usage] ?? lot.usage).toLowerCase()}`,
      `${(lot.tantiemes[cle] ?? lot.tantiemes.MUN ?? 0).toLocaleString("fr-FR")} tantièmes (clé ${cle})`,
      { indent: 10 }
    );
  }
  f.ligne(
    "Profil MaPrimeRénov'",
    profil ? PROFILS_MPR[profil]?.menage ?? "" : "À déterminer (enquête sociale à compléter)"
  );

  // ----- budget du projet -----
  f.titreSection("Le budget du projet de la copropriété");
  const coutTotal = params.travaux + params.honoraires + params.aleas;
  const tauxMpr = params.mprCoproPct + (params.bonusPassoire ? bareme.mprCopro.bonusPassoire : 0);
  const mprCopro = (params.travaux * tauxMpr) / 100;
  f.ligne("Montant du projet T.T.C.", euro(coutTotal), { bold: true });
  f.ligne("dont travaux", euro(params.travaux), { indent: 10 });
  f.ligne("dont honoraires", euro(params.honoraires), { indent: 10 });
  if (params.aleas > 0) f.ligne("dont aléas", euro(params.aleas), { indent: 10 });
  f.separateur();
  f.ligne(`MaPrimeRénov' Copropriété (${tauxMpr} % des travaux)`, euro(mprCopro));
  if (params.cee > 0) f.ligne("CEE collectifs (versés à la fin du chantier)", euro(params.cee));
  if (params.fonds > 0) f.ligne("Fonds travaux mobilisé", euro(params.fonds));

  // ----- étiquette énergie -----
  const avant = (copro.energy_before as DpeClass | null) ?? null;
  const apres = (copro.energy_after as DpeClass | null) ?? null;
  if (avant || apres) {
    f.titreSection("L'étiquette énergie visée pour votre immeuble");
    const carre = (cls: DpeClass | null, x: number) => {
      if (!cls) return;
      f.page.drawRectangle({ x, y: f.y - 26, width: 26, height: 26, color: hex(DPE[cls]) });
      const w = bold.widthOfTextAtSize(cls, 14);
      f.page.drawText(cls, {
        x: x + 13 - w / 2,
        y: f.y - 18.5,
        size: 14,
        font: bold,
        color: cls === "F" || cls === "G" ? rgb(1, 1, 1) : ENCRE,
      });
    };
    f.besoin(34);
    carre(avant, MARGE);
    f.page.drawText("->", { x: MARGE + 34, y: f.y - 18, size: 12, font: bold, color: GRIS });
    carre(apres, MARGE + 54);
    f.y -= 34;
    f.paragraphe(
      "Il s'agit de l'étiquette visée pour l'ensemble du bâtiment après travaux (DPE collectif de la copropriété) - et non de l'étiquette individuelle de votre logement, qui peut différer selon son étage, son exposition ou ses équipements.",
      { size: 9, color: GRIS }
    );
  }

  // ----- plan personnel -----
  f.titreSection("Votre plan de financement personnel");
  f.ligne("Votre quote-part de travaux T.T.C.", euro(indiv.quotePart), { bold: true });
  f.ligne(
    "MaPrimeRénov' individuelle" + (profil ? ` (${(PROFILS_MPR[profil]?.desc ?? "").toLowerCase()})` : ""),
    indiv.mprIndetermine ? "À déterminer (enquête sociale à compléter)" : euro(indiv.mprIndiv),
    { moins: !indiv.mprIndetermine }
  );
  f.ligne("Subvention collective affectée", euro(indiv.subvColl - indiv.fondsPart), { moins: true });
  f.ligne("Fonds travaux déjà versés (à titre indicatif)", euro(indiv.fondsPart), { moins: true });
  f.y -= 2;
  f.encadreTotal(
    "À financer avant travaux (hors CEE" + (indiv.mprIndetermine ? ", hors aide individuelle)" : ")"),
    euro(indiv.resteAvantTravaux),
    true
  );
  f.paragraphe(
    `Après le chantier : vos CEE (${euro(indiv.cee)}) sont versés une fois les travaux réceptionnés. Ils ne réduisent pas le montant à financer avant travaux, mais viendront en déduction une fois perçus.`,
    { size: 9, color: GRIS }
  );
  f.y -= 2;
  f.encadreTotal("Reste à charge final estimé (CEE déduits)", euro(indiv.reste), false);

  // ----- options de financement -----
  f.titreSection("Financer votre reste à charge");
  f.paragraphe(
    "Prêt collectif (éco-PTZ souscrit par la copropriété) : vous adhérez pour votre seule quote-part, sans démarche bancaire individuelle. L'adhésion est volontaire - le vote en AG ouvre simplement la possibilité d'y souscrire.",
    { size: 9.5 }
  );
  f.y -= 4;
  f.paragraphe(
    `Éco-PTZ individuel : vous contractez directement auprès de votre banque, lot par lot, sur une durée au choix de ${bareme.ecoPtz.dureeMin} à ${bareme.ecoPtz.dureeMax} ans (plafond ${euro(bareme.ecoPtz.plafondParLogement)} par logement). Prêt sans condition de ressources ni limite d'âge.`,
    { size: 9.5 }
  );
  f.y -= 4;
  f.paragraphe(
    "Fonds propres : vous réglez votre reste à charge selon l'échéancier d'appels de fonds voté en assemblée générale, sans souscrire de prêt.",
    { size: 9.5 }
  );
  f.y -= 4;
  f.paragraphe(
    "Votre choix se transmet depuis votre espace copropriétaire en ligne (onglet « Mon financement »), où vous retrouverez aussi la foire aux questions sur les prêts.",
    { size: 9, color: GRIS }
  );

  // ----- mentions -----
  f.y -= 8;
  f.separateur();
  f.paragraphe(`${MENTIONS_PRUDENCE[0]} ${MENTIONS_PRUDENCE[1]}`, { size: 8, color: GRIS, interligne: 2.5 });
  f.y -= 2;
  f.paragraphe(MENTIONS_PRUDENCE[2], { size: 8.5, bold: true, color: ENCRE, interligne: 2.5 });

  return doc.save();
}

/** Déclenche le téléchargement navigateur d'un PDF généré. */
export function telechargerPdfBytes(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
