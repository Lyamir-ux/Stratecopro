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
  nom: { x: 150, y: 704, size: 9, max: 70 },
  rue: { x: 150, y: 681, size: 9, max: 35 },
  cp: { x: 140, y: 649, size: 9, max: 10 },
  ville: { x: 218, y: 649, size: 9, max: 35 },
  pays: { x: 150, y: 628, size: 9, max: 25 },
  iban: { x0: 141, y: 592, pas: 14.45, size: 10 },
  bic: { x0: 141, y: 561, pas: 14.45, size: 10 },
  caseRecurrent: { x: 130, y: 411 },
  lieu: { x: 152, y: 401, size: 9, max: 28 },
  dateDigits: { xs: [297, 311, 338, 352, 380, 394, 408, 421], y: 402, size: 10 },
} as const;
