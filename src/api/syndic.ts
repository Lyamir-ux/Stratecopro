// Espace syndic : lecture seule du périmètre géré (RLS copro_members 'syndic').
// Le gestionnaire consulte — il n'écrit jamais. Les réponses d'enquête passent
// par la RPC enquete_reponses_syndic qui exclut le RFR (donnée sensible).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type CoproRow = Tables<"coproprietes">;
export type CoproStats = Tables<"copro_stats">;

export interface SyndicCopro extends CoproRow {
  stats: CoproStats | null;
}

/** Les copropriétés gérées par le syndic connecté (RLS = son portefeuille). */
export function useCoprosSyndic() {
  return useQuery({
    queryKey: ["syndic", "copros"],
    queryFn: async (): Promise<SyndicCopro[]> => {
      const [{ data: copros, error: e1 }, { data: stats, error: e2 }] = await Promise.all([
        supabase.from("coproprietes").select("*").order("name"),
        supabase.from("copro_stats").select("*"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const statsById = new Map((stats ?? []).map((s) => [s.id, s]));
      return (copros ?? []).map((c) => ({ ...c, stats: statsById.get(c.id) ?? null }));
    },
  });
}

/** Un dossier copropriété du portefeuille (fiche + stats). */
export function useCoproSyndic(id: string | undefined) {
  return useQuery({
    queryKey: ["syndic", "copro", id],
    enabled: !!id,
    queryFn: async (): Promise<SyndicCopro | null> => {
      const [{ data: copro, error: e1 }, { data: stats, error: e2 }] = await Promise.all([
        supabase.from("coproprietes").select("*").eq("id", id!).maybeSingle(),
        supabase.from("copro_stats").select("*").eq("id", id!).maybeSingle(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return copro ? { ...copro, stats: stats ?? null } : null;
    },
  });
}

/** L'enquête sociale du dossier — lecture pure (pas de création côté syndic). */
export function useEnqueteSyndic(coproId: string | undefined) {
  return useQuery({
    queryKey: ["syndic", "enquete", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<Tables<"enquetes"> | null> => {
      const { data, error } = await supabase
        .from("enquetes")
        .select("*")
        .eq("copro_id", coproId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export interface ReponseSyndic {
  coproprietaire_id: string;
  nb_personnes: number | null;
  statut_occupation: string | null;
  profil_mpr: string | null;
  updated_at: string;
}

/** Réponses d'enquête vues syndic — SANS le RFR (RPC dédiée). */
export function useReponsesSyndic(coproId: string | undefined) {
  return useQuery({
    queryKey: ["syndic", "reponses", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<ReponseSyndic[]> => {
      const { data, error } = await supabase.rpc("enquete_reponses_syndic", { p_copro_id: coproId! });
      if (error) throw error;
      return data ?? [];
    },
  });
}
