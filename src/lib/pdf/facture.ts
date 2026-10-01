// PDF des factures et avoirs (0115) - demande d'Amir du 28/09/2026.
//
// Reproduction du modèle de l'ancien outil (FAC00000765, FAC00000758) : même
// fond (bandeau beige, cartouches émetteur et client) et même logo, repris
// du PDF d'origine (public/modeles/facture), textes placés aux coordonnées
// relevées sur le modèle. Généré avec pdf-lib côté client : l'aperçu du
// brouillon (mention BROUILLON, sans numéro) et le PDF définitif, classé
// dans les fichiers de la copropriété et joint à l'e-mail, sortent du même
// code. En mode test, la pièce porte « Document de test - sans valeur ».
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import {
  EMETTEUR,
  MENTIONS_RETARD,
  MENTION_TYPE_VENTE,
  dateFr,
  euros,
  libelleType,
  lignesClient,
  montantEnLettres,
  quantite,
  tauxTva,
  type PieceFacture,
} from "@/lib/factureDoc";

const A4 = { w: 595.28, h: 841.88 };

// couleurs relevées sur le modèle
const GRIS = rgb(0.38039, 0.38039, 0.38039);
const GRIS_FONCE = rgb(0.21176, 0.21176, 0.21176);
const GRIS_INFO = rgb(0.54118, 0.53333, 0.53333);
const GRIS_TETE = rgb(0.36471, 0.36471, 0.36471);
const GRIS_TVA = rgb(0.9098, 0.9098, 0.9098);
const BEIGE = rgb(0.71765, 0.67059, 0.53725);
const BEIGE_CLAIR = rgb(0.9451, 0.93333, 0.90588);
const BLANC = rgb(1, 1, 1);
const ROUGE = rgb(0.78, 0.12, 0.12);

export interface ImagesFacture {
  fond: ArrayBuffer | Uint8Array | null;
  logo: ArrayBuffer | Uint8Array | null;
}

export interface OptionsFacturePdf {
  /** Numéro et date de la facture annulée, pour un avoir. */
  origine?: { numero: string | null; date_emission: string | null } | null;
  /** Fond et logo du modèle ; chargés depuis /modeles/facture à défaut. */
  images?: ImagesFacture;
}

async function lire(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url);
    return r.ok ? await r.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export const chargerImagesFacture = async (): Promise<ImagesFacture> => {
  const [fond, logo] = await Promise.all([lire("/modeles/facture/fond-facture.png"), lire("/modeles/facture/logo-facture.png")]);
  return { fond, logo };
};

/** Helvetica (WinAnsi) : les espaces fines d'Intl ne sont pas encodables. */
const propre = (s: string) => s.replace(/[  ]/g, " ").replace(/[–—]/g, "-");

class Page {
  constructor(
    readonly page: PDFPage,
    readonly font: PDFFont,
    readonly bold: PDFFont,
    readonly boldOblique: PDFFont
  ) {}

  texte(s: string, x: number, y: number, size: number, color: RGB = GRIS, font: PDFFont = this.font) {
    this.page.drawText(propre(s), { x, y, size, font, color });
  }

  /** Texte aligné à droite sur x. */
  droite(s: string, x: number, y: number, size: number, color: RGB = GRIS, font: PDFFont = this.font) {
    const t = propre(s);
    this.page.drawText(t, { x: x - font.widthOfTextAtSize(t, size), y, size, font, color });
  }

  largeur(s: string, size: number, font: PDFFont = this.font) {
    return font.widthOfTextAtSize(propre(s), size);
  }

  rect(x0: number, y0: number, x1: number, y1: number, color: RGB) {
    this.page.drawRectangle({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, color });
  }

  /** Paragraphe coupé à la largeur donnée ; renvoie la position sous la dernière ligne. */
  paragraphe(s: string, x: number, y: number, size: number, largeur: number, interligne: number, color: RGB = GRIS): number {
    const mots = propre(s).split(" ");
    let ligne = "";
    for (const mot of mots) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (ligne && this.font.widthOfTextAtSize(essai, size) > largeur) {
        this.page.drawText(ligne, { x, y, size, font: this.font, color });
        y -= interligne;
        ligne = mot;
      } else ligne = essai;
    }
    if (ligne) {
      this.page.drawText(ligne, { x, y, size, font: this.font, color });
      y -= interligne;
    }
    return y;
  }
}

/** Taille de police qui fait tenir le texte dans la largeur, sans passer sous le minimum. */
function tailleQuiTient(font: PDFFont, s: string, taille: number, largeur: number, min = 7): number {
  let t = taille;
  while (t > min && font.widthOfTextAtSize(propre(s), t) > largeur) t -= 0.25;
  return t;
}

export async function genererFacturePdf(p: PieceFacture, options: OptionsFacturePdf = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const brouillon = p.statut === "brouillon";
  const avoir = p.type === "avoir";
  doc.setTitle(`${libelleType(p.type)} ${p.numero ?? "brouillon"} - ${p.client_nom}`);
  doc.setAuthor("Strat Eco");
  doc.setCreator("Strat Eco pro");

  const page = doc.addPage([A4.w, A4.h]);
  const [font, bold, boldOblique] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaBoldOblique),
  ]);
  const f = new Page(page, font, bold, boldOblique);
  const images = options.images ?? (await chargerImagesFacture());

  // fond du modèle : bandeau beige, cartouches émetteur et client
  let fond: PDFImage | null = null;
  let logo: PDFImage | null = null;
  try {
    if (images.fond) fond = await doc.embedPng(images.fond);
    if (images.logo) logo = await doc.embedPng(images.logo);
  } catch {
    fond = null;
    logo = null;
  }
  if (fond) page.drawImage(fond, { x: 0, y: 0, width: A4.w, height: A4.h });
  else {
    f.rect(0, 772, A4.w, A4.h, BEIGE);
    f.rect(170.6, 723, 370.2, 731.6, BEIGE);
    f.rect(170.6, 631.9, 370.2, 723, rgb(0.949, 0.949, 0.949));
    f.rect(381.8, 723, 580.3, 731.6, BEIGE);
    f.rect(381.8, 631.9, 580.3, 723, rgb(0.949, 0.949, 0.949));
  }
  if (logo) page.drawImage(logo, { x: 411.9, y: 789.83, width: 116.93, height: 42.53 });

  // bandeau : coordonnées de l'émetteur
  f.texte(`Tél. : ${EMETTEUR.tel}`, 129.75, 829.76, 9, BLANC);
  f.texte(`Email : ${EMETTEUR.email}`, 129.75, 816.26, 9, BLANC);

  // titre et informations de la pièce
  f.texte(libelleType(p.type), 24.75, 736.13, 31.5, GRIS);
  f.texte(`N° : ${brouillon ? "attribué à la validation" : p.numero}`, 27.75, 714.86, 9, GRIS_INFO);
  f.texte(`Date d'émission : ${brouillon ? "à la validation" : dateFr(p.date_emission)}`, 27.75, 701.36, 9, GRIS_INFO);
  f.texte("N° TVA : NC", 27.75, 687.86, 9, GRIS_INFO);
  f.texte(`N° client : ${p.client_numero ?? (brouillon ? "attribué à la validation" : "")}`, 27.75, 674.36, 9, GRIS_INFO);

  // cartouche émetteur
  f.texte(EMETTEUR.titre, 177.75, 715.2, 11.25, BLANC, bold);
  EMETTEUR.adresse.forEach((l, i) => f.texte(l, 177, 693.26 - i * 13.5, 9));
  f.texte(`Siret : ${EMETTEUR.siret}`, 177, 648.26, 9);

  // cartouche client
  const tailleNom = tailleQuiTient(bold, p.client_nom, p.nature === "cee" ? 11.25 : 9, 188);
  f.texte(p.client_nom, 387, p.nature === "cee" ? 715.2 : 717.56, tailleNom, BLANC, bold);
  const { lignes: lignesCli, adresseManquante } = lignesClient(p);
  const adresseCli = adresseManquante && p.client_pa
    ? [lignesCli[0], "Adresse du syndic à compléter", ...lignesCli.slice(1)]
    : lignesCli;
  adresseCli.slice(0, 5).forEach((l, i) => {
    const manquante = adresseManquante && l === "Adresse du syndic à compléter";
    f.texte(l, 382.65, 698.36 - i * 13.5, tailleQuiTient(font, l, 9, 192), manquante ? ROUGE : GRIS);
  });

  // références ; sans seconde ligne (factures CEE), le tableau remonte d'autant
  f.texte(`Réf. : ${p.reference}`, 28.35, 575.7, tailleQuiTient(font, `Réf. : ${p.reference}`, 9, 548));
  if (p.sous_reference) f.texte(p.sous_reference, 28.35, 553.05, tailleQuiTient(font, p.sous_reference, 9, 548));
  const haut = p.sous_reference ? 539.96 : 562.61;

  // tableau des lignes
  f.rect(29.1, haut - 22.68, 579.53, haut, GRIS_TETE);
  const yTete = haut - 15.49;
  f.texte("Libellé", 35.85, yTete, 12, BLANC);
  f.droite("Qté", 302.4, yTete, 12, BLANC);
  f.droite("PU HT", 389.3, yTete, 12, BLANC);
  f.droite("Montant HT", 507.6, yTete, 12, BLANC);
  f.droite("TVA", 572, yTete, 12, BLANC);

  let y = haut - 34.5;
  let derniere = y;
  for (const l of p.lignes) {
    f.texte(`${l.code} -${l.libelle}`, 34.35, y, tailleQuiTient(font, `${l.code} -${l.libelle}`, 9, 225));
    f.droite(quantite(l.quantite), 302.4, y, 9);
    f.droite(euros(l.pu_ht), 389.3, y, 9);
    f.droite(euros(l.montant_ht), 507.6, y, 9);
    f.droite(tauxTva(l.taux_tva), 572, y, 9);
    derniere = y;
    if (l.detail) {
      derniere = y - 10.5;
      f.texte(l.detail, 34.35, derniere, tailleQuiTient(font, l.detail, 9, 225));
    }
    y = derniere - 15;
  }
  f.texte(MENTION_TYPE_VENTE, 28.35, derniere - 30.04, 6);

  // séparateur beige
  f.rect(28.35, 345.97, 581.1, 346.72, BEIGE);

  // détail de la TVA
  f.rect(29.1, 324.22, 292.95, 341.63, BEIGE_CLAIR);
  f.texte("Détail de la TVA", 34.35, 329.81, 9, GRIS_FONCE);
  f.texte("Code", 34.35, 312.41, 9, GRIS, bold);
  f.droite("Base HT", 145, 312.41, 9, GRIS, bold);
  f.droite("Taux", 208.5, 312.41, 9, GRIS, bold);
  f.droite("Montant", 282.6, 312.41, 9, GRIS, bold);
  f.texte("Normale", 34.35, 296.51, 9);
  f.droite(euros(p.total_ht), 145, 296.51, 9);
  f.droite(tauxTva(p.lignes[0]?.taux_tva ?? 20), 208.5, 296.51, 9);
  f.droite(euros(p.total_tva), 282.6, 296.51, 9);

  // règlement et échéance (un avoir rappelle la facture qu'il annule)
  f.rect(29.1, 267.52, 117.15, 284.92, BEIGE_CLAIR);
  f.rect(29.1, 250.13, 117.15, 267.52, BEIGE_CLAIR);
  if (avoir) {
    const o = options.origine;
    f.texte("Facture", 34.35, 273.11, 9, GRIS_FONCE);
    f.texte(o?.numero ? `n° ${o.numero} du ${dateFr(o.date_emission)}` : "-", 122.4, 272.36, 9);
    f.texte("Règlement", 34.35, 255.71, 9, GRIS_FONCE);
    f.texte("Déduit ou remboursé par virement", 122.4, 254.96, 9);
  } else {
    f.texte("Règlement", 34.35, 273.11, 9, GRIS_FONCE);
    f.texte("Virement", 122.4, 272.36, 9);
    f.texte("Echéance(s)", 34.35, 255.71, 9, GRIS_FONCE);
    f.texte(brouillon ? `${euros(p.total_ttc)} à 30 jours de la validation` : `${euros(p.total_ttc)} au ${dateFr(p.date_echeance)}`, 122.4, 254.96, 9);
  }

  // coordonnées bancaires
  f.rect(29.1, 225.22, 381.38, 242.63, BEIGE_CLAIR);
  f.texte("Coordonnées bancaires", 34.35, 230.81, 9, GRIS_FONCE);
  f.texte("Nom", 34.35, 213.41, 9, GRIS, bold);
  f.texte(EMETTEUR.banque.nom, 96.26, 213.41, 9);
  f.texte("IBAN", 34.35, 197.51, 9, GRIS, bold);
  f.texte(EMETTEUR.banque.iban, 96.26, 197.51, 9);
  f.texte("BIC", 34.35, 181.61, 9, GRIS, bold);
  f.texte(EMETTEUR.banque.bic, 96.26, 181.61, 9);

  // totaux
  f.rect(388.39, 324.83, 580.35, 341.63, BLANC);
  f.texte("Total HT", 393.64, 330.11, 9);
  f.droite(euros(p.total_ht), 572, 330.11, 9);
  f.rect(388.39, 308.02, 580.35, 324.83, GRIS_TVA);
  f.texte("TVA", 393.64, 313.31, 9);
  f.droite(euros(p.total_tva), 572, 313.31, 9);
  f.rect(388.39, 286.13, 580.35, 308.02, BEIGE);
  f.texte("Total TTC", 395.14, 292.91, 12, BLANC, boldOblique);
  f.droite(euros(p.total_ttc), 572, 292.91, 12, BLANC, boldOblique);

  // montant en lettres et mentions
  f.texte(
    `${avoir ? "Le montant total de l'avoir s'élève à" : "Le montant total s'élève à"} ${montantEnLettres(p.total_ttc)}`,
    28.35, 155.85, 6.75
  );
  if (!avoir) {
    let ym = 124.27;
    for (const m of MENTIONS_RETARD) ym = f.paragraphe(m, 28.35, ym, 6, 540, 9.6);
  }

  // pied de page légal, centré
  f.texte(EMETTEUR.piedDePage, (A4.w - f.largeur(EMETTEUR.piedDePage, 7.5)) / 2, 28.24, 7.5);

  // brouillon et test : jamais confondus avec une vraie pièce
  if (brouillon) {
    page.drawText("BROUILLON", {
      x: 120, y: 330, size: 96, font: bold, color: rgb(0.8, 0.8, 0.8), opacity: 0.35, rotate: degrees(35),
    });
  }
  if (p.test) {
    const m = "DOCUMENT DE TEST - SANS VALEUR, NE PAS RÉGLER";
    f.texte(m, 177, 746, tailleQuiTient(bold, m, 10, 400), ROUGE, bold);
    if (!brouillon) {
      page.drawText("TEST", { x: 190, y: 380, size: 110, font: bold, color: ROUGE, opacity: 0.12, rotate: degrees(35) });
    }
  }

  return doc.save();
}
