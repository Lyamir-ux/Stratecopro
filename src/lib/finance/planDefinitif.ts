// Plan de financement définitif — nomenclature « chef de projet » (classeur Excel).
// Module pur : reproduit chaque formule du classeur de référence (Les Violettes)
// pour que toute modification saisie dans le logiciel recalcule le plan à l'identique.
//
// Structure du classeur reproduite :
//   - onglets « Lot NN … » : lignes de devis avec colonne « Retenu » (oui/non).
//     « Retenu » = le montant entre dans l'assiette travaux servant au calcul
//     des aides MaPrimeRénov' (plafonnée à 25 000 € HT par logement).
//   - onglet « PF définitif Eco PTZ collectif » : financement par prêt collectif
//     avec prêt avance de subventions (les aides publiques sont avancées, le coût
//     de l'avance est payé en une fois à la fin des travaux).
//   - onglet « PF définitif Eco PTZ individuel » : appels de fonds avec déduction
//     de 70 % des aides seulement, les 30 % restants remboursés en fin de chantier.

// ---------- Lignes de lots travaux ----------

export interface LigneLot {
  designation: string;
  /** Groupe de la colonne A (« Amélioration énergétique », « Amélioration état »…). */
  groupe?: string;
  /** true = montant retenu dans l'assiette MaPrimeRénov'. */
  retenu: boolean;
  montantHt: number;
  /** Taux de TVA de la ligne (5.5, 10, 20). */
  tvaPct: number;
  commentaire?: string;
}

export interface LotTravaux {
  /** Numéro du lot (2, 3, … 10). */
  numero: number;
  titre: string;
  entreprise?: string;
  /** Remise commerciale (%) appliquée au total HT du lot (0 si aucune). */
  remisePct: number;
  lignes: LigneLot[];
}

// ---------- MOE et frais annexes ----------

export type PhaseMoe = "etude" | "projet" | "travaux";

export const PHASES_MOE: { id: PhaseMoe; label: string }[] = [
  { id: "etude", label: "1. Phase Étude" },
  { id: "projet", label: "2. Phase Projet" },
  { id: "travaux", label: "3. Phase Travaux" },
];

/** Montant d'une ligne MOE : forfait HT saisi, ou pourcentage des travaux (suit les travaux). */
export type MontantMoe =
  | { mode: "forfait"; montantHt: number }
  | { mode: "pctTravauxHt"; taux: number }
  | { mode: "pctTravauxTtc"; taux: number };

export interface LigneMoe {
  designation: string;
  /** Entreprise / prestataire de la mission — repris au suivi financier du syndic. */
  entreprise?: string;
  phase: PhaseMoe;
  montant: MontantMoe;
  /** TVA appliquée au HT (0 pour une prime d'assurance type dommage-ouvrage). */
  tvaPct: number;
  /** Entre dans l'assiette MaPrimeRénov' « partie études » (45 % au prorata énergétique). */
  eligibleMprEtudes: boolean;
  /** Prestation AMO — assiette MaPrimeRénov' AMO (50 % du HT). */
  eligibleMprAmo: boolean;
  commentaire?: string;
}

// ---------- Aides ----------

/**
 * Mode de calcul d'une aide — chaque mode correspond à une formule du classeur :
 *  - parM2Shab        : CEE coup de pouce (27 €/m² × coef de prudence 0,9)
 *  - pctAssietteTravaux: MPR travaux (45 % de l'assiette retenue × 0,9)
 *  - pctEtudes        : MPR études (45 % du HT des lignes éligibles × 0,9 × prorata énergétique)
 *  - pctAmo           : MPR AMO (50 % du HT AMO)
 *  - forfaitPlusParLogement : Climaxion travaux (10 000 + 2 500 €/logt équivalent)
 *  - parLogement      : EMS travaux (1 000 €/logt équiv.), EMS BBC (500 €/logt)
 *  - manuel           : montant saisi (EMS MOE, EMS AMO…)
 *  - info             : ligne informative sans montant collectif (aides individuelles)
 */
export type ModeAide =
  | { mode: "manuel"; montant: number }
  | { mode: "parM2Shab"; tauxEurM2: number; coef: number }
  | { mode: "pctAssietteTravaux"; taux: number; coef: number }
  | { mode: "pctEtudes"; taux: number; coef: number }
  | { mode: "pctAmo"; taux: number }
  | { mode: "forfaitPlusParLogement"; base: number; parLogement: number; surEquivalent: boolean }
  | { mode: "parLogement"; montant: number; surEquivalent: boolean }
  | { mode: "info" };

export interface AideDef {
  id: string;
  /** Groupe de la colonne A (CEE, ANAH, Climaxion, EMS…). */
  groupe: string;
  libelle: string;
  calcul: ModeAide;
  /** false pour la prime CEE (aide privée) — exclue du « Total aides publiques ». */
  publique: boolean;
  commentaire?: string;
}

// ---------- Données du plan ----------

export interface InfosPlan {
  nomCopro: string;
  adresse: string;
  nbLogements: number;
  /** Logements + équivalents (surface tertiaire / 75). */
  nbLogementsEquiv: number;
  /** Surface habitable ou équivalent (tertiaire chauffé additionné). */
  surfaceHabitable: number;
  nbEtages: number;
  nbEntrees: number;
  typeChauffage: string;
  /** Consommation énergie primaire initiale (kWhEP/m²/an). */
  cepInitial: number;
  /** Consommation énergie primaire projet (kWhEP/m²/an). */
  cepProjet: number;
  dispositifClimaxion: boolean;
  /** Étiquettes énergétiques avant/après (« De E à C »). */
  etiquetteInitiale: string;
  etiquetteProjet: string;
}

export interface ParamsFinancement {
  /** Imprévus appliqués au TTC travaux (%). */
  imprevusPct: number;
  /** Plafond de l'assiette MPR travaux (€ HT / logement). */
  plafondTravauxParLogement: number;
  /** Garde-fou MPR travaux (€ / logement). */
  plafondMprParLogement: number;
  /** Garde-fou AMO (€ HT / logement). */
  plafondAmoParLogement: number;
  /** Fonds travaux (loi ALUR) mobilisé. */
  fondsTravaux: number;
  commentaireFondsTravaux?: string;
  /** Total de tantièmes de la copropriété (base des quotes-parts). */
  totalTantiemes: number;
  /** Tantièmes des lots donnés en exemple dans le plan. */
  tantiemesExemples: number[];
  /** Durée de l'éco-PTZ (ans) pour les mensualités d'exemple. */
  dureeEcoPtzAns: number;
  /** Coefficient d'assurance emprunteur non solidaire appliqué aux mensualités (1,03 = +3 %). */
  coefAssurance: number;
  /** Coût du prêt avance de subventions (% des aides publiques, payé en une fois). */
  tauxPretAvancePct: number;
  /** Part des aides publiques déduite des appels de fonds (variante individuelle, %). */
  pctAvanceAides: number;
}

/** Variantes de financement présentées dans le plan : seules les variantes
 *  concernées par le projet sont affichées (éditeur) et exportées (classeur).
 *  À l'import, elles suivent les onglets « PF définitif … » du fichier. */
export interface VariantesPlan {
  collectif: boolean;
  /** Éco-PTZ collectif sans prêt d'avance : les subventions ne sont pas
   *  préfinancées, aucun coût d'avance (5,45 %) n'est facturé. */
  collectifSansAvance: boolean;
  individuel: boolean;
}

export interface PlanDefinitifData {
  infos: InfosPlan;
  lots: LotTravaux[];
  moe: LigneMoe[];
  aides: AideDef[];
  params: ParamsFinancement;
  variantes: VariantesPlan;
  /**
   * Clé de répartition (code) choisie par item pour les plans individuels —
   * clés « lot:<numero> » / « moe:<index> » (voir repartitionPf.ts). Inutile
   * quand la copropriété n'a qu'une seule clé (tout est réparti avec elle).
   */
  repartitionCles?: Record<string, string>;
}

// ---------- Résultats ----------

export interface LotResult {
  numero: number;
  titre: string;
  entreprise?: string;
  totalHt: number;
  remise: number;
  totalHtApresRemise: number;
  /** Assiette MPR du lot : lignes retenues, remise déduite. */
  totalHtRetenu: number;
  /** TVA par taux, calculée sur les montants avant remise (convention du classeur). */
  tvaParTaux: { taux: number; montant: number }[];
  totalTtc: number;
}

export interface MoeLigneResult {
  designation: string;
  entreprise?: string;
  phase: PhaseMoe;
  montantHt: number;
  montantTtc: number;
}

export interface AideResult {
  id: string;
  groupe: string;
  libelle: string;
  /** null pour les lignes informatives (aides individuelles). */
  montant: number | null;
  publique: boolean;
  commentaire?: string;
}

export interface ExempleTantieme {
  tantiemes: number;
  /** Quote-part avant déduction des aides (sur le total phase travaux TTC). */
  quotePartAvant: number;
}

export interface ExempleCollectif extends ExempleTantieme {
  /** Reste à financer après aides publiques (la prime CEE arrive en fin de travaux). */
  resteAFinancer: number;
  mensualiteEcoPtz: number;
  subventionsPubliques: number;
  coutPretAvance: number;
  primeCee: number;
  /** Reste à financer + coût du prêt avance − prime CEE. */
  prixRevient: number;
}

export interface ExempleCollectifSansAvance extends ExempleTantieme {
  /** Reste à financer après aides publiques (la prime CEE arrive en fin de travaux). */
  resteAFinancer: number;
  mensualiteEcoPtz: number;
  subventionsPubliques: number;
  primeCee: number;
  /** Reste à financer − prime CEE (aucun coût d'avance). */
  prixRevient: number;
}

export interface ExempleIndividuel extends ExempleTantieme {
  /** Prix de revient après déduction de toutes les aides et du fonds travaux. */
  prixRevient: number;
  /** Appels de fonds avec seulement 70 % des aides déduites. */
  appelsFonds: number;
  /** Remboursement des 30 % d'aides en fin de chantier. */
  remboursementFinChantier: number;
  mensualiteEcoPtz: number;
}

export interface GardeFou {
  libelle: string;
  valeur: number;
  plafond: number;
  ok: boolean;
}

export interface PlanDefinitifResult {
  /** Gain énergétique du scénario (%). */
  performancePct: number;
  lots: LotResult[];
  totalTravauxHt: number;
  /** Somme des lignes retenues (remises déduites), avant plafonnement. */
  travauxRetenusHt: number;
  /** Assiette MPR travaux = min(retenu, plafond × logements). */
  assietteMprTravaux: number;
  plafondAssiette: number;
  totalTravauxTtc: number;
  totalTravauxTtcImprevus: number;
  moe: MoeLigneResult[];
  totalMoeTtc: number;
  /** Toutes phases : travaux TTC avec imprévus + MOE et annexes. */
  totalOperationTtc: number;
  /** Total restant en phase travaux TTC (travaux + imprévus + MOE phase travaux). */
  totalPhaseTravauxTtc: number;
  aides: AideResult[];
  totalAides: number;
  totalAidesPubliques: number;
  primeCee: number;
  tauxCouverture: number;
  /** Reste à charge collectif après toutes aides et fonds travaux. */
  resteACharge: number;
  coutTantiemeAvant: number;
  collectif: {
    /** Reste à charge + prime CEE (perçue en fin de travaux). */
    resteAFinancer: number;
    coutTantiemeApres: number;
    exemples: ExempleCollectif[];
  };
  /** Variante sans prêt d'avance de subventions — mêmes montants financés,
   *  aucun coût d'avance. Absent des instantanés `resultat` antérieurs. */
  collectifSansAvance: {
    resteAFinancer: number;
    coutTantiemeApres: number;
    exemples: ExempleCollectifSansAvance[];
  };
  individuel: {
    aidesAvancees: number;
    aidesFinChantier: number;
    /** Appels de fonds totaux avec 70 % des aides déduites. */
    appelsFonds: number;
    coutTantiemeApresAides: number;
    coutTantiemeAvecAvance: number;
    exemples: ExempleIndividuel[];
  };
  gardeFous: GardeFou[];
}

// ---------- Calculs ----------

function htLigneMoe(m: MontantMoe, travauxHt: number, travauxTtc: number): number {
  switch (m.mode) {
    case "forfait":
      return m.montantHt;
    case "pctTravauxHt":
      return (travauxHt * m.taux) / 100;
    case "pctTravauxTtc":
      return (travauxTtc * m.taux) / 100;
  }
}

export function computeLot(lot: LotTravaux): LotResult {
  const totalHt = lot.lignes.reduce((s, l) => s + l.montantHt, 0);
  const remise = (totalHt * lot.remisePct) / 100;
  const totalHtApresRemise = totalHt - remise;
  const retenuBrut = lot.lignes.filter((l) => l.retenu).reduce((s, l) => s + l.montantHt, 0);
  const totalHtRetenu = retenuBrut * (1 - lot.remisePct / 100);
  const parTaux = new Map<number, number>();
  for (const l of lot.lignes) parTaux.set(l.tvaPct, (parTaux.get(l.tvaPct) ?? 0) + l.montantHt);
  const tvaParTaux = [...parTaux.entries()]
    .map(([taux, base]) => ({ taux, montant: (base * taux) / 100 }))
    .filter((t) => t.montant !== 0)
    .sort((a, b) => b.taux - a.taux);
  const totalTtc = totalHtApresRemise + tvaParTaux.reduce((s, t) => s + t.montant, 0);
  return {
    numero: lot.numero,
    titre: lot.titre,
    entreprise: lot.entreprise,
    totalHt,
    remise,
    totalHtApresRemise,
    totalHtRetenu,
    tvaParTaux,
    totalTtc,
  };
}

export function computePlanDefinitif(data: PlanDefinitifData): PlanDefinitifResult {
  const { infos, params } = data;
  const performancePct = infos.cepInitial > 0 ? 100 - (100 * infos.cepProjet) / infos.cepInitial : 0;

  // Travaux
  const lots = data.lots.map(computeLot);
  const totalTravauxHt = lots.reduce((s, l) => s + l.totalHtApresRemise, 0);
  const travauxRetenusHt = lots.reduce((s, l) => s + l.totalHtRetenu, 0);
  const plafondAssiette = params.plafondTravauxParLogement * infos.nbLogements;
  const assietteMprTravaux = Math.min(travauxRetenusHt, plafondAssiette);
  const totalTravauxTtc = lots.reduce((s, l) => s + l.totalTtc, 0);
  const totalTravauxTtcImprevus = totalTravauxTtc * (1 + params.imprevusPct / 100);

  // MOE et frais annexes
  const moe: MoeLigneResult[] = data.moe.map((l) => {
    const ht = htLigneMoe(l.montant, totalTravauxHt, totalTravauxTtc);
    return {
      designation: l.designation,
      entreprise: l.entreprise,
      phase: l.phase,
      montantHt: ht,
      montantTtc: ht * (1 + l.tvaPct / 100),
    };
  });
  const totalMoeTtc = moe.reduce((s, l) => s + l.montantTtc, 0);
  const totalOperationTtc = totalTravauxTtcImprevus + totalMoeTtc;
  const totalPhaseTravauxTtc =
    totalTravauxTtcImprevus + moe.filter((l) => l.phase === "travaux").reduce((s, l) => s + l.montantTtc, 0);

  // Assiettes MPR études / AMO (HT des lignes éligibles)
  const htEtudes = data.moe.reduce(
    (s, l, i) => s + (l.eligibleMprEtudes ? moe[i].montantHt : 0),
    0
  );
  const htAmo = data.moe.reduce((s, l, i) => s + (l.eligibleMprAmo ? moe[i].montantHt : 0), 0);
  /** Prorata énergétique : part des travaux retenus MPR dans le total travaux HT. */
  const prorataEnergetique = totalTravauxHt > 0 ? assietteMprTravaux / totalTravauxHt : 0;

  // Aides
  const aides: AideResult[] = data.aides.map((a) => {
    let montant: number | null;
    const c = a.calcul;
    switch (c.mode) {
      case "manuel":
        montant = c.montant;
        break;
      case "parM2Shab":
        montant = infos.surfaceHabitable * c.tauxEurM2 * c.coef;
        break;
      case "pctAssietteTravaux":
        montant = assietteMprTravaux * (c.taux / 100) * c.coef;
        break;
      case "pctEtudes":
        montant = htEtudes * (c.taux / 100) * c.coef * prorataEnergetique;
        break;
      case "pctAmo":
        montant = htAmo * (c.taux / 100);
        break;
      case "forfaitPlusParLogement":
        montant = c.base + c.parLogement * (c.surEquivalent ? infos.nbLogementsEquiv : infos.nbLogements);
        break;
      case "parLogement":
        montant = c.montant * (c.surEquivalent ? infos.nbLogementsEquiv : infos.nbLogements);
        break;
      case "info":
        montant = null;
        break;
    }
    return { id: a.id, groupe: a.groupe, libelle: a.libelle, montant, publique: a.publique, commentaire: a.commentaire };
  });
  const totalAides = aides.reduce((s, a) => s + (a.montant ?? 0), 0);
  const totalAidesPubliques = aides.reduce((s, a) => s + (a.publique ? (a.montant ?? 0) : 0), 0);
  const primeCee = totalAides - totalAidesPubliques;

  // Indicateurs communs
  const tauxCouverture = totalPhaseTravauxTtc > 0 ? totalAides / totalPhaseTravauxTtc : 0;
  const resteACharge = totalPhaseTravauxTtc - (totalAides + params.fondsTravaux);
  const T = params.totalTantiemes || 10000;
  const coutTantiemeAvant = totalPhaseTravauxTtc / T;
  const mois = params.dureeEcoPtzAns * 12;

  // Variante prêt collectif + avance de subventions
  const resteAFinancer = resteACharge + primeCee;
  const collectif = {
    resteAFinancer,
    coutTantiemeApres: resteAFinancer / T,
    exemples: params.tantiemesExemples.map((t): ExempleCollectif => {
      const part = t / T;
      const resteAFinancerPart = resteAFinancer * part;
      const coutPretAvance = totalAidesPubliques * (params.tauxPretAvancePct / 100) * part;
      const primeCeePart = primeCee * part;
      return {
        tantiemes: t,
        quotePartAvant: totalPhaseTravauxTtc * part,
        resteAFinancer: resteAFinancerPart,
        mensualiteEcoPtz: mois > 0 ? (resteAFinancerPart / mois) * params.coefAssurance : 0,
        subventionsPubliques: totalAidesPubliques * part,
        coutPretAvance,
        primeCee: primeCeePart,
        prixRevient: resteAFinancerPart - primeCeePart + coutPretAvance,
      };
    }),
  };

  // Variante prêt collectif sans avance de subventions : mêmes montants
  // financés, mais les subventions ne sont pas préfinancées — aucun coût
  // d'avance, le prix de revient baisse d'autant
  const collectifSansAvance = {
    resteAFinancer,
    coutTantiemeApres: resteAFinancer / T,
    exemples: params.tantiemesExemples.map((t): ExempleCollectifSansAvance => {
      const part = t / T;
      const resteAFinancerPart = resteAFinancer * part;
      const primeCeePart = primeCee * part;
      return {
        tantiemes: t,
        quotePartAvant: totalPhaseTravauxTtc * part,
        resteAFinancer: resteAFinancerPart,
        mensualiteEcoPtz: mois > 0 ? (resteAFinancerPart / mois) * params.coefAssurance : 0,
        subventionsPubliques: totalAidesPubliques * part,
        primeCee: primeCeePart,
        prixRevient: resteAFinancerPart - primeCeePart,
      };
    }),
  };

  // Variante éco-PTZ individuel : appels de fonds avec avance partielle des aides
  const aidesAvancees = totalAidesPubliques * (params.pctAvanceAides / 100);
  const aidesFinChantier = totalAidesPubliques - aidesAvancees;
  const appelsFonds = totalPhaseTravauxTtc - (aidesAvancees + params.fondsTravaux);
  const coutTantiemeApresAides = resteACharge / T;
  const coutTantiemeAvecAvance = appelsFonds / T;
  const individuel = {
    aidesAvancees,
    aidesFinChantier,
    appelsFonds,
    coutTantiemeApresAides,
    coutTantiemeAvecAvance,
    exemples: params.tantiemesExemples.map((t): ExempleIndividuel => {
      const appels = coutTantiemeAvecAvance * t;
      return {
        tantiemes: t,
        quotePartAvant: coutTantiemeAvant * t,
        prixRevient: coutTantiemeApresAides * t,
        appelsFonds: appels,
        remboursementFinChantier: (coutTantiemeAvecAvance - coutTantiemeApresAides) * t,
        mensualiteEcoPtz: mois > 0 ? (appels / mois) * params.coefAssurance : 0,
      };
    }),
  };

  // Garde-fous
  const nb = infos.nbLogements || 1;
  const montantMprTravaux = data.aides.reduce(
    (s, a, i) => (a.calcul.mode === "pctAssietteTravaux" ? s + (aides[i].montant ?? 0) : s),
    0
  );
  const gardeFous: GardeFou[] = [
    {
      libelle: `Plafond travaux < ${params.plafondTravauxParLogement / 1000} K€/logt`,
      valeur: assietteMprTravaux / nb,
      plafond: params.plafondTravauxParLogement,
      ok: assietteMprTravaux / nb <= params.plafondTravauxParLogement,
    },
    {
      libelle: `MPR travaux < ${params.plafondMprParLogement.toLocaleString("fr-FR")} €/logt`,
      valeur: montantMprTravaux / nb,
      plafond: params.plafondMprParLogement,
      ok: montantMprTravaux / nb <= params.plafondMprParLogement,
    },
    {
      libelle: `AMO < ${params.plafondAmoParLogement} €/logt`,
      valeur: htAmo / nb,
      plafond: params.plafondAmoParLogement,
      ok: htAmo / nb <= params.plafondAmoParLogement,
    },
  ];

  return {
    performancePct,
    lots,
    totalTravauxHt,
    travauxRetenusHt,
    assietteMprTravaux,
    plafondAssiette,
    totalTravauxTtc,
    totalTravauxTtcImprevus,
    moe,
    totalMoeTtc,
    totalOperationTtc,
    totalPhaseTravauxTtc,
    aides,
    totalAides,
    totalAidesPubliques,
    primeCee,
    tauxCouverture,
    resteACharge,
    coutTantiemeAvant,
    collectif,
    collectifSansAvance,
    individuel,
    gardeFous,
  };
}

// ---------- Valeurs par défaut (nomenclature Strat Eco) ----------

/** Catalogue d'aides par défaut — formules du classeur de référence. */
export function makeAidesDefaut(): AideDef[] {
  return [
    {
      id: "cee",
      groupe: "CEE",
      libelle: "Coup de pouce CEE",
      calcul: { mode: "parM2Shab", tauxEurM2: 27, coef: 0.9 },
      publique: false,
      commentaire: "Dépend des lots de travaux énergétiques et de la surface habitable",
    },
    {
      id: "mpr-travaux",
      groupe: "ANAH",
      libelle: "Maprimerénov' partie travaux",
      calcul: { mode: "pctAssietteTravaux", taux: 45, coef: 0.9 },
      publique: true,
      commentaire: "45 % du montant des travaux énergétiques HT - plafonné à 11 250 € par logement",
    },
    {
      id: "mpr-etudes",
      groupe: "ANAH",
      libelle: "Maprimerénov' partie études",
      calcul: { mode: "pctEtudes", taux: 45, coef: 0.9 },
      publique: true,
      commentaire: "45 % du montant des études, diags, maîtrise d'œuvre HT",
    },
    {
      id: "mpr-amo",
      groupe: "ANAH",
      libelle: "Maprimerénov' AMO",
      calcul: { mode: "pctAmo", taux: 50 },
      publique: true,
      commentaire: "50 % du montant de la prestation d'assistance à maîtrise d'ouvrage HT",
    },
    {
      id: "mpr-indiv",
      groupe: "ANAH",
      libelle: "Maprimerénov' individuelle",
      calcul: { mode: "info" },
      publique: true,
      commentaire: "Aide individuelle de 1 500 € ou de 3 000 € selon revenus du copropriétaire occupant",
    },
    {
      id: "climaxion-travaux",
      groupe: "Climaxion",
      libelle: "Climaxion aide travaux",
      calcul: { mode: "forfaitPlusParLogement", base: 10000, parLogement: 2500, surEquivalent: true },
      publique: true,
      commentaire: "Dispositif Climaxion sous réserves d'éligibilités",
    },
    {
      id: "climaxion-indiv",
      groupe: "Climaxion",
      libelle: "Climaxion individuelle",
      calcul: { mode: "info" },
      publique: true,
      commentaire: "1 000 € par logement pour changement de l'intégralité des vitrages d'un logement",
    },
    {
      id: "ems-travaux",
      groupe: "EMS",
      libelle: "EMS aide travaux",
      calcul: { mode: "parLogement", montant: 1000, surEquivalent: true },
      publique: true,
      commentaire: "Dispositif EMS suivant le cahier des charges de Climaxion",
    },
    {
      id: "ems-moe",
      groupe: "EMS",
      libelle: "EMS aide MOE",
      calcul: { mode: "manuel", montant: 15000 },
      publique: true,
      commentaire: "Dispositif EMS pour la maîtrise d'œuvre",
    },
    {
      id: "ems-amo",
      groupe: "EMS",
      libelle: "EMS aide AMO",
      calcul: { mode: "manuel", montant: 3000 },
      publique: true,
      commentaire: "Dispositif EMS pour l'assistance à maîtrise d'ouvrage",
    },
    {
      id: "ems-bbc",
      groupe: "EMS",
      libelle: "EMS BBC rénovation",
      calcul: { mode: "parLogement", montant: 500, surEquivalent: false },
      publique: true,
      commentaire: "Dispositif EMS pour le scénario BBC rénovation en cas d'atteinte de 110 kWhEp/m²/an",
    },
  ];
}

export function makeDefaultPlanDefinitif(): PlanDefinitifData {
  return {
    infos: {
      nomCopro: "",
      adresse: "",
      nbLogements: 0,
      nbLogementsEquiv: 0,
      surfaceHabitable: 0,
      nbEtages: 0,
      nbEntrees: 0,
      typeChauffage: "",
      cepInitial: 0,
      cepProjet: 0,
      dispositifClimaxion: false,
      etiquetteInitiale: "",
      etiquetteProjet: "",
    },
    lots: [],
    moe: [],
    aides: makeAidesDefaut(),
    params: {
      imprevusPct: 7,
      plafondTravauxParLogement: 25000,
      plafondMprParLogement: 11250,
      plafondAmoParLogement: 600,
      fondsTravaux: 0,
      totalTantiemes: 10000,
      tantiemesExemples: [],
      dureeEcoPtzAns: 20,
      coefAssurance: 1.03,
      tauxPretAvancePct: 5.45,
      pctAvanceAides: 70,
    },
    variantes: { collectif: true, collectifSansAvance: false, individuel: true },
  };
}

/** Relit un jsonb en le complétant avec les défauts (schéma évolutif). */
export function readPlanDefinitif(json: unknown): PlanDefinitifData {
  const raw = (json ?? {}) as Partial<PlanDefinitifData>;
  const def = makeDefaultPlanDefinitif();
  return {
    infos: { ...def.infos, ...(raw.infos ?? {}) },
    lots: raw.lots ?? [],
    moe: raw.moe ?? [],
    aides: raw.aides && raw.aides.length ? raw.aides : def.aides,
    params: { ...def.params, ...(raw.params ?? {}) },
    variantes: { ...def.variantes, ...(raw.variantes ?? {}) },
    repartitionCles: raw.repartitionCles ?? {},
  };
}
