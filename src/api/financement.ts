// Côté AMO : configuration du prêt collectif par copro + suivi des adhésions.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { nomFichierSansAccents } from "@/lib/nommage";
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
    // `adhesion_ouverte` ouvre le dossier d'adhésion du portail (bulletin + mandat SEPA signés
    // électroniquement) ; plus de lien de souscription de la banque (Amir, 11/10/2026).
    // `dateLimiteChoix` (0117) : dernier jour où le copropriétaire peut choisir ou
    // modifier son financement depuis le portail ; null = sans limite.
    mutationFn: async (input: {
      banque: string;
      dureeAnnees: number;
      adhesionOuverte: boolean;
      dateLimiteChoix: string | null;
      /** Dernier jour pour déposer un dossier d'adhésion au prêt collectif (0158), exigé à l'ouverture. */
      dateLimiteAdhesion: string | null;
    }) => {
      const { error } = await supabase.from("copro_financement_config").upsert(
        {
          copro_id: coproId,
          banque: input.banque,
          duree_annees: input.dureeAnnees,
          adhesion_ouverte: input.adhesionOuverte,
          date_limite_choix: input.dateLimiteChoix,
          date_limite_adhesion: input.dateLimiteAdhesion,
        },
        { onConflict: "copro_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fin-config", coproId] });
      void qc.invalidateQueries({ queryKey: ["portail", "fin-config", coproId] });
    },
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

/** Télécharge un document généré (bulletin signé / mandat) - accès AMO au bucket. */
export async function downloadAdhesionDoc(path: string, filename: string) {
  const { data, error } = await supabase.storage.from("pieces-copro").createSignedUrl(path, 300, { download: nomFichierSansAccents(filename) });
  if (error) throw error;
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = filename;
  a.target = "_blank";
  a.click();
}

/**
 * Trace d'un envoi à la campagne d'adhésion (0158) : l'e-mail d'ouverture, ou la dernière relance
 * qui fixe aussi la deuxième date limite. Une trace qui n'a pas pu s'écrire n'annule pas l'envoi.
 */
export function useTracerEnvoiAdhesion(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: { type: "ouverture"; nb: number } | { type: "relance"; nb: number; deuxiemeLimite: string }
    ) => {
      const maintenant = new Date().toISOString();
      const patch =
        input.type === "ouverture"
          ? { adhesion_email_le: maintenant, adhesion_email_nb: input.nb }
          : {
              relance_adhesion_le: maintenant,
              relance_adhesion_nb: input.nb,
              date_limite_adhesion_2: input.deuxiemeLimite,
            };
      const { error } = await supabase.from("copro_financement_config").update(patch).eq("copro_id", coproId);
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["fin-config", coproId] });
      void qc.invalidateQueries({ queryKey: ["portail", "fin-config", coproId] });
    },
  });
}
