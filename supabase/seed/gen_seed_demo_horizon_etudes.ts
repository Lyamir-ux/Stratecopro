// Générateur du seed « montants fictifs des copropriétés en phase études » de
// l'organisation de démo commerciale SYNDIC HORIZON GRAND EST
// (voir seed_demo_horizon.sql pour l'organisation, gen_seed_demo_horizon.ts
// pour la copro vitrine LE PARC DES CIGOGNES).
//
// Feedback Amir 06/09/2026 : le portefeuille /syndic n'affichait aucun montant
// (travaux, honoraires) pour les trois dossiers en phase études. Le portefeuille
// lit le total de l'opération TTC et les honoraires syndic dans le PF définitif
// validé (vue copro_stats + useHonorairesSyndic) : on dote donc chaque dossier
// en études d'un PF définitif validé fictif - c'est bien en phase études que le
// PF est établi (tâche « Plans de financement généraux et individuels »), avant
// la liasse pour l'AG. Pas de copropriétaires ni de plans individuels : le
// partage au portail n'intervient qu'ensuite.
//
// Comme pour la vitrine, on passe par le vrai moteur (computePlanDefinitif) pour
// que data et resultat soient rigoureusement ce que l'app aurait produit.
//
// Usage :  npx vite-node supabase/seed/gen_seed_demo_horizon_etudes.ts
// Produit : supabase/seed/seed_demo_horizon_etudes.sql (idempotent)
//
// Toutes les données sont FICTIVES (copropriétés, entreprises, montants).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  computePlanDefinitif,
  readPlanDefinitif,
  round2,
  type AideDef,
  type LigneMoe,
  type LotTravaux,
  type ParamsFinancement,
  type PlanDefinitifData,
} from "../../src/lib/finance";

// ---------------------------------------------------------------------------
// Briques communes
// ---------------------------------------------------------------------------

interface Copro {
  slug: string;
  nomPlan: string;
  data: PlanDefinitifData;
}

/** Lignes MOE et annexes : même ossature que le PF Boudhors / la vitrine, montants
 *  proportionnés à l'opération. `moeTravauxPct` = MOE phase travaux en % du HT. */
function moe(o: {
  amoConseil: number;
  amoProjet: number;
  amoTravaux: number;
  moeEtudes: number;
  moeConception: number;
  moeTravauxPct: number;
  audit: number;
  amiante: number;
  ctProjet: number;
  ctTravaux: number;
  cspsProjet: number;
  cspsTravaux: number;
  moeNom: string;
  climaxion: boolean;
}): LigneMoe[] {
  const f = (montantHt: number) => ({ mode: "forfait" as const, montantHt });
  const lignes: LigneMoe[] = [
    { phase: "etude", tvaPct: 20, montant: f(o.amoConseil), entreprise: "STRAT ECO", designation: "Assistance Maitrise d'Ouvrage (phase conseil)", commentaire: "Phase conseil, assistance technique et approche financiere", eligibleMprAmo: true, eligibleMprEtudes: false },
    { phase: "etude", tvaPct: 10, montant: f(o.moeEtudes), entreprise: o.moeNom, designation: "Maitrise d'oeuvre phase etudes (DIAG-AVP)", commentaire: "Etude, avant-projet", eligibleMprAmo: false, eligibleMprEtudes: true },
    { phase: "etude", tvaPct: 20, montant: f(o.audit), entreprise: "EST THERMO CONSEIL", designation: "Audit reglementaire", commentaire: "Mise a jour", eligibleMprAmo: false, eligibleMprEtudes: false },
    { phase: "etude", tvaPct: 20, montant: f(o.amiante), entreprise: "DIAG EXPERT 67", designation: "Diagnostic amiante avant travaux", eligibleMprAmo: false, eligibleMprEtudes: false },
    { phase: "projet", tvaPct: 20, montant: f(o.amoProjet), entreprise: "STRAT ECO", designation: "Assistance Maitrise d'Ouvrage (phase projet)", commentaire: "Prestation obligatoire, assistance projet, administrative, financiere", eligibleMprAmo: true, eligibleMprEtudes: false },
    { phase: "projet", tvaPct: 10, montant: f(o.moeConception), entreprise: o.moeNom, designation: "Maitrise d'oeuvre phase conception (PRO-DCE)", commentaire: "Cahiers des charges, depot de DP, DCE", eligibleMprAmo: false, eligibleMprEtudes: true },
    { phase: "projet", tvaPct: 20, montant: f(o.ctProjet), designation: "Controle technique", commentaire: "Prestations necessaires", eligibleMprAmo: false, eligibleMprEtudes: true },
    { phase: "projet", tvaPct: 20, montant: f(o.cspsProjet), designation: "CSPS", commentaire: "Prestations necessaires", eligibleMprAmo: false, eligibleMprEtudes: true },
  ];
  if (o.climaxion) {
    lignes.push(
      { phase: "projet", tvaPct: 20, montant: f(600), entreprise: "AERO TEST", designation: "Test d'etancheite a l'air avant travaux", commentaire: "Obligation Climaxion", eligibleMprAmo: false, eligibleMprEtudes: false },
      { phase: "projet", tvaPct: 20, montant: f(1800), entreprise: o.moeNom, designation: "Memoire technique Climaxion", eligibleMprAmo: false, eligibleMprEtudes: false }
    );
  }
  lignes.push(
    { phase: "travaux", tvaPct: 20, montant: f(o.amoTravaux), entreprise: "STRAT ECO", designation: "Assistance Maitrise d'Ouvrage (phase travaux)", commentaire: "Prestation obligatoire, assistance projet, administrative, financiere", eligibleMprAmo: true, eligibleMprEtudes: false },
    { phase: "travaux", tvaPct: 5.5, montant: { mode: "pctTravauxHt", taux: o.moeTravauxPct }, entreprise: o.moeNom, designation: "Maitrise d'oeuvre phase travaux", commentaire: "Pilotage et reception des travaux", eligibleMprAmo: false, eligibleMprEtudes: true },
    { phase: "travaux", tvaPct: 20, montant: f(o.ctTravaux), designation: "Controle technique", commentaire: "Prestations necessaires", eligibleMprAmo: false, eligibleMprEtudes: true },
    { phase: "travaux", tvaPct: 20, montant: f(o.cspsTravaux), designation: "CSPS", commentaire: "Prestations necessaires", eligibleMprAmo: false, eligibleMprEtudes: true }
  );
  if (o.climaxion) {
    lignes.push({ phase: "travaux", tvaPct: 20, montant: f(600), entreprise: "AERO TEST", designation: "Test d'etancheite a l'air apres travaux", commentaire: "Obligation Climaxion", eligibleMprAmo: false, eligibleMprEtudes: false });
  }
  lignes.push(
    { phase: "travaux", tvaPct: 0, montant: { mode: "pctTravauxTtc", taux: 2 }, entreprise: "ASSURANCES DU RHIN", designation: "Dommage ouvrage", commentaire: "Obligatoire", eligibleMprAmo: false, eligibleMprEtudes: false },
    // Honoraires syndic : ligne lue par le portefeuille (colonne « Honoraires »).
    { phase: "travaux", tvaPct: 20, montant: { mode: "pctTravauxHt", taux: 2.5 }, entreprise: "SYNDIC HORIZON GRAND EST", designation: "Honoraires syndic", commentaire: "Selon informations du syndic", eligibleMprAmo: false, eligibleMprEtudes: false }
  );
  return lignes;
}

/** Aides : MPR Copro (30 % pour un gain >= 35 %, 45 % pour un gain >= 50 %), CEE,
 *  Climaxion (Région Grand Est) et, dans l'Eurométropole, les aides EMS. */
function aides(o: { mprPct: 30 | 45; cee: number; climaxionAmo: number; ems: boolean }): AideDef[] {
  const plafond = (o.mprPct * 25000) / 100;
  const a: AideDef[] = [
    { id: "cee-fiche-par-fiche", groupe: "CEE", libelle: "CEE fiche par fiche", publique: false, calcul: { mode: "manuel", montant: o.cee }, commentaire: "Depend des lots de travaux energetiques et de la surface habitable" },
    { id: "maprimerenov-partie-travaux", groupe: "ANAH", libelle: "Maprimerenov' partie travaux", publique: true, calcul: { mode: "pctAssietteTravaux", taux: o.mprPct, coef: 1 }, commentaire: `${o.mprPct} % du montant des travaux energetiques HT - plafonne a ${plafond} EUR par logement` },
    { id: "maprimerenov-partie-etudes", groupe: "ANAH", libelle: "Maprimerenov' partie etudes", publique: true, calcul: { mode: "pctEtudes", taux: o.mprPct, coef: 0.9 }, commentaire: `${o.mprPct} % du montant des etudes, diags, maitrise d'oeuvre HT` },
    { id: "maprimerenov-amo", groupe: "ANAH", libelle: "Maprimerenov' AMO", publique: true, calcul: { mode: "pctAmo", taux: 50 }, commentaire: "50 % du montant de la prestation d'assistance a maitrise d'ouvrage HT" },
    { id: "maprimerenov-individuelle", groupe: "ANAH", libelle: "Maprimerenov' individuelle", publique: true, calcul: { mode: "info" }, commentaire: "Aide individuelle de 1500 EUR ou de 3000 EUR selon revenus du coproprietaire occupant" },
    { id: "climaxion-aide-travaux", groupe: "Climaxion", libelle: "Climaxion aide travaux", publique: true, calcul: { mode: "forfaitPlusParLogement", base: 10000, parLogement: 2500, surEquivalent: true }, commentaire: "Dispositif Climaxion sous reserve d'eligibilite" },
    { id: "climaxion-aide-amo", groupe: "Climaxion", libelle: "Climaxion aide AMO", publique: true, calcul: { mode: "manuel", montant: o.climaxionAmo }, commentaire: "Aide Climaxion sur la prestation AMO" },
  ];
  if (o.ems) {
    a.push(
      { id: "ems-aide-travaux", groupe: "EMS", libelle: "EMS aide travaux", publique: true, calcul: { mode: "parLogement", montant: 1000, surEquivalent: true }, commentaire: "Dispositif Eurometropole de Strasbourg suivant le cahier des charges Climaxion" },
      { id: "ems-aide-moe", groupe: "EMS", libelle: "EMS aide MOE", publique: true, calcul: { mode: "manuel", montant: 3000 }, commentaire: "Dispositif EMS pour la maitrise d'oeuvre" }
    );
  }
  return a;
}

function params(o: { mprPct: 30 | 45; fondsTravaux: number; commentaireFonds: string; totalTantiemes: number; exemples: number[] }): ParamsFinancement {
  return {
    imprevusPct: 7,
    plafondTravauxParLogement: 25000,
    plafondMprParLogement: (o.mprPct * 25000) / 100,
    plafondAmoParLogement: 600,
    fondsTravaux: o.fondsTravaux,
    commentaireFondsTravaux: o.commentaireFonds,
    totalTantiemes: o.totalTantiemes,
    tantiemesExemples: o.exemples,
    dureeEcoPtzAns: 20,
    coefAssurance: 1.036,
    tauxPretAvancePct: 5.45,
    pctAvanceAides: 70,
  };
}

const L = (retenu: boolean, tvaPct: number, montantHt: number, designation: string) => ({ retenu, tvaPct, montantHt, designation });

// ---------------------------------------------------------------------------
// 1. RESIDENCE GRAFFENSTADEN - Illkirch-Graffenstaden (EMS), 45 logements, E -> C
// ---------------------------------------------------------------------------
const graffenstaden: Copro = {
  slug: "demo-residence-graffenstaden",
  nomPlan: "PF définitif - Résidence Graffenstaden",
  data: {
    infos: {
      nomCopro: "RESIDENCE GRAFFENSTADEN",
      adresse: "8 rue des Vignes 67400 Illkirch-Graffenstaden",
      nbLogements: 45,
      nbLogementsEquiv: 45,
      surfaceHabitable: 2980,
      nbEtages: 4,
      nbEntrees: 3,
      typeChauffage: "Gaz collectif",
      cepInitial: 252,
      cepProjet: 131,
      dispositifClimaxion: true,
      etiquetteInitiale: "E",
      etiquetteProjet: "C",
    },
    lots: [
      {
        numero: 1, titre: "Isolation thermique par l'exterieur", entreprise: "FACADES DE L'ILL", remisePct: 0,
        lignes: [
          L(true, 5.5, 52000, "Echafaudage"),
          L(true, 5.5, 268000, "Isolation thermique par l'exterieur en polystyrene graphite 160 mm"),
          L(true, 5.5, 46000, "Traitement des balcons et loggias"),
          L(true, 5.5, 31000, "Garde-corps"),
          L(true, 5.5, 12500, "Bandeaux, appuis et departs"),
          L(false, 10, 7800, "Soubassement"),
          L(false, 10, 9200, "Peinture des parties communes"),
        ],
      },
      {
        numero: 2, titre: "Toiture terrasse", entreprise: "TOITURES DU RIED", remisePct: 0,
        lignes: [
          L(true, 5.5, 14500, "Depose des complexes existants"),
          L(true, 5.5, 68000, "Isolation polyurethane 180 mm et etancheite bicouche"),
          L(true, 5.5, 9800, "Relevés, acroteres et couvertines"),
          L(false, 10, 6400, "Reprise des evacuations d'eaux pluviales"),
        ],
      },
      {
        numero: 3, titre: "Chaufferie et reseaux", entreprise: "THERMIC EST", remisePct: 0,
        lignes: [
          L(true, 5.5, 58000, "Remplacement des chaudieres gaz par chaudieres a condensation en cascade"),
          L(true, 5.5, 16500, "Calorifugeage des reseaux en sous-sol"),
          L(true, 5.5, 22000, "Robinets thermostatiques et equilibrage"),
          L(false, 10, 4800, "Mise aux normes de la chaufferie"),
        ],
      },
      {
        numero: 4, titre: "Ventilation", entreprise: "AIRFLUX ALSACE", remisePct: 0,
        lignes: [
          L(true, 5.5, 13800, "Caissons d'extraction hygroreglables basse consommation"),
          L(true, 5.5, 15600, "Gaines, bouches d'extraction et entrees d'air"),
          L(true, 5.5, 5200, "Carottages et calfeutrements"),
        ],
      },
      {
        numero: 5, titre: "Menuiseries des parties communes", entreprise: "FENETRES RHENANES", remisePct: 0,
        lignes: [
          L(true, 5.5, 11400, "Portes de halls isolantes avec gache electrique"),
          L(true, 5.5, 8600, "Chassis des cages d'escalier"),
        ],
      },
    ],
    moe: moe({ amoConseil: 1500, amoProjet: 4800, amoTravaux: 8600, moeEtudes: 7500, moeConception: 39000, moeTravauxPct: 3.6, audit: 900, amiante: 3400, ctProjet: 1900, ctTravaux: 4100, cspsProjet: 1200, cspsTravaux: 2100, moeNom: "ARCHILOGIS", climaxion: true }),
    aides: aides({ mprPct: 30, cee: 24500, climaxionAmo: 4000, ems: true }),
    params: params({ mprPct: 30, fondsTravaux: 38000, commentaireFonds: "Fonds travaux loi ALUR disponible au 01/07/2026", totalTantiemes: 10000, exemples: [180, 225, 310] }),
    variantes: { collectif: true, collectifSansAvance: false, individuel: true },
    repartitionCles: {},
  },
};

// ---------------------------------------------------------------------------
// 2. RESIDENCE DES TROIS TOURS - Mulhouse, 120 logements, F -> C (sortie de passoire)
// ---------------------------------------------------------------------------
const troisTours: Copro = {
  slug: "demo-trois-tours",
  nomPlan: "PF définitif - Résidence des Trois Tours",
  data: {
    infos: {
      nomCopro: "RESIDENCE DES TROIS TOURS",
      adresse: "47 avenue d'Altkirch 68100 Mulhouse",
      nbLogements: 120,
      nbLogementsEquiv: 120,
      surfaceHabitable: 8150,
      nbEtages: 12,
      nbEntrees: 3,
      typeChauffage: "Chauffage urbain",
      cepInitial: 342,
      cepProjet: 154,
      dispositifClimaxion: true,
      etiquetteInitiale: "F",
      etiquetteProjet: "C",
    },
    lots: [
      {
        numero: 1, titre: "Isolation thermique par l'exterieur des trois tours", entreprise: "SUD ALSACE FACADES", remisePct: 2,
        lignes: [
          L(true, 5.5, 186000, "Echafaudages et nacelles"),
          L(true, 5.5, 892000, "Isolation thermique par l'exterieur en laine de roche 180 mm"),
          L(true, 5.5, 148000, "Traitement des loggias et balcons"),
          L(true, 5.5, 96000, "Garde-corps et separatifs"),
          L(true, 5.5, 38000, "Bandeaux, appuis et departs"),
          L(false, 10, 24000, "Soubassements et acces"),
          L(false, 10, 31000, "Remise en peinture des halls"),
        ],
      },
      {
        numero: 2, titre: "Toitures terrasses", entreprise: "ETANCHEITE DU HAUT-RHIN", remisePct: 0,
        lignes: [
          L(true, 5.5, 32000, "Depose des complexes existants"),
          L(true, 5.5, 168000, "Isolation polyurethane 200 mm et etancheite bicouche"),
          L(true, 5.5, 26000, "Releves, acroteres et couvertines"),
          L(false, 10, 14500, "Reprise des edicules et sorties de toiture"),
        ],
      },
      {
        numero: 3, titre: "Menuiseries exterieures", entreprise: "FENETRES RHENANES", remisePct: 0,
        lignes: [
          L(true, 5.5, 384000, "Remplacement des menuiseries des logements par PVC double vitrage Uw 1,3"),
          L(true, 5.5, 42000, "Volets roulants isolants"),
          L(true, 5.5, 18500, "Portes de halls isolantes avec controle d'acces"),
        ],
      },
      {
        numero: 4, titre: "Sous-station et reseaux", entreprise: "THERMIC EST", remisePct: 0,
        lignes: [
          L(true, 5.5, 64000, "Renovation des trois sous-stations de chauffage urbain"),
          L(true, 5.5, 38000, "Calorifugeage des reseaux en sous-sol et gaines"),
          L(true, 5.5, 52000, "Robinets thermostatiques, desembouage et equilibrage"),
          L(false, 10, 9600, "Mise en securite des locaux techniques"),
        ],
      },
      {
        numero: 5, titre: "Ventilation", entreprise: "AIRFLUX ALSACE", remisePct: 0,
        lignes: [
          L(true, 5.5, 46000, "Caissons d'extraction hygroreglables en terrasse"),
          L(true, 5.5, 58000, "Bouches hygroreglables et entrees d'air"),
          L(true, 5.5, 12800, "Nettoyage et reprise des colonnes"),
        ],
      },
    ],
    moe: moe({ amoConseil: 3600, amoProjet: 11500, amoTravaux: 19800, moeEtudes: 22000, moeConception: 118000, moeTravauxPct: 3.4, audit: 1800, amiante: 8900, ctProjet: 5200, ctTravaux: 11800, cspsProjet: 2900, cspsTravaux: 6400, moeNom: "ATELIER RHIN ARCHITECTURE", climaxion: true }),
    aides: aides({ mprPct: 45, cee: 78000, climaxionAmo: 6000, ems: false }),
    params: params({ mprPct: 45, fondsTravaux: 96000, commentaireFonds: "Fonds travaux loi ALUR disponible au 01/07/2026", totalTantiemes: 100000, exemples: [620, 830, 1050] }),
    variantes: { collectif: true, collectifSansAvance: true, individuel: false },
    repartitionCles: {},
  },
};

// ---------------------------------------------------------------------------
// 3. LE SAINT-LIVIER - Metz, 48 logements, E -> C
// ---------------------------------------------------------------------------
const saintLivier: Copro = {
  slug: "demo-le-saint-livier",
  nomPlan: "PF définitif - Le Saint-Livier",
  data: {
    infos: {
      nomCopro: "LE SAINT-LIVIER",
      adresse: "21 rue des Tanneurs 57000 Metz",
      nbLogements: 48,
      nbLogementsEquiv: 48,
      surfaceHabitable: 3260,
      nbEtages: 6,
      nbEntrees: 2,
      typeChauffage: "Gaz collectif",
      cepInitial: 241,
      cepProjet: 133,
      dispositifClimaxion: true,
      etiquetteInitiale: "E",
      etiquetteProjet: "C",
    },
    lots: [
      {
        numero: 1, titre: "Isolation thermique par l'exterieur", entreprise: "FACADES LORRAINES", remisePct: 0,
        lignes: [
          L(true, 5.5, 58000, "Echafaudage"),
          L(true, 5.5, 296000, "Isolation thermique par l'exterieur en laine de roche 160 mm"),
          L(true, 5.5, 39000, "Traitement des balcons"),
          L(true, 5.5, 27500, "Garde-corps"),
          L(true, 5.5, 11800, "Bandeaux et departs"),
          L(false, 10, 6900, "Soubassement"),
          L(false, 10, 8400, "Peinture des parties communes"),
        ],
      },
      {
        numero: 2, titre: "Combles et toiture", entreprise: "TOITURES DE MOSELLE", remisePct: 0,
        lignes: [
          L(true, 5.5, 34000, "Isolation des combles perdus en laine soufflee 320 mm"),
          L(true, 5.5, 21500, "Isolation du plancher haut des caves"),
          L(false, 10, 12800, "Revision de la couverture et zingueries"),
        ],
      },
      {
        numero: 3, titre: "Chaufferie", entreprise: "LORRAINE ENERGIES", remisePct: 0,
        lignes: [
          L(true, 5.5, 72000, "Pompe a chaleur hybride collective en relève de chaudiere gaz a condensation"),
          L(true, 5.5, 14200, "Calorifugeage des reseaux"),
          L(true, 5.5, 19800, "Robinets thermostatiques et equilibrage"),
          L(false, 10, 5100, "Reprise du conduit de fumee"),
        ],
      },
      {
        numero: 4, titre: "Ventilation", entreprise: "VENTIL'EST", remisePct: 0,
        lignes: [
          L(true, 5.5, 12600, "Caissons d'extraction hygroreglables"),
          L(true, 5.5, 14900, "Gaines, bouches d'extraction et entrees d'air"),
          L(true, 5.5, 4700, "Carottages et calfeutrements"),
        ],
      },
      {
        numero: 5, titre: "Menuiseries des parties communes", entreprise: "MENUISERIES DE LA SEILLE", remisePct: 0,
        lignes: [
          L(true, 5.5, 9800, "Portes de halls isolantes avec gache electrique"),
          L(true, 5.5, 7200, "Chassis des cages d'escalier"),
          L(false, 10, 2600, "Volets des locaux communs"),
        ],
      },
    ],
    moe: moe({ amoConseil: 1500, amoProjet: 5000, amoTravaux: 9000, moeEtudes: 8000, moeConception: 41000, moeTravauxPct: 3.6, audit: 900, amiante: 3600, ctProjet: 2000, ctTravaux: 4300, cspsProjet: 1250, cspsTravaux: 2200, moeNom: "CABINET MOSELLE ARCHITECTES", climaxion: true }),
    aides: aides({ mprPct: 30, cee: 26000, climaxionAmo: 4000, ems: false }),
    params: params({ mprPct: 30, fondsTravaux: 42000, commentaireFonds: "Fonds travaux loi ALUR disponible au 01/07/2026", totalTantiemes: 10000, exemples: [165, 210, 295] }),
    variantes: { collectif: true, collectifSansAvance: false, individuel: true },
    repartitionCles: {},
  },
};

// ---------------------------------------------------------------------------
// 4. Calcul et émission du SQL
// ---------------------------------------------------------------------------
const q = (s: string) => s.replace(/'/g, "''");
const jsonSql = (v: unknown) => `$json$${JSON.stringify(v)}$json$::jsonb`;
const fmt = (n: number) => round2(n).toLocaleString("fr-FR", { maximumFractionDigits: 0 }).replace(/ | /g, " ");

const blocs: string[] = [];
const resume: string[] = [];

for (const c of [graffenstaden, troisTours, saintLivier]) {
  const data = readPlanDefinitif(c.data);
  const r = computePlanDefinitif(data);
  const gainPct = Math.round(r.performancePct * 10) / 10;
  const honorairesSyndic = r.moe
    .filter((l) => /syndic/i.test(l.designation))
    .reduce((s, l) => s + l.montantTtc, 0);
  const depasse = r.gardeFous.filter((g) => !g.ok).map((g) => g.libelle);
  if (depasse.length) throw new Error(`${c.slug} : garde-fou depasse - ${depasse.join(" | ")}`);

  resume.push(
    `--   ${c.data.infos.nomCopro} : travaux TTC ${fmt(r.totalTravauxTtc)} EUR - opération TTC ${fmt(r.totalOperationTtc)} EUR\n` +
      `--     honoraires syndic TTC ${fmt(honorairesSyndic)} EUR - aides ${fmt(r.totalAides)} EUR (dont CEE ${fmt(r.primeCee)}) - couverture ${round2(r.tauxCouverture * 100)} %\n` +
      `--     reste à charge collectif ${fmt(r.resteACharge)} EUR - gain énergétique ${gainPct} %`
  );

  blocs.push(`-- ========== ${c.data.infos.nomCopro} ==========
do $$
declare
  v_copro uuid;
begin
  select id into v_copro from coproprietes where slug = '${c.slug}';
  if v_copro is null then
    raise exception 'Copropriété ${c.slug} absente - jouer seed_demo_horizon.sql d''abord.';
  end if;
  if exists (select 1 from plans_definitifs where copro_id = v_copro) then
    raise notice '${q(c.data.infos.nomCopro)} : PF déjà présent - bloc sauté.';
    return;
  end if;

  insert into plans_definitifs (copro_id, nom, data, resultat, statut, source_fichier)
  values (
    v_copro,
    '${q(c.nomPlan)}',
    ${jsonSql(data)},
    ${jsonSql(r)},
    'valide',
    null
  );

  -- Comme useValiderPlanDefinitif : le PF validé fait foi sur le dossier.
  update coproprietes
  set gain_pct = ${gainPct},
      energy_before = '${c.data.infos.etiquetteInitiale}',
      energy_after = '${c.data.infos.etiquetteProjet}'
  where id = v_copro;
end $$;`);

  console.log(
    `${c.data.infos.nomCopro} : travaux TTC ${fmt(r.totalTravauxTtc)} - opération TTC ${fmt(r.totalOperationTtc)} - honoraires syndic ${fmt(honorairesSyndic)} - aides ${fmt(r.totalAides)} (${round2(r.tauxCouverture * 100)} %) - RAC ${fmt(r.resteACharge)} - gain ${gainPct} %`
  );
  console.log(`  garde-fous : ${r.gardeFous.map((g) => `${g.libelle} ${g.ok ? "ok" : "DEPASSE"}`).join(" | ")}`);
}

const sql = `-- Montants fictifs des copropriétés en phase études de la démo commerciale
-- SYNDIC HORIZON GRAND EST : un PF définitif validé par dossier (feedback Amir
-- 06/09/2026 - le portefeuille /syndic n'affichait ni travaux ni honoraires).
-- GÉNÉRÉ par gen_seed_demo_horizon_etudes.ts - ne pas éditer à la main, relancer :
--   npx vite-node supabase/seed/gen_seed_demo_horizon_etudes.ts
-- Prérequis : seed_demo_horizon.sql (organisation, copropriétés, gestionnaires).
-- Idempotent : chaque bloc se saute si le dossier a déjà un PF définitif.
--
-- Totaux calculés par le moteur de l'app (computePlanDefinitif) :
${resume.join("\n")}

begin;

${blocs.join("\n\n")}

commit;
`;

const out = join(dirname(fileURLToPath(import.meta.url)), "seed_demo_horizon_etudes.sql");
writeFileSync(out, sql, "utf8");
console.log(`Écrit : ${out}`);
