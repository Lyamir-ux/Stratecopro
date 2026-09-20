// Import du portefeuille d'un gestionnaire dans la branche Suivi PPT (0077) :
// logique pure, testée à part de l'écran. Le tableau attendu (Excel ou CSV) a
// six colonnes : nom de la copropriété, adresse, commune, nombre de logements,
// « copropriété de plus de 15 ans ? » (oui / non), « PPPT présenté ? » (oui / non).
// Les en-têtes sont reconnus avec souplesse ; l'utilisateur peut corriger la
// correspondance colonne → champ avant l'aperçu. Le serveur (RPC
// ppt_importer_portefeuille) crée ou complète les copropriétés puis les
// rapproche de la base AMO ; « normaliserCle » reproduit ppt_normaliser pour
// annoncer dans l'aperçu quelles lignes vont compléter une fiche déjà suivie.
import type { WorkBook } from "xlsx";
import { read, utils } from "xlsx";

export type ChampImport = "nom" | "adresse" | "commune" | "nb_logements" | "plus_de_15_ans" | "pppt_presente" | "ignorer";

export interface ColonneImport {
  id: Exclude<ChampImport, "ignorer">;
  label: string;
  /** Intitulé de la colonne dans le modèle téléchargeable. */
  entete: string;
  obligatoire: boolean;
  motifs: RegExp[];
}

export const COLONNES_IMPORT: ColonneImport[] = [
  { id: "nom", label: "Nom de la copropriété", entete: "Nom de la copropriété", obligatoire: true, motifs: [/^nom/, /copropriete$/, /^residence/, /^immeuble/, /^designation/, /^libelle/] },
  { id: "adresse", label: "Adresse", entete: "Adresse", obligatoire: false, motifs: [/adresse/, /^rue/, /^voie/] },
  { id: "commune", label: "Commune", entete: "Commune", obligatoire: false, motifs: [/commune/, /^ville/, /^localite/, /code postal/, /^cp$/] },
  { id: "nb_logements", label: "Nombre de logements", entete: "Nombre de logements", obligatoire: false, motifs: [/logement/, /^nb lots/, /^lots/, /^nombre de lots/] },
  { id: "plus_de_15_ans", label: "Plus de 15 ans ?", entete: "Copropriété de plus de 15 ans ? (oui / non)", obligatoire: false, motifs: [/15 ans/, /plus de 15/, /anciennete/, /^\+ ?15/] },
  { id: "pppt_presente", label: "PPPT présenté ?", entete: "PPPT présenté ? (oui / non)", obligatoire: false, motifs: [/pppt/, /ppt presente/, /plan pluriannuel/, /^ppt/] },
];

export const LABEL_CHAMP: Record<ChampImport, string> = {
  ...Object.fromEntries(COLONNES_IMPORT.map((c) => [c.id, c.label])),
  ignorer: "Ignorer cette colonne",
} as Record<ChampImport, string>;

/** Minuscules, sans accents, ponctuation → espace, espaces de bord retirés. */
export function normaliserEntete(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

/**
 * Clé de rapprochement, miroir de la fonction SQL ppt_normaliser : minuscules,
 * accents retirés, tout ce qui n'est pas lettre ou chiffre devient un espace,
 * préfixe « résidence » / « copropriété » / « copro » / « immeuble » ignoré.
 */
export function normaliserCle(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(residence|copropriete|copro|immeuble) /, "");
}

/** Devine le champ de chaque colonne d'après son en-tête ; un champ n'est attribué qu'une fois. */
export function devinerColonnes(entetes: unknown[]): ChampImport[] {
  const pris = new Set<ChampImport>();
  return entetes.map((h) => {
    const n = normaliserEntete(h);
    if (!n) return "ignorer";
    for (const col of COLONNES_IMPORT) {
      if (pris.has(col.id)) continue;
      if (col.motifs.some((m) => m.test(n))) {
        pris.add(col.id);
        return col.id;
      }
    }
    return "ignorer";
  });
}

/** Le fichier ressemble à un portefeuille : le nom est reconnu et au moins deux autres colonnes. */
export function estPortefeuille(entetes: unknown[]): boolean {
  const m = devinerColonnes(entetes);
  return m.includes("nom") && m.filter((c) => c !== "ignorer").length >= 3;
}

const OUI = new Set(["oui", "o", "yes", "y", "x", "vrai", "true", "1", "ok"]);
const NON = new Set(["non", "n", "no", "faux", "false", "0", "-"]);

/**
 * Lit une réponse oui / non : `null` si la cellule est vide, `undefined` si
 * elle n'est pas comprise (signalée à l'utilisateur).
 */
export function lireOuiNon(v: unknown): boolean | null | undefined {
  if (v == null) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : undefined;
  const brut = String(v).trim();
  if (brut === "-") return false;
  const s = normaliserEntete(brut);
  if (!s) return null;
  if (OUI.has(s)) return true;
  if (NON.has(s)) return false;
  return undefined;
}

/** Nombre entier positif : `null` si vide, `undefined` si non compris. */
export function lireEntier(v: unknown): number | null | undefined {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : undefined;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  if (!/^\d+(\.0+)?$/.test(s)) return undefined;
  return Number.parseInt(s, 10);
}

/** « 67000 Strasbourg » → code postal + commune ; « Strasbourg » → commune seule. */
export function separerCodePostal(v: unknown): { code_postal: string | null; commune: string | null } {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  if (!s) return { code_postal: null, commune: null };
  const devant = /^(\d{5})\s*[-,]?\s*(.*)$/.exec(s);
  if (devant) return { code_postal: devant[1], commune: devant[2].trim() || null };
  const derriere = /^(.*?)\s*[-,(]?\s*(\d{5})\)?$/.exec(s);
  if (derriere) return { code_postal: derriere[2], commune: derriere[1].trim() || null };
  return { code_postal: null, commune: s };
}

/** Adresse « 12 rue des Lilas, 67000 Strasbourg » → adresse sans la ville + code postal + commune. */
export function separerAdresse(v: unknown): { adresse: string | null; code_postal: string | null; commune: string | null } {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  if (!s) return { adresse: null, code_postal: null, commune: null };
  const m = /^(.*?)[,\s]+(\d{5})\s+([^\d,]+)$/.exec(s);
  if (m && m[1].trim()) return { adresse: m[1].trim().replace(/,$/, ""), code_postal: m[2], commune: m[3].trim() };
  return { adresse: s, code_postal: null, commune: null };
}

export interface LigneImport {
  /** Numéro de ligne dans le fichier (1 = première ligne de données sous l'en-tête). */
  ligne: number;
  nom: string;
  adresse: string | null;
  code_postal: string | null;
  commune: string | null;
  nb_logements: number | null;
  plus_de_15_ans: boolean | null;
  pppt_presente: boolean | null;
}

export interface ErreurImport {
  ligne: number;
  message: string;
}

export interface LectureImport {
  lignes: LigneImport[];
  /** Lignes écartées (sans nom) ou cellules non comprises (la ligne est gardée, la cellule vidée). */
  erreurs: ErreurImport[];
  /** Noms en double dans le fichier : seule la première occurrence est gardée. */
  doublons: string[];
}

type Cellule = string | number | boolean | null;

/** Transforme la grille (sans l'en-tête) en lignes prêtes pour la RPC, selon la correspondance des colonnes. */
export function lireLignes(grille: Cellule[][], correspondance: ChampImport[]): LectureImport {
  const idx = (c: ChampImport) => correspondance.indexOf(c);
  const iNom = idx("nom");
  const iAdr = idx("adresse");
  const iCom = idx("commune");
  const iLog = idx("nb_logements");
  const i15 = idx("plus_de_15_ans");
  const iPppt = idx("pppt_presente");
  const lignes: LigneImport[] = [];
  const erreurs: ErreurImport[] = [];
  const doublons: string[] = [];
  const vues = new Set<string>();

  grille.forEach((row, k) => {
    const numero = k + 1;
    if (!row || row.every((v) => v == null || String(v).trim() === "")) return;
    const nom = iNom >= 0 ? String(row[iNom] ?? "").trim().replace(/\s+/g, " ") : "";
    if (!nom) {
      erreurs.push({ ligne: numero, message: "nom de la copropriété manquant, ligne écartée" });
      return;
    }
    const cle = normaliserCle(nom);
    if (vues.has(cle)) {
      doublons.push(nom);
      return;
    }
    vues.add(cle);

    let adresse: string | null = null;
    let code_postal: string | null = null;
    let commune: string | null = null;
    if (iAdr >= 0) {
      const a = separerAdresse(row[iAdr]);
      adresse = a.adresse;
      code_postal = a.code_postal;
      commune = a.commune;
    }
    if (iCom >= 0) {
      const c = separerCodePostal(row[iCom]);
      if (c.commune) commune = c.commune;
      if (c.code_postal) code_postal = c.code_postal;
    }

    let nb_logements: number | null = null;
    if (iLog >= 0) {
      const n = lireEntier(row[iLog]);
      if (n === undefined) erreurs.push({ ligne: numero, message: `nombre de logements « ${row[iLog]} » non compris, laissé vide` });
      else nb_logements = n;
    }
    let plus_de_15_ans: boolean | null = null;
    if (i15 >= 0) {
      const b = lireOuiNon(row[i15]);
      if (b === undefined) erreurs.push({ ligne: numero, message: `« ${row[i15]} » n'est ni oui ni non (plus de 15 ans), laissé vide` });
      else plus_de_15_ans = b;
    }
    let pppt_presente: boolean | null = null;
    if (iPppt >= 0) {
      const b = lireOuiNon(row[iPppt]);
      if (b === undefined) erreurs.push({ ligne: numero, message: `« ${row[iPppt]} » n'est ni oui ni non (PPPT présenté), laissé vide` });
      else pppt_presente = b;
    }

    lignes.push({ ligne: numero, nom, adresse, code_postal, commune, nb_logements, plus_de_15_ans, pppt_presente });
  });

  return { lignes, erreurs, doublons };
}

export interface ClasseurLu {
  entetes: string[];
  grille: Cellule[][];
  feuille: string;
}

/** Lit la première feuille non vide d'un classeur Excel ou d'un CSV (SheetJS). */
export function lireClasseur(contenu: ArrayBuffer | Uint8Array): ClasseurLu | null {
  const wb: WorkBook = read(contenu, { type: "array", cellDates: false });
  for (const nom of wb.SheetNames) {
    const rows = utils.sheet_to_json<Cellule[]>(wb.Sheets[nom], { header: 1, defval: null, raw: true, blankrows: false });
    // première ligne comportant au moins deux cellules texte : l'en-tête
    const iEntete = rows.findIndex((r) => r.filter((v) => typeof v === "string" && v.trim()).length >= 2);
    if (iEntete < 0) continue;
    const entetes = rows[iEntete].map((h) => String(h ?? "").trim());
    return { entetes, grille: rows.slice(iEntete + 1), feuille: nom };
  }
  return null;
}

/** Grille du modèle proposé au téléchargement : en-tête + deux lignes d'exemple. */
export function modeleImport(): (string | number)[][] {
  return [
    COLONNES_IMPORT.map((c) => c.entete),
    ["Résidence Les Tilleuls", "12 rue des Tilleuls", "67000 Strasbourg", 48, "oui", "non"],
    ["Le Parc", "3 allée du Parc", "67400 Illkirch-Graffenstaden", 22, "oui", "oui"],
  ];
}

/** Résumé d'aperçu : lignes qui vont compléter une fiche déjà suivie (même clé de nom). */
export function classerLignes<T extends { nom: string }>(lignes: LigneImport[], connues: T[]): { nouvelles: LigneImport[]; existantes: { ligne: LigneImport; copro: T }[] } {
  const parCle = new Map<string, T>();
  for (const c of connues) {
    const k = normaliserCle(c.nom);
    if (k && !parCle.has(k)) parCle.set(k, c);
  }
  const nouvelles: LigneImport[] = [];
  const existantes: { ligne: LigneImport; copro: T }[] = [];
  for (const l of lignes) {
    const c = parCle.get(normaliserCle(l.nom));
    if (c) existantes.push({ ligne: l, copro: c });
    else nouvelles.push(l);
  }
  return { nouvelles, existantes };
}

/** Statut à afficher dans le listing pour une copropriété du portefeuille. */
export type StatutParc = "en_reno" | "pppt_a_presenter" | "pppt_presente" | "inconnu";

export function statutParc(c: { plus_de_15_ans: boolean | null; pppt_presente: boolean | null; stats: { reno_phase?: string | null } | null }): StatutParc {
  if (c.stats?.reno_phase) return "en_reno";
  if (c.pppt_presente === true) return "pppt_presente";
  if (c.plus_de_15_ans === true && c.pppt_presente === false) return "pppt_a_presenter";
  return "inconnu";
}
