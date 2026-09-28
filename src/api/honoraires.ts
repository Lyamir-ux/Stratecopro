// Honoraires AMO par jalon (migration 0111) - lecture seule côté application :
// les lignes viennent de l'extraction Notion « AMO COPRO », chargée en SQL.
// La facturation directe depuis le logiciel viendra dans un second temps.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { jalonsOrdonnes, jalonsEnAttente, type DossierHonoraires } from "@/lib/facturation";

export function useHonoraires() {
  return useQuery({
    queryKey: ["honoraires"],
    queryFn: async (): Promise<Map<string, DossierHonoraires>> => {
      const [{ data: jalons, error: e1 }, { data: dossiers, error: e2 }] = await Promise.all([
        supabase.from("honoraires_jalons").select("copro_id, jalon, montant_ht, etat"),
        supabase.from("honoraires_dossiers").select("copro_id, derniere_facture, source"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const parCopro = new Map<string, { jalon: string; montant_ht: number | null; etat: string }[]>();
      for (const j of jalons ?? []) {
        const l = parCopro.get(j.copro_id) ?? [];
        // numeric(12,2) : forcé en nombre, une chaîne ferait concaténer les sommes
        l.push({ ...j, montant_ht: j.montant_ht == null ? null : Number(j.montant_ht) });
        parCopro.set(j.copro_id, l);
      }
      const infos = new Map((dossiers ?? []).map((d) => [d.copro_id, d]));
      const out = new Map<string, DossierHonoraires>();
      for (const coproId of new Set([...parCopro.keys(), ...infos.keys()])) {
        const info = infos.get(coproId);
        out.set(coproId, {
          coproId,
          jalons: jalonsOrdonnes(parCopro.get(coproId) ?? []),
          derniereFacture: info?.derniere_facture ?? null,
          source: info?.source ?? null,
        });
      }
      return out;
    },
    staleTime: 5 * 60_000,
  });
}

/** Pastille du menu « Facturation » : dossiers dont une facture attend son paiement. */
export function compteEnAttente(honoraires: Map<string, DossierHonoraires> | undefined, coproIds: Set<string>): number {
  if (!honoraires) return 0;
  let n = 0;
  for (const d of honoraires.values()) if (coproIds.has(d.coproId) && jalonsEnAttente(d).length > 0) n++;
  return n;
}
