// Rapport mensuel de portefeuille aux cabinets de syndic (edge function
// `rapport-syndic`) : chaque directeur reçoit l'état de toute son enseigne,
// chaque gestionnaire celui de ses copropriétés. Déclenchement MANUEL
// uniquement, depuis Paramètres (journal serveur rapport_syndic_envois : un
// envoi par enseigne et par mois, sauf `force`). Il n'est plus lancé au
// chargement de l'app AMO depuis le 12/10/2026.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export interface BilanRapport {
  periode: string;
  organisations: number;
  envoyes: number;
  simules: number;
  erreurs: number;
  mode: string;
}

export type RapportEnvoi = Tables<"rapport_syndic_envois"> & {
  organisation: { nom: string } | null;
};

/** Journal des rapports envoyés (panneau Paramètres). */
export function useRapportsEnvoyes() {
  return useQuery({
    queryKey: ["rapport-syndic-envois"],
    queryFn: async (): Promise<RapportEnvoi[]> => {
      const { data, error } = await supabase
        .from("rapport_syndic_envois")
        .select("*, organisations(nom)")
        .order("created_at", { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const { organisations, ...rest } = r as typeof r & { organisations: { nom: string } | null };
        return { ...rest, organisation: organisations };
      });
    },
  });
}

/** Envoi manuel immédiat (force = renvoie même si le mois est déjà couvert). */
export function useEnvoyerRapportSyndic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<BilanRapport> => {
      const { data, error } = await supabase.functions.invoke("rapport-syndic", {
        body: { force: true },
      });
      if (error) throw error;
      return data as BilanRapport;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["rapport-syndic-envois"] }),
  });
}
