// Côté AMO : configuration du prêt collectif par copro + suivi des adhésions.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type FinancementConfig = Tables<"copro_financement_config">;
export type AdhesionAvecNom = Tables<"adhesions_pret"> & { coproprietaire: { nom: string } | null };

export const BANQUES = ["CEGEE", "DOMOFINANCE"] as const;

export function useFinancementConfigAmo(coproId: string | undefined) {
  return useQuery({
    queryKey: ["fin-config", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<FinancementConfig | null> => {
      const { data, error } = await supabase
        .from("copro_financement_config")
        .select("*")
        .eq("copro_id", coproId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveFinancementConfig(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { banque: string; dureeAnnees: number; adhesionOuverte: boolean }) => {
      const { error } = await supabase.from("copro_financement_config").upsert(
        {
          copro_id: coproId,
          banque: input.banque,
          duree_annees: input.dureeAnnees,
          adhesion_ouverte: input.adhesionOuverte,
        },
        { onConflict: "copro_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fin-config", coproId] }),
  });
}

export function useAdhesions(coproId: string | undefined) {
  return useQuery({
    queryKey: ["adhesions", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<AdhesionAvecNom[]> => {
      const { data, error } = await supabase
        .from("adhesions_pret")
        .select("*, coproprietaires(nom)")
        .eq("copro_id", coproId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => {
        const { coproprietaires, ...rest } = r as typeof r & { coproprietaires: { nom: string } | null };
        return { ...rest, coproprietaire: coproprietaires };
      });
    },
  });
}

/** Télécharge un document généré (bulletin signé / mandat) — accès AMO au bucket. */
export async function downloadAdhesionDoc(path: string, filename: string) {
  const { data, error } = await supabase.storage.from("pieces-copro").createSignedUrl(path, 300);
  if (error) throw error;
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = filename;
  a.target = "_blank";
  a.click();
}
