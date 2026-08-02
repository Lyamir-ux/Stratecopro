// Onglet Enquête sociale (syndic) — consultation seule : profils MPR, réponses
// (sans le RFR — donnée sensible réservée à l'AMO et à l'intéressé),
// questionnaire et état de la campagne. Aucune action possible : l'enquête est
// pilotée par l'AMO (pas de bouton d'envoi ni de saisie côté syndic).
import { useMemo } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { Profil } from "@/lib/finance";
import { useDonnees } from "@/api/donnees";
import { useEnqueteSyndic, useReponsesSyndic, type SyndicCopro } from "@/api/syndic";
import type { Question } from "@/api/enquete";

const PROFIL_META: { p: Profil; color: string }[] = [
  { p: "Bleu", color: "#2E6FA8" },
  { p: "Jaune", color: "#f2a30d" },
  { p: "Violet", color: "#7A5AE0" },
  { p: "Rose", color: "#DC6FA8" },
];

export function EnqueteTabSyndic({ c }: { c: SyndicCopro }) {
  const { data: enquete, isLoading } = useEnqueteSyndic(c.id);
  const { data: reponses } = useReponsesSyndic(c.id);
  const { data: donnees } = useDonnees(c.id);

  const coproprietaires = donnees?.coproprietaires ?? [];
  const total = coproprietaires.length;
  const repondus = useMemo(
    () => new Map((reponses ?? []).map((r) => [r.coproprietaire_id, r])),
    [reponses]
  );
  const repondants = (reponses ?? []).filter((r) => r.profil_mpr != null).length;
  const sent = enquete?.statut === "envoyee";
  const questions: Question[] = (enquete?.questions as unknown as Question[]) ?? [];
  const activeCount = questions.filter((q) => q.on).length;

  const profilCounts = PROFIL_META.map((m) => ({
    ...m,
    n: (reponses ?? []).filter((r) => r.profil_mpr === m.p).length,
  }));

  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  return (
    <div className="detail-grid fade">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head">
            <Icon name="users" size={18} />
            <h3>Profils MaPrimeRénov'</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              {repondants}/{total} répondants
            </span>
          </div>
          <div className="p-body">
            {repondants === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Aucune réponse pour l'instant — l'enquête est diffusée par l'équipe Strat Eco.
              </p>
            ) : (
              profilCounts.map((m) => {
                const pct = repondants ? Math.round((m.n / repondants) * 100) : 0;
                return (
                  <div key={m.p} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: m.color }}></span>
                        {m.p}
                      </span>
                      <span style={{ fontWeight: 700 }}>
                        {m.n} · {pct} %
                      </span>
                    </div>
                    <div className="prog">
                      <i style={{ width: pct + "%", background: m.color }}></i>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="panel">
          <div className="p-head">
            <Icon name="eye" size={18} />
            <h3>Réponses des copropriétaires</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>consultation seule</span>
          </div>
          <div className="p-body">
            {total === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Les copropriétaires seront visibles dès leur recensement par l'équipe Strat Eco.
              </p>
            ) : (
              <div className="tablewrap" style={{ maxHeight: 380, overflowY: "auto" }}>
                <table className="dossiers" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Copropriétaire</th>
                      <th>Foyer</th>
                      <th>Occupation</th>
                      <th>Profil</th>
                      <th>Réponse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coproprietaires.map((cp) => {
                      const r = repondus.get(cp.id) ?? null;
                      const profil = (r?.profil_mpr ?? null) as Profil | null;
                      const color = PROFIL_META.find((m) => m.p === profil)?.color;
                      return (
                        <tr key={cp.id} style={{ cursor: "default" }}>
                          <td style={{ fontWeight: 600 }}>{cp.nom}</td>
                          <td>{r?.nb_personnes != null ? r.nb_personnes + " pers." : "—"}</td>
                          <td>
                            {r?.statut_occupation === "occupant"
                              ? "Occupant"
                              : r?.statut_occupation === "bailleur"
                                ? "Bailleur"
                                : "—"}
                          </td>
                          <td>
                            {profil ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13 }}>
                                <span style={{ width: 10, height: 10, borderRadius: "50%", background: color }}></span>
                                {profil}
                              </span>
                            ) : (
                              <span style={{ color: "var(--fg-muted)" }}>—</span>
                            )}
                          </td>
                          <td>
                            {profil ? (
                              <Badge kind="success" dot>Reçue</Badge>
                            ) : (
                              <Badge kind="neutral">En attente</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="se-small" style={{ marginTop: 12, marginBottom: 0, color: "var(--fg-muted)" }}>
              Les revenus fiscaux de référence ne sont pas communiqués au syndic — seuls l'AMO et le
              copropriétaire concerné y ont accès.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head">
            <Icon name="clipboard" size={18} />
            <h3>Campagne d'enquête</h3>
          </div>
          <div className="p-body">
            <div className="kv">
              <span className="k">Statut</span>
              <span className="v">
                <Badge kind={sent ? "success" : "warn"} dot={sent}>
                  {sent ? "Envoyée" : "En préparation"}
                </Badge>
              </span>
            </div>
            {sent && enquete?.sent_at && (
              <div className="kv">
                <span className="k">Préparée le</span>
                <span className="v">{fmtDate(enquete.sent_at)}</span>
              </div>
            )}
            <div className="kv">
              <span className="k">Réponses reçues</span>
              <span className="v">
                {repondants} / {total}
              </span>
            </div>
            <div className="prog" style={{ marginTop: 10 }}>
              <i style={{ width: (total ? Math.round((repondants / total) * 100) : 0) + "%" }}></i>
            </div>
            <p className="se-small" style={{ marginTop: 14, marginBottom: 0, color: "var(--fg-muted)" }}>
              L'enquête sociale est préparée, diffusée et relancée par l'équipe Strat Eco. Cet écran est une
              vue d'information pour le syndic.
            </p>
          </div>
        </div>

        <div className="panel">
          <div className="p-head">
            <Icon name="fileText" size={18} />
            <h3>Questionnaire</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              {activeCount} question{activeCount > 1 ? "s" : ""} active{activeCount > 1 ? "s" : ""}
            </span>
          </div>
          <div className="p-body">
            {questions.length === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Le questionnaire n'a pas encore été configuré par l'équipe Strat Eco.
              </p>
            ) : (
              <div className="q-list">
                {questions.map((q, i) => (
                  <div key={q.id} className={"q-row" + (!q.on ? " off" : "")}>
                    <span className="q-num">{i + 1}</span>
                    <div className="q-main">
                      <div className="q-label">{q.q}</div>
                      <div className="q-type">{q.type}</div>
                    </div>
                    <div className="q-badges">
                      {q.req && <Badge kind="neutral">Obligatoire</Badge>}
                      <Badge kind={q.on ? "success" : "neutral"} dot={q.on}>
                        {q.on ? "Actif" : "Inactif"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
