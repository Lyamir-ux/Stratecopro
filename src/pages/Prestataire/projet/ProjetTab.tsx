// Onglet Projet de la fiche MOE : les mêmes étapes que le syndic (diagnostic,
// études, travaux), phase en cours d'après le plan de tâches de l'équipe
// Strat Eco. Les tâches propres à la maîtrise d'œuvre seront fournies par Amir
// (demande du 14/10/2026) : les colonnes les attendent.
import { Badge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PHASES } from "@/lib/referentiels";
import { fmtDate, fmtEuro } from "@/lib/format";
import type { ProjetMoe } from "@/api/espacePrestataire";
import type { Tables } from "@/lib/database.types";

export function ProjetTabMoe({ c, projet }: { c: Tables<"coproprietes">; projet: ProjetMoe }) {
  const idx = PHASES.findIndex((p) => p.id === c.phase);
  const cand = projet.candidature;
  return (
    <div className="fade">
      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="p-head">
          <Icon name="hammer" size={18} />
          <h3>Votre mission</h3>
        </div>
        <div className="p-body">
          <div className="kv">
            <span className="k">Rôle</span>
            <span className="v">
              {cand?.engagement_at ? "Maîtrise d'œuvre retenue sur consultation" : "Maîtrise d'œuvre désignée"}
            </span>
          </div>
          {cand?.engagement_at && (
            <div className="kv">
              <span className="k">Retenue le</span>
              <span className="v">{fmtDate(cand.decision_at ?? cand.received_at)}</span>
            </div>
          )}
          {cand?.engagement_at && cand.montant != null && (
            <div className="kv">
              <span className="k">Votre offre</span>
              <span className="v">{fmtEuro(cand.montant)} HT</span>
            </div>
          )}
          {projet.consultation?.mission && (
            <p className="cs-mission" style={{ marginTop: 10, marginBottom: 0 }}>{projet.consultation.mission}</p>
          )}
        </div>
      </div>

      <div className="tkanban moe-kanban">
        {PHASES.map((ph, i) => {
          const cur = i === idx;
          const fait = idx >= 0 && i < idx;
          return (
            <section key={ph.id}>
              <div className={"tcol-head" + (cur ? " cur" : "")}>
                <span className="num">{String(i + 1).padStart(2, "0")}</span>
                <span className="lbl">{ph.label}</span>
                {cur && (
                  <Badge kind="primary" dot>
                    En cours
                  </Badge>
                )}
                {fait && (
                  <Badge kind="success">
                    <Icon name="check" size={11} />
                    Passée
                  </Badge>
                )}
              </div>
              <div className="tcol-body">
                <div className="task-card" style={{ borderStyle: "dashed", background: "transparent", boxShadow: "none" }}>
                  <div className="tt" style={{ color: "var(--fg-muted)", fontWeight: 500 }}>
                    Les tâches de la maîtrise d'œuvre pour cette phase seront ajoutées prochainement.
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 14 }}>
        La phase en cours suit l'avancement du dossier piloté par l'équipe Strat Eco. Le financement, les documents
        à produire et le suivi des paiements sont dans les onglets suivants.
      </p>
    </div>
  );
}
