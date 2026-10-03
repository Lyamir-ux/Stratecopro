// CERFA Annexe 3.1 « Formulaire type entreprises - Éco-PTZ Performance globale
// Métropole » (applicable au 1er juillet 2025), un par logement - 02/10/2026.
//
// Gabarit officiel repris du skill cerfa-ecoptz-entreprise, coordonnées de ses
// champs (references/cerfa_fields.md, relevées avec PyMuPDF : origine en HAUT
// à gauche) converties pour pdf-lib (origine en bas à gauche) : y = H - y_haut.
// Structure : page 1 = logement + audit, page 2 = poste n°1, puis la page 3 du
// gabarit répétée (3 postes par page), les suivantes marquées « FEUILLE
// COMPLÉMENTAIRE ». Le montant va dans la colonne « l'entreprise pour le
// logement », jamais dans celle du syndic. Les cases de signature, « Fait à »
// et « le » restent vides : la signature électronique les remplit au
// scellement (edge function signature-documents), d'après `emplacements`.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { fmtMontantCerfa } from "@/lib/finance/ecoPtzIndividuel";

export const GABARIT_CERFA_ECOPTZ = "/modeles/cerfa-ecoptz-annexe-3-1-peg.pdf";

/** Rectangle en coordonnées « haut-gauche » du skill : [x0, y0, x1, y1]. */
type RectHaut = [number, number, number, number];

/** Rectangle pdf-lib (origine en bas à gauche). */
export interface RectPdf {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CerfaEcoPtzPoste {
  /** Description du poste (titre du lot). */
  description: string;
  entreprise: string;
  siret: string;
  /** Quote-part du logement pour ce poste (non arrondie). */
  montant: number;
  /** Clé du signataire (participant) de ce poste. */
  signataire: string;
}

export interface CerfaEcoPtzInput {
  gabarit?: ArrayBuffer | Uint8Array;
  adresse: { num: string; voie: string; cp: string; ville: string };
  /** « Copropriété - NOM (lot n°12, cave n°45) ». */
  batiment: string;
  syndic: string;
  /** SCI : bandeau « éligibilité conditionnelle » (régime IR + associés personnes physiques). */
  sci?: boolean;
  audit: {
    reference: string;
    date: string;
    scenario: string;
    coutTtc: string;
    classeAvant: string;
    consoAvant: string;
    classeApres: string;
    consoApres: string;
    gain: string;
    /** Nom du prestataire + interlocuteur (« INGEDAIR - Camille STADELMANN »). */
    prestataire: string;
    siret: string;
  };
  postes: CerfaEcoPtzPoste[];
  /** Clés des signataires syndic et auditeur (participants de l'envoi). */
  signataireSyndic: string;
  signataireAuditeur: string;
}

/** Où apposer la signature d'un participant, et où écrire « Fait à » / « le ». */
export interface EmplacementSignature {
  signataire: string;
  page: number;
  signature: RectPdf;
  /** Ligne « Fait à … le … » d'un poste : réécrite entière au scellement. */
  ligneFaitA?: RectPdf;
  /** Page 1 (auditeur) : la ligne garde ses libellés, seules les valeurs s'écrivent. */
  faitA?: RectPdf;
  date?: RectPdf;
}

const BLEU = rgb(0.05, 0.15, 0.55);
const BLANC = rgb(1, 1, 1);
const ORANGE = rgb(0.85, 0.35, 0.05);
const BANDEAU = rgb(0.2, 0.4, 0.7);

const FS = 8.5;
const FS_SM = 7.5;
const FS_XS = 6.5;

// ---------- Coordonnées du skill (haut-gauche) ----------

const P1_ADDR_Y0 = 146;
const P1_BATIMENT: RectHaut = [275, 191, 544, 205];
const P1_MONTANT: RectHaut = [217, 236, 289, 251];
const P1_SYNDIC: RectHaut = [400, 259, 525, 273];
const P1_AUD_REF: RectHaut = [173, 441, 297, 455];
const P1_AUD_DATE: RectHaut = [384, 441, 495, 455];
const P1_AUD_SCEN: RectHaut = [325, 462, 549, 476];
const P1_AUD_COUT: RectHaut = [183, 484, 305, 498];
const P1_AUD_CLAV: RectHaut = [413, 530, 470, 544];
const P1_AUD_CONAV: RectHaut = [402, 555, 439, 569];
const P1_AUD_CLAP: RectHaut = [413, 597, 470, 611];
const P1_AUD_CONAP: RectHaut = [384, 618, 423, 632];
const P1_AUD_GAIN: RectHaut = [182, 639, 203, 653];
const P1_AUD_PREST: RectHaut = [130, 680, 420, 694];
const P1_AUD_SIRET: RectHaut = [83, 701, 280, 715];

// Signatures (relevées le 02/10/2026 avec pdfjs sur le même gabarit) :
// « Signature du syndic : » x 333-417 / ligne 290 ; ligne « Fait à … le … » de
// l'auditeur : valeurs après x 62 et x 325 (ligne 738) ; « Signature » x 30-72
// ligne 762 ; postes : « Fait à … le … » x 29-277, « Signature de l'entreprise : ».
const P1_SIG_SYNDIC: RectHaut = [335, 294, 566, 336];
const P1_AUD_FAITA: RectHaut = [63, 729, 309, 742];
const P1_AUD_LE: RectHaut = [326, 729, 566, 742];
const P1_SIG_AUDITEUR: RectHaut = [78, 750, 330, 794];

const P2_ADDR_Y0 = 341;
const P2_BATIMENT: RectHaut = [275, 385, 544, 399];
const P2_E1_DESC: RectHaut = [26, 464, 562, 478];
const P2_E1_NOM: RectHaut = [130, 490, 280, 504];
const P2_E1_SIRET: RectHaut = [83, 530, 278, 544];
// montant : la case s'arrête avant le « € » imprimé par le gabarit (x 467)
const P2_E1_MONTANT: RectHaut = [402, 538, 465, 553];
const P2_E1_FAITA: RectHaut = [28, 559, 280, 572];
const P2_E1_SIG: RectHaut = [32, 602, 292, 646];

/** Page 3 du gabarit : 3 postes (description, nom, SIRET, montant, Fait à, signature). */
const PAGE3_SLOTS: { desc: number; nom: number; siret: number; montant: RectHaut; faitA: number; sig: number }[] = [
  { desc: 71, nom: 111, siret: 150, montant: [402, 141, 465, 157], faitA: 175.6, sig: 203.6 },
  { desc: 316, nom: 355, siret: 394, montant: [402, 386, 465, 401], faitA: 420.1, sig: 448.3 },
  { desc: 560, nom: 600, siret: 639, montant: [402, 631, 465, 646], faitA: 664.8, sig: 692.9 },
];

// ---------- Utilitaires ----------

const TRANSLITTERATION: Record<string, string> = { Ł: "L", ł: "l", Đ: "D", đ: "d", ı: "i", "⚠": "!", "‰": "‰" };

/** Caractères encodables par la police standard (WinAnsi), accents décomposés sinon. */
export function nettoyerTexte(font: PDFFont, texte: string): string {
  const jeu = new Set(font.getCharacterSet());
  let out = "";
  for (const brut of texte.replace(/[\u00a0\u202f\u2009]/g, " ").replace(/[\u2014\u2013]/g, "-")) {
    const ch = TRANSLITTERATION[brut] ?? brut;
    if (jeu.has(ch.codePointAt(0)!)) out += ch;
    else {
      const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      out += [...base].every((c) => jeu.has(c.codePointAt(0)!)) ? base : "?";
    }
  }
  return out;
}

function versPdf(page: PDFPage, r: RectHaut): RectPdf {
  const H = page.getHeight();
  return { x: r[0], y: H - r[3], w: r[2] - r[0], h: r[3] - r[1] };
}

/** Efface la zone et y inscrit le texte (bas-gauche du rectangle, comme le skill), réduit pour tenir. */
function couvrir(page: PDFPage, font: PDFFont, r: RectHaut, brut: string, taille = FS) {
  const H = page.getHeight();
  page.drawRectangle({ x: r[0], y: H - r[3], width: r[2] - r[0], height: r[3] - r[1], color: BLANC });
  let t = nettoyerTexte(font, (brut ?? "").trim());
  if (!t) return;
  const largeur = r[2] - r[0] - 3;
  let s = taille;
  while (s > 5 && font.widthOfTextAtSize(t, s) > largeur) s -= 0.25;
  while (t.length > 1 && font.widthOfTextAtSize(t, s) > largeur) t = t.slice(0, -1);
  page.drawText(t, { x: r[0] + 2, y: H - (r[3] - 1.5), size: s, font, color: BLEU });
}

function remplirAdresse(page: PDFPage, font: PDFFont, y0: number, a: CerfaEcoPtzInput["adresse"]) {
  couvrir(page, font, [110, y0, 160, y0 + 17], a.num);
  couvrir(page, font, [200, y0, 430, y0 + 17], a.voie);
  couvrir(page, font, [95, y0 + 18, 168, y0 + 35], a.cp);
  couvrir(page, font, [194, y0 + 18, 420, y0 + 35], a.ville);
}

async function chargerGabarit(g?: ArrayBuffer | Uint8Array): Promise<PDFDocument> {
  if (g) return PDFDocument.load(g instanceof Uint8Array ? g : new Uint8Array(g));
  const res = await fetch(GABARIT_CERFA_ECOPTZ);
  if (!res.ok) throw new Error("Gabarit du CERFA éco-PTZ introuvable");
  return PDFDocument.load(await res.arrayBuffer());
}

// ---------- Génération ----------

export async function genCerfaEcoPtz(
  input: CerfaEcoPtzInput
): Promise<{ bytes: Uint8Array; emplacements: EmplacementSignature[]; pages: number; total: number }> {
  if (!input.postes.length) throw new Error("Aucun poste de travaux éligible");
  const gabarit = await chargerGabarit(input.gabarit);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const emplacements: EmplacementSignature[] = [];
  // Le total est toujours la somme des postes affichés (règle impérative du skill).
  const total = input.postes.reduce((s, p) => s + p.montant, 0);

  // ----- Page 1 : logement + audit -----
  const [p1] = await out.copyPages(gabarit, [0]);
  out.addPage(p1);
  remplirAdresse(p1, font, P1_ADDR_Y0, input.adresse);
  couvrir(p1, font, P1_BATIMENT, input.batiment, FS_XS);
  couvrir(p1, font, P1_MONTANT, fmtMontantCerfa(total));
  couvrir(p1, font, P1_SYNDIC, input.syndic);
  if (input.sci) {
    const H = p1.getHeight();
    p1.drawRectangle({ x: 25, y: H - 298, width: 545, height: 13, color: ORANGE });
    p1.drawText(
      nettoyerTexte(font, "ÉLIGIBILITÉ CONDITIONNELLE - SCI à vérifier : régime IR requis + associés personnes physiques"),
      { x: 30, y: H - 295, size: 6.5, font, color: BLANC }
    );
  }
  const a = input.audit;
  couvrir(p1, font, P1_AUD_REF, a.reference, FS_SM);
  couvrir(p1, font, P1_AUD_DATE, a.date, FS_SM);
  couvrir(p1, font, P1_AUD_SCEN, a.scenario, 6);
  couvrir(p1, font, P1_AUD_COUT, a.coutTtc, FS_SM);
  couvrir(p1, font, P1_AUD_CLAV, a.classeAvant, FS_SM);
  couvrir(p1, font, P1_AUD_CONAV, a.consoAvant, FS_XS);
  couvrir(p1, font, P1_AUD_CLAP, a.classeApres, FS_SM);
  couvrir(p1, font, P1_AUD_CONAP, a.consoApres, FS_XS);
  couvrir(p1, font, P1_AUD_GAIN, a.gain, FS_SM);
  couvrir(p1, font, P1_AUD_PREST, a.prestataire, FS_XS);
  couvrir(p1, font, P1_AUD_SIRET, a.siret, FS_SM);
  emplacements.push({ signataire: input.signataireSyndic, page: 0, signature: versPdf(p1, P1_SIG_SYNDIC) });
  emplacements.push({
    signataire: input.signataireAuditeur,
    page: 0,
    signature: versPdf(p1, P1_SIG_AUDITEUR),
    faitA: versPdf(p1, P1_AUD_FAITA),
    date: versPdf(p1, P1_AUD_LE),
  });

  // ----- Page 2 : poste n°1 -----
  const [p2] = await out.copyPages(gabarit, [1]);
  out.addPage(p2);
  remplirAdresse(p2, font, P2_ADDR_Y0, input.adresse);
  couvrir(p2, font, P2_BATIMENT, input.batiment, FS_XS);
  const e0 = input.postes[0];
  couvrir(p2, font, P2_E1_DESC, e0.description, FS_SM);
  couvrir(p2, font, P2_E1_NOM, e0.entreprise);
  couvrir(p2, font, P2_E1_SIRET, e0.siret);
  couvrir(p2, font, P2_E1_MONTANT, fmtMontantCerfa(e0.montant));
  emplacements.push({
    signataire: e0.signataire,
    page: 1,
    signature: versPdf(p2, P2_E1_SIG),
    ligneFaitA: versPdf(p2, P2_E1_FAITA),
  });

  // ----- Pages 3+ : 3 postes par page -----
  let restants = input.postes.slice(1);
  let indexPage = 0;
  while (restants.length) {
    const lot = restants.slice(0, 3);
    restants = restants.slice(3);
    const [pg] = await out.copyPages(gabarit, [2]);
    out.addPage(pg);
    const numPage = out.getPageCount() - 1;
    const H = pg.getHeight();
    if (indexPage > 0) {
      pg.drawRectangle({ x: 25, y: H - 32, width: 545, height: 10, color: BANDEAU });
      pg.drawText(nettoyerTexte(font, "FEUILLE COMPLÉMENTAIRE - Suite des autres postes de travaux"), {
        x: 30,
        y: H - 30,
        size: 7,
        font,
        color: BLANC,
      });
    }
    lot.forEach((p, i) => {
      const s = PAGE3_SLOTS[i];
      couvrir(pg, font, [26, s.desc, 562, s.desc + 14], p.description, FS_SM);
      couvrir(pg, font, [130, s.nom - 14, 278, s.nom + 1], p.entreprise);
      couvrir(pg, font, [83, s.siret - 13, 278, s.siret + 1], p.siret);
      couvrir(pg, font, s.montant, fmtMontantCerfa(p.montant));
      emplacements.push({
        signataire: p.signataire,
        page: numPage,
        signature: versPdf(pg, [32, s.sig + 4, 292, s.sig + 46]),
        ligneFaitA: versPdf(pg, [28, s.faitA - 9.5, 280, s.faitA + 3.5]),
      });
    });
    // Postes vides d'une dernière page incomplète : barrés pour éviter un ajout manuscrit.
    for (let i = lot.length; i < 3; i++) {
      const s = PAGE3_SLOTS[i];
      couvrir(pg, font, [26, s.desc, 562, s.desc + 14], "Néant", FS_SM);
    }
    indexPage += 1;
  }

  out.setTitle(nettoyerTexte(font, `CERFA éco-PTZ Performance globale - ${input.batiment}`));
  out.setProducer("Strat Eco Pro");
  out.setCreator("Strat Eco Pro");
  return { bytes: await out.save(), emplacements, pages: out.getPageCount(), total };
}
