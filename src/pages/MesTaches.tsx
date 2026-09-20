// Vos tâches - agrégation cross-dossiers des tâches actionnables de la phase courante
// (porté de login.jsx MyTasks, branché sur les vraies tables).
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, PhaseBadge } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { useCopros } from "@/api/copros";
import { PIECES, urlSigneePiece, usePiecesAVerifier } from "@/api/portail";
import { VerificationPiece } from "@/components/VerificationPiece";
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
  // pièces justificatives déposées au portail par les copropriétaires, en
  // attente de vérification par l'équipe (feedback Amir 10/09)
  const { data: piecesAVerifier } = usePiecesAVerifier();
  const ouvrirPiece = (path: string) => {
    void urlSigneePiece(path).then((url) => window.open(url, "_blank", "noopener")).catch(() => undefined);
  };

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

      {(piecesAVerifier ?? []).length > 0 && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="p-head">
            <Icon name="folder" size={18} />
            <h3>Pièces justificatives à vérifier</h3>
            <span style={{ flex: 1 }}></span>
            <Badge kind="warn" dot>
              {piecesAVerifier!.length} pièce{piecesAVerifier!.length > 1 ? "s" : ""}
            </Badge>
          </div>
          <div className="p-body" style={{ paddingTop: 4, display: "flex", flexDirection: "column", gap: 10 }}>
            <p className="se-small" style={{ margin: "0 0 4px", color: "var(--fg-muted)" }}>
              Déposées par les copropriétaires sur leur portail. Ouvrez la pièce (œil), vérifiez lisibilité, pages et
              année, puis qualifiez-la : « Conforme » la valide ; tout autre choix la refuse et envoie aussitôt un
              e-mail au copropriétaire avec le motif.
            </p>
            {piecesAVerifier!.map((p) => (
              <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>{PIECES.find((x) => x.type === p.type)?.name ?? p.type}</span>
                  <span style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>{p.name}</span>
                  <span style={{ flex: 1 }}></span>
                  <button
                    className="se-btn se-btn-ghost btn-sm"
                    title={`Ouvrir la fiche de ${p.coproprietaires?.nom ?? "ce copropriétaire"}`}
                    onClick={() => navigate(`/copros/${p.copro_id}/coproprietaires?cp=${p.coproprietaire_id}`)}
                  >
                    <Icon name="building" size={13} />
                    {p.coproprietes?.name ?? "Dossier"} · {p.coproprietaires?.nom ?? "copropriétaire"}
                  </button>
                  <button className="se-btn se-btn-secondary btn-sm" title="Ouvrir la pièce (aperçu, journalisé)" onClick={() => ouvrirPiece(p.storage_path)}>
                    <Icon name="eye" size={13} />
                    Ouvrir
                  </button>
                </div>
                <div style={{ marginTop: 6 }}>
                  <VerificationPiece key={p.id + p.statut} piece={p} compact />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
