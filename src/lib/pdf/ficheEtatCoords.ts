// Calibrage du gabarit public/modeles/fiche-etat-anah.pdf (3 pages A4) : le
// modèle ANAH Fiche_Etat_ZORN.docx vidé de ses valeurs puis exporté en PDF
// par Word le 23/09/2026. Rectangles des cellules de valeur relevés dans le
// content stream (opérateurs `re` + CTM, méthode de coords.ts) - en points,
// origine en bas à gauche. Si le gabarit est régénéré, relever à nouveau.

export interface CaseFiche {
  /** Index de page (0 à 2). */
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const V = (page: number, y: number, h: number): CaseFiche => ({ page, x: 288.5, y, w: 225.3, h });
const F = (y: number, h: number): CaseFiche => ({ page: 2, x: 295.9, y, w: 221.4, h });

/** Cellule de valeur de chaque champ de SECTIONS_FICHE (src/lib/ficheEtat.ts). */
export const CASES_FICHE: Record<string, CaseFiche> = {
  // page 1 - identité, contacts
  copro_nom: V(0, 510.1, 14.3),
  copro_voie: V(0, 485.4, 18.2),
  copro_cp: V(0, 439.0, 39.7),
  copro_commune: V(0, 416.1, 16.4),
  epci: V(0, 395.3, 14.2),
  region: V(0, 375.1, 14.3),
  assurance_mri: V(0, 342.1, 27.2),
  immatriculation: V(0, 322.1, 14.2),
  npnru: V(0, 302.1, 14.3),
  pcs_nom: V(0, 236.8, 14.3),
  pcs_adresse: V(0, 216.7, 14.3),
  pcs_tel: V(0, 196.8, 14.3),
  pcs_email: V(0, 176.8, 14.3),
  syndic_nom: V(0, 136.1, 14.2),
  syndic_gestionnaire: V(0, 115.3, 14.2),
  syndic_adresse: V(0, 94.6, 14.2),
  syndic_tel: V(0, 73.8, 14.3),
  syndic_email: V(0, 47.9, 19.4),
  // page 2 - informations générales, occupation, fonctionnement, bâti
  nb_batiments: V(1, 769.4, 13.4),
  nb_lots: V(1, 749.5, 14.3),
  tantiemes_ccg: V(1, 716.4, 26.9),
  nb_lots_hab: V(1, 695.6, 14.3),
  pct_lots_hab: V(1, 662.3, 26.9),
  tantiemes_hab: V(1, 641.5, 14.3),
  pct_tantiemes_hab: V(1, 608.1, 26.9),
  nb_proprietaires: V(1, 564.3, 17.8),
  nb_po: V(1, 544.3, 14.3),
  tantiemes_po: V(1, 524.2, 14.3),
  nb_pb: V(1, 504.3, 14.2),
  tantiemes_pb: V(1, 484.3, 14.3),
  nb_po_modestes: V(1, 438.2, 40.3),
  nb_po_tres_modestes: V(1, 392.2, 40.3),
  rc_publie: V(1, 352.1, 14.3),
  type_syndic: V(1, 332.2, 14.3),
  nb_membres_cs: V(1, 312.2, 14.3),
  date_derniere_ag: V(1, 292.1, 14.3),
  pct_presents_ag: V(1, 259.6, 26.9),
  structure_chauffage: V(1, 226.6, 27.2),
  periode_construction: V(1, 186.6, 14.3),
  chaufferie_collective: V(1, 166.6, 14.3),
  chauffage_combustible: V(1, 146.5, 14.3),
  ecs_collective: V(1, 126.6, 14.3),
  ecs_combustible: V(1, 106.6, 14.3),
  arrete_insalubrite: V(1, 73.7, 27.1),
  arrete_peril: V(1, 40.7, 27.2),
  // page 3 - arrêtés (suite), étiquettes, situation financière
  arrete_equipements: V(2, 788.6, 14.3),
  injonction_plomb: V(2, 756.1, 26.8),
  nb_bat_gain35: { page: 2, x: 331.9, y: 596.5, w: 185.4, h: 27.3 },
  nb_log_gain35: { page: 2, x: 331.9, y: 568.0, w: 185.4, h: 22.4 },
  pct_charges_chauffage: F(494.8, 26.9),
  budget_n1: F(474.8, 14.3),
  impayes_n1: F(442.3, 26.8),
  budget_n2: F(422.2, 14.3),
  impayes_n2: F(389.6, 26.9),
  taux_impayes_8: F(330.2, 53.6),
  budget_n3: F(310.1, 14.3),
  impayes_n3: F(277.5, 26.9),
  dette_fournisseur_n1: F(257.5, 14.2),
};

// Grille des étiquettes (page 3) : colonnes A à G
const COLONNES_ETIQ: Record<string, { x: number; w: number }> = {
  A: { x: 99.1, w: 65.0 },
  B: { x: 164.5, w: 64.8 },
  C: { x: 229.8, w: 64.8 },
  D: { x: 295.2, w: 64.8 },
  E: { x: 360.6, w: 64.9 },
  F: { x: 425.8, w: 65.2 },
  G: { x: 491.4, w: 65.2 },
};
for (const [e, c] of Object.entries(COLONNES_ETIQ)) {
  CASES_FICHE[`etiq_bat_${e}`] = { page: 2, x: c.x, y: 677.5, w: c.w, h: 26.8 };
  CASES_FICHE[`etiq_log_${e}`] = { page: 2, x: c.x, y: 644.9, w: c.w, h: 26.9 };
}

/** Les deux premiers encadrés (page 1) : vue aérienne à gauche, plan de situation à droite. */
export const CASES_IMAGES = {
  aerienne: { page: 0, x: 38.8, y: 561.1, w: 249.4, h: 134.3 } as CaseFiche,
  situation: { page: 0, x: 288.5, y: 561.1, w: 225.3, h: 134.3 } as CaseFiche,
};

/** Zones sous « Signature du Président du Conseil Syndical » et « Signature et cachet du syndic » (page 3). */
export const CASES_SIGNATURES = {
  president_cs: { page: 2, x: 36, y: 92, w: 250, h: 86 } as CaseFiche,
  syndic: { page: 2, x: 360, y: 92, w: 200, h: 86 } as CaseFiche,
};
