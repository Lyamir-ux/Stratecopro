// Espace copropriétaire : données du user connecté (RLS = son périmètre uniquement).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, toutesLesLignes } from "@/lib/supabase";
import { nomFichierSansAccents } from "@/lib/nommage";
import { adresseConnue, reponseIdentiteEnquete } from "@/lib/adressePostale";
import { erreurFormatPiece } from "@/lib/formatPiece";
import type { Tables, Enums, Json } from "@/lib/database.types";
import { determineProfil, type Bareme, type FinanceParams, type Profil } from "@/lib/finance";
import { readParams } from "./scenarios";
import { estSci, libellePieceSituation, type ContextePieces } from "@/lib/piecesSituation";
import { useMesBulletins } from "@/api/signature";
import type { TachePortail } from "@/lib/recapPhases";
import { computePlanDefinitif, readPlanDefinitif, type PlanDefinitifData, type PlanDefinitifResult } from "@/lib/finance/planDefinitif";

export type Copro = Tables<"coproprietes">;
export type Scenario = Tables<"scenarios_financiers">;
export type PlanIndiv = Tables<"plans_individuels">;
export type ChoixFinancement = Tables<"choix_financement">;
export type PieceJustificative = Tables<"pieces_justificatives">;
export type TypePiece = Enums<"type_piece">;
export type TypeFinancement = Enums<"type_financement">;

export interface PortalLot {
  id: string;
  num: string;
  usage: string;
  batiment: string | null;
  /** lot d'habitation auquel ce lot annexe est rattaché (bulletins, tantièmes cumulés) */
  rattacheA: string | null;
  /** tantièmes par code de clé ('MUN'…) */
  tantiemes: Record<string, number>;
}

export interface Membership {
  coproprietaireId: string;
  nom: string;
  /** Adresse postale de la fiche (import) : proposée dans le dossier d'adhésion. */
  adresse?: string | null;
  copro: Copro;
  lots: PortalLot[];
}

export function lotTantiemes(lot: PortalLot, cle: string): number {
  return lot.tantiemes[cle] ?? lot.tantiemes.MUN ?? 0;
}

export function totalTantiemes(lots: PortalLot[], cle: string): number {
  return lots.reduce((s, l) => s + lotTantiemes(l, cle), 0);
}

/** Lots annexes (garage, cave…) rattachés à ce lot d'habitation. */
export function lotsRattaches(lots: PortalLot[], lot: PortalLot): PortalLot[] {
  return lots.filter((l) => l.rattacheA === lot.id);
}

/** Tantièmes du lot + de ses lots annexes rattachés (affichés sur le bulletin). */
export function tantiemesAvecRattaches(lots: PortalLot[], lot: PortalLot, cle: string): number {
  return lotTantiemes(lot, cle) + totalTantiemes(lotsRattaches(lots, lot), cle);
}

/** Lots annexes non rattachés à un lot d'habitation - bloquent la génération
 *  des documents d'adhésion dès que le copropriétaire a un lot d'habitation. */
export function lotsAnnexesNonRattaches(lots: PortalLot[]): PortalLot[] {
  return lots.filter((l) => l.usage !== "habitation" && !l.rattacheA);
}

/** Rattache (cibleId) ou détache (null) un lot annexe - RPC validée en base. */
export function useRattacherLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lotId, cibleId }: { lotId: string; cibleId: string | null }) => {
      const { error } = await supabase.rpc("rattacher_lot", { p_lot_id: lotId, p_cible_id: cibleId });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["portail", "mes-copros"] }),
  });
}

/** Les rattachements du user connecté : fiche copropriétaire + copro + lots.
 *  En aperçu AMO, la RLS ouvre toutes les fiches (plus de 1 000) : lecture par
 *  pages, sinon le plafond de l'API tronquait la liste sans prévenir et les
 *  fiches les plus récentes manquaient (bug Amir 30/09/2026, Parc des Cigognes). */
export function useMesCopros() {
  return useQuery({
    queryKey: ["portail", "mes-copros"],
    queryFn: async (): Promise<Membership[]> => {
      const data = await toutesLesLignes((debut, fin) =>
        supabase
          .from("coproprietaires")
          .select(
            `id, nom, adresse,
             coproprietes (*),
             lots ( id, num, usage, rattache_a, batiments ( code ),
                    lot_tantiemes ( tantiemes, cles_repartition ( code ) ) )`
          )
          .order("id")
          .range(debut, fin)
      );
      type Row = Tables<"coproprietaires"> & {
        coproprietes: Copro | null;
        lots: (Tables<"lots"> & {
          batiments: { code: string } | null;
          lot_tantiemes: { tantiemes: number; cles_repartition: { code: string } | null }[];
        })[];
      };
      return ((data ?? []) as unknown as Row[])
        .filter((r) => r.coproprietes)
        .map((r) => ({
          coproprietaireId: r.id,
          nom: r.nom,
          adresse: r.adresse,
          copro: r.coproprietes!,
          lots: (r.lots ?? [])
            .map((l) => ({
              id: l.id,
              num: l.num,
              usage: l.usage,
              rattacheA: l.rattache_a,
              batiment: l.batiments?.code ?? null,
              tantiemes: Object.fromEntries(
                (l.lot_tantiemes ?? [])
                  .filter((t) => t.cles_repartition)
                  .map((t) => [t.cles_repartition!.code, Number(t.tantiemes)])
              ),
            }))
            .sort((a, b) => a.num.localeCompare(b.num, "fr", { numeric: true })),
        }));
    },
  });
}

export interface PlanDefinitifPartage {
  id: string;
  nom: string;
  data: PlanDefinitifData;
  resultat: PlanDefinitifResult;
}

/**
 * Le PF définitif validé derrière un scénario « pont » partagé (0031) : lots de
 * travaux et entreprises, honoraires, détail des aides - pour le plan de
 * financement global du portail (policy plans_definitifs_copro_read, 0059).
 * null quand le scénario partagé n'est pas issu d'un PF définitif.
 */
export function usePlanDefinitifPartage(planId: string | null | undefined) {
  return useQuery({
    queryKey: ["portail", "pf-definitif", planId],
    enabled: !!planId,
    queryFn: async (): Promise<PlanDefinitifPartage | null> => {
      const { data, error } = await supabase
        .from("plans_definitifs")
        .select("id, nom, data, resultat")
        .eq("id", planId!)
        .maybeSingle();
      if (error) throw error;
      if (!data?.data) return null;
      // Recalcul depuis les données (moteur pur) plutôt que l'instantané
      // `resultat`, qui peut être figé avec une ancienne version du moteur.
      const plan = readPlanDefinitif(data.data);
      return {
        id: data.id,
        nom: data.nom,
        data: plan,
        resultat: computePlanDefinitif(plan),
      };
    },
  });
}

/** Scénarios partagés par l'AMO pour cette copro (les seuls visibles côté portail). */
export function useScenariosPartages(coproId: string | undefined) {
  return useQuery({
    queryKey: ["portail", "scenarios", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<Scenario[]> => {
      const { data, error } = await supabase
        .from("scenarios_financiers")
        .select("*")
        .eq("copro_id", coproId!)
        .eq("statut", "partage")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Ligne de plan individuel du copropriétaire sur un scénario (null si pas encore générée). */
export function useMonPlan(scenarioId: string | undefined, coproprietaireId: string | undefined) {
  return useQuery({
    queryKey: ["portail", "plan", scenarioId, coproprietaireId],
    enabled: !!scenarioId && !!coproprietaireId,
    queryFn: async (): Promise<PlanIndiv | null> => {
      const { data, error } = await supabase
        .from("plans_individuels")
        .select("*")
        .eq("scenario_id", scenarioId!)
        .eq("coproprietaire_id", coproprietaireId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Décomposition individuelle affichée par le portail (exacte ou estimée). */
export interface IndivBreakdown {
  quotePart: number;
  mprIndiv: number;
  /** CEE - versés à la fin du chantier, donc hors « reste à financer avant travaux ». */
  cee: number;
  /** Subvention collective affectée (MPR Copro + fonds travaux). */
  subvColl: number;
  /** Part indicative du fonds travaux déjà versé incluse dans subvColl. */
  fondsPart: number;
  /** Ce que le copropriétaire doit financer avant le chantier (hors CEE). */
  resteAvantTravaux: number;
  /** Reste à charge final estimé, une fois les CEE versés après le chantier. */
  reste: number;
  /** true = calculée depuis plans_individuels (étape 7 AMO), false = estimation prorata. */
  exact: boolean;
  /**
   * true = l'aide individuelle MaPrimeRénov' n'est pas déterminable : aucun
   * profil de ressources (enquête sociale non renseignée) - le portail affiche
   * « à déterminer » et aucune prime n'est déduite (feedback Théa 03/09/2026).
   * Avant : un ménage « modeste » était présumé, ce qui faisait apparaître une
   * aide individuelle sans aucune donnée de ressources.
   */
  mprIndetermine: boolean;
}

/**
 * Décomposition pour un sous-ensemble de tantièmes (un lot ou tous les lots).
 * Si le plan individuel exact existe, on le met à l'échelle t/tPlan ;
 * sinon estimation prorata depuis les paramètres du scénario, sur le total
 * de la clé persisté dans les params (1000 par défaut).
 */
export function computeIndiv(
  scenario: Scenario,
  bareme: Bareme,
  plan: PlanIndiv | null,
  tantiemes: number,
  profil: Profil | null
): IndivBreakdown {
  const params: FinanceParams = readParams(scenario.params, bareme);
  const tauxMpr = params.mprCoproPct + (params.bonusPassoire ? bareme.mprCopro.bonusPassoire : 0);
  const mprCopro = (params.travaux * tauxMpr) / 100;
  // La subvention collective agrège MPR Copro + fonds travaux : on isole la
  // part indicative du fonds au prorata de sa place dans l'agrégat.
  const shareFonds = mprCopro + params.fonds > 0 ? params.fonds / (mprCopro + params.fonds) : 0;

  if (plan && Number(plan.tantiemes) > 0) {
    const f = tantiemes / Number(plan.tantiemes);
    const quotePart = Number(plan.quote_part) * f;
    // Sans profil de ressources, aucune prime individuelle n'est affichée même
    // si le plan en portait une (calculée sur un profil depuis effacé).
    const mprIndiv = profil ? Number(plan.mpr_indiv) * f : 0;
    const cee = Number(plan.cee_part) * f;
    const subvColl = Number(plan.subv_coll_part) * f;
    return {
      quotePart,
      mprIndiv,
      cee,
      subvColl,
      fondsPart: subvColl * shareFonds,
      resteAvantTravaux: Math.max(0, quotePart - mprIndiv - subvColl),
      reste: Math.max(0, quotePart - mprIndiv - cee - subvColl),
      exact: true,
      mprIndetermine: !profil,
    };
  }
  const coutTotal = params.travaux + params.honoraires + params.aleas;
  const frac = tantiemes / (params.totalCle || 1000);
  const quotePart = coutTotal * frac;
  const mprIndiv = profil ? params.primeIndiv[profil] ?? 0 : 0;
  const cee = params.cee * frac;
  const subvColl = (mprCopro + params.fonds) * frac;
  return {
    quotePart,
    mprIndiv,
    cee,
    subvColl,
    fondsPart: subvColl * shareFonds,
    resteAvantTravaux: Math.max(0, quotePart - mprIndiv - subvColl),
    reste: Math.max(0, quotePart - mprIndiv - cee - subvColl),
    exact: false,
    mprIndetermine: !profil,
  };
}

/** Statut du profil de ressources tel qu'affiché au copropriétaire (et dans les exports AMO). */
export interface ProfilMeta {
  /** null = aucun profil (enquête non renseignée) */
  profil: Profil | null;
  statut: "declaratif" | "verifie" | null;
  /** date de la déclaration (enquête) ou de la vérification AMO */
  date: string | null;
}

export function profilMetaDepuisReponse(reponse: Tables<"enquete_reponses"> | null | undefined): ProfilMeta {
  const profil = (reponse?.profil_mpr as Profil | null) ?? null;
  if (!profil || !reponse) return { profil: null, statut: null, date: null };
  const verifie = reponse.profil_statut === "verifie" && !!reponse.profil_verifie_le;
  return {
    profil,
    statut: verifie ? "verifie" : "declaratif",
    date: verifie ? reponse.profil_verifie_le : reponse.updated_at,
  };
}

// ========== Enquête sociale ==========

export function useEnquetePortail(coproId: string | undefined) {
  return useQuery({
    queryKey: ["portail", "enquete", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<Tables<"enquetes"> | null> => {
      const { data, error } = await supabase
        .from("enquetes")
        .select("*")
        .eq("copro_id", coproId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useMaReponse(enqueteId: string | undefined, coproprietaireId: string | undefined) {
  return useQuery({
    queryKey: ["portail", "reponse", enqueteId, coproprietaireId],
    enabled: !!enqueteId && !!coproprietaireId,
    queryFn: async (): Promise<Tables<"enquete_reponses"> | null> => {
      const { data, error } = await supabase
        .from("enquete_reponses")
        .select("*")
        .eq("enquete_id", enqueteId!)
        .eq("coproprietaire_id", coproprietaireId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Coordonnées déjà connues du copropriétaire : l'adresse postale (texte libre) de sa
 * réponse à l'enquête de la copropriété, à défaut celle de l'import (`adresseFiche`), et
 * le téléphone qu'il y a donné. Sert à pré-remplir le dossier d'adhésion (idées du
 * 09/10/2026). L'enquête range ses réponses sous `reponses.copro` : la première version
 * lisait la racine et ne retrouvait jamais l'adresse.
 */
export function useCoordonneesConnues(
  coproId: string | undefined,
  coproprietaireId: string | undefined,
  adresseFiche: string | null | undefined,
) {
  return useQuery({
    queryKey: ["portail", "coordonnees-connues", coproId, coproprietaireId, adresseFiche ?? null],
    enabled: !!coproId && !!coproprietaireId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enquete_reponses")
        .select("reponses, enquetes!inner(copro_id)")
        .eq("coproprietaire_id", coproprietaireId!)
        .eq("enquetes.copro_id", coproId!)
        .maybeSingle();
      // l'enquête est facultative : une erreur de lecture ne doit pas masquer l'adresse de la fiche
      const reponses = error ? null : data?.reponses;
      return {
        adresse: adresseConnue(reponseIdentiteEnquete(reponses, "adresse"), adresseFiche),
        telephone: reponseIdentiteEnquete(reponses, "telephone"),
      };
    },
  });
}

/**
 * Enregistre le questionnaire complet (jsonb `reponses`) + les colonnes
 * historiques (foyer / occupation / RFR) qui alimentent la vue AMO et le
 * calcul du profil MaPrimeRénov'. Le profil est calculé depuis RFR + ménage ;
 * s'il n'est pas calculable, l'éventuel profil déjà en base est conservé.
 */
export function useSaveMaReponse(enqueteId: string, coproprietaireId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      reponses: Json;
      nbPersonnes: number | null;
      statutOccupation: string | null;
      rfr: number | null;
      /** Revenu fiscal de référence N-2 (avant-dernier avis) - informatif pour l'Anah. */
      rfrN2?: number | null;
      bareme: Bareme | null;
    }): Promise<Profil | null> => {
      const profil =
        input.nbPersonnes != null && input.rfr != null && input.bareme
          ? determineProfil(input.nbPersonnes, input.rfr, input.bareme)
          : null;
      const { error } = await supabase.from("enquete_reponses").upsert(
        {
          enquete_id: enqueteId,
          coproprietaire_id: coproprietaireId,
          reponses: input.reponses,
          nb_personnes: input.nbPersonnes,
          statut_occupation: input.statutOccupation,
          rfr: input.rfr,
          rfr_n2: input.rfrN2 ?? null,
          // ne pas écraser un profil existant (saisie AMO) quand il n'est pas calculable
          ...(profil ? { profil_mpr: profil } : {}),
          // Toute déclaration du copropriétaire repasse le profil en DÉCLARATIF :
          // l'AMO le revérifie sur l'avis d'imposition (feedback Théa 03/09/2026).
          ...(profil ? { profil_statut: "declaratif", profil_verifie_le: null, profil_verifie_par: null } : {}),
        },
        { onConflict: "enquete_id,coproprietaire_id" }
      );
      if (error) throw error;
      return profil;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["portail"] }),
  });
}

/**
 * E-mail de confirmation au copropriétaire qui vient de transmettre son enquête
 * complète (remarque d'Amir du 02/10/2026) : edge function
 * notifier-enquete-transmise, qui ne fait rien pour une transmission depuis
 * l'aperçu AMO et n'envoie qu'un e-mail par transmission. Sans effet sur
 * l'enregistrement : une erreur d'envoi est ignorée ici (tracée en base).
 */
export async function notifierEnqueteTransmise(input: {
  enqueteId: string;
  coproprietaireId: string;
  /** types des pièces encore à déposer, rappelées dans l'e-mail */
  piecesManquantes: string[];
}): Promise<void> {
  await supabase.functions
    .invoke("notifier-enquete-transmise", {
      body: {
        enquete_id: input.enqueteId,
        coproprietaire_id: input.coproprietaireId,
        pieces_manquantes: input.piecesManquantes,
      },
    })
    .catch(() => undefined);
}

// ========== Choix de financement ==========

export function useMonChoix(scenarioId: string | undefined, coproprietaireId: string | undefined) {
  return useQuery({
    queryKey: ["portail", "choix", scenarioId, coproprietaireId],
    enabled: !!scenarioId && !!coproprietaireId,
    queryFn: async (): Promise<ChoixFinancement | null> => {
      const { data, error } = await supabase
        .from("choix_financement")
        .select("*")
        .eq("scenario_id", scenarioId!)
        .eq("coproprietaire_id", coproprietaireId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveChoix(scenarioId: string, coproprietaireId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { type: TypeFinancement; dureeAnnees: number | null; lotIds: string[] }) => {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from("choix_financement").upsert(
        {
          scenario_id: scenarioId,
          coproprietaire_id: coproprietaireId,
          type: input.type,
          duree_annees: input.dureeAnnees,
          lot_ids: input.lotIds,
          transmitted_at: new Date().toISOString(),
          // le copropriétaire reprend la main sur une éventuelle saisie syndic
          saisi_par: "copro",
          updated_by: session.session?.user.id ?? null,
        },
        { onConflict: "scenario_id,coproprietaire_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["portail"] });
      void qc.invalidateQueries({ queryKey: ["choix-financement", scenarioId] });
    },
  });
}

/** Saisie du mode de financement d'un copropriétaire par le syndic (ou l'AMO
 *  en aperçu) - quand le gestionnaire a l'information en direct (ex. fonds
 *  propres). Tracée via saisi_par pour la distinguer d'un choix du
 *  copropriétaire, qui garde la main depuis son portail. */
export function useSaveChoixGestionnaire(scenarioId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      coproprietaireId: string;
      type: TypeFinancement;
      dureeAnnees: number | null;
      lotIds: string[];
      saisiPar: "syndic" | "amo";
    }) => {
      if (!scenarioId) throw new Error("Aucun scénario partagé");
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from("choix_financement").upsert(
        {
          scenario_id: scenarioId,
          coproprietaire_id: input.coproprietaireId,
          type: input.type,
          duree_annees: input.dureeAnnees,
          lot_ids: input.lotIds,
          transmitted_at: new Date().toISOString(),
          saisi_par: input.saisiPar,
          updated_by: session.session?.user.id ?? null,
        },
        { onConflict: "scenario_id,coproprietaire_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["choix-financement", scenarioId] });
      void qc.invalidateQueries({ queryKey: ["portail"] });
    },
  });
}

export function useRetirerChoix(scenarioId: string, coproprietaireId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("choix_financement")
        .delete()
        .eq("scenario_id", scenarioId)
        .eq("coproprietaire_id", coproprietaireId);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["portail"] }),
  });
}

// ========== Pièces justificatives ==========

export const PIECES: { type: TypePiece; name: string; required: boolean; hint: string }[] = [
  { type: "avis_imposition", name: "Avis d'imposition (N-1)", required: true, hint: "Pour déterminer votre profil MaPrimeRénov'" },
  { type: "piece_identite", name: "Pièce d'identité", required: true, hint: "Recto-verso" },
  { type: "rib", name: "RIB", required: true, hint: "Pour le versement des aides" },
  { type: "justificatif_domicile", name: "Justificatif de domicile", required: false, hint: "De moins de 3 mois" },
  { type: "taxe_fonciere", name: "Taxe foncière", required: false, hint: "Facultatif" },
];

/**
 * Contexte des pièces attendues d'un copropriétaire (08/10/2026) : s'il adhère au prêt collectif
 * par le parcours interne - dossier monté par Strat Eco, donc pas de lien de souscription de la
 * banque, ou un bulletin déjà engagé - la Caisse d'Épargne Grand Est lui demande des pièces en
 * plus (justificatif de domicile, taxe foncière, pièces de SCI) ; et s'il s'agit d'une SCI.
 */
export function useContextePieces(coproId: string | undefined, coproprietaireId: string | undefined, nom: string | undefined): ContextePieces {
  const { data: collectif } = useQuery({
    queryKey: ["portail", "choix-collectif", coproprietaireId],
    enabled: !!coproprietaireId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("choix_financement")
        .select("type, transmitted_at")
        .eq("coproprietaire_id", coproprietaireId!)
        .order("transmitted_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0]?.type === "collectif";
    },
  });
  const { data: config } = useFinancementConfig(coproId);
  const { data: bulletins } = useMesBulletins(coproprietaireId);
  const interne = !config?.lien_adhesion || (bulletins?.length ?? 0) > 0;
  return { pretCollectif: !!collectif && interne, sci: estSci(null, nom) };
}

/** Libellé d'une pièce, qu'elle soit historique (PIECES) ou demandée selon la situation (0118). */
export function nomPiece(type: string): string {
  return PIECES.find((x) => x.type === type)?.name ?? libellePieceSituation(type) ?? type;
}

export function useMesPieces(coproprietaireId: string | undefined) {
  return useQuery({
    queryKey: ["portail", "pieces", coproprietaireId],
    enabled: !!coproprietaireId,
    queryFn: async (): Promise<PieceJustificative[]> => {
      const { data, error } = await supabase
        .from("pieces_justificatives")
        .select("*")
        .eq("coproprietaire_id", coproprietaireId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUploadPiece(coproId: string, coproprietaireId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, file }: { type: TypePiece; file: File }) => {
      // le bucket n'impose pas de format : un Word ou un Excel ne doit jamais arriver jusqu'ici
      const refus = erreurFormatPiece(file);
      if (refus) throw new Error(refus);
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) throw new Error("Session expirée");
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${uid}/${type}-${Date.now()}-${safe}`;
      // empreinte calculée au dépôt : seule trace conservée après la purge
      // automatique des pièces (CGU art. 7.4.2)
      const empreinte = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = [...new Uint8Array(empreinte)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const { error: eUp } = await supabase.storage.from("pieces-copro").upload(path, file);
      if (eUp) throw eUp;
      // remplace l'éventuelle pièce précédente (ligne + objet Storage)
      const { data: prev } = await supabase
        .from("pieces_justificatives")
        .select("storage_path")
        .eq("coproprietaire_id", coproprietaireId)
        .eq("type", type)
        .maybeSingle();
      const { error: eDb } = await supabase.from("pieces_justificatives").upsert(
        {
          copro_id: coproId,
          coproprietaire_id: coproprietaireId,
          type,
          name: file.name,
          storage_path: path,
          size: file.size,
          mime: file.type || null,
          sha256,
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: "coproprietaire_id,type" }
      );
      if (eDb) throw eDb;
      if (prev?.storage_path && prev.storage_path !== path) {
        await supabase.storage.from("pieces-copro").remove([prev.storage_path]);
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["portail", "pieces", coproprietaireId] }),
  });
}

/**
 * Retire une pièce déposée par erreur (feedback Amir 04/10). Une pièce déjà
 * validée par Strat Eco ne s'efface pas : elle se remplace.
 */
export function useSupprimerPiece(coproprietaireId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (piece: Pick<PieceJustificative, "id" | "storage_path" | "statut">) => {
      if (piece.statut === "valide") throw new Error("Une pièce validée ne peut pas être supprimée : déposez-en une nouvelle version.");
      const { error } = await supabase.from("pieces_justificatives").delete().eq("id", piece.id);
      if (error) throw error;
      // objet Storage : au mieux, la ligne a déjà disparu
      await supabase.storage.from("pieces-copro").remove([piece.storage_path]).catch(() => undefined);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["portail", "pieces", coproprietaireId] });
      void qc.invalidateQueries({ queryKey: ["pieces-a-verifier"] });
    },
  });
}

// ---------- Vérification des pièces par l'équipe Strat Eco (feedback Amir 10/09) ----------
// Toute pièce déposée est « à vérifier » (trigger 0079 : dépositaire et date
// tracés). L'administratif la qualifie depuis l'app ; un refus déclenche un
// e-mail au copropriétaire (edge notifier-piece-refusee).

export type StatutPiece = Enums<"statut_piece">;

export interface QualificationPiece {
  id: string;
  label: string;
  statut: StatutPiece;
  /** Motif repris dans l'e-mail de refus (vide : saisie libre attendue). */
  motif: string;
}

export const QUALIFICATIONS_PIECE: QualificationPiece[] = [
  { id: "conforme", label: "Conforme", statut: "valide", motif: "" },
  { id: "illisible", label: "Illisible", statut: "refuse", motif: "le document est illisible (photo floue, page coupée ou trop sombre)" },
  { id: "incomplet", label: "Incomplet", statut: "refuse", motif: "le document est incomplet (il manque une ou plusieurs pages)" },
  { id: "mauvaise_annee", label: "Mauvaise année", statut: "refuse", motif: "le document ne porte pas sur la bonne année" },
  { id: "mauvais_document", label: "Mauvais document", statut: "refuse", motif: "le fichier déposé ne correspond pas à la pièce demandée" },
  { id: "perime", label: "Périmé", statut: "refuse", motif: "le document est trop ancien" },
  { id: "autre", label: "Autre motif", statut: "refuse", motif: "" },
];

export const LIBELLE_STATUT_PIECE: Record<StatutPiece, string> = {
  a_verifier: "À vérifier",
  valide: "Validée",
  refuse: "Refusée",
};

export function libelleQualification(id: string | null | undefined): string {
  return QUALIFICATIONS_PIECE.find((q) => q.id === id)?.label ?? (id ?? "");
}

/** Pièce à vérifier enrichie du copropriétaire et de la copropriété (liste AMO). */
export type PieceAVerifier = PieceJustificative & {
  coproprietaires: { nom: string; email: string | null } | null;
  coproprietes: { name: string } | null;
};

/** Toutes les pièces en attente de vérification (équipe Strat Eco), les plus anciennes d'abord. */
export function usePiecesAVerifier() {
  return useQuery({
    queryKey: ["pieces-a-verifier"],
    queryFn: async (): Promise<PieceAVerifier[]> => {
      const { data, error } = await supabase
        .from("pieces_justificatives")
        .select("*, coproprietaires(nom, email), coproprietes!pieces_justificatives_copro_id_fkey(name)")
        .eq("statut", "a_verifier")
        .order("uploaded_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PieceAVerifier[];
    },
  });
}

/** Nombre de pièces à vérifier par dossier - pastille « Vos tâches », limitée à son périmètre. */
export function usePiecesAVerifierParDossier() {
  return useQuery({
    queryKey: ["pieces-a-verifier", "count"],
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase.from("pieces_justificatives").select("copro_id").eq("statut", "a_verifier");
      if (error) throw error;
      const parDossier = new Map<string, number>();
      for (const p of data ?? []) parDossier.set(p.copro_id, (parDossier.get(p.copro_id) ?? 0) + 1);
      return parDossier;
    },
    refetchInterval: 120_000,
  });
}

/**
 * Qualifie une pièce (menu déroulant de l'administratif). « Conforme » la
 * valide ; tout autre choix la refuse avec un motif (celui de la qualification,
 * ou le texte libre saisi) et déclenche l'e-mail au copropriétaire.
 * Remettre `qualification` à null la repasse « à vérifier ».
 */
export function useQualifierPiece() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      piece,
      qualification,
      motifLibre,
    }: {
      piece: Pick<PieceJustificative, "id" | "copro_id" | "coproprietaire_id">;
      qualification: string | null;
      motifLibre?: string | null;
    }) => {
      const q = QUALIFICATIONS_PIECE.find((x) => x.id === qualification) ?? null;
      const statut: StatutPiece = q ? q.statut : "a_verifier";
      const motif = statut === "refuse" ? (motifLibre?.trim() || q?.motif || null) : null;
      const { error } = await supabase
        .from("pieces_justificatives")
        .update({ statut, qualification: q?.id ?? null, motif_refus: motif })
        .eq("id", piece.id);
      if (error) throw error;
      if (statut === "refuse") {
        // e-mail au copropriétaire - best effort, le refus est enregistré quoi qu'il arrive
        await supabase.functions.invoke("notifier-piece-refusee", { body: { piece_id: piece.id } }).catch(() => undefined);
      }
      return statut;
    },
    onSuccess: (_s, v) => {
      void qc.invalidateQueries({ queryKey: ["pieces-a-verifier"] });
      void qc.invalidateQueries({ queryKey: ["pieces-copro", v.piece.copro_id] });
      void qc.invalidateQueries({ queryKey: ["portail", "pieces", v.piece.coproprietaire_id] });
    },
  });
}

// ========== Prêt collectif : adhésion ==========
// Deux parcours (Amir, 08/10/2026) : si l'AMO a saisi le lien de souscription
// de la banque (copro_financement_config.lien_adhesion), le copropriétaire
// souscrit chez la banque ; sinon, une fois la campagne ouverte
// (adhesion_ouverte), il remplit son dossier d'adhésion dans le portail -
// bulletin pré-rempli et mandat SEPA signés électroniquement (voir Adhesion.tsx).
// adhesions_pret garde le brouillon du formulaire et le suivi AMO.

export type FinancementConfig = Tables<"copro_financement_config">;
export type Adhesion = Tables<"adhesions_pret">;

export function useMonAdhesion(coproId: string | undefined, coproprietaireId: string | undefined) {
  return useQuery({
    queryKey: ["portail", "adhesion", coproId, coproprietaireId],
    enabled: !!coproId && !!coproprietaireId,
    queryFn: async (): Promise<Adhesion | null> => {
      const { data, error } = await supabase
        .from("adhesions_pret")
        .select("*")
        .eq("copro_id", coproId!)
        .eq("coproprietaire_id", coproprietaireId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveAdhesion(coproId: string, coproprietaireId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      scenarioId: string | null;
      form: Json;
      lieuSignature: string;
      ribConcordance?: string | null;
    }): Promise<string> => {
      // L'IBAN ne se stocke plus en clair ici : il vit chiffré sur le bulletin.
      const { data, error } = await supabase
        .from("adhesions_pret")
        .upsert(
          {
            copro_id: coproId,
            coproprietaire_id: coproprietaireId,
            scenario_id: input.scenarioId,
            form: input.form,
            iban: "",
            bic: "",
            lieu_signature: input.lieuSignature,
            ...(input.ribConcordance !== undefined ? { rib_concordance: input.ribConcordance } : {}),
          },
          { onConflict: "copro_id,coproprietaire_id" }
        )
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["portail", "adhesion", coproId, coproprietaireId] }),
  });
}

/** Télécharge un document du bucket pieces-copro (dossiers d'adhésion signés
 *  avant la signature électronique avancée). */
export async function downloadFromPieces(path: string, filename: string) {
  // `download` côté Storage : Content-Disposition attachment - l'attribut
  // download d'un lien est ignoré par les navigateurs sur une URL cross-origin
  const { data, error } = await supabase.storage
    .from("pieces-copro")
    .createSignedUrl(path, 300, { download: nomFichierSansAccents(filename) });
  if (error) throw error;
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = filename;
  a.target = "_blank";
  a.click();
}

export function useFinancementConfig(coproId: string | undefined) {
  return useQuery({
    queryKey: ["portail", "fin-config", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<FinancementConfig | null> => {
      const { data, error } = await supabase
        .from("copro_financement_config")
        .select("*")
        .eq("copro_id", coproId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** URL signée courte durée pour AFFICHER un document du bucket pieces-copro. */
export async function urlSigneePiece(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("pieces-copro").createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Types d'affichage d'une pièce dans l'aperçu. Pas de SVG ni de HTML : une pièce
 * vient d'un copropriétaire, et un lien « blob: » s'exécute dans l'origine de
 * l'application.
 */
const TYPES_APERCU_PIECE: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/**
 * Aperçu sans téléchargement d'une pièce (idée d'Amir du 07/10/2026, /taches) :
 * l'objet est récupéré en mémoire puis affiché par un lien « blob: » typé d'après
 * l'extension, car le type enregistré en Storage peut être générique (octet-stream)
 * et le navigateur télécharge alors au lieu d'afficher. Lien libéré par ApercuDocument.
 */
export async function urlApercuPiece(path: string): Promise<string> {
  const type = TYPES_APERCU_PIECE[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!type) throw new Error("Format non affichable");
  const { data, error } = await supabase.storage.from("pieces-copro").download(path);
  if (error || !data) throw error ?? new Error("Document indisponible");
  return URL.createObjectURL(new Blob([data], { type }));
}

/** Télécharge le RIB téléversé (pour la vérification de concordance). */
export async function downloadRibBlob(storagePath: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from("pieces-copro").download(storagePath);
  if (error) return null;
  return data;
}

// ========== Documents du projet partagés par l'AMO ==========

/**
 * Tâches du dossier (toutes phases), pour le récapitulatif des étapes de
 * l'accueil : ce qui est en cours et ce qui reste à réaliser (RPC 0138 : le
 * plan de tâches AMO n'est pas lisible du portail).
 */
export function usePortailTaches(coproId: string | undefined) {
  return useQuery({
    queryKey: ["portail", "taches", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<TachePortail[]> => {
      const { data, error } = await supabase.rpc("portail_taches", { p_copro_id: coproId! });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFichiersPartages(coproId: string | undefined) {
  return useQuery({
    queryKey: ["portail", "fichiers", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<Tables<"fichiers">[]> => {
      const { data, error } = await supabase
        .from("fichiers")
        .select("*")
        .eq("copro_id", coproId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // la RLS ne renvoie déjà que les fichiers partagés ; filtre de ceinture
      return (data ?? []).filter((f) => f.partage_copro);
    },
  });
}
