// Consultations de prestations intellectuelles — côté AMO.
// La publication alerte par e-mail les prestataires référencés du métier
// concerné (edge function `notifier-consultation`). Les candidatures arrivent
// soit du portail prestataire (offre chiffrée + pièce jointe), soit en saisie
// manuelle AMO (candidature reçue hors plateforme).
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
  notifications: { statut: Tables<"consultation_notifications">["statut"] }[];
};

/** Nom + lieu affichables, que la copro soit sur la plateforme ou externe. */
export function consultationCible(cs: Consultation): { nom: string; lieu: string; externe: boolean } {
  if (cs.copro) {
    return { nom: cs.copro.name, lieu: cs.copro.adresse || cs.copro.city || "", externe: false };
  }
  return {
    nom: cs.copro_externe_nom ?? "—",
    lieu: [cs.copro_externe_adresse, cs.copro_externe_ville].filter(Boolean).join(", "),
    externe: true,
  };
}

export function useConsultations() {
  return useQuery({
    queryKey: ["consultations"],
    queryFn: async (): Promise<Consultation[]> => {
      const { data, error } = await supabase
        .from("consultations")
        .select("*, candidatures(*), coproprietes(name, city, adresse), consultation_notifications(statut)")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c) => {
        const { candidatures, coproprietes, consultation_notifications, ...rest } = c as typeof c & {
          candidatures: Tables<"candidatures">[];
          coproprietes: { name: string; city: string | null; adresse: string | null } | null;
          consultation_notifications: { statut: Tables<"consultation_notifications">["statut"] }[];
        };
        return {
          ...rest,
          candidatures: (candidatures ?? []).sort((a, b) => (a.received_at < b.received_at ? 1 : -1)),
          copro: coproprietes,
          notifications: consultation_notifications ?? [],
        };
      });
    },
  });
}

export interface PublishResult {
  /** Bilan de la notification des prestataires référencés. */
  notification: { total: number; envoyes: number; simules: number; erreurs: number; mode: string } | null;
  notifyError: string | null;
}

export function usePublishConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      type: Tables<"consultations">["type"];
      mission: string;
      date_limite: string | null;
      budget: number | null;
      copro_id: string | null;
      copro_externe_nom: string | null;
      copro_externe_adresse: string | null;
      copro_externe_ville: string | null;
      copro_externe_lots: number | null;
    }): Promise<PublishResult> => {
      const { data, error } = await supabase.from("consultations").insert(input).select("id").single();
      if (error) throw error;

      // Alerte e-mail des prestataires référencés du métier — la consultation
      // reste publiée même si la notification échoue (relance possible).
      const { data: notif, error: fnErr } = await supabase.functions.invoke("notifier-consultation", {
        body: { consultation_id: data.id },
      });
      return {
        notification: fnErr ? null : (notif as PublishResult["notification"]),
        notifyError: fnErr ? String(fnErr.message ?? fnErr) : null,
      };
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

/** Saisie manuelle d'une candidature reçue hors plateforme (mail, courrier…). */
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

/** Ouvre l'offre jointe d'une candidature (URL signée 60 s, bucket privé). */
export async function ouvrirOffre(fichierPath: string): Promise<void> {
  const { data, error } = await supabase.storage.from("offres-presta").createSignedUrl(fichierPath, 60);
  if (error) throw error;
  window.open(data.signedUrl, "_blank");
}
