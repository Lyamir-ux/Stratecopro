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

/** Prestations optionnelles proposées à la publication (cases à cocher).
 *  Uniquement pour une recherche de maîtrise d'œuvre — sans objet pour les autres métiers. */
export const CONSULT_OPTIONS: { id: string; label: string }[] = [
  { id: "audit_reglementaire", label: "Audit réglementaire" },
  { id: "pppt", label: "PPPT" },
  { id: "dpe_collectif", label: "DPE collectif" },
  { id: "memoire_climaxion", label: "Mémoire Climaxion" },
];

export const optionLabel = (id: string): string => CONSULT_OPTIONS.find((o) => o.id === id)?.label ?? id;

/** Sous-types d'une consultation « Diagnostiqueur ». */
export const DIAG_SOUS_TYPES: { id: string; label: string }[] = [
  { id: "amiante_plomb", label: "Diagnostic amiante et plomb avant travaux" },
  { id: "etancheite", label: "Test d'étanchéité à l'air" },
];

export const sousTypeLabel = (id: string): string => DIAG_SOUS_TYPES.find((s) => s.id === id)?.label ?? id;

export type Consultation = Tables<"consultations"> & {
  candidatures: Tables<"candidatures">[];
  copro: { name: string; city: string | null; adresse: string | null } | null;
  notifications: (Tables<"consultation_notifications"> & { prestataire: { raison_sociale: string } | null })[];
  docs: Tables<"consultation_docs">[];
  acces: (Tables<"consultation_acces"> & { prestataire: { raison_sociale: string } | null })[];
  questions: (Tables<"consultation_questions"> & { prestataire: { raison_sociale: string } | null })[];
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
        .select(
          "*, candidatures(*), coproprietes(name, city, adresse), consultation_notifications(*, prestataires(raison_sociale)), consultation_docs(*), consultation_acces(*, prestataires(raison_sociale)), consultation_questions(*, prestataires(raison_sociale))"
        )
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c) => {
        const {
          candidatures,
          coproprietes,
          consultation_notifications,
          consultation_docs,
          consultation_acces,
          consultation_questions,
          ...rest
        } = c as typeof c & {
          candidatures: Tables<"candidatures">[];
          coproprietes: { name: string; city: string | null; adresse: string | null } | null;
          consultation_notifications: (Tables<"consultation_notifications"> & {
            prestataires: { raison_sociale: string } | null;
          })[];
          consultation_docs: Tables<"consultation_docs">[];
          consultation_acces: (Tables<"consultation_acces"> & {
            prestataires: { raison_sociale: string } | null;
          })[];
          consultation_questions: (Tables<"consultation_questions"> & {
            prestataires: { raison_sociale: string } | null;
          })[];
        };
        return {
          ...rest,
          candidatures: (candidatures ?? []).sort((a, b) => (a.received_at < b.received_at ? 1 : -1)),
          copro: coproprietes,
          notifications: (consultation_notifications ?? []).map(({ prestataires, ...n }) => ({
            ...n,
            prestataire: prestataires,
          })),
          docs: consultation_docs ?? [],
          acces: (consultation_acces ?? [])
            .map(({ prestataires, ...a }) => ({ ...a, prestataire: prestataires }))
            .sort((a, b) => (a.first_at < b.first_at ? 1 : -1)),
          questions: (consultation_questions ?? [])
            .map(({ prestataires, ...q }) => ({ ...q, prestataire: prestataires }))
            .sort((a, b) => (a.asked_at < b.asked_at ? -1 : 1)),
        };
      });
    },
  });
}

export interface PublishResult {
  /** Bilan de la notification des prestataires référencés. */
  notification: { total: number; envoyes: number; simules: number; erreurs: number; mode: string } | null;
  notifyError: string | null;
  /** Documents dont le dépôt a échoué (la consultation reste publiée). */
  docErrors: string[];
}

export function usePublishConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      files,
      ...input
    }: {
      type: Tables<"consultations">["type"];
      mission: string;
      date_limite: string | null;
      budget: number | null;
      copro_id: string | null;
      copro_externe_nom: string | null;
      copro_externe_adresse: string | null;
      copro_externe_ville: string | null;
      copro_externe_lots: number | null;
      nb_logements: number | null;
      nb_batiments: number | null;
      sous_type: string | null;
      options: string[];
      files: File[];
    }): Promise<PublishResult> => {
      const { data, error } = await supabase.from("consultations").insert(input).select("id").single();
      if (error) throw error;

      // Pièces jointes : la consultation reste publiée même si un dépôt échoue
      const docErrors: string[] = [];
      for (const file of files) {
        const path = `${data.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("consultation-docs").upload(path, file);
        if (upErr) {
          docErrors.push(file.name);
          continue;
        }
        const { error: rowErr } = await supabase
          .from("consultation_docs")
          .insert({ consultation_id: data.id, path, name: file.name, size: file.size });
        if (rowErr) docErrors.push(file.name);
      }

      // Alerte e-mail des prestataires référencés du métier — la consultation
      // reste publiée même si la notification échoue (relance possible).
      const { data: notif, error: fnErr } = await supabase.functions.invoke("notifier-consultation", {
        body: { consultation_id: data.id },
      });
      return {
        notification: fnErr ? null : (notif as PublishResult["notification"]),
        notifyError: fnErr ? String(fnErr.message ?? fnErr) : null,
        docErrors,
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

/** Remise en ligne d'une consultation clôturée — pour relancer la recherche
 *  après la rétractation d'un prestataire retenu (faillite, devis expiré…). */
export function useReopenConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("consultations").update({ statut: "en_ligne" }).eq("id", id);
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

export interface DecisionResult {
  /** Sort de l'e-mail de décision : envoye / simule / erreur / aucun_email (candidature hors plateforme). */
  emailStatut: string | null;
  emailErreur: string | null;
}

/** Décision de l'AMO sur une candidature : retenir / refuser (e-mail automatique
 *  au prestataire via l'edge function `notifier-choix`), ou annuler la décision.
 *  Une MOE retenue accède à son projet dès qu'elle confirme son engagement. */
export function useDeciderCandidature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      statut,
    }: {
      id: string;
      statut: Tables<"candidatures">["statut"];
    }): Promise<DecisionResult> => {
      const patch =
        statut === "recue"
          ? { statut, decision_at: null, decision_email_statut: null, engagement_at: null }
          : { statut };
      const { error } = await supabase.from("candidatures").update(patch).eq("id", id);
      if (error) throw error;
      if (statut === "recue") return { emailStatut: null, emailErreur: null };
      // alerte e-mail au prestataire — la décision reste posée même si l'envoi échoue
      const { data, error: fnErr } = await supabase.functions.invoke("notifier-choix", {
        body: { candidature_id: id },
      });
      if (fnErr) return { emailStatut: "erreur", emailErreur: String(fnErr.message ?? fnErr) };
      const res = data as { statut: string; erreur: string | null };
      return { emailStatut: res.statut, emailErreur: res.erreur ?? null };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["consultations"] }),
  });
}

/** Questions de prestataires sans réponse sur les consultations en ligne —
 *  alimente l'alerte du menu « Consulter un intervenant » (côté AMO). */
export function useQuestionsEnAttenteCount(enabled = true) {
  return useQuery({
    queryKey: ["questions-en-attente"],
    enabled,
    refetchInterval: 120000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("consultation_questions")
        .select("id, consultations!inner(statut)", { count: "exact", head: true })
        .is("reponse", null)
        .eq("consultations.statut", "en_ligne");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Réponse de l'AMO à la question d'un candidat — visible de tous les
 *  candidats de la consultation (égalité d'information). */
export function useRepondreQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reponse }: { id: string; reponse: string }) => {
      const { error } = await supabase
        .from("consultation_questions")
        .update({ reponse: reponse.trim(), answered_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["consultations"] });
      void qc.invalidateQueries({ queryKey: ["questions-en-attente"] });
    },
  });
}

/** Ouvre l'offre jointe d'une candidature (URL signée 60 s, bucket privé). */
export async function ouvrirOffre(fichierPath: string): Promise<void> {
  const { data, error } = await supabase.storage.from("offres-presta").createSignedUrl(fichierPath, 60);
  if (error) throw error;
  window.open(data.signedUrl, "_blank");
}

/** Ouvre une pièce jointe de consultation (URL signée 60 s, bucket privé). */
export async function ouvrirDocConsultation(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from("consultation-docs").createSignedUrl(path, 60);
  if (error) throw error;
  window.open(data.signedUrl, "_blank");
}
