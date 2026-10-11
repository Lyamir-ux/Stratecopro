// Plans individuels générés depuis le PF définitif validé.
// Le total de l'opération TTC (lots avec imprévus + MOE et frais annexes, toutes phases)
// est réparti ligne par ligne suivant une clé de répartition de la copropriété :
// s'il n'y a qu'une seule clé, tout passe par elle sans question ; sinon
// l'AMO choisit la clé sur chaque ligne de devis et chaque ligne MOE
// (choix porté par la ligne dans le PF définitif).
import type { PlanDefinitifData, PlanDefinitifResult } from "./planDefinitif";
import { tvaLigne } from "./planDefinitif";
import { round2 } from "./round";

/** Ligne du PF à répartir suivant une clé (ligne de devis ou ligne MOE, toute phase). */
export interface ItemRepartitionPf {
  /** « lot:<numero>:<index ligne> » ou « moe:<index> ». */
  id: string;
  libelle: string;
  /** Montant TTC de la ligne (remise et imprévus inclus pour les lots). */
  montantTtc: number;
  /** Clé (code) choisie sur la ligne - repli : choix legacy par lot entier (repartitionCles). */
  cle?: string;
}

/** Lignes de devis (remise du lot et imprévus au prorata), puis toutes les lignes MOE. */
export function itemsARepartirPf(data: PlanDefinitifData, r: PlanDefinitifResult): ItemRepartitionPf[] {
  const coefImprevus = 1 + data.params.imprevusPct / 100;
  const legacy = data.repartitionCles ?? {};
  const items: ItemRepartitionPf[] = [];
  for (const lot of data.lots) {
    lot.lignes.forEach((l, i) => {
      if (l.montantHt === 0 && !l.tvaMontant) return;
      // Convention du classeur : remise sur le HT, TVA calculée sur le montant
      // avant remise (ou saisie : ligne d'ajustement d'un PF estimatif).
      const ttc = l.montantHt * (1 - lot.remisePct / 100) + tvaLigne(l);
      items.push({
        id: `lot:${lot.numero}:${i}`,
        libelle: `Lot ${lot.numero} - ${l.designation || lot.titre}`,
        montantTtc: ttc * coefImprevus,
        cle: l.cleRepartition ?? legacy[`lot:${lot.numero}`],
      });
    });
  }
  // Toutes les phases MOE (étude, projet, travaux) : le reste à charge est
  // calculé sur le total de l'opération depuis le 04/09/2026.
  r.moe.forEach((m, i) => {
    if (m.montantTtc !== 0)
      items.push({
        id: `moe:${i}`,
        libelle: m.designation || `Ligne MOE ${i + 1}`,
        montantTtc: m.montantTtc,
        cle: data.moe[i]?.cleRepartition ?? legacy[`moe:${i}`],
      });
  });
  return items;
}

/** Aide (ou fonds travaux) à déduire des quotes-parts, avec sa clé de répartition éventuelle. */
export interface DeductionPf {
  montant: number;
  /** Prime privée (CEE) : versée en fin de chantier, isolée dans `primeCee`. */
  prive?: boolean;
  /** Clé (code) de l'aide : déduite des seuls copropriétaires de cette clé. Absente : au prorata de la quote-part. */
  cle?: string;
}

/** Aides du PF avec leur clé, dans l'ordre du plan (les montants viennent du résultat calculé). */
export function aidesARepartirPf(data: PlanDefinitifData, r: PlanDefinitifResult): DeductionPf[] {
  return data.aides.map((a, i) => ({
    montant: r.aides[i]?.montant ?? 0,
    prive: !a.publique,
    cle: a.cleRepartition,
  }));
}

/** Tantièmes d'un copropriétaire par code de clé (sommés sur ses lots). */
export interface CoproTantiemes {
  coproprietaireId: string;
  nom: string;
  tantiemes: Record<string, number>;
}

export interface PlanIndividuelPf {
  coproprietaireId: string;
  nom: string;
  /** Quote-part de l'opération TTC avant déduction des aides. */
  quotePartAvant: number;
  /** Part des aides et du fonds travaux (au prorata de la quote-part) - prime CEE incluse. */
  aidesEtFonds: number;
  /**
   * Part de la prime CEE dans `aidesEtFonds` : versée en fin de chantier, elle
   * ne réduit pas le montant à financer avant travaux (feedback du 03/09/2026).
   */
  primeCee: number;
  /** Part des aides publiques dans `aidesEtFonds` (base du coût du prêt d'avance de subventions). */
  aidesPubliques: number;
  /** Part du fonds travaux dans `aidesEtFonds`. */
  fondsTravaux: number;
  /** Reste à charge après aides et fonds travaux. */
  reste: number;
}

/**
 * Répartit chaque ligne suivant sa clé : part du copropriétaire =
 * tantièmes(copro, clé) / total(clé). La clé d'une ligne est `cleParItem`
 * (prioritaire - cas de la clé unique) puis la clé portée par la ligne.
 * Les aides et le fonds travaux sont déduits suivant leur propre clé quand
 * elle est renseignée, sinon au prorata de la quote-part.
 * Retourne aussi les lignes sans clé exploitable (clé non choisie ou total
 * de clé nul) - le plan n'est complet que si `manquants` est vide.
 */
export function computePlansIndividuelsPf(input: {
  items: ItemRepartitionPf[];
  /** Clé (code) forcée par item - prioritaire sur la clé portée par la ligne. */
  cleParItem: Record<string, string>;
  copros: CoproTantiemes[];
  /** Total de tantièmes par code de clé (somme sur tous les lots de la copro). */
  totauxCles: Record<string, number>;
  /** Total des aides (publiques + prime CEE). */
  totalAides: number;
  /** Prime CEE comprise dans `totalAides` (0 si absente). */
  primeCee?: number;
  /**
   * Aides détaillées avec leur clé : chacune est déduite suivant sa clé
   * (tantièmes du copropriétaire / total de la clé). Absent, ou aide sans clé :
   * déduction au prorata de la quote-part (`totalAides` ne sert alors que sans ce détail).
   */
  aides?: DeductionPf[];
  fondsTravaux: number;
  /** Clé du fonds travaux (absente : au prorata de la quote-part). */
  cleFondsTravaux?: string;
  totalOperationTtc: number;
}): { plans: PlanIndividuelPf[]; manquants: ItemRepartitionPf[] } {
  const { items, cleParItem, copros, totauxCles, totalAides, fondsTravaux, totalOperationTtc } = input;
  const primeCee = input.primeCee ?? 0;
  const cleDe = (it: ItemRepartitionPf) => cleParItem[it.id] ?? it.cle;
  const manquants = items.filter((it) => {
    const cle = cleDe(it);
    return !cle || !(totauxCles[cle] > 0);
  });

  const parts = new Map<string, number>();
  for (const it of items) {
    const cle = cleDe(it);
    const total = cle ? totauxCles[cle] : 0;
    if (!cle || !(total > 0)) continue;
    for (const co of copros) {
      const t = co.tantiemes[cle] ?? 0;
      if (t > 0) parts.set(co.coproprietaireId, (parts.get(co.coproprietaireId) ?? 0) + (it.montantTtc * t) / total);
    }
  }

  const deductions: DeductionPf[] = [
    ...(input.aides ?? [
      { montant: totalAides - primeCee },
      { montant: primeCee, prive: true },
    ]),
    { montant: fondsTravaux, cle: input.cleFondsTravaux },
  ];
  const plans = copros
    .filter((co) => (parts.get(co.coproprietaireId) ?? 0) > 0)
    .map((co): PlanIndividuelPf => {
      const quotePartAvant = parts.get(co.coproprietaireId) ?? 0;
      let aidesEtFonds = 0;
      let cee = 0;
      let publiques = 0;
      let fonds = 0;
      for (const [i, d] of deductions.entries()) {
        // clé inconnue ou de total nul : repli au prorata de la quote-part
        const total = d.cle ? totauxCles[d.cle] : 0;
        const part =
          d.cle && total > 0
            ? ((co.tantiemes[d.cle] ?? 0) / total) * d.montant
            : totalOperationTtc > 0
              ? (quotePartAvant / totalOperationTtc) * d.montant
              : 0;
        aidesEtFonds += part;
        // le fonds travaux est la dernière déduction
        if (i === deductions.length - 1) fonds += part;
        else if (d.prive) cee += part;
        else publiques += part;
      }
      return {
        coproprietaireId: co.coproprietaireId,
        nom: co.nom,
        quotePartAvant: round2(quotePartAvant),
        aidesEtFonds: round2(aidesEtFonds),
        primeCee: round2(cee),
        aidesPubliques: round2(publiques),
        fondsTravaux: round2(fonds),
        reste: round2(quotePartAvant - aidesEtFonds),
      };
    })
    .sort((a, b) => b.quotePartAvant - a.quotePartAvant);

  return { plans, manquants };
}

/** Lot tel que servi par useDonnees (sous-ensemble utile à la répartition). */
export interface LotPourRepartition {
  coproprietaire_id: string | null;
  coproprietaire?: { nom: string } | null;
  tantiemes: Record<string, number>;
}

/**
 * Périmètre d'un PF définitif : bâtiments couverts (identifiants). Absent ou
 * vide = toute la copropriété. Plans par bâtiment (Amir, 11/10/2026) : le
 * programme de travaux d'un bâtiment peut différer de celui d'un autre.
 */
export type PerimetrePf = readonly string[] | null | undefined;

export function couvreToutLaCopro(p: PerimetrePf): boolean {
  return !p || p.length === 0;
}

/**
 * Lots répartis par un PF : tous les lots pour un PF de toute la copropriété,
 * sinon ceux des bâtiments du périmètre (un lot sans bâtiment n'appartient à
 * aucun périmètre restreint). Les totaux de clés se calculent sur ces seuls
 * lots : chaque bâtiment se partage son propre plan.
 */
export function lotsDuPerimetre<L extends { batiment_id?: string | null }>(lots: L[], perimetre: PerimetrePf): L[] {
  if (couvreToutLaCopro(perimetre)) return lots;
  const ids = new Set(perimetre);
  return lots.filter((l) => !!l.batiment_id && ids.has(l.batiment_id));
}

/** Deux périmètres ont au moins un bâtiment en commun (toute la copropriété chevauche tout). */
export function perimetresSeChevauchent(a: PerimetrePf, b: PerimetrePf): boolean {
  if (couvreToutLaCopro(a) || couvreToutLaCopro(b)) return true;
  const ids = new Set(a);
  return b!.some((id) => ids.has(id));
}

/** Additionne, copropriétaire par copropriétaire, les plans individuels de plusieurs PF. */
export function cumulerPlansIndividuels(listes: PlanIndividuelPf[][]): PlanIndividuelPf[] {
  if (listes.length === 1) return listes[0];
  const parCp = new Map<string, PlanIndividuelPf>();
  for (const liste of listes)
    for (const p of liste) {
      const cur = parCp.get(p.coproprietaireId);
      parCp.set(
        p.coproprietaireId,
        cur
          ? {
              ...cur,
              quotePartAvant: round2(cur.quotePartAvant + p.quotePartAvant),
              aidesEtFonds: round2(cur.aidesEtFonds + p.aidesEtFonds),
              primeCee: round2(cur.primeCee + p.primeCee),
              aidesPubliques: round2(cur.aidesPubliques + p.aidesPubliques),
              fondsTravaux: round2(cur.fondsTravaux + p.fondsTravaux),
              reste: round2(cur.reste + p.reste),
            }
          : p
      );
    }
  return [...parCp.values()].sort((a, b) => b.quotePartAvant - a.quotePartAvant);
}

export interface RepartitionPfCopro {
  plans: PlanIndividuelPf[];
  manquants: ItemRepartitionPf[];
  items: ItemRepartitionPf[];
  /** Code de la clé unique de la copro (null si plusieurs clés). */
  cleUnique: string | null;
  /** Clé de référence pour la mise à l'échelle par lot au portail (clé unique, sinon clé par défaut). */
  cleRef: string | null;
  totauxCles: Record<string, number>;
  parCopro: Map<string, CoproTantiemes>;
  cleParItem: Record<string, string>;
}

/**
 * Répartition complète d'un PF définitif entre les copropriétaires d'après les
 * lots importés : tantièmes sommés par copropriétaire et par clé, clé unique
 * forcée sur toutes les lignes, sinon clé portée par chaque ligne du PF.
 * Une seule fonction pour l'onglet Financement, la vue Copropriétaires et les
 * exports : les trois lisent les mêmes montants, au centime.
 */
export function repartirPfDepuisLots(
  data: PlanDefinitifData,
  r: PlanDefinitifResult,
  lots: LotPourRepartition[],
  cles: { code: string; is_default: boolean }[]
): RepartitionPfCopro {
  return repartir(data, r, lots, cles, (lot) =>
    lot.coproprietaire_id ? { id: lot.coproprietaire_id, nom: lot.coproprietaire?.nom ?? "-" } : null
  );
}

/**
 * Même répartition, lot par lot : chaque lot d'un copropriétaire reçoit sa part
 * de chaque ligne et de chaque déduction (clés de la ligne et de l'aide). La
 * somme des lots d'un copropriétaire redonne son plan, aux arrondis près : le
 * portail affiche ainsi la quote-part exacte d'un lot, même quand les lots du
 * copropriétaire relèvent de PF ou de clés différents. Clé : identifiant du lot.
 */
export function repartitionParLot(
  data: PlanDefinitifData,
  r: PlanDefinitifResult,
  lots: (LotPourRepartition & { id: string })[],
  cles: { code: string; is_default: boolean }[]
): Map<string, PlanIndividuelPf> {
  const { plans } = repartir(data, r, lots, cles, (lot) =>
    lot.coproprietaire_id ? { id: lot.id, nom: lot.coproprietaire?.nom ?? "-" } : null
  );
  return new Map(plans.map((p) => [p.coproprietaireId, p]));
}

function repartir<L extends LotPourRepartition>(
  data: PlanDefinitifData,
  r: PlanDefinitifResult,
  lots: L[],
  cles: { code: string; is_default: boolean }[],
  porteur: (lot: L) => { id: string; nom: string } | null
): RepartitionPfCopro {
  const items = itemsARepartirPf(data, r);
  const totauxCles: Record<string, number> = {};
  const parCopro = new Map<string, CoproTantiemes>();
  for (const lot of lots) {
    for (const [code, t] of Object.entries(lot.tantiemes)) totauxCles[code] = (totauxCles[code] ?? 0) + t;
    const p = porteur(lot);
    if (!p) continue;
    const co = parCopro.get(p.id) ?? { coproprietaireId: p.id, nom: p.nom, tantiemes: {} };
    for (const [code, t] of Object.entries(lot.tantiemes)) co.tantiemes[code] = (co.tantiemes[code] ?? 0) + t;
    parCopro.set(p.id, co);
  }
  const cleUnique = cles.length === 1 ? cles[0].code : null;
  const cleParItem: Record<string, string> = cleUnique
    ? Object.fromEntries(items.map((it) => [it.id, cleUnique]))
    : {};
  const { plans, manquants } = computePlansIndividuelsPf({
    items,
    cleParItem,
    copros: [...parCopro.values()],
    totauxCles,
    totalAides: r.totalAides,
    primeCee: r.primeCee,
    aides: aidesARepartirPf(data, r),
    fondsTravaux: data.params.fondsTravaux,
    cleFondsTravaux: data.params.cleFondsTravaux,
    totalOperationTtc: r.totalOperationTtc,
  });
  const cleRef = cleUnique ?? cles.find((k) => k.is_default)?.code ?? cles[0]?.code ?? null;
  return { plans, manquants, items, cleUnique, cleRef, totauxCles, parCopro, cleParItem };
}

/** PF validé à répartir, avec son périmètre. */
export interface PfARepartir {
  id: string;
  nom: string;
  data: PlanDefinitifData;
  resultat: PlanDefinitifResult;
  batimentIds: PerimetrePf;
}

export interface RepartitionPfsCopro<L> {
  /** Répartition de chaque PF entre les seuls lots de son périmètre. */
  parPf: { pf: PfARepartir; lots: L[]; repartition: RepartitionPfCopro }[];
  /** Plans individuels cumulés sur tous les PF (un par copropriétaire). */
  plans: PlanIndividuelPf[];
  /** Chaque PF est entièrement réparti (aucune ligne sans clé exploitable). */
  complet: boolean;
  /** Clé de référence de la copropriété (clé unique, sinon clé par défaut). */
  cleRef: string | null;
}

/**
 * Répartit tous les PF validés d'une copropriété (un par bâtiment, ou un seul
 * pour toute la copropriété) et cumule les plans par copropriétaire : un
 * copropriétaire de plusieurs bâtiments reçoit la somme de ses parts.
 */
export function repartirPfs<L extends LotPourRepartition & { batiment_id?: string | null }>(
  pfs: PfARepartir[],
  lots: L[],
  cles: { code: string; is_default: boolean }[]
): RepartitionPfsCopro<L> {
  const parPf = pfs.map((pf) => {
    const lotsPf = lotsDuPerimetre(lots, pf.batimentIds);
    return { pf, lots: lotsPf, repartition: repartirPfDepuisLots(pf.data, pf.resultat, lotsPf, cles) };
  });
  return {
    parPf,
    plans: parPf.length ? cumulerPlansIndividuels(parPf.map((x) => x.repartition.plans)) : [],
    complet: parPf.length > 0 && parPf.every((x) => x.repartition.manquants.length === 0),
    cleRef: cles.length === 1 ? cles[0].code : (cles.find((k) => k.is_default)?.code ?? cles[0]?.code ?? null),
  };
}
