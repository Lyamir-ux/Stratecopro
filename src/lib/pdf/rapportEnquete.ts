// Rapport d'enquête sociale en PDF (demande d'Amir du 04/10/2026, maquettes
// « A » et « C » retenues, sans signature) : page de synthèse (chiffres clés,
// occupants et profils Anah, occupation, ménages, vigilance, avis sur les
// travaux), puis tableaux détaillés numérotés, observations du chef de projet
// et, en annexe, la liste nominative des propriétaires occupants.
// Généré de zéro avec pdf-lib, Helvetica, charte Strat Eco, logo couleur.
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import { PROFILS_MPR, libellesBatiments } from "@/lib/referentiels";
import { pct, type SyntheseEnquete } from "@/lib/rapportEnquete";
import type { Profil } from "@/lib/finance";

export interface RapportEnquetePdfInput {
  copro: {
    nom: string;
    adresse: string | null;
    codePostal: string | null;
    ville: string | null;
    syndic: string | null;
    denominationBatiments: string | null | undefined;
  };
  /** Lancement de l'enquête (ISO). */
  envoyeeLe: string | null;
  /** Date limite de réponse (AAAA-MM-JJ). */
  dateLimite: string | null;
  /** Date à laquelle les réponses sont arrêtées (génération du rapport). */
  arreteLe: Date;
  synthese: SyntheseEnquete;
  /** Texte libre du chef de projet ; absent = pas d'encadré. */
  observations: string | null;
  /** Logo couleur (PNG) ; à défaut chargé depuis /logo-strateco.png dans le navigateur. */
  logoPng?: Uint8Array | ArrayBuffer | null;
}

// ---------- charte ----------

const PAGE = { w: 595.28, h: 841.89 };
const MARGE = 42;
const LARG = PAGE.w - 2 * MARGE;
const BAS = 50;

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const VERT = hex("#7AB52C");
const VERT_FONCE = hex("#4A7A1F");
const PASTEL = hex("#E8F1D7");
const ENCRE = hex("#1A1A1A");
const ARDOISE = hex("#5C6470");
const GRIS = hex("#E5E7E1");
const RAIL = hex("#F2F3EF");
const BORD = hex("#9AA0A8");
const FOND_TETE = hex("#F4F5F2");
const TEXTE_TETE = hex("#3B4048");
const ALERTE = hex("#B45309");
const BLANC = rgb(1, 1, 1);
const INDETERMINE = hex("#B8BDC4");
const C_BAILLEUR = hex("#5C6470");
const C_VACANT = hex("#C9CDD2");
const C_INCONNU = hex("#E9EAE6");
const C_AVIS = ["#4A7A1F", "#7AB52C", "#F59E0B", "#DC2626", "#B8BDC4"].map(hex);

const couleurProfil = (p: Profil | null): RGB => (p ? hex(PROFILS_MPR[p]?.color ?? "#B8BDC4") : INDETERMINE);
const LIBELLE_PROFIL: Record<Profil, { long: string; court: string; table: string }> = {
  Bleu: { long: "Bleu - revenus très modestes", court: "Très modestes", table: "Très modestes (bleu)" },
  Jaune: { long: "Jaune - revenus modestes", court: "Modestes", table: "Modestes (jaune)" },
  Violet: { long: "Violet - revenus intermédiaires", court: "Intermédiaires", table: "Intermédiaires (violet)" },
  Rose: { long: "Rose - revenus supérieurs", court: "Supérieurs", table: "Supérieurs (rose)" },
};
const libelleProfil = (p: Profil | null, forme: "long" | "court" | "table"): string => (p ? LIBELLE_PROFIL[p][forme] : "À déterminer");

const WINANSI = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•˜™š›œžŸ";
/** Texte compatible Helvetica (WinAnsi) : espaces fines, tirets longs et caractères hors plage remplacés. */
export function t(s: string): string {
  return s
    .replace(/[    \t]/g, " ")
    .replace(/[‐-―]/g, "-")
    .replace(/[\r\n]+/g, " ")
    .split("")
    .map((c) => ((c >= " " && c <= "~") || (c >= "¡" && c <= "ÿ") || WINANSI.includes(c) ? c : "?"))
    .join("");
}

const entier = (n: number): string => Math.round(n).toLocaleString("fr-FR");
const dateFr = (d: Date | string | null): string => (d ? new Date(d).toLocaleDateString("fr-FR") : "");
const pluriel = (n: number, s: string, p = s + "s") => (n > 1 ? p : s);

// ---------- mise en page ----------

type Align = "left" | "right" | "center";
interface Colonne {
  titre: string;
  /** Largeur en points ; absente = part égale de la place restante. */
  largeur?: number;
  align?: Align;
}
interface LigneTableau {
  cells: string[];
  style?: "st" | "tot" | "sub";
  puce?: RGB;
  /** Fond d'une cellule (index de colonne). */
  fonds?: Record<number, RGB>;
}

class Rapport {
  page!: PDFPage;
  y = 0;
  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
    readonly logo: PDFImage | null,
    readonly titreCourt: string,
    readonly dateRapport: string
  ) {}

  fonte(gras?: boolean) {
    return gras ? this.bold : this.font;
  }

  largeur(s: string, size: number, gras?: boolean) {
    return this.fonte(gras).widthOfTextAtSize(t(s), size);
  }

  ecrire(s: string, x: number, y: number, size: number, o: { gras?: boolean; couleur?: RGB; align?: Align } = {}) {
    const txt = t(s);
    const w = this.fonte(o.gras).widthOfTextAtSize(txt, size);
    const xx = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    this.page.drawText(txt, { x: xx, y, size, font: this.fonte(o.gras), color: o.couleur ?? ENCRE });
  }

  /** Coupe le texte pour tenir dans `maxW` (« ... » en fin). */
  ajuster(s: string, maxW: number, size: number, gras?: boolean): string {
    const txt = t(s);
    if (this.fonte(gras).widthOfTextAtSize(txt, size) <= maxW) return txt;
    let fin = txt.length;
    while (fin > 1 && this.fonte(gras).widthOfTextAtSize(txt.slice(0, fin) + "...", size) > maxW) fin--;
    return txt.slice(0, fin).trimEnd() + "...";
  }

  /** Retour à la ligne automatique. */
  couper(s: string, maxW: number, size: number, gras?: boolean): string[] {
    const lignes: string[] = [];
    let ligne = "";
    for (const mot of t(s).split(" ").filter(Boolean)) {
      const test = ligne ? `${ligne} ${mot}` : mot;
      if (ligne && this.fonte(gras).widthOfTextAtSize(test, size) > maxW) {
        lignes.push(ligne);
        ligne = mot;
      } else ligne = test;
    }
    if (ligne) lignes.push(ligne);
    return lignes.length ? lignes : [""];
  }

  rectArrondi(x: number, yHaut: number, w: number, h: number, r: number, o: { fond?: RGB; bord?: RGB; epaisseur?: number }) {
    const p = `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    this.page.drawSvgPath(p, { x, y: yHaut, color: o.fond, borderColor: o.bord, borderWidth: o.bord ? o.epaisseur ?? 0.7 : 0 });
  }

  puce(x: number, yBase: number, c: RGB, bord?: RGB) {
    this.page.drawRectangle({ x, y: yBase - 0.5, width: 6.5, height: 6.5, color: c, borderColor: bord, borderWidth: bord ? 0.5 : 0 });
  }

  filet(y: number, c: RGB = GRIS, e = 0.5, x0 = MARGE, x1 = PAGE.w - MARGE) {
    this.page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: e, color: c });
  }

  nouvellePage(bandeau = true) {
    this.page = this.doc.addPage([PAGE.w, PAGE.h]);
    this.y = PAGE.h - 34;
    if (!bandeau) return;
    const lh = 30;
    if (this.logo) this.page.drawImage(this.logo, { x: MARGE, y: PAGE.h - 26 - lh, width: (this.logo.width / this.logo.height) * lh, height: lh });
    else this.ecrire("Strat Eco", MARGE, PAGE.h - 48, 14, { gras: true, couleur: VERT_FONCE });
    this.ecrire(this.ajuster(`${this.titreCourt} · Rapport d'enquête sociale du ${this.dateRapport}`, 330, 8), PAGE.w - MARGE, PAGE.h - 44, 8, { couleur: ARDOISE, align: "right" });
    this.filet(PAGE.h - 64, GRIS, 0.8);
    this.y = PAGE.h - 80;
  }

  besoin(h: number) {
    if (this.y - h < BAS) this.nouvellePage();
  }

  /** Titre de bloc de la synthèse : barre verte + texte gras. */
  titreBloc(s: string, x = MARGE, maxW = LARG, y = this.y) {
    this.page.drawRectangle({ x, y: y - 12, width: 3.4, height: 12, color: VERT });
    this.ecrire(this.ajuster(s, maxW - 10, 10.5, true), x + 9, y - 10, 10.5, { gras: true });
  }

  titreChapitre(s: string) {
    this.besoin(40);
    this.ecrire(s, MARGE, this.y - 14, 14, { gras: true });
    this.y -= 26;
  }

  paragraphe(s: string, o: { size?: number; couleur?: RGB; interligne?: number; x?: number; maxW?: number } = {}) {
    const size = o.size ?? 8.5;
    for (const l of this.couper(s, o.maxW ?? LARG, size)) {
      this.besoin(size + 3);
      this.ecrire(l, o.x ?? MARGE, this.y - size, size, { couleur: o.couleur ?? ENCRE });
      this.y -= size + (o.interligne ?? 3);
    }
  }

  // ----- tableau quadrillé (détail chiffré) -----

  tableau(numero: string, titre: string, colonnes: Colonne[], lignes: LigneTableau[], note?: string) {
    const fixes = colonnes.reduce((s, c) => s + (c.largeur ?? 0), 0);
    const libres = colonnes.filter((c) => c.largeur == null).length;
    const larg = colonnes.map((c) => c.largeur ?? (LARG - fixes) / Math.max(1, libres));
    const xs = larg.map((_, i) => MARGE + larg.slice(0, i).reduce((s, w) => s + w, 0));
    const tetes = colonnes.map((c, i) => this.couper(c.titre, larg[i] - 8, 7.6, true));
    const hTete = colonnes.some((c) => c.titre) ? 8 + Math.max(...tetes.map((l) => l.length)) * 9 : 0;
    const hLigne = (l: LigneTableau) => {
      const lab = this.couper(l.cells[0] ?? "", larg[0] - 10 - (l.puce ? 10 : 0) - (l.style === "sub" ? 10 : 0), 8.8, l.style === "st" || l.style === "tot");
      return Math.max(16, 7 + lab.length * 10.5);
    };

    // un tableau court ne se coupe pas entre deux pages
    const hTotal = 16 + hTete + lignes.reduce((a, l) => a + hLigne(l), 0);
    if (hTotal <= PAGE.h - 80 - BAS && this.y - hTotal < BAS) this.nouvellePage();
    else this.besoin(16 + hTete + 2 * 16);
    this.ecrire(numero, MARGE, this.y - 10, 9.5, { gras: true, couleur: VERT_FONCE });
    this.ecrire(titre, MARGE + this.largeur(numero, 9.5, true) + 6, this.y - 10, 9.5, { gras: true });
    this.y -= 16;

    const enTete = () => {
      if (!hTete) return;
      for (let i = 0; i < colonnes.length; i++) {
        this.page.drawRectangle({ x: xs[i], y: this.y - hTete, width: larg[i], height: hTete, color: FOND_TETE, borderColor: BORD, borderWidth: 0.6 });
        const ls = tetes[i];
        const y0 = this.y - hTete / 2 + ((ls.length - 1) * 9) / 2 - 2.6;
        ls.forEach((l, k) => {
          const al: Align = i === 0 && colonnes[i].align !== "center" ? "left" : "center";
          this.ecrire(l, al === "left" ? xs[i] + 6 : xs[i] + larg[i] / 2, y0 - k * 9, 7.6, { gras: true, couleur: TEXTE_TETE, align: al });
        });
      }
      this.y -= hTete;
    };
    enTete();

    for (const l of lignes) {
      const h = hLigne(l);
      if (this.y - h < BAS) {
        this.nouvellePage();
        enTete();
      }
      const gras = l.style === "st" || l.style === "tot";
      const fond = l.style === "st" ? PASTEL : l.style === "tot" ? FOND_TETE : undefined;
      for (let i = 0; i < colonnes.length; i++) {
        const f = l.fonds?.[i] ?? fond;
        this.page.drawRectangle({ x: xs[i], y: this.y - h, width: larg[i], height: h, color: f, borderColor: BORD, borderWidth: 0.6 });
        const v = l.cells[i] ?? "";
        if (!v) continue;
        const al: Align = colonnes[i].align ?? (i === 0 ? "left" : "right");
        if (i === 0 && al === "left") {
          let x = xs[i] + 6 + (l.style === "sub" ? 10 : 0);
          const lab = this.couper(v, larg[0] - 10 - (l.puce ? 10 : 0) - (l.style === "sub" ? 10 : 0), 8.8, gras);
          const y0 = this.y - h / 2 + ((lab.length - 1) * 10.5) / 2 - 3;
          if (l.puce) {
            this.puce(x, y0, l.puce);
            x += 10;
          }
          lab.forEach((s, k) => this.ecrire(s, x, y0 - k * 10.5, 8.8, { gras, couleur: l.style === "sub" ? TEXTE_TETE : ENCRE }));
        } else {
          const x = al === "right" ? xs[i] + larg[i] - 6 : al === "center" ? xs[i] + larg[i] / 2 : xs[i] + 6;
          this.ecrire(this.ajuster(v, larg[i] - 8, 8.8, gras), x, this.y - h / 2 - 3, 8.8, { gras, align: al });
        }
      }
      this.y -= h;
    }
    this.y -= 5;
    if (note) this.paragraphe(note, { size: 7.3, couleur: ARDOISE, interligne: 2.4 });
    this.y -= 10;
  }
}

// ---------- génération ----------

async function chargerLogo(doc: PDFDocument, png: RapportEnquetePdfInput["logoPng"]): Promise<PDFImage | null> {
  try {
    if (png) return await doc.embedPng(png);
    if (typeof fetch === "function" && typeof window !== "undefined") {
      const res = await fetch("/logo-strateco.png");
      if (res.ok) return await doc.embedPng(await res.arrayBuffer());
    }
  } catch {
    // logo facultatif : le rapport reste lisible sans
  }
  return null;
}

export async function genererRapportEnquetePdf(input: RapportEnquetePdfInput): Promise<Uint8Array> {
  const s = input.synthese;
  const lb = libellesBatiments(input.copro.denominationBatiments);
  const nomBat = (code: string) => (code === "-" ? lb.sans : `${lb.court} ${code}`);
  const dateRapport = dateFr(input.arreteLe);

  const doc = await PDFDocument.create();
  doc.setTitle(`Rapport d'enquête sociale - ${input.copro.nom}`);
  doc.setAuthor("Strat Eco");
  doc.setCreator("Strat Eco pro");
  const [font, bold] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold)]);
  const logo = await chargerLogo(doc, input.logoPng);
  const r = new Rapport(doc, font, bold, logo, input.copro.nom, dateRapport);

  const po = s.occupation.po;
  const pb = s.occupation.pb;
  const part = (n: number) => pct(n, s.totalTantiemes);
  const modestes = s.nbModestes + s.nbTresModestes;

  // =====================================================================
  // Page 1 - synthèse
  // =====================================================================
  r.nouvellePage(false);
  const lh = 46;
  const lw = logo ? (logo.width / logo.height) * lh : 0;
  if (logo) r.page.drawImage(logo, { x: MARGE, y: PAGE.h - 30 - lh, width: lw, height: lh });
  else r.ecrire("Strat Eco", MARGE, PAGE.h - 60, 20, { gras: true, couleur: VERT_FONCE });
  const xd = PAGE.w - MARGE;
  const maxD = LARG - Math.max(lw, 100) - 24;
  r.ecrire("RAPPORT D'ENQUÊTE SOCIALE - SYNTHÈSE", xd, PAGE.h - 40, 8, { gras: true, couleur: VERT_FONCE, align: "right" });
  let tNom = 15;
  while (tNom > 10 && r.largeur(input.copro.nom, tNom, true) > maxD) tNom -= 0.5;
  r.ecrire(r.ajuster(input.copro.nom, maxD, tNom, true), xd, PAGE.h - 58, tNom, { gras: true, align: "right" });
  const ville = [input.copro.codePostal, input.copro.ville].filter(Boolean).join(" ");
  const adresse = [input.copro.adresse, ville].filter(Boolean).join(", ");
  const ligneAdr = [adresse, input.copro.syndic ? `Syndic : ${input.copro.syndic}` : ""].filter(Boolean).join(" · ");
  if (ligneAdr) r.ecrire(r.ajuster(ligneAdr, maxD, 8.5), xd, PAGE.h - 71, 8.5, { couleur: ARDOISE, align: "right" });
  const ligneDates = [
    input.envoyeeLe ? `Enquête envoyée le ${dateFr(input.envoyeeLe)}` : "",
    input.dateLimite ? `date limite le ${dateFr(input.dateLimite)}` : "",
    `réponses arrêtées au ${dateRapport}`,
  ].filter(Boolean).join(" · ");
  r.ecrire(r.ajuster(ligneDates.charAt(0).toUpperCase() + ligneDates.slice(1), maxD, 8.5), xd, PAGE.h - 83, 8.5, { couleur: ARDOISE, align: "right" });
  r.filet(PAGE.h - 92, VERT, 1.4);
  r.y = PAGE.h - 104;

  // ----- chiffres clés -----
  const tuiles = [
    { v: entier(s.nbCopros), l: pluriel(s.nbCopros, "copropriétaire"), sub: `${entier(s.nbLogements)} ${pluriel(s.nbLogements, "logement")} · ${s.nbBatiments} ${pluriel(s.nbBatiments, lb.singulier.toLowerCase(), lb.pluriel.toLowerCase())}`, fort: false },
    { v: entier(s.participation.total.reponses), l: `${pluriel(s.participation.total.reponses, "réponse")} (${pct(s.participation.total.reponses, s.nbCopros)})`, sub: `${s.participation.total.complets} ${pluriel(s.participation.total.complets, "questionnaire complet", "questionnaires complets")}`, fort: false },
    { v: entier(po.copros), l: pluriel(po.copros, "propriétaire occupant", "propriétaires occupants"), sub: `${part(po.tantiemes)} des tantièmes`, fort: true },
    { v: entier(pb.copros), l: pluriel(pb.copros, "propriétaire bailleur", "propriétaires bailleurs"), sub: `${part(pb.tantiemes)} des tantièmes`, fort: false },
  ];
  const gap = 8;
  const tw = (LARG - 3 * gap) / 4;
  const th = 58;
  tuiles.forEach((tu, i) => {
    const x = MARGE + i * (tw + gap);
    r.rectArrondi(x, r.y, tw, th, 5, { fond: tu.fort ? PASTEL : undefined, bord: tu.fort ? VERT : GRIS });
    r.ecrire(tu.v, x + 9, r.y - 25, 20, { gras: true, couleur: tu.fort ? VERT_FONCE : ENCRE });
    r.ecrire(r.ajuster(tu.l, tw - 16, 8.3, true), x + 9, r.y - 38, 8.3, { gras: true });
    r.couper(tu.sub, tw - 16, 7.2).slice(0, 2).forEach((l, k) => r.ecrire(l, x + 9, r.y - 48 - k * 8.5, 7.2, { couleur: ARDOISE }));
  });
  r.y -= th + 16;

  // ----- occupants et profils -----
  r.titreBloc(
    po.copros === 1
      ? "Le propriétaire occupant et son profil de ressources Anah"
      : `Les ${po.copros} propriétaires occupants et leur profil de ressources Anah`
  );
  r.y -= 20;
  if (po.copros === 0) {
    r.paragraphe("Aucun propriétaire occupant n'est identifié à ce jour, ni par l'enquête ni par l'adresse postale des copropriétaires.", { couleur: ARDOISE });
    r.y -= 8;
  } else {
    // barre empilée
    const bh = 24;
    let x = MARGE;
    const segments = s.profils.filter((p) => p.n > 0);
    for (const p of segments) {
      const w = (LARG * p.n) / po.copros;
      r.page.drawRectangle({ x, y: r.y - bh, width: w, height: bh, color: couleurProfil(p.profil) });
      if (w >= 14) r.ecrire(String(p.n), x + w / 2, r.y - bh / 2 - 3.2, 9, { gras: true, couleur: p.profil ? BLANC : ENCRE, align: "center" });
      const lab = p.profil ? libelleProfil(p.profil, "court") : "À déterminer";
      if (r.largeur(lab, 7.2) <= w - 2) r.ecrire(lab, x + (p.profil ? 0 : w), r.y - bh - 10, 7.2, { couleur: ARDOISE, align: p.profil ? "left" : "right" });
      x += w;
    }
    r.y -= bh + 20;

    // tableau des profils
    const batsP = s.batiments;
    const fixes = [52, 40, 62, ...batsP.map(() => 46)];
    const colLabel = LARG - fixes.reduce((a, b) => a + b, 0);
    const forme = batsP.length <= 2 ? "long" : "court";
    const tetes = ["Profil de ressources", "Occupants", "Part", "Vérifiés sur avis", ...batsP.map(nomBat)];
    const xsCol = [MARGE, MARGE + colLabel];
    for (const w of fixes) xsCol.push(xsCol[xsCol.length - 1] + w);
    const ecrireLigne = (cells: string[], y: number, o: { gras?: boolean; couleur?: RGB; puce?: RGB; size?: number } = {}) => {
      const size = o.size ?? 8.8;
      let x0 = MARGE + 5;
      if (o.puce) {
        r.puce(x0, y, o.puce);
        x0 += 10;
      }
      r.ecrire(r.ajuster(cells[0], colLabel - (x0 - MARGE) - 4, size, o.gras), x0, y, size, { gras: o.gras, couleur: o.couleur });
      cells.slice(1).forEach((c, i) => r.ecrire(r.ajuster(c, fixes[i] - 6, size, o.gras), xsCol[i + 2] - 5, y, size, { gras: o.gras, couleur: o.couleur, align: "right" }));
    };
    ecrireLigne(tetes, r.y - 9, { gras: true, couleur: ARDOISE, size: 7.2 });
    r.y -= 14;
    r.filet(r.y, ENCRE, 0.8);
    const lignesProfils = s.profils.filter((p) => p.profil || p.n > 0);
    for (const p of lignesProfils) {
      ecrireLigne(
        [
          p.profil ? libelleProfil(p.profil, forme) : "À déterminer (sans avis d'imposition)",
          String(p.n),
          pct(p.n, po.copros),
          p.profil ? String(p.verifies) : "-",
          ...batsP.map((b) => String(p.parBatiment[b] ?? 0)),
        ],
        r.y - 11,
        { puce: couleurProfil(p.profil) }
      );
      r.y -= 15.5;
      r.filet(r.y);
    }
    r.filet(r.y, ENCRE, 0.8);
    ecrireLigne(
      [
        "Total propriétaires occupants",
        String(po.copros),
        "100 %",
        String(s.profils.reduce((a, p) => a + p.verifies, 0)),
        ...batsP.map((b) => String(lignesProfils.reduce((a, p) => a + (p.parBatiment[b] ?? 0), 0))),
      ],
      r.y - 11,
      { gras: true }
    );
    r.y -= 20;

    // encadré modestes / très modestes
    const eh = 30;
    r.rectArrondi(MARGE, r.y, LARG, eh, 5, { fond: PASTEL });
    r.ecrire(String(modestes), MARGE + 22, r.y - 20.5, 17, { gras: true, couleur: VERT_FONCE, align: "center" });
    r.ecrire(
      `${modestes > 1 ? "occupants" : "occupant"} aux ressources modestes ou très modestes (${pct(modestes, po.copros)})`,
      MARGE + 42,
      r.y - 12,
      8.8,
      { gras: true }
    );
    r.ecrire(
      r.ajuster(`dont ${s.nbTresModestes} ${pluriel(s.nbTresModestes, "très modeste", "très modestes")} - chiffres repris dans la fiche « État de la copropriété » du dossier ANAH`, LARG - 50, 8),
      MARGE + 42,
      r.y - 23,
      8,
      { couleur: ARDOISE }
    );
    r.y -= eh + 16;
  }

  // ----- occupation et ménages (deux colonnes) -----
  const cw = (LARG - 20) / 2;
  const xg = MARGE;
  const xr = MARGE + cw + 20;
  {
    const comp = s.menages.composition;
    const notesMenages = [
      `${entier(s.menages.personnes)} ${pluriel(s.menages.personnes, "personne logée", "personnes logées")} chez les ${s.menages.repondants} ${pluriel(s.menages.repondants, "ménage occupant", "ménages occupants")} ayant répondu`,
      s.menages.retraites != null ? `${s.menages.retraites} ${pluriel(s.menages.retraites, "ménage")} dont la personne de référence est retraitée` : "",
    ].filter(Boolean).join(" · ");
    const lignesNote = r.couper(notesMenages, cw, 7.6);
    const hDroite = 20 + (comp.length ? comp.length * 13 : 13) + 4 + lignesNote.length * 9.5;
    const hGauche = 20 + 98;
    r.besoin(Math.max(hDroite, hGauche));
    const y0 = r.y;

    // gauche : anneau de l'occupation des logements
    r.titreBloc(`Occupation des ${entier(s.nbLogements)} logements`, xg, cw, y0);
    const parts = [
      { label: "Occupés par le propriétaire", n: po.logements, c: VERT },
      { label: "Loués", n: pb.loues, c: C_BAILLEUR },
      { label: "Vacants", n: pb.vacants, c: C_VACANT },
      { label: "Occupation inconnue", n: s.occupation.inconnue.logements, c: C_INCONNU },
    ];
    const cx = xg + 46;
    const cy = y0 - 20 - 46;
    const R = 44;
    const ri = 27;
    const total = Math.max(1, s.nbLogements);
    let angle = 0;
    const arc = (a0: number, a1: number, c: RGB) => {
      const pt = (rad: number, a: number) => `${(rad * Math.sin(a)).toFixed(3)} ${(-rad * Math.cos(a)).toFixed(3)}`;
      const grand = a1 - a0 > Math.PI ? 1 : 0;
      const p = `M ${pt(R, a0)} A ${R} ${R} 0 ${grand} 1 ${pt(R, a1)} L ${pt(ri, a1)} A ${ri} ${ri} 0 ${grand} 0 ${pt(ri, a0)} Z`;
      r.page.drawSvgPath(p, { x: cx, y: cy, color: c });
    };
    if (s.nbLogements === 0) {
      arc(0, Math.PI, RAIL);
      arc(Math.PI, 2 * Math.PI, RAIL);
    }
    for (const p of parts) {
      if (p.n <= 0) continue;
      const da = (2 * Math.PI * p.n) / total;
      if (da >= 2 * Math.PI - 1e-6) {
        arc(angle, angle + Math.PI, p.c);
        arc(angle + Math.PI, angle + 2 * Math.PI, p.c);
      } else arc(angle, angle + da, p.c);
      angle += da;
    }
    r.ecrire(entier(s.nbLogements), cx, cy - 2, 15, { gras: true, align: "center" });
    r.ecrire(pluriel(s.nbLogements, "logement"), cx, cy - 12, 6.8, { couleur: ARDOISE, align: "center" });
    const xl = xg + 104;
    parts
      .filter((p, i) => i < 2 || p.n > 0)
      .forEach((p, i) => {
        const yy = y0 - 44 - i * 15;
        r.puce(xl, yy, p.c, p.c === C_INCONNU ? C_VACANT : undefined);
        r.ecrire(r.ajuster(p.label, xg + cw - xl - 34, 8.6), xl + 10, yy, 8.6);
        r.ecrire(entier(p.n), xg + cw, yy, 8.6, { gras: true, align: "right" });
      });

    // droite : composition des ménages occupants
    const nMenages = comp.length ? s.menages.reponsesComposition : s.menages.repondants;
    r.titreBloc(`Ménages occupants (${nMenages} ${pluriel(nMenages, "réponse")})`, xr, cw, y0);
    let yy = y0 - 20;
    if (comp.length) {
      const nTot = Math.max(1, comp.reduce((a, c) => a + c.n, 0));
      for (const c of comp) {
        const lab = c.label.startsWith("Autre") ? "Autre" : c.label;
        r.ecrire(lab, xr, yy - 9, 8.4);
        const rx = xr + 100;
        const rw = cw - 100 - 22;
        r.rectArrondi(rx, yy - 3, rw, 6, 1.5, { fond: RAIL });
        if (c.n > 0) r.rectArrondi(rx, yy - 3, Math.max(3, (rw * c.n) / nTot), 6, 1.5, { fond: VERT });
        r.ecrire(String(c.n), xr + cw, yy - 9, 8.4, { gras: true, align: "right" });
        yy -= 13;
      }
    } else {
      r.ecrire("Composition des ménages non renseignée.", xr, yy - 9, 8.4, { couleur: ARDOISE });
      yy -= 13;
    }
    yy -= 4;
    lignesNote.forEach((l) => {
      r.ecrire(l, xr, yy - 7.6, 7.6, { couleur: ARDOISE });
      yy -= 9.5;
    });
    r.y = Math.min(y0 - hGauche, yy) - 12;
  }

  // ----- vigilance et avis (deux colonnes) -----
  {
    const lignes = s.vigilance.lignes;
    const hGauche = 20 + Math.max(1, lignes.length) * 14.5;
    const legendeAvis = s.avis ? 1 : 0;
    const hDroite = 20 + (s.avis ? 16 + 24 + legendeAvis * 22 : 14) + (s.visite ? 16 : 0);
    r.besoin(Math.max(hGauche, hDroite));
    const y0 = r.y;

    r.titreBloc("Points de vigilance sociale", xg, cw, y0);
    let yy = y0 - 20;
    if (!lignes.length) {
      r.ecrire("Aucune question sociale renseignée.", xg, yy - 9, 8.4, { couleur: ARDOISE });
      yy -= 14.5;
    }
    for (const l of lignes) {
      r.ecrire(r.ajuster(l.label, cw - 26, 8.4), xg, yy - 9.5, 8.4);
      r.ecrire(String(l.n), xg + cw, yy - 9.5, 8.4, { gras: true, couleur: l.alerte && l.n > 0 ? ALERTE : ENCRE, align: "right" });
      yy -= 14.5;
      r.filet(yy + 1, GRIS, 0.5, xg, xg + cw);
    }

    r.titreBloc("Regard sur le projet de travaux", xr, cw, y0);
    let yd = y0 - 20;
    if (s.avis) {
      const utiles = s.avis.options.slice(0, 2).reduce((a, o) => a + o.n, 0);
      const p = pct(utiles, s.avis.n);
      r.ecrire(p, xr, yd - 12, 13, { gras: true, couleur: VERT_FONCE });
      r.ecrire(r.ajuster(" jugent les travaux utiles ou indispensables", cw - r.largeur(p, 13, true), 8.4), xr + r.largeur(p, 13, true), yd - 12, 8.4);
      yd -= 18;
      let x = xr;
      s.avis.options.forEach((o, i) => {
        if (o.n <= 0) return;
        const w = (cw * o.n) / s.avis!.n;
        r.page.drawRectangle({ x, y: yd - 16, width: w, height: 16, color: C_AVIS[i] });
        if (w >= 12) r.ecrire(String(o.n), x + w / 2, yd - 11, 7.6, { gras: true, couleur: i === 4 ? ENCRE : BLANC, align: "center" });
        x += w;
      });
      yd -= 24;
      let xl = xr;
      let yl = yd - 6;
      s.avis.options.forEach((o, i) => {
        const w = 10 + r.largeur(o.label, 7) + 9;
        if (xl + w > xr + cw) {
          xl = xr;
          yl -= 10;
        }
        r.puce(xl, yl, C_AVIS[i]);
        r.ecrire(o.label, xl + 9, yl, 7, { couleur: ARDOISE });
        xl += w;
      });
      yd = yl - 12;
    } else {
      r.ecrire("Question non posée dans cette enquête.", xr, yd - 9, 8.4, { couleur: ARDOISE });
      yd -= 14;
    }
    if (s.visite) {
      r.ecrire("Accord pour une visite du logement", xr, yd - 9.5, 8.4);
      r.ecrire(String(s.visite.oui), xr + cw, yd - 9.5, 8.4, { gras: true, align: "right" });
      yd -= 14.5;
      r.filet(yd + 1, GRIS, 0.5, xr, xr + cw);
    }
    r.y = Math.min(yy, yd) - 12;
  }

  // ----- méthode -----
  const verifies = s.profils.reduce((a, p) => a + p.verifies, 0);
  const declaratifs = s.occupants.filter((o) => o.profilStatut === "declaratif").length;
  const indet = s.profils.find((p) => p.profil === null)?.n ?? 0;
  const methode =
    `Méthode : occupation tirée de l'enquête, à défaut de l'adresse postale du copropriétaire (${s.occupation.sources.adresse} cas)` +
    (s.occupation.mixtes ? ` ; ${s.occupation.mixtes} ${pluriel(s.occupation.mixtes, "propriétaire")} à la fois occupant et bailleur, compté dans les deux catégories` : "") +
    `. Profil de ressources : avis d'imposition vérifié par Strat Eco (${verifies}), sinon profil déclaré par le copropriétaire (${declaratifs})` +
    (indet ? ` ; ${indet} à déterminer` : "") +
    ". Pourcentages calculés sur les répondants à chaque question.";
  r.besoin(30);
  r.filet(r.y);
  r.y -= 6;
  r.paragraphe(methode, { size: 7.2, couleur: ARDOISE, interligne: 2.4 });

  // =====================================================================
  // Détail chiffré (tableaux numérotés)
  // =====================================================================
  r.nouvellePage();
  r.titreChapitre("Détail chiffré de l'enquête");
  const bats = s.batiments;
  const colsBat: Colonne[] = bats.map((b) => ({ titre: nomBat(b), largeur: 58 }));
  const parBat = (m: Record<string, number>) => bats.map((b) => entier(m[b] ?? 0));
  let numero = 0;
  const prochain = () => `Tableau ${++numero}`;

  // 1. participation
  const pt = s.participation;
  const pbat = (k: "copros" | "reponses" | "complets") => bats.map((b) => entier(pt.parBatiment[b]?.[k] ?? 0));
  r.tableau(
    prochain(),
    "Participation à l'enquête",
    [{ titre: "" }, ...colsBat, { titre: "Total", largeur: 58 }],
    [
      { cells: ["Copropriétaires interrogés", ...pbat("copros"), entier(pt.total.copros)] },
      { cells: ["Questionnaires reçus", ...pbat("reponses"), entier(pt.total.reponses)] },
      { cells: ["dont complets", ...pbat("complets"), entier(pt.total.complets)], style: "sub" },
      {
        cells: ["Taux de réponse", ...bats.map((b) => pct(pt.parBatiment[b]?.reponses ?? 0, pt.parBatiment[b]?.copros ?? 0)), pct(pt.total.reponses, pt.total.copros)],
        style: "st",
      },
    ]
  );

  // 2. statut d'occupation
  const oc = s.occupation;
  const lignesOcc: LigneTableau[] = [
    { cells: ["Propriétaires occupants", ...parBat(oc.po.parBatiment), entier(oc.po.copros), entier(oc.po.tantiemes), part(oc.po.tantiemes)], style: "st" },
    { cells: ["Propriétaires bailleurs (y compris logements vacants)", ...parBat(oc.pb.parBatiment), entier(oc.pb.copros), entier(oc.pb.tantiemes), part(oc.pb.tantiemes)] },
  ];
  if (oc.inconnue.copros > 0)
    lignesOcc.push({ cells: ["Occupation inconnue", ...parBat(oc.inconnue.parBatiment), entier(oc.inconnue.copros), entier(oc.inconnue.tantiemes), part(oc.inconnue.tantiemes)] });
  if (oc.autres.copros > 0 || oc.autres.tantiemes > 0)
    lignesOcc.push({ cells: ["Autres lots (commerces, annexes seules)", ...parBat(oc.autres.parBatiment), entier(oc.autres.copros), entier(oc.autres.tantiemes), part(oc.autres.tantiemes)] });
  lignesOcc.push({ cells: ["Total", ...pbat("copros"), entier(s.nbCopros), entier(s.totalTantiemes), s.totalTantiemes ? "100 %" : "-"], style: "tot" });
  r.tableau(
    prochain(),
    "Statut d'occupation des copropriétaires",
    [{ titre: "" }, ...colsBat, { titre: "Total", largeur: 50 }, { titre: "Tantièmes", largeur: 58 }, { titre: "Part des tantièmes", largeur: 58 }],
    lignesOcc,
    `${oc.pb.loues} ${pluriel(oc.pb.loues, "logement loué", "logements loués")} et ${oc.pb.vacants} ${pluriel(oc.pb.vacants, "vacant")}. ` +
      `Occupation tirée de l'enquête (${oc.sources.enquete}), à défaut de l'adresse postale (${oc.sources.adresse}) ; inconnue pour ${oc.sources.inconnu} ${pluriel(oc.sources.inconnu, "copropriétaire")}.` +
      (oc.mixtes ? ` ${oc.mixtes} ${pluriel(oc.mixtes, "propriétaire")} à la fois occupant et bailleur, compté dans les deux catégories.` : "")
  );

  // 3. ressources des propriétaires occupants
  if (po.copros > 0) {
    const ligneProfil = (p: SyntheseEnquete["profils"][number]): LigneTableau => ({
      cells: [libelleProfil(p.profil, "table"), ...parBat(p.parBatiment), entier(p.n), pct(p.n, po.copros), p.profil ? entier(p.verifies) : "-"],
      puce: couleurProfil(p.profil),
    });
    const [bleu, jaune, violet, rose, aDet] = s.profils;
    const sousTotalBat: Record<string, number> = {};
    for (const b of bats) sousTotalBat[b] = (bleu.parBatiment[b] ?? 0) + (jaune.parBatiment[b] ?? 0);
    const totalBat: Record<string, number> = {};
    for (const b of bats) totalBat[b] = s.profils.reduce((a, p) => a + (p.parBatiment[b] ?? 0), 0);
    r.tableau(
      prochain(),
      "Ressources des propriétaires occupants (plafonds Anah)",
      [{ titre: "" }, ...colsBat, { titre: "Total", largeur: 50 }, { titre: "Part", largeur: 46 }, { titre: "dont vérifiés sur avis", largeur: 62 }],
      [
        ligneProfil(bleu),
        ligneProfil(jaune),
        { cells: ["Sous-total modestes et très modestes", ...parBat(sousTotalBat), entier(modestes), pct(modestes, po.copros), entier(bleu.verifies + jaune.verifies)], style: "st" },
        ligneProfil(violet),
        ligneProfil(rose),
        ...(aDet.n > 0 ? [ligneProfil(aDet)] : []),
        { cells: ["Propriétaires occupants", ...parBat(totalBat), entier(po.copros), "100 %", entier(verifies)], style: "tot" },
      ],
      `Profil établi sur l'avis d'imposition vérifié par Strat Eco, à défaut déclaré par le copropriétaire dans l'enquête (${declaratifs}).`
    );
  }

  // 4. composition des ménages occupants
  if (s.menages.composition.length) {
    const nComp = s.menages.composition.reduce((a, c) => a + c.n, 0);
    r.tableau(
      prochain(),
      "Composition des ménages occupants",
      [{ titre: "" }, { titre: "Ménages", largeur: 62 }, { titre: "Part", largeur: 58 }],
      [
        ...s.menages.composition.map((c) => ({ cells: [c.label, entier(c.n), pct(c.n, nComp)] })),
        { cells: ["Ménages occupants ayant répondu à la question", entier(nComp), "100 %"], style: "tot" },
      ],
      `${entier(s.menages.personnes)} ${pluriel(s.menages.personnes, "personne logée", "personnes logées")} chez les ${s.menages.repondants} ${pluriel(s.menages.repondants, "ménage occupant", "ménages occupants")} ayant répondu à l'enquête.`
    );
  }

  // 5. situations sociales
  if (s.vigilance.lignes.length) {
    const l = s.vigilance.lignes;
    const paires: LigneTableau[] = [];
    for (let i = 0; i < l.length; i += 2) {
      const a = l[i];
      const b = l[i + 1];
      paires.push({ cells: [a.label, entier(a.n), b?.label ?? "", b ? entier(b.n) : ""] });
    }
    r.tableau(
      prochain(),
      `Situations sociales déclarées (${s.vigilance.repondants} ${pluriel(s.vigilance.repondants, "répondant")})`,
      [{ titre: "" }, { titre: "Ménages", largeur: 52 }, { titre: "", align: "left" }, { titre: "Ménages", largeur: 52 }],
      paires
    );
  }

  // 6. importance des travaux
  if (s.avis) {
    const utiles = s.avis.options.slice(0, 2).reduce((a, o) => a + o.n, 0);
    r.tableau(
      prochain(),
      `Importance des travaux selon les copropriétaires (${s.avis.n} ${pluriel(s.avis.n, "réponse")})`,
      [...s.avis.options.map((o) => ({ titre: o.label, align: "center" as Align })), { titre: "Utiles ou indispensables", largeur: 110, align: "center" }],
      [{ cells: [...s.avis.options.map((o) => entier(o.n)), `${entier(utiles)} - ${pct(utiles, s.avis.n)}`], fonds: { [s.avis.options.length]: PASTEL } }],
      s.visite ? `${s.visite.oui} ${pluriel(s.visite.oui, "copropriétaire accepte", "copropriétaires acceptent")} une visite de leur logement${s.visite.sousConditions ? `, dont ${s.visite.sousConditions} sous conditions` : ""}.` : undefined
    );
  }

  // observations du chef de projet
  const obs = (input.observations ?? "").trim();
  if (obs) {
    const paragraphes = obs.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
    const lignes = paragraphes.map((p) => r.couper(p, LARG - 20, 9));
    const h = 16 + lignes.reduce((a, ls) => a + ls.length * 12.5 + 5, 0);
    r.besoin(18 + h);
    r.ecrire("Observations", MARGE, r.y - 10, 9.5, { gras: true, couleur: VERT_FONCE });
    r.ecrire("de l'assistant à maîtrise d'ouvrage", MARGE + r.largeur("Observations", 9.5, true) + 6, r.y - 10, 9.5, { gras: true });
    r.y -= 16;
    r.page.drawRectangle({ x: MARGE, y: r.y - h, width: LARG, height: h, borderColor: BORD, borderWidth: 0.6 });
    let yy = r.y - 9;
    for (const ls of lignes) {
      for (const l of ls) {
        r.ecrire(l, MARGE + 10, yy - 9, 9);
        yy -= 12.5;
      }
      yy -= 5;
    }
    r.y -= h + 12;
  }

  // =====================================================================
  // Annexe - liste nominative des propriétaires occupants
  // =====================================================================
  if (s.occupants.length) {
    r.nouvellePage();
    r.titreChapitre("Annexe : liste des propriétaires occupants");
    r.paragraphe("Document nominatif - diffusion réservée au dossier de financement et au syndic.", { size: 8.5, couleur: ARDOISE });
    if (s.occupants.some((o) => !o.repondu && o.source === "adresse"))
      r.paragraphe("« Sans réponse » : occupant identifié par son adresse postale, sans réponse à l'enquête ; son profil reste à déterminer.", { size: 7.6, couleur: ARDOISE });
    r.y -= 8;
    const cols = [
      { titre: "Propriétaire occupant", w: 0 },
      { titre: lb.court, w: 38 },
      { titre: "Logement", w: 62 },
      { titre: "Pers.", w: 34 },
      { titre: "Profil", w: 92 },
      { titre: "Statut du profil", w: 132 },
    ];
    cols[0].w = LARG - cols.slice(1).reduce((a, c) => a + c.w, 0);
    const xs = cols.map((_, i) => MARGE + cols.slice(0, i).reduce((a, c) => a + c.w, 0));
    const enTete = () => {
      cols.forEach((c, i) => r.ecrire(c.titre, i === 3 ? xs[i] + c.w - 6 : xs[i] + 5, r.y - 9, 7.4, { gras: true, couleur: ARDOISE, align: i === 3 ? "right" : "left" }));
      r.y -= 14;
      r.filet(r.y, ENCRE, 0.8);
    };
    enTete();
    for (const o of s.occupants) {
      if (r.y - 15 < BAS) {
        r.nouvellePage();
        enTete();
      }
      const yb = r.y - 10.5;
      r.ecrire(r.ajuster(o.nom, cols[0].w - 8, 8.6, true), xs[0] + 5, yb, 8.6, { gras: true });
      r.ecrire(o.batiment ?? "-", xs[1] + 5, yb, 8.6);
      r.ecrire(r.ajuster(o.logements.join(", ") || "-", cols[2].w - 8, 8.6), xs[2] + 5, yb, 8.6);
      r.ecrire(o.personnes != null ? String(o.personnes) : "-", xs[3] + cols[3].w - 6, yb, 8.6, { align: "right" });
      r.puce(xs[4] + 5, yb, couleurProfil(o.profil));
      r.ecrire(libelleProfil(o.profil, "court"), xs[4] + 15, yb, 8.6);
      const statut =
        o.profilStatut === "verifie"
          ? `Vérifié le ${dateFr(o.profilVerifieLe)}`
          : o.profilStatut === "declaratif"
            ? "Déclaratif"
            : !o.repondu && o.source === "adresse"
              ? "Sans réponse"
              : "Non renseigné";
      r.ecrire(r.ajuster(statut, cols[5].w - 8, 8.6), xs[5] + 5, yb, 8.6, { couleur: o.profilStatut ? ENCRE : ARDOISE });
      r.y -= 15;
      r.filet(r.y);
    }
  }

  // ----- pieds de page -----
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    r.page = p;
    r.filet(36, GRIS, 0.6);
    r.ecrire("Strat Eco - Stratégie d'économies d'énergie · www.strateco.fr", MARGE, 25, 7, { couleur: ARDOISE });
    const droite = `Rapport d'enquête sociale du ${dateRapport} · page ${i + 1} / ${pages.length}`;
    const nom = r.ajuster(input.copro.nom, LARG - 250 - r.largeur(droite, 7), 7);
    r.ecrire(`${nom} · ${droite}`, PAGE.w - MARGE, 25, 7, { couleur: ARDOISE, align: "right" });
  });

  return doc.save();
}

export function nomFichierRapportEnquete(coproNom: string, date = new Date()): string {
  return `${coproNom} - Rapport d'enquête sociale - ${date.toISOString().slice(0, 10)}.pdf`.replace(/[\\/:*?"<>|]/g, " ");
}
