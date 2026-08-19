// Historique des candidatures du prestataire connecté, avec le statut donné
// par l'AMO (reçue / retenue / non retenue). Candidature retenue : le
// prestataire confirme son engagement — pour une MOE, le projet passe alors
// dans « Mes projets ». Candidature encore à l'étude : retrait possible.
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtEuro, fmtDate } from "@/lib/format";
import { CONSULT_TYPES } from "@/api/consultations";
import {
  useConfirmerEngagement,
  useMesCandidatures,
  useRetirerCandidature,
  type CandidaturePresta,
} from "@/api/espacePrestataire";
import type { Tables } from "@/lib/database.types";

function StatutBadge({ statut }: { statut: CandidaturePresta["statut"] }) {
  if (statut === "retenue") return <Badge kind="success" dot>Retenue</Badge>;
  if (statut === "non_retenue") return <Badge kind="neutral">Non retenue</Badge>;
  return <Badge kind="blue" dot>Reçue — en cours d'analyse</Badge>;
}

export function MesCandidatures({ presta }: { presta: Tables<"prestataires"> }) {
  const { data: candidatures } = useMesCandidatures(presta.id);
  const engager = useConfirmerEngagement();
  const retirer = useRetirerCandidature();
  const list = candidatures ?? [];
  const isMoe = presta.types.includes("moe");

  return (
    <div className="page" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mes candidatures</h1>
          <p className="page-sub">Suivez le sort de vos offres déposées</p>
        </div>
      </div>

      {list.length === 0 && (
        <div className="placeholder-screen" style={{ minHeight: 320 }}>
          <div className="ps-ico"><Icon name="send" size={30} /></div>
          <h2>Aucune candidature</h2>
          <p>Vos offres déposées sur les consultations apparaîtront ici avec leur statut.</p>
        </div>
      )}

      {list.length > 0 && (
        <div className="panel">
          <div className="p-body" style={{ padding: 0 }}>
            {list.map((cand) => {
              const cs = cand.consultation;
              const type = CONSULT_TYPES.find((t) => t.id === cs?.type);
              const nom = cs?.copro?.name ?? cs?.copro_externe_nom ?? "—";
              const retirable = cand.statut === "recue" && cs?.statut === "en_ligne";
              const retenueSansEngagement = cand.statut === "retenue" && !cand.engagement_at;
              return (
                <div key={cand.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="task-row" style={{ alignItems: "center", flexWrap: "wrap", borderBottom: "none" }}>
                    <span className="cs-type" style={{ flex: "none" }}>
                      <Icon name={type?.icon ?? "briefcase"} size={13} />
                      {type?.label ?? cs?.type}
                    </span>
                    <span style={{ minWidth: 0, flex: "0 1 300px" }}>
                      <span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>{nom}</span>
                      <span style={{ display: "block", fontSize: 12.5, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cs?.mission}
                      </span>
                    </span>
                    <span className="spacer" style={{ flex: 1 }}></span>
                    {cand.montant != null && (
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{fmtEuro(cand.montant)} HT</span>
                    )}
                    <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
                      déposée le {fmtDate(cand.received_at)}
                    </span>
                    {cs?.statut === "cloturee" && cand.statut === "recue" && (
                      <Badge kind="neutral">Consultation clôturée</Badge>
                    )}
                    <StatutBadge statut={cand.statut} />
                    {retirable && (
                      <button
                        className="se-btn se-btn-ghost btn-sm"
                        title="Retirer votre candidature de cette consultation"
                        disabled={retirer.isPending}
                        onClick={() => {
                          if (window.confirm("Retirer votre candidature ? Votre offre sera supprimée de la consultation.")) {
                            void retirer.mutateAsync(cand);
                          }
                        }}
                      >
                        <Icon name="trash" size={13} />
                        Retirer ma candidature
                      </button>
                    )}
                  </div>
                  {retenueSansEngagement && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        margin: "0 14px 12px",
                        padding: "12px 16px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--accent-soft, var(--bg-soft))",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <Icon name="checkCircle" size={18} style={{ color: "var(--color-primary-700)", flex: "none" }} />
                      <span style={{ flex: 1, fontSize: 13.5, minWidth: 220 }}>
                        <strong>Votre candidature a été retenue.</strong> Confirmez votre engagement sur
                        l'opération pour valider le projet
                        {isMoe && cs?.type === "moe" ? " — il apparaîtra alors dans « Mes projets »" : ""}.
                      </span>
                      <button
                        className="se-btn se-btn-primary btn-sm"
                        disabled={engager.isPending}
                        onClick={() => void engager.mutateAsync(cand.id)}
                      >
                        <Icon name="check" size={14} />
                        {engager.isPending ? "Confirmation…" : "Je m'engage — valider le projet"}
                      </button>
                    </div>
                  )}
                  {cand.statut === "retenue" && cand.engagement_at && (
                    <div style={{ margin: "0 14px 10px", fontSize: 12.5, color: "var(--fg2)", display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="checkCircle" size={14} style={{ color: "var(--color-primary-700)" }} />
                      Engagement confirmé le {fmtDate(cand.engagement_at)}
                      {isMoe && cs?.type === "moe" ? " — retrouvez l'opération dans « Mes projets »." : "."}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
