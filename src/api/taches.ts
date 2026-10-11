import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { useAuth } from "@/auth/AuthProvider";
import { useUi } from "@/stores/ui";
import { perimetreTaches, type PerimetreChef } from "@/lib/perimetreChef";
import { appliquerStatutOuvertes, type StatutTacheAmo } from "@/lib/statutTache";

/** Périmètre de « Vos tâches » : chef de projet choisi sur le tableau de bord, à défaut le compte connecté. */
export function usePerimetreTaches(): PerimetreChef {
  const filtre = useUi((s) => s.chefProjetFilter);
  const { profile } = useAuth();
  return perimetreTaches(filtre, profile?.full_name);
}

export type Tache = Tables<"taches"> & {
  assignee: { initials: string; full_name: string } | null;
};

export function useTaches(coproId: string | undefined) {
  return useQuery({
    queryKey: ["taches", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<Tache[]> => {
      const { data, error } = await supabase
        .from("taches")
        .select("*, profiles!taches_assignee_user_id_fkey(initials, full_name)")
        .eq("copro_id", coproId!)
        .order("position");
      if (error) throw error;
      return (data ?? []).map((t) => {
        const { profiles, ...rest } = t as typeof t & {
          profiles: { initials: string; full_name: string } | null;
        };
        return { ...rest, assignee: profiles };
      });
    },
  });
}

/**
 * Change le statut d'une tâche depuis « Vos tâches », qui liste les tâches de plusieurs dossiers
 * (retour d'Amir du 11/10/2026). Le changement s'affiche aussitôt - une tâche faite sort de la
 * liste - et revient en arrière si l'enregistrement échoue.
 */
export function useChangerStatutTache() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StatutTacheAmo }) => {
      const { error } = await supabase.from("taches").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["all-open-tasks"] });
      const avant = qc.getQueryData<Array<{ id: string; status: StatutTacheAmo }>>(["all-open-tasks"]);
      if (avant) qc.setQueryData(["all-open-tasks"], appliquerStatutOuvertes(avant, id, status));
      return { avant };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.avant) qc.setQueryData(["all-open-tasks"], ctx.avant);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["all-open-tasks"] });
      void qc.invalidateQueries({ queryKey: ["taches"] });
      void qc.invalidateQueries({ queryKey: ["tasks-count"] });
      void qc.invalidateQueries({ queryKey: ["copros"] });
      void qc.invalidateQueries({ queryKey: ["copro"] });
    },
  });
}

export function useUpdateTache(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string } & Partial<Pick<Tables<"taches">, "status" | "assignee_user_id" | "title" | "due_label">>) => {
      const { error } = await supabase.from("taches").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["taches", coproId] });
      void qc.invalidateQueries({ queryKey: ["tasks-count"] });
      void qc.invalidateQueries({ queryKey: ["copros"] });
      void qc.invalidateQueries({ queryKey: ["copro", coproId] });
    },
  });
}
