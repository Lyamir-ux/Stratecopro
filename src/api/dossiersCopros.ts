// Vue individuelle par copropriétaire (feedback Théa 03/09/2026) : une seule
// base pour la liste « qui me manque quoi », la fiche individuelle et les
// trois exports (liste des primes, rapport d'enquête sociale, fiche état).
// Tout est assemblé ici, une fois, depuis les mêmes requêtes que les onglets
// existants - les montants sont ceux du plan partagé au portail (ou du PF
// définitif validé), arrondis au centime, donc concordants entre les écrans.
import { useMemo } from "react";
import { estSci, piecesAttendues, type PieceAttendue, type ReponsesPieces } from "@/lib/piecesSituation";
import {
  dossierBanqueComplet,
  lignesDossierBanque,
  pireEtat,
  type LigneBanque,
  type NatureAdherent,
} from "@/lib/dossierAdherent";
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
import { useAdhesions, useFinancementConfigAmo, type AdhesionAvecNom } from "./financement";
import { useBulletinsCopro, type BulletinAvecSignataires } from "./signature";
import type { CoproWithStats } from "./copros";
import { trierParNomFamille } from "@/lib/nomFamille";
import { occupationPresumee, type LieuCopro } from "@/lib/ficheEtat";

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
    /** Occupant / Bailleur / Vacant : réponse de l'enquête, à défaut déduite de l'adresse postale. */
    occupation: string | null;
    occupationSource: "enquete" | "adresse" | null;
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
  /** Pièces demandées selon les réponses à l'enquête, en plus de l'avis d'imposition (0118). */
  piecesSituation: PieceAttendue[];
  /** Personne physique ou SCI : détermine la liste de pièces de la banque. */
  nature: NatureAdherent;
  /** Pièces justificatives exigées de ce copropriétaire (identité, RIB, avis, selon sa situation et les pièces de la banque). */
  piecesRequises: TypePiece[];
  /**
   * Dossier d'adhésion au prêt collectif selon la nomenclature de la Caisse d'Épargne Grand
   * Est (08/10/2026) : les pièces dans l'ordre de la banque. `applicable` : le dossier est
   * monté par nous (le parcours de souscription en ligne de la banque ne l'est pas).
   */
  banque: { applicable: boolean; complet: boolean; lignes: LigneBanque[] };
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
  /** La copropriété souscrit chez la banque (lien de souscription saisi) : le
   *  bulletin et le mandat SEPA ne passent plus par nous, donc ils ne peuvent
   *  plus manquer dans notre dossier (22/09/2026). */
  souscriptionEnLigne?: boolean;
  /** Adresses de la copropriété et de ses bâtiments : sans réponse à
   *  l'enquête, un propriétaire de logement domicilié à l'une d'elles est
   *  occupant (règle d'Amir du 04/10/2026), domicilié ailleurs bailleur. */
  lieux?: LieuCopro[];
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
    // même ordre que la fiche État (calculerOccupation) : l'enquête, puis l'adresse postale
    const occEnquete = OCCUPATION_LABEL(r?.statut_occupation);
    const presumee =
      !occEnquete && input.lieux && lots.some((l) => l.usage === "habitation")
        ? occupationPresumee(cp.adresse, input.lieux)
        : null;
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
      occupation: occEnquete ?? (presumee === "occupant" ? "Occupant" : presumee === "bailleur" ? "Bailleur" : null),
      occupationSource: occEnquete ? "enquete" : presumee ? "adresse" : null,
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
    // dossier d'adhésion monté par nous : adhérent au prêt collectif hors souscription en ligne
    let parcoursPret = false;
    if (collectif) {
      const signe = adhesion?.statut === "signee" || bulletinsElec.some((b) => b.statut === "complet");
      const enCours = !!adhesion || bulletinsElec.some((b) => b.statut === "en_signature");
      if (input.souscriptionEnLigne && !signe && !enCours) {
        // Souscription menée par la banque : rien à attendre de notre côté.
        etatBulletin = "na";
        etatSepa = "na";
      } else {
        parcoursPret = true;
        etatBulletin = signe ? "ok" : enCours ? "en_cours" : "manquant";
        if (etatBulletin !== "ok") manquants.push("bulletin d'adhésion" + (etatBulletin === "en_cours" ? " (en cours)" : ""));
        // Mandat SEPA signé électroniquement avec le bulletin (0148), par le seul
        // principal : fourni dès sa signature, sans attendre les cosignataires.
        // Avant la signature électronique : mandat papier déposé sur le dossier.
        const avecMandat = bulletinsElec.filter((b) => !!b.mandat_path);
        etatSepa =
          adhesion?.sepa_path || (avecMandat.length > 0 && avecMandat.every((b) => !!b.mandat_signe_le))
            ? "ok"
            : avecMandat.length > 0 || enCours
              ? "en_cours"
              : "manquant";
        if (etatSepa !== "ok") manquants.push("mandat SEPA" + (etatSepa === "en_cours" ? " (en cours)" : ""));
      }
    }
    // Pièce déposée au portail : validée = fournie ; à vérifier = en cours ;
    // refusée = manquante (le copropriétaire doit redéposer) - feedback 10/09.
    const etatPiece = (p: PieceJustificative | undefined): EtatItem =>
      !p ? "manquant" : p.statut === "valide" ? "ok" : p.statut === "refuse" ? "manquant" : "en_cours";
    const suffixe = (p: PieceJustificative | undefined) =>
      !p ? "" : p.statut === "refuse" ? " (refusée, à redéposer)" : p.statut === "a_verifier" ? " (déposée, à vérifier)" : "";
    const ribBulletin = bulletinsElec.some((b) => !!b.rib_path && !b.purge_effectuee_le);
    const etatRib: EtatItem = ribBulletin ? "ok" : etatPiece(pieces.rib);
    if (etatRib !== "ok") manquants.push("RIB" + suffixe(pieces.rib));
    const cniBulletin = bulletinsElec.some((b) => b.signataires.some((sg) => !!sg.piece_identite_path));
    const etatCni: EtatItem = cniBulletin ? "ok" : etatPiece(pieces.piece_identite);
    if (etatCni !== "ok") manquants.push("pièce d'identité" + suffixe(pieces.piece_identite));
    // pièces demandées selon la situation déclarée (feedback Marius MAZZANTE 30/09/2026) et,
    // pour un adhérent au prêt collectif, selon la nomenclature de la banque (08/10/2026)
    const nature: NatureAdherent = estSci(reponses?.copro?.["type-coproprietaire"], cp.nom) ? "sci" : "physique";
    const piecesSituation = piecesAttendues(enquete.reponses as ReponsesPieces | null, { pretCollectif: parcoursPret, sci: nature === "sci" }).filter(
      (p) => p.type !== "avis_imposition"
    );
    // l'avis d'imposition est celui du ménage ; une SCI n'en a pas : ce sont ceux de ses associés, demandés seulement avec le prêt
    const avisAssocies = piecesSituation.some((p) => p.type === "avis_associes_sci");
    const etatAvis: EtatItem = nature === "sci" ? (avisAssocies ? etatPiece(pieces.avis_associes_sci) : "na") : etatPiece(pieces.avis_imposition);
    if (etatAvis !== "ok" && etatAvis !== "na") {
      const p = nature === "sci" ? pieces.avis_associes_sci : pieces.avis_imposition;
      manquants.push((nature === "sci" ? "avis d'imposition des associés" : "avis d'imposition") + suffixe(p));
    }
    for (const ps of piecesSituation) {
      if (nature === "sci" && ps.type === "avis_associes_sci") continue; // déjà compté ci-dessus
      if (etatPiece(pieces[ps.type]) !== "ok") manquants.push(ps.nom.charAt(0).toLowerCase() + ps.nom.slice(1) + suffixe(pieces[ps.type]));
    }
    const piecesRequises = new Set<TypePiece>(["piece_identite", "rib"]);
    if (nature === "physique") piecesRequises.add("avis_imposition");
    for (const ps of piecesSituation) piecesRequises.add(ps.type);

    // dossier de la banque, dans l'ordre de sa nomenclature
    const tutelle = (reponses?.copro as Record<string, unknown> | undefined)?.["curatelle-tutelle"] === "Tutelle";
    const lignes = lignesDossierBanque(nature, {
      bulletin: etatBulletin,
      identite: etatCni,
      domicile: etatPiece(pieces.justificatif_domicile),
      irpp: nature === "sci" ? etatAvis : pireEtat(etatAvis, piecesSituation.some((p) => p.type === "avis_imposition_2") ? etatPiece(pieces.avis_imposition_2) : "na"),
      sepa: etatSepa,
      rib: etatRib,
      taxe_fonciere: etatPiece(pieces.taxe_fonciere),
      juge: tutelle ? etatPiece(pieces.jugement_protection) : "na",
      kbis: etatPiece(pieces.kbis_sci),
      statuts: etatPiece(pieces.statuts_sci),
    });
    const banque = { applicable: parcoursPret, complet: parcoursPret && dossierBanqueComplet(lignes), lignes };

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
      piecesSituation,
      nature,
      piecesRequises: [...piecesRequises],
      banque,
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

  // par nom de famille (feedback syndic 25/09/2026) : onglet et 3 exports dans le même ordre
  return { dossiers: trierParNomFamille(dossiers, (d) => d.nom), cleRef };
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
  const { data: finConfig } = useFinancementConfigAmo(c.id);

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
      souscriptionEnLigne: !!finConfig?.lien_adhesion,
      lieux: [
        { adresse: c.adresse, cp: c.code_postal },
        ...donnees.batiments.filter((b) => b.adresse).map((b) => ({ adresse: b.adresse, cp: c.code_postal })),
      ],
    });
  }, [donnees, reponses, scenario, plansIndiv, choix, planValide, adhesions, bulletins, pieces, bareme, finConfig, c.adresse, c.code_postal]);

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
