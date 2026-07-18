// Onglet Projet — kanban de tâches par phase, porté de detail.jsx (ProjetTab/TaskCard).
// En plus de la maquette : statut cliquable (todo → doing → done) et assignation réelle.
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { PHASES } from "@/lib/referentiels";
import { useTaches, useUpdateTache, type Tache } from "@/api/taches";
import { useTeamProfiles } from "@/api/profiles";
import type { CoproWithStats } from "@/api/copros";

const NEXT_STATUS = { todo: "doing", doing: "done", done: "todo" } as const;

export function StatusDot({ status, onClick }: { status: Tache["status"]; onClick?: () => void }) {
  const cls = status === "done" ? " done" : status === "doing" ? " doing" : " todo";
  return (
    <span
      className={"status-dot" + cls}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      title={onClick ? "Changer le statut" : undefined}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      {status === "done" && <Icon name="check" size={11} />}
    </span>
  );
}

function TaskCard({ task, coproId }: { task: Tache; coproId: string }) {
  const update = useUpdateTache(coproId);
  const { data: team } = useTeamProfiles();
  return (
    <div className={"task-card" + (task.status === "done" ? " done" : "")}>
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
        <StatusDot status={task.status} onClick={() => update.mutate({ id: task.id, status: NEXT_STATUS[task.status] })} />
        <div className="tt">
          {task.title}
          {task.jalon && (
            <span className="jalon" title={"Jalon de facturation " + task.jalon}>
              {task.jalon}
            </span>
          )}
        </div>
      </div>
      <div className="task-foot">
        {task.tag && (
          <Badge kind={task.tag === "CEE" || task.tag === "Finance" || task.tag === "Éco-PTZ" ? "blue" : "primary"}>
            {task.tag}
          </Badge>
        )}
        {task.due_label && (
          <span className="due">
            <Icon name="calendar" size={13} />
            {task.due_label}
          </span>
        )}
        <span className="spacer"></span>
        <select
          value={task.assignee_user_id ?? ""}
          onChange={(e) => update.mutate({ id: task.id, assignee_user_id: e.target.value || null })}
          title="Assigner"
          style={{
            border: "none",
            background: "transparent",
            fontSize: 12,
            color: "var(--fg-muted)",
            cursor: "pointer",
            maxWidth: 90,
          }}
        >
          <option value="">—</option>
          {(team ?? []).map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.initials}
            </option>
          ))}
        </select>
        {task.assignee && <Avatar who={task.assignee.initials} name={task.assignee.full_name} sm />}
      </div>
    </div>
  );
}

export function ProjetTab({ c }: { c: CoproWithStats }) {
  const { data: taches, isLoading } = useTaches(c.id);
  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;
  return (
    <div className="tkanban fade">
      {PHASES.map((ph, i) => {
        const list = (taches ?? []).filter((t) => t.phase === ph.id);
        const cur = c.phase === ph.id;
        const doneN = list.filter((t) => t.status === "done").length;
        return (
          <section key={ph.id}>
            <div className={"tcol-head" + (cur ? " cur" : "")}>
              <span className="num">{String(i + 1).padStart(2, "0")}</span>
              <span className="lbl">{ph.label}</span>
              {cur && (
                <Badge kind="primary" dot>
                  En cours
                </Badge>
              )}
              <span className="spacer" style={{ flex: 1 }}></span>
              <span style={{ fontSize: 12, color: "var(--fg-muted)", fontWeight: 600 }}>
                {doneN}/{list.length}
              </span>
            </div>
            <div className="tcol-body">
              {list.map((t) => (
                <TaskCard key={t.id} task={t} coproId={c.id} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
