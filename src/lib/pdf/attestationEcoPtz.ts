// Attestation des montants éligibles à l'éco-PTZ individuel, une par logement
// (02/10/2026). Remise au copropriétaire pour sa banque, avec le CERFA.
// Reprend le modèle utilisé jusqu'ici (attestation BINDER, CITYA RUHL
// SEGESCA) : montants certifiés et signés par le syndic, tableau des postes
// au format du skill ecoptz-individuel-copro (travaux, entreprise, montant
// global de la copropriété, tantièmes, quote-part du client). La case de
// signature, « Fait à » et la date restent vides : la signature électronique
// les remplit au scellement (edge function signature-documents).
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { fmtMontantCerfa } from "@/lib/finance/ecoPtzIndividuel";
import { nettoyerTexte, type EmplacementSignature, type RectPdf } from "./cerfaEcoPtz";

export interface AttestationEcoPtzLigne {
  travaux: string;
  entreprise: string;
  montantCopro: number;
  /** « 210 / 1 000 » ou « plusieurs clés ». */
  tantiemes: string;
  quotePart: number;
}

export interface AttestationEcoPtzInput {
  copro: { nom: string; adresse: string };
  emprunteur: string;
  /** « Lot n°12 (bâtiment A) avec cave n°45 ». */
  logement: string;
  syndic: string;
  audit: { reference: string; scenario: string; gain: string; consoAvant: string; consoApres: string; classeAvant: string; classeApres: string };
  lignes: AttestationEcoPtzLigne[];
  /** Clé du signataire syndic (participant de l'envoi). */
  signataireSyndic: string;
  /** Date d'édition (aperçu) - ISO. */
  editeLe?: string;
}

const A4: [number, number] = [595.28, 841.89];
const MARGE = 46;
const ENCRE = rgb(0.05, 0.12, 0.35);
const NOIR = rgb(0.1, 0.1, 0.1);
const GRIS = rgb(0.4, 0.4, 0.4);
const FOND = rgb(0.93, 0.95, 0.97);
const TRAIT = rgb(0.75, 0.78, 0.82);

function couper(font: PDFFont, texte: string, taille: number, largeur: number): string[] {
  const lignes: string[] = [];
  for (const para of texte.split("\n")) {
    let cur = "";
    for (const m of para.split(/\s+/).filter(Boolean)) {
      const essai = cur ? `${cur} ${m}` : m;
      if (font.widthOfTextAtSize(essai, taille) <= largeur || !cur) cur = essai;
      else {
        lignes.push(cur);
        cur = m;
      }
    }
    lignes.push(cur);
  }
  return lignes;
}

export async function genAttestationEcoPtz(
  input: AttestationEcoPtzInput
): Promise<{ bytes: Uint8Array; emplacements: EmplacementSignature[]; total: number }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const t = (s: string, f: PDFFont = font) => nettoyerTexte(f, s);
  const total = input.lignes.reduce((s, l) => s + l.quotePart, 0);

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - MARGE;
  const largeurUtile = A4[0] - 2 * MARGE;
  const pied = (p: PDFPage) =>
    p.drawText(t("Attestation établie avec Strat Eco Pro - éco-PTZ individuel en copropriété"), {
      x: MARGE,
      y: 28,
      size: 7,
      font,
      color: GRIS,
    });
  pied(page);
  const place = (h: number) => {
    if (y - h < 70) {
      page = doc.addPage(A4);
      pied(page);
      y = A4[1] - MARGE;
    }
  };
  const paragraphe = (texte: string, taille = 9.5, f: PDFFont = font, couleur = NOIR, interligne = 3.5) => {
    for (const l of couper(f, t(texte, f), taille, largeurUtile)) {
      place(taille + interligne);
      page.drawText(l, { x: MARGE, y: y - taille, size: taille, font: f, color: couleur });
      y -= taille + interligne;
    }
  };

  // ----- En-tête -----
  paragraphe("ATTESTATION DE TRAVAUX ÉLIGIBLES À L'ÉCO-PTZ INDIVIDUEL", 14, gras, ENCRE, 4);
  paragraphe("Éco-prêt à taux zéro « Performance énergétique globale » - Métropole", 10, font, ENCRE);
  y -= 10;

  const infos: [string, string][] = [
    ["Copropriété", [input.copro.nom, input.copro.adresse].filter(Boolean).join(" - ")],
    ["Emprunteur", input.emprunteur],
    ["Logement", input.logement],
    ["Syndic de copropriété", input.syndic],
    ["Audit énergétique", [input.audit.reference, input.audit.scenario].filter(Boolean).join(" - ") || "-"],
  ];
  for (const [k, v] of infos) {
    const lignes = couper(font, t(v || "-"), 9.5, largeurUtile - 140);
    place(lignes.length * 13);
    page.drawText(t(k, gras), { x: MARGE, y: y - 9.5, size: 9.5, font: gras, color: NOIR });
    lignes.forEach((l, i) => page.drawText(l, { x: MARGE + 140, y: y - 9.5 - i * 13, size: 9.5, font, color: NOIR }));
    y -= lignes.length * 13 + 2;
  }
  y -= 8;
  paragraphe(
    "Le syndic de la copropriété atteste que la quote-part des travaux de rénovation énergétique de la copropriété, " +
      "réalisés par des entreprises titulaires du signe de qualité RGE et éligibles à l'éco-PTZ, revenant au logement " +
      "ci-dessus s'établit comme suit (*) :"
  );
  y -= 8;

  // ----- Tableau -----
  const cols = [
    { titre: "Travaux", w: 150, align: "g" as const },
    { titre: "Entreprise", w: 105, align: "g" as const },
    { titre: "Montant global copropriété TTC", w: 92, align: "d" as const },
    { titre: "Tantièmes", w: 62, align: "d" as const },
    { titre: "Quote-part éligible à l'éco-PTZ du client", w: largeurUtile - 409, align: "d" as const },
  ];
  const tailleTab = 8.5;
  const cellule = (texte: string, x: number, w: number, yHaut: number, f: PDFFont, align: "g" | "d") => {
    const lignes = couper(f, t(texte, f), tailleTab, w - 8);
    lignes.forEach((l, i) => {
      const lw = f.widthOfTextAtSize(l, tailleTab);
      page.drawText(l, {
        x: align === "d" ? x + w - 4 - lw : x + 4,
        y: yHaut - 11 - i * (tailleTab + 2.5),
        size: tailleTab,
        font: f,
        color: NOIR,
      });
    });
    return lignes.length;
  };
  const hauteurLigne = (valeurs: string[], f: PDFFont) =>
    Math.max(...valeurs.map((v, i) => couper(f, t(v, f), tailleTab, cols[i].w - 8).length)) * (tailleTab + 2.5) + 8;
  const ligneTableau = (valeurs: string[], f: PDFFont, fond?: ReturnType<typeof rgb>) => {
    const h = hauteurLigne(valeurs, f);
    place(h);
    if (fond) page.drawRectangle({ x: MARGE, y: y - h, width: largeurUtile, height: h, color: fond });
    let x = MARGE;
    valeurs.forEach((v, i) => {
      cellule(v, x, cols[i].w, y, f, cols[i].align);
      x += cols[i].w;
    });
    page.drawLine({ start: { x: MARGE, y: y - h }, end: { x: MARGE + largeurUtile, y: y - h }, thickness: 0.5, color: TRAIT });
    y -= h;
  };
  ligneTableau(cols.map((c) => c.titre), gras, FOND);
  for (const l of input.lignes)
    ligneTableau([l.travaux, l.entreprise, `${fmtMontantCerfa(l.montantCopro)} €`, l.tantiemes, `${fmtMontantCerfa(l.quotePart)} €`], font);
  ligneTableau(
    ["TOTAL - Coût total éligible revenant au logement", "", "", "", `${fmtMontantCerfa(total)} €`],
    gras,
    FOND
  );
  y -= 10;

  const a = input.audit;
  const perf = [
    a.gain ? `Gain énergétique : ${a.gain} %` : "",
    a.consoAvant && a.consoApres ? `Cep initial = ${a.consoAvant} kWh/m²/an -> Cep après travaux = ${a.consoApres} kWh/m²/an` : "",
    a.classeAvant && a.classeApres ? `classe ${a.classeAvant} -> ${a.classeApres}` : "",
  ].filter(Boolean);
  paragraphe(
    "(*) Montants certifiés par le syndic de copropriété : travaux retenus du plan de financement définitif (HT après " +
      "remise et TVA), hors honoraires, frais annexes, aléas et audit énergétique, répartis au prorata des tantièmes du " +
      "logement et de ses annexes rattachées, sans arrondi intermédiaire." +
      (perf.length ? ` ${perf.join(" - ")}.` : ""),
    8,
    font,
    GRIS,
    2.5
  );

  // ----- Signature du syndic -----
  place(120);
  y -= 18;
  page.drawText(t("Fait à"), { x: MARGE, y: y - 10, size: 10, font, color: NOIR });
  const faitA: RectPdf = { x: MARGE + 32, y: y - 13, w: 180, h: 14 };
  page.drawLine({ start: { x: faitA.x, y: faitA.y + 1 }, end: { x: faitA.x + faitA.w, y: faitA.y + 1 }, thickness: 0.4, color: TRAIT });
  page.drawText(t(", le"), { x: faitA.x + faitA.w + 4, y: y - 10, size: 10, font, color: NOIR });
  const date: RectPdf = { x: faitA.x + faitA.w + 26, y: y - 13, w: 110, h: 14 };
  page.drawLine({ start: { x: date.x, y: date.y + 1 }, end: { x: date.x + date.w, y: date.y + 1 }, thickness: 0.4, color: TRAIT });
  y -= 30;
  page.drawText(t(`Pour ${input.syndic || "le syndic de copropriété"},`, gras), { x: MARGE, y: y - 10, size: 10, font: gras, color: NOIR });
  y -= 18;
  const signature: RectPdf = { x: MARGE, y: y - 58, w: 260, h: 56 };
  page.drawRectangle({ x: signature.x, y: signature.y, width: signature.w, height: signature.h, borderColor: TRAIT, borderWidth: 0.6 });
  page.drawText(t("Signature du syndic"), { x: signature.x + 6, y: signature.y + signature.h - 12, size: 7.5, font, color: GRIS });

  if (input.editeLe) {
    const d = new Date(input.editeLe);
    page.drawText(t(`Édition du ${d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}`), {
      x: A4[0] - MARGE - 90,
      y: 28,
      size: 7,
      font,
      color: GRIS,
    });
  }

  doc.setTitle(t(`Attestation éco-PTZ individuel - ${input.emprunteur} - ${input.copro.nom}`));
  doc.setProducer("Strat Eco Pro");
  doc.setCreator("Strat Eco Pro");
  const pageSignature = doc.getPageCount() - 1;
  return {
    bytes: await doc.save(),
    emplacements: [{ signataire: input.signataireSyndic, page: pageSignature, signature, faitA, date }],
    total,
  };
}
