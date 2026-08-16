// Fichiers du projet (bucket privé copro-files) + checklists de pièces par dispositif.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type Fichier = Tables<"fichiers">;

export const DOSSIERS = [
  "Diagnostic & audit",
  "Études techniques",
  "Plans de financement",
  "Marchés de travaux",
  "Assemblée générale",
  "Photos chantier",
] as const;

export function useFichiers(coproId: string | undefined) {
  return useQuery({
    queryKey: ["fichiers", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<Fichier[]> => {
      const { data, error } = await supabase
        .from("fichiers")
        .select("*")
        .eq("copro_id", coproId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUploadFichier(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    // nameOriginal : nom du fichier avant renommage assisté (traçabilité)
    mutationFn: async ({ file, dossier, nameOriginal }: { file: File; dossier: string; nameOriginal?: string }) => {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${coproId}/${dossier.replace(/[^a-zA-Z0-9-]/g, "_")}/${Date.now()}-${safe}`;
      const { error: eUp } = await supabase.storage.from("copro-files").upload(path, file);
      if (eUp) throw eUp;
      const { data: session } = await supabase.auth.getSession();
      const { error: eDb } = await supabase.from("fichiers").insert({
        copro_id: coproId,
        dossier,
        name: file.name,
        name_original: nameOriginal && nameOriginal !== file.name ? nameOriginal : null,
        storage_path: path,
        size: file.size,
        mime: file.type || null,
        uploaded_by: session.session?.user.id ?? null,
      });
      if (eDb) throw eDb;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fichiers", coproId] }),
  });
}

/** Rend un fichier visible (ou non) sur le portail copropriétaire. */
export function useTogglePartageFichier(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, partage }: { id: string; partage: boolean }) => {
      const { error } = await supabase.from("fichiers").update({ partage_copro: partage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fichiers", coproId] }),
  });
}

export function useDeleteFichier(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: Fichier) => {
      await supabase.storage.from("copro-files").remove([f.storage_path]);
      const { error } = await supabase.from("fichiers").delete().eq("id", f.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fichiers", coproId] }),
  });
}

export async function downloadFichier(f: Fichier) {
  const a = document.createElement("a");
  a.href = await urlSigneeFichier(f.storage_path);
  a.download = f.name;
  a.target = "_blank";
  a.click();
}

/** URL signée (5 min) d'un objet du bucket privé copro-files. */
export async function urlSigneeFichier(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("copro-files").createSignedUrl(path, 300);
  if (error || !data) throw error ?? new Error("URL de document indisponible");
  return data.signedUrl;
}

/** Formats que le navigateur affiche tel quel dans un cadre (aperçu sans téléchargement). */
const VISUALISABLES = /\.(pdf|png|jpe?g|gif|webp|svg|txt)$/i;

export const estVisualisable = (nom: string) => VISUALISABLES.test(nom);

// ========== Checklists de pièces ==========

export const CHECKLIST_TEMPLATES: { dispositif: string; label: string; items: string[] }[] = [
  {
    dispositif: "cee_avant",
    label: "CEE — Avant travaux",
    items: [
      "Devis signé avant engagement des travaux",
      "Attestation RGE de l'entreprise",
      "Note de dimensionnement / étude thermique",
      "Cadre contribution CEE signé",
      "PV d'AG votant les travaux",
      "Attestation sur l'honneur (partie A)",
    ],
  },
  {
    dispositif: "cee_apres",
    label: "CEE — Après travaux",
    items: [
      "Factures détaillées des travaux",
      "Attestation sur l'honneur (partie B) signée",
      "PV de réception des travaux",
      "Preuves de qualification RGE à date de facture",
    ],
  },
  {
    dispositif: "mpr_copro_2024",
    label: "MPR Copropriété 2024",
    items: [
      "Immatriculation du registre des copropriétés à jour",
      "Audit énergétique réglementaire",
      "PV d'AG (vote des travaux et du plan de financement)",
      "Devis des entreprises RGE",
      "Contrat AMO signé",
      "Évaluation énergétique avant/après (gain ≥ 35 %)",
      "RIB du syndic (compte travaux)",
    ],
  },
  {
    dispositif: "eco_ptz_2024",
    label: "Éco-PTZ collectif 2024",
    items: [
      "Formulaire emprunteur « copropriétés »",
      "Formulaire entreprise par action de travaux",
      "Devis descriptifs des travaux",
      "Attestations RGE",
      "PV d'AG autorisant l'emprunt collectif",
      "Liste des copropriétaires participants",
    ],
  },
];

export interface ChecklistWithItems extends Tables<"checklists"> {
  items: Tables<"checklist_items">[];
}

/** Checklists du dossier — créées depuis les gabarits au premier accès. */
export function useChecklists(coproId: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["checklists", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<ChecklistWithItems[]> => {
      const { data: existing, error } = await supabase
        .from("checklists")
        .select("*, checklist_items(*)")
        .eq("copro_id", coproId!);
      if (error) throw error;
      let lists = existing ?? [];
      const missing = CHECKLIST_TEMPLATES.filter((t) => !lists.some((l) => l.dispositif === t.dispositif));
      if (missing.length) {
        for (const t of missing) {
          const { data: cl, error: e1 } = await supabase
            .from("checklists")
            .insert({ copro_id: coproId!, dispositif: t.dispositif, label: t.label })
            .select()
            .single();
          if (e1) throw e1;
          const { error: e2 } = await supabase
            .from("checklist_items")
            .insert(t.items.map((label, i) => ({ checklist_id: cl.id, label, position: i })));
          if (e2) throw e2;
        }
        const { data: reloaded, error: e3 } = await supabase
          .from("checklists")
          .select("*, checklist_items(*)")
          .eq("copro_id", coproId!);
        if (e3) throw e3;
        lists = reloaded ?? [];
        void qc.invalidateQueries({ queryKey: ["checklists", coproId] });
      }
      return lists
        .map((l) => {
          const { checklist_items, ...rest } = l as typeof l & { checklist_items: Tables<"checklist_items">[] };
          return { ...rest, items: (checklist_items ?? []).sort((a, b) => a.position - b.position) };
        })
        .sort(
          (a, b) =>
            CHECKLIST_TEMPLATES.findIndex((t) => t.dispositif === a.dispositif) -
            CHECKLIST_TEMPLATES.findIndex((t) => t.dispositif === b.dispositif)
        );
    },
  });
}

export function useToggleChecklistItem(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from("checklist_items").update({ done }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["checklists", coproId] }),
  });
}
