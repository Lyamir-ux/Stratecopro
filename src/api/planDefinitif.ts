// Plans de financement définitifs (nomenclature chef de projet) : CRUD + import xlsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, Tables } from "@/lib/database.types";
import {
  computePlanDefinitif,
  readPlanDefinitif,
  type PlanDefinitifData,
  type PlanDefinitifResult,
} from "@/lib/finance";

export type PlanDefinitif = Tables<"plans_definitifs">;

export function usePlansDefinitifs(coproId: string | undefined) {
  return useQuery({
    queryKey: ["plans-definitifs", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<PlanDefinitif[]> => {
      const { data, error } = await supabase
        .from("plans_definitifs")
        .select("*")
        .eq("copro_id", coproId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePlanDefinitif(planId: string | undefined) {
  return useQuery({
    queryKey: ["plan-definitif", planId],
    enabled: !!planId,
    queryFn: async (): Promise<PlanDefinitif> => {
      const { data, error } = await supabase.from("plans_definitifs").select("*").eq("id", planId!).single();
      if (error) throw error;
      return data;
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, coproId: string, planId?: string) {
  void qc.invalidateQueries({ queryKey: ["plans-definitifs", coproId] });
  if (planId) void qc.invalidateQueries({ queryKey: ["plan-definitif", planId] });
}

/** Crée un plan (import de classeur ou plan vierge). Retourne l'enregistrement créé. */
export function useCreatePlanDefinitif(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nom: string; data: PlanDefinitifData; sourceFichier?: string }) => {
      const { data: row, error } = await supabase
        .from("plans_definitifs")
        .insert({
          copro_id: coproId,
          nom: input.nom,
          data: input.data as unknown as Json,
          resultat: computePlanDefinitif(input.data) as unknown as Json,
          source_fichier: input.sourceFichier ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return row;
    },
    onSuccess: () => invalidate(qc, coproId),
  });
}

/** Enregistre les modifications ; le résultat recalculé est figé avec les données. */
export function useUpdatePlanDefinitif(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; data?: PlanDefinitifData; nom?: string; statut?: string }) => {
      const { error } = await supabase
        .from("plans_definitifs")
        .update({
          ...(input.nom !== undefined ? { nom: input.nom } : {}),
          ...(input.statut !== undefined ? { statut: input.statut } : {}),
          ...(input.data !== undefined
            ? {
                data: input.data as unknown as Json,
                resultat: computePlanDefinitif(input.data) as unknown as Json,
              }
            : {}),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_r, v) => invalidate(qc, coproId, v.id),
  });
}

/**
 * Valide (ou repasse en brouillon) un plan définitif. Un seul plan validé par
 * copropriété : valider un plan repasse les autres plans validés en brouillon.
 * Le plan validé alimente automatiquement les panneaux de l'onglet Financement,
 * est partagé avec le syndic (RLS) et reporte gain et étiquettes sur le dossier
 * (tableau de bord, portefeuille).
 */
export function useValiderPlanDefinitif(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; valider: boolean }) => {
      if (input.valider) {
        const { error: errAutres } = await supabase
          .from("plans_definitifs")
          .update({ statut: "brouillon" })
          .eq("copro_id", coproId)
          .eq("statut", "valide")
          .neq("id", input.id);
        if (errAutres) throw errAutres;
      }
      const { error } = await supabase
        .from("plans_definitifs")
        .update({ statut: input.valider ? "valide" : "brouillon" })
        .eq("id", input.id);
      if (error) throw error;

      if (input.valider) {
        // Le PF validé fait foi : gain énergétique et étiquettes du plan
        // remontent sur le dossier (cartes du tableau de bord, hero, exports).
        const { data: row, error: errRow } = await supabase
          .from("plans_definitifs")
          .select("data, resultat")
          .eq("id", input.id)
          .single();
        if (errRow) throw errRow;
        const infos = readPlanDefinitif(row.data).infos;
        const res = row.resultat as unknown as PlanDefinitifResult | null;
        const lireEtiquette = (s: string): string | null => {
          const l = (s ?? "").trim().toUpperCase().slice(0, 1);
          return l && "ABCDEFG".includes(l) ? l : null;
        };
        const patch: Record<string, unknown> = {};
        if (res?.performancePct) patch.gain_pct = Math.round(res.performancePct * 10) / 10;
        const avant = lireEtiquette(infos.etiquetteInitiale);
        const apres = lireEtiquette(infos.etiquetteProjet);
        if (avant) patch.energy_before = avant;
        if (apres) patch.energy_after = apres;
        if (Object.keys(patch).length) {
          const { error: errCopro } = await supabase.from("coproprietes").update(patch).eq("id", coproId);
          if (errCopro) throw errCopro;
        }
      }
    },
    onSuccess: (_r, v) => {
      invalidate(qc, coproId, v.id);
      void qc.invalidateQueries({ queryKey: ["copro", coproId] });
      void qc.invalidateQueries({ queryKey: ["copros"] });
    },
  });
}

export function useDeletePlanDefinitif(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plans_definitifs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, coproId),
  });
}
