// Retours de test (module Feedback flottant) — dépôt par tous les rôles,
// compilation par l'équipe AMO dans Paramètres. Voir migration 0020.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type Feedback = Tables<"feedbacks">;
export type FeedbackType = "bug" | "idee" | "remarque";

export const FEEDBACK_TYPES: { id: FeedbackType; label: string }[] = [
  { id: "bug", label: "Bug" },
  { id: "idee", label: "Idée" },
  { id: "remarque", label: "Remarque" },
];

export function useEnvoyerFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      type: FeedbackType;
      message: string;
      page: string;
      auteurNom: string;
      auteurRole: string;
    }) => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) throw new Error("Session expirée — reconnectez-vous.");
      const { error } = await supabase.from("feedbacks").insert({
        user_id: userId,
        auteur_nom: input.auteurNom,
        auteur_role: input.auteurRole,
        page: input.page,
        type: input.type,
        message: input.message,
        navigateur: navigator.userAgent,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["feedbacks"] }),
  });
}

export function useFeedbacks() {
  return useQuery({
    queryKey: ["feedbacks"],
    queryFn: async (): Promise<Feedback[]> => {
      const { data, error } = await supabase
        .from("feedbacks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMajFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: "nouveau" | "traite" }) => {
      const { error } = await supabase.from("feedbacks").update({ statut }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["feedbacks"] }),
  });
}

export function useSupprimerFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("feedbacks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["feedbacks"] }),
  });
}
