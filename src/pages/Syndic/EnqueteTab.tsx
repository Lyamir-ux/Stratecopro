// Onglet Enquête sociale (syndic) - consultation seule : répartition des profils
// MPR (comptages uniquement), état des réponses (sans le RFR ni le profil par
// copropriétaire - données sensibles réservées à l'AMO et à l'intéressé),
// questionnaire et état de la campagne. Aucune action possible : l'enquête est
// pilotée par l'AMO (pas de bouton d'envoi ni de saisie côté syndic).
import { useMemo } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { Profil } from "@/lib/finance";
import { useDonnees } from "@/api/donnees";
import { useEnqueteSyndic, useReponsesSyndic, type SyndicCopro } from "@/api/syndic";
import { TYPE_LABELS, normalizeConfig, resolveQuestions } from "@/lib/enqueteCatalogue";

// Libellés grand public (plafonds Anah) - les couleurs MPR restent un simple repère visuel.
const PROFIL_META: { p: Profil; label: string; color: string }[] = [
  { p: "Bleu", label: "Très modeste", color: "#2E6FA8" },
  { p: "Jaune", label: "Modeste", color: "#f2a30d" },
  { p: "Violet", label: "Intermédiaire", color: "#7A5AE0" },
  { p: "Rose", label: "Supérieur", color: "#DC6FA8" },
];

/** « Bailleur » / « Occupant » depuis les codes actuels (bailleur, occupant) ou
 *  les anciens libellés d'enquête (« Proprietaire bailleur (logement loue) »). */
function libelleOccupation(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s.includes("bailleur")) return "Bailleur";
  if (s.includes("occupant")) return "Occupant";
  return null;
}

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
  const questions = enquete ? resolveQuestions(normalizeConfig(enquete.questions)) : [];
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
                Aucune réponse pour l'instant - l'enquête est diffusée par l'équipe Strat Eco.
              </p>
            ) : (
              profilCounts.map((m) => {
                const pct = repondants ? Math.round((m.n / repondants) * 100) : 0;
                return (
                  <div key={m.p} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: m.color }}></span>
                        {m.label}
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
                      <th>Réponse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coproprietaires.map((cp) => {
                      const r = repondus.get(cp.id) ?? null;
                      const repondu = r?.profil_mpr != null;
                      // Bailleur / occupant : statut déclaré dans l'enquête, sinon
                      // celui de la fiche copropriétaire (feedback du 03/09/2026)
                      const occupation = libelleOccupation(r?.statut_occupation ?? cp.type);
                      return (
                        <tr key={cp.id} style={{ cursor: "default" }}>
                          <td style={{ fontWeight: 600 }}>{cp.nom}</td>
                          <td>{r?.nb_personnes != null ? r.nb_personnes + " pers." : "-"}</td>
                          <td>{occupation ?? "-"}</td>
                          <td>
                            {repondu ? (
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
              Le profil MaPrimeRénov' et le revenu fiscal de référence de chaque copropriétaire ne sont pas
              communiqués au syndic - seuls l'AMO et le copropriétaire concerné y ont accès. Le panneau
              ci-dessus n'en donne que les comptages.
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
              <div className="q-list" style={{ maxHeight: 420, overflowY: "auto" }}>
                {questions
                  .filter((q) => q.on)
                  .map((q, i) => (
                    <div key={q.id} className="q-row">
                      <span className="q-num">{i + 1}</span>
                      <div className="q-main">
                        <div className="q-label">{q.q}</div>
                        <div className="q-type">{q.tag} · {TYPE_LABELS[q.type]}</div>
                      </div>
                      <div className="q-badges">
                        {q.locked && <Badge kind="neutral">Socle</Badge>}
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
