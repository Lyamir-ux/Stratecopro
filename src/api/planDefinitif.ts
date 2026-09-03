// Plans de financement définitifs (nomenclature chef de projet) : CRUD + import xlsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, Tables, TablesUpdate } from "@/lib/database.types";
import {
  computePlanDefinitif,
  readPlanDefinitif,
  round2,
  type Bareme,
  type FinanceParams,
  type PlanDefinitifData,
  type PlanDefinitifResult,
  type PlanIndividuelPf,
} from "@/lib/finance";
import { makeDefaultParams } from "./scenarios";

export type PlanDefinitif = Tables<"plans_definitifs">;

export function usePlansDefinitifs(coproId: string | undefined) {
  return useQuery({
    queryKey: ["plans-definitifs", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<PlanDefinitif[]> => {
      const { data, error } = await supabase
        .from("plans_definitifs")
        .select("*")
        .eq("copro_id", coproId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePlanDefinitif(planId: string | undefined) {
  return useQuery({
    queryKey: ["plan-definitif", planId],
    enabled: !!planId,
    queryFn: async (): Promise<PlanDefinitif> => {
      const { data, error } = await supabase.from("plans_definitifs").select("*").eq("id", planId!).single();
      if (error) throw error;
      return data;
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, coproId: string, planId?: string) {
  void qc.invalidateQueries({ queryKey: ["plans-definitifs", coproId] });
  if (planId) void qc.invalidateQueries({ queryKey: ["plan-definitif", planId] });
}

/** Crée un plan (import de classeur ou plan vierge). Retourne l'enregistrement créé. */
export function useCreatePlanDefinitif(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nom: string; data: PlanDefinitifData; sourceFichier?: string }) => {
      const { data: row, error } = await supabase
        .from("plans_definitifs")
        .insert({
          copro_id: coproId,
          nom: input.nom,
          data: input.data as unknown as Json,
          resultat: computePlanDefinitif(input.data) as unknown as Json,
          source_fichier: input.sourceFichier ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return row;
    },
    onSuccess: () => invalidate(qc, coproId),
  });
}

/** Enregistre les modifications ; le résultat recalculé est figé avec les données. */
export function useUpdatePlanDefinitif(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; data?: PlanDefinitifData; nom?: string; statut?: string }) => {
      const { error } = await supabase
        .from("plans_definitifs")
        .update({
          ...(input.nom !== undefined ? { nom: input.nom } : {}),
          ...(input.statut !== undefined ? { statut: input.statut } : {}),
          ...(input.data !== undefined
            ? {
                data: input.data as unknown as Json,
                resultat: computePlanDefinitif(input.data) as unknown as Json,
              }
            : {}),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_r, v) => invalidate(qc, coproId, v.id),
  });
}

/**
 * Valide (ou repasse en brouillon) un plan définitif. Un seul plan validé par
 * copropriété : valider un plan repasse les autres plans validés en brouillon.
 * Le plan validé alimente automatiquement les panneaux de l'onglet Financement,
 * est partagé avec le syndic (RLS) et reporte gain et étiquettes sur le dossier
 * (tableau de bord, portefeuille).
 */
export function useValiderPlanDefinitif(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; valider: boolean }) => {
      if (input.valider) {
        const { error: errAutres } = await supabase
          .from("plans_definitifs")
          .update({ statut: "brouillon" })
          .eq("copro_id", coproId)
          .eq("statut", "valide")
          .neq("id", input.id);
        if (errAutres) throw errAutres;
      }
      const { error } = await supabase
        .from("plans_definitifs")
        .update({ statut: input.valider ? "valide" : "brouillon" })
        .eq("id", input.id);
      if (error) throw error;

      if (input.valider) {
        // Le PF validé fait foi : gain énergétique et étiquettes du plan
        // remontent sur le dossier (cartes du tableau de bord, hero, exports).
        const { data: row, error: errRow } = await supabase
          .from("plans_definitifs")
          .select("data, resultat")
          .eq("id", input.id)
          .single();
        if (errRow) throw errRow;
        const infos = readPlanDefinitif(row.data).infos;
        const res = row.resultat as unknown as PlanDefinitifResult | null;
        const lireEtiquette = (s: string): string | null => {
          const l = (s ?? "").trim().toUpperCase().slice(0, 1);
          return l && "ABCDEFG".includes(l) ? l : null;
        };
        const patch: TablesUpdate<"coproprietes"> = {};
        if (res?.performancePct) patch.gain_pct = Math.round(res.performancePct * 10) / 10;
        const avant = lireEtiquette(infos.etiquetteInitiale);
        const apres = lireEtiquette(infos.etiquetteProjet);
        if (avant) patch.energy_before = avant;
        if (apres) patch.energy_after = apres;
        if (Object.keys(patch).length) {
          const { error: errCopro } = await supabase.from("coproprietes").update(patch).eq("id", coproId);
          if (errCopro) throw errCopro;
        }

        // Le syndic (gestionnaires du dossier + directeurs de l'enseigne) est
        // prévenu par e-mail - meilleur effort, la validation est déjà acquise.
        try {
          await supabase.functions.invoke("notifier-syndic", {
            body: { copro_id: coproId, type: "pf_valide" },
          });
        } catch {
          /* l'alerte e-mail est facultative */
        }
      }
    },
    onSuccess: (_r, v) => {
      invalidate(qc, coproId, v.id);
      void qc.invalidateQueries({ queryKey: ["copro", coproId] });
      void qc.invalidateQueries({ queryKey: ["copros"] });
    },
  });
}

export function useDeletePlanDefinitif(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plans_definitifs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, coproId),
  });
}

/**
 * Scénario « pont » créé par le partage du PF définitif au portail
 * copropriétaire (null si jamais partagé ; statut ≠ partage = partage retiré).
 */
export function usePfPartage(planId: string | undefined) {
  return useQuery({
    queryKey: ["pf-partage", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scenarios_financiers")
        .select("*")
        .eq("plan_definitif_id", planId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Partage (ou retire) le PF définitif validé aux copropriétaires. Le partage
 * matérialise les plans individuels du PF dans le circuit du portail : un
 * scénario financier verrouillé (statut partage, relié au plan par
 * plan_definitif_id) + une ligne plans_individuels par copropriétaire.
 * Tout le portail (accueil, quotes-parts, plan de la copro, choix de
 * financement) fonctionne alors sans autre branchement.
 */
export function usePartagerPfCopros(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      plan: PlanDefinitif;
      pv: PlanDefinitifResult;
      pvData: PlanDefinitifData;
      plans: PlanIndividuelPf[];
      /** Tantièmes par copropriétaire sur la clé de référence (mise à l'échelle par lot côté portail). */
      tantiemesRef: Record<string, number>;
      /** Code de la clé de référence (clé unique ou clé par défaut de la copro). */
      cleRef: string;
      /** Total de la clé de référence sur toute la copro (dénominateur des tantièmes). */
      totalCle: number;
      bareme: Bareme;
      partager: boolean;
    }) => {
      const { data: existant, error: errSel } = await supabase
        .from("scenarios_financiers")
        .select("id")
        .eq("plan_definitif_id", input.plan.id)
        .maybeSingle();
      if (errSel) throw errSel;

      if (!input.partager) {
        if (existant) {
          const { error } = await supabase
            .from("scenarios_financiers")
            .update({ statut: "brouillon" })
            .eq("id", existant.id);
          if (error) throw error;
        }
        return;
      }

      // Paramètres choisis pour que les cascades du portail (« Plan de la
      // copropriété », estimations de repli) retombent sur les montants du PF :
      // travaux × mprCoproPct = aides publiques, cee = prime CEE.
      const { pv, pvData } = input;
      const travaux = round2(pv.totalTravauxTtc);
      const params: FinanceParams = {
        ...makeDefaultParams(input.bareme),
        travaux,
        honoraires: round2(pv.totalMoeTtc),
        aleas: round2(pv.totalTravauxTtcImprevus - pv.totalTravauxTtc),
        cle: input.cleRef,
        totalCle: input.totalCle || 1000,
        mprCoproPct: travaux > 0 ? round2(((pv.totalAides - pv.primeCee) / travaux) * 100) : 0,
        bonusPassoire: false,
        cee: round2(pv.primeCee),
        fonds: pvData.params.fondsTravaux,
        ecoPtz: true,
        ecoPtzDuree: pvData.params.dureeEcoPtzAns,
      };
      const nom = `PF définitif - ${input.plan.nom}`;

      let scenarioId: string;
      if (existant) {
        const { error } = await supabase
          .from("scenarios_financiers")
          .update({ name: nom, statut: "partage", locked: true, params: params as unknown as Json })
          .eq("id", existant.id);
        if (error) throw error;
        scenarioId = existant.id;
      } else {
        const { data: cree, error } = await supabase
          .from("scenarios_financiers")
          .insert({
            copro_id: coproId,
            name: nom,
            statut: "partage",
            locked: true,
            bareme_millesime: input.bareme.millesime,
            params: params as unknown as Json,
            plan_definitif_id: input.plan.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        scenarioId = cree.id;
      }

      const { error: eDel } = await supabase.from("plans_individuels").delete().eq("scenario_id", scenarioId);
      if (eDel) throw eDel;
      if (input.plans.length) {
        const { error: eIns } = await supabase.from("plans_individuels").insert(
          input.plans.map((p) => ({
            scenario_id: scenarioId,
            coproprietaire_id: p.coproprietaireId,
            tantiemes: input.tantiemesRef[p.coproprietaireId] ?? 0,
            quote_part: p.quotePartAvant,
            mpr_indiv: 0,
            // La prime CEE (versée en fin de chantier) est isolée : elle ne doit
            // pas être déduite du montant à financer avant travaux (03/09/2026)
            cee_part: p.primeCee,
            subv_coll_part: round2(p.aidesEtFonds - p.primeCee),
            eco_ptz_part: 0,
            reste: p.reste,
            mensualite: 0,
            detail: { source: "pf", planDefinitifId: input.plan.id } as unknown as Json,
          }))
        );
        if (eIns) throw eIns;
      }
    },
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: ["pf-partage", v.plan.id] });
      void qc.invalidateQueries({ queryKey: ["scenarios", coproId] });
      void qc.invalidateQueries({ queryKey: ["portail"] });
    },
  });
}
