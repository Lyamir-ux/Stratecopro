import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import type { IconName } from "@/components/Icon";

export const CONSULT_TYPES: { id: Tables<"consultations">["type"]; label: string; icon: IconName }[] = [
  { id: "moe", label: "Maîtrise d'œuvre", icon: "hammer" },
  { id: "diag", label: "Diagnostiqueur", icon: "fileCheck" },
  { id: "ct", label: "Contrôleur technique", icon: "clipboard" },
  { id: "sps", label: "Coordonnateur SPS", icon: "users" },
  { id: "autre", label: "Autre intervenant", icon: "briefcase" },
];

export type Consultation = Tables<"consultations"> & {
  candidatures: Tables<"candidatures">[];
  copro: { name: string; city: string | null; adresse: string | null } | null;
};

export function useConsultations() {
  return useQuery({
    queryKey: ["consultations"],
    queryFn: async (): Promise<Consultation[]> => {
      const { data, error } = await supabase
        .from("consultations")
        .select("*, candidatures(*), coproprietes(name, city, adresse)")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c) => {
        const { candidatures, coproprietes, ...rest } = c as typeof c & {
          candidatures: Tables<"candidatures">[];
          coproprietes: { name: string; city: string | null; adresse: string | null } | null;
        };
        return {
          ...rest,
          candidatures: (candidatures ?? []).sort((a, b) => (a.received_at < b.received_at ? 1 : -1)),
          copro: coproprietes,
        };
      });
    },
  });
}

export function usePublishConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      copro_id: string;
      type: Tables<"consultations">["type"];
      mission: string;
      date_limite: string | null;
      budget: number | null;
    }) => {
      const { error } = await supabase.from("consultations").insert(input);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["consultations"] }),
  });
}

export function useCloseConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("consultations").update({ statut: "cloturee" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["consultations"] }),
  });
}

/** Saisie manuelle d'une candidature reçue (le portail intervenant arrive en phase 2). */
export function useAddCandidature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ consultationId, org }: { consultationId: string; org: string }) => {
      const { error } = await supabase.from("candidatures").insert({ consultation_id: consultationId, org_name: org });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["consultations"] }),
  });
}

export function useSetCandidatureStatut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: Tables<"candidatures">["statut"] }) => {
      const { error } = await supabase.from("candidatures").update({ statut }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["consultations"] }),
  });
}
