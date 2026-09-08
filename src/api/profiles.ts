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

/**
 * Appel de l'edge function creer-collaborateur (réservée au dirigeant) : compte
 * Supabase + fiche profil, mot de passe provisoire renvoyé une seule fois.
 * Sert aux collaborateurs AMO (/collaborateurs) et aux membres d'enseigne
 * syndic (Paramètres → Organisations, voir api/organisations).
 */
export async function creerCompte(body: {
  email: string;
  full_name: string;
  job_title?: string;
  role?: "amo" | "syndic";
  organisation_id?: string;
  org_role?: string;
}): Promise<CollaborateurCree> {
  const { data, error } = await supabase.functions.invoke("creer-collaborateur", { body });
  if (error) {
    // le corps d'erreur de l'edge function porte le message à afficher
    const ctx = (error as { context?: Response }).context;
    const parsed = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(parsed?.error ?? "La création du compte a échoué. Réessayez.");
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as CollaborateurCree;
}

/** Création d'un compte collaborateur AMO (edge function, réservée au dirigeant). */
export function useCreerCollaborateur() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; full_name: string; job_title?: string }) => creerCompte({ ...body, role: "amo" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["team-profiles"] }),
  });
}
