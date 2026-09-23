// PDF de la fiche « État de la copropriété » (ANAH), fidèle au modèle : les
// valeurs finales de la fiche (`resolu`, src/lib/ficheEtat.ts) sont écrites
// dans le gabarit public/modeles/fiche-etat-anah.pdf aux cases calibrées dans
// ./ficheEtatCoords, les deux images de l'AMO remplissent les deux premiers
// encadrés et les cadres de signature reçoivent la trace des signatures
// électroniques. Sans les deux signatures, le document est marqué « Projet ».
// Même générateur pour l'espace syndic/AMO et la page publique du président
// du conseil syndical (aperçu avant signature).
import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import { CASES_FICHE, CASES_IMAGES, CASES_SIGNATURES, type CaseFiche } from "./ficheEtatCoords";

export const GABARIT_FICHE_ETAT = "/modeles/fiche-etat-anah.pdf";

export interface SignatureFichePdf {
  role: "president_cs" | "syndic";
  nom: string;
  /** Horodatage ISO de la signature. */
  signeLe: string;
  /** SHA-256 des valeurs de la fiche au moment de la signature. */
  empreinte?: string | null;
}

export interface FicheEtatPdfInput {
  resolu: Record<string, string>;
  images?: { aerienne?: Uint8Array | ArrayBuffer | null; situation?: Uint8Array | ArrayBuffer | null };
  signatures?: SignatureFichePdf[];
  /** Gabarit déjà chargé (tests) ; à défaut récupéré depuis /modeles dans le navigateur. */
  gabarit?: Uint8Array | ArrayBuffer;
  /** Date de génération (défaut : maintenant) - injectable pour les tests. */
  genereLe?: string;
}

const ENCRE = rgb(0.05, 0.12, 0.35);
const GRIS = rgb(0.35, 0.35, 0.35);

function dateHeure(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  // heure de Paris : l'horodatage vient du serveur en UTC
  const paris = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const src = Number.isNaN(paris.getTime()) ? d : paris;
  return `${p(src.getDate())}/${p(src.getMonth() + 1)}/${src.getFullYear()} à ${p(src.getHours())}:${p(src.getMinutes())}`;
}

/** Lettres sans décomposition Unicode, absentes de la police standard. */
const TRANSLITTERATION: Record<string, string> = { Ł: "L", ł: "l", Đ: "D", đ: "d", ı: "i", Ħ: "H", ħ: "h" };

/** Garde les caractères que la police standard sait encoder (WinAnsi), accents décomposés sinon. */
function nettoyer(font: PDFFont, texte: string): string {
  const jeu = new Set(font.getCharacterSet());
  let out = "";
  for (const brut of texte.replace(/[\u00a0\u202f\u2009]/g, " ").replace(/[—–]/g, "-")) {
    const ch = TRANSLITTERATION[brut] ?? brut;
    if (jeu.has(ch.codePointAt(0)!)) out += ch;
    else {
      const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      out += [...base].every((c) => jeu.has(c.codePointAt(0)!)) ? base : "?";
    }
  }
  return out;
}

function couper(font: PDFFont, texte: string, taille: number, largeur: number): string[] {
  const mots = texte.split(/\s+/).filter(Boolean);
  const lignes: string[] = [];
  let cur = "";
  for (const m of mots) {
    const essai = cur ? `${cur} ${m}` : m;
    if (font.widthOfTextAtSize(essai, taille) <= largeur || !cur) cur = essai;
    else {
      lignes.push(cur);
      cur = m;
    }
  }
  if (cur) lignes.push(cur);
  return lignes;
}

/**
 * Écrit une valeur dans sa case : 9 pt, centrée verticalement, réduite
 * jusqu'à 6,5 pt puis répartie sur plusieurs lignes si la case le permet.
 */
function ecrireCase(page: PDFPage, font: PDFFont, brut: string, c: CaseFiche, centre = false) {
  const texte = nettoyer(font, brut.trim());
  if (!texte) return;
  const marge = 4;
  const largeur = c.w - 2 * marge;
  let taille = 9;
  while (taille > 6.5 && font.widthOfTextAtSize(texte, taille) > largeur) taille -= 0.5;
  let lignes = [texte];
  if (font.widthOfTextAtSize(texte, taille) > largeur) {
    lignes = couper(font, texte, taille, largeur);
    const max = Math.max(1, Math.floor((c.h - 2) / (taille + 1.5)));
    if (lignes.length > max) {
      lignes = lignes.slice(0, max);
      let der = lignes[max - 1];
      while (der.length > 1 && font.widthOfTextAtSize(der + "...", taille) > largeur) der = der.slice(0, -1);
      lignes[max - 1] = der + "...";
    }
  }
  const interligne = taille + 1.5;
  const hauteur = lignes.length * interligne - 1.5;
  let y = c.y + (c.h + hauteur) / 2 - taille * 0.92;
  for (const l of lignes) {
    const w = font.widthOfTextAtSize(l, taille);
    page.drawText(l, { x: centre ? c.x + (c.w - w) / 2 : c.x + marge, y, size: taille, font, color: ENCRE });
    y -= interligne;
  }
}

function octets(b: Uint8Array | ArrayBuffer): Uint8Array {
  return b instanceof Uint8Array ? b : new Uint8Array(b);
}

async function poserImage(doc: PDFDocument, page: PDFPage, bytes: Uint8Array | ArrayBuffer, c: CaseFiche) {
  const b = octets(bytes);
  const png = b[0] === 0x89 && b[1] === 0x50;
  const jpg = b[0] === 0xff && b[1] === 0xd8;
  if (!png && !jpg) return;
  const img = png ? await doc.embedPng(b) : await doc.embedJpg(b);
  const marge = 3;
  const echelle = Math.min((c.w - 2 * marge) / img.width, (c.h - 2 * marge) / img.height);
  const w = img.width * echelle;
  const h = img.height * echelle;
  page.drawImage(img, { x: c.x + (c.w - w) / 2, y: c.y + (c.h - h) / 2, width: w, height: h });
}

function cadreSignature(page: PDFPage, font: PDFFont, gras: PDFFont, s: SignatureFichePdf | undefined, c: CaseFiche, cachet?: string) {
  if (!s) {
    page.drawText(nettoyer(font, "En attente de signature électronique"), { x: c.x + 2, y: c.y + c.h - 16, size: 8.5, font, color: GRIS });
    return;
  }
  page.drawRectangle({ x: c.x, y: c.y, width: c.w, height: c.h, borderColor: ENCRE, borderWidth: 0.8 });
  const lignes: { t: string; f: PDFFont; s: number }[] = [
    { t: "Signé électroniquement par", f: font, s: 8 },
    { t: s.nom, f: gras, s: 10 },
    { t: `le ${dateHeure(s.signeLe)}`, f: font, s: 8.5 },
    ...(cachet ? [{ t: cachet, f: gras, s: 8.5 }] : []),
    ...(s.empreinte ? [{ t: `Empreinte des données : ${s.empreinte.slice(0, 24)}...`, f: font, s: 6.5 }] : []),
    { t: "Consentement confirmé par code à usage unique", f: font, s: 6.5 },
  ];
  let y = c.y + c.h - 14;
  for (const l of lignes) {
    let t = nettoyer(l.f, l.t);
    while (t.length > 1 && l.f.widthOfTextAtSize(t, l.s) > c.w - 12) t = t.slice(0, -1);
    page.drawText(t, { x: c.x + 6, y, size: l.s, font: l.f, color: ENCRE });
    y -= l.s + 4;
  }
}

async function chargerGabarit(input: FicheEtatPdfInput): Promise<PDFDocument> {
  if (input.gabarit) return PDFDocument.load(octets(input.gabarit));
  const res = await fetch(GABARIT_FICHE_ETAT);
  if (!res.ok) throw new Error("Gabarit de la fiche État introuvable");
  return PDFDocument.load(await res.arrayBuffer());
}

/** Les deux signatures sont réunies : le PDF n'est plus un projet. */
export function ficheSignee(signatures: SignatureFichePdf[] | undefined): boolean {
  const roles = new Set((signatures ?? []).map((s) => s.role));
  return roles.has("president_cs") && roles.has("syndic");
}

export async function genFicheEtat(input: FicheEtatPdfInput): Promise<Uint8Array> {
  const doc = await chargerGabarit(input);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();

  for (const [cle, c] of Object.entries(CASES_FICHE)) {
    const v = input.resolu[cle];
    if (v) ecrireCase(pages[c.page], font, v, c, cle.startsWith("etiq_"));
  }

  if (input.images?.aerienne) await poserImage(doc, pages[CASES_IMAGES.aerienne.page], input.images.aerienne, CASES_IMAGES.aerienne);
  if (input.images?.situation) await poserImage(doc, pages[CASES_IMAGES.situation.page], input.images.situation, CASES_IMAGES.situation);

  const sig = (r: SignatureFichePdf["role"]) => input.signatures?.find((s) => s.role === r);
  const derniere = pages[CASES_SIGNATURES.syndic.page];
  cadreSignature(derniere, font, gras, sig("president_cs"), CASES_SIGNATURES.president_cs);
  cadreSignature(derniere, font, gras, sig("syndic"), CASES_SIGNATURES.syndic, input.resolu.syndic_nom ? `Pour ${input.resolu.syndic_nom}` : undefined);

  const signee = ficheSignee(input.signatures);
  const genere = input.genereLe ?? new Date().toISOString();
  derniere.drawText(
    nettoyer(font, `Fiche établie avec Strat Eco Pro - édition du ${dateHeure(genere)}${signee ? " - signature électronique simple (code à usage unique, journal de preuve)" : ""}`),
    { x: 36, y: 40, size: 6.5, font, color: GRIS }
  );

  if (!signee) {
    for (const p of pages) {
      p.drawText("PROJET - NON SIGNÉ", {
        x: 95,
        y: 190,
        size: 50,
        font: gras,
        color: rgb(0.8, 0.1, 0.1),
        opacity: 0.12,
        rotate: degrees(40),
      });
    }
  }

  doc.setTitle(nettoyer(font, `Fiche État de la copropriété - ${input.resolu.copro_nom ?? ""}`));
  doc.setProducer("Strat Eco Pro");
  return doc.save();
}

/** Nom du fichier déposé dans le dossier ANAH. */
export function nomFichierFicheEtat(coproNom: string, signee: boolean): string {
  return `Fiche Etat ANAH - ${coproNom}${signee ? " - signee" : " - projet"}.pdf`.replace(/[\\/:*?"<>|]/g, " ");
}
