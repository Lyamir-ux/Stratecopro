// Import d'un classeur « Plan de financement définitif » (nomenclature chef de projet).
// Reconnaît les onglets « PF définitif … » (collectif / individuel) et « Lot NN … »
// (lignes de devis avec colonne « Retenu »), reconstruit un PlanDefinitifData éditable,
// puis contrôle les totaux recalculés contre les valeurs du fichier.
import type { WorkBook } from "xlsx";
import { utils } from "xlsx";
import type {
  AideDef,
  LigneLot,
  LigneMoe,
  LotTravaux,
  PhaseMoe,
  PlanDefinitifData,
} from "./planDefinitif";
import { computePlanDefinitif, makeDefaultPlanDefinitif } from "./planDefinitif";

export interface ControleImport {
  libelle: string;
  fichier: number;
  recalcule: number;
  ok: boolean;
}

export interface ImportPlanResult {
  data: PlanDefinitifData;
  /** Points à vérifier signalés pendant la reconnaissance de la nomenclature. */
  avertissements: string[];
  /** Totaux du fichier vs recalcul du moteur (écart toléré : 1 €). */
  controles: ControleImport[];
}

type Grid = (string | number | boolean | null)[][];

/** Normalise un libellé : minuscules, sans accents, espaces simples, sans « : ». */
export function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "oe")
    .toLowerCase()
    .replace(/[:\s]+/g, " ")
    .trim();
}

function num(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    return isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

/** Taux de TVA depuis un commentaire « TVA de 10% » / « TVA de 5,5% ». */
function parseTva(comment: string): number | null {
  const m = /tva\s*(?:de)?\s*([\d]+(?:[.,]\d+)?)\s*%/i.exec(comment);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

function toGrid(wb: WorkBook, name: string): Grid {
  return utils.sheet_to_json<(string | number | boolean | null)[]>(wb.Sheets[name], {
    header: 1,
    defval: null,
    raw: true,
  });
}

/**
 * Vue d'une grille alignée sur la colonne des libellés (SheetJS décale les
 * feuilles dont les premières colonnes sont vides : la colonne « B » du
 * classeur n'est pas toujours l'indice 1).
 */
interface Feuille {
  grid: Grid;
  /** Indice de la colonne des libellés (colonne B du classeur). */
  cB: number;
  groupe(i: number): string; // colonne A
  libelle(i: number): string; // colonne B
  tantieme(i: number): number | null; // colonne C
  valeur(i: number): number | null; // colonne D
  valeurBrute(i: number): string | number | boolean | null;
  commentaire(i: number): string; // colonne E
  /** Ligne dont le libellé contient `includes` (normalisé), à partir de `from`. */
  findRow(includes: string, from?: number): number;
  /** Valeur (col D) de la première ligne dont le libellé contient `includes`. */
  valD(includes: string): number | null;
}

function makeFeuille(grid: Grid, cB: number): Feuille {
  const f: Feuille = {
    grid,
    cB,
    groupe: (i) => (cB > 0 ? str(grid[i]?.[cB - 1]) : ""),
    libelle: (i) => str(grid[i]?.[cB]),
    tantieme: (i) => num(grid[i]?.[cB + 1]),
    valeur: (i) => num(grid[i]?.[cB + 2]),
    valeurBrute: (i) => grid[i]?.[cB + 2] ?? null,
    commentaire: (i) => str(grid[i]?.[cB + 3]),
    findRow: (includes, from = 0) => {
      for (let i = from; i < grid.length; i++) {
        if (norm(grid[i]?.[cB]).includes(includes)) return i;
      }
      return -1;
    },
    valD: (includes) => {
      const i = f.findRow(includes);
      return i >= 0 ? f.valeur(i) : null;
    },
  };
  return f;
}

/** Localise la colonne des libellés en cherchant une cellule repère. */
function colonneLibelles(grid: Grid, repere: (s: string) => boolean): number {
  for (const row of grid) {
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      if (repere(norm(row[c]))) return c;
    }
  }
  return -1;
}

// ---------- Onglets « Lot NN … » ----------

function parseLotSheet(grid: Grid, sheetName: string, avert: string[]): { lot: LotTravaux; cached: { ht: number | null; retenu: number | null; ttc: number | null } } | null {
  const cB = colonneLibelles(grid, (s) => /^lot\s*\d+/.test(s));
  if (cB < 0) return null;
  const f = makeFeuille(grid, cB);
  const titre1 = f.libelle(0);
  const mNum = /lot\s*0?(\d+)/i.exec(titre1) ?? /lot\s*0?(\d+)/i.exec(sheetName);
  if (!mNum) return null;
  const numero = parseInt(mNum[1], 10);
  // « Lot 03 : Façade échafaudage (ERDAL) » → titre + entreprise
  const mTitre = /lot\s*\d+\s*:\s*([^(]+?)\s*(?:\(([^)]+)\))?\s*$/i.exec(titre1);
  const titre = mTitre ? mTitre[1].trim() : sheetName.replace(/^lot\s*\d+\s*/i, "").trim();
  const entreprise = mTitre?.[2]?.trim();

  const lignes: LigneLot[] = [];
  let remisePct = 0;
  let iTotal = -1;
  for (let i = 1; i < grid.length; i++) {
    if (norm(f.libelle(i)) === "total ht") {
      iTotal = i;
      break;
    }
    const designation = f.libelle(i);
    const montant = f.valeur(i);
    if (!designation || montant == null || /€\s*ht/i.test(designation)) continue;
    const retenuRaw = norm(grid[i]?.[cB + 1]);
    if (retenuRaw !== "oui" && retenuRaw !== "non" && retenuRaw !== "") continue; // en-têtes
    const tva = parseTva(f.commentaire(i));
    if (tva == null) avert.push(`Lot ${numero} « ${designation} » : TVA absente, 10 % appliqué par défaut.`);
    lignes.push({
      designation,
      groupe: f.groupe(i) || undefined,
      retenu: retenuRaw === "oui",
      montantHt: montant,
      tvaPct: tva ?? 10,
      commentaire: undefined,
    });
  }
  // Remise et totaux mémorisés après le « Total HT » (« Remise 2% », « Total TTC »…)
  const cached: { ht: number | null; retenu: number | null; ttc: number | null } = { ht: null, retenu: null, ttc: null };
  if (iTotal >= 0) cached.ht = f.valeur(iTotal);
  for (let i = Math.max(iTotal, 0); i < grid.length; i++) {
    const b = norm(f.libelle(i));
    const mRemise = /^remise\s*([\d]+(?:[.,]\d+)?)\s*%/.exec(b);
    if (mRemise) remisePct = parseFloat(mRemise[1].replace(",", "."));
    if (b.startsWith("total ht avec remise")) cached.ht = f.valeur(i);
    if (b.startsWith("total ht retenu")) cached.retenu = f.valeur(i);
    if (b.startsWith("total ttc")) cached.ttc = f.valeur(i);
  }
  return { lot: { numero, titre, entreprise, remisePct, lignes }, cached };
}

// ---------- Onglet « PF définitif … » ----------

/** Catégorisation d'une ligne MOE d'après son libellé (nomenclature Strat Eco). */
function classifyMoe(
  designation: string,
  ttc: number,
  travauxHt: number,
  travauxTtc: number,
  avert: string[]
): Pick<LigneMoe, "montant" | "tvaPct" | "eligibleMprEtudes" | "eligibleMprAmo"> {
  const n = norm(designation);
  const forfait = (tva: number) => ({ mode: "forfait" as const, montantHt: ttc / (1 + tva / 100) });
  if (n.includes("assistance maitrise d'ouvrage") || /\bamo\b/.test(n))
    return { montant: forfait(20), tvaPct: 20, eligibleMprEtudes: false, eligibleMprAmo: true };
  if (n.includes("maitrise d'oeuvre") && n.includes("travaux")) {
    // % des travaux HT (suit le montant des travaux), TVA 5,5 % dans la nomenclature de référence
    const ht = ttc / 1.055;
    return {
      montant: { mode: "pctTravauxHt", taux: travauxHt > 0 ? (ht / travauxHt) * 100 : 0 },
      tvaPct: 5.5,
      eligibleMprEtudes: true,
      eligibleMprAmo: false,
    };
  }
  if (n.includes("maitrise d'oeuvre")) {
    // TVA 10 % dans la nomenclature de référence (Les Violettes), mais certains
    // classeurs appliquent 20 % (Boudhors) : le taux qui redonne un HT rond l'emporte
    const tva = tvaVraisemblable(ttc, [10, 20], 10);
    return { montant: forfait(tva), tvaPct: tva, eligibleMprEtudes: true, eligibleMprAmo: false };
  }
  if (n.includes("controle technique") || n.includes("csps"))
    return { montant: forfait(20), tvaPct: 20, eligibleMprEtudes: true, eligibleMprAmo: false };
  if (n.includes("dommage") && n.includes("ouvrage"))
    return {
      montant: { mode: "pctTravauxTtc", taux: travauxTtc > 0 ? (ttc / travauxTtc) * 100 : 0 },
      tvaPct: 0,
      eligibleMprEtudes: false,
      eligibleMprAmo: false,
    };
  if (n.includes("syndic")) {
    const ht = ttc / 1.2;
    return {
      montant: { mode: "pctTravauxHt", taux: travauxHt > 0 ? (ht / travauxHt) * 100 : 0 },
      tvaPct: 20,
      eligibleMprEtudes: false,
      eligibleMprAmo: false,
    };
  }
  if (n.includes("amiante") || n.includes("etancheite"))
    return { montant: forfait(20), tvaPct: 20, eligibleMprEtudes: false, eligibleMprAmo: false };
  avert.push(`MOE « ${designation} » : ligne non reconnue, importée en forfait TVA 20 %.`);
  return { montant: forfait(20), tvaPct: 20, eligibleMprEtudes: false, eligibleMprAmo: false };
}

/**
 * Parmi les taux candidats, celui qui redonne un HT « rond » (entier, sinon au
 * centime) depuis le TTC du classeur ; en cas d'égalité, le taux par défaut.
 */
function tvaVraisemblable(ttc: number, candidats: number[], defaut: number): number {
  const score = (tva: number) => {
    const ht = ttc / (1 + tva / 100);
    if (Math.abs(ht - Math.round(ht)) < 0.005) return 2;
    if (Math.abs(ht * 100 - Math.round(ht * 100)) < 0.005) return 1;
    return 0;
  };
  let meilleur = defaut;
  let meilleurScore = score(defaut);
  for (const t of candidats) {
    const s = score(t);
    if (s > meilleurScore) {
      meilleur = t;
      meilleurScore = s;
    }
  }
  return meilleur;
}

const fmtEuro = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });

/**
 * Calibre les aides à formule sur les montants du classeur : tous les chefs de
 * projet n'appliquent pas le coefficient de prudence 0,9 ni le CEE à 27 €/m².
 * On retient le coefficient qui redonne le montant du fichier ; à défaut le
 * montant est repris tel quel (mode manuel). Cas particulier : une aide MPR
 * calculée dans le classeur sur une assiette non plafonnée est conservée en
 * formule (le logiciel applique le plafond, cf. garde-fous) avec un avertissement.
 */
function calibrerAides(data: PlanDefinitifData, valeurs: (number | null)[], avert: string[]): void {
  const proche = (a: number, b: number) => Math.abs(a - b) <= 1;
  for (let i = 0; i < data.aides.length; i++) {
    const cible = valeurs[i];
    const aide = data.aides[i];
    const c = aide.calcul;
    if (cible == null || c.mode === "manuel" || c.mode === "info") continue;
    const montant = () => computePlanDefinitif(data).aides[i].montant ?? 0;
    if (proche(montant(), cible)) continue;
    if (c.mode !== "parM2Shab" && c.mode !== "pctAssietteTravaux" && c.mode !== "pctEtudes") {
      aide.calcul = { mode: "manuel", montant: cible };
      avert.push(`Aide « ${aide.libelle} » : la formule standard ne redonne pas le montant du classeur (${fmtEuro(cible)} €) - montant repris tel quel.`);
      continue;
    }
    const coefInitial = c.coef;
    let calibre = false;
    for (const coef of [coefInitial, 1, 0.9]) {
      c.coef = coef;
      const m = montant();
      if (proche(m, cible)) {
        if (coef !== coefInitial)
          avert.push(`Aide « ${aide.libelle} » : coefficient de prudence ${String(coef).replace(".", ",")} retenu d'après le montant du classeur.`);
        calibre = true;
        break;
      }
      // Classeur calculé sur les travaux retenus sans plafonner l'assiette MPR
      // (prorata énergétique compris) : le logiciel conserve le plafond
      if (c.mode !== "parM2Shab") {
        const r = computePlanDefinitif(data);
        if (r.travauxRetenusHt > r.assietteMprTravaux && r.assietteMprTravaux > 0) {
          const nonPlafonne = m * (r.travauxRetenusHt / r.assietteMprTravaux);
          if (proche(nonPlafonne, cible)) {
            avert.push(
              `Aide « ${aide.libelle} » : le classeur la calcule sur ${fmtEuro(r.travauxRetenusHt)} € HT de travaux retenus sans plafonner l'assiette MaPrimeRénov' ; le logiciel applique le plafond de ${fmtEuro(data.params.plafondTravauxParLogement)} € HT/logement (assiette ${fmtEuro(r.assietteMprTravaux)} €), soit ${fmtEuro(m)} € au lieu de ${fmtEuro(cible)} €.`
            );
            calibre = true;
            break;
          }
        }
      }
    }
    if (!calibre) {
      c.coef = coefInitial;
      aide.calcul = { mode: "manuel", montant: cible };
      avert.push(`Aide « ${aide.libelle} » : la formule standard ne redonne pas le montant du classeur (${fmtEuro(cible)} €) - montant repris tel quel.`);
    }
  }
}

/** Reconnaissance d'une aide d'après son libellé - repli en montant manuel si la formule standard ne colle pas. */
function classifyAide(groupe: string, libelle: string, montant: number | null): AideDef {
  const n = norm(libelle);
  const publique = norm(groupe) !== "cee";
  const base: Omit<AideDef, "calcul"> = {
    id: n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    groupe,
    libelle,
    publique,
  };
  if (montant == null) return { ...base, calcul: { mode: "info" } };
  if (n.includes("cee")) return { ...base, calcul: { mode: "parM2Shab", tauxEurM2: 27, coef: 0.9 } };
  if (n.includes("maprimerenov") && n.includes("travaux"))
    return { ...base, calcul: { mode: "pctAssietteTravaux", taux: 45, coef: 0.9 } };
  if (n.includes("maprimerenov") && n.includes("etudes"))
    return { ...base, calcul: { mode: "pctEtudes", taux: 45, coef: 0.9 } };
  if (n.includes("maprimerenov") && n.includes("amo")) return { ...base, calcul: { mode: "pctAmo", taux: 50 } };
  if (n.includes("climaxion") && n.includes("travaux"))
    return { ...base, calcul: { mode: "forfaitPlusParLogement", base: 10000, parLogement: 2500, surEquivalent: true } };
  if (n.includes("ems") && n.includes("travaux"))
    return { ...base, calcul: { mode: "parLogement", montant: 1000, surEquivalent: true } };
  if (n.includes("bbc")) return { ...base, calcul: { mode: "parLogement", montant: 500, surEquivalent: false } };
  return { ...base, calcul: { mode: "manuel", montant } };
}

const PHASE_PAR_PREFIXE: [RegExp, PhaseMoe][] = [
  [/etude/, "etude"],
  [/projet/, "projet"],
  [/travaux/, "travaux"],
];

export function importPlanDefinitif(wb: WorkBook): ImportPlanResult {
  const avert: string[] = [];
  const data = makeDefaultPlanDefinitif();

  // --- Classification des onglets ---
  const lotSheets: string[] = [];
  let pfCollectif: string | null = null;
  let pfSansAvance: string | null = null;
  let pfIndividuel: string | null = null;
  for (const name of wb.SheetNames) {
    const n = norm(name);
    if (/^lot\s*\d+/.test(n)) {
      lotSheets.push(name);
      continue;
    }
    const grid = toGrid(wb, name);
    const titre = norm((grid[0] ?? []).map((v) => str(v)).join(" ")) + " " + n;
    if (n.startsWith("pf") || titre.includes("plan de financement")) {
      // « sans avance » / « hors avance » avant le repli collectif, sinon
      // l'onglet serait classé variante collective classique
      if (titre.includes("individuel")) pfIndividuel = pfIndividuel ?? name;
      else if (titre.includes("sans avance") || titre.includes("hors avance"))
        pfSansAvance = pfSansAvance ?? name;
      else pfCollectif = pfCollectif ?? name;
    }
  }
  if (!pfCollectif && !pfSansAvance && !pfIndividuel)
    throw new Error("Aucun onglet « PF définitif … » reconnu dans ce classeur.");
  // Seules les variantes présentes dans le classeur sont proposées au dossier
  // (ex. un plan « éco-PTZ collectif seul » n'affiche pas la variante individuelle).
  data.variantes = {
    collectif: !!pfCollectif,
    collectifSansAvance: !!pfSansAvance,
    individuel: !!pfIndividuel,
  };
  const pfMain = pfCollectif ?? pfSansAvance ?? pfIndividuel!;
  const gridMain = toGrid(wb, pfMain);
  const cBMain = colonneLibelles(gridMain, (s) => s.includes("nom de la copropriete"));
  if (cBMain < 0) throw new Error(`Onglet « ${pfMain} » : libellé « Nom de la copropriété » introuvable.`);
  const pf = makeFeuille(gridMain, cBMain);

  // --- Lots (depuis les onglets dédiés) ---
  const cachedLots: { numero: number; ht: number | null; retenu: number | null; ttc: number | null }[] = [];
  for (const name of lotSheets) {
    const parsed = parseLotSheet(toGrid(wb, name), name, avert);
    if (!parsed) {
      avert.push(`Onglet « ${name} » : structure de lot non reconnue, ignoré.`);
      continue;
    }
    data.lots.push(parsed.lot);
    cachedLots.push({ numero: parsed.lot.numero, ...parsed.cached });
  }
  data.lots.sort((a, b) => a.numero - b.numero);
  if (data.lots.length === 0) avert.push("Aucun onglet « Lot NN » trouvé - le descriptif des travaux est vide.");

  // --- Infos générales ---
  const info = (label: string) => {
    const i = pf.findRow(label);
    return i >= 0 ? pf.valeurBrute(i) : null;
  };
  data.infos.nomCopro = str(info("nom de la copropriete"));
  data.infos.adresse = str(info("adresse de l'immeuble"));
  data.infos.nbLogements = num(info("logements principaux")) ?? 0;
  data.infos.nbLogementsEquiv = num(info("logt + equivalent")) ?? data.infos.nbLogements;
  data.infos.surfaceHabitable = num(info("surface habitable")) ?? 0;
  data.infos.nbEtages = num(info("nombre d'etages")) ?? 0;
  data.infos.nbEntrees = num(info("nombre d'entrees")) ?? 0;
  data.infos.typeChauffage = str(info("type de chauffage"));
  data.infos.cepInitial = num(info("energie primaire initial")) ?? 0;
  data.infos.cepProjet = num(info("energie primaire projet")) ?? 0;
  data.infos.dispositifClimaxion = norm(info("dispositif climaxion")) === "oui";
  const etiq = /de\s+(\S+)\s+a\s+(\S+)/.exec(norm(info("etiquette energetique")));
  if (etiq) {
    data.infos.etiquetteInitiale = etiq[1].toUpperCase();
    data.infos.etiquetteProjet = etiq[2].toUpperCase();
  }

  // Totaux travaux du fichier (pour classer la MOE en % et contrôler)
  const cachedTravauxHt = pf.valD("total travaux ht") ?? 0;
  const cachedTravauxTtc = pf.valD("total travaux ttc") ?? 0;

  // --- MOE et frais annexes ---
  const iMoe = pf.findRow("moe et frais annexes");
  const iMoeFin = pf.findRow("total moe", iMoe + 1);
  if (iMoe >= 0 && iMoeFin > iMoe) {
    let phase: PhaseMoe = "etude";
    for (let i = iMoe + 1; i < iMoeFin; i++) {
      const a = norm(pf.groupe(i));
      for (const [re, ph] of PHASE_PAR_PREFIXE) if (a && re.test(a)) phase = ph;
      const designation = pf.libelle(i);
      const ttc = pf.valeur(i);
      if (!designation || ttc == null) continue;
      const cls = classifyMoe(designation, ttc, cachedTravauxHt, cachedTravauxTtc, avert);
      data.moe.push({ designation, phase, commentaire: pf.commentaire(i) || undefined, ...cls });
    }
  } else {
    avert.push("Section « MOE et frais annexes » introuvable.");
  }

  // --- Aides ---
  const iAides = pf.findRow("aides mobilisables");
  const iAidesFin = pf.findRow("total aides", iAides + 1);
  /** Montants du classeur, dans l'ordre de data.aides (calibrage des formules). */
  const valeursAides: (number | null)[] = [];
  if (iAides >= 0 && iAidesFin > iAides) {
    data.aides = [];
    let groupe = "";
    for (let i = iAides + 1; i < iAidesFin; i++) {
      const a = pf.groupe(i);
      if (a) groupe = a;
      const libelle = pf.libelle(i);
      if (!libelle || norm(libelle) === "scenario 1") continue;
      const valeur = pf.valeur(i);
      const aide = classifyAide(groupe, libelle, valeur);
      aide.commentaire = pf.commentaire(i) || undefined;
      data.aides.push(aide);
      valeursAides.push(valeur);
    }
  } else {
    avert.push("Section « Aides mobilisables » introuvable - catalogue par défaut appliqué.");
  }

  // --- Paramètres de financement ---
  // Imprévus : « Total travaux TTC € y compris imprévus 7% » (repli : rapport
  // entre le TTC avec imprévus et le TTC travaux)
  const iImprevus = pf.findRow("y compris imprevus");
  if (iImprevus >= 0) {
    const mImprevus = /imprevus\s*(\d+(?:[.,]\d+)?)\s*%/.exec(norm(pf.libelle(iImprevus)));
    const ttcImprevus = pf.valeur(iImprevus);
    if (mImprevus) data.params.imprevusPct = parseFloat(mImprevus[1].replace(",", "."));
    else if (ttcImprevus != null && cachedTravauxTtc > 0)
      data.params.imprevusPct = Math.round((ttcImprevus / cachedTravauxTtc - 1) * 1000) / 10;
  }
  const iFonds = pf.findRow("fonds travaux");
  if (iFonds >= 0) {
    data.params.fondsTravaux = pf.valeur(iFonds) ?? 0;
    data.params.commentaireFondsTravaux = pf.commentaire(iFonds) || undefined;
  }
  const iTant = pf.findRow("cout au tantieme avant");
  if (iTant >= 0) data.params.totalTantiemes = pf.tantieme(iTant) ?? 10000;
  // Tantièmes d'exemple : lignes « … pour un appartement de (310 /10000) » et exemples associés
  const exemples = new Set<number>();
  for (let i = 0; i < gridMain.length; i++) {
    const b = norm(pf.libelle(i));
    if (/(quote part|reste a financer|mensualite|appels de fonds|prix de revient)/.test(b)) {
      const t = pf.tantieme(i);
      if (t != null && t > 0 && t < (data.params.totalTantiemes || 10000)) exemples.add(t);
    }
    const mDuree = /(?:duree de|pendant)\s*(\d+)\s*ans/.exec(b);
    if (mDuree) data.params.dureeEcoPtzAns = parseInt(mDuree[1], 10);
  }
  if (exemples.size) data.params.tantiemesExemples = [...exemples].sort((x, y) => x - y);

  // Variante individuelle : % d'aides avancées (« 70% des aides publiques »)
  let pfIndiv: Feuille | null = null;
  if (pfIndividuel) {
    const g = toGrid(wb, pfIndividuel);
    const cB = colonneLibelles(g, (s) => s.includes("nom de la copropriete"));
    if (cB >= 0) pfIndiv = makeFeuille(g, cB);
  }
  if (pfIndiv) {
    for (let i = 0; i < pfIndiv.grid.length; i++) {
      const m = /^(\d+)\s*%\s*des aides publiques/.exec(norm(pfIndiv.libelle(i)));
      if (m && parseInt(m[1], 10) > 50) {
        data.params.pctAvanceAides = parseInt(m[1], 10);
        break;
      }
    }
  }

  // --- Calibrage des aides à formule sur les montants du classeur ---
  calibrerAides(data, valeursAides, avert);

  // --- Contrôles : recalcul du moteur vs valeurs du fichier ---
  const r = computePlanDefinitif(data);
  const controles: ControleImport[] = [];
  const ctrl = (libelle: string, fichier: number | null, recalcule: number) => {
    if (fichier == null) return;
    controles.push({ libelle, fichier, recalcule, ok: Math.abs(fichier - recalcule) <= 1 });
  };
  for (const c of cachedLots) {
    const lot = r.lots.find((l) => l.numero === c.numero);
    if (!lot) continue;
    ctrl(`Lot ${c.numero} - total HT`, c.ht, lot.totalHtApresRemise);
    ctrl(`Lot ${c.numero} - HT retenu`, c.retenu, lot.totalHtRetenu);
    ctrl(`Lot ${c.numero} - total TTC`, c.ttc, lot.totalTtc);
  }
  ctrl("Total travaux HT", cachedTravauxHt || null, r.totalTravauxHt);
  ctrl("Travaux énergétiques retenus (assiette MPR)", pf.valD("energetiques et induits"), r.assietteMprTravaux);
  ctrl("Total travaux TTC", cachedTravauxTtc || null, r.totalTravauxTtc);
  ctrl("Total travaux TTC avec imprévus", pf.valD("y compris imprevus"), r.totalTravauxTtcImprevus);
  ctrl("Total MOE et annexes TTC", pf.valD("total moe"), r.totalMoeTtc);
  ctrl("Total opération TTC", pf.valD("toutes les phases"), r.totalOperationTtc);
  // Base des indicateurs : total de l'opération TTC (classeurs récents, où le
  // « total restant en phase travaux » vaut le total de l'opération). Les
  // classeurs antérieurs calculaient sur la seule phase travaux : ces valeurs
  // sont acceptées en variante pour ne pas signaler de faux écarts.
  const ecartPhase = r.totalOperationTtc - r.totalPhaseTravauxTtc;
  const ctrl2 = (libelle: string, fichier: number | null, recalcule: number, variante: number) => {
    if (fichier == null) return;
    if (Math.abs(fichier - variante) <= 1 && Math.abs(fichier - recalcule) > 1) {
      controles.push({ libelle, fichier, recalcule: variante, ok: true });
      avert.push(
        `« ${libelle} » : le classeur calcule sur la seule phase travaux (${fichier.toFixed(2)} €) ; le logiciel retient le total de l'opération (${recalcule.toFixed(2)} €).`
      );
      return;
    }
    ctrl(libelle, fichier, recalcule);
  };
  ctrl2("Total phase travaux TTC", pf.valD("total restant en phase travaux"), r.totalOperationTtc, r.totalPhaseTravauxTtc);
  ctrl("Total aides NET", pf.valD("total aides net"), r.totalAides);
  ctrl("Total aides publiques", pf.valD("total aides publiques"), r.totalAidesPubliques);
  ctrl2("Reste à charge collectif", pf.valD("reste a charge definitif"), r.resteACharge, r.resteACharge - ecartPhase);
  // le reste à financer est identique avec ou sans avance de subventions
  if (pfCollectif || pfSansAvance)
    ctrl2("Reste à financer", pf.valD("reste a financer"), r.collectif.resteAFinancer, r.collectif.resteAFinancer - ecartPhase);
  if (pfIndiv)
    ctrl2(
      "Appels de fonds (70 % des aides déduits)",
      pfIndiv.valD("appels de fonds avec deduction"),
      r.individuel.appelsFonds,
      r.individuel.appelsFonds - ecartPhase
    );

  for (const c of controles) {
    if (!c.ok)
      avert.push(
        `Écart sur « ${c.libelle} » : fichier ${c.fichier.toFixed(2)} € / recalcul ${c.recalcule.toFixed(2)} €.`
      );
  }

  return { data, avertissements: avert, controles };
}
