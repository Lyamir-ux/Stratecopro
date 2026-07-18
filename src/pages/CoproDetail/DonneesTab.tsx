// Onglet Données de la copro — porté de detail.jsx (DonneesTab), branché sur les vraies tables.
// Répartition des lots et matrice bâtiments × clés dérivées des lots réels ;
// synthèse éditable (fiche copropriété) ; import Excel réel des lots.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, DpePair, Progress } from "@/components/ui";
import type { DpeClass } from "@/lib/referentiels";
import { useDonnees } from "@/api/donnees";
import { useUpdateCopro, type CoproWithStats } from "@/api/copros";
import { ImportLotsDialog } from "./ImportLotsDialog";

const USAGE_LABELS: { key: "habitation" | "garage" | "caves" | "autres"; label: string; blue?: boolean }[] = [
  { key: "habitation", label: "Habitation" },
  { key: "garage", label: "Garages / parkings", blue: true },
  { key: "caves", label: "Caves" },
  { key: "autres", label: "Autres" },
];

export function DonneesTab({ c }: { c: CoproWithStats }) {
  const { data, isLoading } = useDonnees(c.id);
  const update = useUpdateCopro(c.id);
  const [showImport, setShowImport] = useState(false);
  const [editingSynth, setEditingSynth] = useState(false);
  const [synth, setSynth] = useState({ adresse: "", syndic: "", city: "" });

  if (isLoading || !data) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  const { lots, batiments, coproprietaires, cles } = data;
  const totalLots = lots.length;
  const usageCounts = USAGE_LABELS.map((u) => ({ ...u, v: lots.filter((l) => l.usage === u.key).length }));

  // Matrice bâtiments × clés : nb de lots et Σ tantièmes par clé
  const cleCodes = cles.map((k) => k.code);
  const batRows = batiments.map((b) => {
    const blots = lots.filter((l) => l.batiment?.code === b.code);
    return {
      code: b.code,
      lots: blots.length,
      tan: Object.fromEntries(
        cleCodes.map((code) => [code, blots.reduce((a, l) => a + (l.tantiemes[code] ?? 0), 0)])
      ),
    };
  });
  const sansBat = lots.filter((l) => !l.batiment);
  const totalByCle = Object.fromEntries(
    cleCodes.map((code) => [code, lots.reduce((a, l) => a + (l.tantiemes[code] ?? 0), 0)])
  );

  const startSynth = () => {
    setSynth({ adresse: c.adresse ?? "", syndic: c.syndic_name ?? "", city: c.city ?? "" });
    setEditingSynth(true);
  };
  const saveSynth = async () => {
    await update.mutateAsync({ adresse: synth.adresse || null, syndic_name: synth.syndic || null, city: synth.city || null });
    setEditingSynth(false);
  };

  return (
    <div className="detail-grid fade">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head">
            <Icon name="building" size={18} />
            <h3>Répartition des lots</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{totalLots} lots</span>
          </div>
          <div className="p-body">
            {totalLots === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Aucun lot enregistré — importez le tableau des lots et tantièmes pour démarrer.
              </p>
            ) : (
              usageCounts.map((u) => (
                <div key={u.key} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, marginBottom: 6 }}>
                    <span>{u.label}</span>
                    <span style={{ fontWeight: 700 }}>{u.v} lots</span>
                  </div>
                  <Progress value={totalLots ? (u.v / totalLots) * 100 : 0} blue={u.blue} />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <div className="p-head">
            <Icon name="layers" size={18} />
            <h3>Bâtiments &amp; clés de répartition</h3>
            <span style={{ flex: 1 }}></span>
            <div className="edit-actions">
              <button className="se-btn se-btn-secondary btn-sm" onClick={() => setShowImport(true)}>
                <Icon name="upload" size={14} />
                Importer
              </button>
            </div>
          </div>
          <div className="p-body">
            {batRows.length === 0 && sansBat.length === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Les bâtiments seront créés automatiquement à l'import des lots.
              </p>
            ) : (
              <>
                <table className="dossiers" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Bâtiment</th>
                      <th>Lots</th>
                      {cleCodes.map((code) => (
                        <th key={code}>Clé {code}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {batRows.map((b) => (
                      <tr key={b.code} style={{ cursor: "default" }}>
                        <td style={{ fontWeight: 700, fontFamily: "var(--font-display)" }}>Bât. {b.code}</td>
                        <td>{b.lots}</td>
                        {cleCodes.map((code) => (
                          <td key={code}>{b.tan[code].toLocaleString("fr-FR")} ‰</td>
                        ))}
                      </tr>
                    ))}
                    {sansBat.length > 0 && (
                      <tr style={{ cursor: "default" }}>
                        <td style={{ fontStyle: "italic", color: "var(--fg-muted)" }}>Sans bâtiment</td>
                        <td>{sansBat.length}</td>
                        {cleCodes.map((code) => (
                          <td key={code}>
                            {sansBat.reduce((a, l) => a + (l.tantiemes[code] ?? 0), 0).toLocaleString("fr-FR")} ‰
                          </td>
                        ))}
                      </tr>
                    )}
                    <tr style={{ cursor: "default", fontWeight: 700 }}>
                      <td>Total</td>
                      <td>{totalLots}</td>
                      {cleCodes.map((code) => {
                        const tot = totalByCle[code];
                        const ok = Math.abs(tot - 1000) <= 1 || tot === 0;
                        return (
                          <td key={code} style={{ color: ok ? undefined : "var(--color-error-700)" }}>
                            {tot.toLocaleString("fr-FR")} ‰{!ok && " ⚠"}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
                <p className="se-small" style={{ marginTop: 12, color: "var(--fg-muted)" }}>
                  Les clés sont exprimées en millièmes (‰). La somme de chaque clé doit atteindre 1 000 ‰.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="p-head">
            <Icon name="users" size={18} />
            <h3>Copropriétaires &amp; lots</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              {coproprietaires.length} copropriétaires · {totalLots} lots
            </span>
          </div>
          <div className="p-body">
            {totalLots === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                La liste se remplit à l'import du fichier des lots.
              </p>
            ) : (
              <div className="tablewrap" style={{ maxHeight: 360, overflowY: "auto" }}>
                <table className="dossiers" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Lot</th>
                      <th>Bâtiment</th>
                      <th>Copropriétaire</th>
                      <th>Usage</th>
                      <th>Tantièmes MUN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((l) => (
                      <tr key={l.id} style={{ cursor: "default" }}>
                        <td className="mono">n°{l.num}</td>
                        <td>{l.batiment?.code ? `Bât. ${l.batiment.code}` : "—"}</td>
                        <td>{l.coproprietaire?.nom ?? "—"}</td>
                        <td>{l.usage}</td>
                        <td className="mono">{l.tantiemes.MUN != null ? `${l.tantiemes.MUN.toLocaleString("fr-FR")} ‰` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel" style={{ position: "sticky", top: 0, alignSelf: "flex-start" }}>
        <div className="p-head">
          <Icon name="fileText" size={18} />
          <h3>Synthèse</h3>
          <span style={{ flex: 1 }}></span>
          {editingSynth ? (
            <div className="edit-actions">
              <button className="se-btn se-btn-ghost btn-sm" onClick={() => setEditingSynth(false)}>
                Annuler
              </button>
              <button className="se-btn se-btn-primary btn-sm" onClick={() => void saveSynth()}>
                <Icon name="check" size={15} />
                Enregistrer
              </button>
            </div>
          ) : (
            <div className="edit-actions">
              <button className="se-btn se-btn-ghost btn-sm" onClick={startSynth}>
                <Icon name="edit" size={14} />
                Modifier
              </button>
            </div>
          )}
        </div>
        <div className="p-body">
          <div className="kv">
            <span className="k">Adresse</span>
            {editingSynth ? (
              <input className="edit-inp" value={synth.adresse} onChange={(e) => setSynth((s) => ({ ...s, adresse: e.target.value }))} />
            ) : (
              <span className="v" style={{ textAlign: "right" }}>{c.adresse ?? "—"}</span>
            )}
          </div>
          <div className="kv">
            <span className="k">Syndic</span>
            {editingSynth ? (
              <input className="edit-inp" value={synth.syndic} onChange={(e) => setSynth((s) => ({ ...s, syndic: e.target.value }))} />
            ) : (
              <span className="v">{c.syndic_name ?? "—"}</span>
            )}
          </div>
          <div className="kv">
            <span className="k">Ville</span>
            {editingSynth ? (
              <input className="edit-inp" value={synth.city} onChange={(e) => setSynth((s) => ({ ...s, city: e.target.value }))} />
            ) : (
              <span className="v">{c.city ?? "—"}</span>
            )}
          </div>
          <div className="kv">
            <span className="k">Lots</span>
            <span className="v">{totalLots}</span>
          </div>
          <div className="kv">
            <span className="k">Copropriétaires</span>
            <span className="v">{coproprietaires.length}</span>
          </div>
          <div className="kv">
            <span className="k">Bâtiments</span>
            <span className="v">{batiments.length}</span>
          </div>
          <div className="kv">
            <span className="k">Étiquette</span>
            <span className="v">
              <DpePair before={c.energy_before as DpeClass | null} after={c.energy_after as DpeClass | null} />
            </span>
          </div>
          {c.fragile && (
            <div className="kv">
              <span className="k">Statut</span>
              <span className="v">
                <Badge kind="warn">Copropriété fragile</Badge>
              </span>
            </div>
          )}
        </div>
      </div>

      {showImport && (
        <ImportLotsDialog coproId={c.id} hasExistingLots={totalLots > 0} onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}
