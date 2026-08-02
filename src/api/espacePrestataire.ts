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
  "id" | "name" | "adresse" | "city" | "quartier" | "phase" | "fragile"
>;

export type ConsultationPresta = Tables<"consultations"> & {
  copro: CoproPublic | null;
  maCandidature: Tables<"candidatures"> | null;
};

export type CandidaturePresta = Tables<"candidatures"> & {
  consultation: (Tables<"consultations"> & { copro: CoproPublic | null }) | null;
};

const COPRO_COLS = "id, name, adresse, city, quartier, phase, fragile";

/** Fiche entreprise du prestataire connecté (RLS : la sienne uniquement). */
export function useMonPrestataire() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["mon-prestataire", session?.user.id],
    enabled: !!session,
    queryFn: async (): Promise<Tables<"prestataires"> | null> => {
      const { data, error } = await supabase.from("prestataires").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Consultations visibles : en ligne sur ses métiers + celles où il a candidaté. */
export function useConsultationsPresta() {
  return useQuery({
    queryKey: ["presta-consultations"],
    queryFn: async (): Promise<ConsultationPresta[]> => {
      // le select imbriqué candidatures(*) ne renvoie que LES SIENNES (RLS)
      const { data, error } = await supabase
        .from("consultations")
        .select(`*, coproprietes(${COPRO_COLS}), candidatures(*)`)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c) => {
        const { coproprietes, candidatures, ...rest } = c as typeof c & {
          coproprietes: CoproPublic | null;
          candidatures: Tables<"candidatures">[];
        };
        return { ...rest, copro: coproprietes, maCandidature: candidatures?.[0] ?? null };
      });
    },
  });
}

/** Historique des candidatures du prestataire connecté. */
export function useMesCandidatures() {
  return useQuery({
    queryKey: ["presta-candidatures"],
    queryFn: async (): Promise<CandidaturePresta[]> => {
      const { data, error } = await supabase
        .from("candidatures")
        .select(`*, consultations(*, coproprietes(${COPRO_COLS}))`)
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
    }: {
      consultation: ConsultationPresta;
      prestataire: Tables<"prestataires">;
      montant: number | null;
      message: string;
      file: File | null;
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
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["presta-consultations"] });
      void qc.invalidateQueries({ queryKey: ["presta-candidatures"] });
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
export function useMesProjetsMoe(enabled: boolean) {
  return useQuery({
    queryKey: ["presta-projets-moe"],
    enabled,
    queryFn: async (): Promise<ProjetMoe[]> => {
      const { data, error } = await supabase
        .from("candidatures")
        .select(`*, consultations(*, coproprietes(${COPRO_COLS}))`)
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
