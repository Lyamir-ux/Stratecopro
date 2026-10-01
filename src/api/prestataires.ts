// Base d'entreprises référencées (prestations intellectuelles) - côté AMO.
// Chaque prestataire couvre un ou plusieurs métiers (types) ; à la publication
// d'une consultation, l'edge function `notifier-consultation` alerte par
// e-mail tous les prestataires actifs du métier concerné.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";
import { resoudreMaitreOeuvre } from "@/lib/maitreOeuvre";

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

/**
 * Maître d'œuvre saisi rapproché des fiches de la Base prestataires (règle de
 * lib/maitreOeuvre) : nom à poser sur le dossier et fiche à créer ou non.
 */
export async function resoudreMaitreOeuvreEnBase(saisie: string, options?: { citationSuffit?: boolean }) {
  const { data, error } = await supabase.from("prestataires").select("id, raison_sociale");
  if (error) throw error;
  return resoudreMaitreOeuvre(saisie, data ?? [], options);
}

/**
 * Fiche d'un nouveau maître d'œuvre (bug d'Amir du 01/10/2026) : métier
 * « Maître d'œuvre », sans e-mail - l'AMO complète e-mails et contacts dans la
 * Base prestataires. Le dossier lui est relié par son nom (0119, 0120).
 */
export async function creerFicheMaitreOeuvre(nom: string): Promise<void> {
  const { error } = await supabase.from("prestataires").insert({ raison_sociale: nom, types: ["moe"] });
  if (error) throw error;
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
