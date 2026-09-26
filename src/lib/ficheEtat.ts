// Fiche « État de la copropriété » (ANAH - MaPrimeRénov' Copro), modèle
// Fiche_Etat_ZORN.docx reçu le 23/09/2026. Arbitrages d'Amir : le syndic
// complète, l'AMO valide ; tout ce que la base connaît déjà est calculé ici
// (lots, tantièmes, occupation, étiquettes) pour que la fiche, le rapport
// d'enquête sociale et le PDF signé donnent les mêmes chiffres.
//
// Module pur (aucun accès réseau) : le formulaire, l'export du rapport
// d'enquête, la page publique du président du conseil syndical et le PDF
// partagent ces définitions et ces calculs.
import type { DpeClass } from "./referentiels";
import { trierParNomFamille } from "./nomFamille";

export const ETIQUETTES: DpeClass[] = ["A", "B", "C", "D", "E", "F", "G"];

// ============================================================
// Définition des champs (ordre et libellés du modèle ANAH)
// ============================================================

/** Qui renseigne le champ : calculé depuis la base, saisi par le syndic ou par l'AMO. */
export type Qui = "base" | "syndic" | "amo";
export type TypeChamp = "text" | "number" | "montant" | "pct" | "date" | "ouinon" | "select" | "email" | "tel";

export interface ChampFiche {
  key: string;
  label: string;
  qui: Qui;
  type?: TypeChamp;
  options?: string[];
  /** En gras dans le modèle ANAH : obligatoire pour transmettre. */
  obligatoire?: boolean;
  hint?: string;
  /** Obligatoire seulement si la condition est vraie (ex. combustible si chaufferie collective). */
  obligatoireSi?: (v: Record<string, string>) => boolean;
  /** Champ plein largeur dans le formulaire. */
  large?: boolean;
}

export interface SectionFiche {
  id: string;
  titre: string;
  /** Sous-titre éventuel (ex. « Président du conseil syndical »). */
  groupes: { titre?: string; note?: string; champs: ChampFiche[] }[];
}

export const TYPES_SYNDIC = ["Professionnel", "Bénévole", "Coopératif"];
const OUI = (v: Record<string, string>, k: string) => (v[k] ?? "").toUpperCase() === "OUI";

export const SECTIONS_FICHE: SectionFiche[] = [
  {
    id: "identite",
    titre: "Identité",
    groupes: [
      {
        champs: [
          { key: "copro_nom", label: "Nom de la copropriété", qui: "base", obligatoire: true },
          { key: "copro_voie", label: "N° et voie", qui: "base", obligatoire: true },
          { key: "copro_cp", label: "Code postal", qui: "base", obligatoire: true },
          { key: "copro_commune", label: "Commune", qui: "base", obligatoire: true },
          { key: "epci", label: "Intercommunalité (CU, CA, Métropole...)", qui: "syndic" },
          { key: "region", label: "Région", qui: "syndic" },
          { key: "assurance_mri", label: "La copropriété dispose-t-elle d'une assurance multirisques ?", qui: "syndic", type: "ouinon" },
          { key: "immatriculation", label: "Numéro d'immatriculation au registre des copropriétés", qui: "syndic", hint: "registre-coproprietes.gouv.fr" },
          { key: "npnru", label: "Copropriété située dans un quartier NPNRU", qui: "amo", type: "ouinon" },
        ],
      },
    ],
  },
  {
    id: "contacts",
    titre: "Contacts",
    groupes: [
      {
        titre: "Président du conseil syndical",
        note: "Son courriel reçoit le lien de signature électronique de la fiche.",
        champs: [
          { key: "pcs_nom", label: "Nom et prénom", qui: "syndic", obligatoire: true },
          { key: "pcs_adresse", label: "Adresse", qui: "syndic", obligatoire: true },
          { key: "pcs_tel", label: "Téléphone", qui: "syndic", type: "tel", obligatoire: true },
          { key: "pcs_email", label: "Courriel", qui: "syndic", type: "email", obligatoire: true },
        ],
      },
      {
        titre: "Syndic",
        champs: [
          { key: "syndic_nom", label: "Nom du syndic", qui: "syndic", obligatoire: true },
          { key: "syndic_gestionnaire", label: "Nom et prénom du gestionnaire", qui: "syndic", obligatoire: true },
          { key: "syndic_adresse", label: "Adresse", qui: "syndic", obligatoire: true },
          { key: "syndic_tel", label: "Téléphone", qui: "syndic", type: "tel", obligatoire: true },
          { key: "syndic_email", label: "Courriel", qui: "syndic", type: "email", obligatoire: true },
        ],
      },
    ],
  },
  {
    id: "generales",
    titre: "Informations générales",
    groupes: [
      {
        note: "Calculé depuis les lots et tantièmes de l'onglet Données. Une erreur se corrige dans les données du dossier, pas dans la fiche.",
        champs: [
          { key: "nb_batiments", label: "Nombre de bâtiments", qui: "base", obligatoire: true },
          { key: "nb_lots", label: "Nombre total de lots (tous lots confondus)", qui: "base", obligatoire: true },
          { key: "tantiemes_ccg", label: "Nombre total de tantièmes charges communes générales", qui: "base", obligatoire: true },
          { key: "nb_lots_hab", label: "Nombre de lots d'habitation principale", qui: "base", obligatoire: true },
          { key: "pct_lots_hab", label: "% de lots d'habitation principale par rapport au nombre total de lots", qui: "base", obligatoire: true },
          { key: "tantiemes_hab", label: "Nombre de tantièmes d'habitation principale", qui: "base", obligatoire: true },
          { key: "pct_tantiemes_hab", label: "% de tantièmes d'habitation principale par rapport au total des tantièmes charges communes générales", qui: "base", obligatoire: true },
        ],
      },
    ],
  },
  {
    id: "occupation",
    titre: "Occupation",
    groupes: [
      {
        champs: [
          { key: "nb_proprietaires", label: "Nombre total de propriétaires de logements", qui: "base", obligatoire: true },
          { key: "nb_po", label: "Nombre de propriétaires occupants", qui: "base", obligatoire: true },
          { key: "tantiemes_po", label: "Tantièmes des propriétaires occupants", qui: "base", obligatoire: true },
          { key: "nb_pb", label: "Nombre de propriétaires bailleurs", qui: "base", obligatoire: true },
          { key: "tantiemes_pb", label: "Tantièmes des propriétaires bailleurs", qui: "base", obligatoire: true },
          { key: "nb_po_modestes", label: "Nombre de copropriétaires occupants aux ressources modestes selon les critères de l'Anah éligibles à la prime individuelle", qui: "base", obligatoire: true },
          { key: "nb_po_tres_modestes", label: "Nombre de copropriétaires occupants aux ressources très modestes selon les critères de l'Anah éligibles à la prime individuelle", qui: "base", obligatoire: true },
        ],
      },
    ],
  },
  {
    id: "fonctionnement",
    titre: "Fonctionnement et organisation de la copropriété",
    groupes: [
      {
        champs: [
          { key: "rc_publie", label: "Règlement de copropriété publié", qui: "syndic", type: "ouinon", obligatoire: true },
          { key: "type_syndic", label: "Type de syndic", qui: "syndic", type: "select", options: TYPES_SYNDIC, obligatoire: true },
          { key: "nb_membres_cs", label: "Nombre de membres du conseil syndical", qui: "syndic", type: "number", obligatoire: true },
          { key: "date_derniere_ag", label: "Date de la dernière assemblée générale", qui: "syndic", type: "date", obligatoire: true },
          { key: "pct_presents_ag", label: "% de présents et représentés en tantièmes charges communes générales à cette assemblée générale", qui: "syndic", type: "pct", obligatoire: true },
          { key: "structure_chauffage", label: "Présence d'une structure (ASL, AFUL, Union de syndicats...) en charge du chauffage collectif ?", qui: "syndic", type: "ouinon" },
        ],
      },
    ],
  },
  {
    id: "bati",
    titre: "État du bâti",
    groupes: [
      {
        champs: [
          { key: "periode_construction", label: "Période de construction", qui: "syndic", obligatoire: true, hint: "ex. 1965 ou 1949-1974" },
          { key: "chaufferie_collective", label: "Chaufferie collective", qui: "syndic", type: "ouinon", obligatoire: true },
          { key: "chauffage_combustible", label: "Si oui type de combustible", qui: "syndic", obligatoireSi: (v) => OUI(v, "chaufferie_collective"), hint: "gaz, fioul, réseau de chaleur…" },
          { key: "ecs_collective", label: "Production d'eau chaude sanitaire collective ?", qui: "syndic", type: "ouinon", obligatoire: true },
          { key: "ecs_combustible", label: "Si oui type de combustible", qui: "syndic", obligatoireSi: (v) => OUI(v, "ecs_collective") },
          { key: "arrete_insalubrite", label: "Présence d'un arrêté d'insalubrité touchant les parties communes ?", qui: "syndic", type: "ouinon", obligatoire: true },
          { key: "arrete_peril", label: "Présence d'un arrêté de péril touchant les parties communes ?", qui: "syndic", type: "ouinon", obligatoire: true },
          { key: "arrete_equipements", label: "Présence d'un arrêté sur les équipements communs ?", qui: "syndic", type: "ouinon", obligatoire: true },
          { key: "injonction_plomb", label: "Présence d'une injonction d'enlèvement des particules au plomb touchant les parties communes", qui: "syndic", type: "ouinon", obligatoire: true },
        ],
      },
    ],
  },
  {
    id: "finances",
    titre: "Situation financière",
    groupes: [
      {
        champs: [
          { key: "pct_charges_chauffage", label: "% des charges du chauffage collectif par rapport au budget prévisionnel année N-1", qui: "syndic", type: "pct", obligatoire: true },
          { key: "budget_n1", label: "Montant du budget prévisionnel année N-1", qui: "syndic", type: "montant", obligatoire: true },
          { key: "impayes_n1", label: "Montant des impayés des copropriétaires à la clôture de l'exercice année N-1", qui: "syndic", type: "montant", obligatoire: true },
          { key: "budget_n2", label: "Montant du budget prévisionnel année N-2", qui: "syndic", type: "montant", obligatoire: true },
          { key: "impayes_n2", label: "Montant des impayés des copropriétaires à la clôture de l'exercice année N-2", qui: "syndic", type: "montant", obligatoire: true },
          { key: "taux_impayes_8", label: "Taux d'impayés de charge de copropriété supérieur ou égal à 8 % du budget voté sur la base du compte de gestion général de l'exercice clos de l'année N-2 par rapport à la demande de subvention", qui: "syndic", type: "ouinon", hint: "calculé depuis les impayés et le budget N-2, modifiable" },
          { key: "budget_n3", label: "Montant du budget prévisionnel année N-3", qui: "syndic", type: "montant" },
          { key: "impayes_n3", label: "Montant des impayés des copropriétaires à la clôture de l'exercice année N-3", qui: "syndic", type: "montant" },
          { key: "dette_fournisseur_n1", label: "Montant dette fournisseur N-1", qui: "syndic", type: "montant" },
        ],
      },
    ],
  },
];

export const CHAMPS_FICHE: ChampFiche[] = SECTIONS_FICHE.flatMap((s) => s.groupes.flatMap((g) => g.champs));
export const CHAMP_PAR_CLE = new Map(CHAMPS_FICHE.map((c) => [c.key, c]));

/** Clés du tableau des étiquettes (grille A-G + lignes « gain > 35 % »), calculées depuis la saisie AMO par bâtiment. */
export const CLES_ETIQUETTES = [
  ...ETIQUETTES.map((e) => `etiq_bat_${e}`),
  ...ETIQUETTES.map((e) => `etiq_log_${e}`),
  "nb_bat_gain35",
  "nb_log_gain35",
];

// ============================================================
// Formatage (espaces simples : les polices standard du PDF ne
// connaissent pas l'espace fine insécable de toLocaleString)
// ============================================================

function grouper(entier: string): string {
  return entier.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function fmtEntier(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  const s = Math.round(n).toString();
  return s.startsWith("-") ? "-" + grouper(s.slice(1)) : grouper(s);
}

/** Nombre décimal à la française : 1 234,5 (jusqu'à 2 décimales, sans zéros inutiles). */
export function fmtDecimal(n: number | null | undefined, decimales = 2): string {
  if (n == null || !Number.isFinite(n)) return "";
  const fixe = Math.abs(n).toFixed(decimales).replace(/\.?0+$/, "");
  const [ent, dec] = fixe.split(".");
  return (n < 0 ? "-" : "") + grouper(ent) + (dec ? "," + dec : "");
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  const [ent, dec] = n.toFixed(2).split(".");
  return `${grouper(ent)},${dec} %`;
}

/** Lecture d'une saisie numérique (« 12 345,50 », « 12345.5 », « 8 % »). */
export function lireNombre(v: string | null | undefined): number | null {
  if (v == null) return null;
  const s = String(v).replace(/[\s\u00a0\u202f€%]/g, "").replace(",", ".");
  if (s === "" || !/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtDateFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Valeur d'un champ telle qu'elle s'imprime sur la fiche. */
export function valeurAffichee(champ: ChampFiche | undefined, brute: string | undefined): string {
  const v = (brute ?? "").trim();
  if (!v || !champ) return v;
  switch (champ.type) {
    case "montant": {
      const n = lireNombre(v);
      return n == null ? v : `${fmtDecimal(n)} €`;
    }
    case "pct": {
      const n = lireNombre(v);
      return n == null ? v : `${fmtDecimal(n)} %`;
    }
    case "number": {
      const n = lireNombre(v);
      return n == null ? v : fmtDecimal(n);
    }
    case "date":
      return fmtDateFr(v);
    case "ouinon":
      return v.toUpperCase() === "OUI" ? "Oui" : v.toUpperCase() === "NON" ? "Non" : v;
    default:
      return v;
  }
}

// ============================================================
// Adresses : occupation présumée d'après l'adresse postale importée
// ============================================================

const ABREVIATIONS: [RegExp, string][] = [
  [/\br\b/g, "rue"],
  [/\bbd\b|\bboul\b|\bblvd\b/g, "boulevard"],
  [/\bav\b|\bave\b/g, "avenue"],
  [/\bpl\b/g, "place"],
  [/\bimp\b/g, "impasse"],
  [/\bch\b|\bchem\b/g, "chemin"],
  [/\brte\b/g, "route"],
  [/\ball\b/g, "allee"],
  [/\bfbg\b/g, "faubourg"],
  [/\bsq\b/g, "square"],
  [/\bqu\b/g, "quai"],
  [/\bpass\b/g, "passage"],
  [/\bst\b/g, "saint"],
  [/\bste\b/g, "sainte"],
];
const TYPES_VOIE = new Set([
  "rue", "avenue", "boulevard", "place", "impasse", "chemin", "route", "allee", "quai", "cours",
  "faubourg", "square", "passage", "sentier", "cite", "residence", "promenade", "voie", "parvis", "rond", "esplanade",
]);
const MOTS_VIDES = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "a", "au", "aux", "et"]);
const SUFFIXES_NUM = new Set(["bis", "ter", "quater", "b", "t"]);

interface AdresseAnalysee {
  /** Tokens de la voie sans mots vides (« rue zorn »). */
  voie: string[];
  numeros: number[];
  cp: string | null;
}

function normaliser(s: string): string {
  let t = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, " ")
    .replace(/[.,;:/()"]/g, " ");
  for (const [re, rep] of ABREVIATIONS) t = t.replace(re, rep);
  return t.replace(/\s+/g, " ").trim();
}

/** « 12-14-16 » → 12, 14, 16 ; « 12 à 16 » ou « 12-16 » (même parité) → 12, 14, 16. */
function lireNumeros(segment: string): number[] {
  const nums = [...segment.matchAll(/\d+/g)].map((m) => Number(m[0]));
  if (nums.length === 2 && /\d+\s*(?:-|a|au)\s*\d+/.test(segment)) {
    const [a, b] = nums;
    if (b > a && b - a <= 40 && (b - a) % 2 === 0 && !/\d+\s*-\s*\d+\s*-/.test(segment)) {
      const out: number[] = [];
      for (let n = a; n <= b; n += 2) out.push(n);
      return out;
    }
  }
  return nums;
}

export function analyserAdresse(brute: string | null | undefined, cpSepare?: string | null): AdresseAnalysee | null {
  if (!brute || !brute.trim()) return null;
  const t = normaliser(brute);
  const cpMatch = /\b(\d{5})\b/.exec(t);
  const cp = (cpSepare ?? "").trim() || (cpMatch ? cpMatch[1] : null);
  // la voie s'arrête au code postal (ce qui suit est la commune)
  const avantCp = cpMatch ? t.slice(0, cpMatch.index) : t;
  const tokens = avantCp.split(" ").filter(Boolean);
  const iType = tokens.findIndex((tk) => TYPES_VOIE.has(tk));
  let numeros: number[] = [];
  let voieTokens: string[];
  if (iType >= 0) {
    // numéros : ce qui précède immédiatement le type de voie (« 12-14-16 rue… », « 3 bis rue… »)
    let j = iType - 1;
    const avant: string[] = [];
    while (j >= 0 && (/^[\d-]+$/.test(tokens[j]) || SUFFIXES_NUM.has(tokens[j]) || tokens[j] === "a" || tokens[j] === "au" || tokens[j] === "-")) {
      avant.unshift(tokens[j]);
      j--;
    }
    numeros = lireNumeros(avant.join(" "));
    voieTokens = tokens.slice(iType);
  } else {
    const iNum = tokens.findIndex((tk) => /^\d/.test(tk));
    numeros = iNum >= 0 ? lireNumeros(tokens[iNum]) : [];
    voieTokens = tokens.filter((tk) => !/^\d/.test(tk));
  }
  const voie = voieTokens.filter((tk) => !MOTS_VIDES.has(tk) && !/^\d/.test(tk));
  if (voie.length === 0) return null;
  return { voie, numeros, cp };
}

function contientSuite(haystack: string[], aiguille: string[]): boolean {
  if (aiguille.length === 0 || aiguille.length > haystack.length) return false;
  for (let i = 0; i + aiguille.length <= haystack.length; i++) {
    if (aiguille.every((tk, k) => haystack[i + k] === tk)) return true;
  }
  return false;
}

export interface LieuCopro {
  adresse: string | null | undefined;
  cp?: string | null;
}

/**
 * Occupation présumée d'un copropriétaire d'après son adresse postale : même
 * voie (et même numéro, même code postal quand ils sont connus) que la
 * copropriété ou l'un de ses bâtiments = occupant ; autre adresse = bailleur ;
 * adresse absente ou illisible = inconnu (null).
 */
export function occupationPresumee(
  adresseCoproprietaire: string | null | undefined,
  lieux: LieuCopro[]
): "occupant" | "bailleur" | null {
  const a = analyserAdresse(adresseCoproprietaire);
  if (!a) return null;
  const refs = lieux.map((l) => analyserAdresse(l.adresse, l.cp)).filter((x): x is AdresseAnalysee => !!x);
  if (refs.length === 0) return null;
  const correspond = refs.some((r) => {
    if (!contientSuite(a.voie, r.voie) && !contientSuite(r.voie, a.voie)) return false;
    if (a.cp && r.cp && a.cp !== r.cp) return false;
    if (a.numeros.length && r.numeros.length && !a.numeros.some((n) => r.numeros.includes(n))) return false;
    return true;
  });
  return correspond ? "occupant" : "bailleur";
}

// ============================================================
// Entrées du calcul (sous-ensemble des tables, pour rester pur)
// ============================================================

export interface LotFiche {
  id: string;
  num: string;
  usage: string;
  coproprietaire_id: string | null;
  rattache_a: string | null;
  batiment: { code: string } | null;
  tantiemes: Record<string, number>;
}

export interface CoproprietaireFiche {
  id: string;
  nom: string;
  adresse: string | null;
}

export interface ReponseFiche {
  coproprietaire_id: string;
  statut_occupation: string | null;
  profil_mpr: string | null;
  profil_statut?: string | null;
  profil_verifie_le?: string | null;
  reponses: unknown;
}

export interface CleFiche {
  code: string;
  is_default: boolean;
}

export interface DonneesFiche {
  batiments: { code: string; adresse: string | null }[];
  lots: LotFiche[];
  coproprietaires: CoproprietaireFiche[];
  cles: CleFiche[];
}

export interface CoproFiche {
  name: string;
  adresse: string | null;
  code_postal: string | null;
  city: string | null;
  syndic_name: string | null;
  gestionnaire_nom: string | null;
  gestionnaire_email: string | null;
  energy_before: string | null;
  gain_pct: number | null;
}

/** Clé de référence des tantièmes : clé par défaut, sinon la première (même règle que assemblerDossiers). */
export function cleReference(cles: CleFiche[]): string | null {
  return cles.find((k) => k.is_default)?.code ?? cles[0]?.code ?? null;
}

function tantiemes(l: LotFiche, cle: string | null): number {
  if (!cle) return 0;
  return l.tantiemes[cle] ?? 0;
}

type ReponsesLots = Record<string, Record<string, unknown>>;
function reponsesLots(r: ReponseFiche | undefined): ReponsesLots {
  const j = r?.reponses as { lots?: ReponsesLots } | null | undefined;
  return j?.lots ?? {};
}

// ============================================================
// Informations générales
// ============================================================

export interface InfosGenerales {
  nbBatiments: number;
  nbLots: number;
  tantiemesCcg: number;
  nbLotsHab: number;
  pctLotsHab: number | null;
  tantiemesHab: number;
  pctTantiemesHab: number | null;
  cle: string | null;
}

/** Lot d'habitation principale : habitation, sauf résidence secondaire ou logement vacant déclarés à l'enquête. */
function estHabitationPrincipale(l: LotFiche, lotsRep: ReponsesLots): boolean {
  if (l.usage !== "habitation") return false;
  const r = lotsRep[l.id] ?? {};
  if (r["type-residence"] === "Résidence secondaire") return false;
  if (r["type-occupation"] === "Logement vacant") return false;
  return true;
}

/**
 * Logements déclarés résidence secondaire ou vacants à l'enquête. Liste figée
 * dans l'instantané du rapport d'enquête : le syndic, qui ne lit pas les
 * réponses détaillées, calcule ainsi les mêmes chiffres que l'AMO.
 */
export function lotsNonPrincipaux(d: Pick<DonneesFiche, "lots">, reponses: ReponseFiche[]): string[] {
  const lotsRep: ReponsesLots = {};
  for (const r of reponses) Object.assign(lotsRep, reponsesLots(r));
  return d.lots.filter((l) => l.usage === "habitation" && !estHabitationPrincipale(l, lotsRep)).map((l) => l.id);
}

export function calculerInfosGenerales(d: DonneesFiche, nonPrincipaux: string[] = []): InfosGenerales {
  const cle = cleReference(d.cles);
  const exclus = new Set(nonPrincipaux);
  const principaux = new Set(d.lots.filter((l) => l.usage === "habitation" && !exclus.has(l.id)).map((l) => l.id));
  const tantiemesCcg = d.lots.reduce((s, l) => s + tantiemes(l, cle), 0);
  // les annexes rattachées (cave, garage) suivent leur logement (règle du bulletin)
  const tantiemesHab = d.lots.reduce(
    (s, l) => s + (principaux.has(l.id) || (l.rattache_a && principaux.has(l.rattache_a)) ? tantiemes(l, cle) : 0),
    0
  );
  const nbBatiments = d.batiments.length || (d.lots.length ? 1 : 0);
  return {
    nbBatiments,
    nbLots: d.lots.length,
    tantiemesCcg,
    nbLotsHab: principaux.size,
    pctLotsHab: d.lots.length ? (principaux.size / d.lots.length) * 100 : null,
    tantiemesHab,
    pctTantiemesHab: tantiemesCcg ? (tantiemesHab / tantiemesCcg) * 100 : null,
    cle,
  };
}

// ============================================================
// Occupation
// ============================================================

export type StatutLot = "PO" | "PB" | "vacant" | "inconnu";
export type SourceOccupation = "enquete" | "adresse" | "inconnu";

export interface OccupationCoproprietaire {
  id: string;
  nom: string;
  statut: "PO" | "PB" | "mixte" | "inconnu";
  source: SourceOccupation;
  profil: string | null;
  tantiemesPO: number;
  tantiemesPB: number;
}

export interface OccupationFiche {
  nbProprietaires: number;
  nbPO: number;
  tantiemesPO: number;
  nbPB: number;
  tantiemesPB: number;
  nbModestes: number;
  nbTresModestes: number;
  sources: Record<SourceOccupation, number>;
  /** Propriétaires de logement dont l'occupation reste inconnue (ni enquête ni adresse). */
  inconnus: string[];
  /** Propriétaires à la fois occupants et bailleurs (comptés dans les deux catégories). */
  mixtes: string[];
  detail: OccupationCoproprietaire[];
  /** Statut retenu par lot (habitation et annexes) - colonne du rapport d'enquête. */
  parLot: Record<string, { statut: StatutLot; source: SourceOccupation }>;
}

function statutDepuisEnqueteLot(v: unknown): StatutLot | null {
  if (v === "Propriétaire occupant") return "PO";
  if (v === "Propriétaire bailleur (logement loué)") return "PB";
  if (v === "Logement vacant") return "vacant";
  return null;
}

function statutDepuisColonne(v: string | null | undefined): StatutLot | null {
  const s = (v ?? "").toLowerCase();
  if (s.includes("occupant")) return "PO";
  if (s.includes("bailleur")) return "PB";
  if (s.includes("vacant")) return "vacant";
  return null;
}

/**
 * Occupation par propriétaire de logement. Pour chaque logement : réponse de
 * l'enquête pour ce lot, sinon occupation déclarée du copropriétaire, sinon
 * occupation présumée d'après son adresse postale. Les annexes suivent le
 * logement auquel elles sont rattachées, à défaut le statut du propriétaire.
 * Un logement vacant compte côté bailleurs (propriétaire non occupant).
 */
export function calculerOccupation(copro: Pick<CoproFiche, "adresse" | "code_postal">, d: DonneesFiche, reponses: ReponseFiche[]): OccupationFiche {
  const cle = cleReference(d.cles);
  const repParCp = new Map(reponses.map((r) => [r.coproprietaire_id, r]));
  const lieux: LieuCopro[] = [
    { adresse: copro.adresse, cp: copro.code_postal },
    ...d.batiments.filter((b) => b.adresse).map((b) => ({ adresse: b.adresse, cp: copro.code_postal })),
  ];
  const lotsParCp = new Map<string, LotFiche[]>();
  for (const l of d.lots) {
    if (!l.coproprietaire_id) continue;
    lotsParCp.set(l.coproprietaire_id, [...(lotsParCp.get(l.coproprietaire_id) ?? []), l]);
  }
  const lotParId = new Map(d.lots.map((l) => [l.id, l]));

  const parLot: OccupationFiche["parLot"] = {};
  const detail: OccupationCoproprietaire[] = [];
  const sources: Record<SourceOccupation, number> = { enquete: 0, adresse: 0, inconnu: 0 };

  // 1. logements
  for (const cp of d.coproprietaires) {
    const lots = lotsParCp.get(cp.id) ?? [];
    const logements = lots.filter((l) => l.usage === "habitation");
    if (logements.length === 0) continue;
    const r = repParCp.get(cp.id);
    const lotsRep = reponsesLots(r);
    const colonne = statutDepuisColonne(r?.statut_occupation);
    let presume: StatutLot | null | undefined; // calculée à la demande
    let source: SourceOccupation = "inconnu";
    for (const l of logements) {
      const parEnquete = statutDepuisEnqueteLot(lotsRep[l.id]?.["type-occupation"]);
      if (parEnquete) {
        parLot[l.id] = { statut: parEnquete, source: "enquete" };
        source = "enquete";
      } else if (colonne) {
        parLot[l.id] = { statut: colonne, source: "enquete" };
        source = "enquete";
      } else {
        if (presume === undefined) {
          const p = occupationPresumee(cp.adresse, lieux);
          presume = p === "occupant" ? "PO" : p === "bailleur" ? "PB" : null;
        }
        if (presume) {
          parLot[l.id] = { statut: presume, source: "adresse" };
          if (source !== "enquete") source = "adresse";
        } else {
          parLot[l.id] = { statut: "inconnu", source: "inconnu" };
        }
      }
    }
    const statuts = logements.map((l) => parLot[l.id].statut);
    const po = statuts.includes("PO");
    const pb = statuts.includes("PB") || statuts.includes("vacant");
    detail.push({
      id: cp.id,
      nom: cp.nom,
      statut: po && pb ? "mixte" : po ? "PO" : pb ? "PB" : "inconnu",
      source,
      profil: r?.profil_mpr ?? null,
      tantiemesPO: 0,
      tantiemesPB: 0,
    });
    sources[source] += 1;
  }

  // 2. annexes : logement de rattachement, sinon statut principal du propriétaire
  const detailParId = new Map(detail.map((x) => [x.id, x]));
  for (const l of d.lots) {
    if (l.usage === "habitation" || !l.coproprietaire_id) continue;
    const parent = l.rattache_a ? parLot[l.rattache_a] : undefined;
    if (parent && lotParId.get(l.rattache_a!)?.usage === "habitation") {
      parLot[l.id] = parent;
      continue;
    }
    const prop = detailParId.get(l.coproprietaire_id);
    if (!prop) continue; // propriétaire sans logement (commerce, garage seul) : hors occupation
    const statut: StatutLot = prop.statut === "PO" || prop.statut === "mixte" ? "PO" : prop.statut === "PB" ? "PB" : "inconnu";
    parLot[l.id] = { statut, source: prop.source };
  }

  // 3. tantièmes par propriétaire
  for (const l of d.lots) {
    const s = parLot[l.id];
    if (!s || !l.coproprietaire_id) continue;
    const prop = detailParId.get(l.coproprietaire_id);
    if (!prop) continue;
    if (s.statut === "PO") prop.tantiemesPO += tantiemes(l, cle);
    else if (s.statut === "PB" || s.statut === "vacant") prop.tantiemesPB += tantiemes(l, cle);
  }

  const occupants = detail.filter((x) => x.statut === "PO" || x.statut === "mixte");
  const bailleurs = detail.filter((x) => x.statut === "PB" || x.statut === "mixte");
  // par nom de famille, comme les listes et exports du dossier (feedback syndic 25/09/2026)
  const tries = trierParNomFamille(detail, (x) => x.nom);
  return {
    nbProprietaires: detail.length,
    nbPO: occupants.length,
    tantiemesPO: detail.reduce((s, x) => s + x.tantiemesPO, 0),
    nbPB: bailleurs.length,
    tantiemesPB: detail.reduce((s, x) => s + x.tantiemesPB, 0),
    nbModestes: occupants.filter((x) => x.profil === "Jaune").length,
    nbTresModestes: occupants.filter((x) => x.profil === "Bleu").length,
    sources,
    inconnus: tries.filter((x) => x.statut === "inconnu").map((x) => x.nom),
    mixtes: tries.filter((x) => x.statut === "mixte").map((x) => x.nom),
    detail: tries,
    parLot,
  };
}

/** Instantané de l'occupation écrit dans la fiche à chaque génération du rapport d'enquête sociale. */
export interface InstantaneOccupation {
  nbProprietaires: number;
  nbPO: number;
  tantiemesPO: number;
  nbPB: number;
  tantiemesPB: number;
  nbModestes: number;
  nbTresModestes: number;
  sources: Record<SourceOccupation, number>;
  inconnus: string[];
  mixtes: string[];
  /** Logements déclarés résidence secondaire ou vacants (exclus de l'habitation principale). */
  lotsNonPrincipaux: string[];
  /** Empreinte des chiffres : l'écran AMO signale un rapport dépassé. */
  signature: string;
  genereLe: string;
  genereParNom: string | null;
}

export function signatureOccupation(
  o: Pick<OccupationFiche, "nbProprietaires" | "nbPO" | "tantiemesPO" | "nbPB" | "tantiemesPB" | "nbModestes" | "nbTresModestes">,
  nonPrincipaux: string[]
): string {
  const chiffres = [o.nbProprietaires, o.nbPO, o.tantiemesPO, o.nbPB, o.tantiemesPB, o.nbModestes, o.nbTresModestes].map((n) =>
    String(Math.round(n * 1000) / 1000)
  );
  return [...chiffres, [...nonPrincipaux].sort().join(",")].join("|");
}

export function instantaneOccupation(
  o: OccupationFiche,
  nonPrincipaux: string[],
  genereParNom: string | null,
  genereLe = new Date().toISOString()
): InstantaneOccupation {
  return {
    nbProprietaires: o.nbProprietaires,
    nbPO: o.nbPO,
    tantiemesPO: o.tantiemesPO,
    nbPB: o.nbPB,
    tantiemesPB: o.tantiemesPB,
    nbModestes: o.nbModestes,
    nbTresModestes: o.nbTresModestes,
    sources: o.sources,
    inconnus: o.inconnus,
    mixtes: o.mixtes,
    lotsNonPrincipaux: nonPrincipaux,
    signature: signatureOccupation(o, nonPrincipaux),
    genereLe,
    genereParNom,
  };
}

// ============================================================
// Étiquettes énergétiques par bâtiment (saisie AMO)
// ============================================================

export interface EtiquetteBatiment {
  etiquette?: string | null;
  gain35?: boolean | null;
}

export interface LigneEtiquette {
  /** Code du bâtiment, « - » pour les lots sans bâtiment. */
  code: string;
  logements: number;
  /** Compte comme un bâtiment dans la grille (faux pour le groupe « lots sans bâtiment »). */
  compteBatiment: boolean;
  etiquette: DpeClass | null;
  gain35: boolean;
}

const estEtiquette = (v: unknown): v is DpeClass => typeof v === "string" && (ETIQUETTES as string[]).includes(v);

/** Lignes du tableau des étiquettes : un bâtiment par ligne, valeurs par défaut reprises de la copro. */
export function lignesEtiquettes(
  copro: Pick<CoproFiche, "energy_before" | "gain_pct">,
  d: Pick<DonneesFiche, "batiments" | "lots">,
  saisie: Record<string, EtiquetteBatiment> | null | undefined
): LigneEtiquette[] {
  const defEtiq = estEtiquette(copro.energy_before) ? copro.energy_before : null;
  const defGain = copro.gain_pct != null && copro.gain_pct > 35;
  const hab = d.lots.filter((l) => l.usage === "habitation");
  const codes = d.batiments.map((b) => b.code);
  const ligne = (code: string, logements: number, compteBatiment: boolean): LigneEtiquette => {
    const s = saisie?.[code];
    return {
      code,
      logements,
      compteBatiment,
      etiquette: estEtiquette(s?.etiquette) ? s!.etiquette as DpeClass : defEtiq,
      gain35: s?.gain35 ?? defGain,
    };
  };
  if (codes.length === 0) return hab.length || d.lots.length ? [ligne("-", hab.length, true)] : [];
  // lots sans bâtiment : rattachés au bâtiment unique, sinon groupe à part
  const sansBat = hab.filter((l) => !l.batiment?.code || !codes.includes(l.batiment.code)).length;
  const lignes = codes.map((code, i) =>
    ligne(code, hab.filter((l) => l.batiment?.code === code).length + (codes.length === 1 && i === 0 ? sansBat : 0), true)
  );
  if (codes.length > 1 && sansBat > 0) lignes.push(ligne("-", sansBat, false));
  return lignes;
}

export function agregerEtiquettes(lignes: LigneEtiquette[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of ETIQUETTES) {
    const l = lignes.filter((x) => x.etiquette === e);
    const nbBat = l.filter((x) => x.compteBatiment).length;
    const nbLog = l.reduce((s, x) => s + x.logements, 0);
    out[`etiq_bat_${e}`] = nbBat ? String(nbBat) : "";
    out[`etiq_log_${e}`] = nbLog ? String(nbLog) : "";
  }
  const gain = lignes.filter((x) => x.gain35);
  out.nb_bat_gain35 = String(gain.filter((x) => x.compteBatiment).length);
  out.nb_log_gain35 = String(gain.reduce((s, x) => s + x.logements, 0));
  return out;
}

// ============================================================
// Assemblage des valeurs de la fiche
// ============================================================

/** Contenu de montage_formulaires.data pour le type fiche_etat_anah. */
export interface DonneesFormulaireFiche {
  /** Saisies du syndic et de l'AMO (valeurs brutes, clés de CHAMPS_FICHE). */
  saisies?: Record<string, string>;
  /** Étiquette et gain par code de bâtiment (saisie AMO). */
  etiquettes?: Record<string, EtiquetteBatiment>;
  /** Instantané écrit par le bouton « Générer le rapport d'enquête sociale ». */
  occupation?: InstantaneOccupation | null;
  /** Images des deux premiers encadrés (chemins Storage du bucket copro-files). */
  images?: { aerienne?: string | null; situation?: string | null };
  /** Valeurs finales imprimées (base + saisies + calculs), recalculées à chaque enregistrement. */
  resolu?: Record<string, string>;
  validee_le?: string | null;
  validee_par_nom?: string | null;
}

export function lireDonneesFiche(raw: unknown): DonneesFormulaireFiche {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as DonneesFormulaireFiche) : {};
}

/** Valeurs calculées depuis la base (champs « base » + grille des étiquettes). */
export function valeursBase(
  copro: CoproFiche,
  d: DonneesFiche,
  occupation: InstantaneOccupation | null | undefined,
  etiquettes: Record<string, EtiquetteBatiment> | null | undefined
): Record<string, string> {
  const g = calculerInfosGenerales(d, occupation?.lotsNonPrincipaux ?? []);
  const o = occupation;
  return {
    copro_nom: copro.name,
    copro_voie: copro.adresse ?? "",
    copro_cp: copro.code_postal ?? "",
    copro_commune: copro.city ?? "",
    nb_batiments: fmtEntier(g.nbBatiments),
    nb_lots: fmtEntier(g.nbLots),
    tantiemes_ccg: fmtDecimal(g.tantiemesCcg),
    nb_lots_hab: fmtEntier(g.nbLotsHab),
    pct_lots_hab: fmtPct(g.pctLotsHab),
    tantiemes_hab: fmtDecimal(g.tantiemesHab),
    pct_tantiemes_hab: fmtPct(g.pctTantiemesHab),
    nb_proprietaires: o ? fmtEntier(o.nbProprietaires) : "",
    nb_po: o ? fmtEntier(o.nbPO) : "",
    tantiemes_po: o ? fmtDecimal(o.tantiemesPO) : "",
    nb_pb: o ? fmtEntier(o.nbPB) : "",
    tantiemes_pb: o ? fmtDecimal(o.tantiemesPB) : "",
    nb_po_modestes: o ? fmtEntier(o.nbModestes) : "",
    nb_po_tres_modestes: o ? fmtEntier(o.nbTresModestes) : "",
    ...agregerEtiquettes(lignesEtiquettes(copro, d, etiquettes)),
  };
}

/** Pré-remplissage des champs du syndic : fiche de la copro, autres formulaires du montage, valeurs usuelles. */
export function valeursParDefaut(copro: CoproFiche, autresFormulaires: { type: string; data: unknown }[]): Record<string, string> {
  const autre = (type: string, cle: string): string => {
    const f = autresFormulaires.find((x) => x.type === type);
    const v = f?.data && typeof f.data === "object" ? (f.data as Record<string, unknown>)[cle] : undefined;
    return typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
  };
  const premier = (...vals: string[]) => vals.find((v) => v !== "") ?? "";
  const dateConstruction = autre("demande_pret", "imm_date_construction");
  return {
    immatriculation: premier(autre("demande_pret", "sdc_immatriculation"), autre("coordonnees_cee", "copro_immatriculation")),
    syndic_nom: premier(copro.syndic_name ?? "", autre("demande_pret", "syndic_nom"), autre("fiche_avant_ag", "syndic_nom")),
    syndic_gestionnaire: premier(copro.gestionnaire_nom ?? "", autre("demande_pret", "syndic_interlocuteur"), autre("fiche_avant_ag", "syndic_interlocuteur")),
    syndic_adresse: premier(
      [autre("demande_pret", "syndic_adresse"), [autre("demande_pret", "syndic_cp"), autre("demande_pret", "syndic_ville")].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      [autre("fiche_avant_ag", "syndic_adresse"), autre("fiche_avant_ag", "syndic_ville_cp")].filter(Boolean).join(", "),
      [autre("coordonnees_cee", "syndic_adresse"), autre("coordonnees_cee", "syndic_ville_cp")].filter(Boolean).join(", ")
    ),
    syndic_tel: premier(autre("demande_pret", "syndic_tel"), autre("fiche_avant_ag", "syndic_tel"), autre("coordonnees_cee", "syndic_tel")),
    syndic_email: premier(copro.gestionnaire_email ?? "", autre("demande_pret", "syndic_email"), autre("fiche_avant_ag", "syndic_email")),
    periode_construction: /^\d{4}/.test(dateConstruction) ? dateConstruction.slice(0, 4) : dateConstruction,
    type_syndic: "Professionnel",
    arrete_insalubrite: "NON",
    arrete_peril: "NON",
    arrete_equipements: "NON",
    injonction_plomb: "NON",
  };
}

/** Taux d'impayés N-2 ≥ 8 % du budget N-2 (null si les montants manquent). */
export function tauxImpayes8(v: Record<string, string>): boolean | null {
  const budget = lireNombre(v.budget_n2);
  const impayes = lireNombre(v.impayes_n2);
  if (budget == null || impayes == null || budget <= 0) return null;
  return impayes / budget >= 0.08;
}

/**
 * Valeurs brutes de tous les champs : base (non modifiable) > saisies >
 * valeurs par défaut. Le taux d'impayés est calculé tant qu'il n'est pas saisi.
 */
export function valeursBrutes(base: Record<string, string>, saisies: Record<string, string>, defauts: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...defauts };
  for (const [k, v] of Object.entries(saisies)) if (v != null) out[k] = v;
  for (const c of CHAMPS_FICHE) if (c.qui === "base") out[c.key] = base[c.key] ?? "";
  for (const k of CLES_ETIQUETTES) out[k] = base[k] ?? "";
  if (!(saisies.taux_impayes_8 ?? "").trim()) {
    const t = tauxImpayes8(out);
    out.taux_impayes_8 = t == null ? "" : t ? "OUI" : "NON";
  }
  return out;
}

/** Valeurs finales imprimées sur la fiche (formatées). */
export function resoudre(brutes: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of CHAMPS_FICHE) out[c.key] = c.qui === "base" ? brutes[c.key] ?? "" : valeurAffichee(c, brutes[c.key]);
  for (const k of CLES_ETIQUETTES) out[k] = brutes[k] ?? "";
  return out;
}

/** Champs obligatoires encore vides (libellés) - bloque « Transmettre à Strat Eco ». */
export function champsManquants(brutes: Record<string, string>, qui?: Qui): ChampFiche[] {
  return CHAMPS_FICHE.filter((c) => {
    if (qui && c.qui !== qui) return false;
    const requis = c.obligatoire || (c.obligatoireSi ? c.obligatoireSi(brutes) : false);
    return requis && !(brutes[c.key] ?? "").trim();
  });
}
