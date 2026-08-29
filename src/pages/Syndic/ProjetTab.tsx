// Onglet Projet (syndic) - vos actions par phase : validations, registre,
// fiche État, prêt, DO, appels de fonds. Tâches persistées (migration 0047) :
// la pastille se clique directement dans le kanban (à faire → en cours → fait,
// comme côté AMO), l'échéance se règle depuis « Vos tâches ».
import { Badge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PHASES } from "@/lib/referentiels";
import { fmtDate } from "@/lib/format";
import { StatusDot } from "@/pages/CoproDetail/ProjetTab";
import {
  STATUT_SUIVANT,
  enRetard,
  phaseAvancement,
  useStatutSyndicTache,
  useSyndicTaches,
  type StatutTache,
} from "@/api/syndicTaches";
import type { SyndicCopro } from "@/api/syndic";

export function ProjetTabSyndic({ c }: { c: SyndicCopro }) {
  const { data: taches, isLoading } = useSyndicTaches([c.id]);
  const statutMut = useStatutSyndicTache();

  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  // La pastille « En cours » suit les validations du syndic, comme la couleur
  // des vues du portefeuille (feedbacks 29/08).
  const phaseEnCours = phaseAvancement(c.phase, taches ?? []);

  return (
    <div className="fade">
      <div className="tkanban">
        {PHASES.map((ph, i) => {
          const list = (taches ?? []).filter((t) => t.phase === ph.id).sort((a, b) => a.ordre - b.ordre);
          const cur = ph.id === phaseEnCours;
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
                  const statut = t.statut as StatutTache;
                  const done = statut === "done";
                  const retard = enRetard(t);
                  return (
                    <div key={t.id} className={"task-card" + (done ? " done" : "")}>
                      <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                        <StatusDot
                          status={statut}
                          onClick={() => {
                            if (!statutMut.isPending)
                              void statutMut.mutateAsync({ tache: t, statut: STATUT_SUIVANT[statut] });
                          }}
                        />
                        <div className="tt">{t.titre}</div>
                      </div>
                      {(t.tag || t.echeance || retard || statut === "doing") && (
                        <div className="task-foot">
                          {t.tag && <Badge kind={t.tag === "Aides" ? "blue" : "primary"}>{t.tag}</Badge>}
                          {statut === "doing" && <Badge kind="warn" dot>En cours</Badge>}
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
