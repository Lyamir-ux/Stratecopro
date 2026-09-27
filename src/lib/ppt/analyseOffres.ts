// Analyse des offres d'une consultation PPPT + DPE collectif (migration 0109,
// idée d'Amir 27/09/2026) : la demande du syndic est publiée directement aux
// bureaux d'études référencés ; l'équipe compare les offres, rédige son avis et
// le publie ; le syndic retrouve alors sur sa fiche PPT les offres, leurs pièces
// et un PDF à présenter en assemblée générale.
// Logique pure : comparatif, synthèse, étape de la consultation, libellés.

/** TVA des prestations intellectuelles (PPPT, DPE collectif) : taux normal. */
export const TVA_PRESTATIONS_PCT = 20;

/** Offre telle que lue en base (sous-ensemble de candidatures). */
export interface OffreLite {
  id: string;
  org_name: string;
  montant: number | null;
  message: string | null;
  fichier_path: string | null;
  fichier_name: string | null;
  received_at: string;
  retrait_at?: string | null;
  /** Prix et délais séparés (0110), € HT et semaines à compter de la commande. */
  tarif_pppt?: number | null;
  tarif_dpe?: number | null;
  delai_pppt_semaines?: number | null;
  delai_dpe_semaines?: number | null;
}

/** Une prestation de l'offre : prix HT et délai de réalisation (semaines). */
export interface PrestationOffre {
  ht: number | null;
  delaiSemaines: number | null;
}

export interface OffreComparee {
  id: string;
  bureau: string;
  montantHt: number | null;
  montantTtc: number | null;
  /** Écart au moins-disant en fraction (0,25 = + 25 %), null sans montant. */
  ecart: number | null;
  /** Rang par prix croissant (1 = moins-disant), null sans montant. */
  rang: number | null;
  moinsDisante: boolean;
  recommandee: boolean;
  message: string | null;
  fichier: { path: string; name: string } | null;
  recueLe: string;
  pppt: PrestationOffre;
  dpe: PrestationOffre;
  /** Délai de la prestation la plus longue (les deux peuvent se mener de front), null sans délai. */
  delaiMaxSemaines: number | null;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Offres non retirées, du moins cher au plus cher (sans montant en dernier, par date de réception). */
export function comparerOffres(offres: OffreLite[], recommandeeId: string | null | undefined): OffreComparee[] {
  const vivantes = offres.filter((o) => !o.retrait_at);
  const triees = [...vivantes].sort((a, b) => {
    if (a.montant != null && b.montant != null && a.montant !== b.montant) return a.montant - b.montant;
    if (a.montant != null && b.montant == null) return -1;
    if (a.montant == null && b.montant != null) return 1;
    return a.received_at.localeCompare(b.received_at);
  });
  const min = triees.find((o) => o.montant != null && o.montant > 0)?.montant ?? null;
  let rang = 0;
  let precedent: number | null = null;
  return triees.map((o, i) => {
    if (o.montant != null) {
      // ex aequo : même rang
      if (o.montant !== precedent) rang = i + 1;
      precedent = o.montant;
    }
    return {
      id: o.id,
      bureau: o.org_name,
      montantHt: o.montant,
      montantTtc: o.montant != null ? arrondi(o.montant * (1 + TVA_PRESTATIONS_PCT / 100)) : null,
      ecart: o.montant != null && min ? arrondi(o.montant / min - 1) : null,
      rang: o.montant != null ? rang : null,
      moinsDisante: o.montant != null && min != null && o.montant === min,
      recommandee: !!recommandeeId && o.id === recommandeeId,
      message: o.message?.trim() || null,
      fichier: o.fichier_path ? { path: o.fichier_path, name: o.fichier_name || "Offre" } : null,
      recueLe: o.received_at,
      pppt: { ht: o.tarif_pppt ?? null, delaiSemaines: o.delai_pppt_semaines ?? null },
      dpe: { ht: o.tarif_dpe ?? null, delaiSemaines: o.delai_dpe_semaines ?? null },
      delaiMaxSemaines:
        o.delai_pppt_semaines != null || o.delai_dpe_semaines != null
          ? Math.max(o.delai_pppt_semaines ?? 0, o.delai_dpe_semaines ?? 0)
          : null,
    };
  });
}

export interface SyntheseOffres {
  nb: number;
  chiffrees: number;
  minHt: number | null;
  maxHt: number | null;
  moyenneHt: number | null;
  recommandee: OffreComparee | null;
  /** Offres qui détaillent PPPT et DPE (0110) : le comparatif montre alors les deux colonnes. */
  detaillees: number;
  /** Délai le plus court annoncé (prestation la plus longue de chaque offre), en semaines. */
  delaiMinSemaines: number | null;
}

export function syntheseOffres(offres: OffreComparee[]): SyntheseOffres {
  const montants = offres.map((o) => o.montantHt).filter((m): m is number => m != null);
  return {
    nb: offres.length,
    chiffrees: montants.length,
    minHt: montants.length ? Math.min(...montants) : null,
    maxHt: montants.length ? Math.max(...montants) : null,
    moyenneHt: montants.length ? arrondi(montants.reduce((s, m) => s + m, 0) / montants.length) : null,
    recommandee: offres.find((o) => o.recommandee) ?? null,
    detaillees: offres.filter((o) => o.pppt.ht != null || o.dpe.ht != null || o.pppt.delaiSemaines != null || o.dpe.delaiSemaines != null).length,
    delaiMinSemaines: (() => {
      const d = offres.map((o) => o.delaiMaxSemaines).filter((v): v is number => v != null);
      return d.length ? Math.min(...d) : null;
    })(),
  };
}

/** « 5 400 € » / « 8 sem. » - libellé d'une prestation (écran et PDF). */
export function libellePrestation(p: PrestationOffre, euro: (n: number) => string): { prix: string; delai: string | null } {
  return { prix: p.ht != null ? euro(p.ht) : "-", delai: p.delaiSemaines != null ? `${p.delaiSemaines} sem.` : null };
}

/** Suivi d'une consultation vu du syndic (RPC ppt_consultations_suivi). */
export interface SuiviConsultation {
  consultation_id: string;
  statut: string;
  published_at: string;
  date_limite: string | null;
  analyse_publiee_le: string | null;
  bureaux_consultes: number;
  offres_recues: number;
}

export type EtapeConsultation = "en_cours" | "cloturee" | "analyse";

/** En cours (en ligne), clôturée sans analyse (analyse en préparation), analyse publiée. */
export function etapeConsultation(s: Pick<SuiviConsultation, "statut" | "analyse_publiee_le">): EtapeConsultation {
  if (s.analyse_publiee_le) return "analyse";
  return s.statut === "en_ligne" ? "en_cours" : "cloturee";
}

/** Jours restants avant la date limite (négatif une fois passée), null sans date. */
export function joursRestants(dateLimite: string | null, aujourdHui: Date = new Date()): number | null {
  if (!dateLimite) return null;
  const fin = new Date(dateLimite + "T23:59:59");
  return Math.ceil((fin.getTime() - aujourdHui.getTime()) / 86_400_000) - 1;
}

/** Demande de consultation vue sur une carte du tableau de bord PPT. */
export function libelleDemandeConsultation(d: { statut: string; consultation_id?: string | null }): { court: string; kind: "blue" | "success" } {
  if (d.statut === "traitee") return d.consultation_id ? { court: "Analyse des offres disponible", kind: "success" } : { court: "Consultation prise en charge", kind: "success" };
  return d.consultation_id ? { court: "Consultation en cours", kind: "blue" } : { court: "Consultation demandée", kind: "blue" };
}
