// Onglet Prestataires du dossier copro — suivi des consultations de la copro
// et des candidatures reçues, piloté depuis le dashboard de la copropriété :
// valider / refuser une offre (e-mail automatique au prestataire), suivre
// l'engagement du prestataire retenu, répondre aux questions des candidats.
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { fmtEuro, fmtDate } from "@/lib/format";
import {
  CONSULT_TYPES,
  ouvrirOffre,
  useConsultations,
  useReopenConsultation,
  type Consultation,
} from "@/api/consultations";
import { ouvrirDocPresta, useProjetDocsCopro } from "@/api/espacePrestataire";
import { CandidatureActions } from "@/components/CandidatureActions";
import { QuestionsPanel } from "@/pages/Consultations";
import type { CoproWithStats } from "@/api/copros";

function ConsultationPanel({ cs }: { cs: Consultation }) {
  const type = CONSULT_TYPES.find((t) => t.id === cs.type);
  const reopen = useReopenConsultation();
  const enLigne = cs.statut === "en_ligne";
  const enAttente = cs.questions.filter((q) => !q.reponse).length;
  const retenue = cs.candidatures.find((c) => c.statut === "retenue");

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name={type?.icon ?? "briefcase"} size={18} />
        <h3>{type?.label ?? cs.type}</h3>
        {enLigne ? <Badge kind="success" dot>En ligne</Badge> : <Badge kind="neutral">Clôturée</Badge>}
        {retenue && (
          <Badge kind="primary" dot>
            {retenue.org_name} {retenue.engagement_at ? "· engagé" : "· en attente d'engagement"}
          </Badge>
        )}
        <span style={{ flex: 1 }}></span>
        {!enLigne && (
          <button
            className="se-btn se-btn-ghost btn-sm"
            title="Relancer la consultation : elle redevient visible des prestataires du métier, qui peuvent de nouveau candidater"
            disabled={reopen.isPending}
            onClick={() => void reopen.mutateAsync(cs.id)}
          >
            <Icon name="megaphone" size={13} />
            Remettre en ligne
          </button>
        )}
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
          {cs.candidatures.length} candidature{cs.candidatures.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="p-body">
        <p className="cs-mission" style={{ marginTop: 0 }}>{cs.mission}</p>

        {cs.candidatures.length === 0 ? (
          <p className="se-small" style={{ color: "var(--fg-muted)" }}>
            Aucune candidature reçue pour le moment.
          </p>
        ) : (
          cs.candidatures.map((cand) => (
            <div
              key={cand.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                padding: "9px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <Avatar
                who={cand.org_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                name={cand.org_name}
                sm
              />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{cand.org_name}</span>
              {cand.prestataire_id && <Badge kind="primary" dot>Portail</Badge>}
              {cand.montant != null && (
                <span style={{ fontWeight: 700, fontSize: 13 }}>{fmtEuro(cand.montant)} HT</span>
              )}
              <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>{fmtDate(cand.received_at)}</span>
              {cand.fichier_path && (
                <button
                  className="se-btn se-btn-ghost btn-sm"
                  title={cand.fichier_name ?? "Offre jointe"}
                  onClick={() => void ouvrirOffre(cand.fichier_path!)}
                >
                  <Icon name="download" size={13} />
                  Offre
                </button>
              )}
              <span className="spacer" style={{ flex: 1 }}></span>
              <CandidatureActions cand={cand} />
            </div>
          ))
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 4px" }}>
          <Icon name="message" size={15} style={{ color: "var(--fg-muted)" }} />
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            Questions des candidats ({cs.questions.length})
          </span>
          {enAttente > 0 && <Badge kind="warn">{enAttente} sans réponse</Badge>}
        </div>
        <QuestionsPanel cs={cs} />
      </div>
    </div>
  );
}

/** Documents déposés par les prestataires retenus du projet (devis, plannings,
 *  PV…) depuis leur section « Mes projets ». */
function ProjetDocsPanel({ c }: { c: CoproWithStats }) {
  const { data: docs } = useProjetDocsCopro(c.id);
  if (!docs || docs.length === 0) return null;
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="folder" size={18} />
        <h3>Documents déposés par les prestataires</h3>
        <span style={{ flex: 1 }}></span>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{docs.length}</span>
      </div>
      <div className="p-body">
        {docs.map((d) => (
          <div
            key={d.id}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13.5, flexWrap: "wrap" }}
          >
            <Icon name="fileText" size={15} style={{ color: "var(--fg-muted)", flex: "none" }} />
            <button
              style={{ border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", fontWeight: 600, textAlign: "left" }}
              title={"Ouvrir " + d.name}
              onClick={() => void ouvrirDocPresta(d.path)}
            >
              {d.name}
            </button>
            <Badge kind="neutral">{d.prestataire?.raison_sociale ?? "—"}</Badge>
            <span className="spacer" style={{ flex: 1 }}></span>
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>déposé le {fmtDate(d.uploaded_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PrestatairesTab({ c }: { c: CoproWithStats }) {
  const navigate = useNavigate();
  const { data: consultations, isLoading } = useConsultations();
  const liste = (consultations ?? []).filter((cs) => cs.copro_id === c.id);
  const enLigne = liste.filter((cs) => cs.statut === "en_ligne");
  const closes = liste.filter((cs) => cs.statut !== "en_ligne");

  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 860 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0, flex: 1 }}>
          Suivi des consultations de cette copropriété : validez ou refusez les offres (le prestataire
          est prévenu par e-mail automatique) et répondez aux questions des candidats.
        </p>
        <button className="se-btn se-btn-secondary btn-sm" onClick={() => navigate("/consultations")}>
          <Icon name="megaphone" size={14} />
          Publier une consultation
        </button>
      </div>

      {liste.length === 0 && (
        <div className="placeholder-screen" style={{ minHeight: 260 }}>
          <div className="ps-ico"><Icon name="briefcase" size={30} /></div>
          <h2>Aucune consultation</h2>
          <p>Publiez un appel à intervenants pour cette copropriété depuis « Consulter un intervenant ».</p>
        </div>
      )}

      <ProjetDocsPanel c={c} />

      {enLigne.map((cs) => (
        <ConsultationPanel key={cs.id} cs={cs} />
      ))}
      {closes.length > 0 && (
        <>
          <div className="cs-section-label" style={{ marginTop: 6 }}>Clôturées · {closes.length}</div>
          {closes.map((cs) => (
            <ConsultationPanel key={cs.id} cs={cs} />
          ))}
        </>
      )}
    </div>
  );
}
