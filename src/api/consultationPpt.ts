// Consultation PPPT + DPE collectif d'un dossier du suivi PPT (migration 0109,
// idée d'Amir 27/09/2026).
//
// Chantier 1 : le « Oui » du syndic publie directement la consultation aux
// bureaux d'études référencés du métier « PPPT + DPE collectif »
// (RPC ppt_demander_consultation_pppt, alerte notifier-consultation) ; la
// demande reste tracée dans « Demandes des syndics » et l'équipe est prévenue.
// Chantier 2 : le syndic suit la consultation sur sa fiche (compteurs sans les
// offres), puis retrouve offres, pièces et analyse une fois l'analyse publiée
// par l'équipe (RPC ppt_publier_analyse, e-mail notifier-analyse-offres).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import type { SuiviConsultation } from "@/lib/ppt/analyseOffres";

export type ConsultationPpt = Tables<"consultations">;
export type OffrePpt = Tables<"candidatures">;

export interface ResultatDemandeConsultation {
  demande_id: string;
  consultation_id: string;
  date_limite: string;
  /** Bureaux d'études alertés par e-mail (null si l'alerte a échoué). */
  alertes: { total: number; envoyes: number; simules: number; erreurs: number } | null;
}

const invalider = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ["demandes-amo"] });
  void qc.invalidateQueries({ queryKey: ["consultation-ppt"] });
  void qc.invalidateQueries({ queryKey: ["consultations"] });
};

/** « Oui » à la question de la colonne « Sans PPPT » : consultation publiée, bureaux d'études alertés, équipe prévenue. */
export function useDemanderConsultationPppt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pptCoproId: string): Promise<ResultatDemandeConsultation> => {
      const { data, error } = await supabase.rpc("ppt_demander_consultation_pppt", { p_ppt_copro: pptCoproId });
      if (error) throw error;
      const r = data as unknown as { demande_id: string; consultation_id: string; date_limite: string };
      // alertes e-mail : meilleur effort, la consultation est déjà en ligne
      let alertes: ResultatDemandeConsultation["alertes"] = null;
      try {
        const { data: n, error: e } = await supabase.functions.invoke("notifier-consultation", { body: { consultation_id: r.consultation_id } });
        if (!e) alertes = n as ResultatDemandeConsultation["alertes"];
      } catch {
        /* relance possible par l'équipe depuis « Consulter un intervenant » */
      }
      try {
        await supabase.functions.invoke("notifier-demande-amo", { body: { demande_id: r.demande_id } });
      } catch {
        /* l'alerte de l'équipe est facultative : la demande est dans « Demandes des syndics » */
      }
      return { ...r, alertes };
    },
    onSuccess: () => invalider(qc),
  });
}

/** Consultations d'un dossier PPT vues du syndic : compteurs, sans les offres avant l'analyse. */
export function useSuiviConsultationsPpt(pptCoproId: string | undefined) {
  return useQuery({
    queryKey: ["consultation-ppt", "suivi", pptCoproId],
    enabled: !!pptCoproId,
    queryFn: async (): Promise<SuiviConsultation[]> => {
      const { data, error } = await supabase.rpc("ppt_consultations_suivi", { p_ppt_copro: pptCoproId! });
      if (error) throw error;
      return (data as unknown as SuiviConsultation[]) ?? [];
    },
  });
}

/** Consultation et offres visibles (RLS 0109 : le syndic ne lit les offres qu'une fois l'analyse publiée). */
export function useConsultationPpt(consultationId: string | null | undefined) {
  return useQuery({
    queryKey: ["consultation-ppt", "detail", consultationId],
    enabled: !!consultationId,
    queryFn: async (): Promise<{ consultation: ConsultationPpt; offres: OffrePpt[] } | null> => {
      const { data, error } = await supabase.from("consultations").select("*").eq("id", consultationId!).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: offres, error: e2 } = await supabase.from("candidatures").select("*").eq("consultation_id", consultationId!);
      if (e2) throw e2;
      return { consultation: data, offres: offres ?? [] };
    },
  });
}

/** Publication de l'analyse au syndic (équipe AMO) : clôt la consultation, rend offres et pièces visibles, prévient le syndic. */
export function usePublierAnalyse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ consultationId, avis, candidatureId }: { consultationId: string; avis: string; candidatureId: string | null }) => {
      const { error } = await supabase.rpc("ppt_publier_analyse", { p_consultation: consultationId, p_avis: avis, p_candidature: candidatureId });
      if (error) throw error;
      try {
        const { data } = await supabase.functions.invoke("notifier-analyse-offres", { body: { consultation_id: consultationId } });
        return data as { total: number; envoyes: number; simules: number; erreurs: number } | null;
      } catch {
        return null;
      }
    },
    onSuccess: () => invalider(qc),
  });
}

/** Retrait de la publication : les offres redeviennent invisibles du syndic. */
export function useRetirerAnalyse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (consultationId: string) => {
      const { error } = await supabase.rpc("ppt_retirer_analyse", { p_consultation: consultationId });
      if (error) throw error;
    },
    onSuccess: () => invalider(qc),
  });
}
