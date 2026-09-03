// Coordonnées de remplissage des gabarits PDF (public/modeles/).
// Origine en bas à gauche (convention PDF). Calibrées sur les gabarits CEGEE
// via extraction pdfjs - ajuster ici si la banque change de mise en page.

export interface TextSpot {
  x: number;
  y: number;
  size?: number;
  /** longueur maximale (troncature défensive) */
  max?: number;
}

export const BULLETIN_COORDS = {
  adresseImmeuble: { x: 262, y: 733, size: 7.5, max: 60 },
  nomSyndic: { x: 324, y: 719, size: 8, max: 40 },
  interlocuteur: { x: 312, y: 702, size: 8, max: 40 },
  a1: {
    nomPrenom: { x: 106, y: 596, size: 8, max: 48 },
    nomNaissance: { x: 120, y: 584, size: 8, max: 45 },
    dateLieuNaissance: { x: 148, y: 572, size: 8, max: 40 },
    profession: { x: 84, y: 560, size: 8, max: 26 },
    professionDepuis: { x: 240, y: 560, size: 8, max: 12 },
    cases: {
      mariee: { x: 37, y: 548 },
      divorcee: { x: 95, y: 548 },
      pacsee: { x: 155, y: 548 },
      veuve: { x: 211, y: 548 },
      celibataire: { x: 221, y: 535 },
    },
    situationDepuis: { x: 80, y: 535, size: 8, max: 12 },
    signature: { x: 228, y: 137, w: 120, h: 46 },
  },
  a2: {
    nomPrenom: { x: 378, y: 596, size: 8, max: 48 },
    nomNaissance: { x: 392, y: 584, size: 8, max: 45 },
    dateLieuNaissance: { x: 420, y: 572, size: 8, max: 40 },
    profession: { x: 357, y: 560, size: 8, max: 26 },
    professionDepuis: { x: 508, y: 560, size: 8, max: 12 },
    cases: {
      mariee: { x: 309, y: 548 },
      divorcee: { x: 363, y: 548 },
      pacsee: { x: 423, y: 548 },
      veuve: { x: 479, y: 548 },
      celibataire: { x: 493, y: 535 },
    },
    situationDepuis: { x: 352, y: 535, size: 8, max: 12 },
    signature: { x: 400, y: 137, w: 120, h: 46 },
  },
  lots: { x: 120, y: 514, size: 9, max: 40 },
  tantiemes: { x: 402, y: 514, size: 9, max: 30 },
  adresse: { x: 140, y: 488, size: 8, max: 95 },
  cp: { x: 100, y: 476, size: 8, max: 10 },
  ville: { x: 330, y: 476, size: 8, max: 40 },
  telDomicile: { x: 102, y: 464, size: 8, max: 18 },
  telBureau: { x: 264, y: 464, size: 8, max: 18 },
  portable: { x: 427, y: 464, size: 8, max: 18 },
  email: { x: 84, y: 452, size: 8, max: 70 },
  case100: { x: 173, y: 355 },
  caseAutre: { x: 174, y: 315 },
  montantAutre: { x: 230, y: 304, size: 9, max: 16 },
  faitA: { x: 242, y: 223, size: 9, max: 28 },
  dateJJ: { x: 414, y: 223, size: 9 },
  dateMM: { x: 452, y: 223, size: 9 },
  dateAAAA: { x: 486, y: 223, size: 9 },
} as const;

export const SEPA_COORDS = {
  // Recalibré le 03/09/2026 (feedback : décalages code postal / IBAN / BIC / date)
  // à partir des rectangles du gabarit TRA929 (11/2018) : chaque ligne a une
  // zone de saisie (13-14 pt de haut) suivie d'un sous-libellé.
  nom: { x: 143, y: 700.5, size: 9, max: 70 },
  rue: { x: 143, y: 673, size: 9, max: 35 },
  /** 5 cases individuelles (13 pt de large) - un chiffre centré par case */
  cp: { xs: [139.8, 153.5, 167.1, 181.2, 194.9], w: 13, y: 645, size: 10 },
  ville: { x: 213, y: 645, size: 9, max: 60 },
  pays: { x: 143, y: 620, size: 9, max: 25 },
  /** 33 cases de 10,4 pt (pas ≈ 11,45 pt), y de 591,4 à 604,4 */
  iban: {
    xs: [
      139.1, 150.2, 161.4, 172.5, 184.1, 195.2, 206.8, 218.3, 229.8, 241.0, 252.5,
      264.1, 275.6, 286.7, 298.3, 309.8, 320.9, 332.5, 344.0, 355.5, 366.7, 378.2,
      389.8, 401.3, 412.8, 424.3, 435.5, 447.0, 458.6, 469.7, 481.2, 492.8, 503.9,
    ],
    w: 10.4,
    y: 594.5,
    size: 10,
  },
  /** 11 cases, même pas que l'IBAN, y de 562,6 à 575,6 */
  bic: {
    xs: [139.1, 150.2, 161.4, 172.5, 184.1, 195.2, 206.8, 218.3, 229.8, 241.0, 252.5],
    w: 10.4,
    y: 566,
    size: 10,
  },
  /** Carré de 4,3 pt à DROITE du libellé « Paiement récurrent / répétitif » */
  caseRecurrent: { x: 220.8, y: 410.9, w: 4.3 },
  lieu: { x: 142, y: 395.5, size: 9, max: 30 },
  /** JJ / MM / AAAA : 8 cases de 12,6 pt (les séparateurs sont des cases vides).
   *  Les lettres-repères J/M/A imprimées dans les cases sont masquées en blanc
   *  (boxY/boxH = emprise de la case) avant d'écrire le chiffre. */
  dateDigits: {
    xs: [291.1, 304.8, 332.5, 346.2, 373.2, 388.0, 401.3, 415.0],
    w: 12.6,
    y: 395,
    size: 10,
    boxY: 392.2,
    boxH: 13,
  },
} as const;
