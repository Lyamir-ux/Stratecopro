// Espace syndic : lecture du périmètre géré (RLS copro_members 'syndic').
// Le gestionnaire écrit sur quelques tables ciblées : suivi financier, montage
// bancaire, choix de financement d'un copropriétaire (useSaveChoixGestionnaire,
// api/portail.ts). Les réponses d'enquête passent par la RPC
// enquete_reponses_syndic qui exclut le RFR (donnée sensible).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { uploadFichierDirect, urlSigneeFichier } from "@/api/fichiers";
import type { Tables } from "@/lib/database.types";

export type CoproRow = Tables<"coproprietes">;
export type CoproStats = Tables<"copro_stats">;

export interface SyndicCopro extends CoproRow {
  stats: CoproStats | null;
}

export interface MonOrganisation {
  id: string;
  nom: string;
  role: Tables<"organisation_membres">["org_role"];
}

/**
 * L'enseigne du gestionnaire connecté et son rôle dedans. Un directeur voit
 * tout le portefeuille de l'organisation, un gestionnaire ses seules copros.
 */
export function useMonOrganisation() {
  return useQuery({
    queryKey: ["syndic", "organisation"],
    queryFn: async (): Promise<MonOrganisation | null> => {
      // Filtre explicite sur l'utilisateur : l'AMO, qui gère les enseignes, lit
      // toutes les lignes - sans ce filtre son aperçu de l'espace syndic casse.
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from("organisation_membres")
        .select("org_role, organisations(id, nom)")
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw error;
      if (!data?.organisations) return null;
      return { id: data.organisations.id, nom: data.organisations.nom, role: data.org_role };
    },
  });
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

/**
 * Honoraires du syndic par copropriété - somme des lignes « syndic » des frais
 * annexes du PF définitif validé (lues dans l'instantané `resultat`, léger :
 * on ne charge pas les plans entiers). Copros sans PF validé : absentes.
 */
export function useHonorairesSyndic(coproIds: string[]) {
  return useQuery({
    queryKey: ["syndic", "honoraires", [...coproIds].sort().join(",")],
    enabled: coproIds.length > 0,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase
        .from("plans_definitifs")
        .select("copro_id, updated_at, moe:resultat->moe")
        .eq("statut", "valide")
        .in("copro_id", coproIds)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const m = new Map<string, number>();
      type Ligne = { designation?: string; montantTtc?: number };
      for (const row of (data ?? []) as unknown as { copro_id: string; moe: Ligne[] | null }[]) {
        if (m.has(row.copro_id)) continue; // au plus un plan validé - on garde le plus récent
        const total = (row.moe ?? [])
          .filter((l) => /syndic/i.test(l.designation ?? ""))
          .reduce((s, l) => s + (l.montantTtc ?? 0), 0);
        m.set(row.copro_id, total);
      }
      return m;
    },
  });
}

/** L'enquête sociale du dossier - lecture pure (pas de création côté syndic). */
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

/** Réponses d'enquête vues syndic - SANS le RFR (RPC dédiée). */
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

// ========== Base documentaire du dossier ==========

export type OrigineDocument = "amo" | "moe" | "syndic";

export interface DocumentSyndic {
  id: string;
  name: string;
  /** Chemin dans le bucket copro-files (URL signée à la demande). */
  path: string;
  size: number | null;
  dossier: string;
  date: string | null;
  origine: OrigineDocument;
  /** Déposé par l'utilisateur connecté depuis l'onglet Fichiers (table fichiers) :
   *  seul cas où il peut le retirer (policy fichiers_syndic_delete_own). */
  mien: boolean;
}

export const ORIGINE_LABEL: Record<OrigineDocument, string> = {
  amo: "AMO",
  moe: "MOE",
  syndic: "Projet syndic",
};

/**
 * Tous les documents du dossier : ceux déposés par l'équipe projet (table
 * fichiers) ET ceux fournis à la banque depuis l'onglet Documents à produire
 * (montage_docs.files), avec l'origine de chaque pièce.
 *
 * Passe par la RPC documents_dossier : l'origine se déduit du rôle du déposant,
 * or un syndic ne lit que son propre profil - la jointure ne peut pas se faire
 * côté client. Le drapeau partage_copro ne filtre PAS cette liste : il ne
 * concerne que le portail des copropriétaires.
 */
export function useDocumentsSyndic(coproId: string | undefined) {
  return useQuery({
    queryKey: ["syndic", "documents", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<DocumentSyndic[]> => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id ?? null;
      const [{ data, error }, miens] = await Promise.all([
        supabase.rpc("documents_dossier", { p_copro_id: coproId! }),
        // Mes propres dépôts (la RPC ne renvoie pas le déposant)
        uid
          ? supabase.from("fichiers").select("id").eq("copro_id", coproId!).eq("uploaded_by", uid)
          : Promise.resolve({ data: [] as { id: string }[], error: null }),
      ]);
      if (error) throw error;
      if (miens.error) throw miens.error;
      const mesIds = new Set((miens.data ?? []).map((f) => f.id));
      return (data ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        path: d.path,
        size: d.taille,
        dossier: d.dossier,
        date: d.depose_le,
        origine: (d.origine as OrigineDocument) ?? "amo",
        mien: mesIds.has(d.id),
      }));
    },
  });
}

/** Dépôt d'un fichier du projet par le syndic - même chemin que l'AMO
 *  (bucket copro-files + table fichiers, policies 0058). */
export function useUploadDocumentSyndic(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, dossier, nameOriginal }: { file: File; dossier: string; nameOriginal?: string }) =>
      uploadFichierDirect(coproId, file, dossier, nameOriginal),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["syndic", "documents", coproId] });
      void qc.invalidateQueries({ queryKey: ["fichiers", coproId] });
    },
  });
}

/** Retrait d'un fichier déposé par le syndic lui-même (`mien`). */
export function useSupprimerDocumentSyndic(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: DocumentSyndic) => {
      if (!d.mien) throw new Error("Seuls vos propres dépôts peuvent être retirés.");
      await supabase.storage.from("copro-files").remove([d.path]);
      const { error } = await supabase.from("fichiers").delete().eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["syndic", "documents", coproId] });
      void qc.invalidateQueries({ queryKey: ["fichiers", coproId] });
    },
  });
}

/** Télécharge un document du dossier (URL signée 5 min, bucket privé). */
export async function telechargerDocument(d: DocumentSyndic) {
  const a = document.createElement("a");
  a.href = await urlSigneeFichier(d.path);
  a.download = d.name;
  a.target = "_blank";
  a.click();
}
