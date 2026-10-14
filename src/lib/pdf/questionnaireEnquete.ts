// Questionnaire d'enquête sociale et technique en PDF, version papier (idée d'Amir
// du 14/10/2026) : les questions activées dans « Configurer », à compléter à la
// main puis à renvoyer par e-mail à admin@strateco.fr ou à déposer chez Strat Eco.
// Structure et conditions : src/lib/questionnairePapier.ts. Généré de zéro avec
// pdf-lib, Helvetica, charte Strat Eco, logo couleur (comme le rapport d'enquête).
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import { libellesBatiments } from "@/lib/referentiels";
import { CONTACT_ENQUETE } from "@/lib/emailEnquete";
import { t } from "@/lib/pdf/rapportEnquete";
import { ADRESSE_STRAT_ECO, type QuestionPapier, type QuestionnairePapier, type SectionPapier } from "@/lib/questionnairePapier";

export interface QuestionnairePdfInput {
  copro: {
    nom: string;
    adresse: string | null;
    codePostal: string | null;
    ville: string | null;
    denominationBatiments: string | null | undefined;
  };
  /** Date limite de réponse (AAAA-MM-JJ). */
  dateLimite: string | null;
  questionnaire: QuestionnairePapier;
  /** Logo couleur (PNG) ; à défaut chargé depuis /logo-strateco.png dans le navigateur. */
  logoPng?: Uint8Array | ArrayBuffer | null;
}

// ---------- charte ----------

const PAGE = { w: 595.28, h: 841.89 };
const MARGE = 42;
const LARG = PAGE.w - 2 * MARGE;
const BAS = 62;

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
const BORD = hex("#9AA0A8");
const BLANC = rgb(1, 1, 1);

const SITE_STRAT_ECO = "www.strateco.fr";

const dateFr = (d: string): string => new Date(d).toLocaleDateString("fr-FR");

// ---------- mise en page ----------

type Style = "normal" | "gras" | "italique";
type Align = "left" | "right" | "center";

/** Bloc d'une question : hauteur connue d'avance (il ne se coupe pas entre deux pages), dessiné depuis son bord haut. */
interface Bloc {
  h: number;
  dessiner: (yHaut: number) => void;
}

const TAILLE_QUESTION = 9;
const TAILLE_NOTE = 7.6;
const TAILLE_OPTION = 8.8;
const X_TEXTE = MARGE + 24;
const L_TEXTE = LARG - 24;
const H_LIGNE_REPONSE = 21;

/** Largeur de la ligne de réponse selon le type de question (réponse courte = ligne courte). */
const LARGEUR_REPONSE: Partial<Record<string, number>> = { nombre: 110, montant: 130, tel: 200 };
/** Lignes de réponse : une seule, sauf pour les réponses plus longues. */
const LIGNES_REPONSE_PAR_ID: Record<string, number> = { "coordonnees-representant": 2 };
const LIGNES_QUESTION_AMO = 3;

class Papier {
  page!: PDFPage;
  y = 0;
  constructor(
    readonly doc: PDFDocument,
    readonly fonts: Record<Style, PDFFont>,
    readonly logo: PDFImage | null,
    readonly titreCourt: string
  ) {}

  largeur(s: string, size: number, style: Style = "normal") {
    return this.fonts[style].widthOfTextAtSize(t(s), size);
  }

  ecrire(s: string, x: number, y: number, size: number, o: { style?: Style; couleur?: RGB; align?: Align } = {}) {
    const txt = t(s);
    const font = this.fonts[o.style ?? "normal"];
    const w = font.widthOfTextAtSize(txt, size);
    const xx = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    this.page.drawText(txt, { x: xx, y, size, font, color: o.couleur ?? ENCRE });
  }

  /** Retour à la ligne automatique. */
  couper(s: string, maxW: number, size: number, style: Style = "normal"): string[] {
    const lignes: string[] = [];
    let ligne = "";
    for (const mot of t(s).split(" ").filter(Boolean)) {
      const test = ligne ? `${ligne} ${mot}` : mot;
      if (ligne && this.fonts[style].widthOfTextAtSize(test, size) > maxW) {
        lignes.push(ligne);
        ligne = mot;
      } else ligne = test;
    }
    if (ligne) lignes.push(ligne);
    return lignes.length ? lignes : [""];
  }

  rectArrondi(x: number, yHaut: number, w: number, h: number, r: number, o: { fond?: RGB; bord?: RGB }) {
    const p = `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    this.page.drawSvgPath(p, { x, y: yHaut, color: o.fond, borderColor: o.bord, borderWidth: o.bord ? 0.7 : 0 });
  }

  filet(y: number, c: RGB = GRIS, e = 0.5, x0 = MARGE, x1 = PAGE.w - MARGE) {
    this.page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: e, color: c });
  }

  nouvellePage(bandeau = true) {
    this.page = this.doc.addPage([PAGE.w, PAGE.h]);
    this.y = PAGE.h - 34;
    if (!bandeau) return;
    const lh = 26;
    if (this.logo) this.page.drawImage(this.logo, { x: MARGE, y: PAGE.h - 24 - lh, width: (this.logo.width / this.logo.height) * lh, height: lh });
    else this.ecrire("Strat Eco", MARGE, PAGE.h - 44, 14, { style: "gras", couleur: VERT_FONCE });
    this.ecrire(`${this.titreCourt} · Questionnaire d'enquête`, PAGE.w - MARGE, PAGE.h - 42, 8, { couleur: ARDOISE, align: "right" });
    this.filet(PAGE.h - 58, GRIS, 0.8);
    this.y = PAGE.h - 74;
  }

  /** Pose un bloc, sur une nouvelle page s'il ne tient pas ; `avec` = hauteur à garder avec lui (titre de section). */
  poser(b: Bloc, avec = 0) {
    if (this.y - b.h - avec < BAS) this.nouvellePage();
    b.dessiner(this.y);
    this.y -= b.h;
  }

  /** Paragraphe courant, posé ligne à ligne. */
  paragraphe(s: string, o: { size?: number; couleur?: RGB; style?: Style; maxW?: number; x?: number } = {}) {
    const size = o.size ?? 8.5;
    for (const l of this.couper(s, o.maxW ?? LARG, size, o.style)) {
      if (this.y - size - 3 < BAS) this.nouvellePage();
      this.ecrire(l, o.x ?? MARGE, this.y - size, size, { couleur: o.couleur, style: o.style });
      this.y -= size + 3;
    }
  }
}

// ---------- blocs ----------

/** Titre de partie (« Partie 1 · Vous ») : grand titre, texte d'introduction dessous. */
function blocPartie(p: Papier, titre: string, intro: string): Bloc {
  const lignes = p.couper(intro, LARG, 8.5);
  const h = 34 + lignes.length * 11.5;
  return {
    h,
    dessiner: (y) => {
      p.page.drawRectangle({ x: MARGE, y: y - 22, width: LARG, height: 22, color: VERT });
      p.ecrire(titre, MARGE + 10, y - 15.5, 11.5, { style: "gras", couleur: BLANC });
      lignes.forEach((l, i) => p.ecrire(l, MARGE, y - 36 - i * 11.5, 8.5, { couleur: ARDOISE }));
    },
  };
}

/** Titre de section : barre verte, libellé gras et description. */
function blocSection(p: Papier, s: SectionPapier): Bloc {
  return {
    h: 32,
    dessiner: (y) => {
      p.page.drawRectangle({ x: MARGE, y: y - 14, width: 3.4, height: 14, color: VERT });
      p.ecrire(s.label, MARGE + 9, y - 11, 10.5, { style: "gras" });
      p.ecrire(s.desc, MARGE + 9, y - 23, 7.8, { couleur: ARDOISE });
    },
  };
}

interface Cellule {
  label: string;
  /** Réponse libre : l'option est suivie d'une ligne pour préciser. */
  precision: boolean;
}

/** Réponse à choix : cases à cocher (rondes = un seul choix, carrées = plusieurs), sur une ou deux colonnes. */
function reponseChoix(p: Papier, q: QuestionPapier["q"], x: number, w: number): { h: number; dessiner: (y: number) => void } {
  const rond = q.type === "choix";
  const cellules: Cellule[] = (q.options ?? []).map((label) => ({ label, precision: (q.precision ?? []).includes(label) }));
  const caseW = 15;
  const deuxColonnes = cellules.every((c) => c.precision || p.largeur(c.label, TAILLE_OPTION) <= w / 2 - caseW - 10);
  const colW = deuxColonnes ? w / 2 : w;

  // une ligne de réponses = une ou deux cellules ; une option « précisez » a toute sa ligne, avec de la place pour écrire
  const rangees: { cellules: Cellule[]; lignes: string[][] }[] = [];
  for (const c of cellules) {
    const derniere = rangees[rangees.length - 1];
    if (deuxColonnes && !c.precision && derniere?.cellules.length === 1 && !derniere.cellules[0].precision) {
      derniere.cellules.push(c);
      derniere.lignes.push(p.couper(c.label, colW - caseW, TAILLE_OPTION));
    } else {
      rangees.push({ cellules: [c], lignes: [p.couper(c.label, c.precision ? w - caseW - 90 : colW - caseW, TAILLE_OPTION)] });
    }
  }
  const hRangee = (r: (typeof rangees)[number]) => Math.max(...r.lignes.map((l) => l.length)) * 10.5 + 4;
  const h = rangees.reduce((a, r) => a + hRangee(r), 0);

  return {
    h,
    dessiner: (yHaut) => {
      let y = yHaut;
      for (const r of rangees) {
        r.cellules.forEach((c, i) => {
          const cx = x + i * colW;
          const cy = y - 8;
          if (rond) p.page.drawCircle({ x: cx + 4, y: cy + 3, size: 4, borderColor: BORD, borderWidth: 0.8, color: BLANC });
          else p.page.drawRectangle({ x: cx, y: cy - 1, width: 8, height: 8, borderColor: BORD, borderWidth: 0.8, color: BLANC });
          r.lignes[i].forEach((l, k) => p.ecrire(l, cx + caseW, cy - k * 10.5, TAILLE_OPTION));
          if (c.precision) {
            const fin = cx + caseW + p.largeur(r.lignes[i][r.lignes[i].length - 1], TAILLE_OPTION) + 6;
            p.filet(cy - (r.lignes[i].length - 1) * 10.5 - 1, BORD, 0.6, fin, x + w);
          }
        });
        y -= hRangee(r);
      }
    },
  };
}

/** Une question : numéro, énoncé, aide, condition d'affichage, zone de réponse. */
function blocQuestion(p: Papier, qp: QuestionPapier): Bloc {
  const { q } = qp;
  const enonce = p.couper(`${q.q}${q.facultatif ? " (facultatif)" : ""}`, L_TEXTE, TAILLE_QUESTION, "gras");
  const notes: { l: string; style: Style; couleur: RGB }[] = [];
  if (q.aide) for (const l of p.couper(q.aide, L_TEXTE, TAILLE_NOTE, "italique")) notes.push({ l, style: "italique", couleur: ARDOISE });
  if (q.type === "multi" && !(q.aide ?? "").toLowerCase().includes("plusieurs réponses")) notes.push({ l: "Plusieurs réponses possibles.", style: "italique", couleur: ARDOISE });
  if (qp.condition) for (const l of p.couper(`À remplir si : ${qp.condition}`, L_TEXTE, TAILLE_NOTE, "italique")) notes.push({ l, style: "italique", couleur: VERT_FONCE });

  const hEnonce = enonce.length * 11.5;
  const hNotes = notes.length * 9.6;
  const choix = q.type === "choix" || q.type === "multi" ? reponseChoix(p, q, X_TEXTE, L_TEXTE) : null;
  const nbLignes = q.custom ? LIGNES_QUESTION_AMO : (LIGNES_REPONSE_PAR_ID[q.id] ?? 1);
  const hReponse = choix ? choix.h + 2 : nbLignes * H_LIGNE_REPONSE;
  const h = hEnonce + hNotes + 4 + hReponse + 10;

  return {
    h,
    dessiner: (y) => {
      p.ecrire(`${qp.numero}.`, MARGE, y - TAILLE_QUESTION - 1, TAILLE_QUESTION, { style: "gras", couleur: VERT_FONCE });
      enonce.forEach((l, i) => p.ecrire(l, X_TEXTE, y - TAILLE_QUESTION - 1 - i * 11.5, TAILLE_QUESTION, { style: "gras" }));
      let yy = y - hEnonce;
      notes.forEach((n, i) => p.ecrire(n.l, X_TEXTE, yy - TAILLE_NOTE - 1 - i * 9.6, TAILLE_NOTE, { style: n.style, couleur: n.couleur }));
      yy -= hNotes + 4;
      if (choix) {
        choix.dessiner(yy);
      } else {
        const largeur = Math.min(L_TEXTE, LARGEUR_REPONSE[q.type] ?? L_TEXTE);
        for (let i = 0; i < nbLignes; i++) p.filet(yy - (i + 1) * H_LIGNE_REPONSE + 5, BORD, 0.6, X_TEXTE, X_TEXTE + largeur);
        if (q.type === "montant") p.ecrire("€ / an", X_TEXTE + largeur + 6, yy - H_LIGNE_REPONSE + 7, TAILLE_OPTION, { couleur: ARDOISE });
      }
    },
  };
}

/** Encadré d'accueil : répondre en ligne (plateforme) ou sur papier, puis retourner le questionnaire (e-mail ou dépôt). */
function blocRetour(p: Papier, nomCopro: string): Bloc {
  const enLigne = p.couper(
    `Connectez-vous sur ${SITE_STRAT_ECO} : si vous êtes enregistré(e) dans notre base, cliquez sur « Mot de passe oublié » pour accéder à votre espace et y répondre à l'enquête. ` +
      `Sinon, demandez un accès par e-mail à ${CONTACT_ENQUETE} en précisant la copropriété concernée (${nomCopro}).`,
    LARG - 24,
    8.8
  );
  const surPapier = p.couper("Complétez ce questionnaire puis retournez-le à Strat Eco, de l'une de ces deux façons :", LARG - 24, 8.8);
  const hTuile = 60;
  const gap = 10;
  const w = (LARG - 24 - gap) / 2;
  const h = 28 + 12 + enLigne.length * 11.5 + 8 + 12 + surPapier.length * 11.5 + 4 + hTuile + 12;
  return {
    h,
    dessiner: (y) => {
      p.rectArrondi(MARGE, y, LARG, h, 6, { fond: PASTEL, bord: VERT });
      p.ecrire("Deux façons de répondre à ce questionnaire", MARGE + 12, y - 19, 10.5, { style: "gras", couleur: VERT_FONCE });
      let d = 28;
      p.ecrire("1 · EN LIGNE, SUR LA PLATEFORME STRATECOPRO", MARGE + 12, y - d - 7, 7.2, { style: "gras", couleur: ARDOISE });
      d += 12;
      enLigne.forEach((l, i) => p.ecrire(l, MARGE + 12, y - d - 8 - i * 11.5, 8.8));
      d += enLigne.length * 11.5 + 8;
      p.ecrire("2 · SUR PAPIER", MARGE + 12, y - d - 7, 7.2, { style: "gras", couleur: ARDOISE });
      d += 12;
      surPapier.forEach((l, i) => p.ecrire(l, MARGE + 12, y - d - 8 - i * 11.5, 8.8));
      d += surPapier.length * 11.5 + 4;
      const yt = y - d;
      const tuiles = [
        { sur: "PAR E-MAIL", lignes: [CONTACT_ENQUETE], note: "Scan ou photo lisible de toutes les pages" },
        { sur: "OU PAR DÉPÔT", lignes: ["Strat Eco", ...ADRESSE_STRAT_ECO.split(", ")], note: null },
      ];
      tuiles.forEach((tu, i) => {
        const x = MARGE + 12 + i * (w + gap);
        p.rectArrondi(x, yt, w, hTuile, 4, { fond: BLANC, bord: VERT });
        p.ecrire(tu.sur, x + 9, yt - 12, 7, { style: "gras", couleur: ARDOISE });
        const corps = tu.lignes.flatMap((l) => p.couper(l, w - 18, 9.5, "gras"));
        corps.forEach((l, k) => p.ecrire(l, x + 9, yt - 25 - k * 11.5, 9.5, { style: "gras" }));
        if (tu.note) p.ecrire(tu.note, x + 9, yt - 25 - corps.length * 11.5 - 2, 7.4, { couleur: ARDOISE });
      });
    },
  };
}

/** Ligne de saisie « Libellé : ______ » sur une seule ligne. */
function champsLigne(p: Papier, y: number, champs: { label: string; w: number }[]) {
  let x = MARGE;
  for (const c of champs) {
    p.ecrire(c.label, x, y, 8.8, { couleur: ARDOISE });
    const x0 = x + p.largeur(c.label, 8.8) + 5;
    p.filet(y - 2, BORD, 0.6, x0, x0 + c.w);
    x = x0 + c.w + 14;
  }
}

// ---------- génération ----------

async function chargerLogo(doc: PDFDocument, png: QuestionnairePdfInput["logoPng"]): Promise<PDFImage | null> {
  try {
    if (png) return await doc.embedPng(png);
    if (typeof fetch === "function" && typeof window !== "undefined") {
      const res = await fetch("/logo-strateco.png");
      if (res.ok) return await doc.embedPng(await res.arrayBuffer());
    }
  } catch {
    // logo facultatif : le questionnaire reste lisible sans
  }
  return null;
}

export async function genererQuestionnaireEnquetePdf(input: QuestionnairePdfInput): Promise<Uint8Array> {
  const { questionnaire: qn } = input;
  const lb = libellesBatiments(input.copro.denominationBatiments);

  const doc = await PDFDocument.create();
  doc.setTitle(`Questionnaire d'enquête sociale et technique - ${input.copro.nom}`);
  doc.setAuthor("Strat Eco");
  doc.setCreator("Strat Eco pro");
  const [normal, gras, italique] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique),
  ]);
  const logo = await chargerLogo(doc, input.logoPng);
  const p = new Papier(doc, { normal, gras, italique }, logo, input.copro.nom);

  // =====================================================================
  // Page 1 - en-tête et consignes de retour
  // =====================================================================
  p.nouvellePage(false);
  const lh = 46;
  const lw = logo ? (logo.width / logo.height) * lh : 0;
  if (logo) p.page.drawImage(logo, { x: MARGE, y: PAGE.h - 30 - lh, width: lw, height: lh });
  else p.ecrire("Strat Eco", MARGE, PAGE.h - 60, 20, { style: "gras", couleur: VERT_FONCE });
  const xd = PAGE.w - MARGE;
  const maxD = LARG - Math.max(lw, 100) - 24;
  p.ecrire("QUESTIONNAIRE D'ENQUÊTE SOCIALE ET TECHNIQUE", xd, PAGE.h - 40, 8, { style: "gras", couleur: VERT_FONCE, align: "right" });
  let tNom = 15;
  while (tNom > 10 && p.largeur(input.copro.nom, tNom, "gras") > maxD) tNom -= 0.5;
  p.ecrire(input.copro.nom, xd, PAGE.h - 58, tNom, { style: "gras", align: "right" });
  const ville = [input.copro.codePostal, input.copro.ville].filter(Boolean).join(" ");
  const adresse = [input.copro.adresse, ville].filter(Boolean).join(", ");
  if (adresse) p.ecrire(adresse, xd, PAGE.h - 71, 8.5, { couleur: ARDOISE, align: "right" });
  p.ecrire("Version papier - à compléter lisiblement", xd, PAGE.h - 83, 8.5, { couleur: ARDOISE, align: "right" });
  p.filet(PAGE.h - 92, VERT, 1.4);
  p.y = PAGE.h - 106;

  p.poser(blocRetour(p, input.copro.nom));
  p.y -= 8;
  if (input.dateLimite) p.paragraphe(`Merci de nous le retourner avant le ${dateFr(input.dateLimite)}.`, { size: 9, style: "gras", couleur: VERT_FONCE });
  p.paragraphe(
    "Joignez une copie de votre dernier avis d'imposition définitif (N-1), toutes les pages : l'Anah n'accepte pas l'avis de situation déclarative. " +
      "Selon votre situation, d'autres pièces pourront vous être demandées par Strat Eco.",
    { size: 8.3 }
  );
  p.paragraphe(
    "Vos réponses sont confidentielles : seule l'équipe Strat Eco les consulte, pour préparer le projet (profil d'aides, état des logements, organisation des visites).",
    { size: 8.3, couleur: ARDOISE }
  );
  p.paragraphe(
    "Cochez la case qui correspond à votre réponse (une seule pour les cases rondes, plusieurs possibles pour les cases carrées). " +
      "Les questions « facultatif » peuvent rester vides, ainsi que celles dont la mention « À remplir si » ne vous concerne pas.",
    { size: 8.3, couleur: ARDOISE }
  );
  p.y -= 8;

  // =====================================================================
  // Partie 1 - le copropriétaire
  // =====================================================================
  const aPartie2 = qn.logement.length > 0;
  /** Pose une partie ; avec `garderDerniere`, la dernière question est rendue sans être posée (elle rejoint l'attestation). */
  const partie = (titre: string, intro: string, sections: SectionPapier[], o: { avantPremiere?: () => void; garderDerniere?: boolean } = {}): Bloc | null => {
    const tete = blocPartie(p, titre, intro);
    const premiere = sections[0] && blocQuestion(p, sections[0].questions[0]);
    p.poser(tete, 32 + (premiere?.h ?? 0));
    o.avantPremiere?.();
    let derniere: Bloc | null = null;
    sections.forEach((s, i) => {
      p.poser(blocSection(p, s), blocQuestion(p, s.questions[0]).h);
      s.questions.forEach((qp, j) => {
        const b = blocQuestion(p, qp);
        if (o.garderDerniere && i === sections.length - 1 && j === s.questions.length - 1) derniere = b;
        else p.poser(b);
      });
    });
    return derniere;
  };

  let derniere = partie(
    aPartie2 ? "Partie 1 · Vous, copropriétaire" : "Vous, copropriétaire",
    "À remplir une seule fois, quel que soit le nombre de lots que vous possédez.",
    qn.copro,
    { garderDerniere: !aPartie2 }
  );

  // =====================================================================
  // Partie 2 - chacun des logements
  // =====================================================================
  if (aPartie2) {
    p.y -= 6;
    derniere = partie(
      "Partie 2 · Votre logement",
      "À remplir pour chacun de vos logements (lots d'habitation) : photocopiez cette partie si vous en possédez plusieurs. Aucune question n'est posée sur les garages, caves et commerces.",
      qn.logement,
      {
        garderDerniere: true,
        avantPremiere: () => {
          p.y -= 2;
          if (p.y - 22 < BAS) p.nouvellePage();
          champsLigne(p, p.y - 10, [
            { label: "Lot n°", w: 70 },
            { label: lb.singulier, w: 70 },
            { label: "Étage / porte", w: 100 },
          ]);
          p.y -= 26;
        },
      }
    );
  }

  // =====================================================================
  // Attestation et signature, posées avec la dernière question : jamais une page de signature seule
  // =====================================================================
  const attestation = p.couper("J'atteste que ces informations sont exactes et complètes, et j'accepte qu'elles servent au calcul de mes aides.", LARG - 24, 9, "gras");
  const hAtt = 30 + attestation.length * 11.5 + 56;
  const blocAttestation: Bloc = {
    h: hAtt,
    dessiner: (y) => {
      p.rectArrondi(MARGE, y, LARG, hAtt, 5, { bord: BORD });
      p.page.drawRectangle({ x: MARGE + 12, y: y - 22, width: 8, height: 8, borderColor: BORD, borderWidth: 0.8, color: BLANC });
      attestation.forEach((l, i) => p.ecrire(l, MARGE + 28, y - 21 - i * 11.5, 9, { style: "gras" }));
      const yb = y - 30 - attestation.length * 11.5 - 16;
      p.ecrire("Fait à :", MARGE + 12, yb, 8.8, { couleur: ARDOISE });
      p.filet(yb - 2, BORD, 0.6, MARGE + 50, MARGE + 190);
      p.ecrire("le :", MARGE + 202, yb, 8.8, { couleur: ARDOISE });
      p.filet(yb - 2, BORD, 0.6, MARGE + 218, MARGE + 300);
      p.ecrire("Signature :", MARGE + 318, yb, 8.8, { couleur: ARDOISE });
      p.filet(yb - 2, BORD, 0.6, MARGE + 372, MARGE + LARG - 12);
    },
  };
  const ecart = 6;
  if (derniere) {
    const q = derniere;
    p.poser({
      h: q.h + ecart + blocAttestation.h,
      dessiner: (y) => {
        q.dessiner(y);
        blocAttestation.dessiner(y - q.h - ecart);
      },
    });
  } else {
    p.y -= ecart;
    p.poser(blocAttestation);
  }

  // ----- pieds de page : rappel de l'adresse de retour sur chaque page -----
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    p.page = pg;
    p.filet(46, GRIS, 0.6);
    p.ecrire(`À retourner complété : par e-mail à ${CONTACT_ENQUETE} ou à déposer chez Strat Eco, ${ADRESSE_STRAT_ECO}`, MARGE, 34, 7.4, { style: "gras", couleur: VERT_FONCE });
    p.ecrire("Strat Eco - Stratégie d'économies d'énergie · www.strateco.fr", MARGE, 23, 7, { couleur: ARDOISE });
    p.ecrire(`${input.copro.nom} · page ${i + 1} / ${pages.length}`, PAGE.w - MARGE, 23, 7, { couleur: ARDOISE, align: "right" });
  });

  return doc.save();
}

export function nomFichierQuestionnaireEnquete(coproNom: string): string {
  return `${coproNom} - Questionnaire d'enquête sociale et technique.pdf`.replace(/[\\/:*?"<>|]/g, " ");
}
