// Générateur de l'organisation de test « SYNDIC TEST PARCOURS » (100 % fictive),
// demandée par Amir le 08/10/2026 pour dérouler des parcours de test côté
// copropriétés : 4 copropriétés (Metz, Nancy, Strasbourg, Colmar), chacune avec un
// PF définitif validé et une liste de copropriétaires ; LES BALCONS DE LA LAUCH
// (Colmar) est « la totale » : enquête envoyée avec réponses, PF partagé au
// portail, choix de financement partiels, adhésions au prêt collectif.
//
// Les trois testeurs (Marius ONBUS, Pierre MAXTAFF, Cyrielle ONTHEMIC) sont
// copropriétaires de Colmar avec leur vraie adresse e-mail et AUCUNE réponse /
// choix / adhésion : ils peuvent faire eux-mêmes tout le parcours du portail.
// Les autres copropriétaires n'ont PAS d'e-mail : aucun e-mail réel ne peut partir
// vers de fausses adresses (Resend est actif en prod).
//
// Étapes de chaque copropriété (comme l'app) :
//   1. dossier : copropriété, bâtiments, plan de tâches gabarit ;
//   2. PF définitif validé (vrai moteur : computePlanDefinitif) ;
//   3. onglet Données : clé de répartition, copropriétaires, lots, tantièmes ;
//   4. enquête (aucune / brouillon / envoyée avec réponses) ;
//   5. partage du PF au portail (scénario pont + plans individuels) ;
//   6. choix de financement et adhésions (Colmar seule).
//
// Usage :  npx vite-node supabase/seed/gen_seed_test_parcours.ts
// Produit : supabase/seed/seed_test_parcours.sql (blocs séparés par « -- @@BLOC »,
//           chacun idempotent, à jouer dans l'ordre). Purge : purge_test_parcours.sql.
//
// Toutes les données sont FICTIVES (noms, revenus, choix) sauf les trois testeurs.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  BAREME_2026_HORS_IDF,
  computePlanDefinitif,
  determineProfil,
  readPlanDefinitif,
  repartirPfDepuisLots,
  round2,
  type Profil,
} from "../../src/lib/finance";
import { makeDefaultParams } from "../../src/api/scenarios";
import { defaultConfig } from "../../src/lib/enqueteCatalogue";
import type { Copro } from "./demo_horizon_pf";
import { ORG_NOM, clos, lauch, mirabelles, neudorf } from "./test_parcours_pf";

const ORG_SLUG = "test-parcours";
const TAG = "Test parcours";
const CLE = "MUN";
const TOTAL_CLE = 10000;
const AMO_EMAIL = "amir@strateco.fr"; // vérifie les profils, saisit en aperçu

// ---------------------------------------------------------------------------
// Aléa déterministe (mulberry32) : le seed est reproductible à l'octet.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRENOMS_F = ["Marie", "Sophie", "Nathalie", "Isabelle", "Catherine", "Sylvie", "Christine", "Sandrine", "Celine", "Aurelie", "Camille", "Lea", "Chloe", "Julie", "Emilie", "Laurence", "Martine", "Monique", "Nadia", "Fatima", "Amina", "Leila", "Anne", "Claire", "Helene", "Valerie", "Patricia", "Elodie", "Manon", "Ines"];
const PRENOMS_M = ["Jean", "Michel", "Philippe", "Alain", "Patrick", "Christophe", "Nicolas", "Julien", "Sebastien", "Thomas", "Maxime", "Antoine", "Lucas", "Hugo", "Karim", "Mehdi", "Yanis", "Mohamed", "Rachid", "Pierre", "Paul", "Bernard", "Gerard", "Daniel", "Francois", "Laurent", "Olivier", "Vincent", "Romain", "Kevin"];
const NOMS = ["THIRIET", "MANGIN", "HUSSON", "GERARD", "COLIN", "MARCHAL", "PIERRON", "BASTIEN", "CLAUDEL", "GEORGE", "VILLEMIN", "POIROT", "MATHIEU", "PERRIN", "ANTOINE", "DIDIER", "NOEL", "VAUTRIN", "HENRY", "REMY", "JACQUOT", "GRANDJEAN", "ROLIN", "MASSON", "SCHMITT", "WEBER", "KLEIN", "MULLER", "BENALI", "HADDAD", "DA COSTA", "FERREIRA", "NGUYEN", "TRAN", "ROSSI", "BIANCHI", "LEFEVRE", "GAUTHIER", "DUPONT", "MOREAU", "GIRARD", "ROBERT", "FOURNIER", "LAMBERT", "BONNET", "MERCIER", "BLANC", "GUERIN", "ROUX", "DUBOIS", "PETIT", "RENARD", "HUMBERT", "AUBRY", "ADAM", "BOULANGER", "TOUSSAINT", "CUNY", "GRANDIDIER", "ZIMMERMANN", "LORRAIN", "BARBIER", "CHRETIEN", "SIMONIN"];
const ADRESSES_BAILLEURS = [
  "4 rue de Metz, 54520 Laxou",
  "22 avenue du General Leclerc, 54500 Vandoeuvre-les-Nancy",
  "9 rue Serpenoise, 57000 Metz",
  "31 boulevard Voltaire, 75011 Paris",
  "6 rue de la Republique, 69002 Lyon",
  "17 rue Saint-Dizier, 54000 Nancy",
  "12 rue des Jardins, 67200 Strasbourg",
  "3 place Kleber, 67000 Strasbourg",
  "45 rue des Clefs, 68000 Colmar",
  "8 rue du Faubourg, 88000 Epinal",
];
const PROFESSIONS = ["Enseignant(e)", "Infirmier(e)", "Employe(e) de banque", "Technicien(ne)", "Cadre commercial", "Retraite(e)", "Artisan", "Fonctionnaire territorial(e)", "Aide-soignant(e)", "Ingenieur(e)", "Comptable", "Agent administratif", "Chauffeur-livreur", "Pharmacien(ne)", "Sans activite"];
const SITUATIONS = ["mariee", "celibataire", "pacsee", "divorcee", "veuve"] as const;

type TypeCopro = "physique" | "couple" | "indivision" | "sci";
type Fin = "collectif" | "individuel" | "fonds";
type SaisiPar = "copro" | "syndic" | "amo";

interface Tester {
  nom: string; // « Prénom NOM »
  email: string;
  type: "occupant" | "bailleur";
  lot: number; // numéro du lot d'habitation
  cave: boolean;
  garage: boolean;
  adresse: string | null;
  /** compte portail déjà existant (rôle copro) à relier à la fiche */
  lierCompteExistant: boolean;
}

interface CoproCfg {
  pf: Copro;
  seed: number;
  ville: string;
  cp: string;
  rue: string; // « 9 rue Fabert »
  nbHab: number;
  nbBat: 1 | 2;
  nbCaves: number;
  nbGarages: number;
  progress: number;
  agPassee: boolean;
  etat: {
    enquete: "aucune" | "brouillon" | "envoyee";
    partage: boolean;
    choix: boolean; // choix de financement + adhésions
  };
  testeurs: Tester[];
}

/**
 * Adresse e-mail d'un testeur : jamais écrite dans le dépôt. Le seed commité porte un
 * marqueur « .invalid » (non routable) ; pour rejouer avec les vraies adresses, les
 * fournir par variable d'environnement avant de régénérer, par exemple :
 *   TEST_EMAIL_MARIUS=... TEST_EMAIL_PIERRE=... TEST_EMAIL_CYRIELLE=... \
 *     npx vite-node supabase/seed/gen_seed_test_parcours.ts
 * (le seed généré avec de vraies adresses ne doit pas être commité). Le lien automatique
 * de Cyrielle à son compte portail existant se fait par correspondance d'adresse : il
 * ne joue qu'avec sa vraie adresse.
 */
function emailTesteur(variable: string, local: string): string {
  return process.env[variable]?.trim() || `${local}@a-renseigner.invalid`;
}

const CONFIGS: CoproCfg[] = [
  {
    pf: mirabelles, seed: 5701, ville: "Metz", cp: "57000", rue: "9 rue Fabert",
    nbHab: 18, nbBat: 1, nbCaves: 8, nbGarages: 6, progress: 40, agPassee: false,
    etat: { enquete: "aucune", partage: false, choix: false }, testeurs: [],
  },
  {
    pf: clos, seed: 5402, ville: "Nancy", cp: "54000", rue: "6 rue des Brasseries",
    nbHab: 24, nbBat: 1, nbCaves: 10, nbGarages: 8, progress: 45, agPassee: false,
    etat: { enquete: "brouillon", partage: false, choix: false }, testeurs: [],
  },
  {
    pf: neudorf, seed: 6703, ville: "Strasbourg", cp: "67100", rue: "14 rue de Lausanne",
    nbHab: 30, nbBat: 1, nbCaves: 14, nbGarages: 10, progress: 60, agPassee: true,
    etat: { enquete: "envoyee", partage: true, choix: false }, testeurs: [],
  },
  {
    pf: lauch, seed: 6806, ville: "Colmar", cp: "68000", rue: "26 avenue de la République",
    nbHab: 30, nbBat: 2, nbCaves: 14, nbGarages: 10, progress: 55, agPassee: true,
    etat: { enquete: "envoyee", partage: true, choix: true },
    testeurs: [
      { nom: "Marius ONBUS", email: emailTesteur("TEST_EMAIL_MARIUS", "marius.onbus"), type: "occupant", lot: 7, cave: true, garage: true, adresse: null, lierCompteExistant: false },
      { nom: "Pierre MAXTAFF", email: emailTesteur("TEST_EMAIL_PIERRE", "pierre.maxtaff"), type: "bailleur", lot: 21, cave: true, garage: false, adresse: "5 rue Sainte-Catherine, 54000 Nancy", lierCompteExistant: false },
      { nom: "Cyrielle ONTHEMIC", email: emailTesteur("TEST_EMAIL_CYRIELLE", "cyrielle.onthemic"), type: "occupant", lot: 12, cave: false, garage: false, adresse: null, lierCompteExistant: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// Modèle de copropriétaire
// ---------------------------------------------------------------------------
interface Owner {
  nom: string;
  typeCopro: TypeCopro;
  type: "occupant" | "bailleur";
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  habitation: number[];
  garages: number[];
  caves: number[];
  testeur: Tester | null;
  enquete: null | {
    complet: boolean;
    nbPersonnes: number | null;
    rfr: number | null;
    rfrN2: number | null;
    profil: Profil | null;
    verifie: boolean;
    joursTransmis: number;
    joursVerifie: number;
    copro: Record<string, unknown>;
    lotHab: Record<string, unknown>;
  };
  fin: null | { type: Fin; duree: number | null; saisiPar: SaisiPar; jours: number };
  adhesion: null | { statut: "signee" | "brouillon"; form: Record<string, unknown>; jours: number; rib: "concordant" | "discordant" | "non_verifie" | null };
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const q = (s: string) => s.replace(/'/g, "''");
const sqlStr = (s: string | null) => (s == null ? "null" : `'${q(s)}'`);
const jsonSql = (v: unknown) => {
  const s = JSON.stringify(v);
  if (s.includes("$json$")) throw new Error("Délimiteur $json$ présent dans une donnée");
  return `$json$${s}$json$::jsonb`;
};
const fmt = (n: number) => round2(n).toLocaleString("fr-FR", { maximumFractionDigits: 0 }).replace(/[  ]/g, " ");

const bareme = BAREME_2026_HORS_IDF;
const T_HAB_W = [130, 95, 165, 130];
const W_CAVE = 3;
const W_GARAGE = 8;

const TYPE_COPRO_LABEL: Record<TypeCopro, string> = {
  physique: "Personne physique",
  couple: "Personne physique",
  indivision: "Indivision",
  sci: "SCI soumise à l'impôt sur le revenu",
};

const blocs: string[] = [];
const resumes: string[] = [];

// ---------------------------------------------------------------------------
// 0. Bloc commun : organisation, copropriétés, bâtiments, plan de tâches
// ---------------------------------------------------------------------------
const coproValues = CONFIGS.map((c) => {
  const i = c.pf.data.infos;
  const pf = readPlanDefinitif(c.pf.data);
  const r = computePlanDefinitif(pf);
  const gain = Math.round(r.performancePct * 10) / 10;
  const phase = c.agPassee ? "travaux" : "etudes";
  return `  (${sqlStr(i.nomCopro)}, '${c.pf.slug}', ${c.nbHab}, ${sqlStr(c.rue)}, '${c.cp}', '${c.ville}', '${phase}', 'Amir', '${i.etiquetteInitiale}', '${i.etiquetteProjet}', ${gain}, ${c.progress}, ${c.agPassee ? "(current_date - 100)" : "null::date"})`;
}).join(",\n");

const slugsSql = CONFIGS.map((c) => `'${c.pf.slug}'`).join(", ");

blocs.push(`-- @@BLOC 0 organisation, copropriétés, bâtiments, plan de tâches
begin;

insert into organisations (nom, slug) values (${sqlStr(ORG_NOM)}, '${ORG_SLUG}')
on conflict (slug) do nothing;

with org as (select id from organisations where slug = '${ORG_SLUG}'),
src (name, slug, nb_logements, adresse, code_postal, city, phase, chef_projet, energy_before, energy_after, gain_pct, progress, date_ag) as (values
${coproValues}
)
insert into coproprietes (name, slug, nb_logements, adresse, code_postal, city, phase, chef_projet,
  energy_before, energy_after, gain_pct, progress, date_ag, fragile, syndic_name, tag, organisation_id)
select s.name, s.slug, s.nb_logements, s.adresse, s.code_postal, s.city, s.phase::phase_copro, s.chef_projet,
       s.energy_before, s.energy_after, s.gain_pct, s.progress, s.date_ag, false, ${sqlStr(ORG_NOM)}, '${TAG}', org.id
from src s cross join org
on conflict (slug) do nothing;

-- Bâtiment déclaré (code 01, comme useCreateCopro) ; Colmar a en plus un bâtiment 02.
insert into batiments (copro_id, code, position, declare_creation)
select c.id, '01', 0, true
from coproprietes c
where c.organisation_id = (select id from organisations where slug = '${ORG_SLUG}')
  and not exists (select 1 from batiments b where b.copro_id = c.id);

insert into batiments (copro_id, code, position)
select c.id, '02', 1
from coproprietes c
where c.slug = '${lauch.slug}'
  and not exists (select 1 from batiments b where b.copro_id = c.id and b.code = '02');

-- Plan de tâches gabarit (miroir de src/lib/taskTemplate.ts)
with tpl (position, phase, title, statut_courant, tag, jalon, due_label) as (values
  (0,  'diagnostic', 'Recensement des copropriétaires & lots',                     'doing', null,                  'P1a', null),
  (1,  'diagnostic', 'Saisie des tantièmes par bâtiment',                          'todo',  null,                  null,  null),
  (2,  'diagnostic', 'Consultations diverses',                                     'todo',  null,                  null,  null),
  (3,  'diagnostic', 'Vérif. audit énergétique',                                   'todo',  'Audit réglementaire', null,  null),
  (4,  'diagnostic', 'Enquête sociale - profils MaPrimeRénov'' · Fiche État',      'todo',  'MPR',                 'P1b', null),
  (5,  'etudes',     'Scénarios de travaux & chiffrage',                           'doing', null,                  null,  null),
  (6,  'etudes',     'Ingénierie financière (7 étapes)',                           'doing', 'Finance',             null,  null),
  (7,  'etudes',     'Récupération des données essentielles - CEE / MPR Copro',    'todo',  'CEE',                 null,  null),
  (8,  'etudes',     'Récupération des données des entreprises',                   'todo',  null,                  null,  null),
  (9,  'etudes',     'Plans de financement généraux et individuels',               'todo',  null,                  null,  null),
  (10, 'etudes',     'Liasse documentaire pour AG',                                'todo',  null,                  'P1c', null),
  (11, 'travaux',    'Dépôt des dossiers des aides',                               'doing', 'CEE',                 'P2a', null),
  (12, 'travaux',    'Mobilisation des prêts',                                     'doing', 'Éco-PTZ',             'P2b', null),
  (13, 'travaux',    'Suivi de chantier',                                          'doing', null,                  null,  'En cours'),
  (14, 'travaux',    'Demandes d''acompte',                                        'todo',  null,                  null,  null),
  (15, 'travaux',    'Réception des travaux & levée des réserves',                 'todo',  null,                  null,  null),
  (16, 'travaux',    'Versement des aides & solde',                                'todo',  null,                  'P2c', null)
),
rk (phase, rang) as (values ('diagnostic', 0), ('etudes', 1), ('travaux', 2))
insert into taches (copro_id, phase, title, status, tag, jalon, due_label, position)
select c.id, t.phase::phase_copro, t.title,
       (case when rt.rang < rc.rang then 'done' when rt.rang > rc.rang then 'todo' else t.statut_courant end)::statut_tache,
       t.tag, t.jalon, t.due_label, t.position
from coproprietes c
cross join tpl t
join rk rt on rt.phase = t.phase
join rk rc on rc.phase = c.phase::text
where c.slug in (${slugsSql})
  and not exists (select 1 from taches x where x.copro_id = c.id);

commit;`);

// ---------------------------------------------------------------------------
// Génération par copropriété
// ---------------------------------------------------------------------------
for (const [ci, cfg] of CONFIGS.entries()) {
  const rnd = mulberry32(cfg.seed);
  const chance = (p: number) => rnd() < p;
  const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  function pickWeighted<T extends string>(w: Record<T, number>): T {
    const entries = Object.entries(w) as [T, number][];
    const total = entries.reduce((s, [, p]) => s + p, 0);
    let x = rnd() * total;
    for (const [k, p] of entries) {
      x -= p;
      if (x <= 0) return k;
    }
    return entries[entries.length - 1][0];
  }
  const tel = () => (chance(0.7) ? `06 ${between(10, 89)} ${between(10, 99)} ${between(10, 99)} ${between(10, 99)}` : `03 ${between(10, 99)} ${between(10, 99)} ${between(10, 99)} ${between(10, 99)}`);

  const slug = cfg.pf.slug;
  const adresseImmeuble = `${cfg.rue}, ${cfg.cp} ${cfg.ville}`;
  const batimentDeLot = (n: number) => (cfg.nbBat === 2 && n > cfg.nbHab / 2 ? "02" : "01");

  // --- 3. Copropriétaires : multi-lots, testeurs, mono-lots --------------------
  const owners: Owner[] = [];
  const nomsVus = new Set<string>();
  const ajouter = (o: Owner) => {
    if (nomsVus.has(o.nom)) throw new Error(`${slug} : nom en double ${o.nom}`);
    nomsVus.add(o.nom);
    owners.push(o);
  };
  const vide = { enquete: null, fin: null, adhesion: null, testeur: null } as const;
  const mid = Math.floor(cfg.nbHab / 2);
  const lotsTesteurs = new Set(cfg.testeurs.map((t) => t.lot));

  // SCI (2 lots) + couple bailleur (2 lots) : cas multi-lots
  ajouter({ nom: `SCI ${NOMS[(ci * 7 + 3) % NOMS.length]} PATRIMOINE`, typeCopro: "sci", type: "bailleur", email: null, telephone: tel(), adresse: pick(ADRESSES_BAILLEURS), habitation: [1, mid + 1], garages: [], caves: [], ...vide });
  const nomCouple = NOMS[(ci * 5 + 11) % NOMS.length];
  ajouter({ nom: `Bernard et Josiane ${nomCouple}`, typeCopro: "couple", type: "bailleur", email: null, telephone: tel(), adresse: pick(ADRESSES_BAILLEURS), habitation: [2, mid + 2], garages: [], caves: [], ...vide });
  const multiLots = new Set([1, 2, mid + 1, mid + 2]);

  let iNom = ci * 9;
  for (let lot = 1; lot <= cfg.nbHab; lot++) {
    if (multiLots.has(lot)) continue;
    const t = cfg.testeurs.find((x) => x.lot === lot);
    if (t) {
      ajouter({
        nom: t.nom,
        typeCopro: "physique",
        type: t.type,
        email: t.email,
        telephone: null,
        adresse: t.adresse,
        habitation: [lot],
        garages: [],
        caves: [],
        testeur: t,
        enquete: null,
        fin: null,
        adhesion: null,
      });
      continue;
    }
    const nom = NOMS[iNom % NOMS.length];
    const passe = Math.floor(iNom / NOMS.length);
    iNom++;
    const couple = chance(0.35);
    const femme = chance(0.5);
    const p1 = femme ? PRENOMS_F[(iNom * 7 + passe) % PRENOMS_F.length] : PRENOMS_M[(iNom * 5 + passe) % PRENOMS_M.length];
    const p2 = femme ? PRENOMS_M[(iNom * 3 + passe) % PRENOMS_M.length] : PRENOMS_F[(iNom * 11 + passe) % PRENOMS_F.length];
    const bailleur = chance(0.22);
    ajouter({
      nom: couple ? `${p1} et ${p2} ${nom}` : `${p1} ${nom}`,
      typeCopro: couple ? "couple" : "physique",
      type: bailleur ? "bailleur" : "occupant",
      email: null, // jamais d'e-mail sur les copropriétaires fictifs
      telephone: chance(0.7) ? tel() : null,
      adresse: bailleur ? pick(ADRESSES_BAILLEURS) : chance(0.6) ? adresseImmeuble : null,
      habitation: [lot],
      garages: [],
      caves: [],
      ...vide,
    });
  }
  if (lotsTesteurs.size !== cfg.testeurs.length) throw new Error(`${slug} : deux testeurs sur le même lot`);
  const nbHabOwners = owners.reduce((s, o) => s + o.habitation.length, 0);
  if (nbHabOwners !== cfg.nbHab) throw new Error(`${slug} : ${nbHabOwners} logements, attendu ${cfg.nbHab}`);

  // Annexes : garages aux premiers, caves aux derniers ; les testeurs prévus en tête.
  const sansTesteurAnnexes = (o: Owner) => !o.testeur;
  const garageOrder = [
    ...owners.filter((o) => o.testeur?.garage),
    ...owners.filter((o) => sansTesteurAnnexes(o) && o.habitation.length === 1 && !o.testeur),
  ];
  const caveOrder = [
    ...owners.filter((o) => o.testeur?.cave),
    ...owners.filter((o) => sansTesteurAnnexes(o)).reverse(),
  ];
  const firstLotAnnexe = cfg.nbHab + 1;
  for (let c = 0; c < cfg.nbCaves; c++) caveOrder[c].caves.push(firstLotAnnexe + c);
  for (let g = 0; g < cfg.nbGarages; g++) garageOrder[g].garages.push(firstLotAnnexe + cfg.nbCaves + g);

  // Tantièmes : poids relatifs ramenés à 10 000 (méthode du plus fort reste).
  interface LotDef { num: number; bat: string; usage: "habitation" | "caves" | "garage"; owner: Owner; parent: number | null; w: number; t: number }
  const lotsDefs: LotDef[] = [];
  for (const o of owners) {
    const principal = o.habitation[0];
    for (const n of o.habitation) lotsDefs.push({ num: n, bat: batimentDeLot(n), usage: "habitation", owner: o, parent: null, w: T_HAB_W[(n - 1) % 4], t: 0 });
    for (const n of o.caves) lotsDefs.push({ num: n, bat: batimentDeLot(principal), usage: "caves", owner: o, parent: principal, w: W_CAVE, t: 0 });
    for (const n of o.garages) lotsDefs.push({ num: n, bat: batimentDeLot(principal), usage: "garage", owner: o, parent: principal, w: W_GARAGE, t: 0 });
  }
  lotsDefs.sort((a, b) => a.num - b.num);
  const totalW = lotsDefs.reduce((s, l) => s + l.w, 0);
  const brut = lotsDefs.map((l) => (l.w * TOTAL_CLE) / totalW);
  lotsDefs.forEach((l, i) => (l.t = Math.floor(brut[i])));
  let reste = TOTAL_CLE - lotsDefs.reduce((s, l) => s + l.t, 0);
  [...brut.keys()]
    .sort((a, b) => (brut[b] - Math.floor(brut[b])) - (brut[a] - Math.floor(brut[a])))
    .slice(0, reste)
    .forEach((i) => (lotsDefs[i].t += 1));
  if (lotsDefs.reduce((s, l) => s + l.t, 0) !== TOTAL_CLE) throw new Error(`${slug} : total tantièmes != ${TOTAL_CLE}`);
  const lotsNum = lotsDefs.map((l) => l.num);
  if (new Set(lotsNum).size !== lotsNum.length) throw new Error(`${slug} : numéros de lots en double`);

  // --- 4. Enquête ---------------------------------------------------------------
  function reponsesTechniques(): Record<string, unknown> {
    const nbFen = between(4, 8);
    const simple = chance(0.3) ? between(1, nbFen) : 0;
    const pathos: string[] = [];
    if (chance(0.45)) pathos.push("Humidité / condensation");
    if (chance(0.2)) pathos.push("Moisissures");
    if (chance(0.15)) pathos.push("Fissures");
    if (pathos.length === 0) pathos.push("Aucune pathologie");
    const inconf: string[] = [];
    if (chance(0.6)) inconf.push("Froid en hiver");
    if (chance(0.35)) inconf.push("Chaleur excessive en été");
    if (chance(0.3)) inconf.push("Courants d'air");
    if (chance(0.25)) inconf.push("Parois ou sols froids");
    if (inconf.length === 0) inconf.push("Aucun inconfort particulier");
    return {
      "nb-fenetres": nbFen,
      "nb-simple-vitrage": simple,
      "nb-occultations": nbFen,
      "nb-occultations-origine": chance(0.6) ? nbFen : between(0, nbFen),
      "nb-stores": chance(0.4) ? between(1, 3) : 0,
      "changement-menuiseries": simple === 0 && chance(0.5) ? ["Oui, les fenêtres"] : ["Non, aucun changement récent"],
      "type-chauffage": "Collectif",
      "energie-chauffage": cfg.pf.data.infos.typeChauffage.toLowerCase().includes("gaz") ? "Gaz" : "Réseau de chaleur",
      "type-ecs": "Collectif",
      "energie-ecs": "Même système que le chauffage",
      "nb-radiateurs": between(4, 7),
      "regulation-radiateurs": pick(["Oui, sur tous les radiateurs", "Oui, sur une partie seulement", "Non", "Je ne sais pas"]),
      pathologies: pathos,
      inconforts: inconf,
    };
  }
  function rfrPourProfil(n: number, profil: Profil): number {
    const sd = bareme.mprSeuils.seuils[Math.min(Math.max(n, 1), 5) as 1 | 2 | 3 | 4 | 5];
    const [bleu, jaune, violet] = sd;
    let v: number;
    if (profil === "Bleu") v = between(Math.round(bleu * 0.55), bleu - 300);
    else if (profil === "Jaune") v = between(bleu + 300, jaune - 300);
    else if (profil === "Violet") v = between(jaune + 300, violet - 400);
    else v = between(violet + 800, Math.round(violet * 1.8));
    return Math.round(v / 10) * 10;
  }

  if (cfg.etat.enquete === "envoyee") {
    for (const [idx, o] of owners.entries()) {
      if (o.testeur) continue; // les testeurs répondent eux-mêmes
      if (o.typeCopro === "sci" && idx === 0) continue; // la SCI n'a jamais répondu
      if (o.typeCopro !== "sci" && !chance(0.72)) continue;

      const complet = o.typeCopro === "sci" || chance(0.9);
      const copro: Record<string, unknown> = {
        nom: o.nom,
        telephone: o.telephone ?? "",
        adresse: o.adresse ?? adresseImmeuble,
        email: "",
        "type-coproprietaire": TYPE_COPRO_LABEL[o.typeCopro],
      };
      if (o.typeCopro === "sci") {
        copro["nb-associes-sci"] = 2;
        copro["personne-physique-sci"] = "Oui";
      }
      let nbPersonnes: number | null = null;
      let rfr: number | null = null;
      let rfrN2: number | null = null;
      let profil: Profil | null = null;
      const menage = o.typeCopro !== "sci";
      if (menage && complet) {
        nbPersonnes = o.typeCopro === "couple" ? pick([2, 2, 3, 3, 4, 4, 5]) : pick([1, 1, 1, 2, 2, 3]);
        const cible = pickWeighted<Profil>({ Bleu: 25, Jaune: 30, Violet: 30, Rose: 15 });
        rfr = idx === 9 ? 0 : rfrPourProfil(nbPersonnes, cible); // un RFR nul justifié
        rfrN2 = rfr === 0 ? 0 : Math.round((rfr * (0.95 + rnd() * 0.08)) / 10) * 10;
        profil = determineProfil(nbPersonnes, rfr, bareme);
        const adultes = o.typeCopro === "couple" ? 2 : 1;
        copro["nb-personnes-foyer"] = nbPersonnes;
        copro["composition-menage"] =
          nbPersonnes === 1 ? "Personne seule" : adultes === 2 && nbPersonnes === 2 ? "Couple sans enfant" : adultes === 2 ? "Couple avec enfant(s)" : "Famille monoparentale";
        copro["nb-personnes-charge"] = Math.max(0, nbPersonnes - adultes);
        copro["rfr-foyer"] = rfr;
        if (rfr === 0) copro["rfr-zero-motif"] = "Sans activité professionnelle";
        copro["rfr-n2"] = rfrN2;
      } else if (menage) {
        copro["nb-personnes-foyer"] = pick([1, 2, 3]);
      }
      if (complet) {
        copro["accord-visite"] = chance(0.7) ? "Oui" : pick(["Non", "Oui, sous conditions (précisez)"]);
        copro["curatelle-tutelle"] = "Non";
        copro["situation-sociale"] = "Non";
        copro["importance-travaux"] = pickWeighted({ Indispensables: 45, Utiles: 35, "Peu utiles": 12, "Sans avis": 8 });
      }
      const occupant = o.type === "occupant";
      const lotHab: Record<string, unknown> = complet
        ? {
            "type-occupation": occupant ? "Propriétaire occupant" : "Propriétaire bailleur (logement loué)",
            "nb-habitants": occupant ? nbPersonnes ?? 1 : between(1, 3),
            "type-residence": "Résidence principale",
            commodat: "Non",
            "projet-vente": chance(0.85) ? "Non" : pick(["Oui, après les travaux", "Je ne sais pas encore"]),
            demembrement: "Non",
            ...(o.typeCopro === "sci" ? { "associes-occupants": 0 } : {}),
            ...reponsesTechniques(),
          }
        : { "type-occupation": occupant ? "Propriétaire occupant" : "Propriétaire bailleur (logement loué)" };
      o.enquete = {
        complet,
        nbPersonnes,
        rfr,
        rfrN2,
        profil,
        verifie: complet && profil != null && chance(0.45),
        joursTransmis: between(8, 46),
        joursVerifie: between(1, 7),
        copro,
        lotHab,
      };
    }
  }

  // --- PF -> plans individuels ------------------------------------------------
  const pfData = readPlanDefinitif(cfg.pf.data);
  const pv = computePlanDefinitif(pfData);
  const depasse = pv.gardeFous.filter((g) => !g.ok).map((g) => g.libelle);
  if (depasse.length) throw new Error(`${slug} : garde-fou dépassé - ${depasse.join(" | ")}`);
  const gainPct = Math.round(pv.performancePct * 10) / 10;

  const lotsRep = lotsDefs.map((l) => ({ coproprietaire_id: l.owner.nom, coproprietaire: { nom: l.owner.nom }, tantiemes: { [CLE]: l.t } }));
  const rep = repartirPfDepuisLots(pfData, pv, lotsRep, [{ code: CLE, is_default: true }]);
  if (rep.manquants.length) throw new Error(`${slug} : lignes sans clé : ${rep.manquants.length}`);
  if (rep.plans.length !== owners.length) throw new Error(`${slug} : plans individuels ${rep.plans.length}/${owners.length}`);
  if (rep.totauxCles[CLE] !== TOTAL_CLE) throw new Error(`${slug} : total clé ${CLE} = ${rep.totauxCles[CLE]}`);
  const sommeQp = round2(rep.plans.reduce((s, p) => s + p.quotePartAvant, 0));
  if (Math.abs(sommeQp - round2(pv.totalOperationTtc)) > 1) throw new Error(`${slug} : somme quotes-parts ${sommeQp} != ${round2(pv.totalOperationTtc)}`);

  const travaux = round2(pv.totalTravauxTtc);
  const scenarioParams = {
    ...makeDefaultParams(bareme),
    travaux,
    honoraires: round2(pv.totalMoeTtc),
    aleas: round2(pv.totalTravauxTtcImprevus - pv.totalTravauxTtc),
    cle: CLE,
    totalCle: TOTAL_CLE,
    mprCoproPct: travaux > 0 ? round2(((pv.totalAides - pv.primeCee) / travaux) * 100) : 0,
    bonusPassoire: false,
    cee: round2(pv.primeCee),
    fonds: pfData.params.fondsTravaux,
    ecoPtz: true,
    ecoPtzDuree: pfData.params.dureeEcoPtzAns,
  };

  // --- 6. Choix de financement et adhésions (Colmar) ---------------------------
  function adherent(prenomNom: string, nom: string) {
    return {
      nomPrenom: `${nom} ${prenomNom}`,
      nomNaissance: chance(0.7) ? nom : pick(NOMS),
      dateLieuNaissance: `${String(between(1, 28)).padStart(2, "0")}/${String(between(1, 12)).padStart(2, "0")}/${between(1948, 1992)} à ${pick(["Colmar", "Mulhouse", "Strasbourg", "Selestat", "Metz", "Paris"])}`,
      profession: pick(PROFESSIONS),
      professionDepuis: `01/${String(between(1, 12)).padStart(2, "0")}/${between(1995, 2023)}`,
      situation: pick(SITUATIONS),
      situationDepuis: chance(0.5) ? `${String(between(1, 28)).padStart(2, "0")}/${String(between(1, 12)).padStart(2, "0")}/${between(1980, 2022)}` : "",
    };
  }
  function prenomsDe(o: Owner): { p1: string; p2: string | null; nom: string } {
    const parts = o.nom.split(" ");
    if (o.typeCopro === "couple") return { p1: parts[0], p2: parts[2], nom: parts.slice(3).join(" ") };
    return { p1: parts[0], p2: null, nom: parts.slice(1).join(" ") };
  }
  if (cfg.etat.choix) {
    for (const [idx, o] of owners.entries()) {
      if (o.testeur) continue; // les testeurs choisissent eux-mêmes
      if (!chance(0.66)) continue;
      let type: Fin;
      if (o.typeCopro === "sci") type = "fonds";
      else type = pickWeighted<Fin>({ collectif: 50, individuel: 22, fonds: 28 });
      let saisiPar: SaisiPar = "copro";
      if (type === "fonds" && chance(0.4)) saisiPar = "syndic";
      if (idx === 3) saisiPar = "amo";
      o.fin = { type, duree: type === "individuel" ? pick([10, 15, 20]) : null, saisiPar, jours: between(2, 35) };

      if (type === "collectif") {
        const etat = pickWeighted({ signee: 55, brouillon: 25, aucune: 20 });
        if (etat === "aucune") continue;
        const { p1, p2, nom } = prenomsDe(o);
        const complet = etat === "signee";
        const occupant = o.type === "occupant" || !o.adresse;
        o.adhesion = {
          statut: etat,
          form: {
            adherent1: adherent(p1, nom),
            adherent2: p2 && complet ? adherent(p2, nom) : null,
            adresse: occupant ? cfg.rue : o.adresse!.split(",")[0],
            cp: occupant ? cfg.cp : o.adresse!.match(/\b\d{5}\b/)?.[0] ?? cfg.cp,
            ville: occupant ? cfg.ville : o.adresse!.replace(/^.*\d{5}\s*/, ""),
            telDomicile: "",
            telBureau: "",
            portable: complet ? o.telephone ?? tel() : o.telephone ?? "",
            email: "",
            montantType: "100",
            montantAutre: "",
            lieuSignature: complet ? cfg.ville : "",
          },
          jours: Math.max(0, o.fin.jours - between(0, 5)),
          rib: complet ? pickWeighted({ concordant: 60, non_verifie: 30, discordant: 10 }) : null,
        };
      }
    }
  }

  // --- Émission du SQL ---------------------------------------------------------
  const ownersValues = owners.map((o) => `      (${sqlStr(o.nom)}, '${o.type}', ${sqlStr(o.email)}, ${sqlStr(o.telephone)}, ${sqlStr(o.adresse)})`).join(",\n");
  const lotsValues = lotsDefs
    .map((l) => `      ('${l.num}', '${l.bat}', ${sqlStr(l.owner.nom)}, '${l.usage}', ${l.t}, ${l.parent == null ? "null" : `'${l.parent}'`})`)
    .join(",\n");
  const enqValues = owners
    .filter((o) => o.enquete)
    .map((o) => {
      const e = o.enquete!;
      return `      (${sqlStr(o.nom)}, ${jsonSql(e.copro)}, ${jsonSql(e.lotHab)}, ${e.nbPersonnes ?? "null"}, ${e.rfr ?? "null"}, ${e.rfrN2 ?? "null"}, '${o.type === "occupant" ? "occupant" : "bailleur"}', ${sqlStr(e.profil)}, ${e.verifie}, ${e.joursVerifie}, ${e.complet}, ${e.joursTransmis})`;
    })
    .join(",\n");
  const plansValues = rep.plans
    .map((p) => {
      const o = owners.find((x) => x.nom === p.coproprietaireId)!;
      const tRef = rep.parCopro.get(o.nom)!.tantiemes[CLE];
      return `      (${sqlStr(p.nom)}, ${tRef}, ${p.quotePartAvant}, ${p.primeCee}, ${round2(p.aidesEtFonds - p.primeCee)}, ${p.reste})`;
    })
    .join(",\n");
  const choixValues = owners
    .filter((o) => o.fin)
    .map((o) => `      (${sqlStr(o.nom)}, '${o.fin!.type}', ${o.fin!.duree ?? "null"}, '${o.fin!.saisiPar}', ${o.fin!.jours})`)
    .join(",\n");
  const adhesionsValues = owners
    .filter((o) => o.adhesion)
    .map((o) => `      (${sqlStr(o.nom)}, '${o.adhesion!.statut}', ${jsonSql(o.adhesion!.form)}, ${o.adhesion!.jours}, ${sqlStr(o.adhesion!.rib)})`)
    .join(",\n");

  const partsSql: string[] = [];

  // 2 + 3 : PF validé + données
  partsSql.push(`-- @@BLOC ${ci * 2 + 1} ${cfg.pf.data.infos.nomCopro} : PF définitif validé, copropriétaires, lots, tantièmes
begin;

-- PF définitif validé (comme useValiderPlanDefinitif)
do $$
declare
  v_copro uuid;
begin
  select id into v_copro from coproprietes where slug = '${slug}';
  if v_copro is null then
    raise exception 'Copropriété ${slug} absente - jouer le bloc 0 d''abord.';
  end if;
  if exists (select 1 from plans_definitifs where copro_id = v_copro) then
    raise notice 'PF déjà présent - bloc PF sauté.';
    return;
  end if;
  insert into plans_definitifs (copro_id, nom, data, resultat, statut, source_fichier, version, valide_le, updated_by)
  values (
    v_copro,
    ${sqlStr(cfg.pf.nomPlan)},
    ${jsonSql(pfData)},
    ${jsonSql(pv)},
    'valide',
    null,
    1,
    now() - interval '${cfg.etat.partage ? 45 : 10} days',
    (select id from auth.users where email = '${AMO_EMAIL}' limit 1)
  );
  update coproprietes
  set gain_pct = ${gainPct},
      energy_before = '${pfData.infos.etiquetteInitiale}',
      energy_after = '${pfData.infos.etiquetteProjet}'
  where id = v_copro;
end $$;

-- Onglet Données : clé de répartition, copropriétaires, lots, tantièmes
do $$
declare
  v_copro uuid;
  v_cle uuid;
  r record;
  v_cp uuid;
  v_bat uuid;
  v_parent uuid;
  v_lot uuid;
begin
  select id into v_copro from coproprietes where slug = '${slug}';
  if v_copro is null then return; end if;
  if exists (select 1 from lots where copro_id = v_copro) then
    raise notice 'Lots déjà présents - bloc données sauté.';
    return;
  end if;

  insert into cles_repartition (copro_id, code, label, is_default)
  values (v_copro, '${CLE}', 'Tantièmes généraux', true)
  on conflict do nothing;
  select id into v_cle from cles_repartition where copro_id = v_copro and code = '${CLE}';

  for r in
    select * from (values
${ownersValues}
    ) as t(nom, type, email, telephone, adresse)
  loop
    insert into coproprietaires (copro_id, nom, type, email, telephone, adresse)
    values (v_copro, r.nom, r.type, r.email, r.telephone, r.adresse);
  end loop;

  for r in
    select * from (values
${lotsValues}
    ) as t(num, bat, nom, usage, tantiemes, parent_num)
    order by (parent_num is not null), num::int
  loop
    select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
    select id into v_bat from batiments where copro_id = v_copro and code = r.bat;
    v_parent := null;
    if r.parent_num is not null then
      select id into v_parent from lots where copro_id = v_copro and num = r.parent_num;
    end if;
    insert into lots (copro_id, batiment_id, coproprietaire_id, num, usage, rattache_a)
    values (v_copro, v_bat, v_cp, r.num, r.usage::usage_lot, v_parent)
    returning id into v_lot;
    insert into lot_tantiemes (lot_id, cle_id, tantiemes) values (v_lot, v_cle, r.tantiemes);
  end loop;
${
  cfg.testeurs.some((t) => t.lierCompteExistant)
    ? `
  -- Compte portail déjà existant (rôle copro) relié à sa fiche, comme creer-espace-coproprietaire
  update coproprietaires cp
  set user_id = u.id,
      espace_invite_le = now(),
      espace_invite_par = (select id from auth.users where email = '${AMO_EMAIL}' limit 1)
  from auth.users u
  join profiles p on p.user_id = u.id and p.role = 'copro'
  where cp.copro_id = v_copro and cp.user_id is null
    and lower(u.email) = lower(cp.email)
    and lower(cp.email) in (${cfg.testeurs.filter((t) => t.lierCompteExistant).map((t) => `'${t.email.toLowerCase()}'`).join(", ")});`
    : ""
}
end $$;

commit;`);

  // 4 + 5 + 6 : enquête, partage, choix, adhésions
  const suite: string[] = [];
  if (cfg.etat.enquete === "brouillon") {
    suite.push(`-- Enquête créée par l'AMO, pas encore envoyée
insert into enquetes (copro_id, questions, statut)
select id, ${jsonSql(defaultConfig())}, 'brouillon' from coproprietes c
where c.slug = '${slug}' and not exists (select 1 from enquetes e where e.copro_id = c.id);`);
  }
  if (cfg.etat.enquete === "envoyee") {
    suite.push(`-- Enquête sociale envoyée + réponses transmises depuis le portail
do $$
declare
  v_copro uuid;
  v_enq uuid;
  v_verif uuid;
  r record;
  v_cp uuid;
  v_lots jsonb;
begin
  select id into v_copro from coproprietes where slug = '${slug}';
  if v_copro is null then return; end if;
  select id into v_enq from enquetes where copro_id = v_copro order by created_at limit 1;
  if v_enq is null then
    insert into enquetes (copro_id, questions, statut, sent_at, date_limite)
    values (v_copro, ${jsonSql(defaultConfig())}, 'envoyee', now() - interval '50 days', current_date + 21)
    returning id into v_enq;
  else
    update enquetes set statut = 'envoyee', sent_at = coalesce(sent_at, now() - interval '50 days') where id = v_enq;
  end if;
  if exists (select 1 from enquete_reponses where enquete_id = v_enq) then
    raise notice 'Réponses déjà présentes - bloc enquête sauté.';
    return;
  end if;
  select user_id into v_verif from profiles p join auth.users u on u.id = p.user_id where u.email = '${AMO_EMAIL}' limit 1;

  for r in
    select * from (values
${enqValues}
    ) as t(nom, copro, lot_hab, nb_personnes, rfr, rfr_n2, occupation, profil, verifie, jours_verif, complet, jours)
  loop
    select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
    select coalesce(jsonb_object_agg(l.id::text,
      case l.usage
        when 'habitation' then jsonb_build_object('usage-lot', 'Habitation') || r.lot_hab
        when 'garage' then jsonb_build_object('usage-lot', 'Garage', 'lot-parent', l.rattache_a::text)
        when 'caves' then jsonb_build_object('usage-lot', 'Cave', 'lot-parent', l.rattache_a::text)
        else jsonb_build_object('usage-lot', 'Autre')
      end), '{}'::jsonb)
    into v_lots
    from lots l where l.coproprietaire_id = v_cp;

    insert into enquete_reponses (enquete_id, coproprietaire_id, nb_personnes, rfr, rfr_n2, statut_occupation, profil_mpr,
                                  profil_statut, profil_verifie_le, profil_verifie_par, reponses, updated_at)
    values (
      v_enq, v_cp, r.nb_personnes, r.rfr, r.rfr_n2, r.occupation, r.profil,
      case when r.verifie and v_verif is not null then 'verifie' else 'declaratif' end,
      case when r.verifie and v_verif is not null then now() - (r.jours_verif || ' days')::interval else null end,
      case when r.verifie and v_verif is not null then v_verif else null end,
      jsonb_build_object('copro', r.copro, 'lots', v_lots, 'complet', r.complet)
        || case when r.complet then jsonb_build_object('transmisLe', to_char(now() - (r.jours || ' days')::interval, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'attestation', true) else '{}'::jsonb end,
      now() - (r.jours || ' days')::interval
    );
  end loop;
end $$;`);
  }
  if (cfg.etat.choix) {
    suite.push(`-- Configuration du prêt collectif (CEGEE, ${pfData.params.dureeEcoPtzAns} ans, adhésion ouverte, date limite du choix dans 30 jours)
insert into copro_financement_config (copro_id, banque, duree_annees, adhesion_ouverte, date_limite_choix)
select id, 'CEGEE', ${pfData.params.dureeEcoPtzAns}, true, current_date + 30 from coproprietes where slug = '${slug}'
on conflict (copro_id) do nothing;`);
  }
  if (cfg.etat.partage) {
    suite.push(`-- Partage du PF validé au portail : scénario pont + plans individuels (comme usePartagerPfCopros)
do $$
declare
  v_copro uuid;
  v_plan uuid;
  v_scen uuid;
  r record;
begin
  select id into v_copro from coproprietes where slug = '${slug}';
  if v_copro is null then return; end if;
  select id into v_plan from plans_definitifs where copro_id = v_copro and statut = 'valide' order by updated_at desc limit 1;
  if v_plan is null then
    raise exception 'PF définitif validé absent - jouer le bloc PF d''abord.';
  end if;
  if exists (select 1 from scenarios_financiers where plan_definitif_id = v_plan) then
    raise notice 'Scénario pont déjà présent - bloc partage sauté.';
    return;
  end if;
  insert into scenarios_financiers (copro_id, name, statut, locked, bareme_millesime, params, plan_definitif_id, created_at, updated_at)
  values (v_copro, ${sqlStr(cfg.pf.nomPlan)}, 'partage', true, ${bareme.millesime}, ${jsonSql(scenarioParams)}, v_plan, now() - interval '40 days', now() - interval '40 days')
  returning id into v_scen;

  for r in
    select * from (values
${plansValues}
    ) as t(nom, tantiemes, quote_part, cee_part, subv_coll_part, reste)
  loop
    insert into plans_individuels (scenario_id, coproprietaire_id, tantiemes, quote_part, mpr_indiv, cee_part, subv_coll_part, eco_ptz_part, reste, mensualite, detail)
    select v_scen, cp.id, r.tantiemes, r.quote_part, 0, r.cee_part, r.subv_coll_part, 0, r.reste, 0,
           jsonb_build_object('source', 'pf', 'planDefinitifId', v_plan)
    from coproprietaires cp where cp.copro_id = v_copro and cp.nom = r.nom;
  end loop;
end $$;`);
  }
  if (cfg.etat.choix) {
    suite.push(`-- Choix de financement transmis (portail) ou saisis (syndic / AMO), puis adhésions au prêt collectif
do $$
declare
  v_copro uuid;
  v_scen uuid;
  v_amo uuid;
  r record;
  v_cp uuid;
begin
  select id into v_copro from coproprietes where slug = '${slug}';
  if v_copro is null then return; end if;
  select s.id into v_scen from scenarios_financiers s
  where s.copro_id = v_copro and s.statut = 'partage' order by s.updated_at desc limit 1;
  if v_scen is null then
    raise exception 'Scénario partagé absent - jouer le bloc de partage d''abord.';
  end if;
  select u.id into v_amo from auth.users u where u.email = '${AMO_EMAIL}' limit 1;

  if not exists (select 1 from choix_financement where scenario_id = v_scen) then
    for r in
      select * from (values
${choixValues}
      ) as t(nom, type, duree, saisi_par, jours)
    loop
      select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
      insert into choix_financement (scenario_id, coproprietaire_id, type, duree_annees, lot_ids, transmitted_at, updated_at, saisi_par, updated_by)
      values (
        v_scen, v_cp, r.type::type_financement, r.duree,
        case when r.type = 'individuel'
             then coalesce((select array_agg(l.id) from lots l where l.coproprietaire_id = v_cp and l.usage = 'habitation'), '{}'::uuid[])
             else '{}'::uuid[] end,
        now() - (r.jours || ' days')::interval,
        now() - (r.jours || ' days')::interval,
        r.saisi_par,
        case r.saisi_par when 'amo' then v_amo else null end
      );
    end loop;
  end if;

  if not exists (select 1 from adhesions_pret where copro_id = v_copro) then
    for r in
      select * from (values
${adhesionsValues}
      ) as t(nom, statut, form, jours, rib)
    loop
      select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
      insert into adhesions_pret (copro_id, coproprietaire_id, scenario_id, statut, form, lieu_signature, signed_at, rib_concordance, created_at, updated_at)
      values (
        v_copro, v_cp, v_scen, r.statut, r.form,
        case when r.statut = 'signee' then '${cfg.ville}' else null end,
        case when r.statut = 'signee' then now() - (r.jours || ' days')::interval else null end,
        r.rib,
        now() - (r.jours || ' days')::interval - interval '1 hour',
        now() - (r.jours || ' days')::interval
      );
    end loop;
  end if;
end $$;`);
  }
  blocs.push(partsSql.join("\n\n"));
  if (suite.length) blocs.push(`-- @@BLOC ${ci * 2 + 2} ${cfg.pf.data.infos.nomCopro} : enquête, partage au portail, choix et adhésions\nbegin;\n\n${suite.join("\n\n")}\n\ncommit;`);

  // Résumé
  const nbEnq = owners.filter((o) => o.enquete).length;
  const nbComplet = owners.filter((o) => o.enquete?.complet).length;
  const nbVerif = owners.filter((o) => o.enquete?.verifie).length;
  const finParType = owners.reduce<Record<string, number>>((acc, o) => {
    if (o.fin) acc[o.fin.type] = (acc[o.fin.type] ?? 0) + 1;
    return acc;
  }, {});
  const nbAdhSign = owners.filter((o) => o.adhesion?.statut === "signee").length;
  const nbAdhBrouillon = owners.filter((o) => o.adhesion?.statut === "brouillon").length;
  const nbHab = lotsDefs.filter((l) => l.usage === "habitation").length;
  resumes.push(
    [
      `${cfg.pf.data.infos.nomCopro} (${cfg.ville}) : ${owners.length} copropriétaires, ${lotsDefs.length} lots (${nbHab} logements, ${cfg.nbCaves} caves, ${cfg.nbGarages} garages), ${cfg.nbBat} bâtiment(s), clé ${CLE} = ${TOTAL_CLE}`,
      `  PF : opération TTC ${fmt(pv.totalOperationTtc)} EUR, aides ${fmt(pv.totalAides)} EUR (dont CEE ${fmt(pv.primeCee)}), reste à charge ${fmt(pv.resteACharge)} EUR, gain ${gainPct} %`,
      `  enquête ${cfg.etat.enquete}${cfg.etat.enquete === "envoyee" ? ` : ${nbEnq} réponses (${nbComplet} complètes, ${nbEnq - nbComplet} brouillons), ${nbVerif} profils vérifiés` : ""} ; partage ${cfg.etat.partage ? "oui" : "non"}`,
      cfg.etat.choix
        ? `  choix : ${owners.filter((o) => o.fin).length} (${Object.entries(finParType).map(([k, v]) => `${k} ${v}`).join(", ")}), adhésions ${nbAdhSign} signées / ${nbAdhBrouillon} brouillons`
        : "  choix : aucun",
      ...cfg.testeurs.map((t) => `  testeur : ${t.nom} <${t.email}> lot ${t.lot}${t.cave ? " + cave" : ""}${t.garage ? " + garage" : ""}`),
    ].join("\n")
  );
}

const entete = `-- Organisation de test « ${ORG_NOM} » (100 % fictive) - demande d'Amir du 08/10/2026
-- 4 copropriétés : Metz, Nancy, Strasbourg, Colmar - parcours de test des copropriétés.
-- GÉNÉRÉ par gen_seed_test_parcours.ts - ne pas éditer à la main, relancer :
--   npx vite-node supabase/seed/gen_seed_test_parcours.ts
-- Pas de psql sur le poste : jouer bloc par bloc (séparés par « -- @@BLOC ») via le MCP
-- Supabase execute_sql, dans l'ordre. Chaque bloc est idempotent. Purge : purge_test_parcours.sql.
-- Isolation : slugs test-*, tag « ${TAG} », organisation « ${ORG_SLUG} », aucun e-mail sur les
-- copropriétaires fictifs (seuls les trois testeurs de Colmar ont leur vraie adresse).
--
${resumes.map((r) => r.split("\n").map((l) => `-- ${l}`).join("\n")).join("\n--\n")}
`;

const out = join(dirname(fileURLToPath(import.meta.url)), "seed_test_parcours.sql");
writeFileSync(out, `${entete}\n${blocs.join("\n\n")}\n`, "utf8");
console.log(`Écrit : ${out}`);
console.log(resumes.join("\n\n"));
