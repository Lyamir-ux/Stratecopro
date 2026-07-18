import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

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
