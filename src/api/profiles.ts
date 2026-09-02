import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type Profile = Tables<"profiles">;

/** Équipe AMO active (assignation des tâches, avatars). */
export function useTeamProfiles() {
  return useQuery({
    queryKey: ["team-profiles"],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "amo")
        .eq("active", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface CollaborateurCree {
  user_id: string;
  email: string;
  /** Mot de passe provisoire, renvoyé une seule fois (à transmettre au collaborateur). */
  mot_de_passe: string;
}

/** Création d'un compte collaborateur (edge function, réservée au dirigeant). */
export function useCreerCollaborateur() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      email: string;
      full_name: string;
      job_title?: string;
    }): Promise<CollaborateurCree> => {
      const { data, error } = await supabase.functions.invoke("creer-collaborateur", { body });
      if (error) {
        // le corps d'erreur de l'edge function porte le message à afficher
        const ctx = (error as { context?: Response }).context;
        const parsed = ctx ? await ctx.json().catch(() => null) : null;
        throw new Error(parsed?.error ?? "La création du collaborateur a échoué. Réessayez.");
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as CollaborateurCree;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["team-profiles"] }),
  });
}
