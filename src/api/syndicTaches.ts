// Tâches du syndic persistées (migration 0047) - registre, AG, PV, comptes
// d'aides, DO… par copropriété et par phase. Le gabarit est semé côté serveur
// (RPC seed_syndic_taches, idempotente) ; le syndic coche et fixe une échéance,
// l'AMO a la main complète. Remplace les repères recalculés de lib/syndicTasks.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { PHASES, type PhaseId } from "@/lib/referentiels";

export type SyndicTache = Tables<"syndic_taches">;

export const PHASE_RANK: Record<PhaseId, number> = { diagnostic: 0, etudes: 1, travaux: 2 };

/** Cycle du clic sur la pastille - même enchaînement que les tâches AMO :
 *  à faire → en cours (orange) → fait (vert) → à faire. */
export type StatutTache = "todo" | "doing" | "done";
export const STATUT_SUIVANT: Record<StatutTache, StatutTache> = {
  todo: "doing",
  doing: "done",
  done: "todo",
};

/**
 * Tâches syndic d'un ensemble de copropriétés. Le semis du gabarit est fait
 * juste avant la lecture : idempotent (on conflict do nothing sur
 * (copro_id, cle)), il ne recrée jamais de doublon.
 */
export function useSyndicTaches(coproIds: string[]) {
  return useQuery({
    queryKey: ["syndic-taches", [...coproIds].sort().join(",")],
    enabled: coproIds.length > 0,
    queryFn: async (): Promise<SyndicTache[]> => {
      const { error: seedErr } = await supabase.rpc("seed_syndic_taches", { p_copro_ids: coproIds });
      if (seedErr) throw seedErr;
      const { data, error } = await supabase
        .from("syndic_taches")
        .select("*")
        .in("copro_id", coproIds)
        .order("phase")
        .order("ordre");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Change le statut d'une tâche (fait_par et fait_le tracés au passage à « fait »). */
export function useStatutSyndicTache() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tache, statut }: { tache: SyndicTache; statut: StatutTache }) => {
      const { data: session } = await supabase.auth.getSession();
      const done = statut === "done";
      const { error } = await supabase
        .from("syndic_taches")
        .update({
          statut,
          fait_par: done ? (session.session?.user.id ?? null) : null,
          fait_le: done ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tache.id);
      if (error) throw error;
    },
    onSuccess: (_r) => {
      void qc.invalidateQueries({ queryKey: ["syndic-taches"] });
      // l'avancement affiché (copro_stats) suit le nombre de tâches faites
      void qc.invalidateQueries({ queryKey: ["syndic", "copros"] });
      void qc.invalidateQueries({ queryKey: ["syndic", "copro"] });
    },
  });
}

/** Fixe (ou efface) l'échéance d'une tâche. */
export function useEcheanceSyndicTache() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tacheId, echeance }: { tacheId: string; echeance: string | null }) => {
      const { error } = await supabase
        .from("syndic_taches")
        .update({ echeance, updated_at: new Date().toISOString() })
        .eq("id", tacheId);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["syndic-taches"] }),
  });
}

/**
 * Phase d'avancement d'un dossier d'après les validations du syndic : première
 * phase dont les tâches ne sont pas toutes faites. Tout est fait : dernière
 * phase à tâches ; aucune tâche (gabarit pas encore semé) : phase du dossier.
 * Sert à toutes les vues du syndic (bulles, kanban, tableau, fiche) pour que
 * couleur et pastille « En cours » racontent la même chose (feedbacks 29/08).
 */
export function phaseAvancement(phaseDossier: PhaseId, taches: SyndicTache[]): PhaseId {
  const listes = PHASES.map((ph) => taches.filter((t) => t.phase === ph.id));
  const i = listes.findIndex((l) => l.length > 0 && l.some((t) => t.statut !== "done"));
  if (i !== -1) return PHASES[i].id;
  const j = listes.map((l) => l.length > 0).lastIndexOf(true);
  return j !== -1 ? PHASES[j].id : phaseDossier;
}

/** Une tâche est en retard : non faite et échéance dépassée. */
export function enRetard(t: Pick<SyndicTache, "statut" | "echeance">): boolean {
  if (t.statut === "done" || !t.echeance) return false;
  return t.echeance < new Date().toISOString().slice(0, 10);
}
