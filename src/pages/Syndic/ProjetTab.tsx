// Onglet Projet (syndic) - vos actions par phase : assemblées, comptes d'aides,
// validations, registre, PV, DO. Tâches persistées (migration 0047) : cochez
// directement dans le kanban, l'échéance se règle depuis « Vos tâches ».
import { Badge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PHASES } from "@/lib/referentiels";
import { fmtDate } from "@/lib/format";
import { enRetard, useSyndicTaches, useToggleSyndicTache } from "@/api/syndicTaches";
import type { SyndicCopro } from "@/api/syndic";

export function ProjetTabSyndic({ c }: { c: SyndicCopro }) {
  const { data: taches, isLoading } = useSyndicTaches([c.id]);
  const toggle = useToggleSyndicTache();

  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  return (
    <div className="fade">
      <div className="tkanban">
        {PHASES.map((ph, i) => {
          const list = (taches ?? []).filter((t) => t.phase === ph.id).sort((a, b) => a.ordre - b.ordre);
          const cur = c.phase === ph.id;
          const doneN = list.filter((t) => t.statut === "done").length;
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
                {list.map((t) => {
                  const done = t.statut === "done";
                  const retard = enRetard(t);
                  return (
                    <div key={t.id} className={"task-card" + (done ? " done" : "")}>
                      <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                        <input
                          type="checkbox"
                          checked={done}
                          disabled={toggle.isPending}
                          title={done ? "Repasser la tâche à faire" : "Marquer la tâche comme faite"}
                          style={{ width: 15, height: 15, flex: "none", marginTop: 2, accentColor: "var(--color-primary-700)", cursor: "pointer" }}
                          onChange={(e) => void toggle.mutateAsync({ tache: t, done: e.target.checked })}
                        />
                        <div className="tt">{t.titre}</div>
                      </div>
                      {(t.tag || t.echeance || retard) && (
                        <div className="task-foot">
                          {t.tag && <Badge kind={t.tag === "Aides" ? "blue" : "primary"}>{t.tag}</Badge>}
                          {retard && <Badge kind="warn" dot>En retard</Badge>}
                          {t.echeance && !done && (
                            <span className="due" style={retard ? { color: "var(--color-error-700)" } : undefined}>
                              <Icon name="calendar" size={13} />
                              {fmtDate(t.echeance)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 14 }}>
        Vos actions de syndic sur ce dossier, phase par phase - cochez ce qui est fait, les échéances se
        fixent depuis la page « Vos tâches ». Le pilotage détaillé du projet est assuré par l'équipe Strat Eco.
      </p>
    </div>
  );
}
