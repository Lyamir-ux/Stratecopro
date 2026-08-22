import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert } from "@/lib/database.types";
import { buildTaskTemplate } from "@/lib/taskTemplate";
import type { PhaseId } from "@/lib/referentiels";

export type CoproRow = Tables<"coproprietes">;
export type CoproStats = Tables<"copro_stats">;

export interface CoproWithStats extends CoproRow {
  stats: CoproStats | null;
  team: { user_id: string; initials: string; full_name: string }[];
  /** Enseigne de gestion rattachée au dossier (null si le dossier est isolé). */
  organisation: { id: string; nom: string } | null;
}

export function useCopros() {
  return useQuery({
    queryKey: ["copros"],
    queryFn: async (): Promise<CoproWithStats[]> => {
      const [{ data: copros, error: e1 }, { data: stats, error: e2 }, { data: members, error: e3 }] =
        await Promise.all([
          supabase
            .from("coproprietes")
            .select("*, organisations(id, nom)")
            .is("deleted_at", null)
            .order("updated_at", { ascending: false }),
          supabase.from("copro_stats").select("*"),
          supabase.from("copro_members").select("copro_id, user_id, profiles(initials, full_name)"),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      const statsById = new Map((stats ?? []).map((s) => [s.id, s]));
      return (copros ?? []).map(({ organisations, ...c }) => ({
        ...c,
        stats: statsById.get(c.id) ?? null,
        organisation: organisations ?? null,
        team: (members ?? [])
          .filter((m) => m.copro_id === c.id)
          .map((m) => ({
            user_id: m.user_id,
            initials: m.profiles?.initials ?? "?",
            full_name: m.profiles?.full_name ?? "",
          })),
      }));
    },
  });
}

/**
 * Nombre de logements d'un dossier : les lots à usage d'habitation une fois le
 * tableau des lots importé, sinon le nombre déclaré au portefeuille. Les caves,
 * garages et parkings ne comptent pas - un dossier se raisonne en logements.
 */
export function nbLogements(c: {
  nb_logements: number | null;
  stats: { lots_hab: number | null } | null;
}): number {
  return c.stats?.lots_hab || c.nb_logements || 0;
}

export interface NewCoproInput {
  name: string;
  city: string;
  code_postal: string;
  adresse: string;
  /** Nombre de bâtiments déclaré - fait foi même si l'import des lots en référence d'autres. */
  nb_batiments: number;
  /** Adresse de chaque bâtiment (utilisé quand nb_batiments > 1). */
  batiment_adresses: string[];
  syndic_name: string;
  gestionnaire_nom: string;
  gestionnaire_email: string;
  /** Nombre de logements déclaré au portefeuille, avant l'import des lots. */
  nb_logements: number | null;
  /** Chef de projet AMO en clair - il n'a pas forcément de compte sur le progiciel. */
  chef_projet: string;
  phase: PhaseId;
  energy_before: string | null;
  fragile: boolean;
}

export function useCreateCopro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewCoproInput) => {
      const insert: TablesInsert<"coproprietes"> = {
        name: input.name,
        slug: input.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, ""),
        city: input.city || null,
        code_postal: input.code_postal || null,
        adresse: input.adresse || null,
        syndic_name: input.syndic_name || null,
        gestionnaire_nom: input.gestionnaire_nom || null,
        gestionnaire_email: input.gestionnaire_email || null,
        nb_logements: input.nb_logements,
        chef_projet: input.chef_projet || null,
        phase: input.phase,
        energy_before: input.energy_before,
        fragile: input.fragile,
      };
      const { data: copro, error } = await supabase.from("coproprietes").insert(insert).select().single();
      if (error) throw error;

      // Bâtiments déclarés à la création - ils font foi et ne sont pas supprimés
      // par le ménage de l'import des lots, même si le fichier en référence d'autres.
      const nbBats = Math.max(1, Math.floor(input.nb_batiments) || 1);
      const { error: eBats } = await supabase.from("batiments").insert(
        Array.from({ length: nbBats }, (_, i) => ({
          copro_id: copro.id,
          code: String(i + 1).padStart(2, "0"),
          adresse: nbBats > 1 ? input.batiment_adresses[i]?.trim() || null : null,
          position: i,
          declare_creation: true,
        }))
      );
      if (eBats) throw eBats;

      // Plan de tâches gabarit + rattachement du créateur.
      // (Pas de clé de répartition créée d'office : les clés sont reprises
      // des en-têtes du fichier lors de l'import des lots & tantièmes.)
      const { error: eTaches } = await supabase.from("taches").insert(
        buildTaskTemplate(input.phase).map((t) => ({ ...t, copro_id: copro.id }))
      );
      if (eTaches) throw eTaches;

      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (uid) {
        await supabase.from("copro_members").insert({ copro_id: copro.id, user_id: uid, member_role: "amo_referent" });
      }
      return copro;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["copros"] }),
  });
}

/** Nombre de tâches actionnables (phase courante, non terminées) tous dossiers. */
export function useTasksCount() {
  return useQuery({
    queryKey: ["tasks-count"],
    queryFn: async () => {
      const [{ data: copros, error: e1 }, { data: taches, error: e2 }] = await Promise.all([
        supabase.from("coproprietes").select("id, phase").is("deleted_at", null),
        supabase.from("taches").select("copro_id, phase, status").neq("status", "done"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const phaseById = new Map((copros ?? []).map((c) => [c.id, c.phase]));
      return (taches ?? []).filter((t) => phaseById.get(t.copro_id) === t.phase).length;
    },
  });
}

/** Un dossier copropriété complet (fiche + stats + équipe). */
export function useCopro(id: string | undefined) {
  return useQuery({
    queryKey: ["copro", id],
    enabled: !!id,
    queryFn: async (): Promise<CoproWithStats> => {
      const [{ data: copro, error: e1 }, { data: stats, error: e2 }, { data: members, error: e3 }] =
        await Promise.all([
          supabase.from("coproprietes").select("*, organisations(id, nom)").eq("id", id!).single(),
          supabase.from("copro_stats").select("*").eq("id", id!).maybeSingle(),
          supabase.from("copro_members").select("copro_id, user_id, profiles(initials, full_name)").eq("copro_id", id!),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      const { organisations, ...fiche } = copro;
      return {
        ...fiche,
        organisation: organisations ?? null,
        stats: stats ?? null,
        team: (members ?? []).map((m) => ({
          user_id: m.user_id,
          initials: m.profiles?.initials ?? "?",
          full_name: m.profiles?.full_name ?? "",
        })),
      };
    },
  });
}

export function useUpdateCopro(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<TablesInsert<"coproprietes">>) => {
      const { error } = await supabase.from("coproprietes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["copro", id] });
      void qc.invalidateQueries({ queryKey: ["copros"] });
    },
  });
}

/** Téléverse la photo du dossier dans le bucket privé et met à jour photo_path. */
export function useUploadPhoto(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${id}/hero.${ext}`;
      const { error: eUp } = await supabase.storage.from("copro-photos").upload(path, file, { upsert: true });
      if (eUp) throw eUp;
      const { error: eDb } = await supabase.from("coproprietes").update({ photo_path: path }).eq("id", id);
      if (eDb) throw eDb;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["copro", id] });
      void qc.invalidateQueries({ queryKey: ["copros"] });
      void qc.invalidateQueries({ queryKey: ["photo-url"] });
    },
  });
}

// ========== Corbeille des projets ==========
// L'AMO ne supprime jamais un dossier d'un coup : mise à la corbeille
// (deleted_at) d'abord - le dossier disparaît de tous les espaces (RLS) -
// puis restauration ou suppression définitive depuis la corbeille.

/** Les dossiers à la corbeille (AMO uniquement), du plus récent au plus ancien. */
export function useCoprosCorbeille() {
  return useQuery({
    queryKey: ["copros-corbeille"],
    queryFn: async (): Promise<CoproRow[]> => {
      const { data, error } = await supabase
        .from("coproprietes")
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useCorbeilleMutation(mutationFn: (id: string) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["copros"] });
      void qc.invalidateQueries({ queryKey: ["copros-corbeille"] });
      void qc.invalidateQueries({ queryKey: ["tasks-count"] });
    },
  });
}

/** Met le dossier à la corbeille - restaurable tant qu'il n'est pas supprimé définitivement. */
export function useMettreCorbeille() {
  return useCorbeilleMutation(async (id) => {
    const { error } = await supabase
      .from("coproprietes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  });
}

/** Restaure un dossier de la corbeille : il réapparaît dans tous les espaces. */
export function useRestaurerCopro() {
  return useCorbeilleMutation(async (id) => {
    const { error } = await supabase.from("coproprietes").update({ deleted_at: null }).eq("id", id);
    if (error) throw error;
  });
}

/**
 * Suppression définitive : la fiche et toutes ses données liées partent en
 * cascade (lots, enquêtes, plans, fichiers en base…). Les objets du Storage
 * restent orphelins - ils ne sont plus référencés nulle part.
 */
export function useSupprimerDefinitivement() {
  return useCorbeilleMutation(async (id) => {
    const { error } = await supabase.from("coproprietes").delete().eq("id", id);
    if (error) throw error;
  });
}

/** URL signée d'une photo de copropriété (bucket privé). */
export function usePhotoUrl(path: string | null) {
  return useQuery({
    queryKey: ["photo-url", path],
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("copro-photos").createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
