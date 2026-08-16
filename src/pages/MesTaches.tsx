// Vos tâches — agrégation cross-dossiers des tâches actionnables de la phase courante
// (porté de login.jsx MyTasks, branché sur les vraies tables).
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, PhaseBadge } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { useCopros } from "@/api/copros";
import { StatusDot } from "./CoproDetail/ProjetTab";

type TacheRow = Tables<"taches"> & { assignee: { initials: string; full_name: string } | null };

function useAllOpenTasks() {
  return useQuery({
    queryKey: ["all-open-tasks"],
    queryFn: async (): Promise<TacheRow[]> => {
      const { data, error } = await supabase
        .from("taches")
        .select("*, profiles!taches_assignee_user_id_fkey(initials, full_name)")
        .neq("status", "done")
        .order("position");
      if (error) throw error;
      return (data ?? []).map((t) => {
        const { profiles, ...rest } = t as typeof t & { profiles: { initials: string; full_name: string } | null };
        return { ...rest, assignee: profiles };
      });
    },
  });
}

const PHASE_RANK = { diagnostic: 0, etudes: 1, travaux: 2 } as const;

export default function MesTaches() {
  useCrumbs([{ label: "Vos tâches" }]);
  const navigate = useNavigate();
  const { data: copros } = useCopros();
  const { data: tasks } = useAllOpenTasks();

  const groups = (copros ?? [])
    .map((c) => ({
      c,
      tasks: (tasks ?? [])
        .filter((t) => t.copro_id === c.id && t.phase === c.phase)
        .sort((a, b) => (a.status === b.status ? a.position - b.position : a.status === "doing" ? -1 : 1)),
    }))
    .filter((g) => g.tasks.length > 0)
    .sort((a, b) => PHASE_RANK[b.c.phase] - PHASE_RANK[a.c.phase]);

  const totalDoing = groups.reduce((n, g) => n + g.tasks.filter((t) => t.status === "doing").length, 0);
  const totalTodo = groups.reduce((n, g) => n + g.tasks.filter((t) => t.status === "todo").length, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Vos tâches</h1>
          <p className="page-sub">Actions à mener sur vos dossiers, par copropriété et phase d'avancement</p>
        </div>
        <span className="spacer"></span>
        <div className="mt-tally">
          <span>
            <b>{totalDoing}</b> en cours
          </span>
          <span className="dot"></span>
          <span>
            <b>{totalTodo}</b> à faire
          </span>
        </div>
      </div>

      {groups.length === 0 && (
        <div className="placeholder-screen" style={{ minHeight: 280 }}>
          <div className="ps-ico">
            <Icon name="checkCircle" size={30} />
          </div>
          <h2>Tout est à jour</h2>
          <p>Aucune tâche en attente sur la phase courante de vos dossiers.</p>
        </div>
      )}

      <div className="mt-groups">
        {groups.map((g) => (
          <div className="panel mt-card" key={g.c.id}>
            <button className="mt-copro" onClick={() => navigate(`/copros/${g.c.id}`)}>
              <span className="mt-thumb">
                <Icon name="building" size={20} />
              </span>
              <span className="mt-copro-txt">
                <span className="mt-copro-name">{g.c.name}</span>
                <span className="mt-copro-loc">{g.c.adresse || [g.c.code_postal, g.c.city].filter(Boolean).join(" ")}</span>
              </span>
              <PhaseBadge phase={g.c.phase} />
              {g.c.fragile && <Badge kind="warn">Fragile</Badge>}
              <Icon name="chevronRight" size={18} className="mt-go" />
            </button>
            <div className="mt-list">
              {g.tasks.map((t) => (
                <div className="mt-task" key={t.id} onClick={() => navigate(`/copros/${g.c.id}`)}>
                  <StatusDot status={t.status} />
                  <span className="mt-task-title">
                    {t.title}
                    {t.jalon && <span className="jalon">{t.jalon}</span>}
                  </span>
                  <span className="spacer"></span>
                  {t.tag && (
                    <Badge kind={t.tag === "CEE" || t.tag === "Finance" || t.tag === "Éco-PTZ" ? "blue" : "primary"}>{t.tag}</Badge>
                  )}
                  {t.status === "doing" && (
                    <Badge kind="warn" dot>
                      En cours
                    </Badge>
                  )}
                  {t.due_label && (
                    <span className="due">
                      <Icon name="calendar" size={13} />
                      {t.due_label}
                    </span>
                  )}
                  {t.assignee && <Avatar who={t.assignee.initials} name={t.assignee.full_name} sm />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
