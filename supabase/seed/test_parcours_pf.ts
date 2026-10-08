// Définitions des plans de financement définitifs fictifs de l'organisation de
// test « SYNDIC TEST PARCOURS » (4 copropriétés : Metz, Nancy, Strasbourg,
// Colmar). Même ossature que demo_horizon_pf.ts (MOE, aides, paramètres),
// montants proportionnés au nombre de logements. Données FICTIVES.

import type { PlanDefinitifData } from "../../src/lib/finance";
import { aides, L, moe, params, type Copro } from "./demo_horizon_pf";

export const ORG_NOM = "SYNDIC TEST PARCOURS";

/** Montant mis à l'échelle (k = nb logements / 48), arrondi à 100 EUR près. */
const s = (n: number, k: number) => Math.max(100, Math.round((n * k) / 100) * 100);

const ite = (k: number, entreprise: string, mat: string) => ({
  numero: 1,
  titre: "Isolation thermique par l'exterieur",
  entreprise,
  remisePct: 0,
  lignes: [
    L(true, 5.5, s(58000, k), "Echafaudage"),
    L(true, 5.5, s(296000, k), `Isolation thermique par l'exterieur en ${mat}`),
    L(true, 5.5, s(39000, k), "Traitement des balcons"),
    L(true, 5.5, s(27500, k), "Garde-corps"),
    L(true, 5.5, s(11800, k), "Bandeaux et departs"),
    L(false, 10, s(6900, k), "Soubassement"),
    L(false, 10, s(8400, k), "Peinture des parties communes"),
  ],
});

const toiture = (k: number, numero: number, entreprise: string, terrasse: boolean) => ({
  numero,
  titre: terrasse ? "Toiture terrasse" : "Combles et toiture",
  entreprise,
  remisePct: 0,
  lignes: terrasse
    ? [
        L(true, 5.5, s(21000, k), "Depose des complexes existants"),
        L(true, 5.5, s(108000, k * 0.7), "Isolation polyurethane 200 mm et etancheite bicouche"),
        L(true, 5.5, s(15600, k), "Releves, acroteres et couvertines"),
        L(false, 10, s(8900, k), "Reprise des edicules et sorties de toiture"),
      ]
    : [
        L(true, 5.5, s(34000, k), "Isolation des combles perdus en laine soufflee 320 mm"),
        L(true, 5.5, s(21500, k), "Isolation du plancher haut des caves"),
        L(false, 10, s(12800, k), "Revision de la couverture et zingueries"),
      ],
});

const chauffage = (k: number, numero: number, entreprise: string, titre: string, ligne: string) => ({
  numero,
  titre,
  entreprise,
  remisePct: 0,
  lignes: [
    L(true, 5.5, s(72000, k), ligne),
    L(true, 5.5, s(14200, k), "Calorifugeage des reseaux"),
    L(true, 5.5, s(19800, k), "Robinets thermostatiques et equilibrage"),
    L(false, 10, s(5100, k), "Reprise du conduit de fumee"),
  ],
});

const ventilation = (k: number, numero: number, entreprise: string) => ({
  numero,
  titre: "Ventilation",
  entreprise,
  remisePct: 0,
  lignes: [
    L(true, 5.5, s(12600, k), "Caissons d'extraction hygroreglables"),
    L(true, 5.5, s(14900, k), "Gaines, bouches d'extraction et entrees d'air"),
    L(true, 5.5, s(4700, k), "Carottages et calfeutrements"),
  ],
});

const menuiseries = (k: number, numero: number, entreprise: string) => ({
  numero,
  titre: "Menuiseries exterieures",
  entreprise,
  remisePct: 0,
  lignes: [
    L(true, 5.5, s(236000, k * 0.75), "Remplacement des menuiseries des logements par PVC double vitrage Uw 1,3"),
    L(true, 5.5, s(28000, k * 0.75), "Volets roulants isolants"),
    L(true, 5.5, s(12400, k), "Portes de halls isolantes avec controle d'acces"),
  ],
});

/** Retire l'aide Climaxion (dossier sous 50 % de gain : non éligible) et personnalise le syndic. */
function finaliser(data: PlanDefinitifData, climaxion: boolean): PlanDefinitifData {
  const moeLignes = data.moe.map((l) =>
    /honoraires syndic/i.test(l.designation) ? { ...l, entreprise: ORG_NOM } : l
  );
  return {
    ...data,
    moe: moeLignes,
    aides: climaxion ? data.aides : data.aides.filter((a) => a.groupe !== "Climaxion"),
  };
}

/** Échelle des honoraires : proportionnelle au nombre de logements avec un plancher. */
const h = (n: number, k: number) => Math.max(n * 0.35, Math.round((n * k) / 100) * 100);

// ---------------------------------------------------------------------------
// METZ - LES MIRABELLES - 18 logements, F -> C
// ---------------------------------------------------------------------------
const kMetz = 18 / 48;
export const mirabelles: Copro = {
  slug: "test-les-mirabelles",
  nomPlan: "PF définitif - Les Mirabelles",
  data: finaliser(
    {
      infos: {
        nomCopro: "LES MIRABELLES",
        adresse: "9 rue Fabert 57000 Metz",
        nbLogements: 18,
        nbLogementsEquiv: 18,
        surfaceHabitable: 1180,
        nbEtages: 5,
        nbEntrees: 1,
        typeChauffage: "Gaz collectif",
        cepInitial: 322,
        cepProjet: 141,
        dispositifClimaxion: true,
        etiquetteInitiale: "F",
        etiquetteProjet: "C",
      },
      lots: [
        ite(kMetz, "FACADES LORRAINES", "laine de roche 160 mm"),
        toiture(kMetz, 2, "TOITURES DE MOSELLE", false),
        chauffage(kMetz, 3, "LORRAINE ENERGIES", "Chaufferie", "Pompe a chaleur hybride collective en releve de chaudiere gaz a condensation"),
        ventilation(kMetz, 4, "VENTIL'EST"),
      ],
      moe: moe({ amoConseil: 1500, amoProjet: h(5000, kMetz * 1.4), amoTravaux: h(9000, kMetz * 1.4), moeEtudes: h(8000, kMetz * 1.3), moeConception: h(41000, kMetz * 1.2), moeTravauxPct: 4, audit: 900, amiante: 2400, ctProjet: 1500, ctTravaux: 3200, cspsProjet: 900, cspsTravaux: 1600, moeNom: "CABINET MOSELLE ARCHITECTES", climaxion: true }),
      aides: aides({ mprPct: 45, cee: 14500, climaxionAmo: 3000, ems: false }),
      params: params({ mprPct: 45, fondsTravaux: 21000, commentaireFonds: "Fonds travaux loi ALUR disponible au 01/07/2026", totalTantiemes: 10000, exemples: [420, 560, 780] }),
      variantes: { collectif: true, collectifSansAvance: false, individuel: true },
      repartitionCles: {},
    },
    true
  ),
};

// ---------------------------------------------------------------------------
// NANCY - LE CLOS DES BRASSEURS - 24 logements, E -> C (gain < 50 %, MPR 30 %, sans Climaxion)
// ---------------------------------------------------------------------------
const kNancy = 24 / 48;
export const clos: Copro = {
  slug: "test-le-clos-des-brasseurs",
  nomPlan: "PF définitif - Le Clos des Brasseurs",
  data: finaliser(
    {
      infos: {
        nomCopro: "LE CLOS DES BRASSEURS",
        adresse: "6 rue des Brasseries 54000 Nancy",
        nbLogements: 24,
        nbLogementsEquiv: 24,
        surfaceHabitable: 1620,
        nbEtages: 6,
        nbEntrees: 2,
        typeChauffage: "Gaz collectif",
        cepInitial: 262,
        cepProjet: 154,
        dispositifClimaxion: false,
        etiquetteInitiale: "E",
        etiquetteProjet: "C",
      },
      lots: [
        ite(kNancy, "FACADES LORRAINES", "polystyrene graphite 160 mm"),
        toiture(kNancy, 2, "TOITURES DE MOSELLE", true),
        ventilation(kNancy, 3, "VENTIL'EST"),
        {
          numero: 4,
          titre: "Menuiseries des parties communes",
          entreprise: "MENUISERIES DE LA SEILLE",
          remisePct: 0,
          lignes: [
            L(true, 5.5, s(9800, kNancy), "Portes de halls isolantes avec gache electrique"),
            L(true, 5.5, s(7200, kNancy), "Chassis des cages d'escalier"),
            L(false, 10, s(2600, kNancy), "Volets des locaux communs"),
          ],
        },
      ],
      moe: moe({ amoConseil: 1500, amoProjet: h(5000, kNancy * 1.3), amoTravaux: h(9000, kNancy * 1.3), moeEtudes: h(8000, kNancy * 1.2), moeConception: h(41000, kNancy * 1.1), moeTravauxPct: 3.8, audit: 900, amiante: 2800, ctProjet: 1700, ctTravaux: 3600, cspsProjet: 1000, cspsTravaux: 1800, moeNom: "CABINET MOSELLE ARCHITECTES", climaxion: false }),
      aides: aides({ mprPct: 30, cee: 17000, climaxionAmo: 0, ems: false }),
      params: params({ mprPct: 30, fondsTravaux: 28000, commentaireFonds: "Fonds travaux loi ALUR disponible au 01/07/2026", totalTantiemes: 10000, exemples: [330, 420, 590] }),
      variantes: { collectif: true, collectifSansAvance: false, individuel: true },
      repartitionCles: {},
    },
    false
  ),
};

// ---------------------------------------------------------------------------
// STRASBOURG - LES TERRASSES DU NEUDORF - 30 logements (EMS), F -> C
// ---------------------------------------------------------------------------
const kStras = 30 / 48;
export const neudorf: Copro = {
  slug: "test-les-terrasses-du-neudorf",
  nomPlan: "PF définitif - Les Terrasses du Neudorf",
  data: finaliser(
    {
      infos: {
        nomCopro: "LES TERRASSES DU NEUDORF",
        adresse: "14 rue de Lausanne 67100 Strasbourg",
        nbLogements: 30,
        nbLogementsEquiv: 30,
        surfaceHabitable: 2040,
        nbEtages: 5,
        nbEntrees: 2,
        typeChauffage: "Chauffage urbain",
        cepInitial: 308,
        cepProjet: 148,
        dispositifClimaxion: true,
        etiquetteInitiale: "F",
        etiquetteProjet: "C",
      },
      lots: [
        ite(kStras, "FACADES DE L'ILL", "laine de roche 180 mm"),
        toiture(kStras, 2, "TOITURES DU RIED", true),
        chauffage(kStras, 3, "THERMIC EST", "Sous-station et reseaux", "Renovation de la sous-station de chauffage urbain"),
        ventilation(kStras, 4, "AIRFLUX ALSACE"),
      ],
      moe: moe({ amoConseil: 1500, amoProjet: h(5000, kStras * 1.2), amoTravaux: h(9000, kStras * 1.2), moeEtudes: h(8000, kStras * 1.1), moeConception: h(41000, kStras * 1.05), moeTravauxPct: 3.7, audit: 900, amiante: 3200, ctProjet: 1800, ctTravaux: 3900, cspsProjet: 1100, cspsTravaux: 2000, moeNom: "ARCHILOGIS", climaxion: true }),
      aides: aides({ mprPct: 45, cee: 22500, climaxionAmo: 4000, ems: true }),
      params: params({ mprPct: 45, fondsTravaux: 36000, commentaireFonds: "Fonds travaux loi ALUR mobilise au vote des travaux", totalTantiemes: 10000, exemples: [260, 340, 470] }),
      variantes: { collectif: true, collectifSansAvance: false, individuel: true },
      repartitionCles: {},
    },
    true
  ),
};

// ---------------------------------------------------------------------------
// COLMAR - LES BALCONS DE LA LAUCH - 30 logements, 2 bâtiments, F -> B (la copro complète)
// ---------------------------------------------------------------------------
const kColmar = 30 / 48;
export const lauch: Copro = {
  slug: "test-les-balcons-de-la-lauch",
  nomPlan: "PF définitif - Les Balcons de la Lauch",
  data: finaliser(
    {
      infos: {
        nomCopro: "LES BALCONS DE LA LAUCH",
        adresse: "26 avenue de la République 68000 Colmar",
        nbLogements: 30,
        nbLogementsEquiv: 30,
        surfaceHabitable: 2060,
        nbEtages: 5,
        nbEntrees: 2,
        typeChauffage: "Gaz collectif",
        cepInitial: 345,
        cepProjet: 118,
        dispositifClimaxion: true,
        etiquetteInitiale: "F",
        etiquetteProjet: "B",
      },
      lots: [
        ite(kColmar, "SUD ALSACE FACADES", "laine de roche 180 mm"),
        toiture(kColmar, 2, "ETANCHEITE DU HAUT-RHIN", true),
        menuiseries(kColmar, 3, "FENETRES RHENANES"),
        chauffage(kColmar, 4, "THERMIC EST", "Chaufferie et reseaux", "Remplacement des chaudieres gaz par chaudieres a condensation en cascade"),
        ventilation(kColmar, 5, "AIRFLUX ALSACE"),
        {
          numero: 6,
          titre: "Etancheite a l'air",
          entreprise: "ISOL'AIR GRAND EST",
          remisePct: 0,
          lignes: [L(true, 5.5, s(31000, kColmar), "Travaux d'impermeabilite a l'air")],
        },
      ],
      moe: moe({ amoConseil: 1800, amoProjet: h(5000, kColmar * 1.3), amoTravaux: h(9000, kColmar * 1.3), moeEtudes: h(8000, kColmar * 1.15), moeConception: h(41000, kColmar * 1.1), moeTravauxPct: 3.6, audit: 1000, amiante: 3400, ctProjet: 1900, ctTravaux: 4100, cspsProjet: 1200, cspsTravaux: 2100, moeNom: "ATELIER RHIN ARCHITECTURE", climaxion: true }),
      aides: aides({ mprPct: 45, cee: 31000, climaxionAmo: 4500, ems: false }),
      params: params({ mprPct: 45, fondsTravaux: 42000, commentaireFonds: "Fonds travaux loi ALUR mobilise au vote des travaux", totalTantiemes: 10000, exemples: [260, 340, 470] }),
      variantes: { collectif: true, collectifSansAvance: false, individuel: true },
      repartitionCles: {},
    },
    true
  ),
};
