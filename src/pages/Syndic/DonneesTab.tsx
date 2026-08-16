// Onglet Données de la copro (syndic) — bâtiments, copropriétaires et lots,
// en lecture seule (l'import et l'édition restent côté AMO).
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { useDonnees } from "@/api/donnees";
import type { SyndicCopro } from "@/api/syndic";

const USAGE_LABEL: Record<string, string> = {
  habitation: "Habitation",
  garage: "Garage",
  caves: "Caves",
  autres: "Autres",
};

export function DonneesTabSyndic({ c }: { c: SyndicCopro }) {
  const { data: donnees, isLoading } = useDonnees(c.id);
  if (isLoading || !donnees) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  const { batiments, coproprietaires, lots, cles } = donnees;
  const lotsByCp = new Map<string, number>();
  for (const l of lots) {
    if (l.coproprietaire_id) lotsByCp.set(l.coproprietaire_id, (lotsByCp.get(l.coproprietaire_id) ?? 0) + 1);
  }
  const cleDefaut = cles.find((k) => k.is_default)?.code ?? cles[0]?.code;
  const totalCle = cleDefaut ? lots.reduce((s, l) => s + (l.tantiemes[cleDefaut] ?? 0), 0) : 0;

  return (
    <div className="detail-grid fade">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head">
            <Icon name="table" size={18} />
            <h3>Lots</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              {lots.length} lots{cleDefaut ? ` · ${totalCle.toLocaleString("fr-FR")} tantièmes ${cleDefaut}` : ""}
            </span>
          </div>
          <div className="p-body">
            {lots.length === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Les lots seront visibles dès leur import par l'équipe Strat Eco.
              </p>
            ) : (
              <div className="tablewrap" style={{ maxHeight: 460, overflowY: "auto" }}>
                <table className="dossiers" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Lot</th>
                      <th>Bâtiment</th>
                      <th>Usage</th>
                      <th>Copropriétaire</th>
                      <th style={{ textAlign: "right" }}>Tantièmes{cleDefaut ? ` ${cleDefaut}` : ""}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((l) => (
                      <tr key={l.id} style={{ cursor: "default" }}>
                        <td style={{ fontWeight: 600 }}>{l.num}</td>
                        <td>{l.batiment?.code ?? "—"}</td>
                        <td>{USAGE_LABEL[l.usage] ?? l.usage}</td>
                        <td>{l.coproprietaire?.nom ?? "—"}</td>
                        <td style={{ textAlign: "right" }}>
                          {cleDefaut != null && l.tantiemes[cleDefaut] != null
                            ? l.tantiemes[cleDefaut].toLocaleString("fr-FR")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head">
            <Icon name="users" size={18} />
            <h3>Copropriétaires</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{coproprietaires.length}</span>
          </div>
          <div className="p-body" style={{ maxHeight: 340, overflowY: "auto" }}>
            {coproprietaires.map((cp, i) => (
              <div
                key={cp.id}
                className="task-row"
                style={{ padding: "10px 4px", borderBottom: i < coproprietaires.length - 1 ? "1px solid var(--border)" : "none" }}
              >
                <Icon name="user" size={16} style={{ color: "var(--fg-muted)" }} />
                <div>
                  <div className="t-title" style={{ fontSize: 13 }}>{cp.nom}</div>
                  <div className="t-copro">
                    {[
                      cp.type === "bailleur" ? "Bailleur" : cp.type === "occupant" ? "Occupant" : null,
                      (lotsByCp.get(cp.id) ?? 0) + " lot" + ((lotsByCp.get(cp.id) ?? 0) > 1 ? "s" : ""),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </div>
            ))}
            {coproprietaires.length === 0 && (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Aucun copropriétaire recensé pour l'instant.
              </p>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="p-head">
            <Icon name="building" size={18} />
            <h3>Bâtiments</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{batiments.length}</span>
          </div>
          <div className="p-body" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {batiments.map((b) => (
              <Badge key={b.id} kind="neutral">
                {b.code}
                {b.label ? " · " + b.label : ""}
              </Badge>
            ))}
            {batiments.length === 0 && (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Aucun bâtiment renseigné.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
