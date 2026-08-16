// Plans individuels générés depuis le PF définitif validé.
// Le total de la phase travaux TTC (lots avec imprévus + MOE phase travaux)
// est réparti item par item suivant une clé de répartition de la copropriété :
// s'il n'y a qu'une seule clé, tout passe par elle sans question ; sinon
// l'AMO choisit la clé lot par lot, item par item.
import type { PlanDefinitifData, PlanDefinitifResult } from "./planDefinitif";
import { round2 } from "./round";

/** Item du PF à répartir suivant une clé (lot de travaux ou ligne MOE phase travaux). */
export interface ItemRepartitionPf {
  /** « lot:<numero> » ou « moe:<index> » — sert de clé dans repartitionCles. */
  id: string;
  libelle: string;
  /** Montant TTC phase travaux de l'item (imprévus inclus pour les lots). */
  montantTtc: number;
}

/** Lots + imprévus au prorata, puis lignes MOE de la phase travaux. */
export function itemsARepartirPf(data: PlanDefinitifData, r: PlanDefinitifResult): ItemRepartitionPf[] {
  const coefImprevus = 1 + data.params.imprevusPct / 100;
  const items: ItemRepartitionPf[] = r.lots.map((l) => ({
    id: `lot:${l.numero}`,
    libelle: `Lot ${l.numero} — ${l.titre}`,
    montantTtc: l.totalTtc * coefImprevus,
  }));
  r.moe.forEach((m, i) => {
    if (m.phase === "travaux" && m.montantTtc !== 0)
      items.push({ id: `moe:${i}`, libelle: m.designation || `Ligne MOE ${i + 1}`, montantTtc: m.montantTtc });
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
  /** Quote-part de la phase travaux TTC avant déduction des aides. */
  quotePartAvant: number;
  /** Part des aides et du fonds travaux (au prorata de la quote-part). */
  aidesEtFonds: number;
  /** Reste à charge après aides et fonds travaux. */
  reste: number;
}

/**
 * Répartit chaque item suivant sa clé : part du copropriétaire =
 * tantièmes(copro, clé) / total(clé). Les aides et le fonds travaux sont
 * déduits au prorata de la quote-part. Retourne aussi les items sans clé
 * exploitable (clé non choisie ou total de clé nul) — le plan n'est complet
 * que si `manquants` est vide.
 */
export function computePlansIndividuelsPf(input: {
  items: ItemRepartitionPf[];
  /** Clé (code) choisie par item ; ignoré si une seule clé est fournie dans totauxCles. */
  cleParItem: Record<string, string>;
  copros: CoproTantiemes[];
  /** Total de tantièmes par code de clé (somme sur tous les lots de la copro). */
  totauxCles: Record<string, number>;
  totalAides: number;
  fondsTravaux: number;
  totalPhaseTravauxTtc: number;
}): { plans: PlanIndividuelPf[]; manquants: ItemRepartitionPf[] } {
  const { items, cleParItem, copros, totauxCles, totalAides, fondsTravaux, totalPhaseTravauxTtc } = input;
  const manquants = items.filter((it) => {
    const cle = cleParItem[it.id];
    return !cle || !(totauxCles[cle] > 0);
  });

  const parts = new Map<string, number>();
  for (const it of items) {
    const cle = cleParItem[it.id];
    const total = cle ? totauxCles[cle] : 0;
    if (!cle || !(total > 0)) continue;
    for (const co of copros) {
      const t = co.tantiemes[cle] ?? 0;
      if (t > 0) parts.set(co.coproprietaireId, (parts.get(co.coproprietaireId) ?? 0) + (it.montantTtc * t) / total);
    }
  }

  const tauxDeduction = totalPhaseTravauxTtc > 0 ? (totalAides + fondsTravaux) / totalPhaseTravauxTtc : 0;
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
        reste: round2(quotePartAvant - aidesEtFonds),
      };
    })
    .sort((a, b) => b.quotePartAvant - a.quotePartAvant);

  return { plans, manquants };
}
