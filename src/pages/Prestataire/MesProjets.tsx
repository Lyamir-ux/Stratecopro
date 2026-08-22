// Mes projets - réservé aux MOE RETENUES : suivi de l'avancement de
// l'opération (phase du projet), fiche copro et bâtiments, et documents de
// projet : l'entreprise dépose devis, plannings, PV… que l'équipe Strat Eco
// retrouve dans l'onglet Prestataires du dossier. Les autres intervenants
// n'ont pas cette section (aucun accès aux projets en cours).
import { useRef } from "react";
import { Icon } from "@/components/Icon";
import { Badge, PhaseBadge, THUMB_BG } from "@/components/ui";
import { fmtEuro, fmtDate } from "@/lib/format";
import { PHASES } from "@/lib/referentiels";
import {
  ouvrirDocPresta,
  useDeleteProjetDoc,
  useMesProjetsMoe,
  useProjetDocs,
  useUploadProjetDoc,
  type ProjetMoe,
} from "@/api/espacePrestataire";
import type { Tables } from "@/lib/database.types";

const fmtTaille = (n: number | null) =>
  n == null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;

/** Frise d'avancement de l'opération : diagnostic → études → travaux. */
function PhaseTimeline({ phase }: { phase: string | null }) {
  const idx = PHASES.findIndex((p) => p.id === phase);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
      {PHASES.map((p, i) => {
        const etat = idx < 0 ? "avenir" : i < idx ? "fait" : i === idx ? "encours" : "avenir";
        return (
          <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span style={{ width: 18, height: 1, background: "var(--border)" }}></span>}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: etat === "encours" ? 700 : 500,
                background: etat === "encours" ? "var(--accent-soft, var(--bg-soft))" : "var(--bg-soft)",
                border: `1px solid ${etat === "encours" ? "var(--accent)" : "var(--border)"}`,
                color: etat === "avenir" ? "var(--fg-muted)" : "var(--fg)",
              }}
            >
              {etat === "fait" && <Icon name="check" size={11} style={{ color: "var(--color-primary-700)" }} />}
              {p.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Documents de projet de l'entreprise (devis, plannings, PV…) - partagés
 *  avec l'équipe Strat Eco (onglet Prestataires du dossier). */
function ProjetDocsSection({
  presta,
  projet,
  docs,
}: {
  presta: Tables<"prestataires">;
  projet: ProjetMoe;
  docs: Tables<"projet_docs">[];
}) {
  const upload = useUploadProjetDoc(presta);
  const supprimer = useDeleteProjetDoc();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="folder" size={15} style={{ color: "var(--fg-muted)" }} />
        <span style={{ fontWeight: 700, fontSize: 13 }}>Documents du projet ({docs.length})</span>
        <span style={{ flex: 1 }}></span>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload.mutateAsync({ coproId: projet.copro.id, file: f });
            e.target.value = "";
          }}
        />
        <button className="se-btn se-btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={13} />
          {upload.isPending ? "Envoi…" : "Déposer un document"}
        </button>
      </div>
      <p className="se-small" style={{ color: "var(--fg-muted)", margin: "6px 0 0" }}>
        Devis signés, plannings, PV de chantier… ces documents sont partagés avec l'équipe Strat Eco.
      </p>
      {docs.map((d) => (
        <div
          key={d.id}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}
        >
          <Icon name="fileText" size={14} style={{ color: "var(--fg-muted)", flex: "none" }} />
          <button
            style={{ border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", fontWeight: 600, textAlign: "left" }}
            title={"Ouvrir " + d.name}
            onClick={() => void ouvrirDocPresta(d.path)}
          >
            {d.name}
          </button>
          <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{fmtTaille(d.size)}</span>
          <span className="spacer" style={{ flex: 1 }}></span>
          <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>déposé le {fmtDate(d.uploaded_at)}</span>
          <button
            className="icon-btn"
            style={{ width: 26, height: 26 }}
            title="Supprimer ce document"
            onClick={() => {
              if (window.confirm(`Supprimer « ${d.name} » ?`)) void supprimer.mutateAsync(d);
            }}
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function MesProjets({ presta }: { presta: Tables<"prestataires"> }) {
  const { data: projets } = useMesProjetsMoe(true, presta.id);
  const { data: projetDocs } = useProjetDocs(presta.id);
  // le projet n'entre dans « Mes projets » qu'une fois l'engagement confirmé
  // (bouton « Je m'engage » de Mes candidatures)
  const list = (projets ?? []).filter((p) => p.candidature.engagement_at);
  const enAttente = (projets ?? []).length - list.length;

  return (
    <div className="page" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mes projets</h1>
          <p className="page-sub">
            Opérations où votre candidature de maîtrise d'œuvre a été retenue et votre engagement confirmé -
            suivez l'avancement, consultez les données de l'opération et partagez vos documents avec l'équipe
            Strat Eco
          </p>
        </div>
      </div>

      {enAttente > 0 && (
        <div
          className="panel"
          style={{ padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, borderLeft: "3px solid var(--color-primary-500)" }}
        >
          <Icon name="checkCircle" size={16} style={{ color: "var(--color-primary-700)", flex: "none" }} />
          <span style={{ fontSize: 13.5 }}>
            {enAttente} candidature{enAttente > 1 ? "s" : ""} retenue{enAttente > 1 ? "s" : ""} en attente de
            votre confirmation d'engagement - rendez-vous dans « Mes candidatures » pour valider le projet.
          </span>
        </div>
      )}

      {list.length === 0 && (
        <div className="placeholder-screen" style={{ minHeight: 320 }}>
          <div className="ps-ico"><Icon name="building" size={30} /></div>
          <h2>Aucun projet en cours</h2>
          <p>
            Lorsqu'une de vos candidatures MOE est retenue par l'AMO et que vous confirmez votre engagement,
            l'opération apparaît ici.
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {list.map((p) => (
          <div key={p.candidature.id} className="panel" style={{ display: "flex", gap: 16, padding: 18, alignItems: "flex-start" }}>
            <span style={{ width: 64, height: 64, borderRadius: "var(--radius-md)", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: THUMB_BG, color: "var(--color-primary-700)" }}>
              <Icon name="building" size={28} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}>{p.copro.name}</span>
                <PhaseBadge phase={p.copro.phase} />
                {p.copro.fragile && <Badge kind="warn">Fragile</Badge>}
                <Badge kind="success" dot>MOE retenue</Badge>
              </div>
              <div style={{ fontSize: 13, color: "var(--fg3)", marginTop: 4 }}>
                {[p.copro.adresse, [p.copro.code_postal, p.copro.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
              </div>
              <PhaseTimeline phase={p.copro.phase} />
              <p className="cs-mission" style={{ marginTop: 10 }}>{p.consultation.mission}</p>
              <div className="cs-meta" style={{ marginTop: 8 }}>
                <span>
                  <Icon name="check" size={14} />
                  Retenue le {fmtDate(p.candidature.decision_at ?? p.candidature.received_at)}
                </span>
                {p.candidature.montant != null && (
                  <span>
                    <Icon name="euro" size={14} />
                    Offre : {fmtEuro(p.candidature.montant)} HT
                  </span>
                )}
                {p.batiments.length > 0 && (
                  <span>
                    <Icon name="building" size={14} />
                    {p.batiments.length} bâtiment{p.batiments.length > 1 ? "s" : ""} ·{" "}
                    {p.batiments.map((b) => b.code).join(", ")}
                  </span>
                )}
              </div>
              <ProjetDocsSection
                presta={presta}
                projet={p}
                docs={(projetDocs ?? []).filter((d) => d.copro_id === p.copro.id)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
