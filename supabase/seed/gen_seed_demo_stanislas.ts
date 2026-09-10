// Générateur de l'« import fictif » de RESIDENCE STANISLAS (Nancy, 72 logements,
// travaux en cours) - copropriété de la démo commerciale SYNDIC HORIZON GRAND EST.
//
// Feedback Amir 10/09/2026 : « Fais-moi un import fictif pour la copropriété
// Stanislas qui va servir aussi de test démonstratif. Ils auront plus ou moins
// choisi leur mode de financement. »
//
// Le seed reproduit ce que l'app aurait produit, dans l'ordre du parcours :
//   1. onglet Données : import des lots & tantièmes (2 bâtiments, clé unique MUN
//      totalisant 10 000, 72 logements + 2 commerces + caves + garages rattachés,
//      copropriétaires avec coordonnées - certains sans e-mail) ;
//   2. enquête sociale envoyée : réponses transmises depuis le portail pour ~70 %
//      des copropriétaires (questionnaire complet, profils MPR par le barème 2026,
//      une partie vérifiée par l'AMO), quelques brouillons, le reste sans réponse ;
//   3. partage du PF définitif validé aux copropriétaires (scénario pont + plans
//      individuels calculés par repartirPfDepuisLots, comme l'onglet Financement) ;
//   4. « plus ou moins » de choix de financement : ~2/3 des copropriétaires ont
//      transmis un choix (éco-PTZ collectif / individuel / fonds propres), certains
//      saisis par le gestionnaire, le reste n'a rien choisi ;
//   5. adhésions au prêt collectif : signées, en brouillon ou absentes.
//
// Limites assumées : aucun fichier n'est déposé dans le Storage (pas de PDF de
// bulletin, de mandat SEPA ni de pièce justificative) - ces états restent
// « manquants » dans l'onglet Copropriétaires, ce qui est un cas réel.
//
// Usage :  npx vite-node supabase/seed/gen_seed_demo_stanislas.ts
// Produit : supabase/seed/seed_demo_stanislas.sql (idempotent, bloc par bloc)
// Prérequis : seed_demo_horizon.sql + seed_demo_horizon_etudes.sql (PF validé).
//
// Toutes les données sont FICTIVES (noms, coordonnées, revenus, choix).

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
import { stanislas } from "./demo_horizon_pf";

const SLUG = "demo-residence-stanislas";
const CLE = "MUN";
const TOTAL_CLE = 10000;
const ADRESSE_IMMEUBLE = "15 rue de la Commanderie";
const DOMAINE = "stanislas-demo.fr"; // domaine fictif, aucun e-mail réel ne part
const AMO_VERIF_EMAIL = "amir@strateco.fr"; // vérifie les profils (profil_verifie_par)

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
const rand = mulberry32(54000);
const chance = (p: number) => rand() < p;
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
function pickWeighted<T extends string>(w: Record<T, number>): T {
  const entries = Object.entries(w) as [T, number][];
  const total = entries.reduce((s, [, p]) => s + p, 0);
  let x = rand() * total;
  for (const [k, p] of entries) {
    x -= p;
    if (x <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

// ---------------------------------------------------------------------------
// 1. Copropriétaires et lots
// ---------------------------------------------------------------------------
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
  "12 rue des Jardins, 54600 Villers-les-Nancy",
  "3 place Stanislas, 54000 Nancy",
  "45 rue de Strasbourg, 67000 Strasbourg",
  "8 rue du Faubourg, 88000 Epinal",
];
const PROFESSIONS = ["Enseignant(e)", "Infirmier(e)", "Employe(e) de banque", "Technicien(ne)", "Cadre commercial", "Retraite(e)", "Artisan", "Fonctionnaire territorial(e)", "Aide-soignant(e)", "Ingenieur(e)", "Comptable", "Agent administratif", "Chauffeur-livreur", "Pharmacien(ne)", "Sans activite"];

type TypeCopro = "physique" | "couple" | "indivision" | "sci";
type Fin = "collectif" | "individuel" | "fonds";
type SaisiPar = "copro" | "syndic" | "amo";

interface Owner {
  nom: string;
  typeCopro: TypeCopro;
  type: "occupant" | "bailleur";
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  /** numéros de lots d'habitation (1..72) ; commerces 73-74 pour la SCI Commanderie */
  habitation: number[];
  commerces: number[];
  garages: number[];
  caves: number[];
  /** Enquête sociale */
  enquete: null | {
    complet: boolean;
    nbPersonnes: number | null;
    rfr: number | null;
    rfrN2: number | null;
    profil: Profil | null;
    verifie: boolean;
    /** jours écoulés depuis la transmission / la vérification */
    joursTransmis: number;
    joursVerifie: number;
    copro: Record<string, unknown>;
    lotHab: Record<string, unknown>;
    lotCom: Record<string, unknown> | null;
  };
  /** Choix de financement (null = rien transmis) */
  fin: null | { type: Fin; duree: number | null; saisiPar: SaisiPar; jours: number };
  /** Adhésion au prêt collectif */
  adhesion: null | { statut: "signee" | "brouillon"; form: Record<string, unknown>; jours: number; rib: "concordant" | "discordant" | "non_verifie" | null };
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const slugMail = (prenom: string, nom: string) =>
  `${strip(prenom).toLowerCase().replace(/[^a-z]/g, "")}.${strip(nom).toLowerCase().replace(/[^a-z]/g, "")}@${DOMAINE}`;
const tel = () => (chance(0.7) ? `06 ${between(10, 89)} ${between(10, 99)} ${between(10, 99)} ${between(10, 99)}` : `03 83 ${between(10, 99)} ${between(10, 99)} ${between(10, 99)}`);

// Tantièmes d'un lot d'habitation : 9 niveaux x 4 logements par bâtiment, T3 / T2 / T4 / T3.
const T_HAB = [130, 95, 165, 130];
const tantiemeHab = (num: number) => T_HAB[(num - 1) % 4];
const T_COM: Record<number, number> = { 73: 130, 74: 100 };
const T_GARAGE = 8;
const T_CAVE = 3;
const NB_GARAGES = 40; // lots 105-144
const NB_CAVES = 30; // lots 75-104
const batimentDeLot = (num: number) => (num <= 36 || num === 73 ? "01" : "02");

const owners: Owner[] = [];
const nomsVus = new Set<string>();
function ajouter(o: Owner) {
  if (nomsVus.has(o.nom)) throw new Error(`Nom en double : ${o.nom}`);
  nomsVus.add(o.nom);
  owners.push(o);
}
const vide = { enquete: null, fin: null, adhesion: null } as const;

// Personnes morales / multi-lots (bailleurs)
ajouter({ nom: "SCI COMMANDERIE", typeCopro: "sci", type: "bailleur", email: `gestion@sci-commanderie-demo.fr`, telephone: "03 83 35 12 40", adresse: "17 rue Saint-Dizier, 54000 Nancy", habitation: [1, 37], commerces: [73, 74], garages: [], caves: [], ...vide });
ajouter({ nom: "SCI DU PLATEAU DE HAYE", typeCopro: "sci", type: "bailleur", email: null, telephone: "03 83 28 71 05", adresse: "4 rue de Metz, 54520 Laxou", habitation: [2, 38], commerces: [], garages: [], caves: [], ...vide });
ajouter({ nom: "Indivision HENRIOT", typeCopro: "indivision", type: "bailleur", email: `indivision.henriot@${DOMAINE}`, telephone: "06 52 18 44 90", adresse: "9 rue Serpenoise, 57000 Metz", habitation: [3, 39], commerces: [], garages: [], caves: [], ...vide });
ajouter({ nom: "Bernard et Josiane LECLERC", typeCopro: "couple", type: "bailleur", email: `bernard.leclerc@${DOMAINE}`, telephone: "03 83 40 22 67", adresse: "12 rue des Jardins, 54600 Villers-les-Nancy", habitation: [4, 40], commerces: [], garages: [], caves: [], ...vide });

// 64 copropriétaires mono-lot : lots 5..36 et 41..72
const monoLots = [...Array.from({ length: 32 }, (_, i) => 5 + i), ...Array.from({ length: 32 }, (_, i) => 41 + i)];
let iNom = 0;
for (const lot of monoLots) {
  const nom = NOMS[iNom % NOMS.length];
  const passe = Math.floor(iNom / NOMS.length);
  iNom++;
  const couple = chance(0.35);
  const femme = chance(0.5);
  const p1 = femme ? PRENOMS_F[(iNom * 7 + passe) % PRENOMS_F.length] : PRENOMS_M[(iNom * 5 + passe) % PRENOMS_M.length];
  const p2 = femme ? PRENOMS_M[(iNom * 3 + passe) % PRENOMS_M.length] : PRENOMS_F[(iNom * 11 + passe) % PRENOMS_F.length];
  const bailleur = chance(0.22);
  const full = couple ? `${p1} et ${p2} ${nom}` : `${p1} ${nom}`;
  ajouter({
    nom: full,
    typeCopro: couple ? "couple" : "physique",
    type: bailleur ? "bailleur" : "occupant",
    email: chance(0.78) ? slugMail(p1, nom) : null,
    telephone: chance(0.7) ? tel() : null,
    adresse: bailleur ? pick(ADRESSES_BAILLEURS) : chance(0.6) ? `${ADRESSE_IMMEUBLE}, 54000 Nancy` : null,
    habitation: [lot],
    commerces: [],
    garages: [],
    caves: [],
    ...vide,
  });
}
if (owners.length !== 68) throw new Error(`Copropriétaires : ${owners.length}, attendu 68`);

// Garages 105-144 aux 40 premiers copropriétaires, caves 75-104 aux 30 derniers.
for (let g = 0; g < NB_GARAGES; g++) owners[g].garages.push(105 + g);
for (let c = 0; c < NB_CAVES; c++) owners[owners.length - 1 - c].caves.push(75 + c);

// Contrôle : total des tantièmes = 10 000 sur la clé MUN.
const totalT = owners.reduce(
  (s, o) =>
    s +
    o.habitation.reduce((a, n) => a + tantiemeHab(n), 0) +
    o.commerces.reduce((a, n) => a + T_COM[n], 0) +
    o.garages.length * T_GARAGE +
    o.caves.length * T_CAVE,
  0
);
if (totalT !== TOTAL_CLE) throw new Error(`Total tantièmes = ${totalT}, attendu ${TOTAL_CLE}`);
const nbHab = owners.reduce((s, o) => s + o.habitation.length, 0);
if (nbHab !== 72) throw new Error(`Logements : ${nbHab}, attendu 72`);

// ---------------------------------------------------------------------------
// 2. Enquête sociale (réponses du portail, questionnaire complet)
// ---------------------------------------------------------------------------
const bareme = BAREME_2026_HORS_IDF;

/** RFR tiré dans la bande du profil visé pour un ménage de n personnes. */
function rfrPourProfil(n: number, profil: Profil): number {
  const s = bareme.mprSeuils.seuils[Math.min(Math.max(n, 1), 5) as 1 | 2 | 3 | 4 | 5];
  const [bleu, jaune, violet] = s;
  let v: number;
  if (profil === "Bleu") v = between(Math.round(bleu * 0.55), bleu - 300);
  else if (profil === "Jaune") v = between(bleu + 300, jaune - 300);
  else if (profil === "Violet") v = between(jaune + 300, violet - 400);
  else v = between(violet + 800, Math.round(violet * 1.8));
  return Math.round(v / 10) * 10;
}

const TYPE_COPRO_LABEL: Record<TypeCopro, string> = {
  physique: "Personne physique",
  couple: "Personne physique",
  indivision: "Indivision",
  sci: "SCI soumise à l'impôt sur le revenu",
};

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
    "energie-chauffage": "Fioul",
    "type-ecs": "Collectif",
    "energie-ecs": "Même système que le chauffage",
    "nb-radiateurs": between(4, 7),
    "regulation-radiateurs": pick(["Oui, sur tous les radiateurs", "Oui, sur une partie seulement", "Non", "Je ne sais pas"]),
    pathologies: pathos,
    inconforts: inconf,
  };
}

for (const [idx, o] of owners.entries()) {
  // SCI du Plateau de Haye : jamais répondu. SCI Commanderie : répondu (sans ressources).
  if (o.typeCopro === "sci" && idx === 1) continue;
  if (o.typeCopro !== "sci" && !chance(0.72)) continue;

  const complet = o.typeCopro === "sci" || chance(0.9);
  const copro: Record<string, unknown> = {
    nom: o.nom,
    telephone: o.telephone ?? "",
    adresse: o.adresse ?? `${ADRESSE_IMMEUBLE}, 54000 Nancy`,
    email: o.email ?? "",
    "type-coproprietaire": TYPE_COPRO_LABEL[o.typeCopro],
  };
  if (o.typeCopro === "sci") {
    copro["nb-associes-sci"] = 2;
    copro["personne-physique-sci"] = "Oui";
  }
  if (o.typeCopro === "indivision") copro["nb-indivisaires"] = 3;

  let nbPersonnes: number | null = null;
  let rfr: number | null = null;
  let rfrN2: number | null = null;
  let profil: Profil | null = null;
  const menage = o.typeCopro !== "sci";
  if (menage && complet) {
    nbPersonnes = o.typeCopro === "couple" ? pick([2, 2, 3, 3, 4, 4, 5]) : pick([1, 1, 1, 2, 2, 3]);
    const cible = pickWeighted<Profil>({ Bleu: 25, Jaune: 30, Violet: 30, Rose: 15 });
    // un ménage sans revenu imposable (cas réel : RFR = 0 justifié)
    rfr = idx === 23 ? 0 : rfrPourProfil(nbPersonnes, cible);
    rfrN2 = rfr === 0 ? 0 : Math.round((rfr * (0.95 + rand() * 0.08)) / 10) * 10;
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
    // brouillon : quelques réponses seulement
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
        "type-occupation": occupant ? "Propriétaire occupant" : idx === 3 ? "Logement vacant" : "Propriétaire bailleur (logement loué)",
        "nb-habitants": occupant ? nbPersonnes ?? 1 : idx === 3 ? 0 : between(1, 3),
        "type-residence": "Résidence principale",
        commodat: "Non",
        "projet-vente": chance(0.85) ? "Non" : pick(["Oui, après les travaux", "Je ne sais pas encore"]),
        demembrement: idx === 30 ? "Oui, je suis usufruitier" : "Non",
        ...(o.typeCopro === "indivision" ? { "indivisaires-occupants": 0 } : {}),
        ...(o.typeCopro === "sci" ? { "associes-occupants": 0 } : {}),
        ...reponsesTechniques(),
      }
    : { "type-occupation": occupant ? "Propriétaire occupant" : "Propriétaire bailleur (logement loué)" };
  const lotCom = o.commerces.length ? { "associes-exploitants": "Non", ...reponsesTechniques() } : null;

  const verifie = complet && profil != null && chance(0.45);
  o.enquete = {
    complet,
    nbPersonnes,
    rfr,
    rfrN2,
    profil,
    verifie,
    joursTransmis: between(8, 46),
    joursVerifie: between(1, 7),
    copro,
    lotHab,
    lotCom,
  };
}

// ---------------------------------------------------------------------------
// 3. Choix de financement (« plus ou moins choisi ») et adhésions
// ---------------------------------------------------------------------------
const SITUATIONS = ["mariee", "celibataire", "pacsee", "divorcee", "veuve"] as const;
function adherent(prenomNom: string, nom: string) {
  return {
    nomPrenom: `${nom} ${prenomNom}`,
    nomNaissance: chance(0.7) ? nom : pick(NOMS),
    dateLieuNaissance: `${String(between(1, 28)).padStart(2, "0")}/${String(between(1, 12)).padStart(2, "0")}/${between(1948, 1992)} à ${pick(["Nancy", "Metz", "Epinal", "Luneville", "Toul", "Paris"])}`,
    profession: pick(PROFESSIONS),
    professionDepuis: `01/${String(between(1, 12)).padStart(2, "0")}/${between(1995, 2023)}`,
    situation: pick(SITUATIONS),
    situationDepuis: chance(0.5) ? `${String(between(1, 28)).padStart(2, "0")}/${String(between(1, 12)).padStart(2, "0")}/${between(1980, 2022)}` : "",
  };
}
function prenomsDe(o: Owner): { p1: string; p2: string | null; nom: string } {
  const parts = o.nom.split(" ");
  const nom = parts.slice(o.typeCopro === "couple" ? 3 : 1).join(" ");
  if (o.typeCopro === "indivision") return { p1: "Marc", p2: null, nom }; // l'indivisaire signataire
  return { p1: parts[0], p2: o.typeCopro === "couple" ? parts[2] : null, nom };
}

for (const [idx, o] of owners.entries()) {
  if (!chance(0.66)) continue;
  let type: Fin;
  if (o.typeCopro === "sci") type = "fonds"; // une SCI ne souscrit pas l'éco-PTZ
  else type = pickWeighted<Fin>({ collectif: 50, individuel: 22, fonds: 28 });
  let saisiPar: SaisiPar = "copro";
  if (type === "fonds" && chance(0.4)) saisiPar = "syndic"; // information donnée en direct au gestionnaire
  if (idx === 3) saisiPar = "amo"; // saisie en aperçu par le chef de projet
  o.fin = { type, duree: type === "individuel" ? pick([10, 15, 20]) : null, saisiPar, jours: between(2, 35) };

  if (type === "collectif") {
    const etat = pickWeighted({ signee: 55, brouillon: 25, aucune: 20 });
    if (etat === "aucune") continue;
    const { p1, p2, nom } = prenomsDe(o);
    const complet = etat === "signee";
    const form = {
      adherent1: adherent(p1, nom),
      adherent2: p2 && complet ? adherent(p2, nom) : null,
      adresse: o.type === "occupant" || !o.adresse ? ADRESSE_IMMEUBLE : o.adresse.split(",")[0],
      cp: o.type === "occupant" || !o.adresse ? "54000" : o.adresse.match(/\b\d{5}\b/)?.[0] ?? "54000",
      ville: o.type === "occupant" || !o.adresse ? "Nancy" : o.adresse.replace(/^.*\d{5}\s*/, ""),
      telDomicile: "",
      telBureau: "",
      portable: complet ? o.telephone ?? tel() : o.telephone ?? "",
      email: o.email ?? "",
      montantType: "100",
      montantAutre: "",
      lieuSignature: complet ? "Nancy" : "",
    };
    o.adhesion = {
      statut: etat,
      form,
      jours: Math.max(0, o.fin.jours - between(0, 5)),
      rib: complet ? pickWeighted({ concordant: 60, non_verifie: 30, discordant: 10 }) : null,
    };
  }
}

// ---------------------------------------------------------------------------
// 4. PF définitif -> plans individuels (même circuit que l'onglet Financement)
// ---------------------------------------------------------------------------
const pfData = readPlanDefinitif(stanislas.data);
const pv = computePlanDefinitif(pfData);
const lotsRep = owners.flatMap((o) => [
  ...o.habitation.map((n) => ({ coproprietaire_id: o.nom, coproprietaire: { nom: o.nom }, tantiemes: { [CLE]: tantiemeHab(n) } })),
  ...o.commerces.map((n) => ({ coproprietaire_id: o.nom, coproprietaire: { nom: o.nom }, tantiemes: { [CLE]: T_COM[n] } })),
  ...o.garages.map(() => ({ coproprietaire_id: o.nom, coproprietaire: { nom: o.nom }, tantiemes: { [CLE]: T_GARAGE } })),
  ...o.caves.map(() => ({ coproprietaire_id: o.nom, coproprietaire: { nom: o.nom }, tantiemes: { [CLE]: T_CAVE } })),
]);
const rep = repartirPfDepuisLots(pfData, pv, lotsRep, [{ code: CLE, is_default: true }]);
if (rep.manquants.length) throw new Error(`Lignes sans clé : ${rep.manquants.length}`);
if (rep.plans.length !== owners.length) throw new Error(`Plans individuels : ${rep.plans.length}/${owners.length}`);
if (rep.totauxCles[CLE] !== TOTAL_CLE) throw new Error(`Total clé ${CLE} = ${rep.totauxCles[CLE]}`);
const sommeQp = round2(rep.plans.reduce((s, p) => s + p.quotePartAvant, 0));
if (Math.abs(sommeQp - round2(pv.totalOperationTtc)) > 1) throw new Error(`Somme des quotes-parts ${sommeQp} != opération ${round2(pv.totalOperationTtc)}`);

// Params du scénario pont - copie de usePartagerPfCopros (api/planDefinitif.ts).
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

// ---------------------------------------------------------------------------
// 5. Émission du SQL
// ---------------------------------------------------------------------------
const q = (s: string) => s.replace(/'/g, "''");
const sqlStr = (s: string | null) => (s == null ? "null" : `'${q(s)}'`);
const jsonSql = (v: unknown) => {
  const s = JSON.stringify(v);
  if (s.includes("$json$")) throw new Error("Délimiteur $json$ présent dans une donnée");
  return `$json$${s}$json$::jsonb`;
};
const fmt = (n: number) => round2(n).toLocaleString("fr-FR", { maximumFractionDigits: 0 }).replace(/[  ]/g, " ");

const ownersValues = owners
  .map((o) => `      (${sqlStr(o.nom)}, '${o.type}', ${sqlStr(o.email)}, ${sqlStr(o.telephone)}, ${sqlStr(o.adresse)})`)
  .join(",\n");

// (num, bâtiment, copropriétaire, usage, tantièmes, lot principal de rattachement)
const lotsValues = owners
  .flatMap((o) => {
    const principal = String(o.habitation[0]);
    return [
      ...o.habitation.map((n) => `      ('${n}', '${batimentDeLot(n)}', ${sqlStr(o.nom)}, 'habitation', ${tantiemeHab(n)}, null)`),
      ...o.commerces.map((n) => `      ('${n}', '${batimentDeLot(n)}', ${sqlStr(o.nom)}, 'commerces', ${T_COM[n]}, null)`),
      ...o.caves.map((n) => `      ('${n}', '${batimentDeLot(o.habitation[0])}', ${sqlStr(o.nom)}, 'caves', ${T_CAVE}, '${principal}')`),
      ...o.garages.map((n) => `      ('${n}', '${batimentDeLot(o.habitation[0])}', ${sqlStr(o.nom)}, 'garage', ${T_GARAGE}, '${principal}')`),
    ];
  })
  .join(",\n");

const enqValues = owners
  .filter((o) => o.enquete)
  .map((o) => {
    const e = o.enquete!;
    const occupation = o.type === "occupant" ? "occupant" : "bailleur";
    return `      (${sqlStr(o.nom)}, ${jsonSql(e.copro)}, ${jsonSql(e.lotHab)}, ${e.lotCom ? jsonSql(e.lotCom) : "null"}, ${e.nbPersonnes ?? "null"}, ${e.rfr ?? "null"}, ${e.rfrN2 ?? "null"}, '${occupation}', ${sqlStr(e.profil)}, ${e.verifie}, ${e.joursVerifie}, ${e.complet}, ${e.joursTransmis})`;
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

// Statistiques pour l'en-tête du fichier et la console.
const nbEnq = owners.filter((o) => o.enquete).length;
const nbComplet = owners.filter((o) => o.enquete?.complet).length;
const nbVerif = owners.filter((o) => o.enquete?.verifie).length;
const profils = owners.reduce<Record<string, number>>((acc, o) => {
  const p = o.enquete?.profil;
  if (p) acc[p] = (acc[p] ?? 0) + 1;
  return acc;
}, {});
const nbFin = owners.filter((o) => o.fin).length;
const finParType = owners.reduce<Record<string, number>>((acc, o) => {
  if (o.fin) acc[o.fin.type] = (acc[o.fin.type] ?? 0) + 1;
  return acc;
}, {});
const nbSyndic = owners.filter((o) => o.fin?.saisiPar === "syndic").length;
const nbAdhSign = owners.filter((o) => o.adhesion?.statut === "signee").length;
const nbAdhBrouillon = owners.filter((o) => o.adhesion?.statut === "brouillon").length;
const nbSansMail = owners.filter((o) => !o.email).length;
const nbLots = owners.reduce((s, o) => s + o.habitation.length + o.commerces.length + o.garages.length + o.caves.length, 0);

const resume = [
  `--   ${owners.length} copropriétaires (${nbSansMail} sans e-mail), ${nbLots} lots : 72 logements, 2 commerces, ${NB_CAVES} caves, ${NB_GARAGES} garages - clé ${CLE} = ${TOTAL_CLE}`,
  `--   enquête : ${nbEnq} réponses (${nbComplet} transmises complètes, ${nbEnq - nbComplet} brouillons), ${nbVerif} profils vérifiés - profils ${Object.entries(profils).map(([k, v]) => `${k} ${v}`).join(", ")}`,
  `--   financement : ${nbFin} choix transmis (${Object.entries(finParType).map(([k, v]) => `${k} ${v}`).join(", ")} ; ${nbSyndic} saisis par le syndic), ${owners.length - nbFin} sans choix`,
  `--   adhésions prêt collectif : ${nbAdhSign} signées, ${nbAdhBrouillon} en brouillon`,
  `--   PF : opération TTC ${fmt(pv.totalOperationTtc)} EUR - aides ${fmt(pv.totalAides)} EUR (dont CEE ${fmt(pv.primeCee)}) - reste à charge ${fmt(pv.resteACharge)} EUR`,
].join("\n");

const sql = `-- Import fictif de RESIDENCE STANISLAS (démo commerciale SYNDIC HORIZON GRAND EST)
-- Feedback Amir 10/09/2026 : copropriétaires, lots & tantièmes, enquête sociale,
-- partage du PF définitif, choix de financement « plus ou moins » faits, adhésions.
-- GÉNÉRÉ par gen_seed_demo_stanislas.ts - ne pas éditer à la main, relancer :
--   npx vite-node supabase/seed/gen_seed_demo_stanislas.ts
-- Prérequis : seed_demo_horizon.sql (organisation, copropriété) et
-- seed_demo_horizon_etudes.sql (PF définitif validé de Stanislas).
-- Idempotent : chaque bloc se saute s'il a déjà été joué.
-- Aucun fichier Storage : pas de PDF de bulletin, mandat SEPA ni pièce justificative.
--
${resume}

begin;

-- ========== 1. Données : bâtiments, clé MUN, copropriétaires, lots, tantièmes ==========
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
  select id into v_copro from coproprietes where slug = '${SLUG}';
  if v_copro is null then
    raise exception 'Copropriété ${SLUG} absente - jouer seed_demo_horizon.sql d''abord.';
  end if;
  if exists (select 1 from lots where copro_id = v_copro) then
    raise notice 'Lots déjà présents - bloc données sauté.';
    return;
  end if;

  -- Bâtiments : 01 existe (déclaré à la création), 02 est créé comme le ferait l'import.
  insert into batiments (copro_id, code, position)
  select v_copro, '02', 1
  where not exists (select 1 from batiments where copro_id = v_copro and code = '02');

  insert into cles_repartition (copro_id, code, label, is_default)
  values (v_copro, '${CLE}', 'Tantièmes généraux', true)
  on conflict do nothing;
  select id into v_cle from cles_repartition where copro_id = v_copro and code = '${CLE}';

  -- Copropriétaires (nom, type, e-mail, téléphone, adresse postale)
  for r in
    select * from (values
${ownersValues}
    ) as t(nom, type, email, telephone, adresse)
  loop
    insert into coproprietaires (copro_id, nom, type, email, telephone, adresse)
    values (v_copro, r.nom, r.type, r.email, r.telephone, r.adresse);
  end loop;

  -- Lots principaux puis lots annexes rattachés (caves, garages)
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
end $$;

-- ========== 2. Enquête sociale envoyée + réponses transmises depuis le portail ==========
do $$
declare
  v_copro uuid;
  v_enq uuid;
  v_verif uuid;
  r record;
  v_cp uuid;
  v_lots jsonb;
begin
  select id into v_copro from coproprietes where slug = '${SLUG}';
  if v_copro is null then return; end if;

  -- L'enquête existante (brouillon paramétré par l'AMO) est envoyée ; sinon on la crée.
  select id into v_enq from enquetes where copro_id = v_copro order by created_at limit 1;
  if v_enq is null then
    insert into enquetes (copro_id, questions, statut, sent_at)
    values (v_copro, ${jsonSql(defaultConfig())}, 'envoyee', now() - interval '50 days')
    returning id into v_enq;
  else
    update enquetes set statut = 'envoyee', sent_at = coalesce(sent_at, now() - interval '50 days')
    where id = v_enq;
  end if;
  if exists (select 1 from enquete_reponses where enquete_id = v_enq) then
    raise notice 'Réponses déjà présentes - bloc enquête sauté.';
    return;
  end if;

  select user_id into v_verif from profiles p join auth.users u on u.id = p.user_id
  where u.email = '${AMO_VERIF_EMAIL}' limit 1;

  for r in
    select * from (values
${enqValues}
    ) as t(nom, copro, lot_hab, lot_com, nb_personnes, rfr, rfr_n2, occupation, profil, verifie, jours_verif, complet, jours)
  loop
    select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
    -- Réponses par lot, clés = id des lots (comme le portail) ; lot-parent = lot principal.
    select coalesce(jsonb_object_agg(l.id::text,
      case l.usage
        when 'habitation' then jsonb_build_object('usage-lot', 'Habitation') || r.lot_hab
        when 'commerces' then jsonb_build_object('usage-lot', 'Commerce') || coalesce(r.lot_com, '{}'::jsonb)
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
end $$;

-- ========== 3. Configuration du prêt collectif (CEGEE, ${pfData.params.dureeEcoPtzAns} ans, adhésion ouverte) ==========
insert into copro_financement_config (copro_id, banque, duree_annees, adhesion_ouverte)
select id, 'CEGEE', ${pfData.params.dureeEcoPtzAns}, true from coproprietes where slug = '${SLUG}'
on conflict (copro_id) do nothing;

-- ========== 4. Partage du PF définitif : scénario pont + plans individuels ==========
do $$
declare
  v_copro uuid;
  v_plan uuid;
  v_scen uuid;
  r record;
begin
  select id into v_copro from coproprietes where slug = '${SLUG}';
  if v_copro is null then return; end if;
  select id into v_plan from plans_definitifs where copro_id = v_copro and statut = 'valide' order by updated_at desc limit 1;
  if v_plan is null then
    raise exception 'PF définitif validé absent - jouer seed_demo_horizon_etudes.sql d''abord.';
  end if;
  if exists (select 1 from scenarios_financiers where plan_definitif_id = v_plan) then
    raise notice 'Scénario pont déjà présent - bloc partage sauté.';
    return;
  end if;

  insert into scenarios_financiers (copro_id, name, statut, locked, bareme_millesime, params, plan_definitif_id, created_at, updated_at)
  values (
    v_copro,
    ${sqlStr(stanislas.nomPlan)},
    'partage',
    true,
    ${bareme.millesime},
    ${jsonSql(scenarioParams)},
    v_plan,
    now() - interval '40 days',
    now() - interval '40 days'
  )
  returning id into v_scen;

  for r in
    select * from (values
${plansValues}
    ) as t(nom, tantiemes, quote_part, cee_part, subv_coll_part, reste)
  loop
    insert into plans_individuels (scenario_id, coproprietaire_id, tantiemes, quote_part, mpr_indiv, cee_part, subv_coll_part, eco_ptz_part, reste, mensualite, detail)
    select v_scen, cp.id, r.tantiemes, r.quote_part, 0, r.cee_part, r.subv_coll_part, 0, r.reste, 0,
           jsonb_build_object('source', 'pf', 'planDefinitifId', v_plan)
    from coproprietaires cp
    where cp.copro_id = v_copro and cp.nom = r.nom;
  end loop;
end $$;

-- ========== 5. Choix de financement transmis (portail) ou saisis (syndic / AMO) ==========
do $$
declare
  v_copro uuid;
  v_scen uuid;
  v_syndic uuid;
  v_amo uuid;
  r record;
  v_cp uuid;
begin
  select id into v_copro from coproprietes where slug = '${SLUG}';
  if v_copro is null then return; end if;
  select s.id into v_scen from scenarios_financiers s
  join plans_definitifs p on p.id = s.plan_definitif_id
  where s.copro_id = v_copro and s.statut = 'partage' order by s.updated_at desc limit 1;
  if v_scen is null or exists (select 1 from choix_financement where scenario_id = v_scen) then
    raise notice 'Choix déjà présents ou scénario absent - bloc choix sauté.';
    return;
  end if;
  -- gestionnaire du dossier (compte syndic rattaché par e-mail) et chef de projet
  select u.id into v_syndic from coproprietes c join auth.users u on lower(u.email) = lower(c.gestionnaire_email)
  where c.id = v_copro limit 1;
  select u.id into v_amo from auth.users u where u.email = '${AMO_VERIF_EMAIL}' limit 1;

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
      case r.saisi_par when 'syndic' then v_syndic when 'amo' then v_amo else null end
    );
  end loop;
end $$;

-- ========== 6. Adhésions au prêt collectif (signées ou en brouillon, sans fichiers) ==========
do $$
declare
  v_copro uuid;
  v_scen uuid;
  r record;
  v_cp uuid;
begin
  select id into v_copro from coproprietes where slug = '${SLUG}';
  if v_copro is null or exists (select 1 from adhesions_pret where copro_id = v_copro) then
    raise notice 'Adhésions déjà présentes - bloc sauté.';
    return;
  end if;
  select id into v_scen from scenarios_financiers where copro_id = v_copro and statut = 'partage' order by updated_at desc limit 1;

  for r in
    select * from (values
${adhesionsValues}
    ) as t(nom, statut, form, jours, rib)
  loop
    select id into v_cp from coproprietaires where copro_id = v_copro and nom = r.nom;
    insert into adhesions_pret (copro_id, coproprietaire_id, scenario_id, statut, form, lieu_signature, signed_at, rib_concordance, created_at, updated_at)
    values (
      v_copro, v_cp, v_scen, r.statut, r.form,
      case when r.statut = 'signee' then 'Nancy' else null end,
      case when r.statut = 'signee' then now() - (r.jours || ' days')::interval else null end,
      r.rib,
      now() - (r.jours || ' days')::interval - interval '1 hour',
      now() - (r.jours || ' days')::interval
    );
  end loop;
end $$;

commit;
`;

const out = join(dirname(fileURLToPath(import.meta.url)), "seed_demo_stanislas.sql");
writeFileSync(out, sql, "utf8");
console.log(`Écrit : ${out}`);
console.log(resume.replace(/^--   /gm, ""));
