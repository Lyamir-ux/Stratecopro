// Données de la copro : bâtiments, copropriétaires, lots, clés & tantièmes.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import type { ImportedRow } from "@/lib/importLots";

export interface LotFull extends Tables<"lots"> {
  batiment: { code: string } | null;
  coproprietaire: { nom: string } | null;
  tantiemes: Record<string, number>; // par code de clé ('MUN', 'ESC'…)
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
          .select("*, batiments(code), coproprietaires(nom)")
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
        coproprietaires: coprops.data ?? [],
        cles: cles.data ?? [],
        lots: (lots.data ?? []).map((l) => {
          const { batiments: b, coproprietaires: cp, ...rest } = l as typeof l & {
            batiments: { code: string } | null;
            coproprietaires: { nom: string } | null;
          };
          return { ...rest, batiment: b, coproprietaire: cp, tantiemes: tanByLot.get(l.id) ?? {} };
        }),
      };
    },
  });
}

function invalidateDonnees(qc: ReturnType<typeof useQueryClient>, coproId: string) {
  void qc.invalidateQueries({ queryKey: ["donnees", coproId] });
  void qc.invalidateQueries({ queryKey: ["copro", coproId] });
  void qc.invalidateQueries({ queryKey: ["copros"] });
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

      // Copropriétaires manquants (rapprochement par nom exact)
      const noms = Array.from(new Set(rows.map((r) => r.coproprietaire).filter((v): v is string => !!v)));
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
          .insert(newCp.map((nom) => ({ copro_id: coproId, nom })))
          .select("id, nom");
        if (error) throw error;
        for (const c of data ?? []) cpByNom.set(c.nom, c.id);
      }

      // Clés utilisées par l'import
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
          .insert(newCles.map((code) => ({ copro_id: coproId, code, is_default: code === "MUN" })))
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
      return { lots: rows.length, batiments: newBats.length, coproprietaires: newCp.length };
    },
    onSuccess: () => invalidateDonnees(qc, coproId),
  });
}
