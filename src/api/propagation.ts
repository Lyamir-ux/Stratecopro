// Propagation d'un dépôt à toutes les pièces qui attendent le même document
// (feedback Amir 13/09/2026) : l'attestation de mise à jour du registre, par
// exemple, est attendue par la checklist MaPrimeRénov', la checklist EMS &
// Climaxion et les dossiers éco-PTZ, ANAH et EMS & Climaxion de la page
// « Documents à produire ». Déposée une fois - depuis l'onglet Fichiers ou
// depuis un dossier de la page Documents à produire - elle coche la pièce dans
// toutes les checklists (RPC checklist_cocher_pieces, 0068) et vient s'ajouter
// aux documents de même type des autres dossiers de montage (même fichier
// Storage, référencé plusieurs fois). Le lien entre pièces est le TYPE de
// document (id TYPES_DOCUMENT) : un type par pièce, choisi au dépôt.
// Best effort : un échec de propagation ne fait jamais échouer le dépôt.
import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import { labelsChecklistPourType } from "@/api/fichiers";
import { PARCOURS, docFiles, docsOfEtape, type MontageDoc, type MontageFile, type MontageId } from "@/api/montage";

/** Types trop génériques pour relier des pièces entre elles. */
const TYPES_NON_PROPAGES = new Set(["autre", "photo", "courrier", "rapport", "plan"]);

/** Documents (montage, définition) attendant un type donné, hors montage source. */
export function ciblesMontagePourType(type: string, montageSource?: MontageId) {
  return (Object.entries(PARCOURS) as [MontageId, NonNullable<(typeof PARCOURS)[MontageId]>][])
    .filter(([id]) => id !== montageSource)
    .flatMap(([id, p]) => p.etapes.flatMap(docsOfEtape).filter((d) => d.type === type).map((def) => ({ montage: id, def })));
}

/**
 * Après un dépôt : coche les pièces de checklist du type et ajoute le fichier
 * aux documents de même type des autres dossiers de montage.
 * - `fichierId` : ligne `fichiers` (dépôt depuis l'onglet Fichiers) - reliée aux
 *   cases cochées pour pouvoir les décocher si le fichier est retiré ;
 * - `montageSource` : dossier d'origine (dépôt depuis Documents à produire).
 */
export async function propagerDocument(
  coproId: string,
  type: string | null | undefined,
  file: MontageFile,
  opts: { fichierId?: string; montageSource?: MontageId } = {}
): Promise<void> {
  if (!type || TYPES_NON_PROPAGES.has(type)) return;
  try {
    const labels = labelsChecklistPourType(type);
    if (labels.length) {
      const { error } = await supabase.rpc("checklist_cocher_pieces", {
        p_copro_id: coproId,
        p_labels: labels,
        p_fichier_id: opts.fichierId ?? null,
      });
      if (error) console.warn("Propagation checklists :", error.message);
    }

    const cibles = ciblesMontagePourType(type, opts.montageSource);
    if (!cibles.length) return;
    const { data: rows, error: eRows } = await supabase
      .from("montage_docs")
      .select("*")
      .eq("copro_id", coproId)
      .in("montage", [...new Set(cibles.map((c) => c.montage))]);
    if (eRows) {
      console.warn("Propagation montages :", eRows.message);
      return;
    }
    const byKey = new Map((rows ?? []).map((r) => [r.montage + "/" + r.doc_key, r as MontageDoc]));
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id ?? null;
    for (const { montage, def } of cibles) {
      const row = byKey.get(montage + "/" + def.key);
      const files = docFiles(row);
      if (files.some((f) => f.path === file.path)) continue;
      // La ligne cible reste dans l'état « non concerné » si le syndic l'y a mise.
      if (row?.statut === "non_applicable") continue;
      const { error } = await supabase.from("montage_docs").upsert(
        {
          copro_id: coproId,
          montage,
          doc_key: def.key,
          statut: "depose",
          files: [...files, file] as unknown as Json,
          confidentiel: !!def.confidentiel,
          updated_by: uid,
        },
        { onConflict: "copro_id,montage,doc_key" }
      );
      // Refus RLS possible (ex. syndic vers une pièce confidentielle) : on ignore.
      if (error) console.warn(`Propagation ${montage}/${def.key} :`, error.message);
    }
  } catch (e) {
    console.warn("Propagation du dépôt ignorée :", e);
  }
}

/** Retire un fichier (par chemin Storage) de TOUS les documents de montage de
 *  la copro qui le référencent - le fichier est partagé entre dossiers. */
export async function retirerFichierDesMontages(coproId: string, path: string): Promise<void> {
  const { data: rows, error } = await supabase.from("montage_docs").select("*").eq("copro_id", coproId);
  if (error) throw error;
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id ?? null;
  for (const row of rows ?? []) {
    const files = docFiles(row as MontageDoc);
    if (!files.some((f) => f.path === path)) continue;
    const restants = files.filter((f) => f.path !== path);
    const { error: eUp } = await supabase
      .from("montage_docs")
      .update({
        files: restants as unknown as Json,
        statut: restants.length > 0 ? "depose" : "a_fournir",
        updated_by: uid,
      })
      .eq("id", row.id);
    if (eUp) throw eUp;
  }
}

/** Avant suppression d'un fichier de l'onglet Fichiers : décoche les pièces
 *  de checklist qu'il avait cochées (RPC checklist_delier_fichier, 0068). */
export async function delierFichierDesChecklists(fichierId: string): Promise<void> {
  const { error } = await supabase.rpc("checklist_delier_fichier", { p_fichier_id: fichierId });
  if (error) console.warn("Décochage des checklists :", error.message);
}
