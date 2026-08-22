// Suivi financier du chantier - paiements par situation (1 à 10) sur les
// lignes du PF définitif validé (lots de travaux, MOE et frais annexes).
// Le syndic, qui règle les situations des entreprises, saisit les montants ;
// l'équipe AMO garde la main via son aperçu de l'espace syndic.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";

export const NB_SITUATIONS = 10;

/**
 * Paiements par ligne du PF - clés « lot:<numero> » / « moe:<index> » (mêmes
 * conventions que repartitionCles), valeur = montants TTC des situations 1 à 10
 * (null : situation non appelée).
 */
export type PaiementsSuivi = Record<string, (number | null)[]>;

export function useSuiviFinancier(coproId: string | undefined) {
  return useQuery({
    queryKey: ["suivi-financier", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<PaiementsSuivi> => {
      const { data, error } = await supabase
        .from("suivi_financier")
        .select("paiements")
        .eq("copro_id", coproId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.paiements as PaiementsSuivi | null) ?? {};
    },
  });
}

export function useSaveSuiviFinancier(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (paiements: PaiementsSuivi) => {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from("suivi_financier").upsert({
        copro_id: coproId,
        paiements: paiements as unknown as Json,
        updated_by: session.session?.user.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["suivi-financier", coproId] }),
  });
}
