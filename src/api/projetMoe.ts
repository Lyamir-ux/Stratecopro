// Fiche projet de la maîtrise d'œuvre (espace prestataire, « Mes projets ») -
// demande d'Amir du 14/10/2026. Lecture seule, sauf le dépôt des pièces des
// « Documents à produire » qui reviennent à la MOE. Tout passe par la RLS et
// les fonctions de la migration 0165 : dossiers dont l'entreprise est la MOE
// retenue ou citée, aucune donnée personnelle des copropriétaires. En aperçu,
// l'AMO voit ce que voit l'entreprise (les fonctions prennent son id).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { nomFichierSansAccents } from "@/lib/nommage";
import { ciblesMontagePourType, TYPES_NON_PROPAGES } from "@/api/propagation";
import { docDef, type MontageFile, type MontageId } from "@/api/montage";
import type { DocumentSyndic, OrigineDocument } from "@/api/syndic";
import type { Json, Tables } from "@/lib/database.types";

/** Fiche de la copropriété (RLS coproprietes_presta_read). */
export function useCoproMoe(coproId: string) {
  return useQuery({
    queryKey: ["moe-projet", "copro", coproId],
    queryFn: async (): Promise<Tables<"coproprietes"> | null> => {
      const { data, error } = await supabase.from("coproprietes").select("*").eq("id", coproId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export interface CompositionCopro {
  nb_lots: number;
  nb_logements: number;
  nb_coproprietaires: number;
  /** Nombre de lots par usage (habitation, garage, caves…). */
  par_usage: Record<string, number>;
  /** Clé générale (par défaut) et total de ses tantièmes. */
  cle: { code: string; label: string | null; total: number; nb_cles: number } | null;
  batiments: { id: string; code: string; label: string | null; adresse: string | null; nb_lots: number; nb_logements: number }[];
  /** Lots sans propriétaire : numéro, bâtiment, usage, tantièmes de la clé générale. */
  lots: { num: string; batiment: string | null; usage: string; tantiemes: number | null; rattache: boolean }[];
}

/** Composition de la copropriété, sans donnée personnelle (RPC 0165). */
export function useCompositionMoe(coproId: string, prestaId: string) {
  return useQuery({
    queryKey: ["moe-projet", "composition", coproId, prestaId],
    queryFn: async (): Promise<CompositionCopro> => {
      const { data, error } = await supabase.rpc("composition_copro_moe", {
        p_copro_id: coproId,
        p_prestataire_id: prestaId,
      });
      if (error) throw error;
      const c = data as unknown as CompositionCopro;
      // numéros de lot dans l'ordre naturel (« 2 » avant « 10 ») au sein de chaque bâtiment
      const lots = [...(c.lots ?? [])].sort(
        (a, b) =>
          (a.batiment ?? "").localeCompare(b.batiment ?? "", "fr", { numeric: true }) ||
          a.num.localeCompare(b.num, "fr", { numeric: true })
      );
      return { ...c, lots };
    },
  });
}

export interface PieceMontageMoe {
  montage: MontageId;
  doc_key: string;
  statut: string;
  /** Tous les fichiers de la pièce, quel que soit le déposant. */
  nb_fichiers: number;
  /** Fichiers déposés par l'entreprise seulement. */
  fichiers: MontageFile[];
}

export interface MontageMoe {
  docs: PieceMontageMoe[];
  formulaires: { type: string; statut: string; updated_at: string }[];
}

/** État des Documents à produire vu de la MOE (RPC montage_moe). */
export function useMontageMoe(coproId: string, prestaId: string) {
  return useQuery({
    queryKey: ["moe-projet", "montage", coproId, prestaId],
    queryFn: async (): Promise<MontageMoe> => {
      const { data, error } = await supabase.rpc("montage_moe", { p_copro_id: coproId, p_prestataire_id: prestaId });
      if (error) throw error;
      const m = data as unknown as MontageMoe;
      return { docs: m.docs ?? [], formulaires: m.formulaires ?? [] };
    },
  });
}

/** Pièces visées par un dépôt de la MOE : la pièce choisie, puis les pièces du
 *  même type des autres montages (propagation, comme pour le syndic), hors
 *  pièces confidentielles. Pure, testée. */
export function ciblesDepotMoe(montage: MontageId, docKey: string, type: string | null | undefined) {
  const cibles = [{ montage, doc_key: docKey }];
  if (!type || TYPES_NON_PROPAGES.has(type)) return cibles;
  for (const c of ciblesMontagePourType(type, montage)) {
    if (!c.def.confidentiel) cibles.push({ montage: c.montage, doc_key: c.def.key });
  }
  return cibles;
}

/** Dépôt d'un fichier par la MOE sur une pièce des Documents à produire :
 *  Storage sous montage/<copro_id>/…, puis RPC montage_deposer_moe. */
export function useDeposerMontageMoe(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      montage,
      docKey,
      file,
      nameOriginal,
      type,
    }: {
      montage: MontageId;
      docKey: string;
      file: File;
      nameOriginal?: string;
      type?: string | null;
    }) => {
      if (docDef(montage, docKey)?.confidentiel) throw new Error("Pièce réservée à l'équipe Strat Eco.");
      const nom = nomFichierSansAccents(file.name);
      const safe = nom.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `montage/${coproId}/${montage}/${docKey}/${Date.now()}-${safe}`;
      const { error: eUp } = await supabase.storage.from("copro-files").upload(path, file);
      if (eUp) throw eUp;
      const { error } = await supabase.rpc("montage_deposer_moe", {
        p_copro_id: coproId,
        p_cibles: ciblesDepotMoe(montage, docKey, type ?? docDef(montage, docKey)?.type) as unknown as Json,
        p_fichier: {
          name: nom,
          name_original: nameOriginal && nameOriginal !== nom ? nameOriginal : null,
          path,
          size: file.size,
          mime: file.type || null,
        } as unknown as Json,
      });
      if (error) {
        // le fichier n'est rattaché à aucune pièce : on ne le laisse pas orphelin
        await supabase.storage.from("copro-files").remove([path]).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["moe-projet"] }),
  });
}

/** Retrait d'un fichier déposé par l'entreprise (toutes les pièces qui le citent, puis le Storage). */
export function useRetirerMontageMoe(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      const { error } = await supabase.rpc("montage_retirer_moe", { p_copro_id: coproId, p_path: path });
      if (error) throw error;
      await supabase.storage.from("copro-files").remove([path]);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["moe-projet"] }),
  });
}

/** Fichiers du dossier vus de la MOE : fichiers non confidentiels hors
 *  facturation, et ses propres pièces des Documents à produire. */
export function useDocumentsDossierMoe(coproId: string, prestaId: string) {
  return useQuery({
    queryKey: ["moe-projet", "documents", coproId, prestaId],
    queryFn: async (): Promise<DocumentSyndic[]> => {
      const { data, error } = await supabase.rpc("documents_dossier_moe", {
        p_copro_id: coproId,
        p_prestataire_id: prestaId,
      });
      if (error) throw error;
      return (data ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        path: d.path,
        size: d.taille,
        dossier: d.dossier,
        date: d.depose_le,
        origine: (d.origine as OrigineDocument) ?? "amo",
        mien: false,
      }));
    },
  });
}
