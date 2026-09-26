// Données de la copro : bâtiments, copropriétaires, lots, clés & tantièmes.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Enums, Tables, TablesUpdate } from "@/lib/database.types";
import type { ImportedRow } from "@/lib/importLots";
import { trierParNomFamille } from "@/lib/nomFamille";

export interface LotFull extends Tables<"lots"> {
  batiment: { code: string } | null;
  coproprietaire: { nom: string; email: string | null; telephone: string | null } | null;
  tantiemes: Record<string, number>; // par code de clé (repris du fichier importé)
}

export interface DonneesCopro {
  batiments: Tables<"batiments">[];
  coproprietaires: Tables<"coproprietaires">[];
  lots: LotFull[];
  cles: Tables<"cles_repartition">[];
}

export function useDonnees(coproId: string | undefined) {
  return useQuery({
    queryKey: ["donnees", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<DonneesCopro> => {
      const [bats, coprops, lots, cles, tantiemes] = await Promise.all([
        supabase.from("batiments").select("*").eq("copro_id", coproId!).order("position"),
        supabase.from("coproprietaires").select("*").eq("copro_id", coproId!).order("nom"),
        supabase
          .from("lots")
          .select("*, batiments(code), coproprietaires(nom, email, telephone)")
          .eq("copro_id", coproId!)
          .order("num"),
        supabase.from("cles_repartition").select("*").eq("copro_id", coproId!).order("code"),
        supabase
          .from("lot_tantiemes")
          .select("lot_id, tantiemes, cles_repartition!inner(code, copro_id)")
          .eq("cles_repartition.copro_id", coproId!),
      ]);
      for (const r of [bats, coprops, lots, cles, tantiemes]) if (r.error) throw r.error;

      const tanByLot = new Map<string, Record<string, number>>();
      for (const t of tantiemes.data ?? []) {
        const rec = tanByLot.get(t.lot_id) ?? {};
        rec[t.cles_repartition.code] = Number(t.tantiemes);
        tanByLot.set(t.lot_id, rec);
      }
      return {
        batiments: bats.data ?? [],
        // par nom de famille, pas par prénom (feedback syndic 25/09/2026) : toutes les listes suivent
        coproprietaires: trierParNomFamille(coprops.data ?? [], (cp) => cp.nom),
        cles: cles.data ?? [],
        lots: (lots.data ?? []).map((l) => {
          const { batiments: b, coproprietaires: cp, ...rest } = l as typeof l & {
            batiments: { code: string } | null;
            coproprietaires: { nom: string; email: string | null; telephone: string | null } | null;
          };
          return { ...rest, batiment: b, coproprietaire: cp, tantiemes: tanByLot.get(l.id) ?? {} };
        }),
      };
    },
  });
}

/**
 * Ajuste le nombre de bâtiments du dossier (synthèse de l'onglet Données).
 * En hausse : bâtiments déclarés ajoutés en fin de liste (codes numériques suivants).
 * En baisse : suppression en partant de la fin, uniquement des bâtiments sans lot.
 */
export function useSetNbBatiments(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (target: number) => {
      const { data: bats, error } = await supabase
        .from("batiments")
        .select("id, code, position, lots(count)")
        .eq("copro_id", coproId)
        .order("position");
      if (error) throw error;
      const list = bats ?? [];
      const nbLots = (b: (typeof list)[number]) =>
        (b.lots as unknown as { count: number }[])[0]?.count ?? 0;

      if (target > list.length) {
        const codes = new Set(list.map((b) => b.code));
        let pos = list.reduce((a, b) => Math.max(a, b.position), -1) + 1;
        let next = list.length + 1;
        const rows = [];
        for (let n = list.length; n < target; n++) {
          let code = String(next).padStart(2, "0");
          while (codes.has(code)) {
            next++;
            code = String(next).padStart(2, "0");
          }
          codes.add(code);
          rows.push({ copro_id: coproId, code, position: pos++, declare_creation: true });
          next++;
        }
        const { error: eIns } = await supabase.from("batiments").insert(rows);
        if (eIns) throw eIns;
      } else if (target < list.length) {
        const aSupprimer = list.length - target;
        const supprimables = [...list]
          .reverse()
          .filter((b) => nbLots(b) === 0)
          .slice(0, aSupprimer);
        if (supprimables.length < aSupprimer) {
          throw new Error(
            "Impossible de descendre à ce nombre : des bâtiments portent encore des lots - réaffectez-les d'abord (import)."
          );
        }
        const { error: eDel } = await supabase
          .from("batiments")
          .delete()
          .in("id", supprimables.map((b) => b.id));
        if (eDel) throw eDel;
      }
    },
    onSuccess: () => invalidateDonnees(qc, coproId),
  });
}

/** Corrige l'usage d'un lot à la main (ex. « autres » → « commerces ») -
 *  l'import ne reconnaît pas toujours la nature exacte des locaux. */
export function useSetUsageLot(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lotId, usage }: { lotId: string; usage: Enums<"usage_lot"> }) => {
      const { error } = await supabase.from("lots").update({ usage }).eq("id", lotId);
      if (error) throw error;
    },
    onSuccess: () => invalidateDonnees(qc, coproId),
  });
}

function invalidateDonnees(qc: ReturnType<typeof useQueryClient>, coproId: string) {
  void qc.invalidateQueries({ queryKey: ["donnees", coproId] });
  void qc.invalidateQueries({ queryKey: ["copro", coproId] });
  void qc.invalidateQueries({ queryKey: ["copros"] });
}

// ========== Vente / succession : changement de propriétaire d'un lot ==========
// Feedback Amir 22/09/2026 : le syndic clique sur le lot vendu et saisit le
// nouveau copropriétaire (RPC syndic_changer_proprietaire, migration 0090).
// Le vendeur garde son historique ; s'il ne possède plus rien, sa ligne devient
// sortante et son accès au portail est coupé.

export type MotifMutation = "vente" | "succession" | "autre";

export const MOTIFS_MUTATION: { id: MotifMutation; label: string }[] = [
  { id: "vente", label: "Vente du lot" },
  { id: "succession", label: "Succession (décès)" },
  { id: "autre", label: "Autre (donation, partage…)" },
];

export interface ChangementProprietaire {
  lotId: string;
  /** Copropriétaire existant de la copro… */
  coproprietaireId?: string | null;
  /** …ou acquéreur à créer. */
  nom?: string | null;
  email?: string | null;
  telephone?: string | null;
  type?: "occupant" | "bailleur" | null;
  motif: MotifMutation;
  commentaire?: string | null;
  /** Repères pour l'alerte e-mail de l'équipe AMO (aucune donnée sensible). */
  numeroLot?: string | null;
  ancienNom?: string | null;
  nouveauNom?: string | null;
}

export function useChangerProprietaire(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChangementProprietaire): Promise<string> => {
      const { data, error } = await supabase.rpc("syndic_changer_proprietaire", {
        p_lot_id: input.lotId,
        p_coproprietaire_id: input.coproprietaireId ?? null,
        p_nom: input.nom ?? null,
        p_email: input.email ?? null,
        p_telephone: input.telephone ?? null,
        p_type: input.type ?? null,
        p_motif: input.motif,
        p_commentaire: input.commentaire ?? null,
      });
      if (error) throw error;
      // alerte e-mail de l'équipe AMO du dossier, sans les coordonnées du nouveau
      // propriétaire - meilleur effort, la mutation est déjà enregistrée
      try {
        await supabase.functions.invoke("notifier-syndic", {
          body: {
            copro_id: coproId,
            type: "mutation_lot",
            detail: {
              lot: input.numeroLot ?? null,
              ancien: input.ancienNom ?? null,
              nouveau: input.nom?.trim() || input.nouveauNom || null,
              motif: MOTIFS_MUTATION.find((m) => m.id === input.motif)?.label ?? input.motif,
            },
          },
        });
      } catch {
        /* l'alerte e-mail est facultative */
      }
      return data as string;
    },
    onSuccess: () => {
      invalidateDonnees(qc, coproId);
      void qc.invalidateQueries({ queryKey: ["mutations-lots", coproId] });
      void qc.invalidateQueries({ queryKey: ["syndic"] });
    },
  });
}

export type MutationLot = Tables<"lots_mutations"> & {
  lot: { num: string } | null;
  ancien: { nom: string } | null;
  nouveau: { nom: string } | null;
};

/** Journal des changements de propriétaire de la copro (AMO et syndic). */
export function useMutationsLots(coproId: string | undefined) {
  return useQuery({
    queryKey: ["mutations-lots", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<MutationLot[]> => {
      const { data, error } = await supabase
        .from("lots_mutations")
        .select(
          "*, lots(num), ancien:coproprietaires!ancien_coproprietaire_id(nom), nouveau:coproprietaires!nouveau_coproprietaire_id(nom)"
        )
        .eq("copro_id", coproId!)
        .order("fait_le", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((m) => {
        const { lots, ancien, nouveau, ...rest } = m as typeof m & {
          lots: { num: string } | null;
          ancien: { nom: string } | null;
          nouveau: { nom: string } | null;
        };
        return { ...rest, lot: lots, ancien, nouveau };
      });
    },
  });
}

/**
 * Import des lots depuis un fichier Excel/CSV validé :
 * crée bâtiments, copropriétaires et clés manquants, puis lots + tantièmes.
 * `replace` supprime d'abord les lots existants (bâtiments/copropriétaires conservés).
 */
export function useImportLots(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rows, replace }: { rows: ImportedRow[]; replace: boolean }) => {
      if (replace) {
        const { error } = await supabase.from("lots").delete().eq("copro_id", coproId);
        if (error) throw error;
      }

      // Bâtiments manquants
      const batCodes = Array.from(new Set(rows.map((r) => r.batiment).filter((v): v is string => !!v)));
      const { data: existingBats, error: eB } = await supabase
        .from("batiments")
        .select("id, code")
        .eq("copro_id", coproId);
      if (eB) throw eB;
      const batByCode = new Map((existingBats ?? []).map((b) => [b.code, b.id]));
      const newBats = batCodes.filter((c) => !batByCode.has(c));
      if (newBats.length) {
        const { data, error } = await supabase
          .from("batiments")
          .insert(newBats.map((code, i) => ({ copro_id: coproId, code, position: (existingBats?.length ?? 0) + i })))
          .select("id, code");
        if (error) throw error;
        for (const b of data ?? []) batByCode.set(b.code, b.id);
      }

      // Copropriétaires manquants (rapprochement par nom exact) + coordonnées du fichier
      const noms = Array.from(new Set(rows.map((r) => r.coproprietaire).filter((v): v is string => !!v)));
      const contactByNom = new Map<string, { email: string | null; telephone: string | null; adresse: string | null }>();
      for (const r of rows) {
        if (!r.coproprietaire) continue;
        const cur = contactByNom.get(r.coproprietaire) ?? { email: null, telephone: null, adresse: null };
        contactByNom.set(r.coproprietaire, {
          email: r.email ?? cur.email,
          telephone: r.telephone ?? cur.telephone,
          adresse: r.adresse ?? cur.adresse,
        });
      }
      const { data: existingCp, error: eC } = await supabase
        .from("coproprietaires")
        .select("id, nom")
        .eq("copro_id", coproId);
      if (eC) throw eC;
      const cpByNom = new Map((existingCp ?? []).map((c) => [c.nom, c.id]));
      const newCp = noms.filter((n) => !cpByNom.has(n));
      if (newCp.length) {
        const { data, error } = await supabase
          .from("coproprietaires")
          .insert(newCp.map((nom) => ({ copro_id: coproId, nom, ...contactByNom.get(nom) })))
          .select("id, nom");
        if (error) throw error;
        for (const c of data ?? []) cpByNom.set(c.nom, c.id);
      }
      // Copropriétaires déjà connus : mise à jour des coordonnées présentes dans le fichier
      const cpUpdates = (existingCp ?? []).flatMap((c) => {
        const contact = contactByNom.get(c.nom);
        if (!contact) return [];
        const patch: TablesUpdate<"coproprietaires"> = {};
        if (contact.email) patch.email = contact.email;
        if (contact.telephone) patch.telephone = contact.telephone;
        if (contact.adresse) patch.adresse = contact.adresse;
        return Object.keys(patch).length ? [{ id: c.id, patch }] : [];
      });
      if (cpUpdates.length) {
        const results = await Promise.all(
          cpUpdates.map((u) => supabase.from("coproprietaires").update(u.patch).eq("id", u.id))
        );
        for (const r of results) if (r.error) throw r.error;
      }

      // Clés utilisées par l'import - les codes viennent des en-têtes du fichier, rien n'est codé en dur
      const cleCodes = Array.from(new Set(rows.flatMap((r) => Object.keys(r.tantiemes))));
      const { data: existingCles, error: eK } = await supabase
        .from("cles_repartition")
        .select("id, code")
        .eq("copro_id", coproId);
      if (eK) throw eK;
      const cleByCode = new Map((existingCles ?? []).map((k) => [k.code, k.id]));
      const newCles = cleCodes.filter((c) => !cleByCode.has(c));
      if (newCles.length) {
        const { data, error } = await supabase
          .from("cles_repartition")
          .insert(newCles.map((code) => ({ copro_id: coproId, code, is_default: false })))
          .select("id, code");
        if (error) throw error;
        for (const k of data ?? []) cleByCode.set(k.code, k.id);
      }

      // Lots (upsert par numéro) puis tantièmes
      const { data: insertedLots, error: eL } = await supabase
        .from("lots")
        .upsert(
          rows.map((r) => ({
            copro_id: coproId,
            num: r.num,
            usage: r.usage,
            batiment_id: r.batiment ? batByCode.get(r.batiment) ?? null : null,
            coproprietaire_id: r.coproprietaire ? cpByNom.get(r.coproprietaire) ?? null : null,
          })),
          { onConflict: "copro_id,num" }
        )
        .select("id, num");
      if (eL) throw eL;
      const lotByNum = new Map((insertedLots ?? []).map((l) => [l.num, l.id]));

      const tanRows = rows.flatMap((r) =>
        Object.entries(r.tantiemes)
          .filter(([, v]) => v != null)
          .map(([code, v]) => ({
            lot_id: lotByNum.get(r.num)!,
            cle_id: cleByCode.get(code)!,
            tantiemes: v,
          }))
      );
      if (tanRows.length) {
        const { error } = await supabase.from("lot_tantiemes").upsert(tanRows, { onConflict: "lot_id,cle_id" });
        if (error) throw error;
      }

      // Ménage : les clés restées sans aucun tantième (ex. « MUN » créée à la création
      // du dossier) sont supprimées, et une clé par défaut est garantie parmi celles du fichier.
      if (tanRows.length) {
        const { data: clesEtat, error: eEtat } = await supabase
          .from("cles_repartition")
          .select("id, code, is_default, lot_tantiemes(count)")
          .eq("copro_id", coproId);
        if (eEtat) throw eEtat;
        const compte = (k: NonNullable<typeof clesEtat>[number]) =>
          (k.lot_tantiemes as unknown as { count: number }[])[0]?.count ?? 0;
        const vides = (clesEtat ?? []).filter((k) => compte(k) === 0);
        if (vides.length) {
          const { error } = await supabase
            .from("cles_repartition")
            .delete()
            .in("id", vides.map((k) => k.id));
          if (error) throw error;
        }
        const restantes = (clesEtat ?? []).filter((k) => compte(k) > 0);
        if (restantes.length && !restantes.some((k) => k.is_default)) {
          const premiere = restantes.find((k) => k.code === cleCodes[0]) ?? restantes[0];
          const { error } = await supabase
            .from("cles_repartition")
            .update({ is_default: true })
            .eq("id", premiere.id);
          if (error) throw error;
        }
      }

      // Même ménage pour les bâtiments créés par un import : ceux qui n'ont plus
      // aucun lot disparaissent (ex. après un import « Remplacer »). Les bâtiments
      // déclarés à la création du dossier font foi et sont toujours conservés.
      {
        const { data: batsEtat, error: eBats } = await supabase
          .from("batiments")
          .select("id, declare_creation, lots(count)")
          .eq("copro_id", coproId);
        if (eBats) throw eBats;
        const batsVides = (batsEtat ?? []).filter(
          (b) => !b.declare_creation && ((b.lots as unknown as { count: number }[])[0]?.count ?? 0) === 0
        );
        if (batsVides.length) {
          const { error } = await supabase
            .from("batiments")
            .delete()
            .in("id", batsVides.map((b) => b.id));
          if (error) throw error;
        }
      }
      return { lots: rows.length, batiments: newBats.length, coproprietaires: newCp.length };
    },
    onSuccess: () => invalidateDonnees(qc, coproId),
  });
}
