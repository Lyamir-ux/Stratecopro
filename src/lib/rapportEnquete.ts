// Synthèse du rapport d'enquête sociale en PDF (demande d'Amir du 04/10/2026 :
// « le rapport d'enquête doit être au format PDF et faire une synthèse des
// réponses des copropriétaires, avec le nombre de copropriétaires occupants et
// leur profil »). Calcul pur, depuis la base individuelle par copropriétaire
// (api/dossiersCopros) et l'occupation de la fiche État (lib/ficheEtat) : les
// chiffres du rapport et ceux de la fiche État ANAH concordent.
import type { DossierCoproprietaire } from "@/api/dossiersCopros";
import type { Profil } from "@/lib/finance";
import { cleReference, type OccupationFiche, type StatutLot } from "@/lib/ficheEtat";
import { trierParNomFamille } from "@/lib/nomFamille";

/** Lot tel que lu par useDonnees (seuls les champs utiles ici). */
export interface LotRapport {
  id: string;
  num: string;
  usage: string;
  coproprietaire_id: string | null;
  batiment: { code: string } | null;
  tantiemes: Record<string, number>;
}

export interface EntreeSynthese {
  dossiers: DossierCoproprietaire[];
  lots: LotRapport[];
  cles: { code: string; is_default: boolean }[];
  /** Codes des bâtiments du dossier, dans l'ordre. */
  batiments: string[];
  occupation: OccupationFiche;
}

export const ORDRE_PROFILS: (Profil | null)[] = ["Bleu", "Jaune", "Violet", "Rose", null];

/** Au-delà, les tableaux par bâtiment ne tiennent plus dans la largeur : total seul. */
export const MAX_COLONNES_BATIMENTS = 5;
const SANS_BATIMENT = "-";

export interface Compte {
  label: string;
  n: number;
}

export interface LigneVigilance extends Compte {
  /** Situation à traiter en priorité (impayés en cours, mesure de protection…). */
  alerte: boolean;
}

export interface OccupantRapport {
  id: string;
  nom: string;
  batiment: string | null;
  /** Logements occupés par le propriétaire. */
  logements: string[];
  personnes: number | null;
  profil: Profil | null;
  profilStatut: "verifie" | "declaratif" | null;
  profilVerifieLe: string | null;
  repondu: boolean;
  source: "enquete" | "adresse" | "inconnu";
}

export interface CategorieOccupation {
  copros: number;
  logements: number;
  tantiemes: number;
  parBatiment: Record<string, number>;
}

export interface SyntheseEnquete {
  /** Colonnes « par bâtiment » des tableaux (vide : une seule colonne Total). */
  batiments: string[];
  nbBatiments: number;
  nbCopros: number;
  nbLogements: number;
  totalTantiemes: number;
  participation: {
    total: { copros: number; reponses: number; complets: number };
    parBatiment: Record<string, { copros: number; reponses: number; complets: number }>;
  };
  occupation: {
    po: CategorieOccupation;
    pb: CategorieOccupation & { loues: number; vacants: number };
    inconnue: CategorieOccupation;
    /** Copropriétaires sans logement (commerces, annexes seules) et lots sans propriétaire. */
    autres: CategorieOccupation;
    /** Propriétaires à la fois occupants et bailleurs, comptés dans les deux catégories. */
    mixtes: number;
    sources: OccupationFiche["sources"];
  };
  profils: { profil: Profil | null; n: number; verifies: number; parBatiment: Record<string, number> }[];
  nbModestes: number;
  nbTresModestes: number;
  occupants: OccupantRapport[];
  /** `repondants` : ménages occupants ayant répondu ; `reponsesComposition` : réponses à la question composition. */
  menages: { repondants: number; personnes: number; reponsesComposition: number; composition: Compte[]; retraites: number | null };
  vigilance: { repondants: number; lignes: LigneVigilance[] };
  avis: { n: number; options: Compte[] } | null;
  visite: { oui: number; sousConditions: number; n: number } | null;
}

const COMPOSITIONS = [
  "Personne seule",
  "Couple sans enfant",
  "Couple avec enfant(s)",
  "Famille monoparentale",
  "Autre (colocation, hébergement familial…)",
];
const IMPORTANCES = ["Indispensables", "Utiles", "Peu utiles", "Inutiles", "Sans avis"];

function valeurCopro(d: DossierCoproprietaire, qid: string): unknown {
  return d.enquete.reponses?.copro?.[qid];
}

function valeursLots(d: DossierCoproprietaire, qid: string): unknown[] {
  const lots = d.enquete.reponses?.lots ?? {};
  return d.lots.map((l) => lots[l.id]?.[qid]).filter((v) => v != null && v !== "");
}

const contient = (v: unknown, option: string): boolean => (Array.isArray(v) ? v.includes(option) : v === option);
const renseigne = (v: unknown): boolean => v != null && v !== "" && !(Array.isArray(v) && v.length === 0);

function tantiemesLot(l: LotRapport, cle: string | null): number {
  return cle ? l.tantiemes[cle] ?? 0 : 0;
}

function trierLots(lots: LotRapport[]): LotRapport[] {
  return [...lots].sort((a, b) => a.num.localeCompare(b.num, "fr", { numeric: true }));
}

/** Bâtiment de rattachement d'un copropriétaire : celui du premier lot retenu (logement d'abord). */
function batimentDe(lots: LotRapport[]): string {
  const tries = trierLots(lots);
  const logement = tries.find((l) => l.usage === "habitation");
  return (logement ?? tries[0])?.batiment?.code ?? SANS_BATIMENT;
}

function incrementer(m: Record<string, number>, cle: string) {
  m[cle] = (m[cle] ?? 0) + 1;
}

export function syntheseEnquete(e: EntreeSynthese): SyntheseEnquete {
  const { dossiers, occupation } = e;
  const cle = cleReference(e.cles);
  const codes = e.batiments.length ? e.batiments : [...new Set(e.lots.map((l) => l.batiment?.code).filter((c): c is string => !!c))].sort();
  const avecSansBatiment = e.lots.some((l) => !l.batiment?.code);
  const colonnes = codes.length >= 2 && codes.length <= MAX_COLONNES_BATIMENTS ? [...codes, ...(avecSansBatiment ? [SANS_BATIMENT] : [])] : [];

  const lotsParCp = new Map<string, LotRapport[]>();
  for (const l of e.lots) {
    if (!l.coproprietaire_id) continue;
    lotsParCp.set(l.coproprietaire_id, [...(lotsParCp.get(l.coproprietaire_id) ?? []), l]);
  }
  const logements = e.lots.filter((l) => l.usage === "habitation");
  const statutLot = (l: LotRapport): StatutLot => occupation.parLot[l.id]?.statut ?? "inconnu";
  const totalTantiemes = e.lots.reduce((s, l) => s + tantiemesLot(l, cle), 0);

  // ---------- participation
  const participation: SyntheseEnquete["participation"] = { total: { copros: 0, reponses: 0, complets: 0 }, parBatiment: {} };
  for (const d of dossiers) {
    const b = batimentDe(lotsParCp.get(d.id) ?? []);
    const cible = (participation.parBatiment[b] ??= { copros: 0, reponses: 0, complets: 0 });
    for (const t of [participation.total, cible]) {
      t.copros += 1;
      if (d.enquete.repondu) t.reponses += 1;
      if (d.enquete.complet) t.complets += 1;
    }
  }

  // ---------- occupation
  const categorie = (): CategorieOccupation => ({ copros: 0, logements: 0, tantiemes: 0, parBatiment: {} });
  const po = categorie();
  const pb = { ...categorie(), loues: 0, vacants: 0 };
  const inconnue = categorie();
  const autres = categorie();
  for (const l of logements) {
    const s = statutLot(l);
    if (s === "PO") po.logements += 1;
    else if (s === "PB") pb.loues += 1;
    else if (s === "vacant") pb.vacants += 1;
    else inconnue.logements += 1;
  }
  pb.logements = pb.loues + pb.vacants;
  const dansDetail = new Set(occupation.detail.map((x) => x.id));
  for (const x of occupation.detail) {
    const lots = lotsParCp.get(x.id) ?? [];
    const logts = trierLots(lots.filter((l) => l.usage === "habitation"));
    const premier = (statuts: StatutLot[]) => logts.find((l) => statuts.includes(statutLot(l)))?.batiment?.code ?? SANS_BATIMENT;
    if (x.statut === "PO" || x.statut === "mixte") {
      po.copros += 1;
      po.tantiemes += x.tantiemesPO;
      incrementer(po.parBatiment, premier(["PO"]));
    }
    if (x.statut === "PB" || x.statut === "mixte") {
      pb.copros += 1;
      pb.tantiemes += x.tantiemesPB;
      incrementer(pb.parBatiment, premier(["PB", "vacant"]));
    }
    if (x.statut === "inconnu") {
      inconnue.copros += 1;
      incrementer(inconnue.parBatiment, batimentDe(lots));
    }
  }
  inconnue.tantiemes = e.lots.filter((l) => l.coproprietaire_id && dansDetail.has(l.coproprietaire_id) && statutLot(l) === "inconnu").reduce((s, l) => s + tantiemesLot(l, cle), 0);
  for (const d of dossiers) {
    if (dansDetail.has(d.id)) continue;
    autres.copros += 1;
    incrementer(autres.parBatiment, batimentDe(lotsParCp.get(d.id) ?? []));
  }
  autres.tantiemes = Math.max(0, totalTantiemes - po.tantiemes - pb.tantiemes - inconnue.tantiemes);

  // ---------- profils des occupants
  const parId = new Map(dossiers.map((d) => [d.id, d]));
  const occupantsBruts = occupation.detail.filter((x) => x.statut === "PO" || x.statut === "mixte");
  const occupants: OccupantRapport[] = trierParNomFamille(occupantsBruts, (x) => x.nom).map((x) => {
    const d = parId.get(x.id);
    const logts = trierLots((lotsParCp.get(x.id) ?? []).filter((l) => l.usage === "habitation" && statutLot(l) === "PO"));
    return {
      id: x.id,
      nom: d?.nom ?? x.nom,
      batiment: logts[0]?.batiment?.code ?? null,
      logements: logts.map((l) => l.num),
      personnes: d?.enquete.nbPersonnes ?? null,
      profil: d?.enquete.profil ?? null,
      profilStatut: d?.enquete.profilStatut ?? null,
      profilVerifieLe: d?.enquete.profilVerifieLe ?? null,
      repondu: !!d?.enquete.repondu,
      source: x.source,
    };
  });
  const profils = ORDRE_PROFILS.map((p) => {
    const liste = occupants.filter((o) => o.profil === p);
    const parBatiment: Record<string, number> = {};
    for (const o of liste) incrementer(parBatiment, o.batiment ?? SANS_BATIMENT);
    return { profil: p, n: liste.length, verifies: liste.filter((o) => o.profilStatut === "verifie").length, parBatiment };
  });

  // ---------- ménages occupants
  const occupantsDossiers = occupants.map((o) => parId.get(o.id)).filter((d): d is DossierCoproprietaire => !!d);
  const menagesRepondants = occupantsDossiers.filter((d) => d.enquete.repondu);
  const compo = menagesRepondants.map((d) => valeurCopro(d, "composition-menage")).filter(renseigne);
  const csp = menagesRepondants.map((d) => valeurCopro(d, "csp-reference")).filter(renseigne);
  const menages = {
    repondants: menagesRepondants.length,
    personnes: menagesRepondants.reduce((s, d) => s + (d.enquete.nbPersonnes ?? 0), 0),
    reponsesComposition: compo.length,
    composition: compo.length ? COMPOSITIONS.map((label) => ({ label, n: compo.filter((v) => v === label).length })) : [],
    retraites: csp.length ? csp.filter((v) => v === "Retraité").length : null,
  };

  // ---------- vigilance (tous les répondants)
  const repondants = dossiers.filter((d) => d.enquete.repondu);
  const lignes: LigneVigilance[] = [];
  const ajouter = (label: string, qid: string, test: (v: unknown) => boolean, alerte = false) => {
    const valeurs = repondants.map((d) => valeurCopro(d, qid));
    if (!valeurs.some(renseigne)) return; // question non posée
    lignes.push({ label, n: valeurs.filter((v) => renseigne(v) && test(v)).length, alerte });
  };
  const ajouterLots = (label: string, qid: string, option: string, alerte = false) => {
    const parCp = repondants.map((d) => valeursLots(d, qid));
    if (!parCp.some((v) => v.length)) return;
    lignes.push({ label, n: parCp.filter((v) => v.some((x) => contient(x, option))).length, alerte });
  };
  ajouter("Impayés de charges en cours", "impayes-charges", (v) => v === "Oui, avec des impayés en cours", true);
  ajouter("Difficultés ponctuelles pour payer les charges", "impayes-charges", (v) => v === "Oui, ponctuellement");
  ajouter("Handicap ou perte d'autonomie dans le foyer", "situations-foyer", (v) => contient(v, "Handicap ou perte d'autonomie"));
  ajouter("Personne isolée", "situations-foyer", (v) => contient(v, "Personne isolée"));
  ajouter("Famille monoparentale", "situations-foyer", (v) => contient(v, "Famille monoparentale"));
  ajouter("Sauvegarde de justice, curatelle ou tutelle", "curatelle-tutelle", (v) => v !== "Non", true);
  ajouter("Situation sociale particulière signalée", "situation-sociale", (v) => typeof v === "string" && v.startsWith("Oui"));
  ajouterLots("Projet de vente avant les travaux", "projet-vente", "Oui, avant les travaux");
  ajouterLots("Logement insalubre ou très dégradé", "difficultes-logement", "Insalubre ou très dégradé", true);
  ajouterLots("Logement sur-occupé", "difficultes-logement", "Sur-occupation");
  ajouterLots("Logement difficile à chauffer", "difficultes-logement", "Difficile à chauffer");

  // ---------- regard sur le projet
  const importances = repondants.map((d) => valeurCopro(d, "importance-travaux")).filter(renseigne);
  const avis = importances.length ? { n: importances.length, options: IMPORTANCES.map((label) => ({ label, n: importances.filter((v) => v === label).length })) } : null;
  const visites = repondants.map((d) => valeurCopro(d, "accord-visite")).filter(renseigne);
  const visite = visites.length
    ? {
        n: visites.length,
        oui: visites.filter((v) => typeof v === "string" && v.startsWith("Oui")).length,
        sousConditions: visites.filter((v) => v === "Oui, sous conditions (précisez)").length,
      }
    : null;

  return {
    batiments: colonnes,
    nbBatiments: codes.length || (e.lots.length ? 1 : 0),
    nbCopros: dossiers.length,
    nbLogements: logements.length,
    totalTantiemes,
    participation,
    occupation: { po, pb, inconnue, autres, mixtes: occupation.mixtes.length, sources: occupation.sources },
    profils,
    nbModestes: occupants.filter((o) => o.profil === "Jaune").length,
    nbTresModestes: occupants.filter((o) => o.profil === "Bleu").length,
    occupants,
    menages,
    vigilance: { repondants: repondants.length, lignes },
    avis,
    visite,
  };
}

/** Pourcentage arrondi à l'unité (« - » si la base est nulle). */
export function pct(n: number, base: number): string {
  return base > 0 ? `${Math.round((n / base) * 100)} %` : "-";
}
