// Vos tâches (syndic) - assemblées, comptes d'aides, validations, registre & PV,
// par copropriété et phase (port de SyndicMissions, design-reference/project/syndic.jsx).
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge, PhaseBadge } from "@/components/ui";
import { StatusDot } from "@/pages/CoproDetail/ProjetTab";
import { makeSyndicTasks } from "@/lib/syndicTasks";
import type { SyndicCopro } from "@/api/syndic";

const PHASE_RANK = { diagnostic: 0, etudes: 1, travaux: 2 } as const;

export function TachesSyndic({ copros }: { copros: SyndicCopro[] }) {
  const navigate = useNavigate();

  const groups = copros
    .map((c) => ({
      c,
      tasks: (makeSyndicTasks(c.phase)[c.phase] ?? [])
        .filter((t) => t.status !== "done")
        .sort((a, b) => (a.status === b.status ? 0 : a.status === "doing" ? -1 : 1)),
    }))
    .filter((g) => g.tasks.length > 0)
    .sort((a, b) => PHASE_RANK[b.c.phase] - PHASE_RANK[a.c.phase]);

  const totalDoing = groups.reduce((n, g) => n + g.tasks.filter((t) => t.status === "doing").length, 0);
  const totalTodo = groups.reduce((n, g) => n + g.tasks.filter((t) => t.status === "todo").length, 0);

  return (
    <div className="page fade" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Vos tâches</h1>
          <p className="page-sub">Assemblées, comptes d'aides, validations, registre & PV - par copropriété et phase</p>
        </div>
        <span className="spacer"></span>
        <div className="mt-tally">
          <span><b>{totalDoing}</b> en cours</span>
          <span className="dot"></span>
          <span><b>{totalTodo}</b> à faire</span>
        </div>
      </div>

      {groups.length === 0 && (
        <div className="placeholder-screen" style={{ minHeight: 280 }}>
          <div className="ps-ico"><Icon name="checkCircle" size={30} /></div>
          <h2>Tout est à jour</h2>
          <p>Aucune tâche en attente sur la phase courante de vos copropriétés.</p>
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
              {g.tasks.map((t, i) => (
                <div className="mt-task" key={i} onClick={() => navigate(`/syndic/copros/${g.c.id}`)}>
                  <StatusDot status={t.status} />
                  <span className="mt-task-title">{t.title}</span>
                  <span className="spacer"></span>
                  {t.tag && <Badge kind="primary">{t.tag}</Badge>}
                  {t.status === "doing" && <Badge kind="warn" dot>En cours</Badge>}
                  {t.due && (
                    <span className="due">
                      <Icon name="calendar" size={13} />
                      {t.due}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
