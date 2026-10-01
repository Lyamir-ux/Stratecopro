// Historique des candidatures du prestataire connecté, avec le statut donné
// par l'AMO (reçue / retenue / non retenue). Candidature retenue : le
// prestataire confirme son engagement - pour une MOE, le projet passe alors
// dans « Mes projets ». Candidature encore à l'étude : retrait possible, avec
// motif obligatoire ; les candidatures retirées partent dans une corbeille
// (visibles aussi de l'équipe AMO). L'ouverture de la page accuse réception
// des décisions (éteint la pastille « sélectionné / refusé » du menu).
// Retours du 01/10/2026 (Pierre Zently, Best Ryan, Amir) : chaque candidature
// donne accès au détail de la consultation, à la décomposition complète du
// prix, au devis envoyé, à la modification de l'offre (0124) et au fil de
// discussion avec l'équipe.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { fmtEuro, fmtDate } from "@/lib/format";
import { lignesOffre } from "@/lib/offres";
import { useAuth } from "@/auth/AuthProvider";
import { CONSULT_TYPES, optionLabel, ouvrirOffre, sousTypeLabel } from "@/api/consultations";
import {
  useConfirmerEngagement,
  useConsultationsPresta,
  useMarquerDecisionsVues,
  useMesCandidatures,
  useRetirerCandidature,
  type CandidaturePresta,
  type ConsultationPresta,
} from "@/api/espacePrestataire";
import { InfosConsultation, PostulerModal, TypeTag, cible } from "./Consultations";
import type { Tables } from "@/lib/database.types";

function StatutBadge({ statut }: { statut: CandidaturePresta["statut"] }) {
  if (statut === "retenue") return <Badge kind="success" dot>Retenue</Badge>;
  if (statut === "non_retenue") return <Badge kind="neutral">Non retenue</Badge>;
  return <Badge kind="blue" dot>Reçue - en cours d'analyse</Badge>;
}

/** Décomposition du prix, note d'intention et devis envoyé d'une offre. */
function DetailOffre({ cand }: { cand: Tables<"candidatures"> }) {
  const lignes = lignesOffre(cand, optionLabel);
  return (
    <>
      {lignes.length > 0 && (
        <span style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", fontSize: 12.5, color: "var(--fg2)" }}>
          {lignes.map((l) => (
            <span key={l.libelle}>
              {l.libelle} <b style={{ fontWeight: 650 }}>{l.valeur}</b>
            </span>
          ))}
        </span>
      )}
      {cand.message && (
        <span style={{ display: "block", fontSize: 12.5, color: "var(--fg3)", fontStyle: "italic" }}>« {cand.message} »</span>
      )}
    </>
  );
}

/** Détail d'une candidature : la consultation (lieu, mission, pièces,
 *  questions) et l'offre déposée. */
function DetailCandidature({
  cand,
  cs,
  presta,
  modifiable,
  onModifier,
  onEcrire,
  onClose,
}: {
  cand: Tables<"candidatures">;
  cs: ConsultationPresta;
  presta: Tables<"prestataires">;
  modifiable: boolean;
  onModifier: () => void;
  onEcrire: (() => void) | null;
  onClose: () => void;
}) {
  const c = cible(cs);
  return (
    <Modal title={"Consultation - " + c.nom} onClose={onClose} width={600}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <TypeTag type={cs.type} />
        {cs.sous_type && <Badge kind="primary">{sousTypeLabel(cs.sous_type)}</Badge>}
        {cs.statut === "en_ligne" ? <Badge kind="success" dot>En ligne</Badge> : <Badge kind="neutral">Clôturée</Badge>}
        {cs.date_limite && (
          <span className="se-small" style={{ color: "var(--fg2)" }}>
            <Icon name="calendar" size={13} /> Réponse avant le {fmtDate(cs.date_limite)}
          </span>
        )}
        {(cs.budget ?? 0) > 0 && (
          <span className="se-small" style={{ color: "var(--fg2)" }}>
            <Icon name="euro" size={13} /> {fmtEuro(cs.budget)} estimé
          </span>
        )}
      </div>
      <InfosConsultation cs={cs} presta={presta} />
      {cs.options.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {cs.options.map((o) => (
            <Badge key={o} kind="blue">Option : {optionLabel(o)}</Badge>
          ))}
        </div>
      )}
      {cs.questions.length > 0 && (
        <div className="cs-field" style={{ marginBottom: 12 }}>
          <label>Questions et réponses</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cs.questions.map((q) => (
              <div key={q.id} style={{ fontSize: 13, padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-soft)" }}>
                <span style={{ fontWeight: 600 }}>{q.prestataire_id === presta.id ? "Votre question" : "Question d'un candidat"}</span>
                {" - "}
                {q.question}
                <span style={{ display: "block", marginTop: 4, color: q.reponse ? "var(--fg2)" : "var(--fg-muted)", fontStyle: q.reponse ? "normal" : "italic" }}>
                  {q.reponse ? `Réponse de l'AMO - ${q.reponse}` : "En attente de réponse de l'AMO."}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Votre offre</span>
          {cand.montant != null && <span style={{ fontWeight: 700 }}>{fmtEuro(cand.montant)} HT</span>}
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
            déposée le {fmtDate(cand.received_at)}
            {cand.modifiee_le ? `, modifiée le ${fmtDate(cand.modifiee_le)}` : ""}
          </span>
        </div>
        <DetailOffre cand={cand} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {cand.fichier_path && (
            <button className="se-btn se-btn-secondary btn-sm" onClick={() => void ouvrirOffre(cand.fichier_path!)}>
              <Icon name="fileText" size={14} />
              Voir le devis envoyé
            </button>
          )}
          {modifiable && (
            <button className="se-btn se-btn-secondary btn-sm" onClick={onModifier}>
              <Icon name="edit" size={14} />
              Modifier mon offre
            </button>
          )}
          {onEcrire && (
            <button className="se-btn se-btn-ghost btn-sm" onClick={onEcrire}>
              <Icon name="message" size={14} />
              Écrire à l'équipe Strat Eco
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Consultation d'une candidature, avec pièces et questions quand l'espace
 *  les charge (consultations visibles de l'entreprise), sinon sans. */
function consultationDe(cand: CandidaturePresta, visibles: ConsultationPresta[] | undefined): ConsultationPresta | null {
  const complete = (visibles ?? []).find((c) => c.id === cand.consultation_id);
  if (complete) return complete;
  if (!cand.consultation) return null;
  return { ...cand.consultation, maCandidature: null, docs: [], questions: [] };
}

export function MesCandidatures({ presta }: { presta: Tables<"prestataires"> }) {
  const { profile } = useAuth();
  const { data: candidatures } = useMesCandidatures(presta.id);
  const engager = useConfirmerEngagement();
  const retirer = useRetirerCandidature();
  const marquerVues = useMarquerDecisionsVues(presta.id);
  const { data: consultations } = useConsultationsPresta(presta);
  const navigate = useNavigate();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [modifierId, setModifierId] = useState<string | null>(null);
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
              const nom = cs?.copro?.name ?? cs?.copro_externe_nom ?? "-";
              const retirable = cand.statut === "recue" && cs?.statut === "en_ligne";
              const retenueSansEngagement = cand.statut === "retenue" && !cand.engagement_at;
              // fil de l'opération (candidature en cours ou retenue), sinon fil général
              const filOperation = cs?.copro && cand.statut !== "non_retenue" ? cs.copro.id : null;
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
                      {cand.modifiee_le ? `, modifiée le ${fmtDate(cand.modifiee_le)}` : ""}
                    </span>
                    {cs?.statut === "cloturee" && cand.statut === "recue" && (
                      <Badge kind="neutral">Consultation clôturée</Badge>
                    )}
                    <StatutBadge statut={cand.statut} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "-4px 14px 12px" }}>
                    <DetailOffre cand={cand} />
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {cs && (
                        <button className="se-btn se-btn-secondary btn-sm" onClick={() => setDetailId(cand.id)}>
                          <Icon name="eye" size={13} />
                          Voir la consultation
                        </button>
                      )}
                      {cand.fichier_path && (
                        <button
                          className="se-btn se-btn-ghost btn-sm"
                          title={cand.fichier_name ?? "Offre jointe"}
                          onClick={() => void ouvrirOffre(cand.fichier_path!)}
                        >
                          <Icon name="fileText" size={13} />
                          Voir le devis envoyé
                        </button>
                      )}
                      {retirable && (
                        <button
                          className="se-btn se-btn-ghost btn-sm"
                          title="Corriger le montant, la décomposition, la note ou la pièce jointe"
                          onClick={() => setModifierId(cand.id)}
                        >
                          <Icon name="edit" size={13} />
                          Modifier mon offre
                        </button>
                      )}
                      <button
                        className="se-btn se-btn-ghost btn-sm"
                        onClick={() => navigate(`/prestataire/messages?fil=${filOperation ?? "general"}`)}
                      >
                        <Icon name="message" size={13} />
                        Écrire à l'équipe
                      </button>
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
                        Pourquoi retirez-vous votre candidature ? Votre offre partira à la corbeille -
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
                        {isMoe && cs?.type === "moe" ? " - il apparaîtra alors dans « Mes projets »" : ""}.
                      </span>
                      <button
                        className="se-btn se-btn-primary btn-sm"
                        disabled={engager.isPending}
                        onClick={() => void engager.mutateAsync(cand.id)}
                      >
                        <Icon name="check" size={14} />
                        {engager.isPending ? "Confirmation…" : "Je m'engage - valider le projet"}
                      </button>
                    </div>
                  )}
                  {cand.statut === "retenue" && cand.engagement_at && (
                    <div style={{ margin: "0 14px 10px", fontSize: 12.5, color: "var(--fg2)", display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="checkCircle" size={14} style={{ color: "var(--color-primary-700)" }} />
                      Engagement confirmé le {fmtDate(cand.engagement_at)}
                      {isMoe && cs?.type === "moe" ? " - retrouvez l'opération dans « Mes projets »." : "."}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(() => {
        const cand = actives.find((c) => c.id === detailId);
        const cs = cand ? consultationDe(cand, consultations) : null;
        if (!cand || !cs) return null;
        const filOperation = cs.copro && cand.statut !== "non_retenue" ? cs.copro.id : null;
        return (
          <DetailCandidature
            cand={cand}
            cs={cs}
            presta={presta}
            modifiable={cand.statut === "recue" && cs.statut === "en_ligne"}
            onModifier={() => {
              setDetailId(null);
              setModifierId(cand.id);
            }}
            onEcrire={() => navigate(`/prestataire/messages?fil=${filOperation ?? "general"}`)}
            onClose={() => setDetailId(null)}
          />
        );
      })()}
      {(() => {
        const cand = actives.find((c) => c.id === modifierId);
        const cs = cand ? consultationDe(cand, consultations) : null;
        if (!cand || !cs) return null;
        return <PostulerModal cs={cs} presta={presta} candidature={cand} onClose={() => setModifierId(null)} />;
      })()}

      {corbeille.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <button
            className="p-head"
            style={{ width: "100%", cursor: "pointer", background: "none", border: "none", textAlign: "left" }}
            onClick={() => setCorbeilleOuverte((v) => !v)}
          >
            <Icon name="trash" size={16} />
            <h3>Corbeille - candidatures retirées</h3>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{corbeille.length}</span>
            <span style={{ flex: 1 }}></span>
            <Icon name={corbeilleOuverte ? "chevronDown" : "chevronRight"} size={15} />
          </button>
          {corbeilleOuverte && (
            <div className="p-body" style={{ paddingTop: 0 }}>
              {corbeille.map((cand) => {
                const cs = cand.consultation;
                const type = CONSULT_TYPES.find((t) => t.id === cs?.type);
                const nom = cs?.copro?.name ?? cs?.copro_externe_nom ?? "-";
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
