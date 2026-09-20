// Module Suivi PPT - accès aux données (tables ppt_*, bucket ppt-files, RPC).
// Branche isolée de la rénovation globale : le cabinet est l'organisation, le
// gestionnaire est rattaché par e-mail (ppt_affectations, trigger 0072), le
// syndic ne voit que les rapports validés par le dirigeant. Toutes les clés de
// requête commencent par "ppt".
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { nomFichierSansAccents } from "@/lib/nommage";
import type { Json, Tables } from "@/lib/database.types";
import type { PpptVerifJson, PrioriteCode } from "@/lib/ppt/schema";
import type { CorrectionJson } from "@/lib/ppt/import";
import type { LigneImport } from "@/lib/ppt/importPortefeuille";
import { cheminDepot } from "@/lib/ppt/depot";
import { PARAMETRES_ORG_DEFAUT, type ParametresOrg } from "@/lib/ppt/formules";

export type PptCopro = Tables<"ppt_coproprietes">;
export type PptStats = Tables<"ppt_copro_stats">;
export type PptRapport = Tables<"ppt_rapports">;
export type PptPoste = Tables<"ppt_postes">;
export type PptAg = Tables<"ppt_ag">;
export type PptResolution = Tables<"ppt_resolutions">;
export type PptRemarque = Tables<"ppt_remarques">;
export type PptParametres = Tables<"ppt_parametres_org">;
export type PptJournal = Tables<"ppt_journal">;
export type PptAffectation = Tables<"ppt_affectations">;
export type PptAnalyse = Tables<"ppt_analyses">;
export type PptCorrection = Tables<"ppt_corrections">;
export type PptTraitement = Tables<"ppt_traitements">;

export interface PptCoproAvecStats extends PptCopro {
  stats: PptStats | null;
  /** Peut ouvrir le dossier : AMO, direction de l'enseigne ou gestionnaire affecté. */
  acces: boolean;
}

const BUCKET = "ppt-files";

// ========== Enseigne et activation du module ==========

export interface OrganisationPpt {
  id: string;
  nom: string;
  role: Tables<"organisation_membres">["org_role"];
  module_ppt: boolean;
}

/** L'enseigne du syndic connecté, son rôle et l'activation du module PPT. AMO : null. */
export function useOrganisationPpt() {
  return useQuery({
    queryKey: ["ppt", "organisation"],
    queryFn: async (): Promise<OrganisationPpt | null> => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from("organisation_membres")
        .select("org_role, organisations(id, nom, module_ppt)")
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw error;
      if (!data?.organisations) return null;
      return { id: data.organisations.id, nom: data.organisations.nom, role: data.org_role, module_ppt: data.organisations.module_ppt };
    },
  });
}

/** Activation du module PPT sur une enseigne (Paramètres → Organisations, AMO). */
export function useActiverModulePpt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ organisation_id, actif }: { organisation_id: string; actif: boolean }) => {
      const { error } = await supabase.from("organisations").update({ module_ppt: actif }).eq("id", organisation_id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["organisations"] });
      void qc.invalidateQueries({ queryKey: ["ppt"] });
    },
  });
}

/** Paramètres financiers du cabinet (taux d'honoraires, hypothèses) - défauts Strat Eco si absents. */
export function usePptParametres(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ["ppt", "parametres", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ParametresOrg> => {
      const { data, error } = await supabase.from("ppt_parametres_org").select("*").eq("organisation_id", orgId!).maybeSingle();
      if (error) throw error;
      return data ? parametresDepuisRow(data) : PARAMETRES_ORG_DEFAUT;
    },
  });
}

/** Paramètres de toutes les enseignes (aperçu AMO multi-enseignes). */
export function usePptParametresTous() {
  return useQuery({
    queryKey: ["ppt", "parametres", "tous"],
    queryFn: async (): Promise<Map<string, ParametresOrg>> => {
      const { data, error } = await supabase.from("ppt_parametres_org").select("*");
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.organisation_id, parametresDepuisRow(r)]));
    },
  });
}

export function parametresDepuisRow(r: PptParametres): ParametresOrg {
  return {
    taux_honoraires_pct: Number(r.taux_honoraires_pct),
    base_honoraires: r.base_honoraires as "ht" | "ttc",
    inflation_pct: Number(r.inflation_pct),
    moe_pct: Number(r.moe_pct),
    syndic_pct: Number(r.syndic_pct),
    tva_facades_pct: Number(r.tva_facades_pct),
    tva_energetique_pct: Number(r.tva_energetique_pct),
  };
}

export function useMajPptParametres() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ organisation_id, ...p }: Partial<ParametresOrg> & { organisation_id: string }) => {
      const { error } = await supabase.from("ppt_parametres_org").upsert({ organisation_id, ...p }, { onConflict: "organisation_id" });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ppt", "parametres"] }),
  });
}

// ========== Copropriétés PPT ==========

/** Prédicat d'ouverture des dossiers (miroir du helper SQL ppt_ouvre). */
async function chargerAccesPpt(): Promise<(c: PptCopro) => boolean> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return () => false;
  const [{ data: profil }, { data: org }, { data: affectations }] = await Promise.all([
    supabase.from("profiles").select("role").eq("user_id", uid).maybeSingle(),
    supabase.from("organisation_membres").select("organisation_id, org_role").eq("user_id", uid).maybeSingle(),
    supabase.from("ppt_affectations").select("ppt_copro_id").eq("user_id", uid).is("au", null),
  ]);
  if (profil?.role === "amo") return () => true;
  const miennes = new Set((affectations ?? []).map((a) => a.ppt_copro_id));
  const directionDe = org?.org_role === "directeur" ? org.organisation_id : null;
  return (c) => miennes.has(c.id) || (directionDe !== null && c.organisation_id === directionDe);
}

/** Le portefeuille PPT visible (enseigne du syndic, ou tout pour l'AMO), avec stats et droit d'ouverture. */
export function usePptCopros() {
  return useQuery({
    queryKey: ["ppt", "copros"],
    queryFn: async (): Promise<PptCoproAvecStats[]> => {
      const [{ data: copros, error: e1 }, { data: stats, error: e2 }, acces] = await Promise.all([
        supabase.from("ppt_coproprietes").select("*").is("deleted_at", null).order("nom"),
        supabase.from("ppt_copro_stats").select("*"),
        chargerAccesPpt(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const statsById = new Map((stats ?? []).map((s) => [s.id, s]));
      return (copros ?? []).map((c) => ({ ...c, stats: statsById.get(c.id) ?? null, acces: acces(c) }));
    },
  });
}

export function usePptCopro(id: string | undefined) {
  return useQuery({
    queryKey: ["ppt", "copro", id],
    enabled: !!id,
    queryFn: async (): Promise<PptCoproAvecStats | null> => {
      const [{ data: copro, error: e1 }, { data: stats, error: e2 }, acces] = await Promise.all([
        supabase.from("ppt_coproprietes").select("*").eq("id", id!).maybeSingle(),
        supabase.from("ppt_copro_stats").select("*").eq("id", id!).maybeSingle(),
        chargerAccesPpt(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return copro ? { ...copro, stats: stats ?? null, acces: acces(copro) } : null;
    },
  });
}

function useRefreshPpt() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["ppt"] });
}

export type PptCoproInsert = Pick<PptCopro, "organisation_id" | "nom"> &
  Partial<Pick<PptCopro, "adresse" | "code_postal" | "commune" | "nb_lots" | "nb_logements" | "annee_construction" | "gestionnaire_nom" | "gestionnaire_email">>;

export function useCreerPptCopro() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async (c: PptCoproInsert): Promise<PptCopro> => {
      const { data: session } = await supabase.auth.getSession();
      const { data, error } = await supabase
        .from("ppt_coproprietes")
        .insert({ ...c, gestionnaire_email: c.gestionnaire_email?.trim().toLowerCase() || null, created_by: session.session?.user.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: refresh,
  });
}

export type PptCoproPatch = Partial<
  Pick<
    PptCopro,
    | "nom" | "adresse" | "code_postal" | "commune" | "immatriculation_rnc" | "annee_construction" | "nb_batiments" | "nb_lots" | "nb_logements"
    | "surface_m2" | "surface_type" | "chauffage" | "energie_chauffage" | "etiquette_energie" | "etiquette_ges" | "cep_kwhep_m2_an" | "date_dpe"
    | "fonds_travaux_solde" | "fonds_travaux_cotisation_annuelle" | "fonds_travaux_maj" | "budget_previsionnel_annuel"
    | "plus_de_15_ans" | "pppt_presente"
    | "gestionnaire_nom" | "gestionnaire_email" | "organisation_id" | "copro_id"
  >
>;

export function useMajPptCopro() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async ({ id, ...patch }: PptCoproPatch & { id: string }) => {
      const { error } = await supabase.from("ppt_coproprietes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

// ========== Import du portefeuille (0077) ==========

export interface ResultatImportPortefeuille {
  creees: number;
  mises_a_jour: number;
  ignorees: number;
  /** Passerelles vers un dossier de rénovation globale posées par cet import. */
  rapprochees: number;
  /** Copropriétés du fichier en rénovation avec Strat Eco (rapprochées avant ou pendant l'import). */
  en_reno: number;
  ids: string[];
}

/**
 * Le gestionnaire dépose son portefeuille (nom, adresse, commune, logements,
 * plus de 15 ans ?, PPPT présenté ?) : la RPC crée ou complète les copropriétés
 * PPT de l'enseigne puis les rapproche de la base AMO (statut « En rénovation »).
 */
export function useImporterPortefeuille() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async ({ organisation_id, lignes }: { organisation_id: string; lignes: LigneImport[] }): Promise<ResultatImportPortefeuille> => {
      const { data, error } = await supabase.rpc("ppt_importer_portefeuille", {
        p_org: organisation_id,
        p_lignes: lignes.map(({ ligne: _ligne, ...reste }) => reste) as unknown as Json,
      });
      if (error) throw error;
      const r = (data ?? {}) as Partial<ResultatImportPortefeuille>;
      return {
        creees: r.creees ?? 0,
        mises_a_jour: r.mises_a_jour ?? 0,
        ignorees: r.ignorees ?? 0,
        rapprochees: r.rapprochees ?? 0,
        en_reno: r.en_reno ?? 0,
        ids: r.ids ?? [],
      };
    },
    onSuccess: refresh,
  });
}

/** Corbeille (AMO) : jamais de suppression physique. */
export function useCorbeillePptCopro() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async ({ id, restaurer = false }: { id: string; restaurer?: boolean }) => {
      const { error } = await supabase.rpc("ppt_corbeille_copro", { p_id: id, p_restaurer: restaurer });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function usePptAffectations(coproId: string | undefined) {
  return useQuery({
    queryKey: ["ppt", "affectations", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<PptAffectation[]> => {
      const { data, error } = await supabase.from("ppt_affectations").select("*").eq("ppt_copro_id", coproId!).order("du", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ========== Rapports (documents) ==========

const cleIds = (ids: string[]) => [...ids].sort().join(",");

export function usePptRapports(coproIds: string[]) {
  return useQuery({
    queryKey: ["ppt", "rapports", cleIds(coproIds)],
    enabled: coproIds.length > 0,
    queryFn: async (): Promise<PptRapport[]> => {
      const { data, error } = await supabase.from("ppt_rapports").select("*").in("ppt_copro_id", coproIds).order("depose_le", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Tous les rapports (file de revue AMO), avec la copro et l'enseigne. */
export interface RapportRevue extends PptRapport {
  copro: Pick<PptCopro, "id" | "nom" | "commune" | "organisation_id" | "gestionnaire_nom" | "nb_logements"> | null;
  enseigne: string | null;
}

export function usePptRapportsRevue() {
  return useQuery({
    queryKey: ["ppt", "rapports", "revue"],
    queryFn: async (): Promise<RapportRevue[]> => {
      const [{ data, error }, { data: orgs, error: e2 }] = await Promise.all([
        supabase.from("ppt_rapports").select("*, copro:ppt_coproprietes(id, nom, commune, organisation_id, gestionnaire_nom, nb_logements)").order("depose_le", { ascending: false }),
        supabase.from("organisations").select("id, nom"),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      const nomOrg = new Map((orgs ?? []).map((o) => [o.id, o.nom]));
      return (data ?? []).map((r) => {
        const copro = r.copro as RapportRevue["copro"];
        return { ...r, copro, enseigne: copro?.organisation_id ? (nomOrg.get(copro.organisation_id) ?? null) : null };
      });
    },
  });
}

export function usePptRapport(id: string | undefined) {
  return useQuery({
    queryKey: ["ppt", "rapport", id],
    enabled: !!id,
    queryFn: async (): Promise<RapportRevue | null> => {
      const { data, error } = await supabase
        .from("ppt_rapports")
        .select("*, copro:ppt_coproprietes(id, nom, commune, organisation_id, gestionnaire_nom, nb_logements)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const copro = data.copro as RapportRevue["copro"];
      let enseigne: string | null = null;
      if (copro?.organisation_id) {
        const { data: o } = await supabase.from("organisations").select("nom").eq("id", copro.organisation_id).maybeSingle();
        enseigne = o?.nom ?? null;
      }
      return { ...data, copro, enseigne };
    },
  });
}

export type TypeRapport = PptRapport["type"];

/** Types de document dont le dépôt alerte le dirigeant de Strat Eco (analyse à lancer). */
const TYPES_ANALYSES: TypeRapport[] = ["pppt", "ppt_adopte", "dpe_collectif"];

/** Types de document pour lesquels le syndic indique son taux d'honoraires de suivi (0076). */
export const TYPES_AVEC_HONORAIRES: TypeRapport[] = ["pppt", "ppt_adopte"];

/** Dépôt d'un document (PPPT, DPE, PV…) : stockage + ligne ppt_rapports + alerte du dirigeant.
 *  `date_document` : date portée par le document, saisie facultative du déposant (AAAA-MM-JJ).
 *  `taux_honoraires_pct` : taux d'honoraires de suivi de travaux du syndic, demandé pour un PPPT
 *  ou un PPT adopté et transmis dans la notification (0076). */
export function useDeposerPptRapport() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async ({ copro, file, type, date_document, taux_honoraires_pct }: { copro: Pick<PptCopro, "id" | "organisation_id">; file: File; type: TypeRapport; date_document?: string | null; taux_honoraires_pct?: number | null }): Promise<PptRapport> => {
      const nom = nomFichierSansAccents(file.name);
      const path = cheminDepot(copro.organisation_id, copro.id, nom);
      const { error: eUp } = await supabase.storage.from(BUCKET).upload(path, file);
      if (eUp) throw eUp;
      const { data: session } = await supabase.auth.getSession();
      const { data, error } = await supabase
        .from("ppt_rapports")
        .insert({ ppt_copro_id: copro.id, type, name: nom, storage_path: path, size: file.size, mime: file.type || null, date_document: date_document || null, taux_honoraires_pct: taux_honoraires_pct ?? null, depose_par: session.session?.user.id ?? null })
        .select()
        .single();
      if (error) throw error;
      if (TYPES_ANALYSES.includes(type)) void notifierPpt("depot", data.id);
      return data;
    },
    onSuccess: refresh,
  });
}

/** Requalification du type d'un document déjà déposé (dirigeant, file de revue).
 *  Le type est deviné au dépôt d'après le nom du fichier : un classeur nommé
 *  « PPT_<Copro>.xlsx » arrive en « Tableau PPT » et sort donc de la file
 *  d'analyse. Le corriger ici y ramène le document (journalisé, 0080). */
export function useRequalifierPptRapport() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async ({ rapportId, type }: { rapportId: string; type: TypeRapport }) => {
      const { error } = await supabase.from("ppt_rapports").update({ type }).eq("id", rapportId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

/**
 * Correction d'un document déposé (0081) : copropriété de rattachement, type et
 * nom du fichier. Le chemin de stockage porte la copropriété et commande la
 * lecture côté syndic : le fichier est déplacé dans le bucket avant la RPC, et
 * remis en place si celle-ci refuse la correction.
 */
export function useCorrigerPptRapport() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async ({
      rapport,
      copro,
      name,
      type,
    }: {
      rapport: Pick<PptRapport, "id" | "ppt_copro_id" | "storage_path" | "name" | "type">;
      copro: Pick<PptCopro, "id" | "organisation_id">;
      name: string;
      type: TypeRapport;
    }) => {
      const nom = nomFichierSansAccents(name.trim() || rapport.name);
      const bouge = copro.id !== rapport.ppt_copro_id || nom !== rapport.name;
      const chemin = bouge ? cheminDepot(copro.organisation_id, copro.id, nom) : rapport.storage_path;
      if (bouge) {
        const { error } = await supabase.storage.from(BUCKET).move(rapport.storage_path, chemin);
        if (error) throw error;
      }
      const { error } = await supabase.rpc("ppt_corriger_rapport", {
        p_rapport_id: rapport.id,
        p_copro_id: copro.id,
        p_name: nom,
        p_type: type,
        p_storage_path: chemin,
      });
      if (error) {
        // la base a refusé : le fichier retourne à sa place pour rester lisible
        if (bouge) await supabase.storage.from(BUCKET).move(chemin, rapport.storage_path);
        throw error;
      }
    },
    onSuccess: refresh,
  });
}

/** Qui a déposé chaque document du dossier (0082) : la RLS de profiles ne laisse
 *  lire que son propre profil, le nom passe donc par une RPC security definer. */
export function usePptDeposants(coproId: string | undefined) {
  return useQuery({
    queryKey: ["ppt", "deposants", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<Map<string, { nom: string | null; email: string | null }>> => {
      const { data, error } = await supabase.rpc("ppt_deposants", { p_copro: coproId! });
      if (error) throw error;
      return new Map((data ?? []).map((d) => [d.rapport_id, { nom: d.nom, email: d.email }]));
    },
  });
}

/** Suppression d'un document déposé (0082) : la ligne part avec son fichier.
 *  Réservée au déposant et à l'équipe Strat Eco, interdite sur un rapport validé. */
export function useSupprimerPptRapport() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async (rapportId: string) => {
      const { data: chemin, error } = await supabase.rpc("ppt_supprimer_rapport", { p_rapport_id: rapportId });
      if (error) throw error;
      // le fichier suit ; un échec ici ne laisse qu'un fichier orphelin, jamais une ligne cassée
      if (chemin) {
        const { error: eSt } = await supabase.storage.from(BUCKET).remove([chemin]);
        if (eSt) console.warn("ppt-files : fichier non retiré", eSt);
      }
    },
    onSuccess: refresh,
  });
}

/** URL signée (5 min) d'un document du bucket ppt-files. */
export async function urlSigneePpt(path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300, download ? { download: nomFichierSansAccents(download) } : undefined);
  if (error || !data) throw error ?? new Error("URL de document indisponible");
  return data.signedUrl;
}

export async function telechargerPptRapport(r: Pick<PptRapport, "storage_path" | "name">) {
  const a = document.createElement("a");
  a.href = await urlSigneePpt(r.storage_path, r.name);
  a.download = r.name;
  a.target = "_blank";
  a.click();
}

/** Alerte e-mail (edge function notifier-ppt) - best effort, jamais bloquant. */
export async function notifierPpt(type: "depot" | "valide" | "rejete", rapport_id: string): Promise<void> {
  try {
    await supabase.functions.invoke("notifier-ppt", { body: { type, rapport_id } });
  } catch (e) {
    console.warn("notifier-ppt :", e);
  }
}

// ========== Analyse, revue et validation (dirigeant) ==========

export function usePptAnalyse(rapportId: string | undefined) {
  return useQuery({
    queryKey: ["ppt", "analyse", rapportId],
    enabled: !!rapportId,
    queryFn: async (): Promise<PptAnalyse | null> => {
      const { data, error } = await supabase.from("ppt_analyses").select("*").eq("rapport_id", rapportId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useImporterAnalyse() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async ({ rapportId, json }: { rapportId: string; json: PpptVerifJson }) => {
      const { error } = await supabase.rpc("ppt_importer_analyse", { p_rapport_id: rapportId, p_json: json as unknown as Json, p_mode: "manuel_skill" });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useEnregistrerRevue() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async ({ rapportId, json, corrections }: { rapportId: string; json: PpptVerifJson; corrections: CorrectionJson[] }) => {
      const { error } = await supabase.rpc("ppt_enregistrer_revue", {
        p_rapport_id: rapportId,
        p_json_corrige: json as unknown as Json,
        p_corrections: corrections as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useValiderRapport() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async ({ rapportId, levees }: { rapportId: string; levees: string[] }) => {
      const { error } = await supabase.rpc("ppt_valider_rapport", { p_rapport_id: rapportId, p_levees: levees as unknown as Json });
      if (error) throw error;
      void notifierPpt("valide", rapportId);
    },
    onSuccess: refresh,
  });
}

export function useRejeterRapport() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async ({ rapportId, motif }: { rapportId: string; motif: string }) => {
      const { error } = await supabase.rpc("ppt_rejeter_rapport", { p_rapport_id: rapportId, p_motif: motif });
      if (error) throw error;
      void notifierPpt("rejete", rapportId);
    },
    onSuccess: refresh,
  });
}

export function usePptCorrections(rapportId: string | undefined) {
  return useQuery({
    queryKey: ["ppt", "corrections", rapportId],
    enabled: !!rapportId,
    queryFn: async (): Promise<PptCorrection[]> => {
      const { data, error } = await supabase.from("ppt_corrections").select("*").eq("rapport_id", rapportId!).order("le", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePptTraitements(rapportId: string | undefined) {
  return useQuery({
    queryKey: ["ppt", "traitements", rapportId],
    enabled: !!rapportId,
    queryFn: async (): Promise<PptTraitement[]> => {
      const { data, error } = await supabase.from("ppt_traitements").select("*").eq("rapport_id", rapportId!).order("demarre_le", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ========== Postes, AG, remarques, journal ==========

export function usePptPostes(coproIds: string[]) {
  return useQuery({
    queryKey: ["ppt", "postes", cleIds(coproIds)],
    enabled: coproIds.length > 0,
    queryFn: async (): Promise<PptPoste[]> => {
      const { data, error } = await supabase.from("ppt_postes").select("*").in("ppt_copro_id", coproIds).order("annee_prevue").order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Retouche d'un poste après validation (dirigeant) : statut, année, commentaire. */
export function useMajPptPoste() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Pick<PptPoste, "statut" | "annee_prevue" | "annee_prochaine_presentation" | "commentaire" | "cout_ht_base" | "libelle" | "actif">> & { id: string }) => {
      const { error } = await supabase.from("ppt_postes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

/** Suivi de l'échéancier (syndic) : décale des postes vers une autre année - RPC 0073, journalisé. */
export function useDecalerPptPostes() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async (decalages: { poste_id: string; annee: number }[]): Promise<number> => {
      const { data, error } = await supabase.rpc("ppt_decaler_postes", { p_decalages: decalages as unknown as Json });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: refresh,
  });
}

/** Montant TTC saisi à la main + commentaire (syndic) ; montant null = retour au calcul - RPC 0074. */
export function useSaisirMontantPoste() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async ({ poste_id, montant, commentaire }: { poste_id: string; montant: number | null; commentaire: string | null }) => {
      const { error } = await supabase.rpc("ppt_saisir_montant_poste", { p_poste_id: poste_id, p_montant: montant, p_commentaire: commentaire });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

/** Ligne ajoutée par le syndic au suivi de l'échéancier - RPC 0074. */
export function useAjouterPoste() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async (l: { copro_id: string; libelle: string; priorite: PrioriteCode; annee: number | null; montant: number | null; commentaire: string | null }): Promise<string> => {
      const { data, error } = await supabase.rpc("ppt_ajouter_poste", { p_copro_id: l.copro_id, p_libelle: l.libelle, p_priorite: l.priorite, p_annee: l.annee, p_montant: l.montant, p_commentaire: l.commentaire });
      if (error) throw error;
      return data;
    },
    onSuccess: refresh,
  });
}

/** Retrait (archivage) d'une ligne ajoutée par le syndic - RPC 0074. */
export function useRetirerPoste() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async (poste_id: string) => {
      const { error } = await supabase.rpc("ppt_retirer_poste", { p_poste_id: poste_id });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function usePptAgs(coproIds: string[]) {
  return useQuery({
    queryKey: ["ppt", "ags", cleIds(coproIds)],
    enabled: coproIds.length > 0,
    queryFn: async (): Promise<PptAg[]> => {
      const { data, error } = await supabase.from("ppt_ag").select("*").in("ppt_copro_id", coproIds).order("date_ag", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePptResolutions(agIds: string[]) {
  return useQuery({
    queryKey: ["ppt", "resolutions", cleIds(agIds)],
    enabled: agIds.length > 0,
    queryFn: async (): Promise<PptResolution[]> => {
      const { data, error } = await supabase.from("ppt_resolutions").select("*").in("ag_id", agIds).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface ResolutionSaisie {
  poste_id: string | null;
  intitule: string;
  article: PptResolution["article"];
  montant_vote: number | null;
  issue: PptResolution["issue"];
  voix_pour?: number | null;
  voix_contre?: number | null;
  abstentions?: number | null;
}

/** Saisie d'une AG et de ses résolutions (gestionnaire ou direction) ; le trigger met à jour les postes. */
export function useSaisirAg() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async ({ ppt_copro_id, date_ag, type, notes, resolutions, pv_rapport_id }: { ppt_copro_id: string; date_ag: string; type: PptAg["type"]; notes?: string | null; pv_rapport_id?: string | null; resolutions: ResolutionSaisie[] }) => {
      const { data: session } = await supabase.auth.getSession();
      const { data: ag, error } = await supabase
        .from("ppt_ag")
        .insert({ ppt_copro_id, date_ag, type, notes: notes ?? null, pv_rapport_id: pv_rapport_id ?? null, saisi_par: session.session?.user.id ?? null })
        .select()
        .single();
      if (error) throw error;
      if (resolutions.length) {
        const { error: e2 } = await supabase.from("ppt_resolutions").insert(resolutions.map((r) => ({ ...r, ag_id: ag.id })));
        if (e2) throw e2;
      }
      return ag;
    },
    onSuccess: refresh,
  });
}

export function useSupprimerAg() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ppt_ag").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function usePptRemarques(coproId: string | undefined) {
  return useQuery({
    queryKey: ["ppt", "remarques", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<PptRemarque[]> => {
      const { data, error } = await supabase.from("ppt_remarques").select("*").eq("ppt_copro_id", coproId!).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMajPptRemarque() {
  const refresh = useRefreshPpt();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Pick<PptRemarque, "visible_syndic" | "traitee">> & { id: string }) => {
      const { error } = await supabase.from("ppt_remarques").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function usePptJournal(coproId: string | undefined) {
  return useQuery({
    queryKey: ["ppt", "journal", coproId],
    enabled: !!coproId,
    queryFn: async (): Promise<PptJournal[]> => {
      const { data, error } = await supabase.from("ppt_journal").select("*").eq("ppt_copro_id", coproId!).order("le", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Membres d'une enseigne (comparatif « équipés / non équipés » de la vue Dirigeant).
 *  RPC security definer : la RLS d'organisation_membres ne laisse lire que sa propre
 *  ligne ; la direction de l'enseigne et l'AMO obtiennent la liste complète. */
export function usePptMembresEnseigne(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ["ppt", "membres", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<{ user_id: string; nom: string; email: string | null; org_role: string }[]> => {
      const { data, error } = await supabase.rpc("ppt_membres_enseigne", { p_org: orgId! });
      if (error) throw error;
      return (data ?? []).map((m) => ({ user_id: m.user_id, nom: m.nom ?? "-", email: m.email ?? null, org_role: m.org_role }));
    },
  });
}
