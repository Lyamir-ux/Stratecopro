// Onglet Données de la copro — porté de detail.jsx (DonneesTab), branché sur les vraies tables.
// Répartition des lots et matrice bâtiments × clés dérivées des lots réels ;
// synthèse éditable (fiche copropriété) ; import Excel réel des lots.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, DpePair, Progress } from "@/components/ui";
import type { DpeClass } from "@/lib/referentiels";
import { useDonnees, useSetNbBatiments } from "@/api/donnees";
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
  const setNbBatiments = useSetNbBatiments(c.id);
  const [synth, setSynth] = useState({
    adresse: "",
    syndic: "",
    city: "",
    gestionnaireNom: "",
    gestionnaireEmail: "",
    chefProjet: "",
    nbLogements: 0,
    nbBatiments: 0,
  });

  if (isLoading || !data) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  const { lots, batiments, coproprietaires, cles } = data;
  const totalLots = lots.length;
  const usageCounts = USAGE_LABELS.map((u) => ({ ...u, v: lots.filter((l) => l.usage === u.key).length }));

  // Matrice bâtiments × clés : nb de lots et Σ tantièmes par clé
  const cleCodes = cles.map((k) => k.code);
  const cleDefaut = cles.find((k) => k.is_default)?.code ?? cleCodes[0];
  const batRows = batiments.map((b) => {
    const blots = lots.filter((l) => l.batiment?.code === b.code);
    return {
      code: b.code,
      adresse: b.adresse,
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
    setSynth({
      adresse: c.adresse ?? "",
      syndic: c.syndic_name ?? "",
      city: c.city ?? "",
      gestionnaireNom: c.gestionnaire_nom ?? "",
      gestionnaireEmail: c.gestionnaire_email ?? "",
      chefProjet: c.chef_projet ?? "",
      nbLogements: c.nb_logements ?? 0,
      nbBatiments: batiments.length,
    });
    setEditingSynth(true);
  };
  const saveSynth = async () => {
    if (synth.nbBatiments !== batiments.length) {
      // Peut échouer si on réduit alors que des bâtiments portent des lots — on reste en édition.
      try {
        await setNbBatiments.mutateAsync(Math.max(1, synth.nbBatiments));
      } catch {
        return;
      }
    }
    await update.mutateAsync({
      adresse: synth.adresse || null,
      syndic_name: synth.syndic || null,
      city: synth.city || null,
      gestionnaire_nom: synth.gestionnaireNom || null,
      gestionnaire_email: synth.gestionnaireEmail || null,
      chef_projet: synth.chefProjet || null,
      nb_logements: synth.nbLogements > 0 ? synth.nbLogements : null,
    });
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
                        <th key={code}>{code}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {batRows.map((b) => (
                      <tr key={b.code} style={{ cursor: "default" }}>
                        <td>
                          <span style={{ fontWeight: 700, fontFamily: "var(--font-display)" }}>Bât. {b.code}</span>
                          {b.adresse && (
                            <span style={{ display: "block", fontSize: 12, color: "var(--fg-muted)" }}>{b.adresse}</span>
                          )}
                        </td>
                        <td>{b.lots}</td>
                        {cleCodes.map((code) => (
                          <td key={code}>{b.tan[code].toLocaleString("fr-FR")}</td>
                        ))}
                      </tr>
                    ))}
                    {sansBat.length > 0 && (
                      <tr style={{ cursor: "default" }}>
                        <td style={{ fontStyle: "italic", color: "var(--fg-muted)" }}>Sans bâtiment</td>
                        <td>{sansBat.length}</td>
                        {cleCodes.map((code) => (
                          <td key={code}>
                            {sansBat.reduce((a, l) => a + (l.tantiemes[code] ?? 0), 0).toLocaleString("fr-FR")}
                          </td>
                        ))}
                      </tr>
                    )}
                    <tr style={{ cursor: "default", fontWeight: 700 }}>
                      <td>Total</td>
                      <td>{totalLots}</td>
                      {cleCodes.map((code) => (
                        <td key={code}>{totalByCle[code].toLocaleString("fr-FR")}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
                <p className="se-small" style={{ marginTop: 12, color: "var(--fg-muted)" }}>
                  Les tantièmes sont repris tels quels depuis le fichier importé — chaque clé garde son propre total,
                  les quote-parts sont calculées au prorata du total réel.
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
                      <th>Mail</th>
                      <th>Tél.</th>
                      <th>Usage</th>
                      {cleDefaut && <th>Tantièmes {cleDefaut}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((l) => (
                      <tr key={l.id} style={{ cursor: "default" }}>
                        <td className="mono">n°{l.num}</td>
                        <td>{l.batiment?.code ? `Bât. ${l.batiment.code}` : "—"}</td>
                        <td>{l.coproprietaire?.nom ?? "—"}</td>
                        <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {l.coproprietaire?.email ?? "—"}
                        </td>
                        <td className="mono">{l.coproprietaire?.telephone ?? "—"}</td>
                        <td>{l.usage}</td>
                        {cleDefaut && (
                          <td className="mono">
                            {l.tantiemes[cleDefaut] != null ? l.tantiemes[cleDefaut].toLocaleString("fr-FR") : "—"}
                          </td>
                        )}
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
          {c.organisation && (
            <div className="kv">
              <span className="k">Organisation</span>
              <span className="v">{c.organisation.nom}</span>
            </div>
          )}
          <div className="kv">
            <span className="k">Gestionnaire</span>
            {editingSynth ? (
              <input className="edit-inp" value={synth.gestionnaireNom} onChange={(e) => setSynth((s) => ({ ...s, gestionnaireNom: e.target.value }))} />
            ) : (
              <span className="v">{c.gestionnaire_nom ?? "—"}</span>
            )}
          </div>
          <div className="kv">
            <span className="k">Mail gestionnaire</span>
            {editingSynth ? (
              <input className="edit-inp" type="email" value={synth.gestionnaireEmail} onChange={(e) => setSynth((s) => ({ ...s, gestionnaireEmail: e.target.value }))} />
            ) : (
              <span className="v" style={{ textAlign: "right", overflowWrap: "anywhere" }}>{c.gestionnaire_email ?? "—"}</span>
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
            <span className="k">Chef de projet</span>
            {editingSynth ? (
              <input className="edit-inp" value={synth.chefProjet} onChange={(e) => setSynth((s) => ({ ...s, chefProjet: e.target.value }))} />
            ) : (
              <span className="v">{c.chef_projet ?? "—"}</span>
            )}
          </div>
          <div className="kv">
            <span className="k">Logements déclarés</span>
            {editingSynth ? (
              <input
                className="edit-inp"
                type="number"
                min={0}
                style={{ maxWidth: 90, textAlign: "right" }}
                value={synth.nbLogements}
                onChange={(e) => setSynth((s) => ({ ...s, nbLogements: Math.max(0, Number(e.target.value) || 0) }))}
              />
            ) : (
              <span className="v">{c.nb_logements ?? "—"}</span>
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
            {editingSynth ? (
              <input
                className="edit-inp"
                type="number"
                min={1}
                style={{ maxWidth: 90, textAlign: "right" }}
                value={synth.nbBatiments}
                onChange={(e) => setSynth((s) => ({ ...s, nbBatiments: Math.max(1, Number(e.target.value) || 1) }))}
              />
            ) : (
              <span className="v">{batiments.length}</span>
            )}
          </div>
          {editingSynth && setNbBatiments.isError && (
            <p className="se-small" style={{ color: "var(--color-error-700)", margin: "6px 0 0" }}>
              {String((setNbBatiments.error as Error)?.message ?? setNbBatiments.error)}
            </p>
          )}
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
