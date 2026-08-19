// Fichiers du projet (bucket privé copro-files) + checklists de pièces par dispositif.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type Fichier = Tables<"fichiers">;

export const DOSSIERS = [
  "Passation",
  "Diagnostic & audit",
  "Études techniques",
  "Plans de financement",
  "Marchés de travaux",
  "Assemblée générale",
  "Photos chantier",
] as const;

/** Quels documents vont dans quel dossier — texte de la bulle « ? » de chaque
 *  carte de l'onglet Fichiers. Modifiez librement les descriptions ci-dessous. */
export const DOSSIER_AIDE: Record<(typeof DOSSIERS)[number], string> = {
  "Passation":
    "Documents remis à la prise en main du dossier : règlement de copropriété, derniers PV d'AG, carnet d'entretien, contrats en cours et pièces transmises par le syndic.",
  "Diagnostic & audit":
    "Audit énergétique réglementaire, DPE collectif, PPPT et rapports de diagnostic de la copropriété.",
  "Études techniques":
    "Étude thermique, test d'étanchéité à l'air, diagnostic amiante-plomb, plans, contrats AMO et MOE.",
  "Plans de financement":
    "Plans de financement, accords de subvention, offres de prêt, attestations CEE (sur l'honneur, cadre contribution), RIB, immatriculation au registre et justificatifs des copropriétaires.",
  "Marchés de travaux":
    "Devis, factures, situations de travaux, marchés signés, ordres de service, CCTP / DCE, attestations RGE et décennales, Kbis, PV de réception.",
  "Assemblée générale":
    "Convocations, PV d'assemblée générale et courriers adressés aux copropriétaires.",
  "Photos chantier":
    "Photos de l'immeuble et du chantier — avant, pendant et après les travaux.",
};

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

/** Dépôt d'un fichier hors hook — sert aussi à l'import des documents de
 *  passation à la création du dossier (NewCoproDialog). */
export async function uploadFichierDirect(coproId: string, file: File, dossier: string, nameOriginal?: string) {
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
}

export function useUploadFichier(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    // nameOriginal : nom du fichier avant renommage assisté (traçabilité)
    mutationFn: ({ file, dossier, nameOriginal }: { file: File; dossier: string; nameOriginal?: string }) =>
      uploadFichierDirect(coproId, file, dossier, nameOriginal),
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
    // pièces obligatoires du dossier MaPrimeRénov' Copropriété (liste des
    // chefs de projet, feedback du 19/08/2026) — la clé `dispositif` reste
    // inchangée : c'est l'identifiant stocké en base
    dispositif: "mpr_copro_2024",
    label: "MaPrimeRénov' Copropriété",
    items: [
      "PV d'AG ayant décidé de réaliser les travaux",
      "PV d'AG nommant le représentant légal",
      "RIB du compte travaux",
      "Pièces marchés : devis détaillés / DPGF des travaux",
      "Devis détaillés des honoraires de MOE et des autres études",
      "Contrat du maître d'œuvre",
      "Convention AMO signée",
      "Audit énergétique réglementaire",
      "Déclarations d'urbanisme",
      "Fiche « État de la copropriété »",
      "Rapport d'enquête sociale",
      "Avis d'imposition des personnes éligibles aux aides individuelles (espace copropriétaires)",
      "Liste des primes individuelles",
      "Attestation de mise à jour du registre de copropriété",
      "Plan de financement définitif de la copropriété (Excel)",
    ],
  },
  {
    // millésime 2026 (feedback du 19/08/2026) — la clé `dispositif` reste
    // inchangée : c'est l'identifiant stocké en base
    dispositif: "eco_ptz_2024",
    label: "Éco-PTZ collectif 2026",
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
      // Les libellés suivent toujours le gabarit (ex. millésime 2024 → 2026) :
      // on resynchronise ceux qui ont changé, sans toucher aux items cochés.
      const renames = lists.flatMap((l) => {
        const t = CHECKLIST_TEMPLATES.find((x) => x.dispositif === l.dispositif);
        return t && t.label !== l.label ? [{ id: l.id, label: t.label }] : [];
      });
      if (renames.length) {
        const results = await Promise.all(
          renames.map((r) => supabase.from("checklists").update({ label: r.label }).eq("id", r.id))
        );
        for (const r of results) if (r.error) throw r.error;
        const byId = new Map(renames.map((r) => [r.id, r.label]));
        lists = lists.map((l) => (byId.has(l.id) ? { ...l, label: byId.get(l.id)! } : l));
      }
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
