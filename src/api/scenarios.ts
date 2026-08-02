// Scénarios d'ingénierie financière : CRUD, barème actif, validation (génération des plans).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, Tables } from "@/lib/database.types";
import {
  computeFinance,
  computePlansIndividuels,
  BAREME_2024_HORS_IDF,
  type Bareme,
  type CoproContext,
  type FinanceParams,
  type OwnerInput,
} from "@/lib/finance";

export type Scenario = Tables<"scenarios_financiers">;

/** Barème actif du millésime le plus récent (repli sur la constante locale si table vide). */
export function useBareme() {
  return useQuery({
    queryKey: ["bareme-actif"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Bareme> => {
      const { data, error } = await supabase
        .from("baremes")
        .select("*")
        .eq("actif", true)
        .order("millesime", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? (data.params as unknown as Bareme) : BAREME_2024_HORS_IDF;
    },
  });
}

export function makeDefaultParams(bareme: Bareme): FinanceParams {
  return {
    travaux: 0,
    honoraires: 0,
    aleas: 0,
    cle: "MUN",
    mprCoproPct: bareme.mprCopro.tauxStandard,
    bonusPassoire: false,
    cee: 0,
    fonds: 0,
    profils: { Bleu: 0, Jaune: 0, Violet: 0, Rose: 0 },
    primeIndiv: { ...bareme.primesIndiv },
    ecoPtz: true,
    ecoPtzDuree: 15,
    ecoPtzPct: 100,
    avancePct: 70,
    pretComplActif: false,
    pretComplDuree: 12,
  };
}

/** Relit des params jsonb en les complétant avec les défauts (schéma évolutif). */
export function readParams(json: Json, bareme: Bareme): FinanceParams {
  const raw = (json ?? {}) as Partial<FinanceParams>;
  const def = makeDefaultParams(bareme);
  const merged = {
    ...def,
    ...raw,
    profils: { ...def.profils, ...(raw.profils ?? {}) },
    primeIndiv: { ...def.primeIndiv, ...(raw.primeIndiv ?? {}) },
  };
  // ancien libellé du prototype → code de clé réel
  if (merged.cle === "tantiemes") merged.cle = "MUN";
  return merged;
}

export function useScenarios(coproId: string | undefined) {
  return useQuery({
    queryKey: ["scenarios", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<Scenario[]> => {
      const { data, error } = await supabase
        .from("scenarios_financiers")
        .select("*")
        .eq("copro_id", coproId!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, coproId: string) {
  void qc.invalidateQueries({ queryKey: ["scenarios", coproId] });
  void qc.invalidateQueries({ queryKey: ["copro", coproId] });
  void qc.invalidateQueries({ queryKey: ["copros"] });
}

export function useCreateScenario(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      params: FinanceParams;
      statut?: Scenario["statut"];
      locked?: boolean;
      baremeMillesime: number;
    }) => {
      const { data, error } = await supabase
        .from("scenarios_financiers")
        .insert({
          copro_id: coproId,
          name: input.name,
          statut: input.statut ?? "brouillon",
          locked: input.locked ?? false,
          bareme_millesime: input.baremeMillesime,
          params: input.params as unknown as Json,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(qc, coproId),
  });
}

export function useUpdateScenario(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      params,
      ...patch
    }: { id: string; params?: FinanceParams } & Partial<Pick<Scenario, "name" | "statut">>) => {
      const { error } = await supabase
        .from("scenarios_financiers")
        .update({ ...patch, ...(params ? { params: params as unknown as Json } : {}) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, coproId),
  });
}

/**
 * Étape 7 : fige le résultat (snapshot), régénère les plans individuels.
 * Les plans existants du scénario sont remplacés.
 */
export function useValidateScenario(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      scenarioId: string;
      params: FinanceParams;
      ctx: CoproContext;
      owners: OwnerInput[];
      totalCle: number;
      bareme: Bareme;
    }) => {
      const d = computeFinance(input.params, input.ctx, input.bareme);
      const { plans } = computePlansIndividuels(input.params, d, input.owners, input.bareme, input.totalCle);

      const { error: eDel } = await supabase.from("plans_individuels").delete().eq("scenario_id", input.scenarioId);
      if (eDel) throw eDel;
      if (plans.length) {
        const { error: eIns } = await supabase.from("plans_individuels").insert(
          plans.map((p) => ({
            scenario_id: input.scenarioId,
            coproprietaire_id: p.ownerId,
            tantiemes: p.tantiemes,
            quote_part: p.quotePart,
            mpr_indiv: p.mprIndiv,
            cee_part: p.cee,
            subv_coll_part: p.subvColl,
            eco_ptz_part: p.ecoPtz,
            reste: p.resteACharge,
            mensualite: p.mensualite,
            detail: { lots: p.lotNums, lotsHab: p.lotsHab, profil: p.profil } as unknown as Json,
          }))
        );
        if (eIns) throw eIns;
      }
      const { error: eUp } = await supabase
        .from("scenarios_financiers")
        .update({
          params: input.params as unknown as Json,
          resultat: d as unknown as Json,
          validated_at: new Date().toISOString(),
        })
        .eq("id", input.scenarioId);
      if (eUp) throw eUp;
      return { plansCount: plans.length, resultat: d };
    },
    onSuccess: (_r, v) => {
      invalidate(qc, coproId);
      void qc.invalidateQueries({ queryKey: ["plans", v.scenarioId] });
    },
  });
}

/** Choix de financement transmis par les copropriétaires depuis le portail. */
export function useChoixFinancementScenario(scenarioId: string | undefined) {
  return useQuery({
    queryKey: ["choix-financement", scenarioId],
    enabled: !!scenarioId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("choix_financement")
        .select("*, coproprietaires(nom)")
        .eq("scenario_id", scenarioId!)
        .order("transmitted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePlansIndividuels(scenarioId: string | undefined) {
  return useQuery({
    queryKey: ["plans", scenarioId],
    enabled: !!scenarioId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans_individuels")
        .select("*, coproprietaires(nom)")
        .eq("scenario_id", scenarioId!)
        .order("quote_part", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
