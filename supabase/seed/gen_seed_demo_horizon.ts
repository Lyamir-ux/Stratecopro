// Générateur du seed « copro vitrine » de l'organisation de démo commerciale
// SYNDIC HORIZON GRAND EST (voir seed_demo_horizon.sql pour l'organisation).
//
// Pourquoi un générateur : le PF définitif stocke `data` ET `resultat` figé
// (calculé par computePlanDefinitif côté app), et le partage au portail
// matérialise des plans individuels calculés par computePlansIndividuelsPf.
// Pour que la démo soit rigoureusement cohérente avec ce que l'app aurait
// produit, on passe par le vrai moteur financier plutôt que de recopier des
// chiffres à la main.
//
// Usage :  npx vite-node supabase/seed/gen_seed_demo_horizon.ts
// Produit : supabase/seed/seed_demo_horizon_vitrine.sql (idempotent)
//
// Toutes les données sont FICTIVES (copropriété, copropriétaires, entreprises).
// Les montants s'inspirent des ordres de grandeur du PF BOUDHORS (arrondis).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  computePlanDefinitif,
  readPlanDefinitif,
  itemsARepartirPf,
  computePlansIndividuelsPf,
  determineProfil,
  round2,
  BAREME_2026_HORS_IDF,
  type CoproTantiemes,
  type PlanDefinitifData,
} from "../../src/lib/finance";
import { makeDefaultParams } from "../../src/api/scenarios";
import { defaultConfig } from "../../src/lib/enqueteCatalogue";

const SLUG = "demo-parc-des-cigognes";
const CLE = "MUN";

// ---------------------------------------------------------------------------
// 1. Les 28 copropriétaires fictifs (tantièmes MUN, total exactement 10000)
// ---------------------------------------------------------------------------
interface Owner {
  nom: string;
  type: "occupant" | "bailleur";
  lot: string; // lot d'habitation
  t: number; // tantièmes du lot d'habitation
  garage?: string; // 25 tantièmes
  cave?: string; // 10 tantièmes
  // Enquête sociale (absente = n'a pas répondu)
  enquete?: { personnes: number; rfr: number };
}

const OWNERS: Owner[] = [
  { nom: "Paul et Sophie WEBER", type: "occupant", lot: "101", t: 340, garage: "G01", cave: "C01", enquete: { personnes: 2, rfr: 31800 } },
  { nom: "Anne SCHNEIDER", type: "occupant", lot: "102", t: 320, enquete: { personnes: 1, rfr: 17200 } },
  { nom: "Jean MULLER", type: "bailleur", lot: "103", t: 305, garage: "G02" },
  { nom: "Marc et Julie KLEIN", type: "occupant", lot: "104", t: 330, garage: "G03", enquete: { personnes: 3, rfr: 44600 } },
  { nom: "SCI LES CIGOGNES", type: "bailleur", lot: "105", t: 365, garage: "G04" },
  { nom: "Claire HOFFMANN", type: "occupant", lot: "106", t: 275, enquete: { personnes: 1, rfr: 24900 } },
  { nom: "Pierre SCHMITT", type: "occupant", lot: "107", t: 290, cave: "C02", enquete: { personnes: 2, rfr: 27400 } },
  { nom: "Monique LEHMANN", type: "occupant", lot: "108", t: 265, enquete: { personnes: 1, rfr: 14300 } },
  { nom: "Luc et Emma WAGNER", type: "occupant", lot: "201", t: 340, garage: "G05", enquete: { personnes: 4, rfr: 52300 } },
  { nom: "Karim BENTAHAR", type: "occupant", lot: "202", t: 320, enquete: { personnes: 3, rfr: 33100 } },
  { nom: "Linh NGUYEN", type: "occupant", lot: "203", t: 305, enquete: { personnes: 2, rfr: 41500 } },
  { nom: "Denis ROTHENBERGER", type: "bailleur", lot: "204", t: 330, cave: "C03" },
  { nom: "Maria DA SILVA", type: "occupant", lot: "205", t: 365, garage: "G06", enquete: { personnes: 2, rfr: 22800 } },
  { nom: "David et Laura BAUMANN", type: "occupant", lot: "206", t: 275, enquete: { personnes: 2, rfr: 58200 } },
  { nom: "Indivision FRITSCH", type: "occupant", lot: "207", t: 290, enquete: { personnes: 1, rfr: 19600 } },
  { nom: "Samia AMARA", type: "occupant", lot: "208", t: 265, enquete: { personnes: 2, rfr: 20900 } },
  { nom: "Michel GERBER", type: "occupant", lot: "301", t: 340, garage: "G07", enquete: { personnes: 1, rfr: 36400 } },
  { nom: "Nathalie WENDLING", type: "bailleur", lot: "302", t: 320 },
  { nom: "Carlos et Ana LOPEZ", type: "occupant", lot: "303", t: 305, enquete: { personnes: 5, rfr: 47800 } },
  { nom: "Robert KAUFFMANN", type: "occupant", lot: "304", t: 330, cave: "C04", enquete: { personnes: 1, rfr: 12100 } },
  { nom: "Brigitte ZIMMERMANN", type: "occupant", lot: "305", t: 365, enquete: { personnes: 2, rfr: 63500 } },
  { nom: "Francois HECKEL", type: "bailleur", lot: "306", t: 275, garage: "G08" },
  { nom: "Julien et Marie ROUSSEL", type: "occupant", lot: "307", t: 290, enquete: { personnes: 4, rfr: 38900 } },
  { nom: "Sylvie KOENIG", type: "occupant", lot: "308", t: 265, cave: "C05", enquete: { personnes: 1, rfr: 15800 } },
  { nom: "Nabil TOUATI", type: "occupant", lot: "401", t: 610, enquete: { personnes: 4, rfr: 71200 } },
  { nom: "Isabelle EBERLE", type: "occupant", lot: "402", t: 590, enquete: { personnes: 2, rfr: 29700 } },
  { nom: "SCI DU RIED", type: "bailleur", lot: "403", t: 560, cave: "C06" },
  { nom: "Hugo et Celine MARTIN", type: "occupant", lot: "404", t: 510, enquete: { personnes: 3, rfr: 26200 } },
];

const T_GARAGE = 25;
const T_CAVE = 10;
const totalT = OWNERS.reduce(
  (s, o) => s + o.t + (o.garage ? T_GARAGE : 0) + (o.cave ? T_CAVE : 0),
  0
);
if (totalT !== 10000) throw new Error(`Total tantièmes = ${totalT}, attendu 10000`);

// ---------------------------------------------------------------------------
// 2. Plan de financement définitif (structure calquée sur le PF BOUDHORS)
// ---------------------------------------------------------------------------
const NB_LOG = 28;

const rawData: PlanDefinitifData = {
  infos: {
    nomCopro: "LE PARC DES CIGOGNES",
    adresse: "12-14 rue des Cigognes 67000 Strasbourg",
    nbLogements: NB_LOG,
    nbLogementsEquiv: NB_LOG,
    surfaceHabitable: 1780,
    nbEtages: 5,
    nbEntrees: 2,
    typeChauffage: "Fioul collectif",
    cepInitial: 328,
    cepProjet: 92,
    dispositifClimaxion: true,
    etiquetteInitiale: "F",
    etiquetteProjet: "C",
  },
  lots: [
    {
      numero: 1,
      titre: "Isolation thermique par l'exterieur",
      entreprise: "FACADES DE L'ILL",
      remisePct: 0,
      lignes: [
        { retenu: true, tvaPct: 5.5, montantHt: 38000, designation: "Echafaudage" },
        { retenu: true, tvaPct: 5.5, montantHt: 182000, designation: "Isolation thermique par l'exterieur en laine de roche 200 mm" },
        { retenu: true, tvaPct: 5.5, montantHt: 42000, designation: "Traitement des balcons" },
        { retenu: true, tvaPct: 5.5, montantHt: 24000, designation: "Garde-corps" },
        { retenu: true, tvaPct: 5.5, montantHt: 9500, designation: "Bandeaux et departs" },
        { retenu: false, tvaPct: 10, montantHt: 4200, designation: "Soubassement" },
        { retenu: false, tvaPct: 10, montantHt: 9800, designation: "Sous-faces de balcons" },
        { retenu: false, tvaPct: 10, montantHt: 6500, designation: "Peinture des parties communes" },
      ],
    },
    {
      numero: 2,
      titre: "Toiture et etancheite",
      entreprise: "TOITURES DU RIED",
      remisePct: 0,
      lignes: [
        { retenu: true, tvaPct: 5.5, montantHt: 16000, designation: "Depose de la couverture existante" },
        { retenu: true, tvaPct: 5.5, montantHt: 21500, designation: "Isolation sarking 220 mm R=7,5 m2.K/W" },
        { retenu: true, tvaPct: 5.5, montantHt: 38500, designation: "Couverture zinc a joint debout" },
        { retenu: true, tvaPct: 5.5, montantHt: 19800, designation: "Etancheite terrasse avec isolation polyurethane 170 mm" },
        { retenu: true, tvaPct: 5.5, montantHt: 8200, designation: "Zingueries et cheneaux" },
      ],
    },
    {
      numero: 3,
      titre: "Chaufferie",
      entreprise: "THERMIC EST",
      remisePct: 0,
      lignes: [
        { retenu: true, tvaPct: 5.5, montantHt: 46000, designation: "Remplacement de la chaudiere fioul par une chaudiere gaz a condensation" },
        { retenu: true, tvaPct: 5.5, montantHt: 11500, designation: "Calorifugeage des reseaux" },
        { retenu: true, tvaPct: 5.5, montantHt: 8200, designation: "Equilibrage des reseaux" },
        { retenu: false, tvaPct: 10, montantHt: 5400, designation: "Reprise du conduit de fumee" },
      ],
    },
    {
      numero: 4,
      titre: "Ventilation",
      entreprise: "AIRFLUX ALSACE",
      remisePct: 0,
      lignes: [
        { retenu: true, tvaPct: 5.5, montantHt: 8400, designation: "Caissons d'extraction hygroreglables" },
        { retenu: true, tvaPct: 5.5, montantHt: 9600, designation: "Gaines et bouches d'extraction" },
        { retenu: true, tvaPct: 5.5, montantHt: 3800, designation: "Carottages et calfeutrements" },
        { retenu: true, tvaPct: 5.5, montantHt: 1400, designation: "Mise en service et reglages" },
      ],
    },
    {
      numero: 5,
      titre: "Menuiseries des parties communes",
      entreprise: "FENETRES RHENANES",
      remisePct: 0,
      lignes: [
        { retenu: true, tvaPct: 5.5, montantHt: 7400, designation: "Portes de halls avec gache electrique" },
        { retenu: true, tvaPct: 5.5, montantHt: 5200, designation: "Chassis des cages d'escalier" },
        { retenu: false, tvaPct: 10, montantHt: 1900, designation: "Volets des locaux communs" },
      ],
    },
    {
      numero: 6,
      titre: "Etancheite a l'air",
      entreprise: "ISOL'AIR GRAND EST",
      remisePct: 0,
      lignes: [
        { retenu: true, tvaPct: 5.5, montantHt: 18000, designation: "Travaux d'impermeabilite a l'air" },
      ],
    },
  ],
  moe: [
    { phase: "etude", tvaPct: 20, montant: { mode: "forfait", montantHt: 1200 }, entreprise: "STRAT ECO", designation: "Assistance Maitrise d'Ouvrage (phase conseil)", commentaire: "Phase conseil, assistance technique et approche financiere", eligibleMprAmo: true, eligibleMprEtudes: false },
    { phase: "etude", tvaPct: 10, montant: { mode: "forfait", montantHt: 5000 }, entreprise: "ARCHILOGIS", designation: "Maitrise d'oeuvre phase etudes (DIAG-AVP)", commentaire: "Etude, avant-projet", eligibleMprAmo: false, eligibleMprEtudes: true },
    { phase: "etude", tvaPct: 20, montant: { mode: "forfait", montantHt: 700 }, entreprise: "EST THERMO CONSEIL", designation: "Audit reglementaire", commentaire: "Mise a jour", eligibleMprAmo: false, eligibleMprEtudes: false },
    { phase: "etude", tvaPct: 20, montant: { mode: "forfait", montantHt: 2600 }, entreprise: "DIAG EXPERT 67", designation: "Diagnostic amiante avant travaux", eligibleMprAmo: false, eligibleMprEtudes: false },
    { phase: "projet", tvaPct: 20, montant: { mode: "forfait", montantHt: 3400 }, entreprise: "STRAT ECO", designation: "Assistance Maitrise d'Ouvrage (phase projet)", commentaire: "Prestation obligatoire, assistance projet, administrative, financiere", eligibleMprAmo: true, eligibleMprEtudes: false },
    { phase: "projet", tvaPct: 10, montant: { mode: "forfait", montantHt: 28000 }, entreprise: "ARCHILOGIS", designation: "Maitrise d'oeuvre phase conception (PRO-DCE)", commentaire: "Cahiers des charges, depot de DP, DCE", eligibleMprAmo: false, eligibleMprEtudes: true },
    { phase: "projet", tvaPct: 20, montant: { mode: "forfait", montantHt: 1500 }, designation: "Controle technique", commentaire: "Prestations necessaires", eligibleMprAmo: false, eligibleMprEtudes: true },
    { phase: "projet", tvaPct: 20, montant: { mode: "forfait", montantHt: 950 }, designation: "CSPS", commentaire: "Prestations necessaires", eligibleMprAmo: false, eligibleMprEtudes: true },
    { phase: "projet", tvaPct: 20, montant: { mode: "forfait", montantHt: 600 }, entreprise: "AERO TEST", designation: "Test d'etancheite a l'air avant travaux", commentaire: "Obligation Climaxion", eligibleMprAmo: false, eligibleMprEtudes: false },
    { phase: "projet", tvaPct: 20, montant: { mode: "forfait", montantHt: 1800 }, entreprise: "ARCHILOGIS", designation: "Memoire technique Climaxion", eligibleMprAmo: false, eligibleMprEtudes: false },
    { phase: "travaux", tvaPct: 20, montant: { mode: "forfait", montantHt: 6200 }, entreprise: "STRAT ECO", designation: "Assistance Maitrise d'Ouvrage (phase travaux)", commentaire: "Prestation obligatoire, assistance projet, administrative, financiere", eligibleMprAmo: true, eligibleMprEtudes: false },
    { phase: "travaux", tvaPct: 5.5, montant: { mode: "pctTravauxHt", taux: 3.6 }, entreprise: "ARCHILOGIS", designation: "Maitrise d'oeuvre phase travaux", commentaire: "Pilotage et reception des travaux", eligibleMprAmo: false, eligibleMprEtudes: true },
    { phase: "travaux", tvaPct: 20, montant: { mode: "forfait", montantHt: 3200 }, designation: "Controle technique", commentaire: "Prestations necessaires", eligibleMprAmo: false, eligibleMprEtudes: true },
    { phase: "travaux", tvaPct: 20, montant: { mode: "forfait", montantHt: 1600 }, designation: "CSPS", commentaire: "Prestations necessaires", eligibleMprAmo: false, eligibleMprEtudes: true },
    { phase: "travaux", tvaPct: 20, montant: { mode: "forfait", montantHt: 600 }, entreprise: "AERO TEST", designation: "Test d'etancheite a l'air apres travaux", commentaire: "Obligation Climaxion", eligibleMprAmo: false, eligibleMprEtudes: false },
    { phase: "travaux", tvaPct: 0, montant: { mode: "pctTravauxTtc", taux: 2 }, entreprise: "ASSURANCES DU RHIN", designation: "Dommage ouvrage", commentaire: "Obligatoire", eligibleMprAmo: false, eligibleMprEtudes: false },
    { phase: "travaux", tvaPct: 20, montant: { mode: "pctTravauxHt", taux: 2.5 }, entreprise: "SYNDIC HORIZON GRAND EST", designation: "Honoraires syndic", commentaire: "Selon informations du syndic", eligibleMprAmo: false, eligibleMprEtudes: false },
  ],
  aides: [
    { id: "cee-fiche-par-fiche", groupe: "CEE", libelle: "CEE fiche par fiche", publique: false, calcul: { mode: "manuel", montant: 16000 }, commentaire: "Depend des lots de travaux energetiques et de la surface habitable" },
    { id: "maprimerenov-partie-travaux", groupe: "ANAH", libelle: "Maprimerenov' partie travaux", publique: true, calcul: { mode: "pctAssietteTravaux", taux: 45, coef: 1 }, commentaire: "45 % du montant des travaux energetiques HT - plafonne a 11250 EUR par logement" },
    { id: "maprimerenov-partie-etudes", groupe: "ANAH", libelle: "Maprimerenov' partie etudes", publique: true, calcul: { mode: "pctEtudes", taux: 45, coef: 0.9 }, commentaire: "45 % du montant des etudes, diags, maitrise d'oeuvre HT" },
    { id: "maprimerenov-amo", groupe: "ANAH", libelle: "Maprimerenov' AMO", publique: true, calcul: { mode: "pctAmo", taux: 50 }, commentaire: "50 % du montant de la prestation d'assistance a maitrise d'ouvrage HT" },
    { id: "maprimerenov-individuelle", groupe: "ANAH", libelle: "Maprimerenov' individuelle", publique: true, calcul: { mode: "info" }, commentaire: "Aide individuelle de 1500 EUR ou de 3000 EUR selon revenus du coproprietaire occupant" },
    { id: "climaxion-aide-travaux", groupe: "Climaxion", libelle: "Climaxion aide travaux", publique: true, calcul: { mode: "forfaitPlusParLogement", base: 10000, parLogement: 2500, surEquivalent: true }, commentaire: "Dispositif Climaxion sous reserve d'eligibilite" },
    { id: "climaxion-aide-amo", groupe: "Climaxion", libelle: "Climaxion aide AMO", publique: true, calcul: { mode: "manuel", montant: 4000 }, commentaire: "Aide Climaxion sur la prestation AMO" },
    { id: "ems-aide-travaux", groupe: "EMS", libelle: "EMS aide travaux", publique: true, calcul: { mode: "parLogement", montant: 1000, surEquivalent: true }, commentaire: "Dispositif Eurometropole de Strasbourg suivant le cahier des charges Climaxion" },
    { id: "ems-aide-moe", groupe: "EMS", libelle: "EMS aide MOE", publique: true, calcul: { mode: "manuel", montant: 3000 }, commentaire: "Dispositif EMS pour la maitrise d'oeuvre" },
    { id: "ems-bbc-renovation", groupe: "EMS", libelle: "EMS BBC renovation", publique: true, calcul: { mode: "parLogement", montant: 500, surEquivalent: false }, commentaire: "Dispositif EMS pour l'atteinte de 110 kWhEp/m2/an" },
  ],
  params: {
    imprevusPct: 7,
    plafondTravauxParLogement: 25000,
    plafondMprParLogement: 11250,
    plafondAmoParLogement: 600,
    fondsTravaux: 20000,
    commentaireFondsTravaux: "Fonds travaux loi ALUR disponible au 01/07/2026",
    totalTantiemes: 10000,
    tantiemesExemples: [265, 340, 610],
    dureeEcoPtzAns: 20,
    coefAssurance: 1.036,
    tauxPretAvancePct: 5.45,
    pctAvanceAides: 70,
  },
  variantes: { collectif: true, collectifSansAvance: false, individuel: false },
  repartitionCles: {},
};

const data = readPlanDefinitif(rawData);
const resultat = computePlanDefinitif(data);

// ---------------------------------------------------------------------------
// 3. Plans individuels (même circuit que « Partager aux copropriétaires »)
// ---------------------------------------------------------------------------
const items = itemsARepartirPf(data, resultat);
const copros: CoproTantiemes[] = OWNERS.map((o) => ({
  coproprietaireId: o.nom, // le SQL retrouvera l'uuid par le nom
  nom: o.nom,
  tantiemes: { [CLE]: o.t + (o.garage ? T_GARAGE : 0) + (o.cave ? T_CAVE : 0) },
}));
const cleParItem = Object.fromEntries(items.map((it) => [it.id, CLE]));
const { plans, manquants } = computePlansIndividuelsPf({
  items,
  cleParItem,
  copros,
  totauxCles: { [CLE]: 10000 },
  totalAides: resultat.totalAides,
  fondsTravaux: data.params.fondsTravaux,
  totalPhaseTravauxTtc: resultat.totalPhaseTravauxTtc,
});
if (manquants.length) throw new Error(`Lignes sans cle : ${manquants.length}`);
if (plans.length !== OWNERS.length) throw new Error(`Plans individuels : ${plans.length}/${OWNERS.length}`);

// Params du scénario « pont » du portail - copie de usePartagerPfCopros.
const bareme = BAREME_2026_HORS_IDF;
const travaux = round2(resultat.totalTravauxTtc);
const scenarioParams = {
  ...makeDefaultParams(bareme),
  travaux,
  honoraires: round2(resultat.totalMoeTtc),
  aleas: round2(resultat.totalTravauxTtcImprevus - resultat.totalTravauxTtc),
  cle: CLE,
  totalCle: 10000,
  mprCoproPct: travaux > 0 ? round2(((resultat.totalAides - resultat.primeCee) / travaux) * 100) : 0,
  bonusPassoire: false,
  cee: round2(resultat.primeCee),
  fonds: data.params.fondsTravaux,
  ecoPtz: true,
  ecoPtzDuree: data.params.dureeEcoPtzAns,
};

// ---------------------------------------------------------------------------
// 4. Émission du SQL
// ---------------------------------------------------------------------------
const q = (s: string) => s.replace(/'/g, "''");
const jsonSql = (v: unknown) => `$json$${JSON.stringify(v)}$json$::jsonb`;

const ownersValues = OWNERS.map(
  (o) => `      ('${q(o.nom)}', '${o.type}', '${o.lot}', ${o.t}, ${o.garage ? `'${o.garage}'` : "null"}, ${o.cave ? `'${o.cave}'` : "null"})`
).join(",\n");

const enqValues = OWNERS.filter((o) => o.enquete || o.type === "bailleur")
  .map((o) => {
    if (o.type === "bailleur")
      return `      ('${q(o.nom)}', null, null, 'Proprietaire bailleur (logement loue)', null)`;
    const e = o.enquete!;
    const profil = determineProfil(e.personnes, e.rfr, bareme);
    return `      ('${q(o.nom)}', ${e.personnes}, ${e.rfr}, 'Proprietaire occupant', '${profil}')`;
  })
  .join(",\n");

const plansValues = plans
  .map((p) => {
    const o = OWNERS.find((x) => x.nom === p.nom)!;
    const tRef = o.t + (o.garage ? T_GARAGE : 0) + (o.cave ? T_CAVE : 0);
    return `      ('${q(p.nom)}', ${tRef}, ${p.quotePartAvant}, ${p.aidesEtFonds}, ${p.reste})`;
  })
  .join(",\n");

const gainPct = Math.round(resultat.performancePct * 10) / 10;

const sql = `-- Copro vitrine de la démo commerciale : LE PARC DES CIGOGNES (fictive).
-- GÉNÉRÉ par gen_seed_demo_horizon.ts - ne pas éditer à la main, relancer :
--   npx vite-node supabase/seed/gen_seed_demo_horizon.ts
-- Prérequis : seed_demo_horizon.sql (organisation, copropriétés, gestionnaires).
-- Idempotent : chaque bloc se saute s'il a déjà été joué.
--
-- Totaux calculés par le moteur de l'app (computePlanDefinitif) :
--   travaux TTC ${round2(resultat.totalTravauxTtc)} EUR - opération TTC ${round2(resultat.totalOperationTtc)} EUR
--   aides ${round2(resultat.totalAides)} EUR (dont CEE ${round2(resultat.primeCee)}) - couverture ${round2(resultat.tauxCouverture)} %
--   reste à charge collectif ${round2(resultat.resteACharge)} EUR - gain énergétique ${gainPct} %

begin;

-- ========== Copropriétaires, lots et tantièmes (clé unique MUN) ==========
do $$
declare
  v_copro uuid;
  v_bat uuid;
  v_cle uuid;
  r record;
  v_cp uuid;
  v_hab uuid;
  v_lot uuid;
begin
  select id into v_copro from coproprietes where slug = '${SLUG}';
  if v_copro is null then
    raise exception 'Copropriété ${SLUG} absente - jouer seed_demo_horizon.sql d''abord.';
  end if;
  if exists (select 1 from lots where copro_id = v_copro) then
    raise notice 'Lots déjà présents - bloc données sauté.';
    return;
  end if;

  select id into v_bat from batiments where copro_id = v_copro and code = '01';

  insert into cles_repartition (copro_id, code, label, is_default)
  values (v_copro, '${CLE}', 'Tantièmes généraux', true)
  on conflict do nothing;
  select id into v_cle from cles_repartition where copro_id = v_copro and code = '${CLE}';

  for r in
    select * from (values
${ownersValues}
    ) as t(nom, type, lot_hab, tant, lot_garage, lot_cave)
  loop
    insert into coproprietaires (copro_id, nom, type)
    values (v_copro, r.nom, r.type)
    returning id into v_cp;

    insert into lots (copro_id, batiment_id, coproprietaire_id, num, usage)
    values (v_copro, v_bat, v_cp, r.lot_hab, 'habitation')
    returning id into v_hab;
    insert into lot_tantiemes (lot_id, cle_id, tantiemes) values (v_hab, v_cle, r.tant);

    if r.lot_garage is not null then
      insert into lots (copro_id, batiment_id, coproprietaire_id, num, usage, rattache_a)
      values (v_copro, v_bat, v_cp, r.lot_garage, 'garage', v_hab)
      returning id into v_lot;
      insert into lot_tantiemes (lot_id, cle_id, tantiemes) values (v_lot, v_cle, ${T_GARAGE});
    end if;

    if r.lot_cave is not null then
      insert into lots (copro_id, batiment_id, coproprietaire_id, num, usage, rattache_a)
      values (v_copro, v_bat, v_cp, r.lot_cave, 'caves', v_hab)
      returning id into v_lot;
      insert into lot_tantiemes (lot_id, cle_id, tantiemes) values (v_lot, v_cle, ${T_CAVE});
    end if;
  end loop;
end $$;

-- ========== Enquête sociale (profils MaPrimeRénov) ==========
do $$
declare
  v_copro uuid;
  v_enq uuid;
  r record;
begin
  select id into v_copro from coproprietes where slug = '${SLUG}';
  if v_copro is null or exists (select 1 from enquetes where copro_id = v_copro) then
    return;
  end if;

  insert into enquetes (copro_id, questions, statut, sent_at)
  values (v_copro, ${jsonSql(defaultConfig())}, 'envoyee', now() - interval '45 days')
  returning id into v_enq;

  for r in
    select * from (values
${enqValues}
    ) as t(nom, personnes, rfr, occupation, profil)
  loop
    insert into enquete_reponses (enquete_id, coproprietaire_id, nb_personnes, rfr, statut_occupation, profil_mpr, reponses)
    select v_enq, cp.id, r.personnes, r.rfr, r.occupation, r.profil, '{}'::jsonb
    from coproprietaires cp
    where cp.copro_id = v_copro and cp.nom = r.nom;
  end loop;
end $$;

-- ========== PF définitif validé (data + resultat figés par le moteur) ==========
do $$
declare
  v_copro uuid;
begin
  select id into v_copro from coproprietes where slug = '${SLUG}';
  if v_copro is null or exists (select 1 from plans_definitifs where copro_id = v_copro) then
    return;
  end if;

  insert into plans_definitifs (copro_id, nom, data, resultat, statut, source_fichier)
  values (
    v_copro,
    'PF définitif - Le Parc des Cigognes',
    ${jsonSql(data)},
    ${jsonSql(resultat)},
    'valide',
    null
  );

  -- Comme useValiderPlanDefinitif : le PF validé fait foi sur le dossier.
  update coproprietes
  set gain_pct = ${gainPct}, energy_before = 'F', energy_after = 'C'
  where id = v_copro;
end $$;

-- ========== Partage au portail : scénario pont + plans individuels ==========
do $$
declare
  v_copro uuid;
  v_plan uuid;
  v_scen uuid;
  r record;
begin
  select id into v_copro from coproprietes where slug = '${SLUG}';
  if v_copro is null then return; end if;
  select id into v_plan from plans_definitifs where copro_id = v_copro and statut = 'valide';
  if v_plan is null or exists (select 1 from scenarios_financiers where plan_definitif_id = v_plan) then
    return;
  end if;

  insert into scenarios_financiers (copro_id, name, statut, locked, bareme_millesime, params, plan_definitif_id)
  values (
    v_copro,
    'PF définitif - PF définitif - Le Parc des Cigognes',
    'partage',
    true,
    ${bareme.millesime},
    ${jsonSql(scenarioParams)},
    v_plan
  )
  returning id into v_scen;

  for r in
    select * from (values
${plansValues}
    ) as t(nom, tantiemes, quote_part, subv_coll_part, reste)
  loop
    insert into plans_individuels (scenario_id, coproprietaire_id, tantiemes, quote_part, mpr_indiv, cee_part, subv_coll_part, eco_ptz_part, reste, mensualite, detail)
    select v_scen, cp.id, r.tantiemes, r.quote_part, 0, 0, r.subv_coll_part, 0, r.reste, 0,
           jsonb_build_object('source', 'pf', 'planDefinitifId', v_plan)
    from coproprietaires cp
    where cp.copro_id = v_copro and cp.nom = r.nom;
  end loop;
end $$;

-- ========== Quelques messages dans la messagerie du dossier ==========
do $$
declare
  v_copro uuid;
begin
  select id into v_copro from coproprietes where slug = '${SLUG}';
  if v_copro is null or exists (select 1 from messages_projet where copro_id = v_copro) then
    return;
  end if;

  insert into messages_projet (copro_id, canal, auteur_nom, auteur_role, body, created_at) values
    (v_copro, 'syndic', 'Thomas Keller', 'syndic',
     'Bonjour, le conseil syndical demande si la date de demarrage du lot toiture est confirmee pour octobre ?',
     now() - interval '6 days'),
    (v_copro, 'syndic', 'Strat Eco - Chef de projet', 'amo',
     'Bonjour, oui : demarrage confirme au 05/10, l''echafaudage sera pose la semaine precedente. Le planning detaille est depose dans l''onglet Fichiers.',
     now() - interval '5 days'),
    (v_copro, 'coproprietaires', 'Strat Eco - Chef de projet', 'amo',
     'Les plans de financement individuels sont disponibles sur votre portail. Vous pouvez y consulter votre quote-part, les aides deduites et votre reste a charge.',
     now() - interval '3 days');
end $$;

-- ========== Compte portail du copropriétaire de démo ==========
-- Identifiants : coproprietaire@syndic-horizon-demo.fr / Horizon-Copro-2026!
do $$
declare
  v_uid uuid := gen_random_uuid();
  v_cp uuid;
begin
  if exists (select 1 from auth.users where email = 'coproprietaire@syndic-horizon-demo.fr') then
    return;
  end if;

  select cp.id into v_cp
  from coproprietaires cp
  join coproprietes c on c.id = cp.copro_id and c.slug = '${SLUG}'
  where cp.nom = 'Paul et Sophie WEBER';
  if v_cp is null then return; end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'coproprietaire@syndic-horizon-demo.fr', extensions.crypt('Horizon-Copro-2026!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  );
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', 'coproprietaire@syndic-horizon-demo.fr', 'email_verified', true),
    'email', v_uid::text, now(), now(), now()
  );
  insert into profiles (user_id, full_name, initials, role)
  values (v_uid, 'Paul et Sophie WEBER', 'MW', 'copro');

  update coproprietaires set user_id = v_uid, email = 'coproprietaire@syndic-horizon-demo.fr'
  where id = v_cp;
end $$;

commit;
`;

const out = join(dirname(fileURLToPath(import.meta.url)), "seed_demo_horizon_vitrine.sql");
writeFileSync(out, sql, "utf8");

console.log(`Écrit : ${out}`);
console.log(`Tantièmes : ${totalT} - plans individuels : ${plans.length} (manquants : ${manquants.length})`);
console.log(`Travaux TTC : ${round2(resultat.totalTravauxTtc)} EUR - opération TTC : ${round2(resultat.totalOperationTtc)} EUR`);
console.log(`Aides : ${round2(resultat.totalAides)} EUR (CEE ${round2(resultat.primeCee)}) - couverture : ${round2(resultat.tauxCouverture)} %`);
console.log(`Reste à charge : ${round2(resultat.resteACharge)} EUR - gain : ${gainPct} %`);
console.log(`Garde-fous : ${resultat.gardeFous.map((g) => `${g.libelle} ${g.ok ? "ok" : "DEPASSE"}`).join(" | ")}`);
