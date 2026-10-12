// Plans de financement définitifs (nomenclature chef de projet) : CRUD + import xlsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, Tables, TablesUpdate } from "@/lib/database.types";
import {
  computePlanDefinitif,
  couvreToutLaCopro,
  perimetresSeChevauchent,
  readPlanDefinitif,
  repartitionParLot,
  repartirPfs,
  round2,
  syntheseEnergetiquePfs,
  type Bareme,
  type FinanceParams,
  type LotPourRepartition,
  type PfARepartir,
  type PerimetrePf,
  type PlanDefinitifData,
} from "@/lib/finance";
import { libellesBatiments } from "@/lib/referentiels";
import { makeDefaultParams } from "./scenarios";
import { uploadFichierDirect } from "./fichiers";
import { construireNomFichier } from "@/lib/nommage";
import { exportPlanDefinitif } from "@/lib/finance/exportPlanDefinitif";
import { exportPlanEstimatif, libelleDepuisNom, nomScenario, type ScenarioEstimatif } from "@/lib/finance/planEstimatif";

export type PlanDefinitif = Tables<"plans_definitifs">;

/**
 * PF définitifs validés de la copropriété, du plus ancien au plus récent : un
 * seul pour toute la copropriété, ou un par bâtiment (périmètres disjoints,
 * plans par bâtiment du 11/10/2026). Les scénarios estimatifs n'en font jamais partie.
 */
export function plansValides(plans: PlanDefinitif[] | null | undefined): PlanDefinitif[] {
  return (plans ?? [])
    .filter((p) => p.statut === "valide" && !estPlanEstimatif(p))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}

/** PF prêt à répartir : recalculé depuis ses données (jamais l'instantané `resultat`). */
export function pfARepartir(p: PlanDefinitif): PfARepartir {
  const data = readPlanDefinitif(p.data);
  return { id: p.id, nom: p.nom, data, resultat: computePlanDefinitif(data), batimentIds: p.batiment_ids };
}

/** « Toute la copropriété » ou « Bât. 01 + Bât. Commun » (dénomination du dossier). */
export function libellePerimetre(
  perimetre: PerimetrePf,
  batiments: { id: string; code: string; position?: number | null }[],
  denomination?: string | null
): string {
  if (couvreToutLaCopro(perimetre)) return "Toute la copropriété";
  const court = libellesBatiments(denomination).court;
  const ids = new Set(perimetre);
  const connus = batiments
    .filter((b) => ids.has(b.id))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.code.localeCompare(b.code, "fr", { numeric: true }))
    .map((b) => `${court} ${b.code}`);
  const inconnus = perimetre!.filter((id) => !batiments.some((b) => b.id === id)).length;
  return [...connus, ...(inconnus ? [`${inconnus} bâtiment${inconnus > 1 ? "s" : ""} supprimé${inconnus > 1 ? "s" : ""}`] : [])].join(" + ");
}

/** PF validés (autres que `planId`) dont le périmètre chevauche `perimetre` : ils repassent en brouillon à la validation. */
export function plansValidesEnConflit(
  plans: PlanDefinitif[] | null | undefined,
  planId: string,
  perimetre: PerimetrePf
): PlanDefinitif[] {
  return plansValides(plans).filter((p) => p.id !== planId && perimetresSeChevauchent(p.batiment_ids, perimetre));
}

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Archive un classeur du PF définitif dans l'onglet Fichiers (dossier « Plans
 * de financement »), sous la nomenclature de la plateforme - feedback Théa
 * 03/09/2026 : le classeur importé puis validé n'était archivé nulle part.
 * `file` : classeur source tel qu'importé ; sinon export de l'état `data`.
 */
export async function archiverClasseurPf(input: {
  coproId: string;
  coproNom: string;
  data: PlanDefinitifData;
  version: number;
  etat: "source import" | "validé" | "état courant";
  file?: File;
  /** Objet du nom de fichier (défaut : « PF définitif <copro> vN »). */
  objet?: string;
}): Promise<{ id: string }> {
  let file = input.file;
  if (!file) {
    const XLSX = await import("xlsx");
    const wb = exportPlanDefinitif(input.data);
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    file = new File([buf], "pf.xlsx", { type: MIME_XLSX });
  }
  const nom = construireNomFichier(
    {
      prefixe: input.coproNom,
      type: "plan_financement",
      objet: input.objet ?? `PF définitif ${input.data.infos.nomCopro || input.coproNom} v${input.version}`,
      emetteur: "Strat Eco",
      date: new Date().toISOString().slice(0, 10),
      etat: input.etat,
    },
    "xlsx"
  );
  const renomme = new File([file], nom, { type: file.type || MIME_XLSX });
  return uploadFichierDirect(input.coproId, renomme, "Plans de financement", input.file ? input.file.name : undefined);
}

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
    mutationFn: async (input: {
      nom: string;
      data: PlanDefinitifData;
      sourceFichier?: string;
      /** Classeur importé : archivé tel quel dans l'onglet Fichiers. */
      file?: File;
      coproNom?: string;
    }) => {
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
      if (input.file) {
        // Archivage du classeur source - meilleur effort : le plan est créé même
        // si le dépôt échoue (l'AMO peut réarchiver depuis l'éditeur).
        try {
          const f = await archiverClasseurPf({
            coproId,
            coproNom: input.coproNom ?? input.data.infos.nomCopro ?? "copro",
            data: input.data,
            version: 1,
            etat: "source import",
            file: input.file,
          });
          await supabase.from("plans_definitifs").update({ source_fichier_id: f.id }).eq("id", row.id);
        } catch {
          /* archivage facultatif */
        }
      }
      return row;
    },
    onSuccess: () => {
      invalidate(qc, coproId);
      void qc.invalidateQueries({ queryKey: ["fichiers", coproId] });
    },
  });
}

/** Plan d'un PF estimatif (scénario) - nature « estimatif ». */
export function estPlanEstimatif(p: Pick<PlanDefinitif, "nature">): boolean {
  return p.nature === "estimatif";
}

/** Scénarios d'un groupe estimatif, dans l'ordre du classeur. */
export function scenariosDuGroupe(plans: PlanDefinitif[] | undefined, groupe: string | null | undefined): PlanDefinitif[] {
  return (plans ?? [])
    .filter((p) => estPlanEstimatif(p) && p.estimatif_groupe === groupe)
    .sort((a, b) => (a.scenario_ordre ?? 0) - (b.scenario_ordre ?? 0));
}

/** Groupes estimatifs d'une copro, du plus récent au plus ancien. */
export function groupesEstimatifs(plans: PlanDefinitif[] | undefined): { groupe: string; scenarios: PlanDefinitif[] }[] {
  const groupes = new Map<string, PlanDefinitif[]>();
  for (const p of plans ?? []) {
    if (!estPlanEstimatif(p) || !p.estimatif_groupe) continue;
    groupes.set(p.estimatif_groupe, [...(groupes.get(p.estimatif_groupe) ?? []), p]);
  }
  return [...groupes.entries()]
    .map(([groupe, ps]) => ({ groupe, scenarios: ps.sort((a, b) => (a.scenario_ordre ?? 0) - (b.scenario_ordre ?? 0)) }))
    .sort((a, b) => (b.scenarios[0].created_at > a.scenarios[0].created_at ? 1 : -1));
}

/** Scénarios (moteur) depuis les plans d'un groupe - export et comparatif. */
export function scenariosEstimatifs(plans: PlanDefinitif[]): ScenarioEstimatif[] {
  return plans.map((p, i) => ({
    ordre: p.scenario_ordre ?? i + 1,
    libelle: libelleDepuisNom(p.nom),
    data: readPlanDefinitif(p.data),
  }));
}

/** Archive l'export .xlsx d'un PF estimatif (tous ses scénarios) dans l'onglet Fichiers. */
export async function archiverClasseurEstimatif(input: {
  coproId: string;
  coproNom: string;
  scenarios: ScenarioEstimatif[];
  etat: "source import" | "état courant";
  file?: File;
}): Promise<{ id: string }> {
  let file = input.file;
  if (!file) {
    const XLSX = await import("xlsx");
    const buf = XLSX.write(exportPlanEstimatif(input.scenarios), { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    file = new File([buf], "pf-estimatif.xlsx", { type: MIME_XLSX });
  }
  const data = input.scenarios[0]?.data ?? readPlanDefinitif({});
  return archiverClasseurPf({
    coproId: input.coproId,
    coproNom: input.coproNom,
    data,
    version: 1,
    etat: input.etat,
    file,
    objet: `PF estimatif ${data.infos.nomCopro || input.coproNom} ${input.scenarios.length} scénarios`,
  });
}

/**
 * Crée les scénarios d'un PF estimatif importé (un plan brouillon par
 * scénario, même groupe) et archive le classeur source une seule fois.
 * Retourne l'identifiant du groupe (page comparatif).
 */
export function useCreatePlansEstimatifs(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      scenarios: ScenarioEstimatif[];
      sourceFichier?: string;
      file?: File;
      coproNom?: string;
    }): Promise<string> => {
      const groupe = crypto.randomUUID();
      const { data: rows, error } = await supabase
        .from("plans_definitifs")
        .insert(
          input.scenarios.map((s) => ({
            copro_id: coproId,
            nom: nomScenario(s.ordre, s.libelle),
            data: s.data as unknown as Json,
            resultat: computePlanDefinitif(s.data) as unknown as Json,
            source_fichier: input.sourceFichier ?? null,
            nature: "estimatif",
            estimatif_groupe: groupe,
            scenario_ordre: s.ordre,
          }))
        )
        .select("id");
      if (error) throw error;
      if (input.file) {
        // Archivage du classeur source - meilleur effort, comme le PF définitif
        try {
          const f = await archiverClasseurEstimatif({
            coproId,
            coproNom: input.coproNom ?? input.scenarios[0]?.data.infos.nomCopro ?? "copro",
            scenarios: input.scenarios,
            etat: "source import",
            file: input.file,
          });
          await supabase
            .from("plans_definitifs")
            .update({ source_fichier_id: f.id })
            .in(
              "id",
              (rows ?? []).map((r) => r.id)
            );
        } catch {
          /* archivage facultatif */
        }
      }
      return groupe;
    },
    onSuccess: () => {
      invalidate(qc, coproId);
      void qc.invalidateQueries({ queryKey: ["fichiers", coproId] });
    },
  });
}

/** Supprime tous les scénarios d'un PF estimatif. */
export function useDeleteGroupeEstimatif(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupe: string) => {
      const { error } = await supabase
        .from("plans_definitifs")
        .delete()
        .eq("copro_id", coproId)
        .eq("nature", "estimatif")
        .eq("estimatif_groupe", groupe);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, coproId),
  });
}

/** Archive l'état courant d'un plan (export .xlsx) dans l'onglet Fichiers, sans changer son statut. */
export function useArchiverPlanDefinitif(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { plan: PlanDefinitif; coproNom: string }) => {
      const data = readPlanDefinitif(input.plan.data);
      const f = await archiverClasseurPf({
        coproId,
        coproNom: input.coproNom,
        data,
        version: input.plan.version,
        etat: input.plan.statut === "valide" ? "validé" : "état courant",
      });
      if (input.plan.statut === "valide") {
        const { error } = await supabase
          .from("plans_definitifs")
          .update({ valide_fichier_id: f.id, valide_le: input.plan.valide_le ?? new Date().toISOString() })
          .eq("id", input.plan.id);
        if (error) throw error;
      }
      return f;
    },
    onSuccess: (_r, v) => {
      invalidate(qc, coproId, v.plan.id);
      void qc.invalidateQueries({ queryKey: ["fichiers", coproId] });
    },
  });
}

/** Enregistre les modifications ; le résultat recalculé est figé avec les données. */
export function useUpdatePlanDefinitif(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      data?: PlanDefinitifData;
      nom?: string;
      statut?: string;
      /** Périmètre du PF (bâtiments couverts) ; null ou vide = toute la copropriété. */
      batimentIds?: string[] | null;
    }) => {
      if (input.batimentIds !== undefined) {
        // Un PF validé ne peut pas déborder sur le bâtiment d'un autre PF validé
        // (les plans individuels compteraient deux fois les mêmes lots).
        const { data: freres, error: errFreres } = await supabase
          .from("plans_definitifs")
          .select("*")
          .eq("copro_id", coproId);
        if (errFreres) throw errFreres;
        const moi = (freres ?? []).find((p) => p.id === input.id);
        if (moi?.statut === "valide") {
          const conflits = plansValidesEnConflit(freres, input.id, input.batimentIds);
          if (conflits.length)
            throw new Error(
              `Ce périmètre chevauche celui d'un autre PF validé (« ${conflits.map((p) => p.nom).join(" », « ")} »). ` +
                "Retirez d'abord le bâtiment commun de l'autre plan, ou repassez l'un des deux en brouillon."
            );
        }
      }
      const { error } = await supabase
        .from("plans_definitifs")
        .update({
          ...(input.nom !== undefined ? { nom: input.nom } : {}),
          ...(input.statut !== undefined ? { statut: input.statut } : {}),
          ...(input.batimentIds !== undefined
            ? { batiment_ids: input.batimentIds && input.batimentIds.length ? input.batimentIds : null }
            : {}),
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
 * périmètre : valider un plan repasse en brouillon les plans validés dont le
 * périmètre chevauche le sien (un PF de toute la copropriété chevauche tout ;
 * des PF de bâtiments différents restent validés ensemble, 11/10/2026).
 * Le plan validé alimente automatiquement les panneaux de l'onglet Financement,
 * est partagé avec le syndic (RLS) et reporte gain et étiquettes sur le dossier
 * (tableau de bord, portefeuille).
 */
export function useValiderPlanDefinitif(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; valider: boolean; coproNom?: string }) => {
      if (input.valider) {
        const { data: freres, error: errFreres } = await supabase
          .from("plans_definitifs")
          .select("*")
          .eq("copro_id", coproId);
        if (errFreres) throw errFreres;
        const moi = (freres ?? []).find((p) => p.id === input.id);
        const conflits = plansValidesEnConflit(freres, input.id, moi?.batiment_ids);
        if (conflits.length) {
          const { error: errAutres } = await supabase
            .from("plans_definitifs")
            .update({ statut: "brouillon" })
            .in(
              "id",
              conflits.map((p) => p.id)
            );
          if (errAutres) throw errAutres;
        }
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
          .select("data, version, nom, batiment_ids")
          .eq("id", input.id)
          .single();
        if (errRow) throw errRow;
        const pdata = readPlanDefinitif(row.data);
        const infos = pdata.infos;

        // Archivage et versionnage automatiques de l'état validé (feedback
        // Théa 03/09/2026) : un export .xlsx daté par validation dans Fichiers.
        try {
          const version = (row.version ?? 0) + 1;
          const f = await archiverClasseurPf({
            coproId,
            coproNom: input.coproNom ?? infos.nomCopro ?? "copro",
            data: pdata,
            version,
            etat: "validé",
            // PF d'un bâtiment : son nom distingue l'archive de celle des autres bâtiments
            ...(couvreToutLaCopro(row.batiment_ids)
              ? {}
              : { objet: `${/^PF\b/i.test(row.nom) ? row.nom : `PF définitif ${row.nom}`} v${version}` }),
          });
          await supabase
            .from("plans_definitifs")
            .update({ valide_fichier_id: f.id, valide_le: new Date().toISOString(), version })
            .eq("id", input.id);
        } catch {
          /* l'archivage ne bloque pas la validation */
        }
        // Gain et étiquettes du dossier : ceux du PF validé, ou la synthèse de
        // tous les PF validés quand il y en a un par bâtiment.
        const { data: valides, error: errValides } = await supabase
          .from("plans_definitifs")
          .select("data")
          .eq("copro_id", coproId)
          .eq("statut", "valide");
        if (errValides) throw errValides;
        const synthese = syntheseEnergetiquePfs(
          (valides ?? []).map((v) => {
            const data = readPlanDefinitif(v.data);
            return { data, resultat: computePlanDefinitif(data) };
          })
        );
        const patch: TablesUpdate<"coproprietes"> = {};
        if (synthese.gainPct) patch.gain_pct = synthese.gainPct;
        if (synthese.etiquetteAvant) patch.energy_before = synthese.etiquetteAvant;
        if (synthese.etiquetteApres) patch.energy_after = synthese.etiquetteApres;
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
      void qc.invalidateQueries({ queryKey: ["fichiers", coproId] });
    },
  });
}

export function useDeletePlanDefinitif(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Scénario pont qui cumule ce PF avec d'autres (plans par bâtiment) : il
      // est réancré sur un autre PF, sinon la suppression en cascade emporterait
      // le partage et les choix de financement des autres bâtiments.
      const { data: ponts, error: errPonts } = await supabase
        .from("scenarios_financiers")
        .select("id, plan_definitif_id, pf_ids")
        .eq("copro_id", coproId)
        .contains("pf_ids", [id]);
      if (errPonts) throw errPonts;
      for (const s of ponts ?? []) {
        const reste = s.pf_ids.filter((x) => x !== id);
        if (!reste.length) continue;
        const { error: errPont } = await supabase
          .from("scenarios_financiers")
          .update({ pf_ids: reste, ...(s.plan_definitif_id === id ? { plan_definitif_id: reste[0] } : {}) })
          .eq("id", s.id);
        if (errPont) throw errPont;
      }
      const { error } = await supabase.from("plans_definitifs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate(qc, coproId);
      void qc.invalidateQueries({ queryKey: ["pf-partage"] });
      void qc.invalidateQueries({ queryKey: ["scenarios", coproId] });
    },
  });
}

/**
 * Duplique un PF définitif en brouillon (même contenu, sans périmètre) : point
 * de départ du plan d'un autre bâtiment quand les programmes se ressemblent.
 */
export function useDupliquerPlanDefinitif(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: PlanDefinitif) => {
      const data = readPlanDefinitif(plan.data);
      const { data: row, error } = await supabase
        .from("plans_definitifs")
        .insert({
          copro_id: coproId,
          nom: `${plan.nom} (copie)`,
          data: data as unknown as Json,
          resultat: computePlanDefinitif(data) as unknown as Json,
          source_fichier: plan.source_fichier,
        })
        .select()
        .single();
      if (error) throw error;
      return row;
    },
    onSuccess: () => invalidate(qc, coproId),
  });
}

/**
 * Scénario « pont » qui publie les PF définitifs validés au portail
 * copropriétaire, pour un ensemble de PF (null si jamais partagé ; statut ≠
 * partage = partage retiré). Plans par bâtiment (11/10/2026) : un seul pont
 * cumule tous les PF validés (pf_ids), plan_definitif_id en est l'ancre.
 */
export function usePontPf(coproId: string, planIds: string[]) {
  const ids = [...planIds].sort();
  return useQuery({
    queryKey: ["pf-partage", coproId, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const ponts = await pontsDesPf(coproId, ids);
      return ponts.find((s) => s.statut === "partage") ?? ponts[0] ?? null;
    },
  });
}

async function pontsDesPf(coproId: string, ids: string[]) {
  const { data, error } = await supabase
    .from("scenarios_financiers")
    .select("*")
    .eq("copro_id", coproId)
    .or(`plan_definitif_id.in.(${ids.join(",")}),pf_ids.ov.{${ids.join(",")}}`)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Le pont partagé publie exactement ces PF (sinon un nouveau partage est attendu). */
export function pontAJour(pont: { statut: string; pf_ids: string[] } | null | undefined, planIds: string[]): boolean {
  if (!pont || pont.statut !== "partage") return false;
  const a = new Set(pont.pf_ids);
  return a.size === planIds.length && planIds.every((id) => a.has(id));
}

/**
 * Montants des PF repris dans les paramètres du scénario pont : ils alimentent
 * les cascades du portail (« Plan de la copropriété », estimations de repli) -
 * travaux × mprCoproPct = aides publiques, cee = prime CEE (sommes des PF).
 */
export function montantsPont(pfs: Pick<PfARepartir, "data" | "resultat">[]) {
  const somme = (f: (p: Pick<PfARepartir, "data" | "resultat">) => number) => round2(pfs.reduce((s, p) => s + f(p), 0));
  const travaux = somme((p) => p.resultat.totalTravauxTtc);
  const totalAides = somme((p) => p.resultat.totalAides);
  const primeCee = somme((p) => p.resultat.primeCee);
  return {
    travaux,
    honoraires: somme((p) => p.resultat.totalMoeTtc),
    aleas: somme((p) => p.resultat.totalTravauxTtcImprevus - p.resultat.totalTravauxTtc),
    mprCoproPct: travaux > 0 ? round2(((totalAides - primeCee) / travaux) * 100) : 0,
    cee: primeCee,
    fonds: somme((p) => p.data.params.fondsTravaux),
    /** Aides publiques des PF, au centime : trace du partage (montants notifiés, 12/10/2026). */
    aidesPubliquesPf: round2(totalAides - primeCee),
  };
}

/**
 * Les montants publiés par le pont sont encore ceux des PF : une aide notifiée,
 * un devis ou un fonds travaux modifiés après le partage laissent au portail
 * des plans individuels périmés, à republier.
 */
export function montantsPontAJour(pont: { params: Json } | null | undefined, pfs: Pick<PfARepartir, "data" | "resultat">[]): boolean {
  if (!pont || !pfs.length) return true;
  const publie = (pont.params ?? {}) as Record<string, unknown>;
  const actuel = montantsPont(pfs);
  const egal = (cle: keyof typeof actuel, tolerance = 0.01) => {
    const v = publie[cle];
    return typeof v !== "number" || Math.abs(v - actuel[cle]) <= tolerance;
  };
  return egal("travaux") && egal("honoraires") && egal("aleas") && egal("cee") && egal("fonds") && egal("aidesPubliquesPf") &&
    // partages antérieurs au 12/10/2026, sans le montant des aides au centime
    (typeof publie.aidesPubliquesPf === "number" || egal("mprCoproPct", 0.005));
}

/** Part d'un lot dans le plan publié au portail (somme sur les PF qui le couvrent). */
export interface PartLotPortail {
  quotePart: number;
  cee: number;
  /** Aides collectives hors CEE et fonds travaux. */
  subvColl: number;
}

/**
 * Partage (ou retire) les PF définitifs validés aux copropriétaires. Le partage
 * matérialise les plans individuels dans le circuit du portail : un scénario
 * financier verrouillé (statut partage, relié aux PF par plan_definitif_id et
 * pf_ids) + une ligne plans_individuels par copropriétaire. Tout le portail
 * (accueil, quotes-parts, plan de la copro, choix de financement) fonctionne
 * alors sans autre branchement.
 * Plusieurs PF (un par bâtiment) : chacun est réparti entre les lots de son
 * périmètre et le copropriétaire reçoit un seul plan cumulé (choix d'Amir du
 * 11/10/2026), avec le détail lot par lot pour « Mes quotes-parts ».
 */
export function usePartagerPfCopros(coproId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PartageInput) => partagerPfs(coproId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pf-partage"] });
      void qc.invalidateQueries({ queryKey: ["scenarios", coproId] });
      void qc.invalidateQueries({ queryKey: ["portail"] });
    },
  });
}

interface PartageInput {
  /** Tous les PF validés de la copropriété. */
  pfs: PfARepartir[];
  lots: (LotPourRepartition & { id: string; batiment_id: string | null })[];
  cles: { code: string; is_default: boolean }[];
  bareme: Bareme;
  partager: boolean;
}

async function partagerPfs(coproId: string, input: PartageInput): Promise<void> {
  const ids = input.pfs.map((p) => p.id);
  if (!ids.length) return;
  const ponts = await pontsDesPf(coproId, ids);
  const existant = ponts.find((s) => s.statut === "partage") ?? ponts[0] ?? null;
  const autresOuverts = ponts.filter((s) => s.statut === "partage" && s.id !== existant?.id);

  if (!input.partager) {
    const ouverts = ponts.filter((s) => s.statut === "partage").map((s) => s.id);
    if (ouverts.length) {
      const { error } = await supabase.from("scenarios_financiers").update({ statut: "brouillon" }).in("id", ouverts);
      if (error) throw error;
    }
    return;
  }

  const rep = repartirPfs(input.pfs, input.lots, input.cles);
  const cleRef = rep.cleRef;
  if (!rep.complet || !cleRef) throw new Error("Chaque PF validé doit être entièrement réparti avant le partage.");

  // Tantièmes de référence sur tous les lots du copropriétaire : le portail
  // affiche le cumul de ses lots sans mise à l'échelle (rapport 1).
  const totalCle = input.lots.reduce((s, l) => s + (l.tantiemes[cleRef] ?? 0), 0);
  const tantiemesRef = new Map<string, number>();
  const proprietaire = new Map<string, string>();
  for (const l of input.lots) {
    if (!l.coproprietaire_id) continue;
    proprietaire.set(l.id, l.coproprietaire_id);
    tantiemesRef.set(l.coproprietaire_id, (tantiemesRef.get(l.coproprietaire_id) ?? 0) + (l.tantiemes[cleRef] ?? 0));
  }
  // Détail lot par lot, chaque lot recevant la part du PF de son bâtiment
  const parLot = new Map<string, Record<string, PartLotPortail>>();
  for (const { pf, lots } of rep.parPf) {
    for (const [lotId, p] of repartitionParLot(pf.data, pf.resultat, lots, input.cles)) {
      const cp = proprietaire.get(lotId);
      if (!cp) continue;
      const rec = parLot.get(cp) ?? {};
      const cur = rec[lotId] ?? { quotePart: 0, cee: 0, subvColl: 0 };
      rec[lotId] = {
        quotePart: round2(cur.quotePart + p.quotePartAvant),
        cee: round2(cur.cee + p.primeCee),
        subvColl: round2(cur.subvColl + p.aidesEtFonds - p.primeCee),
      };
      parLot.set(cp, rec);
    }
  }

  // Paramètres choisis pour que les cascades du portail (« Plan de la
  // copropriété », estimations de repli) retombent sur les montants des PF
  const { aidesPubliquesPf, ...montants } = montantsPont(input.pfs);
  const params: FinanceParams & { aidesPubliquesPf: number } = {
    ...makeDefaultParams(input.bareme),
    ...montants,
    cle: cleRef,
    totalCle: totalCle || 1000,
    bonusPassoire: false,
    ecoPtz: true,
    ecoPtzDuree: input.pfs[0].data.params.dureeEcoPtzAns,
    aidesPubliquesPf,
  };
  // Le nom du plan importé commence déjà par « PF définitif - … » : pas de double préfixe.
  const nom =
    input.pfs.length === 1
      ? /^PF d[ée]finitif/i.test(input.pfs[0].nom)
        ? input.pfs[0].nom
        : `PF définitif - ${input.pfs[0].nom}`
      : `PF définitifs par bâtiment - ${input.pfs.map((p) => p.nom.replace(/^PF d[ée]finitif\s*-?\s*/i, "")).join(" + ")}`;

  // Ancre : celle du pont existant si elle fait partie des PF, sinon un PF
  // qui n'ancre pas déjà un autre pont (index unique).
  const ancres = new Set(ponts.filter((s) => s.id !== existant?.id).map((s) => s.plan_definitif_id));
  const ancre =
    existant?.plan_definitif_id && ids.includes(existant.plan_definitif_id)
      ? existant.plan_definitif_id
      : ids.find((id) => !ancres.has(id));
  if (!ancre) throw new Error("Chaque PF validé est déjà relié à un autre partage : retirez ces partages puis recommencez.");

  const champs = {
    name: nom,
    statut: "partage" as const,
    locked: true,
    // PF par bâtiment : un copropriétaire sans ligne n'est concerné par aucun PF (portail, computeIndiv)
    params: (input.pfs.some((p) => !couvreToutLaCopro(p.batimentIds))
      ? { ...params, parBatiment: true }
      : params) as unknown as Json,
    plan_definitif_id: ancre,
    pf_ids: ids,
  };
  let scenarioId: string;
  if (existant) {
    const { error } = await supabase.from("scenarios_financiers").update(champs).eq("id", existant.id);
    if (error) throw error;
    scenarioId = existant.id;
  } else {
    const { data: cree, error } = await supabase
      .from("scenarios_financiers")
      .insert({ ...champs, copro_id: coproId, bareme_millesime: input.bareme.millesime })
      .select("id")
      .single();
    if (error) throw error;
    scenarioId = cree.id;
  }
  // Un seul plan partagé à la fois pour ces PF (anciens partages séparés)
  if (autresOuverts.length) {
    const { error } = await supabase
      .from("scenarios_financiers")
      .update({ statut: "brouillon" })
      .in(
        "id",
        autresOuverts.map((s) => s.id)
      );
    if (error) throw error;
  }

  const { error: eDel } = await supabase.from("plans_individuels").delete().eq("scenario_id", scenarioId);
  if (eDel) throw eDel;
  if (rep.plans.length) {
    const { error: eIns } = await supabase.from("plans_individuels").insert(
      rep.plans.map((p) => ({
        scenario_id: scenarioId,
        coproprietaire_id: p.coproprietaireId,
        tantiemes: tantiemesRef.get(p.coproprietaireId) ?? 0,
        quote_part: p.quotePartAvant,
        mpr_indiv: 0,
        // La prime CEE (versée en fin de chantier) est isolée : elle ne doit
        // pas être déduite du montant à financer avant travaux (03/09/2026)
        cee_part: p.primeCee,
        subv_coll_part: round2(p.aidesEtFonds - p.primeCee),
        eco_ptz_part: 0,
        reste: p.reste,
        mensualite: 0,
        detail: {
          source: "pf",
          planDefinitifId: ancre,
          planDefinitifIds: ids,
          parLot: parLot.get(p.coproprietaireId) ?? {},
        } as unknown as Json,
      }))
    );
    if (eIns) throw eIns;
  }
}
