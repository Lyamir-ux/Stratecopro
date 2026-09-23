// PF définitif « Grossau » (26 rue de la Grossau, 11 logements) - classeur
// « Plan de financement définitif Grossau.xlsx » (onglet « PF définitif ACT »,
// colonne « Scénario entreprise mieux-disante », un onglet par lot).
//
// Arbitrages d'Amir (23/09/2026) :
//  - imprévus chiffrés lot par lot : une ligne par lot saisie en TTC (HT 0,
//    montant dans `tvaMontant`, TVA 0 %) pour que les honoraires en % et le
//    prorata MPR études restent calculés sur les travaux HT hors imprévus,
//    comme dans le classeur ; imprévus des lots 2, 3 et 5 sans TVA (classeur) ;
//  - MPR études et EMS MOE : montants du classeur conservés ;
//  - « montants déjà appelés » (45 400 €) cumulés au fonds travaux.
// La TVA des lots 2, 4, 6 et de la chaufferie du lot 7 n'est donnée que par
// taux : les lignes sont découpées pour retomber sur les montants de TVA du lot.
import type { LigneLot, LigneMoe, PlanDefinitifData } from "../planDefinitif";

const l = (designation: string, montantHt: number, tvaPct: number, retenu = true): LigneLot => ({
  designation,
  retenu,
  montantHt,
  tvaPct,
});

/** Provision pour imprévus du lot, saisie en TTC (hors assiette des honoraires en %). */
const imprevus = (libelle: string, htTexte: string, ht: number, tvaPct: number | null): LigneLot => ({
  designation:
    tvaPct == null
      ? `${libelle} - provision de ${htTexte} € HT, sans TVA au classeur (saisie en TTC)`
      : `${libelle} - provision de ${htTexte} € HT + TVA ${String(tvaPct).replace(".", ",")} % (saisie en TTC)`,
  retenu: false,
  montantHt: 0,
  tvaPct: 0,
  tvaMontant: Math.round(ht * (1 + (tvaPct ?? 0) / 100) * 1000) / 1000,
});

const moe = (
  designation: string,
  entreprise: string | undefined,
  phase: LigneMoe["phase"],
  montant: LigneMoe["montant"],
  tvaPct: number,
  eligibilite: "etudes" | "amo" | "aucune",
  commentaire?: string
): LigneMoe => ({
  designation,
  entreprise,
  phase,
  montant,
  tvaPct,
  eligibleMprEtudes: eligibilite === "etudes",
  eligibleMprAmo: eligibilite === "amo",
  commentaire,
});

const forfait = (montantHt: number) => ({ mode: "forfait" as const, montantHt });

export function makeGrossau(): PlanDefinitifData {
  return {
    infos: {
      nomCopro: "Grossau",
      adresse: "26 rue de la Grossau 67100 Strasbourg",
      nbLogements: 11,
      nbLogementsEquiv: 11,
      surfaceHabitable: 554,
      nbEtages: 3,
      nbEntrees: 1,
      typeChauffage: "Gaz Coll",
      cepInitial: 413,
      cepProjet: 149,
      dispositifClimaxion: true,
      etiquetteInitiale: "F",
      etiquetteProjet: "C",
    },
    lots: [
      {
        numero: 1,
        titre: "Désamiantage",
        entreprise: "NUWA environnement",
        remisePct: 0,
        lignes: [
          l("Travaux préliminaires", 1730, 20),
          l("Travaux de désamiantage", 14328, 20),
          l("Examen visuel et métrologie", 2479, 20),
          l("Déchets", 2282, 20),
          l("Réception", 510, 20),
          imprevus("Divers (imprévus)", "500", 500, 20),
        ],
      },
      {
        numero: 2,
        titre: "Echafaudage - Isolation - Ravalement",
        entreprise: "Décopeint",
        remisePct: 0,
        lignes: [
          l("Installation de chantier", 3000, 5.5),
          l("Echafaudage", 11388, 5.5),
          l("Travaux préparatoires", 4736, 5.5),
          l("Isolation extérieure", 70450, 5.5),
          l("Revêtements décoratifs et peinture extérieure", 4108, 5.5, false),
          l("Travaux complémentaires (part à TVA 5,5 %)", 736, 5.5),
          l("Travaux complémentaires (part à TVA 10 %)", 5803.8, 10),
          imprevus("Divers (imprévus)", "10 000", 10000, null),
        ],
      },
      {
        numero: 3,
        titre: "Isolation dalle basse",
        entreprise: "GIF SARL",
        remisePct: 0,
        lignes: [
          l("Travaux préalables", 1216, 5.5),
          l("Isolation thermique", 11780, 5.5),
          l("Travaux d'éclairage", 1280, 5.5),
          imprevus("Divers (imprévus)", "1 500", 1500, null),
        ],
      },
      {
        numero: 4,
        titre: "Etanchéité",
        entreprise: "ETANDEX",
        remisePct: 0,
        lignes: [
          l("Travail de dépose", 529.92, 5.5),
          l("Etanchéité isolée", 27096.39, 5.5),
          l("Etanchéité isolée - Terrasse", 5645.2, 5.5),
          l("Etanchéité isolée - Auvent", 983.63, 5.5),
          l("Travaux complémentaires (part à TVA 5,5 %)", 845.22, 5.5),
          l("Travaux complémentaires (part à TVA 10 %)", 13970.24, 10),
          imprevus("Divers (imprévus)", "2 500", 2500, 20),
        ],
      },
      {
        numero: 5,
        titre: "Menuiseries extérieures",
        entreprise: "NORBA",
        remisePct: 0,
        lignes: [l("Bloc-portes", 4986, 10), imprevus("Divers (imprévus)", "500", 500, null)],
      },
      {
        numero: 6,
        titre: "Ventilation hygroréglable basse pression",
        entreprise: "CAELI",
        remisePct: 0,
        lignes: [
          l("Ventilation basse pression (part à TVA 5,5 %)", 5166, 5.5),
          l("Ventilation basse pression (part à TVA 20 %)", 14776, 20),
          l("Etanchéité à l'air en logement", 1485, 5.5),
          l("Divers", 1205, 5.5),
          imprevus("Travaux imprévus", "2 264", 2264, 20),
        ],
      },
      {
        numero: 7,
        titre: "Chauffage et ECS solaire",
        entreprise: "THERMIEXPERT",
        remisePct: 0,
        lignes: [
          l("Travaux préparatoires", 1527.8, 20, false),
          l("Acheminement conduits", 3589.68, 20, false),
          l("Chaufferie - chaudière", 13875.14, 20, false),
          l("Chaufferie - part à TVA 5,5 %", 4449.61, 5.5, false),
          l("Chaufferie - part à TVA 10 %", 3650.57, 10, false),
          l("Production ECS", 4014, 5.5),
          l("Production solaire", 34355.12, 5.5),
          l("Comptage", 1931.64, 5.5),
          l("Mise en sécurité chaufferie", 879.32, 10, false),
          l("Divers", 2700.61, 10, false),
          imprevus("Travaux imprévus", "7 097,35", 7097.35, 10),
        ],
      },
    ],
    moe: [
      moe("Assistance Maîtrise d'Ouvrage (phase conseil)", "Strat Eco", "etude", forfait(1120 / 1.2), 20, "amo",
        "Phase conseil, assistance technique projet et approche financière"),
      moe("Maîtrise d'œuvre phase études (Diag - AVP)", "Ingédair", "etude", forfait(11800), 10, "etudes",
        "AVP - Climaxion - DPE collectif"),
      moe("Maîtrise d'œuvre phase études (Diag - AVP) - part à TVA 20 %", "Ingédair", "etude", forfait(2500), 20, "etudes",
        "AVP - Climaxion - DPE collectif"),
      moe("Diagnostics", "Esvalua", "etude", forfait(3775), 20, "etudes", "Repérage amiante avant travaux"),
      moe("Assistance Maîtrise d'Ouvrage (phase projet)", "Strat Eco", "projet", forfait(4480 / 1.2), 20, "amo",
        "Phase avant projet et phase projet, assistance projet, administrative, financière"),
      moe("Maîtrise d'œuvre phase conception (PRO - DCE)", "Ingédair", "projet", forfait(12600), 10, "etudes", "PRO - DCE - ACT"),
      moe("Contrôle technique", "Socotec", "projet", forfait(1155), 20, "etudes", "30 % du devis de 3 850 € HT"),
      moe("CSPS", "QualiConsult", "projet", forfait(800), 20, "etudes"),
      moe("Tests d'étanchéité à l'air initiaux", "Ingédair", "projet", forfait(507), 20, "etudes",
        "Tests d'étanchéité à l'air avant travaux"),
      moe("Assistance Maîtrise d'Ouvrage (phase travaux)", "Strat Eco", "travaux", forfait(5453.33), 20, "amo",
        "Phase travaux, assistance projet, administrative, financière et sociale"),
      moe("Maîtrise d'œuvre phase travaux", "Ingédair", "travaux", { mode: "pctTravauxHt", taux: 4.7 }, 5.5, "etudes",
        "Pilotage et réception des travaux"),
      moe("Contrôle technique", "Socotec", "travaux", forfait(2695), 20, "etudes", "70 % du devis de 3 850 € HT"),
      moe("CSPS", "QualiConsult", "travaux", forfait(3120), 20, "etudes"),
      moe("Tests d'étanchéité à l'air finaux", "Ingédair", "travaux", forfait(507), 20, "etudes",
        "Tests d'étanchéité à l'air après travaux"),
      moe("Dommage ouvrage", undefined, "travaux", forfait(9956), 0, "aucune", "Obligatoire"),
      moe("Honoraires syndic", undefined, "travaux", { mode: "pctTravauxHt", taux: 4.6 }, 20, "aucune"),
    ],
    aides: [
      {
        id: "cee",
        groupe: "CEE",
        libelle: "Certificat d'économie d'énergie CEE",
        calcul: { mode: "parM2Shab", tauxEurM2: 41, coef: 1 },
        publique: false,
        commentaire: "Dépend des lots de travaux énergétiques - 41 €/m² de surface habitable",
      },
      {
        id: "mpr-travaux",
        groupe: "ANAH",
        libelle: "Maprimerénov' partie travaux",
        calcul: { mode: "pctAssietteTravaux", taux: 45, coef: 0.9 },
        publique: true,
        commentaire: "45 % du montant des travaux énergétiques HT plafonné à 11 250 € par logement",
      },
      {
        id: "mpr-etudes",
        groupe: "ANAH",
        libelle: "Maprimerénov' partie études",
        calcul: { mode: "manuel", montant: 18225.19 },
        publique: true,
        commentaire: "45 % du montant des études, diags, maîtrise d'œuvre HT - montant du classeur conservé",
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
        id: "mpr-bonus-passoire",
        groupe: "ANAH",
        libelle: "Maprimerénov' bonus sortie de passoire",
        calcul: { mode: "pctAssietteTravaux", taux: 10, coef: 1 },
        publique: true,
        commentaire: "En cas de sortie de passoire énergétique (F/G)",
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
        id: "climaxion-ecs-solaire",
        groupe: "Climaxion",
        libelle: "Climaxion aide ECS solaire",
        calcul: { mode: "manuel", montant: 19440 },
        publique: true,
        commentaire: "Aide complémentaire pour l'ECS solaire (18,64 m²) - 1 200 × 18 × 0,9",
      },
      {
        id: "ems-travaux",
        groupe: "EMS",
        libelle: "EMS aide travaux",
        calcul: { mode: "parLogement", montant: 1000, surEquivalent: false },
        publique: true,
        commentaire: "Aide complémentaire de l'EMS pour les travaux de rénovation énergétique",
      },
      {
        id: "ems-moe",
        groupe: "EMS",
        libelle: "EMS aide MOE",
        calcul: { mode: "manuel", montant: 9607.95 },
        publique: true,
        commentaire: "Aide complémentaire de l'EMS pour la mission de maîtrise d'œuvre",
      },
      {
        id: "ems-amo",
        groupe: "EMS",
        libelle: "EMS aide AMO",
        calcul: { mode: "manuel", montant: 1500 },
        publique: true,
        commentaire: "Aide complémentaire de l'EMS pour l'assistance à maîtrise d'ouvrage",
      },
      {
        id: "climaxion-indiv",
        groupe: "Climaxion",
        libelle: "Climaxion individuel",
        calcul: { mode: "info" },
        publique: true,
        commentaire: "1 000 € par logement pour changement de l'intégralité des vitrages d'un logement",
      },
      {
        id: "mpr-indiv",
        groupe: "ANAH",
        libelle: "Maprimerénov' individuelle",
        calcul: { mode: "info" },
        publique: true,
        commentaire: "Aide de 1 500 € ou de 3 000 € selon revenus du copropriétaire occupant",
      },
    ],
    params: {
      imprevusPct: 0,
      plafondTravauxParLogement: 25000,
      plafondMprParLogement: 11250,
      fondsTravaux: 51166.45,
      commentaireFondsTravaux:
        "Fonds travaux disponible dans la copropriété (5 766,45 €) + montants déjà appelés pour les études - AMO, MOE, diagnostics (45 400,00 €)",
      totalTantiemes: 1000,
      tantiemesExemples: [43, 114, 204],
      dureeEcoPtzAns: 20,
      coefAssurance: 1.03,
      tauxPretAvancePct: 5.45,
      pctAvanceAides: 70,
    },
    variantes: { collectif: true, collectifSansAvance: false, individuel: false },
  };
}
