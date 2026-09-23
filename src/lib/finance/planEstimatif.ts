// Plan de financement ESTIMATIF à plusieurs scénarios (nomenclature chef de
// projet, classeur « PF estimatif <copro> », cas Le Rodin du 23/09/2026) :
// une seule feuille, une colonne par scénario (D, E, F…), un lot par ligne.
//
// Chaque scénario devient un PlanDefinitifData complet (même moteur que le PF
// définitif) : on lit les formules du classeur pour retrouver ce que les
// valeurs ne disent pas -
//   - « Total travaux HT retenu » = D22+D23+… → lignes retenues (assiette MPR) ;
//   - MOE « =4410*1.2 », « =47500*1.055 » → HT et TVA ; « =D37*1.8/100 »,
//     « =(D35*3/100)*1.2 » → pourcentage des travaux TTC / HT ;
//   - formules MPR études / AMO → lignes MOE éligibles ;
//   - aides « =D36*0.45*0.9 », « =10000+(2500)*D6 », « =1000*D6 »… → modes de calcul.
// Le TTC des travaux est souvent saisi en dur (TVA non détaillée) : la TVA est
// posée à 5,5 % et une ligne « Ajustement de TVA » (montant de TVA saisi) cale
// le TTC sur celui du classeur - arbitrage d'Amir du 23/09/2026.
import { utils, type CellObject, type WorkBook, type WorkSheet } from "xlsx";
import type { AideDef, LigneLot, LigneMoe, LotTravaux, ModeAide, PhaseMoe, PlanDefinitifData } from "./planDefinitif";
import { computePlanDefinitif, estBonusMpr, makeDefaultPlanDefinitif, PHASES_MOE } from "./planDefinitif";
import { BAREME_2026_HORS_IDF } from "./bareme2026";
import { suggestMprCoproPct } from "./compute";
import {
  calibrerAides,
  classifyAide,
  classifyMoe,
  norm,
  parseTva,
  PHASE_PAR_PREFIXE,
  type ControleImport,
} from "./importPlanDefinitif";
import { round2 } from "./round";

export interface ScenarioEstimatif {
  /** Numéro du scénario (1, 2, 3…) - ordre des colonnes du classeur. */
  ordre: number;
  /** Description courte (ligne sous « Scénario N » : « Tourelles de ventilation… »). */
  libelle: string;
  data: PlanDefinitifData;
}

export interface ControleEstimatif extends ControleImport {
  scenario: number;
}

export interface ImportEstimatifResult {
  scenarios: ScenarioEstimatif[];
  avertissements: string[];
  controles: ControleEstimatif[];
}

export const LIBELLE_AJUSTEMENT_TVA = "Ajustement de TVA (TTC travaux du classeur)";
export const TITRE_LOT_PROVISIONS = "Provisions";

/** TVA posée sur les lignes de travaux : le classeur estimatif ne la détaille pas. */
const TVA_TRAVAUX_DEFAUT = 5.5;

/** Nom du plan d'un scénario : « Scénario 2 - Tourelles de ventilation… ». */
export function nomScenario(ordre: number, libelle: string): string {
  return libelle.trim() ? `Scénario ${ordre} - ${libelle.trim()}` : `Scénario ${ordre}`;
}

/** Description d'un scénario depuis le nom de son plan (inverse de nomScenario). */
export function libelleDepuisNom(nom: string): string {
  return nom.replace(/^sc[ée]nario\s*\d+\s*(?:-\s*)?/i, "").trim();
}

/** Lot de provisions (lignes du classeur sans numéro de lot). */
export function estLotProvisions(lot: Pick<LotTravaux, "titre">): boolean {
  return /^provisions?$/i.test(lot.titre.trim());
}

/** Ligne d'ajustement de TVA (aucun HT, un montant de TVA saisi). */
export function estAjustementTva(l: Pick<LigneLot, "montantHt" | "tvaMontant">): boolean {
  return l.montantHt === 0 && l.tvaMontant != null;
}

// ---------- lecture de la feuille ----------

type Val = string | number | boolean | null;

interface Cellule {
  v: Val;
  /** Formule sans « = », sans espaces ni « $ », en majuscules (null si valeur saisie). */
  f: string | null;
}

class Grille {
  readonly nRows: number;
  readonly nCols: number;
  constructor(private ws: WorkSheet) {
    const range = utils.decode_range(ws["!ref"] ?? "A1");
    this.nRows = range.e.r + 1;
    this.nCols = range.e.c + 1;
  }
  cell(r: number, c: number): Cellule {
    if (r < 0 || c < 0) return { v: null, f: null };
    const cell = this.ws[utils.encode_cell({ r, c })] as CellObject | undefined;
    if (!cell) return { v: null, f: null };
    const v = cell.v === undefined ? null : (cell.v as Val);
    const f = cell.f ? cell.f.replace(/^=/, "").replace(/[\s$]/g, "").toUpperCase() : null;
    return { v, f };
  }
  str(r: number, c: number): string {
    const v = this.cell(r, c).v;
    return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  }
  num(r: number, c: number): number | null {
    const v = this.cell(r, c).v;
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
      return isFinite(n) ? n : null;
    }
    return null;
  }
}

/** Numéros de ligne (0-based) référencés par une formule (« D22+D23 », « SUM(D20:D33) »). */
function refsLignes(f: string | null): Set<number> {
  const out = new Set<number>();
  if (!f) return out;
  const re = /([A-Z]{1,3})(\d+)(?::([A-Z]{1,3})(\d+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(f))) {
    // « SUM( » ou un nom de fonction n'a pas de chiffres collés : seules les
    // références de cellule passent
    const debut = parseInt(m[2], 10) - 1;
    const fin = m[4] ? parseInt(m[4], 10) - 1 : debut;
    for (let r = Math.min(debut, fin); r <= Math.max(debut, fin); r++) out.add(r);
  }
  return out;
}

/** Évalue une expression purement numérique (« (10000+13000+3000+6000) ») ; null sinon. */
function evalArith(expr: string): number | null {
  if (!/^[\d.+\-*/()]+$/.test(expr)) return null;
  let i = 0;
  const peek = () => expr[i];
  const nombre = (): number | null => {
    if (peek() === "(") {
      i++;
      const v = somme();
      if (peek() !== ")") return null;
      i++;
      return v;
    }
    if (peek() === "-") {
      i++;
      const v = nombre();
      return v == null ? null : -v;
    }
    const m = /^\d+(?:\.\d+)?/.exec(expr.slice(i));
    if (!m) return null;
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const produit = (): number | null => {
    let v = nombre();
    while (v != null && (peek() === "*" || peek() === "/")) {
      const op = expr[i++];
      const w = nombre();
      if (w == null) return null;
      v = op === "*" ? v * w : v / w;
    }
    return v;
  };
  const somme = (): number | null => {
    let v = produit();
    while (v != null && (peek() === "+" || peek() === "-")) {
      const op = expr[i++];
      const w = produit();
      if (w == null) return null;
      v = op === "+" ? v + w : v - w;
    }
    return v;
  };
  const v = somme();
  return v != null && i === expr.length && isFinite(v) ? v : null;
}

/** Multiplicateur de TVA (1.2 → 20, 1.055 → 5,5). */
function tvaDeCoef(k: number): number {
  return Math.round((k - 1) * 1000) / 10;
}

/**
 * TVA de chaque ligne de travaux d'après la formule du TTC
 * « (E24+E25+E27)*1.055+(E33+E26)*1.2 » (numéro de ligne 0-based → taux) ;
 * null si la formule a une autre forme.
 */
function tvaDepuisFormuleTtc(f: string | null): Map<number, number> | null {
  if (!f) return null;
  const termes: string[] = [];
  let prof = 0;
  let debut = 0;
  for (let i = 0; i < f.length; i++) {
    if (f[i] === "(") prof++;
    else if (f[i] === ")") prof--;
    else if (f[i] === "+" && prof === 0) {
      termes.push(f.slice(debut, i));
      debut = i + 1;
    }
  }
  termes.push(f.slice(debut));
  const out = new Map<number, number>();
  for (const t of termes) {
    const m = /^(?:\(([A-Z]+\d+(?:[+:][A-Z]+\d+)*)\)|(SUM\([A-Z]+\d+(?::[A-Z]+\d+)?\))|([A-Z]+\d+))(?:\*(1(?:\.\d+)?))?$/.exec(t);
    if (!m) return null;
    const tva = m[4] ? tvaDeCoef(parseFloat(m[4])) : 0;
    for (const r of refsLignes(m[1] ?? m[2] ?? m[3])) out.set(r, tva);
  }
  return out.size ? out : null;
}

/**
 * Remplace dans une formule les références à des cellules de paramètre hors
 * colonnes de scénario (« $D$54 » = 0,08, taux de MOE saisi à côté du libellé)
 * par leur valeur : « (E38*D54)*1.2 » → « (E38*0.08)*1.2 ».
 */
function resoudreParametres(f: string | null, g: Grille, colsScenarios: number[]): string | null {
  if (!f) return f;
  return f.replace(/([A-Z]{1,3})(\d+)(?![\d(:])/g, (ref, lettres: string, ligne: string, pos: number) => {
    if (pos > 0 && (f[pos - 1] === ":" || /[A-Z]/.test(f[pos - 1]))) return ref;
    const c = utils.decode_col(lettres);
    if (colsScenarios.includes(c)) return ref;
    const cell = g.cell(parseInt(ligne, 10) - 1, c);
    return typeof cell.v === "number" && !cell.f ? String(cell.v) : ref;
  });
}

const proche = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;
const fmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Structure {
  sheet: string;
  g: Grille;
  /** Ligne « Descriptif des travaux » (en-têtes des scénarios). */
  iHead: number;
  /** Colonne des libellés (B). */
  cB: number;
  /** Colonnes des scénarios (D, E, F…). */
  cols: number[];
  /** Numéros des scénarios lus dans les en-têtes (« Scénario 2 » → 2). */
  ordres: number[];
  /** Colonne des commentaires (après le dernier scénario). */
  cCom: number;
}

function localiser(wb: WorkBook): Structure | null {
  for (const sheet of wb.SheetNames) {
    const g = new Grille(wb.Sheets[sheet]);
    for (let r = 0; r < Math.min(g.nRows, 200); r++) {
      for (let c = 0; c < Math.min(g.nCols, 12); c++) {
        if (norm(g.str(r, c)) !== "descriptif des travaux") continue;
        const cols: number[] = [];
        const ordres: number[] = [];
        for (let c2 = c + 1; c2 < g.nCols; c2++) {
          // « Scénario 2 » (Le Rodin) ou « Scénario V2 » (9 rue de la Gare)
          const m = /^scenario\s*v?(\d+)$/.exec(norm(g.str(r, c2)));
          if (m) {
            cols.push(c2);
            ordres.push(parseInt(m[1], 10));
          }
        }
        if (cols.length) return { sheet, g, iHead: r, cB: c, cols, ordres, cCom: Math.max(...cols) + 1 };
      }
    }
  }
  return null;
}

/**
 * Classeur estimatif : une feuille « Descriptif des travaux » avec au moins
 * deux colonnes « Scénario N », ou une seule si la feuille se dit « estimatif »,
 * et aucun onglet « PF définitif ».
 */
export function estClasseurEstimatif(wb: WorkBook): boolean {
  if (wb.SheetNames.some((n) => norm(n).startsWith("pf definitif"))) return false;
  const s = localiser(wb);
  if (!s) return false;
  if (s.cols.length >= 2) return true;
  const titre = norm(`${s.sheet} ${s.g.str(0, 0)} ${s.g.str(0, 1)}`);
  return titre.includes("estimatif");
}

// ---------- import ----------

export function importPlanEstimatif(wb: WorkBook): ImportEstimatifResult {
  const s = localiser(wb);
  if (!s) throw new Error("Aucune feuille « Descriptif des travaux » avec des colonnes « Scénario N » dans ce classeur.");
  const { g, iHead, cB, cols, ordres, cCom } = s;
  const cA = cB - 1;
  const avert: string[] = [];
  const controles: ControleEstimatif[] = [];

  // « Total travaux €TTC » (9 rue de la Gare) se lit comme « TOTAL TRAVAUX TTC € » (Le Rodin)
  const lib = (r: number) => norm(g.str(r, cB).replace(/€/g, " "));
  const trouver = (test: (l: string) => boolean, from = 0, to = g.nRows) => {
    for (let r = from; r < to; r++) if (test(lib(r))) return r;
    return -1;
  };

  // --- repères ---
  const iTotalHt = trouver((l) => l.startsWith("total travaux ht") && !l.includes("retenu") && !l.includes("energetique"), iHead + 1);
  if (iTotalHt < 0) throw new Error("Ligne « Total travaux HT » introuvable sous le descriptif des travaux.");
  const iRetenu = trouver((l) => l.startsWith("total travaux ht retenu") || l.includes("energetiques et induits"), iTotalHt);
  const iTtc = trouver((l) => l.startsWith("total travaux ttc") && !l.includes("imprevus"), iTotalHt);
  const iMoe = trouver((l) => l.startsWith("moe et frais annexes"), iTotalHt);
  const iTtcImprevus = trouver((l) => l.startsWith("total") && l.includes("ttc") && l.includes("imprevus"), iTotalHt, iMoe >= 0 ? iMoe : g.nRows);
  const iMoeFin = iMoe >= 0 ? trouver((l) => l.startsWith("total moe"), iMoe + 1) : -1;
  const iAides = trouver((l) => l.startsWith("aides mobilisables"), Math.max(iMoeFin, iTotalHt));
  const iAidesFin = iAides >= 0 ? trouver((l) => l.startsWith("total aides"), iAides + 1) : -1;
  const iAidesPubliques = iAidesFin >= 0 ? trouver((l) => l.startsWith("total aides publiques"), iAidesFin) : -1;
  const iOperationAvec = trouver((l) => (l.startsWith("total operation") || l.includes("toutes les phases")) && l.includes("avec imprevus"), iMoeFin >= 0 ? iMoeFin : iTotalHt);
  // « Total opération TTC » seul (9 rue de la Gare) : imprévus compris dans sa formule
  const iOperation =
    iOperationAvec >= 0
      ? iOperationAvec
      : trouver((l) => l.startsWith("total operation") && !l.includes("sans imprevus"), iMoeFin >= 0 ? iMoeFin : iTotalHt);
  const iLogts = trouver((l) => l.includes("logements principaux"), 0, iHead);
  const iEquiv = trouver((l) => l.includes("logt + equivalent") || l.includes("logements + equivalent"), 0, iHead);
  const iSurface = trouver((l) => l.includes("surface habitable"), 0, iHead);
  if (iRetenu < 0) avert.push("Ligne « Total travaux HT retenu » introuvable : aucune ligne n'est retenue dans l'assiette MaPrimeRénov'.");
  if (iMoe < 0 || iMoeFin < 0) avert.push("Section « MOE et frais annexes » introuvable.");
  if (iAides < 0 || iAidesFin < 0) avert.push("Section « Aides mobilisables » introuvable.");

  // Lignes MOE éligibles MPR études / AMO : références des formules de ces aides
  const iMprEtudes = iAides >= 0 ? trouver((l) => l.includes("maprimerenov") && l.includes("etudes"), iAides, iAidesFin) : -1;
  const iMprAmo = iAides >= 0 ? trouver((l) => l.includes("maprimerenov") && /\bamo\b/.test(l), iAides, iAidesFin) : -1;

  // Libellés des scénarios (ligne sous les en-têtes, si ce sont des textes)
  const libelles = cols.map((c) => {
    const v = g.cell(iHead + 1, c).v;
    return typeof v === "string" ? v.trim() : "";
  });

  // Valeur d'une ligne d'infos : colonne du scénario, sinon la première renseignée
  const infoVal = (r: number, k: number): Val => {
    if (r < 0) return null;
    const v = g.cell(r, cols[k]).v;
    if (v != null && v !== "") return v;
    for (let c = cB + 1; c < g.nCols; c++) {
      const w = g.cell(r, c).v;
      if (w != null && w !== "") return w;
    }
    return null;
  };
  const infoNum = (r: number, k: number): number | null => {
    const v = infoVal(r, k);
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
      return isFinite(n) ? n : null;
    }
    return null;
  };
  const infoStr = (r: number, k: number): string => {
    const v = infoVal(r, k);
    return v == null ? "" : String(v).trim();
  };
  const ligneInfo = (...tests: string[]) => trouver((l) => tests.some((t) => l.includes(t)), 0, iHead);

  // Lignes de travaux : « Lot NN » en colonne A, sinon provision
  interface LigneTravaux {
    r: number;
    numero: number | null;
    /** Titre du lot quand la ligne en forme un à elle seule (poste de la colonne A). */
    titre?: string;
    designation: string;
    commentaire?: string;
    tva: number | null;
  }
  const lignesTravaux: LigneTravaux[] = [];
  for (let r = iHead + 1; r < iTotalHt; r++) {
    const designation = g.str(r, cB);
    if (!designation) continue;
    if (!cols.some((c) => g.num(r, c) != null)) continue;
    const mLot = /^lot\s*0?(\d+)/.exec(norm(cA >= 0 ? g.str(r, cA) : ""));
    const com = g.str(r, cCom);
    const tva = parseTva(com);
    const comNet = com.replace(/\s*-?\s*tva\s*(?:de)?\s*[\d.,]+\s*%/i, "").trim();
    lignesTravaux.push({
      r,
      numero: mLot ? parseInt(mLot[1], 10) : null,
      designation,
      commentaire: comNet && norm(comNet) !== norm(designation) ? comNet : undefined,
      tva,
    });
  }
  // Aucun « Lot NN » (9 rue de la Gare : poste en colonne A, « Façades avant+arrière ») :
  // chaque ligne forme un lot, numéroté dans l'ordre du classeur pour que les
  // scénarios restent alignés
  if (!lignesTravaux.some((l) => l.numero != null))
    lignesTravaux.forEach((l, i) => {
      l.numero = i + 1;
      l.titre = (cA >= 0 ? g.str(l.r, cA) : "") || l.designation;
    });
  const numeroProvisions = Math.max(0, ...lignesTravaux.map((l) => l.numero ?? 0)) + 1;
  let tvaParDefaut = false;

  // Groupes (colonne A fusionnée) propagés sur les lignes d'une section
  const groupes = (from: number, to: number): string[] => {
    const out: string[] = [];
    let cur = "";
    for (let r = from; r < to; r++) {
      const a = cA >= 0 ? g.str(r, cA) : "";
      if (a && norm(a) !== "exemples") cur = a;
      out[r] = cur;
    }
    return out;
  };
  const groupesMoe = iMoe >= 0 && iMoeFin > iMoe ? groupes(iMoe + 1, iMoeFin) : [];
  const groupesAides = iAides >= 0 && iAidesFin > iAides ? groupes(iAides + 1, iAidesFin) : [];

  const scenarios: ScenarioEstimatif[] = cols.map((col, k) => {
    const ordre = ordres[k];
    const pre = `Scénario ${ordre}`;
    const avertS: string[] = [];
    const data = makeDefaultPlanDefinitif();

    // --- infos ---
    const iNom = ligneInfo("nom de la copropriete");
    data.infos.nomCopro = infoStr(iNom, k);
    data.infos.adresse = infoStr(ligneInfo("adresse de l'immeuble"), k);
    data.infos.nbLogements = infoNum(iLogts, k) ?? 0;
    data.infos.nbLogementsEquiv = infoNum(iEquiv, k) ?? data.infos.nbLogements;
    data.infos.surfaceHabitable = infoNum(iSurface, k) ?? 0;
    data.infos.nbEtages = infoNum(ligneInfo("nombre de niveaux", "nombre d'etages"), k) ?? 0;
    data.infos.nbEntrees = infoNum(ligneInfo("nombre d'entrees"), k) ?? 0;
    data.infos.typeChauffage = infoStr(ligneInfo("type de chauffage"), k);
    data.infos.cepInitial = infoNum(ligneInfo("energie primaire initial"), k) ?? 0;
    data.infos.cepProjet = infoNum(ligneInfo("energie primaire projet"), k) ?? 0;
    data.infos.dispositifClimaxion = norm(infoStr(ligneInfo("dispositif climaxion"), k)) === "oui";
    // « De E à B » ou « F à D »
    const etiq = /\b([a-g])\s+a\s+([a-g])\b/.exec(norm(infoStr(ligneInfo("etiquette"), k)));
    if (etiq) {
      data.infos.etiquetteInitiale = etiq[1].toUpperCase();
      data.infos.etiquetteProjet = etiq[2].toUpperCase();
    }

    // --- lots ---
    const retenus = iRetenu >= 0 ? refsLignes(g.cell(iRetenu, col).f) : new Set<number>();
    if (iRetenu >= 0 && !g.cell(iRetenu, col).f && (g.num(iRetenu, col) ?? 0) > 0)
      avertS.push("« Total travaux HT retenu » saisi sans formule : lignes retenues (assiette MaPrimeRénov') à cocher dans l'éditeur.");
    // TVA : commentaire « TVA de 10% », sinon formule du TTC, sinon 5,5 % (+ ajustement)
    const tvaTtc = iTtc >= 0 ? tvaDepuisFormuleTtc(g.cell(iTtc, col).f) : null;
    const parLot = new Map<number, LigneTravaux[]>();
    for (const l of lignesTravaux) {
      const m = g.num(l.r, col);
      if (m == null || m === 0) continue;
      const n = l.numero ?? numeroProvisions;
      parLot.set(n, [...(parLot.get(n) ?? []), l]);
    }
    for (const [numero, ls] of [...parLot.entries()].sort((a, b) => a[0] - b[0])) {
      const provisions = ls[0].numero == null;
      // Lot sur plusieurs lignes : « Titre - désignation » (convention de l'export)
      const prefixes = ls.map((l) => /^(.+?)\s+-\s+(.+)$/.exec(l.designation));
      const prefixeCommun =
        !provisions && ls.length > 1 && prefixes.every((p) => p && p[1] === prefixes[0]![1]) ? prefixes[0]![1] : null;
      const titre = provisions ? TITRE_LOT_PROVISIONS : prefixeCommun ?? ls[0].titre ?? ls[0].designation;
      data.lots.push({
        numero,
        titre,
        remisePct: 0,
        lignes: ls.map((l, i) => {
          const tvaPct = l.tva ?? tvaTtc?.get(l.r);
          if (tvaPct == null) tvaParDefaut = true;
          return {
            designation: prefixeCommun ? prefixes[i]![2] : l.designation,
            retenu: retenus.has(l.r),
            montantHt: g.num(l.r, col) ?? 0,
            tvaPct: tvaPct ?? TVA_TRAVAUX_DEFAUT,
            ...(l.commentaire ? { commentaire: l.commentaire } : {}),
          };
        }),
      });
    }

    // Imprévus : libellé « avec imprévus 10 % » / « y compris 10% imprévus »,
    // sinon formule « D37*1.1 », sinon rapport
    if (iTtcImprevus >= 0) {
      const m =
        /imprevus\s*(\d+(?:[.,]\d+)?)\s*%/.exec(lib(iTtcImprevus)) ?? /(\d+(?:[.,]\d+)?)\s*%\s*(?:d')?imprevus/.exec(lib(iTtcImprevus));
      const mf = /\*(\d+(?:\.\d+)?)$/.exec(g.cell(iTtcImprevus, col).f ?? "");
      const ttcImp = g.num(iTtcImprevus, col);
      const ttc = iTtc >= 0 ? g.num(iTtc, col) : null;
      if (m) data.params.imprevusPct = parseFloat(m[1].replace(",", "."));
      else if (mf) data.params.imprevusPct = tvaDeCoef(parseFloat(mf[1]));
      else if (ttcImp != null && ttc) data.params.imprevusPct = Math.round((ttcImp / ttc - 1) * 1000) / 10;
    } else data.params.imprevusPct = 0;

    // TTC des travaux saisi en dur : ligne d'ajustement de TVA
    const ttcFichier = iTtc >= 0 ? g.num(iTtc, col) : null;
    if (ttcFichier != null) {
      // Écart gardé au 1/10 000 € : le TTC recalculé retombe exactement sur celui du classeur
      const ecart = Math.round((ttcFichier - computePlanDefinitif(data).totalTravauxTtc) * 10000) / 10000;
      if (Math.abs(ecart) >= 0.005) {
        let lot = data.lots.find(estLotProvisions);
        if (!lot) {
          lot = { numero: numeroProvisions, titre: TITRE_LOT_PROVISIONS, remisePct: 0, lignes: [] };
          data.lots.push(lot);
        }
        lot.lignes.push({
          designation: LIBELLE_AJUSTEMENT_TVA,
          retenu: false,
          montantHt: 0,
          tvaPct: TVA_TRAVAUX_DEFAUT,
          tvaMontant: ecart,
          commentaire: `TTC travaux saisi dans le classeur : ${fmt(ttcFichier)} €, soit ${fmt(ecart)} € par rapport au HT × TVA des lignes.`,
        });
        avertS.push(
          `TTC travaux du classeur (${fmt(ttcFichier)} €) différent du HT × TVA (${fmt(ttcFichier - ecart)} €) : ligne « ${LIBELLE_AJUSTEMENT_TVA} » de ${fmt(ecart)} € ajoutée au lot ${TITRE_LOT_PROVISIONS}.`
        );
      }
    }
    const r0 = computePlanDefinitif(data);
    const travauxHtFichier = g.num(iTotalHt, col) ?? r0.totalTravauxHt;
    const travauxTtcFichier = ttcFichier ?? r0.totalTravauxTtc;

    // --- MOE et frais annexes ---
    const eligEtudes = iMprEtudes >= 0 ? refsLignes(g.cell(iMprEtudes, col).f) : null;
    const eligAmo = iMprAmo >= 0 ? refsLignes(g.cell(iMprAmo, col).f) : null;
    if (iMoe >= 0 && iMoeFin > iMoe) {
      let phase: PhaseMoe = "etude";
      for (let r = iMoe + 1; r < iMoeFin; r++) {
        const a = norm(groupesMoe[r] ?? "");
        for (const [re, ph] of PHASE_PAR_PREFIXE) if (a && re.test(a)) phase = ph;
        const designation = g.str(r, cB);
        const cell = g.cell(r, col);
        const ttc = g.num(r, col);
        if (!designation || ttc == null) continue;
        const classe = classifyMoe(designation, ttc, travauxHtFichier, travauxTtcFichier, []);
        const lu = lireMoe(resoudreParametres(cell.f, g, cols), { iTotalHt, iTtc });
        let montant = classe.montant;
        let tvaPct = classe.tvaPct;
        if (lu) {
          const ht =
            lu.montant.mode === "forfait"
              ? lu.montant.montantHt
              : lu.montant.mode === "pctTravauxHt"
                ? (r0.totalTravauxHt * lu.montant.taux) / 100
                : (r0.totalTravauxTtc * lu.montant.taux) / 100;
          if (proche(ht * (1 + lu.tvaPct / 100), ttc, 0.01)) {
            montant = lu.montant;
            tvaPct = lu.tvaPct;
          } else avertS.push(`MOE « ${designation} » : formule non reconnue, montant TTC du classeur repris.`);
        } else if (cell.f && evalArith(cell.f) == null) avertS.push(`MOE « ${designation} » : formule « =${cell.f} » non reconnue, TVA ${String(tvaPct).replace(".", ",")} % supposée.`);
        // Montant saisi (dommage ouvrage « =9056 » de L'Hippocrate) : forfait à la
        // TVA du libellé, pas un % des travaux qui suivrait leur montant
        else if (montant.mode !== "forfait") montant = { mode: "forfait", montantHt: ttc / (1 + tvaPct / 100) };
        const com = g.str(r, cCom);
        const ligne: LigneMoe = {
          designation,
          phase,
          montant,
          tvaPct,
          eligibleMprEtudes: eligEtudes && eligEtudes.size ? eligEtudes.has(r) : classe.eligibleMprEtudes,
          eligibleMprAmo: eligAmo && eligAmo.size ? eligAmo.has(r) : classe.eligibleMprAmo,
          ...(com && norm(com) !== norm(designation) ? { commentaire: com } : {}),
        };
        data.moe.push(ligne);
      }
    }

    // --- aides mobilisables ---
    const valeursAides: (number | null)[] = [];
    /** MPR études à prorata énergétique saisi en dur : recalculé par le logiciel (arbitrage d'Amir du 23/09/2026). */
    const etudesFigees: { i: number; prorata: number; valeur: number }[] = [];
    /** MPR travaux saisie « plafond × logements » relue en % de l'assiette plafonnée (repli si le montant diffère). */
    const mprAuPlafond: { i: number; repli: ModeAide; valeur: number }[] = [];
    if (iAides >= 0 && iAidesFin > iAides) {
      data.aides = [];
      const ids = new Set<string>();
      for (let r = iAides + 1; r < iAidesFin; r++) {
        const libelle = g.str(r, cB);
        if (!libelle || /^scenario\s*v?\d+$/.test(norm(libelle))) continue;
        const groupe = groupesAides[r] ?? "";
        const cell = g.cell(r, col);
        const valeur = g.num(r, col);
        const base = classifyAide(groupe, libelle, valeur);
        let id = base.id || `aide-${r}`;
        for (let n = 2; ids.has(id); n++) id = `${base.id}-${n}`;
        ids.add(id);
        const publique = !(norm(groupe) === "cee" || /\bcee\b/.test(norm(libelle)));
        const f = resoudreParametres(cell.f, g, cols);
        let lu = valeur == null ? null : lireAide(f, { iRetenu, iTotalHt, iLogts, iEquiv, iSurface, iMoe, iMoeFin, libelle });
        const n = norm(libelle);
        const mpr = n.includes("maprimerenov") && !n.includes("bonus") && !n.includes("fragile");
        // « …/1.055)*0.3*0.9*0.825 » : taux, coefficient de prudence, prorata figé
        const figee = mpr && n.includes("etudes") && valeur != null ? /\)\*([\d.]+)\*([\d.]+)\*(0\.\d+)$/.exec(f ?? "") : null;
        if (figee && refsLignes(f).size) {
          lu = { mode: "pctEtudes", taux: round2(parseFloat(figee[1]) * 100), coef: parseFloat(figee[2]) };
          etudesFigees.push({ i: data.aides.length, prorata: parseFloat(figee[3]), valeur: valeur! });
        }
        // « =7500*E5 » : 30 % de l'assiette plafonnée à 25 000 € HT/logement
        if (mpr && n.includes("travaux") && lu?.mode === "parLogement" && !lu.surEquivalent) {
          const taux = (lu.montant / data.params.plafondTravauxParLogement) * 100;
          if (Number.isInteger(Math.round(taux * 1e6) / 5e5)) {
            mprAuPlafond.push({ i: data.aides.length, repli: lu, valeur: valeur! });
            lu = { mode: "pctAssietteTravaux", taux: Math.round(taux * 1e6) / 1e6, coef: 1 };
          }
        }
        const aide: AideDef = {
          id,
          groupe,
          libelle,
          calcul: lu ?? base.calcul,
          publique,
        };
        const com = g.str(r, cCom);
        if (com) aide.commentaire = com;
        data.aides.push(aide);
        // le calibrage ne doit pas rabattre la MPR études figée sur le montant saisi
        valeursAides.push(figee ? null : valeur);
      }
    }

    // --- paramètres de financement ---
    // Libellés en tête de ligne : « Coût au tantième après déduction des aides,
    // fonds travaux et études déjà appelées » ne doit pas être pris pour eux
    const iFonds = trouver((l) => /^(montant du )?fonds (de )?travaux/.test(l), iAidesFin >= 0 ? iAidesFin : iTotalHt);
    const iDejaAppele = trouver((l) => /^(montants?|fonds) deja appele/.test(l), iAidesFin >= 0 ? iAidesFin : iTotalHt);
    const fonds = iFonds >= 0 ? g.num(iFonds, col) ?? 0 : 0;
    const dejaAppele = iDejaAppele >= 0 ? g.num(iDejaAppele, col) ?? 0 : 0;
    // « Montant déjà appelé » (études) cumulé au fonds travaux : même déduction
    // du reste à charge que le classeur (arbitrage d'Amir du 23/09/2026)
    data.params.fondsTravaux = round2(fonds + dejaAppele);
    const comFonds = iFonds >= 0 ? g.str(iFonds, cCom) : "";
    if (dejaAppele) {
      const comAppele = g.str(iDejaAppele, cCom);
      data.params.commentaireFondsTravaux =
        `Fonds travaux disponible ${fmt(fonds)} €${comFonds ? ` (${comFonds})` : ""}` +
        ` + montant déjà appelé ${fmt(dejaAppele)} €${comAppele ? ` (${comAppele})` : ""}`;
    } else if (comFonds) data.params.commentaireFondsTravaux = comFonds;

    // « Coût au taniéme avant aides » (faute de frappe du classeur 9 rue de la Gare)
    const iTant = trouver((l) => /^cout au tan\w*me avant/.test(l));
    if (iTant >= 0) data.params.totalTantiemes = g.num(iTant, cB + 1) ?? 10000;
    const T = data.params.totalTantiemes || 10000;
    const exemples = new Set<number>();
    let pretAvance = false;
    let mensualites = false;
    let mensualitesSansAssurance = false;
    let appelsFonds = false;
    for (let r = iAidesFin >= 0 ? iAidesFin : iTotalHt; r < g.nRows; r++) {
      const l = lib(r);
      if (/^quote part (?:totale )?pour/.test(l)) {
        const t = g.num(r, cB + 1);
        if (t != null && t > 0 && t < T) exemples.add(t);
      }
      const mDuree = /(?:pendant|duree de)\s*(\d+)\s*ans/.exec(l);
      if (mDuree) data.params.dureeEcoPtzAns = parseInt(mDuree[1], 10);
      if (l.includes("remboursement mensuel") || l.includes("mensualite")) {
        mensualites = true;
        const f = g.cell(r, col).f ?? "";
        const m = /\/(\d+)\*(\d+(?:\.\d+)?)$/.exec(f);
        const sansAssurance = m ? null : /\/(\d+)$/.exec(f);
        if (m) {
          if (!mDuree) data.params.dureeEcoPtzAns = parseInt(m[1], 10) / 12;
          data.params.coefAssurance = parseFloat(m[2]);
        } else if (sansAssurance && !mensualitesSansAssurance) {
          // « =E84/1000*D105/240 » : le logiciel garde l'assurance ×1,03 des PF
          // Strat Eco (arbitrage d'Amir du 23/09/2026)
          if (!mDuree) data.params.dureeEcoPtzAns = parseInt(sansAssurance[1], 10) / 12;
          mensualitesSansAssurance = true;
          avertS.push(
            `Mensualités du classeur sans assurance ; le logiciel applique le coefficient d'assurance ${String(data.params.coefAssurance).replace(".", ",")}.`
          );
        }
      }
      if (l.includes("pret avance")) {
        pretAvance = true;
        const m = /\*(0\.\d+)[*/]/.exec(g.cell(r, col).f ?? "");
        if (m) data.params.tauxPretAvancePct = Math.round(parseFloat(m[1]) * 100000) / 1000;
      }
      if (l.includes("appels de fonds")) appelsFonds = true;
    }
    if (exemples.size) data.params.tantiemesExemples = [...exemples].sort((a, b) => a - b);
    data.variantes = {
      collectif: pretAvance || (!mensualites && !appelsFonds),
      collectifSansAvance: !pretAvance && mensualites && !appelsFonds,
      individuel: appelsFonds,
    };

    // --- aides : formule lue vs montant du classeur (repli : calibrage, puis montant saisi) ---
    for (const p of mprAuPlafond) {
      if (!proche(computePlanDefinitif(data).aides[p.i].montant ?? 0, p.valeur, 1)) data.aides[p.i].calcul = p.repli;
    }
    const avertAides: string[] = [];
    calibrerAides(data, valeursAides, avertAides);
    avertS.push(...avertAides);
    if (etudesFigees.length) {
      const rE = computePlanDefinitif(data);
      const prorata = rE.totalTravauxHt > 0 ? rE.assietteMprTravaux / rE.totalTravauxHt : 0;
      for (const e of etudesFigees) {
        const m = rE.aides[e.i].montant ?? 0;
        if (proche(m, e.valeur, 1)) continue;
        const dec = (x: number, n: number) => x.toLocaleString("fr-FR", { maximumFractionDigits: n });
        avertS.push(
          `Aide « ${data.aides[e.i].libelle} » : prorata énergétique saisi en dur dans le classeur (${dec(e.prorata, 3)}) ; le logiciel le recalcule (assiette MPR / travaux HT = ${dec(prorata, 4)}), soit ${fmt(m)} € au lieu de ${fmt(e.valeur)} €.`
        );
      }
    }

    // Palier MaPrimeRénov' Copro du gain énergétique (30 % de 35 à 50 %, 45 %
    // au-delà) : L'Hippocrate applique 45 % à des scénarios à 39-40 % de gain
    const { cepInitial, cepProjet } = data.infos;
    if (cepInitial > 0 && cepProjet > 0) {
      const gain = 100 - (100 * cepProjet) / cepInitial;
      const palier = suggestMprCoproPct(gain, BAREME_2026_HORS_IDF);
      const pct = (x: number) => x.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
      for (const a of data.aides) {
        if (a.calcul.mode !== "pctAssietteTravaux" || estBonusMpr(a) || a.calcul.taux === palier) continue;
        avertS.push(
          palier == null
            ? `Aide « ${a.libelle} » à ${pct(a.calcul.taux)} % alors que le gain énergétique (${pct(gain)} %) est sous le seuil de 35 % de MaPrimeRénov' Copro.`
            : `Aide « ${a.libelle} » à ${pct(a.calcul.taux)} % alors que le gain énergétique (${pct(gain)} %) donne le palier à ${palier} % : taux à vérifier.`
        );
      }
    }

    // --- contrôles ---
    const r = computePlanDefinitif(data);
    const ctrl = (libelle: string, ligne: number, recalcule: number) => {
      if (ligne < 0) return;
      const fichier = g.num(ligne, col);
      if (fichier == null) return;
      const ok = Math.abs(fichier - recalcule) <= 1;
      controles.push({ scenario: ordre, libelle, fichier, recalcule, ok });
      if (!ok) avertS.push(`Écart sur « ${libelle} » : fichier ${fmt(fichier)} € / recalcul ${fmt(recalcule)} €.`);
    };
    ctrl("Total travaux HT", iTotalHt, r.totalTravauxHt);
    ctrl("Travaux retenus (assiette MPR)", iRetenu, r.assietteMprTravaux);
    ctrl("Total travaux TTC", iTtc, r.totalTravauxTtc);
    ctrl("Total travaux TTC avec imprévus", iTtcImprevus, r.totalTravauxTtcImprevus);
    ctrl("Total MOE et annexes TTC", iMoeFin, r.totalMoeTtc);
    ctrl("Total opération TTC avec imprévus", iOperation, r.totalOperationTtc);
    ctrl("Total aides", iAidesFin, r.totalAides);
    ctrl("Total aides publiques", iAidesPubliques, r.totalAidesPubliques);
    ctrl("Reste à charge définitif collectif", trouver((l) => l.startsWith("reste a charge definitif")), r.resteACharge);
    // 9 rue de la Gare : « Résultat (Opération - Aides) » puis « Reste à financer » (+ CEE)
    ctrl("Résultat (opération - aides)", trouver((l) => l.startsWith("resultat (operation")), r.resteACharge);
    ctrl("Reste à financer", trouver((l) => l === "reste a financer", iAidesFin >= 0 ? iAidesFin : iTotalHt), r.collectif.resteAFinancer);

    avert.push(...avertS.map((a) => `${pre} : ${a}`));
    return { ordre, libelle: libelles[k], data };
  });

  if (tvaParDefaut)
    avert.unshift(
      `TVA non détaillée dans le classeur : ${String(TVA_TRAVAUX_DEFAUT).replace(".", ",")} % appliqué aux lignes de travaux, le TTC du classeur est conservé par une ligne d'ajustement si besoin.`
    );
  return { scenarios, avertissements: avert, controles };
}

/** Ligne MOE : « =4410*1.2 », « =(10000+13000)*1.2 », « =D37*1.8/100 », « =(D35*3/100)*1.2 ». */
function lireMoe(
  f: string | null,
  rep: { iTotalHt: number; iTtc: number }
): Pick<LigneMoe, "montant" | "tvaPct"> | null {
  if (!f) return null;
  const mForfait = /^(.+)\*(1(?:\.\d+)?)$/.exec(f);
  if (mForfait) {
    const ht = evalArith(mForfait[1]);
    if (ht != null) return { montant: { mode: "forfait", montantHt: ht }, tvaPct: tvaDeCoef(parseFloat(mForfait[2])) };
  }
  const mPct = /^\(?[A-Z]+(\d+)\*(\d+(?:\.\d+)?)(\/100)?\)?(?:\*(1(?:\.\d+)?))?$/.exec(f);
  if (mPct) {
    const ligne = parseInt(mPct[1], 10) - 1;
    // 0.018 × 100 = 1.7999999999999998 : arrondi au millionième
    const taux = mPct[3] ? parseFloat(mPct[2]) : Math.round(parseFloat(mPct[2]) * 1e8) / 1e6;
    const tvaPct = mPct[4] ? tvaDeCoef(parseFloat(mPct[4])) : 0;
    if (ligne === rep.iTtc) return { montant: { mode: "pctTravauxTtc", taux }, tvaPct };
    if (ligne === rep.iTotalHt) return { montant: { mode: "pctTravauxHt", taux }, tvaPct };
  }
  const ht = evalArith(f);
  if (ht != null) return null; // montant saisi : TVA d'après le libellé (classifyMoe)
  return null;
}

/** Aide : « =D36*0.45*0.9 », « =10000+(2500)*D6 », « =1000*D6 », formules MPR études / AMO… */
function lireAide(
  f: string | null,
  rep: {
    iRetenu: number;
    iTotalHt: number;
    iLogts: number;
    iEquiv: number;
    iSurface: number;
    iMoe: number;
    iMoeFin: number;
    libelle: string;
  }
): ModeAide | null {
  if (!f) return null;
  const n = norm(rep.libelle);
  const nombre = evalArith(f);
  if (nombre != null) return { mode: "manuel", montant: nombre };
  const surLigne = (l: number) => l === rep.iLogts || l === rep.iEquiv;

  // Assiette travaux (éventuellement plafonnée) × taux × coef
  const mAssiette = /^(?:MIN\()?[A-Z]+(\d+)(?:,[\d.]+\*[A-Z]+\d+\))?\*([\d.]+)(?:\*([\d.]+))?$/.exec(f);
  if (mAssiette) {
    const ligne = parseInt(mAssiette[1], 10) - 1;
    const a = parseFloat(mAssiette[2]);
    const b = mAssiette[3] ? parseFloat(mAssiette[3]) : 1;
    if (ligne === rep.iRetenu) return { mode: "pctAssietteTravaux", taux: round2(a * 100), coef: b };
    if (ligne === rep.iSurface) return { mode: "parM2Shab", tauxEurM2: a, coef: b };
    if (surLigne(ligne)) return { mode: "parLogement", montant: a * b, surEquivalent: ligne === rep.iEquiv };
  }
  // montant × logements
  const mParLogt = /^\(?([\d.]+)\)?\*[A-Z]+(\d+)$/.exec(f);
  if (mParLogt) {
    const ligne = parseInt(mParLogt[2], 10) - 1;
    const montant = parseFloat(mParLogt[1]);
    if (surLigne(ligne)) return { mode: "parLogement", montant, surEquivalent: ligne === rep.iEquiv };
    if (ligne === rep.iSurface) return { mode: "parM2Shab", tauxEurM2: montant, coef: 1 };
  }
  // forfait + montant × logements
  const mForfait = /^\(?([\d.]+)\)?\+\(?([\d.]+)\)?\*[A-Z]+(\d+)$/.exec(f);
  if (mForfait) {
    const ligne = parseInt(mForfait[3], 10) - 1;
    if (surLigne(ligne))
      return {
        mode: "forfaitPlusParLogement",
        base: parseFloat(mForfait[1]),
        parLogement: parseFloat(mForfait[2]),
        surEquivalent: ligne === rep.iEquiv,
      };
  }
  // Somme de lignes MOE (HT) × taux [× coef × prorata énergétique]
  const refs = [...refsLignes(f)];
  const refsMoe = refs.filter((l) => l > rep.iMoe && l < rep.iMoeFin);
  if (rep.iMoe >= 0 && refsMoe.length) {
    const mEtudes = /\)\*([\d.]+)\*([\d.]+)\*\(/.exec(f) ?? /\)\*([\d.]+)\*\(/.exec(f);
    if (mEtudes || n.includes("etudes")) {
      const m = mEtudes ?? /\)\*([\d.]+)(?:\*([\d.]+))?$/.exec(f);
      if (m) return { mode: "pctEtudes", taux: round2(parseFloat(m[1]) * 100), coef: m[2] ? parseFloat(m[2]) : 1 };
    }
    const mAmo = /\)\*([\d.]+)$/.exec(f);
    if (mAmo && /\bamo\b/.test(n)) return { mode: "pctAmo", taux: round2(parseFloat(mAmo[1]) * 100) };
  }
  return null;
}

// ---------- alignement des scénarios (comparatif et export) ----------

export interface LigneTravauxAlignee {
  key: string;
  lotNumero: number;
  lotTitre: string;
  designation: string;
  provisions: boolean;
  /** Montant HT par scénario (null : ligne absente du scénario). */
  montants: (number | null)[];
  retenus: (boolean | null)[];
  tva: (number | null)[];
  commentaire?: string;
}

/** Lignes de travaux alignées d'un scénario à l'autre (lot + désignation), hors ajustements de TVA. */
export function alignerTravaux(scenarios: Pick<ScenarioEstimatif, "data">[]): LigneTravauxAlignee[] {
  const rows = new Map<string, LigneTravauxAlignee>();
  scenarios.forEach((s, k) => {
    for (const lot of s.data.lots) {
      const vus = new Map<string, number>();
      for (const l of lot.lignes) {
        if (estAjustementTva(l)) continue;
        const base = `${lot.numero}|${norm(l.designation)}`;
        const occ = (vus.get(base) ?? 0) + 1;
        vus.set(base, occ);
        const key = `${base}|${occ}`;
        let row = rows.get(key);
        if (!row) {
          row = {
            key,
            lotNumero: lot.numero,
            lotTitre: lot.titre,
            designation: l.designation,
            provisions: estLotProvisions(lot),
            montants: scenarios.map(() => null),
            retenus: scenarios.map(() => null),
            tva: scenarios.map(() => null),
            commentaire: l.commentaire,
          };
          rows.set(key, row);
        }
        row.montants[k] = (row.montants[k] ?? 0) + l.montantHt * (1 - lot.remisePct / 100);
        row.retenus[k] = l.retenu;
        row.tva[k] = l.tvaPct;
        row.commentaire = row.commentaire ?? l.commentaire;
      }
    }
  });
  return [...rows.values()].sort((a, b) => Number(a.provisions) - Number(b.provisions) || a.lotNumero - b.lotNumero);
}

export interface LigneMoeAlignee {
  key: string;
  phase: PhaseMoe;
  designation: string;
  /** Index de la ligne dans data.moe de chaque scénario (null : absente). */
  index: (number | null)[];
  commentaire?: string;
}

export function alignerMoe(scenarios: Pick<ScenarioEstimatif, "data">[]): LigneMoeAlignee[] {
  const rows = new Map<string, LigneMoeAlignee>();
  const ordre: string[] = [];
  scenarios.forEach((s, k) => {
    const vus = new Map<string, number>();
    let precedente: string | null = null;
    s.data.moe.forEach((l, i) => {
      const base = `${l.phase}|${norm(l.designation)}`;
      const occ = (vus.get(base) ?? 0) + 1;
      vus.set(base, occ);
      const key = `${base}|${occ}`;
      let row = rows.get(key);
      if (!row) {
        row = { key, phase: l.phase, designation: l.designation, index: scenarios.map(() => null), commentaire: l.commentaire };
        rows.set(key, row);
        // ligne propre à ce scénario : à sa place, après la ligne qui la précède
        // (test d'étanchéité avant le dommage ouvrage, L'Hippocrate)
        ordre.splice(precedente == null ? 0 : ordre.indexOf(precedente) + 1, 0, key);
      }
      row.index[k] = i;
      precedente = key;
    });
  });
  const rang = (p: PhaseMoe) => PHASES_MOE.findIndex((x) => x.id === p);
  return ordre.map((k) => rows.get(k)!).sort((a, b) => rang(a.phase) - rang(b.phase));
}

export interface AideAlignee {
  key: string;
  groupe: string;
  libelle: string;
  index: (number | null)[];
  commentaire?: string;
}

export function alignerAides(scenarios: Pick<ScenarioEstimatif, "data">[]): AideAlignee[] {
  const rows = new Map<string, AideAlignee>();
  const ordre: string[] = [];
  scenarios.forEach((s, k) => {
    s.data.aides.forEach((a, i) => {
      const key = a.id || norm(a.libelle);
      let row = rows.get(key);
      if (!row) {
        row = { key, groupe: a.groupe, libelle: a.libelle, index: scenarios.map(() => null), commentaire: a.commentaire };
        rows.set(key, row);
        ordre.push(key);
      }
      row.index[k] = i;
    });
  });
  return ordre.map((k) => rows.get(k)!);
}

// ---------- export (même mise en page que le classeur des chefs de projet) ----------

const colL = (c: number) => utils.encode_col(c);

/**
 * Classeur « PF estimatif <copro> » : une colonne par scénario, avec les
 * formules du classeur des chefs de projet (lignes retenues, MOE en HT × TVA,
 * aides) - relu à l'identique par importPlanEstimatif.
 */
export function exportPlanEstimatif(scenarios: ScenarioEstimatif[]): WorkBook {
  const S = [...scenarios].sort((a, b) => a.ordre - b.ordre);
  const R = S.map((s) => computePlanDefinitif(s.data));
  const d0 = S[0]?.data ?? makeDefaultPlanDefinitif();
  const cD = 3;
  const cols = S.map((_, k) => cD + k);
  const cCom = cD + S.length;
  const ws: WorkSheet = {};
  let row = 0; // 0-based
  let maxCol = cCom;
  const set = (r: number, c: number, v: Val, f?: string) => {
    if (v == null && !f) return;
    const cell: CellObject =
      typeof v === "number" ? { t: "n", v } : typeof v === "boolean" ? { t: "b", v } : { t: "s", v: v ?? "" };
    if (f) {
      cell.f = f;
      if (v == null) {
        cell.t = "n";
        cell.v = 0;
      }
    }
    ws[utils.encode_cell({ r, c })] = cell;
    maxCol = Math.max(maxCol, c);
  };
  const ref = (c: number, r: number) => `${colL(c)}${r + 1}`;
  const abs = (c: number, r: number) => `$${colL(c)}$${r + 1}`;
  /** Une ligne : libellé (B), valeurs/formules par scénario, commentaire. */
  const ligne = (
    b: string | null,
    parScenario: ((k: number, r: number) => { v: Val; f?: string } | null) | null,
    com: string | null = null,
    a: string | null = null,
    cVal: Val = null
  ): number => {
    const r = row++;
    if (a) set(r, 0, a);
    if (b) set(r, 1, b);
    if (cVal != null) set(r, 2, cVal);
    if (parScenario)
      S.forEach((_, k) => {
        const x = parScenario(k, r);
        if (x) set(r, cols[k], x.v, x.f);
      });
    if (com) set(r, cCom, com);
    return r;
  };
  const vide = (n = 1) => {
    row += n;
  };
  const pareil = <T,>(vals: T[]) => vals.every((v) => v === vals[0]);

  // ---- en-tête et informations ----
  set(row++, 0, `PLAN DE FINANCEMENT ESTIMATIF ${d0.infos.nomCopro}`.trim());
  vide();
  ligne("Nom de la copropriété :", (k) => (k === 0 ? { v: d0.infos.nomCopro } : null));
  ligne("Adresse de l'immeuble :", (k) => (k === 0 ? { v: d0.infos.adresse } : null));
  const rLogts = ligne("Nombre de logements principaux :", (k) => ({ v: S[k].data.infos.nbLogements }));
  const rEquiv = ligne(
    "Nombre de logt + équivalent :",
    (k) => ({ v: S[k].data.infos.nbLogementsEquiv }),
    "La surface des locaux tertiaires est divisée par 75 pour avoir l'équivalent logement"
  );
  const rSurface = ligne(
    "Surface habitable ou équivalent :",
    (k) => ({ v: S[k].data.infos.surfaceHabitable }),
    "La surface chauffée des locaux tertiaires doit être additionnée à la surface habitable"
  );
  ligne("Nombre de niveaux y compris sous-sol :", (k) => ({ v: S[k].data.infos.nbEtages }));
  ligne("Nombre d'entrées :", (k) => ({ v: S[k].data.infos.nbEntrees }));
  ligne("Type de chauffage :", (k) => ({ v: S[k].data.infos.typeChauffage }));
  const rCepI = ligne("Consommation énergie primaire initial :", (k) => ({ v: S[k].data.infos.cepInitial }));
  const rCepP = ligne("Consommation énergie primaire projet :", (k) => ({ v: S[k].data.infos.cepProjet }));
  ligne(
    "Performance du scénario :",
    (k) => ({ v: R[k].performancePct, f: `100-100*${ref(cols[k], rCepP)}/${ref(cols[k], rCepI)}` }),
    "% d'économie d'énergie"
  );
  ligne("Dispositif CLIMAXION :", (k) => ({ v: S[k].data.infos.dispositifClimaxion ? "Oui" : "Non" }));
  ligne("Passage d'étiquette :", (k) => {
    const i = S[k].data.infos;
    return i.etiquetteInitiale || i.etiquetteProjet ? { v: `De ${i.etiquetteInitiale} à ${i.etiquetteProjet}` } : null;
  });
  vide(2);

  // ---- descriptif des travaux ----
  ligne("Descriptif des travaux", (k) => ({ v: `Scénario ${S[k].ordre}` }));
  ligne(null, (k) => (S[k].libelle ? { v: S[k].libelle } : null));
  const travaux = alignerTravaux(S);
  const lotsMulti = new Set<number>();
  for (const t of travaux) {
    const n = travaux.filter((x) => x.lotNumero === t.lotNumero && !x.provisions).length;
    if (n > 1) lotsMulti.add(t.lotNumero);
  }
  const rTravaux: number[] = [];
  const retenusParScenario: number[][] = S.map(() => []);
  for (const t of travaux) {
    const b = !t.provisions && lotsMulti.has(t.lotNumero) ? `${t.lotTitre} - ${t.designation}` : t.designation;
    const tvas = t.tva.filter((x): x is number => x != null);
    const tva = tvas.length && tvas[0] !== TVA_TRAVAUX_DEFAUT ? tvas[0] : null;
    const com = [t.commentaire ?? b, tva != null ? `TVA de ${String(tva).replace(".", ",")}%` : null].filter(Boolean).join(" - ");
    const r = ligne(
      b,
      (k) => (t.montants[k] != null ? { v: t.montants[k] } : null),
      com,
      t.provisions ? null : `Lot ${String(t.lotNumero).padStart(2, "0")}`
    );
    rTravaux.push(r);
    t.retenus.forEach((x, k) => x && retenusParScenario[k].push(r));
  }
  const r1 = rTravaux[0] ?? row;
  const rN = rTravaux[rTravaux.length - 1] ?? row;
  const rHt = ligne("Total travaux HT €", (k) => ({ v: R[k].totalTravauxHt, f: rTravaux.length ? `SUM(${ref(cols[k], r1)}:${ref(cols[k], rN)})` : undefined }));
  const plafonne = R.map((x) => x.travauxRetenusHt > x.assietteMprTravaux + 0.005);
  const rRetenu = ligne(
    "Total travaux HT retenu",
    (k) => {
      const refs = retenusParScenario[k].map((r) => ref(cols[k], r)).join("+");
      return { v: R[k].travauxRetenusHt, f: refs || undefined };
    },
    "Pour le calcul MPR"
  );
  // TTC en formule par taux « (D20+D22)*1.055+(D19)*1.1 », relue à l'import
  // (sinon les lignes à 5,5 % reviennent en « TVA non détaillée ») ; valeur
  // seule si une remise ou un ajustement de TVA ne s'y laisse pas écrire
  const formuleTtc = (k: number): string | undefined => {
    if (S[k].data.lots.some((l) => l.remisePct !== 0 || l.lignes.some(estAjustementTva))) return undefined;
    const parTaux = new Map<number, string[]>();
    travaux.forEach((t, i) => {
      const tva = t.tva[k];
      if (t.montants[k] == null || tva == null) return;
      parTaux.set(tva, [...(parTaux.get(tva) ?? []), ref(cols[k], rTravaux[i])]);
    });
    if (!parTaux.size) return undefined;
    return [...parTaux.entries()]
      .map(([tva, refs]) => `(${refs.join("+")})${tva ? `*${Math.round((1 + tva / 100) * 10000) / 10000}` : ""}`)
      .join("+");
  };
  const rTtc = ligne("TOTAL TRAVAUX TTC €", (k) => ({ v: R[k].totalTravauxTtc, f: formuleTtc(k) }));
  const imprevus = S.map((s) => s.data.params.imprevusPct);
  const rTtcImp = ligne(
    `Total TTC € avec imprévus ${pareil(imprevus) ? String(imprevus[0]).replace(".", ",") : "N"} %`,
    (k) => ({ v: R[k].totalTravauxTtcImprevus, f: `${ref(cols[k], rTtc)}*${1 + S[k].data.params.imprevusPct / 100}` })
  );
  vide(3);

  // ---- MOE et frais annexes ----
  ligne("MOE et frais annexes", (k) => ({ v: `Scénario ${S[k].ordre}` }));
  const moe = alignerMoe(S);
  const rMoe: number[] = [];
  const etudesParScenario: { r: number; k: number }[][] = S.map(() => []);
  const amoParScenario: { r: number; k: number }[][] = S.map(() => []);
  let phasePrec: PhaseMoe | null = null;
  for (const m of moe) {
    const a = m.phase !== phasePrec ? (PHASES_MOE.find((p) => p.id === m.phase)?.label ?? "").replace(/\.\s*/, ".") : null;
    phasePrec = m.phase;
    const r = ligne(
      m.designation,
      (k) => {
        const i = m.index[k];
        if (i == null) return null;
        const l = S[k].data.moe[i];
        const coef = 1 + l.tvaPct / 100;
        const suffixe = l.tvaPct ? `*${coef}` : "";
        const v = R[k].moe[i].montantTtc;
        switch (l.montant.mode) {
          case "forfait":
            return { v, f: `${round2(l.montant.montantHt)}${suffixe}` };
          case "pctTravauxHt":
            return { v, f: `(${ref(cols[k], rHt)}*${l.montant.taux}/100)${suffixe}` };
          case "pctTravauxTtc":
            return { v, f: `${ref(cols[k], rTtc)}*${l.montant.taux}/100${suffixe}` };
        }
      },
      m.commentaire ?? null,
      a
    );
    rMoe.push(r);
    m.index.forEach((i, k) => {
      if (i == null) return;
      const l = S[k].data.moe[i];
      if (l.eligibleMprEtudes) etudesParScenario[k].push({ r, k: 1 + l.tvaPct / 100 });
      if (l.eligibleMprAmo) amoParScenario[k].push({ r, k: 1 + l.tvaPct / 100 });
    });
  }
  const rMoeTotal = ligne("Total MOE et annexes TTC", (k) => ({
    v: R[k].totalMoeTtc,
    f: rMoe.length ? `SUM(${ref(cols[k], rMoe[0])}:${ref(cols[k], rMoe[rMoe.length - 1])})` : undefined,
  }));
  ligne("Total opération TTC sans imprévus", (k) => ({
    v: R[k].totalMoeTtc + R[k].totalTravauxTtc,
    f: `${ref(cols[k], rMoeTotal)}+${ref(cols[k], rTtc)}`,
  }));
  const rOp = ligne("Total opération TTC avec imprévus", (k) => ({
    v: R[k].totalOperationTtc,
    f: `${ref(cols[k], rMoeTotal)}+${ref(cols[k], rTtcImp)}`,
  }));
  vide(3);

  // ---- aides mobilisables ----
  ligne("Aides mobilisables", (k) => ({ v: `Scénario ${S[k].ordre}` }), "Commentaires");
  /** Somme HT de lignes MOE regroupées par coefficient de TVA : (D44+D50)/1.2+D54/1.055. */
  const sommeHt = (k: number, lignes: { r: number; k: number }[]) => {
    const parCoef = new Map<number, number[]>();
    for (const l of lignes) parCoef.set(l.k, [...(parCoef.get(l.k) ?? []), l.r]);
    return [...parCoef.entries()]
      .map(([coef, rs]) => {
        const somme = rs.map((r) => ref(cols[k], r)).join("+");
        return coef === 1 ? `(${somme})` : `(${somme})/${coef}`;
      })
      .join("+");
  };
  const aides = alignerAides(S);
  const rAides: number[] = [];
  const rAidesPubliques: number[][] = S.map(() => []);
  let groupePrec = "";
  for (const al of aides) {
    const a = al.groupe !== groupePrec ? al.groupe : null;
    groupePrec = al.groupe;
    const r = ligne(
      al.libelle,
      (k) => {
        const i = al.index[k];
        if (i == null) return null;
        const def = S[k].data.aides[i];
        const v = R[k].aides[i].montant;
        const c = def.calcul;
        const assiette = plafonne[k]
          ? `MIN(${ref(cols[k], rRetenu)},${S[k].data.params.plafondTravauxParLogement}*${ref(cols[k], rLogts)})`
          : ref(cols[k], rRetenu);
        const logts = (eq: boolean) => ref(cols[k], eq ? rEquiv : rLogts);
        switch (c.mode) {
          case "info":
            return null;
          case "manuel":
            return { v: c.montant };
          case "pctAssietteTravaux":
            return { v, f: `${assiette}*${c.taux / 100}*${c.coef}` };
          case "parM2Shab":
            return { v, f: `${ref(cols[k], rSurface)}*${c.tauxEurM2}*${c.coef}` };
          case "pctEtudes": {
            const lignes = etudesParScenario[k];
            if (!lignes.length) return { v };
            return { v, f: `(${sommeHt(k, lignes)})*${c.taux / 100}*${c.coef}*(${assiette}/${ref(cols[k], rHt)})` };
          }
          case "pctAmo": {
            const lignes = amoParScenario[k];
            if (!lignes.length) return { v };
            return { v, f: `(${sommeHt(k, lignes)})*${c.taux / 100}` };
          }
          case "forfaitPlusParLogement":
            return { v, f: `${c.base}+(${c.parLogement})*${logts(c.surEquivalent)}` };
          case "parLogement":
            return { v, f: `${c.montant}*${logts(c.surEquivalent)}` };
        }
      },
      al.commentaire ?? null,
      a
    );
    rAides.push(r);
    al.index.forEach((i, k) => {
      if (i != null && S[k].data.aides[i].publique) rAidesPubliques[k].push(r);
    });
  }
  const avecCee = R.some((x) => x.primeCee !== 0);
  const rAidesTotal = ligne("Total Aides NET", (k) => ({
    v: R[k].totalAides,
    f: rAides.length ? `SUM(${ref(cols[k], rAides[0])}:${ref(cols[k], rAides[rAides.length - 1])})` : undefined,
  }));
  const rPub = avecCee
    ? ligne("Total aides publiques", (k) => ({
        v: R[k].totalAidesPubliques,
        f: rAidesPubliques[k].map((r) => ref(cols[k], r)).join("+") || undefined,
      }))
    : rAidesTotal;
  vide(2);

  // ---- indicateurs ----
  ligne(null, null, "Commentaires");
  ligne(
    "Taux de couverture %",
    (k) => ({ v: R[k].tauxCouverture, f: `${ref(cols[k], rAidesTotal)}/${ref(cols[k], rOp)}` }),
    "Pourcentage du montant de l'opération TTC couvert par les aides"
  );
  const coms = S.map((s) => s.data.params.commentaireFondsTravaux ?? "");
  const rFonds = ligne(
    "Fonds travaux disponible",
    (k) => ({ v: S[k].data.params.fondsTravaux }),
    coms.find(Boolean) ?? null
  );
  const rRac = ligne("Reste à charge définitif collectif", (k) => ({
    v: R[k].resteACharge,
    f: `${ref(cols[k], rOp)}-(${ref(cols[k], rAidesTotal)}+${ref(cols[k], rFonds)})`,
  }));
  const rRaf = avecCee
    ? ligne(
        "Reste à financer",
        (k) => ({
          v: R[k].collectif.resteAFinancer,
          f: `${ref(cols[k], rRac)}+(${ref(cols[k], rAidesTotal)}-${ref(cols[k], rPub)})`,
        }),
        "Reste à charge + prime CEE (versée en fin de travaux)"
      )
    : rRac;
  vide(2);
  const T = d0.params.totalTantiemes || 10000;
  const rCta = ligne("Coût au tantième avant aides", (k, r) => ({ v: R[k].coutTantiemeAvant, f: `${ref(cols[k], rOp)}/${abs(2, r)}` }), null, null, T);
  const rCtp = ligne(
    "Coût au tantième après déduction des aides, fonds travaux et études déjà appelées",
    (k, r) => ({ v: R[k].collectif.coutTantiemeApres, f: `${ref(cols[k], rRaf)}/${abs(2, r)}` }),
    null,
    null,
    T
  );
  vide(2);
  const ex = d0.params.tantiemesExemples;
  const blocExemples = (
    titre: string,
    libelle: (t: number) => string,
    valeur: (k: number, i: number, r: number) => { v: Val; f?: string },
    com: string | null = null
  ) => {
    if (!ex.length) return;
    ligne(titre, null);
    ex.forEach((t, i) => {
      ligne(libelle(t), (k, r) => valeur(k, i, r), i === 0 ? com : null, i === 0 ? "Exemples" : null, t);
    });
    vide(2);
  };
  blocExemples(
    "Quote part selon tantièmes (hors aides)",
    (t) => `Quote part pour ${t} tantièmes`,
    (k, i, r) => ({ v: R[k].collectif.exemples[i]?.quotePartAvant ?? null, f: `${ref(cols[k], rCta)}*${abs(2, r)}` })
  );
  const rRestes: number[] = [];
  blocExemples(
    avecCee ? "Reste à financer selon tantièmes (après déduction des aides publiques)" : "Reste à charge selon tantièmes (après déduction des aides)",
    (t) => `${avecCee ? "Reste à financer" : "Reste à charge"} pour ${t} tantièmes`,
    (k, i, r) => {
      if (k === 0) rRestes[i] = r;
      return { v: R[k].collectif.exemples[i]?.resteAFinancer ?? null, f: `${ref(cols[k], rCtp)}*${abs(2, r)}` };
    }
  );
  const duree = d0.params.dureeEcoPtzAns;
  const mois = Math.round(duree * 12);
  blocExemples(
    `Remboursement mensuel moyen par lot pendant ${duree} ans`,
    (t) => `Remboursement mensuel moyen par lot pendant ${duree} ans : (${t}/${T})`,
    (k, i) => ({
      v: R[k].collectif.exemples[i]?.mensualiteEcoPtz ?? null,
      f: rRestes[i] != null ? `${ref(cols[k], rRestes[i])}/${mois}*${S[k].data.params.coefAssurance}` : undefined,
    }),
    `Exemple pris pour un prêt ECO PTZ sur ${duree} ans avec un prêt avance de subvention`
  );
  blocExemples(
    "Montant des subventions publiques",
    (t) => `Montant des subventions publiques pour (${t}/${T})`,
    (k, i, r) => ({
      v: R[k].collectif.exemples[i]?.subventionsPubliques ?? null,
      f: `${ref(cols[k], rPub)}*${abs(2, r)}/${abs(2, rCta)}`,
    })
  );
  if (S.some((s) => s.data.variantes.collectif))
    blocExemples(
      "Coût du prêt avance de subventions publiques",
      (t) => `Coût du prêt avance de subventions publiques pour (${t}/${T})`,
      (k, i, r) => ({
        v: R[k].collectif.exemples[i]?.coutPretAvance ?? null,
        f: `${ref(cols[k], rPub)}*${S[k].data.params.tauxPretAvancePct / 100}*${abs(2, r)}/${abs(2, rCta)}`,
      }),
      "Prêt avance de subvention : à rembourser en une fois à la fin des travaux"
    );
  if (avecCee)
    blocExemples(
      "Prime CEE",
      (t) => `Prime CEE pour (${t}/${T})`,
      (k, i) => ({ v: R[k].collectif.exemples[i]?.primeCee ?? null }),
      "La prime CEE est attribuée à la fin des travaux"
    );

  // ---- garde-fous et mentions ----
  R[0]?.gardeFous.forEach((gf, j) => {
    ligne(gf.libelle, (k) => ({ v: R[k].gardeFous[j]?.valeur ?? null }), null, j === 0 ? "Garde-fous" : null);
  });
  vide();
  ligne("Les valeurs sont présentées à titre indicatif. Ce document n'a aucune valeur contractuelle.", null);
  ligne("Document confidentiel à l'attention des copropriétaires.", null);
  ligne("Ne pas jeter sur la voie publique", null);

  ws["!ref"] = utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: maxCol } });
  ws["!cols"] = [{ wch: 14 }, { wch: 62 }, { wch: 9 }, ...S.map(() => ({ wch: 18 })), { wch: 70 }];
  const wb = utils.book_new();
  const nom = `PF estimatif ${d0.infos.nomCopro}`.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
  utils.book_append_sheet(wb, ws, nom || "PF estimatif");
  return wb;
}
