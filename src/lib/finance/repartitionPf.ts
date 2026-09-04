// Plans individuels générés depuis le PF définitif validé.
// Le total de l'opération TTC (lots avec imprévus + MOE et frais annexes, toutes phases)
// est réparti ligne par ligne suivant une clé de répartition de la copropriété :
// s'il n'y a qu'une seule clé, tout passe par elle sans question ; sinon
// l'AMO choisit la clé sur chaque ligne de devis et chaque ligne MOE
// (choix porté par la ligne dans le PF définitif).
import type { PlanDefinitifData, PlanDefinitifResult } from "./planDefinitif";
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
      if (l.montantHt === 0) return;
      // Convention du classeur : remise sur le HT, TVA calculée sur le montant avant remise.
      const ttc = l.montantHt * (1 - lot.remisePct / 100) + (l.montantHt * l.tvaPct) / 100;
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
  /** Reste à charge après aides et fonds travaux. */
  reste: number;
}

/**
 * Répartit chaque ligne suivant sa clé : part du copropriétaire =
 * tantièmes(copro, clé) / total(clé). La clé d'une ligne est `cleParItem`
 * (prioritaire - cas de la clé unique) puis la clé portée par la ligne.
 * Les aides et le fonds travaux sont déduits au prorata de la quote-part.
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
  fondsTravaux: number;
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

  const tauxDeduction = totalOperationTtc > 0 ? (totalAides + fondsTravaux) / totalOperationTtc : 0;
  const tauxCee = totalOperationTtc > 0 ? primeCee / totalOperationTtc : 0;
  const plans = copros
    .filter((co) => (parts.get(co.coproprietaireId) ?? 0) > 0)
    .map((co): PlanIndividuelPf => {
      const quotePartAvant = parts.get(co.coproprietaireId) ?? 0;
      const aidesEtFonds = quotePartAvant * tauxDeduction;
      return {
        coproprietaireId: co.coproprietaireId,
        nom: co.nom,
        quotePartAvant: round2(quotePartAvant),
        aidesEtFonds: round2(aidesEtFonds),
        primeCee: round2(quotePartAvant * tauxCee),
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
  const items = itemsARepartirPf(data, r);
  const totauxCles: Record<string, number> = {};
  const parCopro = new Map<string, CoproTantiemes>();
  for (const lot of lots) {
    for (const [code, t] of Object.entries(lot.tantiemes)) totauxCles[code] = (totauxCles[code] ?? 0) + t;
    if (!lot.coproprietaire_id) continue;
    const co =
      parCopro.get(lot.coproprietaire_id) ??
      { coproprietaireId: lot.coproprietaire_id, nom: lot.coproprietaire?.nom ?? "-", tantiemes: {} };
    for (const [code, t] of Object.entries(lot.tantiemes)) co.tantiemes[code] = (co.tantiemes[code] ?? 0) + t;
    parCopro.set(lot.coproprietaire_id, co);
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
    fondsTravaux: data.params.fondsTravaux,
    totalOperationTtc: r.totalOperationTtc,
  });
  const cleRef = cleUnique ?? cles.find((k) => k.is_default)?.code ?? cles[0]?.code ?? null;
  return { plans, manquants, items, cleUnique, cleRef, totauxCles, parCopro, cleParItem };
}
