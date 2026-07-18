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
}

export function useCopros() {
  return useQuery({
    queryKey: ["copros"],
    queryFn: async (): Promise<CoproWithStats[]> => {
      const [{ data: copros, error: e1 }, { data: stats, error: e2 }, { data: members, error: e3 }] =
        await Promise.all([
          supabase.from("coproprietes").select("*").order("updated_at", { ascending: false }),
          supabase.from("copro_stats").select("*"),
          supabase.from("copro_members").select("copro_id, user_id, profiles(initials, full_name)"),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      const statsById = new Map((stats ?? []).map((s) => [s.id, s]));
      return (copros ?? []).map((c) => ({
        ...c,
        stats: statsById.get(c.id) ?? null,
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

export interface NewCoproInput {
  name: string;
  city: string;
  quartier: string;
  adresse: string;
  syndic_name: string;
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
        quartier: input.quartier || null,
        adresse: input.adresse || null,
        syndic_name: input.syndic_name || null,
        phase: input.phase,
        energy_before: input.energy_before,
        fragile: input.fragile,
      };
      const { data: copro, error } = await supabase.from("coproprietes").insert(insert).select().single();
      if (error) throw error;

      // Clé de répartition générale par défaut + plan de tâches gabarit + rattachement du créateur
      const [{ error: eCle }, { error: eTaches }] = await Promise.all([
        supabase.from("cles_repartition").insert({
          copro_id: copro.id,
          code: "MUN",
          label: "Tantièmes généraux",
          is_default: true,
        }),
        supabase.from("taches").insert(
          buildTaskTemplate(input.phase).map((t) => ({ ...t, copro_id: copro.id }))
        ),
      ]);
      if (eCle) throw eCle;
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
        supabase.from("coproprietes").select("id, phase"),
        supabase.from("taches").select("copro_id, phase, status").neq("status", "done"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const phaseById = new Map((copros ?? []).map((c) => [c.id, c.phase]));
      return (taches ?? []).filter((t) => phaseById.get(t.copro_id) === t.phase).length;
    },
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
