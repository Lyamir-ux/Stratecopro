// Historique des candidatures du prestataire connecté, avec le statut donné
// par l'AMO (reçue / retenue / non retenue). Candidature retenue : le
// prestataire confirme son engagement — pour une MOE, le projet passe alors
// dans « Mes projets ». Candidature encore à l'étude : retrait possible, avec
// motif obligatoire ; les candidatures retirées partent dans une corbeille
// (visibles aussi de l'équipe AMO). L'ouverture de la page accuse réception
// des décisions (éteint la pastille « sélectionné / refusé » du menu).
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtEuro, fmtDate } from "@/lib/format";
import { useAuth } from "@/auth/AuthProvider";
import { CONSULT_TYPES } from "@/api/consultations";
import {
  useConfirmerEngagement,
  useMarquerDecisionsVues,
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
  const { profile } = useAuth();
  const { data: candidatures } = useMesCandidatures(presta.id);
  const engager = useConfirmerEngagement();
  const retirer = useRetirerCandidature();
  const marquerVues = useMarquerDecisionsVues(presta.id);
  const list = candidatures ?? [];
  const actives = list.filter((c) => !c.retrait_at);
  const corbeille = list.filter((c) => c.retrait_at);
  const isMoe = presta.types.includes("moe");
  // aperçu AMO : ne pas accuser réception des décisions à la place de l'entreprise
  const isApercu = profile?.role === "amo";

  // retrait en cours : candidature ciblée + motif obligatoire
  const [retraitId, setRetraitId] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const [corbeilleOuverte, setCorbeilleOuverte] = useState(false);

  // l'ouverture de la page accuse réception des décisions non vues
  const nonVues = actives
    .filter((c) => c.statut !== "recue" && !c.decision_vue_at)
    .map((c) => c.id)
    .join(",");
  useEffect(() => {
    if (isApercu || !nonVues) return;
    void marquerVues.mutateAsync(nonVues.split(","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonVues, isApercu]);

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

      {actives.length > 0 && (
        <div className="panel">
          <div className="p-body" style={{ padding: 0 }}>
            {actives.map((cand) => {
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
                    {retirable && retraitId !== cand.id && (
                      <button
                        className="se-btn se-btn-ghost btn-sm"
                        title="Retirer votre candidature de cette consultation"
                        disabled={retirer.isPending}
                        onClick={() => {
                          setRetraitId(cand.id);
                          setMotif("");
                        }}
                      >
                        <Icon name="trash" size={13} />
                        Retirer ma candidature
                      </button>
                    )}
                  </div>
                  {retraitId === cand.id && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        margin: "0 14px 12px",
                        padding: "12px 16px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--bg-soft)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span style={{ flexBasis: "100%", fontSize: 13, fontWeight: 600 }}>
                        Pourquoi retirez-vous votre candidature ? Votre offre partira à la corbeille —
                        vous pourrez re-candidater tant que la consultation est en ligne.
                      </span>
                      <input
                        className="edit-inp"
                        style={{ flex: "1 1 260px", maxWidth: "none" }}
                        placeholder="Motif du retrait (plan de charge, délais, tarif…)"
                        value={motif}
                        autoFocus
                        onChange={(e) => setMotif(e.target.value)}
                      />
                      <button
                        className="se-btn se-btn-primary btn-sm"
                        disabled={!motif.trim() || retirer.isPending}
                        onClick={() => {
                          void retirer
                            .mutateAsync({ cand, motif })
                            .then(() => setRetraitId(null));
                        }}
                      >
                        <Icon name="trash" size={13} />
                        {retirer.isPending ? "Retrait…" : "Confirmer le retrait"}
                      </button>
                      <button className="se-btn se-btn-ghost btn-sm" onClick={() => setRetraitId(null)}>
                        Annuler
                      </button>
                    </div>
                  )}
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

      {corbeille.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <button
            className="p-head"
            style={{ width: "100%", cursor: "pointer", background: "none", border: "none", textAlign: "left" }}
            onClick={() => setCorbeilleOuverte((v) => !v)}
          >
            <Icon name="trash" size={16} />
            <h3>Corbeille — candidatures retirées</h3>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{corbeille.length}</span>
            <span style={{ flex: 1 }}></span>
            <Icon name={corbeilleOuverte ? "chevronDown" : "chevronRight"} size={15} />
          </button>
          {corbeilleOuverte && (
            <div className="p-body" style={{ paddingTop: 0 }}>
              {corbeille.map((cand) => {
                const cs = cand.consultation;
                const type = CONSULT_TYPES.find((t) => t.id === cs?.type);
                const nom = cs?.copro?.name ?? cs?.copro_externe_nom ?? "—";
                return (
                  <div
                    key={cand.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      padding: "9px 0",
                      borderBottom: "1px solid var(--border)",
                      fontSize: 13.5,
                    }}
                  >
                    <span className="cs-type" style={{ flex: "none", opacity: 0.7 }}>
                      <Icon name={type?.icon ?? "briefcase"} size={13} />
                      {type?.label ?? cs?.type}
                    </span>
                    <span style={{ fontWeight: 600, textDecoration: "line-through", color: "var(--fg2)" }}>{nom}</span>
                    {cand.montant != null && (
                      <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>{fmtEuro(cand.montant)} HT</span>
                    )}
                    <span className="spacer" style={{ flex: 1 }}></span>
                    <Badge kind="neutral">Retirée le {fmtDate(cand.retrait_at!)}</Badge>
                    {cand.retrait_motif && (
                      <span style={{ fontSize: 12.5, color: "var(--fg3)", fontStyle: "italic" }}>
                        « {cand.retrait_motif} »
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
