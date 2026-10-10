// Génération des documents d'adhésion au prêt collectif éco-PTZ :
// bulletin d'adhésion CEGEE (un par lot principal) et mandat de prélèvement
// SEPA (un par bulletin), tous deux signés électroniquement depuis le portail
// (Portail/Adhesion.tsx). Débranchés du 22/09 au 08/10/2026, le temps où la
// souscription passait par la seule banque. Les gabarits (public/modeles/) sont
// calibrés au rectangle (./coords) ; la mention de signature du mandat est
// apposée côté serveur (signature-flux), dans la case « Signature(s) ».
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { BULLETIN_COORDS, SEPA_COORDS, type TextSpot } from "./coords";

export type SituationMatrimoniale = "mariee" | "divorcee" | "pacsee" | "veuve" | "celibataire";

export interface Adherent {
  nomPrenom: string;
  nomNaissance: string;
  dateLieuNaissance: string;
  profession: string;
  professionDepuis: string;
  situation: SituationMatrimoniale;
  situationDepuis: string;
}

export interface AdhesionForm {
  adherent1: Adherent;
  adherent2: Adherent | null;
  adresse: string;
  cp: string;
  ville: string;
  telDomicile: string;
  telBureau: string;
  portable: string;
  email: string;
  montantType: "100" | "autre";
  montantAutre: string;
  lieuSignature: string;
}

export interface BulletinContexte {
  adresseImmeuble: string;
  nomSyndic: string;
  interlocuteur: string;
  lotNum: string;
  tantiemes: string;
}

const INK = rgb(0.08, 0.08, 0.35);

// WinAnsi (Helvetica standard) : on remplace les caractères hors plage
const sanitize = (s: string): string =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\xFF]/g, "?");

function drawSpot(page: PDFPage, font: PDFFont, value: string | undefined, spot: TextSpot) {
  if (!value) return;
  let v = sanitize(value);
  if (spot.max && v.length > spot.max) v = v.slice(0, spot.max - 1) + "…".replace("…", "...").slice(0, 1);
  page.drawText(v, { x: spot.x, y: spot.y, size: spot.size ?? 9, font, color: INK });
}

function drawX(page: PDFPage, font: PDFFont, spot: { x: number; y: number }) {
  page.drawText("X", { x: spot.x, y: spot.y, size: 9, font, color: INK });
}

async function loadTemplate(path: string): Promise<PDFDocument> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Gabarit introuvable : ${path}`);
  return PDFDocument.load(await res.arrayBuffer());
}

function drawAdherent(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  a: Adherent,
  c: typeof BULLETIN_COORDS.a1 | typeof BULLETIN_COORDS.a2
) {
  drawSpot(page, font, a.nomPrenom, c.nomPrenom);
  drawSpot(page, font, a.nomNaissance, c.nomNaissance);
  drawSpot(page, font, a.dateLieuNaissance, c.dateLieuNaissance);
  drawSpot(page, font, a.profession, c.profession);
  drawSpot(page, font, a.professionDepuis, c.professionDepuis);
  drawX(page, fontBold, c.cases[a.situation]);
  if (a.situation !== "celibataire") drawSpot(page, font, a.situationDepuis, c.situationDepuis);
}

/**
 * Bulletin d'adhésion pré-rempli pour UN lot principal.
 * `signaturePng` (dataURL) : apposée pour l'adhérent 1 (et 2 si `signature2Png`),
 * avec horodatage sous l'image - signature électronique simple.
 */
export async function genBulletin(
  form: AdhesionForm,
  ctx: BulletinContexte,
  date: Date,
  signaturePng?: string | null,
  signature2Png?: string | null
): Promise<Uint8Array> {
  const doc = await loadTemplate("/modeles/bulletin-adhesion-cegee.pdf");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const p = doc.getPage(0);
  const C = BULLETIN_COORDS;

  drawSpot(p, font, ctx.adresseImmeuble, C.adresseImmeuble);
  drawSpot(p, font, ctx.nomSyndic, C.nomSyndic);
  drawSpot(p, font, ctx.interlocuteur, C.interlocuteur);

  drawAdherent(p, font, fontBold, form.adherent1, C.a1);
  if (form.adherent2) drawAdherent(p, font, fontBold, form.adherent2, C.a2);

  drawSpot(p, font, "Lot n°" + ctx.lotNum, C.lots);
  drawSpot(p, font, ctx.tantiemes + " / 1000", C.tantiemes);
  drawSpot(p, font, form.adresse, C.adresse);
  drawSpot(p, font, form.cp, C.cp);
  drawSpot(p, font, form.ville, C.ville);
  drawSpot(p, font, form.telDomicile, C.telDomicile);
  drawSpot(p, font, form.telBureau, C.telBureau);
  drawSpot(p, font, form.portable, C.portable);
  drawSpot(p, font, form.email, C.email);

  if (form.montantType === "100") drawX(p, fontBold, C.case100);
  else {
    drawX(p, fontBold, C.caseAutre);
    drawSpot(p, font, form.montantAutre + " EUR", C.montantAutre);
  }

  drawSpot(p, font, form.lieuSignature, C.faitA);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  drawSpot(p, font, dd, C.dateJJ);
  drawSpot(p, font, mm, C.dateMM);
  drawSpot(p, font, String(date.getFullYear()), C.dateAAAA);

  const horodatage = `Signé électroniquement le ${dd}/${mm}/${date.getFullYear()} à ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const stampSig = async (dataUrl: string, zone: { x: number; y: number; w: number; h: number }) => {
    const png = await doc.embedPng(dataUrl);
    const scale = Math.min(zone.w / png.width, zone.h / png.height);
    p.drawImage(png, {
      x: zone.x,
      y: zone.y + 10,
      width: png.width * scale,
      height: png.height * scale,
    });
    p.drawText(sanitize(horodatage), { x: zone.x, y: zone.y, size: 5.5, font, color: rgb(0.35, 0.35, 0.35) });
  };
  if (signaturePng) await stampSig(signaturePng, C.a1.signature);
  if (signature2Png && form.adherent2) await stampSig(signature2Png, C.a2.signature);

  return doc.save();
}

/** Un caractère centré dans une case de largeur `w` dont le bord gauche est en `x`. */
function drawInBox(page: PDFPage, font: PDFFont, ch: string, x: number, w: number, y: number, size: number) {
  const cw = font.widthOfTextAtSize(ch, size);
  page.drawText(ch, { x: x + (w - cw) / 2, y, size, font, color: INK });
}

/**
 * Nom du débiteur du mandat SEPA (case « Nom / Prénoms du débiteur ») : nom puis prénom à la
 * suite du titulaire du compte, soit le signataire principal (retour de A CHELGHAM, 10/10/2026 :
 * seul « CHELGHAM » était imprimé). Le champ libre « Nom et prénom » du bulletin n'est qu'un
 * repli, car il arrive incomplet ; il n'est utilisé qu'à défaut de nom et de prénom du signataire.
 *   { nom: « CHELGHAM », prenom: « Amir » } → « CHELGHAM Amir »
 */
export function nomDebiteurMandat(
  principal: { nom?: string | null; prenom?: string | null },
  repli = ""
): string {
  const nom = (principal.nom ?? "").trim();
  const prenom = (principal.prenom ?? "").trim();
  if (nom && prenom) return `${nom} ${prenom}`;
  return nom || prenom || repli.trim();
}

const sansAccent = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const motsDe = (s: string): string[] => sansAccent(s).split(/[\s'’-]+/).filter(Boolean);

/**
 * « Nom et prénom » de l'adhérent 1 imprimé sur le bulletin : toujours le nom PUIS le prénom
 * (retour de A CHELGHAM, 10/10/2026 : « il faut mettre Chelgham Amir, nom et prénom »). Le champ
 * libre est gardé tel quel s'il contient déjà le nom en tête et le prénom (prénoms composés
 * conservés) ; sinon il est complété ou remis dans l'ordre d'après le nom et le prénom du
 * signataire principal, qui est l'adhérent 1. Sans nom ou sans prénom connu, rien n'est changé.
 *   « CHELGHAM »      + { CHELGHAM, Amir } → « CHELGHAM Amir »
 *   « Amir CHELGHAM » + { CHELGHAM, Amir } → « CHELGHAM Amir »
 *   « DUPONT Jean-Pierre » + { DUPONT, Jean-Pierre } → inchangé
 */
export function nomPrenomComplet(
  saisie: string,
  principal: { nom?: string | null; prenom?: string | null }
): string {
  const brut = saisie.trim();
  const nom = (principal.nom ?? "").trim();
  const prenom = (principal.prenom ?? "").trim();
  if (!nom || !prenom) return brut;
  const mots = motsDe(brut);
  const motsNom = motsDe(nom);
  const contientPrenom = motsDe(prenom).every((m) => mots.includes(m));
  const nomEnTete = motsNom.every((m, i) => mots[i] === m);
  return contientPrenom && nomEnTete ? brut : `${nom} ${prenom}`;
}

/** Mandat SEPA pré-rempli, sans signature : déposé sur le bulletin, il est signé
 *  avec le même code que lui et la mention de signature est apposée au scellement. */
export async function genMandatSepa(input: {
  nom: string;
  rue: string;
  cp: string;
  ville: string;
  iban: string;
  bic: string;
  lieu: string;
  date: Date;
}): Promise<Uint8Array> {
  const doc = await loadTemplate("/modeles/mandat-sepa-cegee.pdf");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const p = doc.getPage(0);
  const C = SEPA_COORDS;

  drawSpot(p, font, input.nom, C.nom);
  drawSpot(p, font, input.rue, C.rue);
  // Code postal : 5 cases - on ne garde que les chiffres
  [...input.cp.replace(/\D/g, "")].slice(0, C.cp.xs.length).forEach((ch, i) =>
    drawInBox(p, fontBold, ch, C.cp.xs[i], C.cp.w, C.cp.y, C.cp.size)
  );
  drawSpot(p, font, input.ville, C.ville);
  drawSpot(p, font, "FRANCE", C.pays);

  const iban = normalizeIban(input.iban);
  const casesDeLIban = casesIban(iban.length, C.iban.xs.length);
  [...iban].forEach((ch, i) => {
    const k = casesDeLIban[i];
    if (k !== undefined) drawInBox(p, fontBold, sanitize(ch), C.iban.xs[k], C.iban.w, C.iban.y, C.iban.size);
  });
  const bic = input.bic.replace(/\s/g, "").toUpperCase();
  [...bic].slice(0, C.bic.xs.length).forEach((ch, i) =>
    drawInBox(p, fontBold, sanitize(ch), C.bic.xs[i], C.bic.w, C.bic.y, C.bic.size)
  );

  // Coche « paiement récurrent » : petit carré, croix ajustée à sa taille
  drawInBox(p, fontBold, "X", C.caseRecurrent.x, C.caseRecurrent.w, C.caseRecurrent.y + 0.6, 5);
  drawSpot(p, font, input.lieu, C.lieu);
  const d = input.date;
  const digits =
    String(d.getDate()).padStart(2, "0") + String(d.getMonth() + 1).padStart(2, "0") + String(d.getFullYear());
  [...digits].forEach((ch, i) => {
    // masque la lettre-repère (J, M, A) imprimée dans la case, sans toucher au cadre
    p.drawRectangle({
      x: C.dateDigits.xs[i] + 1,
      y: C.dateDigits.boxY + 1,
      width: C.dateDigits.w - 2,
      height: C.dateDigits.boxH - 2,
      color: rgb(1, 1, 1),
    });
    drawInBox(p, fontBold, ch, C.dateDigits.xs[i], C.dateDigits.w, C.dateDigits.y, C.dateDigits.size);
  });

  return doc.save();
}

// ========== IBAN ==========

/**
 * Case du gabarit TRA929 où écrire chaque caractère d'un IBAN (retour de A CHELGHAM,
 * 09/10/2026 : « le RIB est mal cadré, les espaces ne sont pas respectés »). La grille compte
 * 33 cases dont une sur cinq est volontairement non cadrée : un IBAN s'y écrit par groupes de
 * 4 caractères séparés par une case vide (FR76 _ 1027 _ 8010 _ 1100 _ 0208 _ 4670 _ 197, soit
 * 27 caractères + 6 espaces = 33). Un IBAN de plus de 27 caractères ne tient plus ainsi : il
 * est alors écrit à la suite, sans espaces. `nbCases` est la taille de la grille.
 */
export function casesIban(longueur: number, nbCases = 33): number[] {
  const avecEspaces = longueur + Math.ceil(longueur / 4) - 1;
  return Array.from({ length: longueur }, (_, i) => (avecEspaces <= nbCases ? i + Math.floor(i / 4) : i));
}

export const normalizeIban = (raw: string): string => raw.replace(/\s/g, "").toUpperCase();

/** Validation IBAN (format + clé mod 97). */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  // un IBAN français compte exactement 27 caractères (FR76 + 5 blocs de 4 + 1 bloc de 3)
  if (iban.startsWith("FR") && iban.length !== 27) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

export const isValidBic = (raw: string): boolean =>
  /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(raw.replace(/\s/g, "").toUpperCase());
