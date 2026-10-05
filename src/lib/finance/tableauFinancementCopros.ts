// Tableau de financement de tous les copropriétaires (feedback Amir 05/10/2026,
// sous « Plans individuels » de l'onglet Financement) : un seul tableau, une
// ligne par copropriétaire, exporté en PDF. Deux variantes du PF définitif :
//  - « collectif » : éco-PTZ collectif avec prêt d'avance de subventions - les
//    colonnes des exemples du PF (quote-part, reste à financer, mensualité,
//    coût du prêt d'avance, prime C2E, prix de revient) ;
//  - « individuel » : éco-PTZ individuel - appels de fonds avec une part des
//    aides publiques déduite, le reste des aides arrive en fin de chantier.
// Les montants viennent de la même répartition que l'onglet Financement et la
// vue Copropriétaires (repartirPfDepuisLots) : aides déduites suivant leur
// clé, tantièmes de la clé de référence. Mêmes formules que computePlanDefinitif.
import { trierParNomFamille } from "../nomFamille";
import type { PlanDefinitifData } from "./planDefinitif";
import type { PlanIndividuelPf } from "./repartitionPf";
import { round2 } from "./round";

export type VarianteTableauCopros = "collectif" | "individuel";

export interface LigneTableauCopro {
  coproprietaireId: string;
  nom: string;
  /** Tantièmes du copropriétaire dans la clé de référence. */
  tantiemes: number;
  /** Quote-part de l'opération TTC avant déduction des aides. */
  quotePartAvant: number;
  /**
   * Collectif : reste à charge + prime C2E (la prime arrive en fin de travaux).
   * Individuel : appels de fonds, avec seulement `pctAvanceAides` % des aides publiques déduites.
   */
  resteAFinancer: number;
  /** Mensualité sur la durée de l'éco-PTZ, assurance comprise. */
  mensualite: number;
  /** Collectif avec avance : coût du prêt d'avance de subventions (payé en une fois). 0 sinon. */
  coutPretAvance: number;
  primeCee: number;
  /** Individuel : aides restantes et prime C2E remboursées en fin de chantier. 0 en collectif. */
  remboursementFinChantier: number;
  /** Collectif : reste à financer - prime C2E + coût du prêt d'avance. Individuel : reste à charge après toutes aides. */
  prixRevient: number;
}

export interface TotauxTableauCopros {
  tantiemes: number;
  quotePartAvant: number;
  resteAFinancer: number;
  mensualite: number;
  coutPretAvance: number;
  primeCee: number;
  remboursementFinChantier: number;
  prixRevient: number;
}

export interface TableauFinancementCopros {
  variante: VarianteTableauCopros;
  /** Collectif : le PF prévoit un prêt d'avance de subventions (colonne « coût du prêt d'avance »). */
  avance: boolean;
  lignes: LigneTableauCopro[];
  totaux: TotauxTableauCopros;
  /** Paramètres du PF qui fondent les montants (affichés en tête du PDF). */
  dureeAns: number;
  coefAssurance: number;
  tauxPretAvancePct: number;
  pctAvanceAides: number;
  /** Clé de référence des tantièmes et son total sur la copropriété. */
  cleRef: string | null;
  totalCleRef: number;
}

/**
 * Lignes du tableau : un copropriétaire par ligne, classés par nom de famille.
 * `tantiemesRef` : tantièmes de chaque copropriétaire dans la clé de référence.
 */
export function tableauFinancementCopros(input: {
  variante: VarianteTableauCopros;
  plans: PlanIndividuelPf[];
  data: PlanDefinitifData;
  tantiemesRef: Record<string, number>;
  cleRef: string | null;
  totalCleRef: number;
}): TableauFinancementCopros {
  const { variante, plans, data, tantiemesRef, cleRef, totalCleRef } = input;
  const { dureeEcoPtzAns, coefAssurance, tauxPretAvancePct, pctAvanceAides } = data.params;
  const mois = dureeEcoPtzAns * 12;
  const mensualiteDe = (montant: number) => (mois > 0 ? round2((montant / mois) * coefAssurance) : 0);
  // Variante « sans avance » seule : aucun coût de prêt d'avance n'est facturé.
  const avance = data.variantes.collectif || !data.variantes.collectifSansAvance;

  const lignes = trierParNomFamille(plans, (p) => p.nom).map((p): LigneTableauCopro => {
    const base = {
      coproprietaireId: p.coproprietaireId,
      nom: p.nom,
      tantiemes: tantiemesRef[p.coproprietaireId] ?? 0,
      quotePartAvant: p.quotePartAvant,
      primeCee: p.primeCee,
    };
    if (variante === "collectif") {
      const resteAFinancer = round2(p.reste + p.primeCee);
      const coutPretAvance = avance ? round2((p.aidesPubliques * tauxPretAvancePct) / 100) : 0;
      return {
        ...base,
        resteAFinancer,
        mensualite: mensualiteDe(resteAFinancer),
        coutPretAvance,
        remboursementFinChantier: 0,
        prixRevient: round2(p.reste + coutPretAvance),
      };
    }
    const appelsFonds = round2(p.quotePartAvant - (p.aidesPubliques * pctAvanceAides) / 100 - p.fondsTravaux);
    return {
      ...base,
      resteAFinancer: appelsFonds,
      mensualite: mensualiteDe(appelsFonds),
      coutPretAvance: 0,
      remboursementFinChantier: round2(appelsFonds - p.reste),
      prixRevient: p.reste,
    };
  });

  const somme = (cle: keyof LigneTableauCopro) =>
    round2(lignes.reduce((s, l) => s + (l[cle] as number), 0));
  return {
    variante,
    avance,
    lignes,
    totaux: {
      tantiemes: somme("tantiemes"),
      quotePartAvant: somme("quotePartAvant"),
      resteAFinancer: somme("resteAFinancer"),
      mensualite: somme("mensualite"),
      coutPretAvance: somme("coutPretAvance"),
      primeCee: somme("primeCee"),
      remboursementFinChantier: somme("remboursementFinChantier"),
      prixRevient: somme("prixRevient"),
    },
    dureeAns: dureeEcoPtzAns,
    coefAssurance,
    tauxPretAvancePct,
    pctAvanceAides,
    cleRef,
    totalCleRef,
  };
}

/** Raccourci : tableau depuis le résultat de `repartirPfDepuisLots`. */
export function tableauDepuisRepartition(
  variante: VarianteTableauCopros,
  data: PlanDefinitifData,
  rep: {
    plans: PlanIndividuelPf[];
    cleRef: string | null;
    totauxCles: Record<string, number>;
    parCopro: Map<string, { coproprietaireId: string; tantiemes: Record<string, number> }>;
  }
): TableauFinancementCopros {
  const { cleRef } = rep;
  return tableauFinancementCopros({
    variante,
    plans: rep.plans,
    data,
    tantiemesRef: Object.fromEntries(
      [...rep.parCopro.values()].map((co) => [co.coproprietaireId, cleRef ? (co.tantiemes[cleRef] ?? 0) : 0])
    ),
    cleRef,
    totalCleRef: cleRef ? (rep.totauxCles[cleRef] ?? 0) : 0,
  });
}
