// Honoraires AMO par jalon (migration 0111). Les lignes viennent de l'extraction
// Notion « AMO COPRO », chargée en SQL ; depuis 0112 le bloc Honoraires de
// l'onglet Projet revalorise la P2 et calcule les honoraires CEE (fonctions
// SQL, seules à écrire). La facturation directe viendra dans un second temps.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { jalonsOrdonnes, jalonsEnAttente, type DossierHonoraires } from "@/lib/facturation";

const nombre = (v: number | string | null) => (v == null ? null : Number(v));

export function useHonoraires() {
  return useQuery({
    queryKey: ["honoraires"],
    queryFn: async (): Promise<Map<string, DossierHonoraires>> => {
      const [{ data: jalons, error: e1 }, { data: dossiers, error: e2 }] = await Promise.all([
        supabase.from("honoraires_jalons").select("copro_id, jalon, montant_ht, etat"),
        supabase
          .from("honoraires_dossiers")
          .select("copro_id, derniere_facture, source, p2_montant_ht, p2_saisi_le, p2_saisi_par, cee_kwhc, cee_saisi_le, cee_saisi_par"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const parCopro = new Map<string, { jalon: string; montant_ht: number | null; etat: string }[]>();
      for (const j of jalons ?? []) {
        const l = parCopro.get(j.copro_id) ?? [];
        // numeric(12,2) : forcé en nombre, une chaîne ferait concaténer les sommes
        l.push({ ...j, montant_ht: nombre(j.montant_ht) });
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
          saisies: {
            p2MontantHt: nombre(info?.p2_montant_ht ?? null),
            p2SaisiLe: info?.p2_saisi_le ?? null,
            p2SaisiPar: info?.p2_saisi_par ?? null,
            ceeKwhc: nombre(info?.cee_kwhc ?? null),
            ceeSaisiLe: info?.cee_saisi_le ?? null,
            ceeSaisiPar: info?.cee_saisi_par ?? null,
          },
        });
      }
      return out;
    },
    staleTime: 5 * 60_000,
  });
}

/** « Revaloriser la P2 » : honoraires HT de la phase travaux, répartis 50 / 30 / 20 côté serveur. */
export function useRevaloriserP2() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ coproId, montantHt }: { coproId: string; montantHt: number }) => {
      const { error } = await supabase.rpc("honoraires_revaloriser_p2", { p_copro_id: coproId, p_montant_ht: montantHt });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["honoraires"] }),
  });
}

/** « Honoraires CEE » : volume en kWh cumac, FCEE 1 = FCEE 2 = kWh cumac / 1 000 000 × 250 € HT. */
export function useSaisirCee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ coproId, kwhc }: { coproId: string; kwhc: number }) => {
      const { error } = await supabase.rpc("honoraires_saisir_cee", { p_copro_id: coproId, p_kwhc: kwhc });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["honoraires"] }),
  });
}

/** Pastille du menu « Facturation » : dossiers dont une facture attend son paiement. */
export function compteEnAttente(honoraires: Map<string, DossierHonoraires> | undefined, coproIds: Set<string>): number {
  if (!honoraires) return 0;
  let n = 0;
  for (const d of honoraires.values()) if (coproIds.has(d.coproId) && jalonsEnAttente(d).length > 0) n++;
  return n;
}
