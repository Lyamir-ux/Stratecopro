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

/**
 * Aides suivies en tête de l'onglet (feedback Amir du 15/09/2026) : le montant
 * notifié est celui du plan de financement définitif validé (groupe d'aide du
 * PF, prime CEE), le montant payé est saisi à la main par le syndic au fil des
 * versements. Le montant payé est rangé dans `paiements` sous la clé
 * « aide:<id> » avec un seul élément : [montant] - aucune ligne du PF ne porte
 * ce préfixe, les totaux du tableau ne sont donc pas touchés.
 */
export const AIDES_SUIVI = [
  { id: "mpr", label: "MPR", groupe: "ANAH", titre: "MaPrimeRénov' Copropriété" },
  { id: "climaxion", label: "Climaxion", groupe: "Climaxion", titre: "Climaxion (Région Grand Est)" },
  { id: "ems", label: "EMS", groupe: "EMS", titre: "Eurométropole de Strasbourg" },
  { id: "cee", label: "CEE", groupe: "CEE", titre: "Prime CEE" },
] as const;
export type AideSuiviId = (typeof AIDES_SUIVI)[number]["id"];

export const cleAidePayee = (id: AideSuiviId) => `aide:${id}`;
/** Montant payé saisi pour une aide (null : rien de saisi). */
export const aidePayee = (p: PaiementsSuivi, id: AideSuiviId): number | null => p[cleAidePayee(id)]?.[0] ?? null;

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
