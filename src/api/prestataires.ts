// Base d'entreprises référencées (prestations intellectuelles) - côté AMO.
// Chaque prestataire couvre un ou plusieurs métiers (types) ; à la publication
// d'une consultation, l'edge function `notifier-consultation` alerte par
// e-mail tous les prestataires actifs du métier concerné.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";

export type Prestataire = Tables<"prestataires">;

/** Format d'adresse accepté dans les fiches (même contrôle que le formulaire). */
export const emailValide = (e: string): boolean => /^\S+@\S+\.\S+$/.test(e.trim());

/** Adresses d'une entreprise telles qu'enregistrées (0106) : la principale
 *  (compte et alertes) et celles en copie. Adresses nettoyées (espaces, casse),
 *  vides et doublons retirés ; sans principale, la première adresse en copie
 *  prend sa place - la base refuse une copie sans principale. */
export function normaliserEmails(
  principal: string | null | undefined,
  secondaires: readonly string[]
): { email: string | null; emails_secondaires: string[] } {
  const toutes = [principal ?? "", ...secondaires].map((e) => e.trim().toLowerCase()).filter(Boolean);
  const uniques = [...new Set(toutes)];
  return { email: uniques[0] ?? null, emails_secondaires: uniques.slice(1) };
}

/** Déclenche le rappel e-mail des agréments en fin de validité (edge function
 *  `rappel-agrements`) - appelé une fois par jour au chargement de l'app AMO.
 *  Meilleur effort : un échec est silencieux, le rappel repartira demain. */
export async function declencherRappelAgrements(): Promise<void> {
  const cle = "rappel-agrements-dernier";
  const aujourdHui = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(cle) === aujourdHui) return;
    localStorage.setItem(cle, aujourdHui);
    await supabase.functions.invoke("rappel-agrements", { body: {} });
  } catch {
    /* rappel facultatif */
  }
}

export function usePrestataires() {
  return useQuery({
    queryKey: ["prestataires"],
    queryFn: async (): Promise<Prestataire[]> => {
      const { data, error } = await supabase
        .from("prestataires")
        .select("*")
        .order("raison_sociale");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddPrestataire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<"prestataires">) => {
      const { error } = await supabase.from("prestataires").insert(input);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["prestataires"] }),
  });
}

export function useUpdatePrestataire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"prestataires"> }) => {
      const { error } = await supabase.from("prestataires").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["prestataires"] }),
  });
}

export function useDeletePrestataire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prestataires").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["prestataires"] }),
  });
}
