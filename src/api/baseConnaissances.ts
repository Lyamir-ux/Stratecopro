// Base de connaissances - documents de référence de l'équipe AMO (guides,
// modèles, réglementation...), classés par secteur d'activité du projet.
// Bucket privé base-connaissances + table documents_reference (migration 0045),
// réservés à l'équipe AMO. Feedback Wafaa du 24/08/2026.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type DocumentReference = Tables<"documents_reference">;

/** Secteurs d'activité des projets Strat Eco - « Transverse » pour les
 *  documents communs à tous les secteurs. Colonne libre en base : ajouter
 *  un secteur ici suffit, les documents existants ne bougent pas. */
export const SECTEURS = [
  "Copropriété",
  "Bailleur social",
  "Tertiaire",
  "Collectivité",
  "Particulier",
  "Transverse",
] as const;

export function useDocumentsReference() {
  return useQuery({
    queryKey: ["documents-reference"],
    queryFn: async (): Promise<DocumentReference[]> => {
      const { data, error } = await supabase
        .from("documents_reference")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUploadDocumentReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, secteur, description }: { file: File; secteur: string; description?: string }) => {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${secteur.replace(/[^a-zA-Z0-9-]/g, "_")}/${Date.now()}-${safe}`;
      const { error: eUp } = await supabase.storage.from("base-connaissances").upload(path, file);
      if (eUp) throw eUp;
      const { data: session } = await supabase.auth.getSession();
      const { error: eDb } = await supabase.from("documents_reference").insert({
        secteur,
        name: file.name,
        description: description?.trim() || null,
        storage_path: path,
        size: file.size,
        mime: file.type || null,
        uploaded_by: session.session?.user.id ?? null,
      });
      if (eDb) throw eDb;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["documents-reference"] }),
  });
}

export function useDeleteDocumentReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: DocumentReference) => {
      await supabase.storage.from("base-connaissances").remove([doc.storage_path]);
      const { error } = await supabase.from("documents_reference").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["documents-reference"] }),
  });
}

export async function downloadDocumentReference(doc: DocumentReference) {
  const { data, error } = await supabase.storage.from("base-connaissances").createSignedUrl(doc.storage_path, 300);
  if (error || !data) throw error ?? new Error("URL de document indisponible");
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = doc.name;
  a.target = "_blank";
  a.click();
}
