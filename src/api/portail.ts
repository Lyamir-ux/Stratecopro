// Espace copropriétaire : données du user connecté (RLS = son périmètre uniquement).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, Enums } from "@/lib/database.types";
import { determineProfil, type Bareme, type FinanceParams, type Profil } from "@/lib/finance";
import { readParams } from "./scenarios";

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
  /** tantièmes par code de clé ('MUN'…) */
  tantiemes: Record<string, number>;
}

export interface Membership {
  coproprietaireId: string;
  nom: string;
  copro: Copro;
  lots: PortalLot[];
}

export function lotTantiemes(lot: PortalLot, cle: string): number {
  return lot.tantiemes[cle] ?? lot.tantiemes.MUN ?? 0;
}

export function totalTantiemes(lots: PortalLot[], cle: string): number {
  return lots.reduce((s, l) => s + lotTantiemes(l, cle), 0);
}

/** Les rattachements du user connecté : fiche copropriétaire + copro + lots. */
export function useMesCopros() {
  return useQuery({
    queryKey: ["portail", "mes-copros"],
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase.from("coproprietaires").select(
        `id, nom,
         coproprietes (*),
         lots ( id, num, usage, batiments ( code ),
                lot_tantiemes ( tantiemes, cles_repartition ( code ) ) )`
      );
      if (error) throw error;
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
          copro: r.coproprietes!,
          lots: (r.lots ?? [])
            .map((l) => ({
              id: l.id,
              num: l.num,
              usage: l.usage,
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
  cee: number;
  subvColl: number;
  reste: number;
  /** true = calculée depuis plans_individuels (étape 7 AMO), false = estimation prorata. */
  exact: boolean;
  /** profil utilisé pour l'estimation quand l'enquête n'est pas remplie */
  profilEstime: Profil | null;
}

/**
 * Décomposition pour un sous-ensemble de tantièmes (un lot ou tous les lots).
 * Si le plan individuel exact existe, on le met à l'échelle t/tPlan ;
 * sinon estimation prorata depuis les paramètres du scénario (clé ≈ 1000 ‰).
 */
export function computeIndiv(
  scenario: Scenario,
  bareme: Bareme,
  plan: PlanIndiv | null,
  tantiemes: number,
  profil: Profil | null
): IndivBreakdown {
  if (plan && Number(plan.tantiemes) > 0) {
    const f = tantiemes / Number(plan.tantiemes);
    const quotePart = Number(plan.quote_part) * f;
    const mprIndiv = Number(plan.mpr_indiv) * f;
    const cee = Number(plan.cee_part) * f;
    const subvColl = Number(plan.subv_coll_part) * f;
    return {
      quotePart,
      mprIndiv,
      cee,
      subvColl,
      reste: Math.max(0, quotePart - mprIndiv - cee - subvColl),
      exact: true,
      profilEstime: null,
    };
  }
  const params: FinanceParams = readParams(scenario.params, bareme);
  const coutTotal = params.travaux + params.honoraires + params.aleas;
  const tauxMpr = params.mprCoproPct + (params.bonusPassoire ? bareme.mprCopro.bonusPassoire : 0);
  const mprCopro = (params.travaux * tauxMpr) / 100;
  const frac = tantiemes / 1000;
  const p = profil ?? "Jaune";
  const quotePart = coutTotal * frac;
  const mprIndiv = params.primeIndiv[p] ?? 0;
  const cee = params.cee * frac;
  const subvColl = (mprCopro + params.fonds) * frac;
  return {
    quotePart,
    mprIndiv,
    cee,
    subvColl,
    reste: Math.max(0, quotePart - mprIndiv - cee - subvColl),
    exact: false,
    profilEstime: profil ? null : "Jaune",
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

export function useSaveMaReponse(enqueteId: string, coproprietaireId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      nbPersonnes: number;
      statutOccupation: string;
      rfr: number;
      bareme: Bareme;
    }): Promise<Profil> => {
      const profil = determineProfil(input.nbPersonnes, input.rfr, input.bareme);
      const { error } = await supabase.from("enquete_reponses").upsert(
        {
          enquete_id: enqueteId,
          coproprietaire_id: coproprietaireId,
          nb_personnes: input.nbPersonnes,
          statut_occupation: input.statutOccupation,
          rfr: input.rfr,
          profil_mpr: profil,
        },
        { onConflict: "enquete_id,coproprietaire_id" }
      );
      if (error) throw error;
      return profil;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["portail"] }),
  });
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
      const { error } = await supabase.from("choix_financement").upsert(
        {
          scenario_id: scenarioId,
          coproprietaire_id: coproprietaireId,
          type: input.type,
          duree_annees: input.dureeAnnees,
          lot_ids: input.lotIds,
          transmitted_at: new Date().toISOString(),
        },
        { onConflict: "scenario_id,coproprietaire_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["portail"] }),
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
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) throw new Error("Session expirée");
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${uid}/${type}-${Date.now()}-${safe}`;
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

// ========== Documents du projet partagés par l'AMO ==========

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
