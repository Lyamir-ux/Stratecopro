// Tâches du syndic persistées (migration 0047) - registre, AG, PV, comptes
// d'aides, DO… par copropriété et par phase. Le gabarit est semé côté serveur
// (RPC seed_syndic_taches, idempotente) ; le syndic coche et fixe une échéance,
// l'AMO a la main complète. Remplace les repères recalculés de lib/syndicTasks.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import type { PhaseId } from "@/lib/referentiels";

export type SyndicTache = Tables<"syndic_taches">;

export const PHASE_RANK: Record<PhaseId, number> = { diagnostic: 0, etudes: 1, travaux: 2 };

/**
 * Tâches syndic d'un ensemble de copropriétés. Le semis du gabarit est fait
 * juste avant la lecture : idempotent (on conflict do nothing sur
 * (copro_id, cle)), il ne recrée jamais de doublon.
 */
export function useSyndicTaches(coproIds: string[]) {
  return useQuery({
    queryKey: ["syndic-taches", [...coproIds].sort().join(",")],
    enabled: coproIds.length > 0,
    queryFn: async (): Promise<SyndicTache[]> => {
      const { error: seedErr } = await supabase.rpc("seed_syndic_taches", { p_copro_ids: coproIds });
      if (seedErr) throw seedErr;
      const { data, error } = await supabase
        .from("syndic_taches")
        .select("*")
        .in("copro_id", coproIds)
        .order("phase")
        .order("ordre");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Coche / décoche une tâche (fait_par et fait_le tracés). */
export function useToggleSyndicTache() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tache, done }: { tache: SyndicTache; done: boolean }) => {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase
        .from("syndic_taches")
        .update({
          statut: done ? "done" : "todo",
          fait_par: done ? (session.session?.user.id ?? null) : null,
          fait_le: done ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tache.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["syndic-taches"] }),
  });
}

/** Fixe (ou efface) l'échéance d'une tâche. */
export function useEcheanceSyndicTache() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tacheId, echeance }: { tacheId: string; echeance: string | null }) => {
      const { error } = await supabase
        .from("syndic_taches")
        .update({ echeance, updated_at: new Date().toISOString() })
        .eq("id", tacheId);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["syndic-taches"] }),
  });
}

/** Une tâche est en retard : non faite et échéance dépassée. */
export function enRetard(t: Pick<SyndicTache, "statut" | "echeance">): boolean {
  if (t.statut === "done" || !t.echeance) return false;
  return t.echeance < new Date().toISOString().slice(0, 10);
}
