// Mes projets — réservé aux MOE RETENUES : lecture de la fiche copro et des
// bâtiments des opérations gagnées. Les autres intervenants n'ont pas cette
// section (aucun accès aux projets en cours). L'accès complet MOE (missions
// loi MOP, données techniques détaillées) arrive dans une phase suivante.
import { Icon } from "@/components/Icon";
import { Badge, PhaseBadge, THUMB_BG } from "@/components/ui";
import { fmtEuro, fmtDate } from "@/lib/format";
import { useMesProjetsMoe } from "@/api/espacePrestataire";
import type { Tables } from "@/lib/database.types";

export function MesProjets({ presta }: { presta: Tables<"prestataires"> }) {
  const { data: projets } = useMesProjetsMoe(true, presta.id);
  const list = projets ?? [];

  return (
    <div className="page" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mes projets</h1>
          <p className="page-sub">
            Opérations où votre candidature de maîtrise d'œuvre a été retenue — consultation des données de
            l'opération (le pilotage détaillé des missions arrive prochainement)
          </p>
        </div>
      </div>

      {list.length === 0 && (
        <div className="placeholder-screen" style={{ minHeight: 320 }}>
          <div className="ps-ico"><Icon name="building" size={30} /></div>
          <h2>Aucun projet en cours</h2>
          <p>Lorsqu'une de vos candidatures MOE est retenue par l'AMO, l'opération apparaît ici.</p>
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
                {[p.copro.adresse, p.copro.city, p.copro.quartier].filter(Boolean).join(" · ")}
              </div>
              <p className="cs-mission" style={{ marginTop: 10 }}>{p.consultation.mission}</p>
              <div className="cs-meta" style={{ marginTop: 8 }}>
                <span>
                  <Icon name="check" size={14} />
                  Retenue le {fmtDate(p.candidature.received_at)}
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
