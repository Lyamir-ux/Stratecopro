// Onglet Projet - kanban de tâches par phase, porté de detail.jsx (ProjetTab/TaskCard).
// En plus de la maquette : statut cliquable (todo → doing → done), assignation
// réelle, documents liés à l'étape (dossiers de l'onglet Fichiers) et note
// libre par étape.
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { PHASES, type PhaseId } from "@/lib/referentiels";
import { useTaches, useUpdateTache, type Tache } from "@/api/taches";
import { useTeamProfiles } from "@/api/profiles";
import { downloadFichier, useFichiers, type Fichier } from "@/api/fichiers";
import { DOSSIERS_PAR_PHASE, usePhaseNotes, useSavePhaseNote } from "@/api/phaseNotes";
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
          <option value="">-</option>
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

/** Documents liés à l'étape (dossiers de l'onglet Fichiers rattachés à la
 *  phase) + note libre de l'étape - repliés par défaut pour garder le kanban lisible. */
function PhaseExtras({
  coproId,
  phase,
  fichiers,
  note,
}: {
  coproId: string;
  phase: PhaseId;
  fichiers: Fichier[];
  note: string;
}) {
  const save = useSavePhaseNote(coproId);
  const [openDocs, setOpenDocs] = useState(false);
  const [openNote, setOpenNote] = useState(false);
  const [draft, setDraft] = useState(note);
  // la note arrive après le premier rendu (requête) : resynchroniser le brouillon
  useEffect(() => setDraft(note), [note]);
  const dirty = draft !== note;

  return (
    <div style={{ padding: "0 2px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <button
          className="cs-cand-toggle"
          style={{ fontSize: 12 }}
          onClick={() => setOpenDocs((v) => !v)}
          title={"Dossiers liés : " + DOSSIERS_PAR_PHASE[phase].join(", ")}
        >
          <Icon name="fileText" size={13} />
          {fichiers.length} document{fichiers.length > 1 ? "s" : ""}
          <Icon name={openDocs ? "chevronDown" : "chevronRight"} size={12} />
        </button>
        <button className="cs-cand-toggle" style={{ fontSize: 12 }} onClick={() => setOpenNote((v) => !v)}>
          <Icon name="message" size={13} />
          Note {note.trim() ? "•" : ""}
          <Icon name={openNote ? "chevronDown" : "chevronRight"} size={12} />
        </button>
      </div>
      {openDocs && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {fichiers.length === 0 && (
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
              Aucun document dans les dossiers de cette étape ({DOSSIERS_PAR_PHASE[phase].join(", ")}).
            </span>
          )}
          {fichiers.map((f) => (
            <button
              key={f.id}
              className="se-btn se-btn-ghost btn-sm"
              style={{ justifyContent: "flex-start", fontSize: 12, padding: "3px 6px" }}
              title={`${f.dossier} - ouvrir ${f.name}`}
              onClick={() => void downloadFichier(f)}
            >
              <Icon name="fileText" size={12} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
            </button>
          ))}
        </div>
      )}
      {openNote && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            className="cs-textarea"
            rows={3}
            style={{ fontSize: 12.5 }}
            placeholder="Note de l'étape - points d'attention, décisions, contexte…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          ></textarea>
          <button
            className="se-btn se-btn-secondary btn-sm"
            style={{ alignSelf: "flex-end" }}
            disabled={!dirty || save.isPending}
            onClick={() => void save.mutateAsync({ phase, body: draft })}
          >
            <Icon name="check" size={13} />
            {save.isPending ? "Enregistrement…" : dirty ? "Enregistrer la note" : "Enregistrée"}
          </button>
        </div>
      )}
    </div>
  );
}

export function ProjetTab({ c }: { c: CoproWithStats }) {
  const { data: taches, isLoading } = useTaches(c.id);
  const { data: fichiers } = useFichiers(c.id);
  const { data: phaseNotes } = usePhaseNotes(c.id);
  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;
  return (
    <div className="tkanban fade">
      {PHASES.map((ph, i) => {
        const list = (taches ?? []).filter((t) => t.phase === ph.id);
        const cur = c.phase === ph.id;
        const doneN = list.filter((t) => t.status === "done").length;
        const docs = (fichiers ?? []).filter((f) => DOSSIERS_PAR_PHASE[ph.id].includes(f.dossier));
        const note = (phaseNotes ?? []).find((n) => n.phase === ph.id)?.body ?? "";
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
            <PhaseExtras coproId={c.id} phase={ph.id} fichiers={docs} note={note} />
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
