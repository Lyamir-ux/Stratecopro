// Vue individuelle par copropriétaire (feedback Théa 03/09/2026) : une seule
// base pour la liste « qui me manque quoi », la fiche individuelle et les
// trois exports (liste des primes, rapport d'enquête sociale, fiche état).
// Tout est assemblé ici, une fois, depuis les mêmes requêtes que les onglets
// existants - les montants sont ceux du plan partagé au portail (ou du PF
// définitif validé), arrondis au centime, donc concordants entre les écrans.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Enums, Tables } from "@/lib/database.types";
import {
  computePlanDefinitif,
  readPlanDefinitif,
  repartirPfDepuisLots,
  round2,
  type Bareme,
  type Profil,
} from "@/lib/finance";
import { useDonnees, type DonneesCopro, type LotFull } from "./donnees";
import { useEnquete, useReponses, type Reponse } from "./enquete";
import { readParams, useBareme, useChoixFinancementScenario, usePlansIndividuels, useScenarios } from "./scenarios";
import { usePlansDefinitifs, type PlanDefinitif } from "./planDefinitif";
import { useAdhesions, type AdhesionAvecNom } from "./financement";
import { useBulletinsCopro, type BulletinAvecSignataires } from "./signature";
import type { CoproWithStats } from "./copros";

export type TypePiece = Enums<"type_piece">;
export type PieceJustificative = Tables<"pieces_justificatives">;
export type ChoixRow = Tables<"choix_financement"> & { coproprietaires: { nom: string } | null };

/** Pièces justificatives déposées par les copropriétaires du dossier (lecture AMO). */
export function usePiecesCopro(coproId: string | undefined) {
  return useQuery({
    queryKey: ["pieces-copro", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<PieceJustificative[]> => {
      const { data, error } = await supabase.from("pieces_justificatives").select("*").eq("copro_id", coproId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type EtatItem = "ok" | "en_cours" | "manquant" | "na";
export type StatutDossier = "complet" | "incomplet" | "non_commence";

export interface ReponsesJsonAmo {
  copro?: Record<string, unknown>;
  lots?: Record<string, Record<string, unknown>>;
  complet?: boolean;
  transmisLe?: string;
}

export interface DossierCoproprietaire {
  id: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  /** Codes des bâtiments (ou entrées) où le copropriétaire a des lots. */
  batiments: string[];
  lots: LotFull[];
  nbLotsHab: number;
  /** Tantièmes sommés par code de clé. */
  tantiemes: Record<string, number>;
  enquete: {
    reponse: Reponse | null;
    repondu: boolean;
    /** questionnaire transmis complet depuis le portail */
    complet: boolean;
    date: string | null;
    profil: Profil | null;
    profilStatut: "declaratif" | "verifie" | null;
    profilVerifieLe: string | null;
    nbPersonnes: number | null;
    rfr: number | null;
    rfrN2: number | null;
    occupation: string | null;
    reponses: ReponsesJsonAmo | null;
  };
  plan: {
    source: "pf" | "scenario";
    /** Quote-part TTC de l'opération avant aides. */
    quotePart: number;
    /** Aides collectives affectées (MPR Copro + fonds travaux), prime CEE exclue. */
    aidesColl: number;
    primeCee: number;
    /** Prime MaPrimeRénov' individuelle : montant du plan, sinon barème du scénario selon le profil. */
    mprIndiv: number;
    mprSource: "plan" | "bareme" | "indetermine";
    /** À financer avant travaux (hors CEE) = quote-part - aides collectives - prime individuelle. */
    resteAvantTravaux: number;
    /** Reste à charge final (CEE déduits). */
    reste: number;
    publieLe: string | null;
    partage: boolean;
  } | null;
  financement: ChoixRow | null;
  adhesion: AdhesionAvecNom | null;
  bulletinsElec: BulletinAvecSignataires[];
  pieces: Partial<Record<TypePiece, PieceJustificative>>;
  etat: {
    profil: EtatItem;
    prime: EtatItem;
    financement: EtatItem;
    bulletin: EtatItem;
    sepa: EtatItem;
    rib: EtatItem;
    cni: EtatItem;
    avis: EtatItem;
    /** libellés de ce qui manque encore */
    manquants: string[];
    statut: StatutDossier;
  };
}

export interface DossiersCopro {
  dossiers: DossierCoproprietaire[];
  /** Scénario partagé au portail (ou importé) qui porte les plans individuels. */
  scenario: Tables<"scenarios_financiers"> | null;
  planValide: PlanDefinitif | null;
  /** Codes des bâtiments du dossier, dans l'ordre. */
  batiments: string[];
  cleRef: string | null;
  bareme: Bareme | null;
  chargement: boolean;
}

const OCCUPATION_LABEL = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s.includes("bailleur")) return "Bailleur";
  if (s.includes("occupant")) return "Occupant";
  if (s.includes("vacant")) return "Vacant";
  return v;
};

export function libelleOccupation(v: string | null | undefined): string | null {
  return OCCUPATION_LABEL(v);
}

/**
 * Assemble les dossiers individuels. Pure (exportée pour les tests et les
 * exports) : toutes les sources sont passées en paramètres.
 */
export function assemblerDossiers(input: {
  donnees: DonneesCopro;
  reponses: Reponse[];
  scenario: Tables<"scenarios_financiers"> | null;
  plansIndiv: (Tables<"plans_individuels"> & { coproprietaires?: { nom: string } | null })[];
  choix: ChoixRow[];
  planValide: PlanDefinitif | null;
  adhesions: AdhesionAvecNom[];
  bulletins: BulletinAvecSignataires[];
  pieces: PieceJustificative[];
  bareme: Bareme | null;
}): { dossiers: DossierCoproprietaire[]; cleRef: string | null } {
  const { donnees, scenario, bareme } = input;
  const repById = new Map(input.reponses.map((r) => [r.coproprietaire_id, r]));
  const planById = new Map(input.plansIndiv.map((p) => [p.coproprietaire_id, p]));
  const choixById = new Map(input.choix.map((c) => [c.coproprietaire_id, c]));
  const adhById = new Map(input.adhesions.map((a) => [a.coproprietaire_id, a]));
  const piecesById = new Map<string, Partial<Record<TypePiece, PieceJustificative>>>();
  for (const p of input.pieces) {
    const cur = piecesById.get(p.coproprietaire_id) ?? {};
    cur[p.type] = p;
    piecesById.set(p.coproprietaire_id, cur);
  }
  const bulletinsById = new Map<string, BulletinAvecSignataires[]>();
  for (const b of input.bulletins) {
    if (b.statut === "annule" || b.statut === "brouillon") continue;
    bulletinsById.set(b.coproprietaire_id, [...(bulletinsById.get(b.coproprietaire_id) ?? []), b]);
  }

  // Plans individuels du PF définitif validé (même moteur que l'onglet Financement).
  let pfPlans: Map<string, { quotePartAvant: number; aidesEtFonds: number; primeCee: number; reste: number }> | null = null;
  let cleRef: string | null = null;
  if (input.planValide?.data) {
    const pdata = readPlanDefinitif(input.planValide.data);
    const rep = repartirPfDepuisLots(pdata, computePlanDefinitif(pdata), donnees.lots, donnees.cles);
    cleRef = rep.cleRef;
    if (rep.manquants.length === 0) pfPlans = new Map(rep.plans.map((p) => [p.coproprietaireId, p]));
  }
  if (!cleRef) cleRef = donnees.cles.find((k) => k.is_default)?.code ?? donnees.cles[0]?.code ?? null;
  const params = scenario && bareme ? readParams(scenario.params, bareme) : null;
  const partage = scenario?.statut === "partage";
  const publieLe = partage ? scenario!.updated_at : null;
  // Le PF validé n'est « publié » que si le scénario pont partagé en est issu
  // (un PF revalidé après coup attend un nouveau partage).
  const partagePf = partage && !!input.planValide && scenario!.plan_definitif_id === input.planValide.id;

  const lotsByCp = new Map<string, LotFull[]>();
  for (const l of donnees.lots) {
    if (!l.coproprietaire_id) continue;
    lotsByCp.set(l.coproprietaire_id, [...(lotsByCp.get(l.coproprietaire_id) ?? []), l]);
  }

  const dossiers = donnees.coproprietaires.map((cp): DossierCoproprietaire => {
    const lots = (lotsByCp.get(cp.id) ?? []).slice().sort((a, b) => a.num.localeCompare(b.num, "fr", { numeric: true }));
    const tantiemes: Record<string, number> = {};
    for (const l of lots) for (const [k, v] of Object.entries(l.tantiemes)) tantiemes[k] = (tantiemes[k] ?? 0) + v;
    const batiments = [...new Set(lots.map((l) => l.batiment?.code).filter((v): v is string => !!v))].sort();

    const r = repById.get(cp.id) ?? null;
    const reponses = (r?.reponses ?? null) as ReponsesJsonAmo | null;
    const profil = (r?.profil_mpr as Profil | null) ?? null;
    const verifie = !!r && r.profil_statut === "verifie" && !!r.profil_verifie_le;
    const enquete: DossierCoproprietaire["enquete"] = {
      reponse: r,
      repondu: !!r && (profil != null || !!reponses?.copro),
      complet: !!reponses?.complet,
      date: r?.updated_at ?? null,
      profil,
      profilStatut: profil ? (verifie ? "verifie" : "declaratif") : null,
      profilVerifieLe: verifie ? r!.profil_verifie_le : null,
      nbPersonnes: r?.nb_personnes ?? null,
      rfr: r?.rfr != null ? Number(r.rfr) : null,
      rfrN2: r?.rfr_n2 != null ? Number(r.rfr_n2) : null,
      occupation: OCCUPATION_LABEL(r?.statut_occupation),
      reponses,
    };

    // Plan individuel : PF définitif validé en priorité, sinon plan du scénario partagé.
    let plan: DossierCoproprietaire["plan"] = null;
    const pf = pfPlans?.get(cp.id);
    const pi = planById.get(cp.id);
    const primeBareme = profil && params ? params.primeIndiv[profil] ?? 0 : 0;
    if (pf) {
      const aidesColl = round2(pf.aidesEtFonds - pf.primeCee);
      const mprIndiv = profil ? round2(primeBareme) : 0;
      plan = {
        source: "pf",
        quotePart: round2(pf.quotePartAvant),
        aidesColl,
        primeCee: round2(pf.primeCee),
        mprIndiv,
        mprSource: profil ? "bareme" : "indetermine",
        resteAvantTravaux: round2(Math.max(0, pf.quotePartAvant - aidesColl - mprIndiv)),
        reste: round2(Math.max(0, pf.quotePartAvant - aidesColl - mprIndiv - pf.primeCee)),
        publieLe: partagePf ? publieLe : null,
        partage: partagePf,
      };
    } else if (pi) {
      const quotePart = round2(Number(pi.quote_part));
      const aidesColl = round2(Number(pi.subv_coll_part));
      const primeCee = round2(Number(pi.cee_part));
      const mprPlan = round2(Number(pi.mpr_indiv));
      const mprIndiv = !profil ? 0 : mprPlan > 0 ? mprPlan : round2(primeBareme);
      plan = {
        source: "scenario",
        quotePart,
        aidesColl,
        primeCee,
        mprIndiv,
        mprSource: !profil ? "indetermine" : mprPlan > 0 ? "plan" : "bareme",
        resteAvantTravaux: round2(Math.max(0, quotePart - aidesColl - mprIndiv)),
        reste: round2(Math.max(0, quotePart - aidesColl - mprIndiv - primeCee)),
        publieLe,
        partage,
      };
    }

    const financement = choixById.get(cp.id) ?? null;
    const adhesion = adhById.get(cp.id) ?? null;
    const bulletinsElec = bulletinsById.get(cp.id) ?? [];
    const pieces = piecesById.get(cp.id) ?? {};

    // ---- état du dossier ----
    const manquants: string[] = [];
    const etatProfil: EtatItem = profil ? "ok" : "manquant";
    if (!profil) manquants.push("profil de ressources (enquête sociale)");
    const etatPrime: EtatItem = !plan ? "na" : plan.mprSource === "indetermine" ? "manquant" : "ok";
    const collectif = financement?.type === "collectif";
    const etatFin: EtatItem = !partage ? "na" : financement ? "ok" : "manquant";
    if (etatFin === "manquant") manquants.push("choix de financement");
    let etatBulletin: EtatItem = "na";
    let etatSepa: EtatItem = "na";
    if (collectif) {
      const signe = adhesion?.statut === "signee" || bulletinsElec.some((b) => b.statut === "complet");
      const enCours = !!adhesion || bulletinsElec.some((b) => b.statut === "en_signature");
      etatBulletin = signe ? "ok" : enCours ? "en_cours" : "manquant";
      if (etatBulletin !== "ok") manquants.push("bulletin d'adhésion" + (etatBulletin === "en_cours" ? " (en cours)" : ""));
      etatSepa = adhesion?.sepa_path ? "ok" : "manquant";
      if (etatSepa !== "ok") manquants.push("mandat SEPA");
    }
    const aRib = !!pieces.rib || bulletinsElec.some((b) => !!b.rib_path && !b.purge_effectuee_le);
    const etatRib: EtatItem = aRib ? "ok" : "manquant";
    if (!aRib) manquants.push("RIB");
    const aCni = !!pieces.piece_identite || bulletinsElec.some((b) => b.signataires.some((sg) => !!sg.piece_identite_path));
    const etatCni: EtatItem = aCni ? "ok" : "manquant";
    if (!aCni) manquants.push("pièce d'identité");
    const etatAvis: EtatItem = pieces.avis_imposition ? "ok" : "manquant";
    if (!pieces.avis_imposition) manquants.push("avis d'imposition");

    const rienCommence = !r && !financement && !adhesion && bulletinsElec.length === 0 && Object.keys(pieces).length === 0;
    const statut: StatutDossier = manquants.length === 0 ? "complet" : rienCommence ? "non_commence" : "incomplet";

    return {
      id: cp.id,
      nom: cp.nom,
      email: cp.email,
      telephone: cp.telephone,
      batiments,
      lots,
      nbLotsHab: lots.filter((l) => l.usage === "habitation").length,
      tantiemes,
      enquete,
      plan,
      financement,
      adhesion,
      bulletinsElec,
      pieces,
      etat: {
        profil: etatProfil,
        prime: etatPrime,
        financement: etatFin,
        bulletin: etatBulletin,
        sepa: etatSepa,
        rib: etatRib,
        cni: etatCni,
        avis: etatAvis,
        manquants,
        statut,
      },
    };
  });

  dossiers.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { numeric: true }));
  return { dossiers, cleRef };
}

/** Toutes les données individuelles d'un dossier copropriété, assemblées une fois. */
export function useDossiersCoproprietaires(c: CoproWithStats): DossiersCopro {
  const { data: donnees } = useDonnees(c.id);
  const { data: enquete } = useEnquete(c.id);
  const { data: reponses } = useReponses(enquete?.id);
  const { data: scenarios } = useScenarios(c.id);
  const { data: bareme } = useBareme();
  const { data: pfPlans } = usePlansDefinitifs(c.id);
  const { data: adhesions } = useAdhesions(c.id);
  const { data: bulletins } = useBulletinsCopro(c.id);
  const { data: pieces } = usePiecesCopro(c.id);

  // Même sélection que l'onglet Financement : scénario partagé (ou importé) le plus récent.
  const scenario = useMemo(
    () =>
      (scenarios ?? [])
        .filter((s) => s.statut === "partage" || s.statut === "importe")
        .sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1))[0] ?? null,
    [scenarios]
  );
  const { data: plansIndiv } = usePlansIndividuels(scenario?.id);
  const { data: choix } = useChoixFinancementScenario(scenario?.id);
  const planValide = useMemo(
    () =>
      (pfPlans ?? [])
        .filter((p) => p.statut === "valide")
        .sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1))[0] ?? null,
    [pfPlans]
  );

  const chargement = !donnees || !enquete || !scenarios || !pfPlans || !adhesions || !bulletins || !pieces || !bareme;

  const assemble = useMemo(() => {
    if (!donnees) return { dossiers: [] as DossierCoproprietaire[], cleRef: null as string | null };
    return assemblerDossiers({
      donnees,
      reponses: reponses ?? [],
      scenario,
      plansIndiv: (plansIndiv ?? []) as DossiersCoproInput["plansIndiv"],
      choix: (choix ?? []) as ChoixRow[],
      planValide,
      adhesions: adhesions ?? [],
      bulletins: bulletins ?? [],
      pieces: pieces ?? [],
      bareme: bareme ?? null,
    });
  }, [donnees, reponses, scenario, plansIndiv, choix, planValide, adhesions, bulletins, pieces, bareme]);

  return {
    dossiers: assemble.dossiers,
    scenario,
    planValide,
    batiments: (donnees?.batiments ?? []).map((b) => b.code),
    cleRef: assemble.cleRef,
    bareme: bareme ?? null,
    chargement,
  };
}

type DossiersCoproInput = Parameters<typeof assemblerDossiers>[0];
