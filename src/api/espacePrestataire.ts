// Espace prestataire (MOE & autres intervenants) — data layer.
// Tout est filtré par RLS : le prestataire connecté ne voit que les
// consultations EN LIGNE de ses métiers (+ celles où il a candidaté),
// ses propres candidatures, et — uniquement s'il est une MOE RETENUE —
// la fiche et les bâtiments des copropriétés de ses projets.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import type { Tables } from "@/lib/database.types";

export type CoproPublic = Pick<
  Tables<"coproprietes">,
  "id" | "name" | "adresse" | "city" | "code_postal" | "phase" | "fragile"
>;

export type ConsultationPresta = Tables<"consultations"> & {
  copro: CoproPublic | null;
  maCandidature: Tables<"candidatures"> | null;
  docs: Tables<"consultation_docs">[];
  questions: Tables<"consultation_questions">[];
};

export type CandidaturePresta = Tables<"candidatures"> & {
  consultation: (Tables<"consultations"> & { copro: CoproPublic | null }) | null;
};

const COPRO_COLS = "id, name, adresse, city, code_postal, phase, fragile";

/** Fiche entreprise du prestataire connecté (RLS : la sienne uniquement).
 *  Désactivé pour l'AMO (qui voit toutes les entreprises → choisit un aperçu). */
export function useMonPrestataire(enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["mon-prestataire", session?.user.id],
    enabled: !!session && enabled,
    queryFn: async (): Promise<Tables<"prestataires"> | null> => {
      const { data, error } = await supabase.from("prestataires").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Consultations visibles pour une entreprise : en ligne sur ses métiers
 *  + celles où elle a candidaté. Le filtre client reproduit la RLS du
 *  prestataire — nécessaire quand un AMO consulte l'espace en aperçu
 *  (sa RLS à lui renvoie tout). */
export function useConsultationsPresta(presta: Tables<"prestataires">) {
  return useQuery({
    queryKey: ["presta-consultations", presta.id],
    queryFn: async (): Promise<ConsultationPresta[]> => {
      const { data, error } = await supabase
        .from("consultations")
        .select(`*, coproprietes(${COPRO_COLS}), candidatures(*), consultation_docs(*), consultation_questions(*)`)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map((c) => {
          const { coproprietes, candidatures, consultation_docs, consultation_questions, ...rest } = c as typeof c & {
            coproprietes: CoproPublic | null;
            candidatures: Tables<"candidatures">[];
            consultation_docs: Tables<"consultation_docs">[];
            consultation_questions: Tables<"consultation_questions">[];
          };
          return {
            ...rest,
            copro: coproprietes,
            maCandidature: (candidatures ?? []).find((k) => k.prestataire_id === presta.id) ?? null,
            docs: consultation_docs ?? [],
            questions: (consultation_questions ?? []).sort((a, b) => (a.asked_at < b.asked_at ? -1 : 1)),
          };
        })
        .filter((c) => c.maCandidature || presta.types.includes(c.type));
    },
  });
}

/** Historique des candidatures d'une entreprise. */
export function useMesCandidatures(prestaId: string) {
  return useQuery({
    queryKey: ["presta-candidatures", prestaId],
    queryFn: async (): Promise<CandidaturePresta[]> => {
      const { data, error } = await supabase
        .from("candidatures")
        .select(`*, consultations(*, coproprietes(${COPRO_COLS}))`)
        .eq("prestataire_id", prestaId)
        .order("received_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c) => {
        const { consultations, ...rest } = c as typeof c & {
          consultations:
            | (Tables<"consultations"> & { coproprietes: CoproPublic | null })
            | null;
        };
        return {
          ...rest,
          consultation: consultations
            ? { ...consultations, copro: consultations.coproprietes ?? null }
            : null,
        };
      });
    },
  });
}

/** Trace la récupération du dossier de consultation par le prestataire
 *  (alimente l'onglet « État de la consultation » côté AMO). Meilleur effort :
 *  l'échec est ignoré — l'aperçu AMO d'un espace prestataire, notamment,
 *  n'a pas le droit d'écrire cette trace (et ne doit pas la fausser). */
export async function marquerConsultationRecuperee(consultationId: string, prestataireId: string): Promise<void> {
  try {
    await supabase.from("consultation_acces").upsert(
      { consultation_id: consultationId, prestataire_id: prestataireId, last_at: new Date().toISOString() },
      { onConflict: "consultation_id,prestataire_id" }
    );
  } catch {
    /* trace facultative */
  }
}

/** Question posée à l'AMO sur une consultation avant de candidater.
 *  La réponse (visible de tous les candidats) arrive depuis /consultations. */
export function usePoserQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ consultationId, prestataireId, question }: {
      consultationId: string;
      prestataireId: string;
      question: string;
    }) => {
      const { error } = await supabase.from("consultation_questions").insert({
        consultation_id: consultationId,
        prestataire_id: prestataireId,
        question: question.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["presta-consultations"] }),
  });
}

/** Détail tarifaire d'une offre MOE ; `options` suit les cases cochées à la
 *  publication de la consultation. Le PRO/DCE et le suivi de chantier se
 *  chiffrent au forfait (€ HT) ou en pourcentage du montant des travaux —
 *  la valeur est dans l'unité du mode. */
export interface TarifsMoe {
  diag_avp: number | null;
  pro_dce: number | null;
  pro_dce_mode: "forfait" | "pourcentage";
  chantier: number | null;
  chantier_mode: "forfait" | "pourcentage";
  options: Record<string, number>;
}

/** Détail tarifaire des autres missions : test d'étanchéité à l'air
 *  (avant / après travaux) et CT / SPS (conception / réalisation), € HT. */
export interface TarifsSimples {
  etancheite_avant?: number | null;
  etancheite_apres?: number | null;
  conception?: number | null;
  realisation?: number | null;
}

/** Dépôt d'offre : pièce jointe optionnelle (bucket privé) + candidature. */
export function usePostuler() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({
      consultation,
      prestataire,
      montant,
      message,
      file,
      tarifs,
      tarifsSimples,
    }: {
      consultation: ConsultationPresta;
      prestataire: Tables<"prestataires">;
      montant: number | null;
      message: string;
      file: File | null;
      tarifs: TarifsMoe | null;
      tarifsSimples: TarifsSimples | null;
    }) => {
      if (!session) throw new Error("Session expirée");
      let fichier_path: string | null = null;
      let fichier_name: string | null = null;
      if (file) {
        fichier_path = `${session.user.id}/${consultation.id}-${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
        fichier_name = file.name;
        const { error: upErr } = await supabase.storage.from("offres-presta").upload(fichier_path, file);
        if (upErr) throw upErr;
      }
      const { error } = await supabase.from("candidatures").insert({
        consultation_id: consultation.id,
        prestataire_id: prestataire.id,
        org_name: prestataire.raison_sociale,
        montant,
        message: message.trim() || null,
        fichier_path,
        fichier_name,
        tarif_diag_avp: tarifs?.diag_avp ?? null,
        tarif_pro_dce: tarifs?.pro_dce ?? null,
        tarif_pro_dce_mode: tarifs?.pro_dce_mode ?? "forfait",
        tarif_chantier: tarifs?.chantier ?? null,
        tarif_chantier_mode: tarifs?.chantier_mode ?? "forfait",
        tarif_options: tarifs && Object.keys(tarifs.options).length > 0 ? tarifs.options : null,
        tarif_etancheite_avant: tarifsSimples?.etancheite_avant ?? null,
        tarif_etancheite_apres: tarifsSimples?.etancheite_apres ?? null,
        tarif_conception: tarifsSimples?.conception ?? null,
        tarif_realisation: tarifsSimples?.realisation ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["presta-consultations"] });
      void qc.invalidateQueries({ queryKey: ["presta-candidatures"] });
    },
  });
}

/** Retrait d'une candidature encore à l'étude (consultation en ligne, offre
 *  « reçue ») — la pièce jointe est supprimée du bucket avec la candidature. */
export function useRetirerCandidature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cand: Tables<"candidatures">) => {
      if (cand.fichier_path) {
        // meilleur effort : la candidature part même si le fichier résiste
        await supabase.storage.from("offres-presta").remove([cand.fichier_path]).catch(() => undefined);
      }
      const { error } = await supabase.from("candidatures").delete().eq("id", cand.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["presta-consultations"] });
      void qc.invalidateQueries({ queryKey: ["presta-candidatures"] });
    },
  });
}

/** Le prestataire retenu confirme son engagement sur l'opération — pour une
 *  MOE, le projet passe alors dans « Mes projets ». */
export function useConfirmerEngagement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (candidatureId: string) => {
      const { error } = await supabase
        .from("candidatures")
        .update({ engagement_at: new Date().toISOString() })
        .eq("id", candidatureId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["presta-candidatures"] });
      void qc.invalidateQueries({ queryKey: ["presta-projets-moe"] });
    },
  });
}

// ========== Fiche entreprise (section « Mon entreprise ») ==========

/** Coordonnées éditables par le prestataire — les métiers, le référencement
 *  et la raison sociale restent pilotés par l'AMO (trigger côté base). */
export function useMajMonPrestataire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<
        Pick<
          Tables<"prestataires">,
          "email" | "email_secondaire" | "telephone" | "adresse" | "ville" | "logo_path" | "contact_nom"
        >
      >;
    }) => {
      const { error } = await supabase.from("prestataires").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["mon-prestataire"] });
      void qc.invalidateQueries({ queryKey: ["prestataires"] });
    },
  });
}

export function useContactsPresta(prestaId: string) {
  return useQuery({
    queryKey: ["presta-contacts", prestaId],
    queryFn: async (): Promise<Tables<"prestataire_contacts">[]> => {
      const { data, error } = await supabase
        .from("prestataire_contacts")
        .select("*")
        .eq("prestataire_id", prestaId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddContactPresta(prestaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nom: string; role: string; email: string; telephone: string }) => {
      const { error } = await supabase.from("prestataire_contacts").insert({
        prestataire_id: prestaId,
        nom: input.nom.trim(),
        role: input.role.trim() || null,
        email: input.email.trim() || null,
        telephone: input.telephone.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["presta-contacts", prestaId] }),
  });
}

export function useDeleteContactPresta(prestaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prestataire_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["presta-contacts", prestaId] }),
  });
}

export function useDocsPresta(prestaId: string) {
  return useQuery({
    queryKey: ["presta-docs", prestaId],
    queryFn: async (): Promise<Tables<"prestataire_docs">[]> => {
      const { data, error } = await supabase
        .from("prestataire_docs")
        .select("*")
        .eq("prestataire_id", prestaId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Dossier de dépôt dans presta-docs : celui du compte rattaché à l'entreprise
 *  (le prestataire garde ainsi l'accès à ses fichiers même déposés en aperçu AMO). */
const dossierPresta = (presta: Tables<"prestataires">, sessionUid: string) =>
  presta.user_id ?? sessionUid;

/** Dépôt d'un document de certification (RGE, qualification, assurance…). */
export function useUploadDocPresta(presta: Tables<"prestataires">) {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!session) throw new Error("Session expirée");
      const path = `${dossierPresta(presta, session.user.id)}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("presta-docs").upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from("prestataire_docs").insert({
        prestataire_id: presta.id,
        path,
        name: file.name,
        size: file.size,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["presta-docs", presta.id] }),
  });
}

export function useDeleteDocPresta(prestaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: Tables<"prestataire_docs">) => {
      await supabase.storage.from("presta-docs").remove([doc.path]).catch(() => undefined);
      const { error } = await supabase.from("prestataire_docs").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["presta-docs", prestaId] }),
  });
}

/** Ouvre un document du bucket privé presta-docs (URL signée 60 s). */
export async function ouvrirDocPresta(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from("presta-docs").createSignedUrl(path, 60);
  if (error) throw error;
  window.open(data.signedUrl, "_blank");
}

/** Dépôt du logo de l'entreprise (remplace l'ancien) + mise à jour de la fiche. */
export function useUploadLogoPresta(presta: Tables<"prestataires">) {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!session) throw new Error("Session expirée");
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${dossierPresta(presta, session.user.id)}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("presta-docs").upload(path, file);
      if (upErr) throw upErr;
      if (presta.logo_path) {
        await supabase.storage.from("presta-docs").remove([presta.logo_path]).catch(() => undefined);
      }
      const { error } = await supabase.from("prestataires").update({ logo_path: path }).eq("id", presta.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["mon-prestataire"] });
      void qc.invalidateQueries({ queryKey: ["prestataires"] });
      void qc.invalidateQueries({ queryKey: ["presta-logo"] });
    },
  });
}

/** URL signée (5 min) du logo de l'entreprise. */
export function useLogoPresta(logoPath: string | null) {
  return useQuery({
    queryKey: ["presta-logo", logoPath],
    enabled: !!logoPath,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage.from("presta-docs").createSignedUrl(logoPath!, 300);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export type ProjetMoe = {
  candidature: Tables<"candidatures">;
  consultation: Tables<"consultations">;
  copro: CoproPublic;
  batiments: Tables<"batiments">[];
};

/** Projets d'une MOE retenue : copros accessibles en lecture (fiche + bâtiments). */
export function useMesProjetsMoe(enabled: boolean, prestaId: string) {
  return useQuery({
    queryKey: ["presta-projets-moe", prestaId],
    enabled,
    queryFn: async (): Promise<ProjetMoe[]> => {
      const { data, error } = await supabase
        .from("candidatures")
        .select(`*, consultations(*, coproprietes(${COPRO_COLS}))`)
        .eq("prestataire_id", prestaId)
        .eq("statut", "retenue");
      if (error) throw error;
      const rows: Omit<ProjetMoe, "batiments">[] = [];
      for (const c of data ?? []) {
        const { consultations, ...cand } = c as typeof c & {
          consultations:
            | (Tables<"consultations"> & { coproprietes: CoproPublic | null })
            | null;
        };
        if (consultations?.type === "moe" && consultations.coproprietes) {
          const { coproprietes, ...cs } = consultations;
          rows.push({
            candidature: cand as Tables<"candidatures">,
            consultation: cs as Tables<"consultations">,
            copro: coproprietes,
          });
        }
      }

      if (rows.length === 0) return [];
      const { data: bats, error: bErr } = await supabase
        .from("batiments")
        .select("*")
        .in("copro_id", rows.map((r) => r.copro.id))
        .order("position");
      if (bErr) throw bErr;
      return rows.map((r) => ({
        ...r,
        batiments: (bats ?? []).filter((b) => b.copro_id === r.copro.id),
      }));
    },
  });
}
