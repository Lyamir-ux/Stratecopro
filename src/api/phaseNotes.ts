// Note libre par étape du projet (diagnostic / études / travaux) - affichée
// dans les colonnes de l'onglet Projet, avec les documents liés à l'étape.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import type { PhaseId } from "@/lib/referentiels";

export type PhaseNote = Tables<"phase_notes">;

/** Dossiers de l'onglet Fichiers rattachés à chaque étape du projet -
 *  détermine la liste « Documents liés » de chaque colonne du kanban. */
export const DOSSIERS_PAR_PHASE: Record<PhaseId, string[]> = {
  diagnostic: ["Passation", "Diagnostic & audit"],
  etudes: ["Devis des études techniques et Frais Annexes", "Plans de financement", "Assemblée générale"],
  travaux: ["Marchés de travaux", "Photos chantier"],
};

export function usePhaseNotes(coproId: string) {
  return useQuery({
    queryKey: ["phase-notes", coproId],
    queryFn: async (): Promise<PhaseNote[]> => {
      const { data, error } = await supabase.from("phase_notes").select("*").eq("copro_id", coproId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSavePhaseNote(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ phase, body }: { phase: PhaseId; body: string }) => {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from("phase_notes").upsert(
        {
          copro_id: coproId,
          phase,
          body,
          updated_by: session.session?.user.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "copro_id,phase" }
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["phase-notes", coproId] }),
  });
}
