// Onglet Projet (syndic) - vos actions par phase : assemblées, comptes d'aides,
// validations, registre, PV, DO. Lecture seule (repères d'accompagnement).
import { Badge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PHASES } from "@/lib/referentiels";
import { StatusDot } from "@/pages/CoproDetail/ProjetTab";
import { makeSyndicTasks } from "@/lib/syndicTasks";
import type { SyndicCopro } from "@/api/syndic";

export function ProjetTabSyndic({ c }: { c: SyndicCopro }) {
  const tasks = makeSyndicTasks(c.phase);
  return (
    <div className="fade">
      <div className="tkanban">
        {PHASES.map((ph, i) => {
          const list = tasks[ph.id] ?? [];
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
                {list.map((t, j) => (
                  <div key={j} className={"task-card" + (t.status === "done" ? " done" : "")}>
                    <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                      <StatusDot status={t.status} />
                      <div className="tt">{t.title}</div>
                    </div>
                    {(t.tag || t.due) && (
                      <div className="task-foot">
                        {t.tag && <Badge kind={t.tag === "Aides" ? "blue" : "primary"}>{t.tag}</Badge>}
                        {t.due && (
                          <span className="due">
                            <Icon name="calendar" size={13} />
                            {t.due}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 14 }}>
        Vos actions de syndic sur ce dossier, phase par phase. Le pilotage détaillé du projet est assuré par
        l'équipe Strat Eco.
      </p>
    </div>
  );
}
