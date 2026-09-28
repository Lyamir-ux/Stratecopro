// PDF du Contrat AMO Copropriété revalorisé - demande d'Amir 28/09/2026.
// Après « Revaloriser la P2 » (bloc Honoraires de la fiche, 0112), un bouton
// placé sous celui-ci télécharge le nouveau devis. Même contrat que le skill
// devis-amo (Contrat_AMO_[Copro]_V1.docx) : 2 phases, règlement 50/25/25 et
// 50/30/20, A4 noir et blanc, texte des articles repris tel quel. Les 10
// questions du skill sont remplies depuis le dossier :
//   1-4  nom, adresse, syndic (sinon l'enseigne rattachée), nombre de lots ;
//   5-6  chargé d'affaire = chef de projet du dossier, e-mail de son compte
//        AMO (devis_amo_chef_projet, 0114), sinon contact@strateco.fr ;
//   7    téléphone du bureau pour tous ;
//   8-9  P1 = P1a + P1b + P1c, P2 = montant revalorisé ;
//   10   n° = initiales du chef de projet + AAAA-MM de la revalorisation +
//        version (V2 à la 1re revalorisation, V3 à la suivante…).
// Les honoraires CEE n'y figurent pas (choix d'Amir). Généré de zéro avec
// pdf-lib, côté client.
// Retour d'Amir 28/09/2026 : si P1a, P1b et P1c sont déjà facturés (ou
// encaissés), un encadré bien visible sous le tableau des honoraires l'indique
// (« La phase 1 a déjà été facturée ») ; facturés en partie, il dit lesquels.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import { libelleJalon, type JalonHonoraires } from "@/lib/facturation";

export const TEL_BUREAU = "03.65.67.13.54";
export const EMAIL_CONTACT = "contact@strateco.fr";
export const TAUX_TVA = 0.2;

export interface DevisAmoPdfInput {
  nomCopropriete: string;
  /** Adresse complète : rue, code postal, ville. */
  adresse: string | null;
  nomSyndic: string | null;
  nbLots: number | null;
  chargeAffaire: string | null;
  emailChargeAffaire: string | null;
  telChargeAffaire: string | null;
  /** Phase 1 - Études, tranche ferme (€ HT) ; 0 = « À définir ». */
  honPhase1HT: number;
  /** Phase 2 - Travaux, tranche conditionnelle (€ HT) ; 0 = « À définir ». */
  honPhase2HT: number;
  refContrat: string;
  /** JJ/MM/AAAA */
  dateContrat: string;
  /** Jalons de la phase 1 déjà facturés ; null si aucun. */
  phase1DejaFacturee?: Phase1Facturee | null;
}

export interface Phase1Facturee {
  /** Tous les jalons de la phase 1 qui ont un montant sont facturés ou encaissés. */
  totale: boolean;
  factures: string[];
  montantFactureHt: number;
  restants: string[];
  montantRestantHt: number;
}

// ---------- données du contrat ----------

const arrondi2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** « Cyrielle MILEKIC » → CM, « Radia » → RA : même règle que les initiales des profils. */
export function initialesDe(nom: string | null | undefined): string {
  const mots = sansAccents(nom ?? "")
    .replace(/[^A-Za-z\s-]/g, "")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (mots.length === 0) return "";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

/** Version du devis : le contrat d'origine est la V1, chaque revalorisation active ajoute une version. */
export const versionDevis = (nbRevalorisations: number): number => Math.max(2, nbRevalorisations + 1);

/** « RA-2026-09-V2 » ; sans initiales, « 2026-09-V2 ». */
export function referenceContrat(initiales: string | null, date: Date, version: number): string {
  const base = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-V${version}`;
  return initiales ? `${initiales}-${base}` : base;
}

const dateJJMMAAAA = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

export interface MontantsPhase {
  ht: number;
  tva: number;
  ttc: number;
}

/** Honoraires du contrat, TVA 20 % au centime. */
export function montantsDevis(p1Ht: number, p2Ht: number): { p1: MontantsPhase; p2: MontantsPhase; total: MontantsPhase } {
  const phase = (ht: number): MontantsPhase => {
    const h = arrondi2(Math.max(0, ht || 0));
    const tva = arrondi2(h * TAUX_TVA);
    return { ht: h, tva, ttc: arrondi2(h + tva) };
  };
  const p1 = phase(p1Ht);
  const p2 = phase(p2Ht);
  return {
    p1,
    p2,
    total: { ht: arrondi2(p1.ht + p2.ht), tva: arrondi2(p1.tva + p2.tva), ttc: arrondi2(p1.ttc + p2.ttc) },
  };
}

/**
 * Facturation de la phase 1 : P1a, P1b, P1c facturés ou encaissés (un jalon
 * sans montant ne compte pas). null tant qu'aucun n'est facturé.
 */
export function phase1Facturee(jalonsP1: Pick<JalonHonoraires, "code" | "montant" | "etat">[]): Phase1Facturee | null {
  const avecMontant = jalonsP1.filter((j) => j.montant != null && j.montant > 0);
  const factures = avecMontant.filter((j) => j.etat === "facture" || j.etat === "encaisse");
  if (factures.length === 0) return null;
  const restants = avecMontant.filter((j) => !factures.includes(j));
  const somme = (l: typeof avecMontant) => arrondi2(l.reduce((t, j) => t + (j.montant ?? 0), 0));
  return {
    totale: restants.length === 0,
    factures: factures.map((j) => libelleJalon(j.code)),
    montantFactureHt: somme(factures),
    restants: restants.map((j) => libelleJalon(j.code)),
    montantRestantHt: somme(restants),
  };
}

/** « P1a », « P1a et P1b », « P1a, P1b et P1c ». */
const enumerer = (l: string[]) => (l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} et ${l[l.length - 1]}`);

export interface EntreeDevisRevalorise {
  copro: {
    name: string;
    adresse: string | null;
    code_postal: string | null;
    city: string | null;
    syndic_name: string | null;
    organisation: { nom: string } | null;
    chef_projet: string | null;
  };
  nbLots: number | null;
  /** P1a, P1b, P1c : montant HT (P1 = leur somme) et état de facturation. */
  jalonsP1: Pick<JalonHonoraires, "code" | "montant" | "etat">[];
  p2Ht: number;
  /** Horodatage de la revalorisation de la P2 (date et mois du contrat). */
  revaloriseLe: string;
  /** Revalorisations de la P2 non annulées, la dernière comprise. */
  nbRevalorisations: number;
  /** Compte AMO du chef de projet (devis_amo_chef_projet), null sans correspondance. */
  chef: { full_name: string; initials: string; email: string } | null;
}

/** Les 10 réponses du skill devis-amo, tirées du dossier. */
export function entreeDevisRevalorise(e: EntreeDevisRevalorise): DevisAmoPdfInput {
  const { copro, chef } = e;
  const date = new Date(e.revaloriseLe);
  const chefSaisi = copro.chef_projet?.trim() || null;
  const ville = [copro.code_postal?.trim(), copro.city?.trim()].filter(Boolean).join(" ");
  const adresse = [copro.adresse?.trim(), ville].filter(Boolean).join(", ");
  const initiales = chef?.initials?.trim() || initialesDe(chefSaisi) || null;
  return {
    nomCopropriete: copro.name,
    adresse: adresse || null,
    nomSyndic: copro.syndic_name?.trim() || copro.organisation?.nom || null,
    nbLots: e.nbLots && e.nbLots > 0 ? e.nbLots : null,
    chargeAffaire: chef?.full_name || chefSaisi,
    emailChargeAffaire: chef?.email || EMAIL_CONTACT,
    telChargeAffaire: TEL_BUREAU,
    honPhase1HT: arrondi2(e.jalonsP1.reduce((t, j) => t + (j.montant ?? 0), 0)),
    honPhase2HT: e.p2Ht,
    refContrat: referenceContrat(initiales, date, versionDevis(e.nbRevalorisations)),
    dateContrat: dateJJMMAAAA(date),
    phase1DejaFacturee: phase1Facturee(e.jalonsP1),
  };
}

/** « Contrat_AMO_LesTilleuls_V2.pdf », comme les fichiers du skill. */
export function nomFichierDevis(nomCopropriete: string, refContrat: string): string {
  const version = /-(V\d+)$/.exec(refContrat)?.[1] ?? "V1";
  const nom = sansAccents(nomCopropriete).replace(/[^A-Za-z0-9]+/g, "") || "Copropriete";
  return `Contrat_AMO_${nom}_${version}.pdf`;
}

// ---------- mise en page ----------

const A4 = { w: 595.28, h: 841.89 };
const MARGE = 56.69; // 2 cm
const LARGEUR = A4.w - 2 * MARGE;
const HAUT = A4.h - MARGE;
const BAS = MARGE;
// les largeurs du modèle Word sont en twips sur 9 360 : on garde les proportions
const K = LARGEUR / 9360;
const INTERLIGNE = 1.3;
const RETRAIT_PUCE = 9;

const NOIR = rgb(0, 0, 0);
const GRIS_333 = rgb(0.2, 0.2, 0.2);
const GRIS_555 = rgb(0.333, 0.333, 0.333);
const GRIS_888 = rgb(0.533, 0.533, 0.533);
const BORD = rgb(0.8, 0.8, 0.8);
const BLANC = rgb(1, 1, 1);
const FOND_F2 = rgb(0.949, 0.949, 0.949);
const FOND_P1 = rgb(0.933, 0.933, 0.933); // EEEEEE
const FOND_P2 = rgb(0.973, 0.973, 0.973); // F8F8F8
const FOND_ENTETE = rgb(0.878, 0.878, 0.878); // E0E0E0
const FOND_PHASE = rgb(0.867, 0.867, 0.867); // DDDDDD
const FOND_INFO = rgb(0.941, 0.941, 0.941); // F0F0F0

/**
 * Helvetica (WinAnsi) : espaces fines insécables gardées insécables, tirets
 * longs ramenés à « - » (jamais de tiret long dans le logiciel), le reste hors
 * plage remplacé.
 */
export const texte = (s: string): string =>
  s
    .replace(/[  ]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/[^\n\x20-\x7E\xA0-\xFF€…•Œœ]/g, "?");

interface Polices {
  r: PDFFont;
  b: PDFFont;
  i: PDFFont;
}

type Align = "left" | "center" | "right";

interface Morceau {
  t: string;
  f: PDFFont;
  color: RGB;
}

/** Paragraphe : texte coupé à la largeur (« \n » = retour à la ligne, « • » = puce), ou morceaux sur une ligne. */
interface Para {
  t?: string;
  morceaux?: { t: string; f?: PDFFont; color?: RGB }[];
  f?: PDFFont;
  size?: number;
  color?: RGB;
  align?: Align;
  avant?: number;
  apres?: number;
}

interface Ligne {
  morceaux: Morceau[];
  size: number;
  align: Align;
  dx: number;
  puce: boolean;
  /** décalage du haut de la ligne depuis le haut du bloc */
  y: number;
}

function couper(s: string, f: PDFFont, size: number, maxW: number): string[] {
  const mots = s.split(/ +/).filter(Boolean);
  const lignes: string[] = [];
  let ligne = "";
  for (const m of mots) {
    const test = ligne ? ligne + " " + m : m;
    if (ligne && f.widthOfTextAtSize(test, size) > maxW) {
      lignes.push(ligne);
      ligne = m;
    } else ligne = test;
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}

function composer(paras: Para[], largeur: number, p: Polices): { lignes: Ligne[]; h: number } {
  const lignes: Ligne[] = [];
  let y = 0;
  for (const para of paras) {
    const size = para.size ?? 9;
    const f = para.f ?? p.r;
    const color = para.color ?? NOIR;
    const align = para.align ?? "left";
    y += para.avant ?? 3;
    if (para.morceaux) {
      lignes.push({
        morceaux: para.morceaux.map((m) => ({ t: texte(m.t), f: m.f ?? f, color: m.color ?? color })),
        size,
        align,
        dx: 0,
        puce: false,
        y,
      });
      y += size * INTERLIGNE;
    } else {
      for (const brut of texte(para.t ?? "").split("\n")) {
        const puce = brut.startsWith("• ");
        const corps = puce ? brut.slice(2).trim() : brut;
        const retrait = puce ? RETRAIT_PUCE : 0;
        const morceaux = couper(corps, f, size, largeur - retrait);
        if (morceaux.length === 0) y += size * INTERLIGNE;
        morceaux.forEach((m, i) => {
          lignes.push({ morceaux: [{ t: m, f, color }], size, align, dx: retrait, puce: puce && i === 0, y });
          y += size * INTERLIGNE;
        });
      }
    }
    y += para.apres ?? 3;
  }
  return { lignes, h: y };
}

function dessinerLignes(page: PDFPage, lignes: Ligne[], x: number, haut: number, largeur: number, p: Polices) {
  for (const l of lignes) {
    const w = l.morceaux.reduce((t, m) => t + m.f.widthOfTextAtSize(m.t, l.size), 0);
    let cx = l.align === "center" ? x + (largeur - w) / 2 : l.align === "right" ? x + largeur - w : x + l.dx;
    const base = haut - l.y - l.size * 0.95;
    if (l.puce) page.drawText("•", { x, y: base, size: l.size, font: p.r, color: l.morceaux[0].color });
    for (const m of l.morceaux) {
      page.drawText(m.t, { x: cx, y: base, size: l.size, font: m.f, color: m.color });
      cx += m.f.widthOfTextAtSize(m.t, l.size);
    }
  }
}

type Trait = [epaisseur: number, couleur: RGB] | null;

interface Bords {
  haut: Trait;
  bas: Trait;
  gauche: Trait;
  droite: Trait;
}

const FIN: Trait = [0.5, BORD];
const TOUS_FINS: Bords = { haut: FIN, bas: FIN, gauche: FIN, droite: FIN };
const SANS_BORD: Bords = { haut: null, bas: null, gauche: null, droite: null };
const BORDS_ENTETE: Bords = { haut: [0.5, NOIR], bas: [1.75, NOIR], gauche: [0.5, NOIR], droite: [0.5, NOIR] };

interface Cellule {
  paras: Para[];
  fond?: RGB;
  bords?: Bords;
  /** marges intérieures verticale et horizontale */
  mv?: number;
  mh?: number;
  centreV?: boolean;
}

class Flux {
  page!: PDFPage;
  y = HAUT;

  constructor(
    readonly doc: PDFDocument,
    readonly p: Polices,
  ) {
    this.nouvellePage();
  }

  nouvellePage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.y = HAUT;
    // en-tête du modèle : coordonnées de Strat Eco, filet noir
    const g = texte("SAS STRAT ECO  ·  27 rue du Vieux Marché aux Vins, 67000 Strasbourg");
    const d = texte("contact@strateco.fr  ·  www.strateco.fr");
    const yT = A4.h - 34;
    this.page.drawText(g, { x: MARGE, y: yT, size: 7, font: this.p.r, color: GRIS_555 });
    this.page.drawText(d, { x: A4.w - MARGE - this.p.r.widthOfTextAtSize(d, 7), y: yT, size: 7, font: this.p.r, color: GRIS_555 });
    this.page.drawLine({ start: { x: MARGE, y: yT - 5 }, end: { x: A4.w - MARGE, y: yT - 5 }, thickness: 0.75, color: NOIR });
  }

  besoin(h: number) {
    if (this.y - h < BAS && this.y < HAUT) this.nouvellePage();
  }

  espace(h: number) {
    // pas d'espace en haut de page après un saut
    if (this.y < HAUT) this.y = Math.max(BAS, this.y - h);
  }

  /** Paragraphe du corps : coupé ligne à ligne sur plusieurs pages si besoin. */
  paragraphe(para: Para) {
    const { lignes, h } = composer([para], LARGEUR, this.p);
    if (lignes.length === 0) return this.espace(h);
    const avant = lignes[0].y;
    const apres = h - (lignes[lignes.length - 1].y + lignes[lignes.length - 1].size * INTERLIGNE);
    this.espace(avant);
    for (const l of lignes) {
      const hl = l.size * INTERLIGNE;
      this.besoin(hl);
      dessinerLignes(this.page, [{ ...l, y: 0 }], MARGE, this.y, LARGEUR, this.p);
      this.y -= hl;
    }
    this.espace(apres);
  }

  private composerRangee(largeurs: number[], cellules: Cellule[]) {
    const comps = cellules.map((c, i) => composer(c.paras, largeurs[i] - 2 * (c.mh ?? 7), this.p));
    return { comps, h: Math.max(...cellules.map((c, i) => comps[i].h + 2 * (c.mv ?? 5))) };
  }

  hauteurRangee(largeurs: number[], cellules: Cellule[]): number {
    return this.composerRangee(largeurs, cellules).h;
  }

  /** Ligne de tableau (jamais coupée entre deux pages). */
  rangee(largeurs: number[], cellules: Cellule[]) {
    const { comps, h } = this.composerRangee(largeurs, cellules);
    this.besoin(h);
    let x = MARGE;
    const haut = this.y;
    cellules.forEach((c, i) => {
      const w = largeurs[i];
      if (c.fond) this.page.drawRectangle({ x, y: haut - h, width: w, height: h, color: c.fond });
      const mv = c.mv ?? 5;
      const mh = c.mh ?? 7;
      const decalage = c.centreV ? (h - 2 * mv - comps[i].h) / 2 : 0;
      dessinerLignes(this.page, comps[i].lignes, x + mh, haut - mv - decalage, w - 2 * mh, this.p);
      this.bords(x, haut, w, h, c.bords ?? TOUS_FINS);
      x += w;
    });
    this.y -= h;
  }

  private bords(x: number, haut: number, w: number, h: number, b: Bords) {
    const trait = (t: Trait, x1: number, y1: number, x2: number, y2: number) => {
      if (t) this.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t[0], color: t[1] });
    };
    trait(b.haut, x, haut, x + w, haut);
    trait(b.bas, x, haut - h, x + w, haut - h);
    trait(b.gauche, x, haut, x, haut - h);
    trait(b.droite, x + w, haut, x + w, haut - h);
  }

  /** Titre d'article : « 1.  OBJET DU CONTRAT » précédé d'un filet vertical. */
  titreSection(titre: string, num: string) {
    this.espace(15);
    const size = 11;
    const hl = size * INTERLIGNE;
    this.besoin(hl + 60); // jamais seul en bas de page
    const base = this.y - size * 0.95;
    this.page.drawLine({ start: { x: MARGE + 8, y: this.y + 1 }, end: { x: MARGE + 8, y: this.y - hl + 1 }, thickness: 2.5, color: NOIR });
    this.page.drawText(texte(`${num}.  ${titre.toUpperCase()}`), { x: MARGE + 18, y: base, size, font: this.p.b, color: NOIR });
    this.y -= hl;
    this.espace(7);
  }
}

const largeurs = (twips: number[]) => twips.map((t) => t * K);

// ---------- contenu figé du modèle (skill devis-amo) ----------

const PHASE1: [string, string][] = [
  [
    "Pilotage\nstratégique\net amont",
    "• Récupération des données de la copropriété (DTA, DPE collectif, audit, diagnostics, données financières)\n• Évaluation de la copropriété : état financier, contraintes techniques et architecturales, état thermique\n• Élaboration d'un premier plan de financement prévisionnel collectif (MPR Copro, CEE, éco-PTZ, aides locales)\n• Élaboration d'une stratégie de rénovation avec le Conseil Syndical\n• Préparation de l'AG et présentation de la stratégie de rénovation\n• Consultation d'une équipe de Maîtrise d'Œuvre (si nécessaire) et rédaction du cahier des charges de la MOE",
  ],
  [
    "Pilotage\nadministratif\net financier",
    "• Enregistrement et suivi du projet sur la plateforme dédiée AMOA.fr\n• Plans de financement individualisés dynamiques, mis à jour tout au long du projet via AMOA Pro (par lot et par profil copropriétaire : propriétaires occupants, bailleurs)\n• Constitution des dossiers de subventions collectives et pré-validation auprès des financeurs (ANAH, Climaxion, CEE)\n• Proposition de prime pour la valorisation des certificats d'économies d'énergie (CEE)\n• Mise en relation avec les organismes bancaires et information sur les prêts collectifs (éco-PTZ collectif)\n• Enquête sociale : formulaire en ligne + accueil physique au bureau Strat Eco + permanence téléphonique le matin\n• Préparation de l'AG de vote des travaux et présentation du plan de financement final",
  ],
  [
    "Réunions",
    "• Toutes les réunions nécessitant la présence de l'AMO sont incluses dans la mission\n• Réunion de lancement avec CS, syndic et équipe MOE\n• Réunions de travail avec le CS, le syndic et l'équipe de maîtrise d'œuvre\n• Réunions d'information à destination de l'ensemble des copropriétaires\n• Participation à l'AG de vote des travaux",
  ],
];

const PHASE2: [string, string][] = [
  [
    "Pilotage\ntechnique",
    "• Vérification de la conformité des factures de travaux vis-à-vis des exigences des financeurs\n• Suivi de l'avancement du chantier en collaboration avec l'équipe MOE via AMOA.fr\n• Remise d'un livret de sensibilisation à l'usage du bâtiment rénové à l'ensemble des copropriétaires",
  ],
  [
    "Pilotage\nadministratif\net financier",
    "• Montage et dépôt des dossiers de subventions collectives (MPR Copropriété, CEE, Climaxion…)\n• Montage des dossiers pour les primes individuelles MaPrimeRénov' Copropriété (sur la base de l'enquête sociale finalisée)\n• Accompagnement et orientation des copropriétaires vers les structures dédiées pour la mobilisation d'aides individuelles complémentaires\n• Gestion bancaire complète : recensement des adhésions au prêt collectif, traitement direct avec la banque des cas individuels, remplissage des annexes exigées par la banque, suivi du dossier bancaire\n• Gestion des demandes d'acompte et de solde des subventions collectives au fur et à mesure de l'avancement des travaux",
  ],
  [
    "Réunions",
    "• Toutes les réunions nécessitant la présence de l'AMO sont incluses dans la mission\n• Réunion de démarrage des travaux\n• Réunions d'avancement avec le CS, le syndic et l'équipe MOE\n• Réunion de réception des travaux",
  ],
];

const REGLEMENT_P1: [string, string][] = [
  ["50 %", "Démarrage de la mission validée en AG - Virement sous 15 jours après la date de l'appel de fonds"],
  ["25 %", "À la réalisation de l'enquête sociale"],
  ["25 %", "À l'envoi de la convocation de l'AG de vote des travaux"],
];

const REGLEMENT_P2: [string, string][] = [
  ["50 %", "Au dépôt des dossiers d'aides"],
  ["30 %", "Au dépôt du dossier bancaire"],
  ["20 %", "À la demande de solde des aides"],
];

// ---------- génération ----------

export async function genererDevisAmoPdf(input: DevisAmoPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(texte(`Contrat AMO Copropriété - ${input.nomCopropriete} - ${input.refContrat}`));
  doc.setAuthor("Strat Eco");
  const p: Polices = {
    r: await doc.embedFont(StandardFonts.Helvetica),
    b: await doc.embedFont(StandardFonts.HelveticaBold),
    i: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const f = new Flux(doc, p);

  const nom = input.nomCopropriete || "[NOM DE LA COPROPRIÉTÉ]";
  const adresse = input.adresse || "[ADRESSE]";
  const syndic = input.nomSyndic || "[NOM SYNDIC]";
  const charge = input.chargeAffaire || "[À compléter]";
  const m = montantsDevis(input.honPhase1HT, input.honPhase2HT);
  const tous = [m.p1, m.p2, m.total].flatMap((x) => [x.ht, x.tva, x.ttc]);
  const centimes = tous.some((v) => Math.round(v * 100) % 100 !== 0);
  const eur = (v: number) =>
    v === 0 ? "À définir" : v.toLocaleString("fr-FR", { minimumFractionDigits: centimes ? 2 : 0, maximumFractionDigits: 2 }) + " €";
  const tva = (x: MontantsPhase) => (x.ht ? eur(x.tva) : "-");

  // ----- bloc identité -----
  f.espace(4);
  f.rangee(largeurs([4600, 4760]), [
    {
      bords: SANS_BORD,
      mh: 0,
      mv: 0,
      paras: [
        { morceaux: [{ t: "Strat", f: p.b, color: NOIR }, { t: "Eco", f: p.b, color: GRIS_555 }], size: 18, avant: 0, apres: 4 },
        { t: "SAS STRAT ECO", f: p.b },
        { t: "27 rue du Vieux Marché aux Vins" },
        { t: "67000 Strasbourg" },
        { t: "contact@strateco.fr  ·  www.strateco.fr" },
        { t: "FR77887527356" },
      ],
    },
    {
      bords: SANS_BORD,
      mh: 0,
      mv: 0,
      paras: [
        { t: `Contrat N° :  ${input.refContrat}`, f: p.b, avant: 0 },
        { t: `Date :  ${input.dateContrat}` },
        { t: `Chargé d'affaire :  ${charge}`, avant: 12 },
        { t: `Email :  ${input.emailChargeAffaire || "[email@strateco.fr]"}` },
        { t: `Tél. :  ${input.telChargeAffaire || "[03.XX.XX.XX.XX]"}` },
      ],
    },
  ]);
  f.espace(18);

  // ----- titre -----
  f.rangee([LARGEUR], [
    {
      bords: { haut: [3, NOIR], bas: [3, NOIR], gauche: [1, NOIR], droite: [1, NOIR] },
      mv: 10,
      mh: 15,
      paras: [
        { t: "CONTRAT D'ACCOMPAGNEMENT", f: p.b, size: 15, align: "center", avant: 0 },
        { t: "pour la Rénovation Énergétique d'une Copropriété", size: 11, color: GRIS_333, align: "center", avant: 2 },
        { t: "ASSISTANCE À MAÎTRISE D'OUVRAGE", f: p.b, size: 12, align: "center", avant: 4, apres: 0 },
      ],
    },
  ]);
  f.espace(12);

  // ----- parties -----
  f.rangee(largeurs([4480, 4880]), [
    {
      fond: FOND_F2,
      mh: 8,
      paras: [
        { t: "Le prestataire :", f: p.b },
        { t: "SAS STRAT ECO" },
        { t: "27 rue du Vieux Marché aux Vins" },
        { t: "67000 Strasbourg" },
        { t: "Ci-après dénommé Strat Eco", f: p.i, size: 8, color: GRIS_555 },
      ],
    },
    {
      mh: 8,
      paras: [
        { t: "Le maître d'ouvrage :", f: p.b },
        { t: nom },
        { t: adresse },
        { t: `Représenté par le syndic ${syndic}` },
        { t: "Ci-après dénommé le maître d'ouvrage", f: p.i, size: 8, color: GRIS_555 },
      ],
    },
  ]);
  f.espace(6);
  f.paragraphe({ t: "Validité de l'offre : 3 mois", f: p.b });
  f.paragraphe({ t: `Nombre de lots : ${input.nbLots || "[À compléter]"}` });

  // ----- 1. objet -----
  f.titreSection("Objet du contrat", "1");
  f.paragraphe({
    t: `Le présent contrat a pour objet la réalisation d'une mission d'Assistance à Maîtrise d'Ouvrage (AMO) dans le cadre d'un projet de rénovation énergétique globale de la copropriété ${nom}, ${adresse}, représentée par le syndic ${syndic}.`,
  });
  f.paragraphe({
    t: "Cette mission vise à accompagner le maître d'ouvrage dans la définition, le pilotage, le financement et la réalisation de travaux de rénovation énergétique performants, éligibles aux dispositifs d'aides publiques (MaPrimeRénov' Copropriété, CEE, Climaxion, éco-PTZ collectif).",
  });

  // ----- 2. mission -----
  f.titreSection("Périmètre de la mission", "2");
  f.paragraphe({ t: "La mission AMO est structurée en deux phases :" });
  const phase = (titre: string, lignes: [string, string][], fondCat: RGB) => {
    const wMission = largeurs([2600, 6760]);
    const enTete: Cellule[] = [
      {
        fond: FOND_PHASE,
        bords: { haut: [2, NOIR], bas: [2, NOIR], gauche: [2, NOIR], droite: [2, NOIR] },
        mv: 7,
        mh: 11,
        paras: [{ t: titre, f: p.b, size: 11, avant: 0, apres: 0 }],
      },
    ];
    const rangees = lignes.map(([cat, contenu], i): Cellule[] => [
      { fond: fondCat, centreV: true, paras: [{ t: cat, f: p.b, size: 8.5, align: "center", avant: 2, apres: 2 }] },
      { fond: i % 2 === 1 ? FOND_F2 : BLANC, paras: [{ t: contenu, size: 8.5, avant: 2, apres: 2 }] },
    ]);
    f.espace(4);
    // l'en-tête de phase reste avec sa première ligne
    f.besoin(f.hauteurRangee([LARGEUR], enTete) + 3 + f.hauteurRangee(wMission, rangees[0]));
    f.rangee([LARGEUR], enTete);
    f.espace(3);
    rangees.forEach((r) => f.rangee(wMission, r));
  };
  phase("PHASE 1 - ÉTUDES  ·  Tranche ferme", PHASE1, FOND_P1);
  f.espace(7);
  phase("PHASE 2 - TRAVAUX  ·  Tranche conditionnelle", PHASE2, FOND_P2);
  f.espace(4);
  f.paragraphe({
    t: "La Phase 2 est déclenchée par le vote favorable des travaux en Assemblée Générale. L'activation de cette tranche fera l'objet d'un bon de commande spécifique.",
    f: p.i,
    size: 8,
    color: GRIS_555,
  });

  // ----- 3. honoraires -----
  const w4 = largeurs([2800, 2520, 2000, 2040]);
  const entete = (t: string, fond: RGB): Cellule => ({
    fond,
    bords: BORDS_ENTETE,
    centreV: true,
    paras: [{ t, f: p.b, align: "center", avant: 2, apres: 2 }],
  });
  const ligneHon = (libelle: string, valeurs: string[], gras = false, fond: RGB = BLANC): Cellule[] => [
    { fond, paras: [{ t: libelle, f: gras ? p.b : p.r, size: 8.5, avant: 2, apres: 2 }] },
    ...valeurs.map((v): Cellule => ({ fond, paras: [{ t: v, f: gras ? p.b : p.r, size: 8.5, align: "center", avant: 2, apres: 2 }] })),
  ];
  const tableauHon: Cellule[][] = [
    [
      entete("", FOND_ENTETE),
      entete("PHASE ÉTUDES\n(Tranche ferme)", FOND_P1),
      entete("PHASE TRAVAUX\n(Tranche conditionnelle)", FOND_P2),
      entete("TOTAL", FOND_ENTETE),
    ],
    ligneHon("Honoraires AMO (€ HT)", [eur(m.p1.ht), eur(m.p2.ht), eur(m.total.ht)], false, FOND_F2),
    ligneHon("TVA (base 20%)", [tva(m.p1), tva(m.p2), tva(m.total)]),
    ligneHon("Honoraires AMO (€ TTC)", [eur(m.p1.ttc), eur(m.p2.ttc), eur(m.total.ttc)], true, FOND_P1),
  ];
  // encadré bien visible si la phase 1 (ou une partie) est déjà facturée
  const dejaP1 = input.phase1DejaFacturee ?? null;
  const encadreP1: Cellule[] | null = dejaP1 && [
    {
      fond: FOND_F2,
      bords: { haut: [1.5, NOIR], bas: [1.5, NOIR], gauche: [4, NOIR], droite: [1.5, NOIR] },
      mv: 7,
      mh: 12,
      paras: [
        {
          t: dejaP1.totale ? "LA PHASE 1 A DÉJÀ ÉTÉ FACTURÉE" : "LA PHASE 1 A DÉJÀ ÉTÉ FACTURÉE EN PARTIE",
          f: p.b,
          size: 11,
          avant: 0,
          apres: 2,
        },
        {
          t: dejaP1.totale
            ? `Déjà facturé : ${enumerer(dejaP1.factures)}, soit ${eur(dejaP1.montantFactureHt)} HT. Ces honoraires figurent au tableau ci-dessus pour mémoire et ne seront pas facturés à nouveau.`
            : `Déjà facturé : ${enumerer(dejaP1.factures)}, soit ${eur(dejaP1.montantFactureHt)} HT. Reste à facturer sur la phase 1 : ${enumerer(dejaP1.restants)}, soit ${eur(dejaP1.montantRestantHt)} HT.`,
          size: 8.5,
          avant: 0,
          apres: 0,
        },
      ],
    },
  ];
  // le titre, le tableau et l'encadré restent sur la même page
  const hTitre = 15 + 11 * INTERLIGNE + 7;
  f.besoin(hTitre + tableauHon.reduce((t, r) => t + f.hauteurRangee(w4, r), 0) + (encadreP1 ? 8 + f.hauteurRangee([LARGEUR], encadreP1) : 0));
  f.titreSection("Honoraires", "3");
  tableauHon.forEach((r) => f.rangee(w4, r));
  if (encadreP1) {
    f.espace(8);
    f.rangee([LARGEUR], encadreP1);
  }
  f.espace(5);
  f.rangee([LARGEUR], [
    {
      fond: FOND_INFO,
      bords: { haut: FIN, bas: FIN, gauche: [2, NOIR], droite: null },
      mv: 4,
      mh: 8,
      paras: [
        {
          t: "Prestation obligatoire financée par le dispositif MaPrimeRénov' à 50 % selon plafond. Les honoraires AMO sont éligibles à la prise en charge partielle dans le cadre des aides ANAH.",
          f: p.i,
          size: 8,
          avant: 1,
          apres: 1,
        },
      ],
    },
  ]);

  // ----- 4. règlement -----
  f.titreSection("Termes de règlement", "4");
  const w3 = largeurs([1200, 4560, 3600]);
  const reglement = (titre: string, lignes: [string, string][], fondEntete: RGB, dejaFactures: boolean[] = []) => {
    f.besoin(110);
    f.paragraphe({ t: titre, f: p.b });
    f.espace(3);
    f.rangee(w3, [entete("%", fondEntete), entete("Échéance", fondEntete), entete("Mode", fondEntete)]);
    lignes.forEach(([pct, echeance], i) => {
      const fond = i % 2 === 0 ? FOND_F2 : BLANC;
      f.rangee(w3, [
        { fond, centreV: true, paras: [{ t: pct, f: p.b, size: 8.5, align: "center", avant: 2, apres: 2 }] },
        { fond, paras: [{ t: echeance, size: 8.5, avant: 2, apres: 2 }] },
        {
          fond,
          paras: [
            dejaFactures[i]
              ? { t: "Déjà facturé", f: p.b, size: 8.5, avant: 2, apres: 2 }
              : { t: "Virement - 15 jours", f: p.i, size: 8, color: GRIS_555, avant: 2, apres: 2 },
          ],
        },
      ]);
    });
  };
  // une échéance par jalon : 50 % = P1a, 25 % = P1b, 25 % = P1c
  reglement(
    dejaP1?.totale ? "Phase Études - Tranche ferme : déjà facturée" : "Phase Études - Tranche ferme :",
    REGLEMENT_P1,
    FOND_P1,
    ["P1a", "P1b", "P1c"].map((code) => !!dejaP1?.factures.includes(libelleJalon(code))),
  );
  f.espace(6);
  reglement("Phase Travaux - Tranche conditionnelle :", REGLEMENT_P2, FOND_P2);
  f.espace(4);
  f.paragraphe({
    t: "Les règlements sont effectués par virement bancaire sous 15 jours à réception de la facture. Tout retard de paiement entraîne l'application d'une pénalité de retard au taux légal en vigueur.",
    f: p.i,
    size: 8,
    color: GRIS_555,
  });

  // ----- 5. durée -----
  f.titreSection("Durée de la mission", "5");
  f.paragraphe({
    t: "La Phase 1 débute à la date de signature du présent contrat et se poursuit jusqu'au vote des travaux en AG, estimé à 12-18 mois selon le calendrier du projet.",
  });
  f.paragraphe({
    t: "La Phase 2 démarre après activation par bon de commande et s'étend sur la durée du chantier, jusqu'à la réception des travaux et l'obtention du solde des subventions.",
  });

  // ----- 6. obligations -----
  f.titreSection("Obligations des parties", "6");
  f.paragraphe({ t: "Strat Eco s'engage à :", f: p.b });
  for (const t of [
    "Réaliser les missions définies à l'article 2 avec diligence et professionnalisme",
    "Informer régulièrement le maître d'ouvrage de l'avancement du projet",
    "Respecter la confidentialité des données transmises",
    "Mettre à jour les plans de financement individualisés via la plateforme AMOA Pro",
  ])
    f.paragraphe({ t: "• " + t, avant: 1, apres: 1 });
  f.espace(4);
  f.paragraphe({ t: "Le maître d'ouvrage s'engage à :", f: p.b });
  for (const t of [
    "Fournir les documents et informations nécessaires à la réalisation de la mission",
    "Désigner un interlocuteur référent au sein du Conseil Syndical",
    "Régler les honoraires dans les délais définis à l'article 4",
    "Informer Strat Eco de toute décision susceptible d'affecter le projet",
  ])
    f.paragraphe({ t: "• " + t, avant: 1, apres: 1 });

  // ----- 7. résiliation -----
  f.titreSection("Résiliation", "7");
  f.paragraphe({
    t: "Chacune des parties peut résilier le présent contrat par lettre recommandée avec accusé de réception, moyennant un préavis de 30 jours. En cas de résiliation à l'initiative du maître d'ouvrage, les honoraires correspondant aux prestations réalisées à la date de résiliation restent dus.",
  });

  // ----- 8. signatures -----
  f.besoin(150);
  f.titreSection("Signatures", "8");
  f.paragraphe({ t: "Fait en deux exemplaires originaux." });
  f.espace(8);
  f.rangee(largeurs([4480, 4880]), [
    {
      mh: 8,
      mv: 6,
      paras: [
        { t: "Pour Strat Eco :", f: p.b },
        { t: charge },
        { t: "Signature :", avant: 16 },
        { t: `Date : ${input.dateContrat}`, f: p.i, size: 8, color: GRIS_555, avant: 16, apres: 8 },
      ],
    },
    {
      mh: 8,
      mv: 6,
      paras: [
        { t: "Pour le maître d'ouvrage :", f: p.b },
        { t: syndic },
        { t: "Signature + cachet :", avant: 16 },
        { t: "Date : ___________________", f: p.i, size: 8, color: GRIS_555, avant: 16, apres: 8 },
      ],
    },
  ]);

  // ----- 9. conditions générales de vente (mention obligatoire) -----
  f.espace(12);
  f.paragraphe({
    t: "Vous retrouverez les conditions générales de vente suivantes sous le lien https://www.strateco.fr/CGV",
    f: p.i,
    size: 8,
    color: GRIS_555,
  });

  // ----- pied de page -----
  doc.getPages().forEach((pg, i) => {
    const g = texte("Strat Eco  ·  Contrat AMO Copropriété");
    const d = `Page ${i + 1}`;
    pg.drawLine({ start: { x: MARGE, y: 40 }, end: { x: A4.w - MARGE, y: 40 }, thickness: 0.5, color: NOIR });
    pg.drawText(g, { x: MARGE, y: 29, size: 7, font: p.r, color: GRIS_888 });
    pg.drawText(d, { x: A4.w - MARGE - p.r.widthOfTextAtSize(d, 7), y: 29, size: 7, font: p.r, color: GRIS_888 });
  });

  return doc.save();
}
