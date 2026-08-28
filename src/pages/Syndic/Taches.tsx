// Vos tâches (syndic) - assemblées, comptes d'aides, validations, registre & PV,
// par copropriété et phase. Persistées en base (migration 0047) : le
// gestionnaire coche ce qui est fait et fixe une échéance ; les tâches dont
// l'échéance est dépassée remontent en tête et alimentent le rapport mensuel.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge, PhaseBadge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import {
  PHASE_RANK,
  enRetard,
  useEcheanceSyndicTache,
  useSyndicTaches,
  useToggleSyndicTache,
  type SyndicTache,
} from "@/api/syndicTaches";
import type { SyndicCopro } from "@/api/syndic";

/** Ligne de tâche : case à cocher, libellé, échéance modifiable. */
export function LigneTache({ t, phaseCourante }: { t: SyndicTache; phaseCourante?: boolean }) {
  const toggle = useToggleSyndicTache();
  const setEcheance = useEcheanceSyndicTache();
  const [editDate, setEditDate] = useState(false);
  const retard = enRetard(t);
  const done = t.statut === "done";

  return (
    <div className="mt-task" style={{ cursor: "default", opacity: done ? 0.62 : 1 }}>
      <input
        type="checkbox"
        checked={done}
        disabled={toggle.isPending}
        title={done ? "Repasser la tâche à faire" : "Marquer la tâche comme faite"}
        style={{ width: 16, height: 16, flex: "none", accentColor: "var(--color-primary-700)", cursor: "pointer" }}
        onChange={(e) => void toggle.mutateAsync({ tache: t, done: e.target.checked })}
      />
      <span className="mt-task-title" style={done ? { textDecoration: "line-through" } : undefined}>
        {t.titre}
      </span>
      <span className="spacer"></span>
      {t.tag && <Badge kind={t.tag === "Aides" ? "blue" : "primary"}>{t.tag}</Badge>}
      {phaseCourante === false && <PhaseBadge phase={t.phase} />}
      {retard && <Badge kind="warn" dot>En retard</Badge>}
      {!done &&
        (editDate ? (
          <input
            type="date"
            className="edit-inp"
            style={{ maxWidth: 150, fontSize: 12.5 }}
            defaultValue={t.echeance ?? ""}
            autoFocus
            onBlur={(e) => {
              setEditDate(false);
              const v = e.target.value || null;
              if (v !== t.echeance) void setEcheance.mutateAsync({ tacheId: t.id, echeance: v });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <button
            className="due"
            style={{ background: "none", border: "none", cursor: "pointer", color: retard ? "var(--color-error-700)" : undefined }}
            title="Fixer ou modifier l'échéance de cette tâche"
            onClick={() => setEditDate(true)}
          >
            <Icon name="calendar" size={13} />
            {t.echeance ? fmtDate(t.echeance) : "Échéance"}
          </button>
        ))}
      {done && t.fait_le && (
        <span className="due" title="Date à laquelle la tâche a été cochée">
          <Icon name="check" size={13} />
          {fmtDate(t.fait_le)}
        </span>
      )}
    </div>
  );
}

export function TachesSyndic({ copros }: { copros: SyndicCopro[] }) {
  const navigate = useNavigate();
  const { data: taches, isLoading } = useSyndicTaches(copros.map((c) => c.id));
  const [toutAfficher, setToutAfficher] = useState(false);

  const groups = useMemo(() => {
    const parCopro = new Map<string, SyndicTache[]>();
    for (const t of taches ?? []) parCopro.set(t.copro_id, [...(parCopro.get(t.copro_id) ?? []), t]);
    return copros
      .map((c) => {
        const toutes = (parCopro.get(c.id) ?? []).sort(
          (a, b) => PHASE_RANK[a.phase] - PHASE_RANK[b.phase] || a.ordre - b.ordre
        );
        // par défaut : les tâches restantes des phases atteintes (les phases à
        // venir ne sont pas encore actionnables), les retards toujours en tête
        const visibles = toutAfficher
          ? toutes
          : toutes.filter((t) => t.statut !== "done" && PHASE_RANK[t.phase] <= PHASE_RANK[c.phase]);
        return {
          c,
          tasks: [...visibles].sort((a, b) => Number(enRetard(b)) - Number(enRetard(a))),
        };
      })
      .filter((g) => g.tasks.length > 0)
      .sort((a, b) => PHASE_RANK[b.c.phase] - PHASE_RANK[a.c.phase]);
  }, [copros, taches, toutAfficher]);

  const restantes = (taches ?? []).filter(
    (t) =>
      t.statut !== "done" &&
      PHASE_RANK[t.phase] <= PHASE_RANK[copros.find((c) => c.id === t.copro_id)?.phase ?? "travaux"]
  );
  const nbRetard = restantes.filter(enRetard).length;

  return (
    <div className="page fade" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Vos tâches</h1>
          <p className="page-sub">
            Assemblées, comptes d'aides, validations, registre & PV - cochez ce qui est fait, fixez vos échéances
          </p>
        </div>
        <span className="spacer"></span>
        <div className="mt-tally">
          {nbRetard > 0 && (
            <>
              <span style={{ color: "var(--color-error-700)" }}><b>{nbRetard}</b> en retard</span>
              <span className="dot"></span>
            </>
          )}
          <span><b>{restantes.length}</b> à faire</span>
        </div>
        <div className="opt-mini">
          <button className={!toutAfficher ? "on" : ""} onClick={() => setToutAfficher(false)}>
            À faire
          </button>
          <button className={toutAfficher ? "on" : ""} onClick={() => setToutAfficher(true)}>
            Tout
          </button>
        </div>
      </div>

      {isLoading && <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>}

      {!isLoading && groups.length === 0 && (
        <div className="placeholder-screen" style={{ minHeight: 280 }}>
          <div className="ps-ico"><Icon name="checkCircle" size={30} /></div>
          <h2>Tout est à jour</h2>
          <p>Aucune tâche en attente sur les phases atteintes de vos copropriétés.</p>
        </div>
      )}

      <div className="mt-groups">
        {groups.map((g) => (
          <div className="panel mt-card" key={g.c.id}>
            <button className="mt-copro" onClick={() => navigate(`/syndic/copros/${g.c.id}`)}>
              <span className="mt-thumb"><Icon name="building" size={20} /></span>
              <span className="mt-copro-txt">
                <span className="mt-copro-name">{g.c.name}</span>
                <span className="mt-copro-loc">
                  {g.c.adresse || [g.c.code_postal, g.c.city].filter(Boolean).join(" ")}
                </span>
              </span>
              <PhaseBadge phase={g.c.phase} />
              {g.c.fragile && <Badge kind="warn">Fragile</Badge>}
              <Icon name="chevronRight" size={18} className="mt-go" />
            </button>
            <div className="mt-list">
              {g.tasks.map((t) => (
                <LigneTache key={t.id} t={t} phaseCourante={t.phase === g.c.phase} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
