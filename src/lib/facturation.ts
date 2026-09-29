// Facturation des honoraires AMO par jalon (0111) - demande d'Amir 28/09/2026.
//
// Huit jalons par dossier, comme le classeur Notion « AMO COPRO » : P1a, P1b,
// P1c (phase études), P2a, P2b, P2c (phase travaux), FCEE 1 et FCEE 2
// (honoraires sur la prime CEE). Chaque jalon porte un montant HT prévu au
// contrat (ou aucun) et un état : à facturer, facturé en attente de paiement,
// encaissé. Calculs purs, partagés par la page Facturation et le bloc
// « Honoraires » de la fiche du dossier.

export type EtatJalon = "a_facturer" | "facture" | "encaisse";

export const JALONS_HONORAIRES = [
  { code: "P1a", label: "P1a" },
  { code: "P1b", label: "P1b" },
  { code: "P1c", label: "P1c" },
  { code: "P2a", label: "P2a" },
  { code: "P2b", label: "P2b" },
  { code: "P2c", label: "P2c" },
  { code: "FCEE1", label: "FCEE 1" },
  { code: "FCEE2", label: "FCEE 2" },
] as const;

export type CodeJalon = (typeof JALONS_HONORAIRES)[number]["code"];

export const GROUPES_JALONS: { id: string; label: string; court: string; codes: CodeJalon[] }[] = [
  { id: "etudes", label: "Phase 1 - Études", court: "Études", codes: ["P1a", "P1b", "P1c"] },
  { id: "travaux", label: "Phase 2 - Travaux", court: "Travaux", codes: ["P2a", "P2b", "P2c"] },
  { id: "cee", label: "Honoraires CEE", court: "CEE", codes: ["FCEE1", "FCEE2"] },
];

export const LIBELLE_ETAT: Record<EtatJalon, string> = {
  a_facturer: "Reste à facturer",
  facture: "Facturé, en attente de paiement",
  encaisse: "Encaissé",
};

export const LIBELLE_ETAT_COURT: Record<EtatJalon, string> = {
  a_facturer: "À facturer",
  facture: "En attente",
  encaisse: "Encaissé",
};

export const libelleJalon = (code: string): string =>
  JALONS_HONORAIRES.find((j) => j.code === code)?.label ?? code;

export interface JalonHonoraires {
  code: CodeJalon;
  /** null = pas de montant prévu au contrat pour ce jalon */
  montant: number | null;
  etat: EtatJalon;
}

export interface DossierHonoraires {
  coproId: string;
  /** Les 8 jalons, dans l'ordre du contrat (un jalon absent en base vaut « sans montant »). */
  jalons: JalonHonoraires[];
  /** Dernière date de facture connue (AAAA-MM-JJ). */
  derniereFacture: string | null;
  source: string | null;
  /** Bases saisies dans le bloc Honoraires (0112) : qui, quand, sur quel montant ou volume. */
  saisies?: SaisiesHonoraires;
}

export interface SaisiesHonoraires {
  p2MontantHt: number | null;
  p2SaisiLe: string | null;
  p2SaisiPar: string | null;
  ceeKwhc: number | null;
  ceeSaisiLe: string | null;
  ceeSaisiPar: string | null;
}

export interface SommesHonoraires {
  contrat: number;
  encaisse: number;
  enAttente: number;
  resteAFacturer: number;
}

const montant = (j: JalonHonoraires) => (j.montant != null && j.montant > 0 ? j.montant : 0);

export function sommesDossier(d: Pick<DossierHonoraires, "jalons">): SommesHonoraires {
  const s: SommesHonoraires = { contrat: 0, encaisse: 0, enAttente: 0, resteAFacturer: 0 };
  for (const j of d.jalons) {
    const m = montant(j);
    s.contrat += m;
    if (j.etat === "encaisse") s.encaisse += m;
    else if (j.etat === "facture") s.enAttente += m;
    else s.resteAFacturer += m;
  }
  return s;
}

export function sommesPortefeuille(dossiers: Pick<DossierHonoraires, "jalons">[]): SommesHonoraires {
  const s: SommesHonoraires = { contrat: 0, encaisse: 0, enAttente: 0, resteAFacturer: 0 };
  for (const d of dossiers) {
    const x = sommesDossier(d);
    s.contrat += x.contrat;
    s.encaisse += x.encaisse;
    s.enAttente += x.enAttente;
    s.resteAFacturer += x.resteAFacturer;
  }
  return s;
}

// Idée d'Amir 29/09/2026 : la P1a, quand elle a un montant, ne compte pas
// dans le chiffre d'affaires du chef de projet (hachurée sur la page Facturation).
export const JALON_HORS_CA_CHEF: CodeJalon = "P1a";

/** Chiffre d'affaires d'un dossier pour son chef de projet (tous les jalons sauf la P1a) et montant de la P1a mise à part. */
export function caChefProjet(d: Pick<DossierHonoraires, "jalons">): { ca: SommesHonoraires; horsCa: number } {
  return {
    ca: sommesDossier({ jalons: d.jalons.filter((j) => j.code !== JALON_HORS_CA_CHEF) }),
    horsCa: d.jalons.reduce((x, j) => x + (j.code === JALON_HORS_CA_CHEF ? montant(j) : 0), 0),
  };
}

/** Complète les lignes lues en base pour toujours présenter les 8 jalons dans l'ordre. */
export function jalonsOrdonnes(lignes: { jalon: string; montant_ht: number | null; etat: string }[]): JalonHonoraires[] {
  return JALONS_HONORAIRES.map(({ code }) => {
    const l = lignes.find((x) => x.jalon === code);
    const etat: EtatJalon = l && (l.etat === "facture" || l.etat === "encaisse") ? l.etat : "a_facturer";
    return { code, montant: l?.montant_ht ?? null, etat };
  });
}

/** Jalons facturés dont le paiement n'est pas arrivé (montant > 0). */
export const jalonsEnAttente = (d: Pick<DossierHonoraires, "jalons">): JalonHonoraires[] =>
  d.jalons.filter((j) => j.etat === "facture" && montant(j) > 0);

/** Prochain jalon à facturer : le premier, dans l'ordre du contrat, qui a un montant. */
export const prochainJalon = (d: Pick<DossierHonoraires, "jalons">): JalonHonoraires | null =>
  d.jalons.find((j) => j.etat === "a_facturer" && montant(j) > 0) ?? null;

/** Jalon coché facturé ou encaissé dans Notion alors que le contrat n'y prévoit aucun montant. */
export const cocheSansMontant = (j: JalonHonoraires): boolean => montant(j) === 0 && j.etat !== "a_facturer";

// ---------- revalorisation de la P2 et honoraires CEE (0112) ----------
// Idée d'Amir 28/09/2026 : mêmes règles que les fonctions SQL
// honoraires_revaloriser_p2 / honoraires_saisir_cee, qui font foi ; ici
// elles servent à l'aperçu de la fenêtre de saisie.

const arrondi2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Règlement de la phase travaux du contrat AMO : 50 % P2a, 30 % P2b, 20 % P2c. */
export const PARTS_P2 = { P2a: 0.5, P2b: 0.3, P2c: 0.2 } as const;

/** Répartit les honoraires HT de la phase travaux ; P2c prend le reste pour que la somme tombe juste. */
export function repartitionP2(totalHt: number): { P2a: number; P2b: number; P2c: number } {
  const total = arrondi2(totalHt);
  const P2a = arrondi2(total * PARTS_P2.P2a);
  const P2b = arrondi2(total * PARTS_P2.P2b);
  return { P2a, P2b, P2c: arrondi2(total - P2a - P2b) };
}

/** Honoraires CEE : 250 € HT par GWh cumac, pour FCEE 1 et pour FCEE 2. */
export const EUROS_HT_PAR_GWH_CUMAC = 250;

export function honorairesCee(kwhCumac: number): number {
  return arrondi2((Math.round(kwhCumac) / 1_000_000) * EUROS_HT_PAR_GWH_CUMAC);
}

// ---------- ancienneté ----------

const JOUR = 86_400_000;

/** Jours écoulés depuis une date AAAA-MM-JJ (null si pas de date). */
export function joursDepuis(date: string | null, aujourdhui: Date = new Date()): number | null {
  if (!date) return null;
  const t = Date.parse(date + "T00:00:00");
  if (Number.isNaN(t)) return null;
  const a = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate()).getTime();
  return Math.max(0, Math.round((a - t) / JOUR));
}

export function libelleAnciennete(jours: number | null): string {
  if (jours == null) return "sans date";
  if (jours === 0) return "aujourd'hui";
  if (jours < 60) return `il y a ${jours} j`;
  return `il y a ${Math.round(jours / 30.44)} mois`;
}

export interface TrancheAnciennete {
  id: "moins30" | "de30a90" | "de90a180" | "plus180";
  label: string;
  min: number;
  max: number;
}

export const TRANCHES_ANCIENNETE: TrancheAnciennete[] = [
  { id: "moins30", label: "Moins de 30 jours", min: 0, max: 30 },
  { id: "de30a90", label: "30 à 90 jours", min: 30, max: 90 },
  { id: "de90a180", label: "90 à 180 jours", min: 90, max: 180 },
  { id: "plus180", label: "Plus de 180 jours", min: 180, max: Infinity },
];

/** Tranche d'ancienneté d'un impayé ; sans date, il rejoint la plus ancienne (à vérifier en priorité). */
export function trancheAnciennete(jours: number | null): TrancheAnciennete {
  if (jours == null) return TRANCHES_ANCIENNETE[TRANCHES_ANCIENNETE.length - 1];
  return TRANCHES_ANCIENNETE.find((t) => jours >= t.min && jours < t.max) ?? TRANCHES_ANCIENNETE[TRANCHES_ANCIENNETE.length - 1];
}

/** Délai au-delà duquel un dossier avec du reste à facturer est dit « en sommeil ». */
export const JOURS_SOMMEIL = 365;

export function enSommeil(d: DossierHonoraires, aujourdhui: Date = new Date()): boolean {
  const j = joursDepuis(d.derniereFacture, aujourdhui);
  return sommesDossier(d).resteAFacturer > 0 && j != null && j > JOURS_SOMMEIL;
}

// ---------- graphiques ----------

/** Graduations régulières de 0 à un maximum arrondi au pas supérieur. */
export function graduations(max: number, pas: number): { max: number; ticks: number[] } {
  const haut = Math.max(pas, Math.ceil(max / pas) * pas);
  const ticks: number[] = [];
  for (let v = 0; v <= haut + 1e-9; v += pas) ticks.push(v);
  return { max: haut, ticks };
}

/** Pas « rond » pour un axe en euros : environ 3 à 6 graduations. */
export function pasAxeEuros(max: number): number {
  const candidats = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000];
  return candidats.find((p) => max / p <= 6) ?? 1_000_000;
}

export const pourcent = (part: number, total: number): number => (total > 0 ? Math.round((part / total) * 100) : 0);
