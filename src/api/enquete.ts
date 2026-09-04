// Enquête sociale & technique : questionnaire configurable + réponses
// (RFR - donnée sensible, RLS AMO). Le contenu des questions vit dans
// src/lib/enqueteCatalogue.ts - la base ne stocke que la configuration.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, Tables } from "@/lib/database.types";
import { determineProfil, type Bareme, type Profil } from "@/lib/finance";
import { defaultConfig, type ConfigItem } from "@/lib/enqueteCatalogue";

export type Enquete = Tables<"enquetes">;
export type Reponse = Tables<"enquete_reponses"> & { coproprietaire: { nom: string } | null };

/** L'enquête du dossier - créée avec le questionnaire par défaut si absente. */
export function useEnquete(coproId: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["enquete", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<Enquete> => {
      const { data, error } = await supabase.from("enquetes").select("*").eq("copro_id", coproId!).maybeSingle();
      if (error) throw error;
      if (data) return data;
      const { data: created, error: e2 } = await supabase
        .from("enquetes")
        .insert({ copro_id: coproId!, questions: defaultConfig() as unknown as Json })
        .select()
        .single();
      if (e2) throw e2;
      void qc.invalidateQueries({ queryKey: ["enquete", coproId] });
      return created;
    },
  });
}

export function useUpdateEnquete(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      questions,
      ...patch
    }: { id: string; questions?: ConfigItem[] } & Partial<Pick<Enquete, "statut" | "sent_at">>) => {
      const { error } = await supabase
        .from("enquetes")
        .update({ ...patch, ...(questions ? { questions: questions as unknown as Json } : {}) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["enquete", coproId] }),
  });
}

export function useReponses(enqueteId: string | undefined) {
  return useQuery({
    queryKey: ["reponses", enqueteId],
    enabled: !!enqueteId,
    queryFn: async (): Promise<Reponse[]> => {
      const { data, error } = await supabase
        .from("enquete_reponses")
        .select("*, coproprietaires(nom)")
        .eq("enquete_id", enqueteId!);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const { coproprietaires, ...rest } = r as typeof r & { coproprietaires: { nom: string } | null };
        return { ...rest, coproprietaire: coproprietaires };
      });
    },
  });
}

/**
 * Enregistre une réponse saisie par l'AMO ; le profil MPR est recalculé par le
 * moteur au moment de la saisie. `verifie` : l'AMO a contrôlé les ressources
 * sur l'avis d'imposition (profil VÉRIFIÉ et daté - feedback Théa 03/09/2026) ;
 * sinon le profil reste DÉCLARATIF.
 */
export function useSaveReponse(enqueteId: string, coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      coproprietaireId: string;
      nbPersonnes: number | null;
      statutOccupation: string | null;
      rfr: number | null;
      rfrN2?: number | null;
      bareme: Bareme;
      verifie?: boolean;
    }) => {
      const profil: Profil | null =
        input.nbPersonnes != null && input.rfr != null
          ? determineProfil(input.nbPersonnes, input.rfr, input.bareme)
          : null;
      const { data: session } = await supabase.auth.getSession();
      const verifie = !!input.verifie && !!profil;
      const { error } = await supabase.from("enquete_reponses").upsert(
        {
          enquete_id: enqueteId,
          coproprietaire_id: input.coproprietaireId,
          nb_personnes: input.nbPersonnes,
          statut_occupation: input.statutOccupation,
          rfr: input.rfr,
          ...(input.rfrN2 !== undefined ? { rfr_n2: input.rfrN2 } : {}),
          profil_mpr: profil,
          profil_statut: verifie ? "verifie" : "declaratif",
          profil_verifie_le: verifie ? new Date().toISOString() : null,
          profil_verifie_par: verifie ? session.session?.user.id ?? null : null,
        },
        { onConflict: "enquete_id,coproprietaire_id" }
      );
      if (error) throw error;
      return profil;
    },
    onSuccess: () => invalidateReponses(qc, enqueteId, coproId),
  });
}

function invalidateReponses(qc: ReturnType<typeof useQueryClient>, enqueteId: string, coproId: string) {
  void qc.invalidateQueries({ queryKey: ["reponses", enqueteId] });
  void qc.invalidateQueries({ queryKey: ["profils", coproId] });
  void qc.invalidateQueries({ queryKey: ["portail"] });
}

/** Marque le profil d'un copropriétaire VÉRIFIÉ (sur l'avis d'imposition) ou le repasse en DÉCLARATIF. */
export function useVerifierProfil(enqueteId: string, coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { coproprietaireId: string; verifie: boolean }) => {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase
        .from("enquete_reponses")
        .update(
          input.verifie
            ? {
                profil_statut: "verifie",
                profil_verifie_le: new Date().toISOString(),
                profil_verifie_par: session.session?.user.id ?? null,
              }
            : { profil_statut: "declaratif", profil_verifie_le: null, profil_verifie_par: null }
        )
        .eq("enquete_id", enqueteId)
        .eq("coproprietaire_id", input.coproprietaireId)
        .not("profil_mpr", "is", null);
      if (error) throw error;
    },
    onSuccess: () => invalidateReponses(qc, enqueteId, coproId),
  });
}

/** Profil MPR par copropriétaire (pour l'étape 4 et les plans individuels). */
export function useProfilsCopro(coproId: string | undefined) {
  return useQuery({
    queryKey: ["profils", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<Map<string, Profil>> => {
      const { data, error } = await supabase
        .from("enquete_reponses")
        .select("coproprietaire_id, profil_mpr, enquetes!inner(copro_id)")
        .eq("enquetes.copro_id", coproId!)
        .not("profil_mpr", "is", null);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.coproprietaire_id, r.profil_mpr as Profil]));
    },
  });
}
