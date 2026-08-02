// Onglet Plans de financement — porté de detail.jsx (FinancementTab), branché sur les scénarios réels.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge, DpePair, Progress } from "@/components/ui";
import {
  BANQUES,
  downloadAdhesionDoc,
  useAdhesions,
  useFinancementConfigAmo,
  useSaveFinancementConfig,
} from "@/api/financement";
import { fmtEuro, fmtEuroFull } from "@/lib/format";
import type { DpeClass } from "@/lib/referentiels";
import { computeFinance, type FinanceResult } from "@/lib/finance";
import { readParams, useBareme, useChoixFinancementScenario, usePlansIndividuels, useScenarios } from "@/api/scenarios";
import { fmtDate } from "@/lib/format";
import type { CoproWithStats } from "@/api/copros";
import { StatutPill } from "@/pages/Ingenierie/ScenarioMenu";

export function FinancementTab({ c }: { c: CoproWithStats }) {
  const navigate = useNavigate();
  const { data: scenarios, isLoading } = useScenarios(c.id);
  const { data: bareme } = useBareme();

  const shared = (scenarios ?? [])
    .filter((s) => s.statut === "partage" || s.statut === "importe")
    .sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1))[0];
  const active = shared ?? (scenarios ?? [])[0];
  const { data: plans } = usePlansIndividuels(active?.id);
  const { data: choix } = useChoixFinancementScenario(active?.id);
  const { data: finConfig } = useFinancementConfigAmo(c.id);
  const { data: adhesions } = useAdhesions(c.id);
  const saveConfig = useSaveFinancementConfig(c.id);
  const [banque, setBanque] = useState<string>("CEGEE");
  const [duree, setDuree] = useState(15);
  const [ouverte, setOuverte] = useState(false);

  useEffect(() => {
    if (!finConfig) return;
    setBanque(finConfig.banque);
    setDuree(finConfig.duree_annees);
    setOuverte(finConfig.adhesion_ouverte);
  }, [finConfig]);

  const configDirty =
    !finConfig ||
    finConfig.banque !== banque ||
    finConfig.duree_annees !== duree ||
    finConfig.adhesion_ouverte !== ouverte;

  if (isLoading || !bareme) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  const openAssistant = () => navigate(`/copros/${c.id}/ingenierie${active ? `/${active.id}` : ""}`);

  if (!active) {
    return (
      <div className="placeholder-screen fade">
        <div className="ps-ico">
          <Icon name="euro" size={28} />
        </div>
        <h2>Financement à venir</h2>
        <p>Le chiffrage et le plan de financement seront établis à l'issue du diagnostic, en phase Études.</p>
        <button className="se-btn se-btn-primary" style={{ marginTop: 22 }} onClick={openAssistant}>
          <Icon name="barChart" size={17} />
          Démarrer l'ingénierie financière
        </button>
      </div>
    );
  }

  const params = readParams(active.params, bareme);
  const d: FinanceResult =
    (active.resultat as unknown as FinanceResult | null) ??
    computeFinance(params, { lots: c.stats?.lots ?? 0, lotsHab: c.stats?.lots_hab ?? 0 }, bareme);
  const seuilAtteint = (c.gain_pct ?? 0) >= bareme.mprCopro.seuilMin;

  return (
    <div className="detail-grid fade">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head">
            <Icon name="euro" size={18} />
            <h3>Scénario · {active.name}</h3>
            <span style={{ flex: 1 }}></span>
            <StatutPill sc={active} />
          </div>
          <div className="p-body">
            <div className="kv">
              <span className="k">Travaux</span>
              <span className="v">{fmtEuro(params.travaux)}</span>
            </div>
            <div className="kv">
              <span className="k">Honoraires</span>
              <span className="v">{fmtEuro(params.honoraires)}</span>
            </div>
            <div className="kv">
              <span className="k">Aléas</span>
              <span className="v">{fmtEuro(params.aleas)}</span>
            </div>
            <div className="kv" style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 12 }}>
              <span className="k" style={{ fontWeight: 700, color: "var(--fg1)" }}>
                Coût total TTC
              </span>
              <span className="v" style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
                {fmtEuroFull(d.coutTotal)}
              </span>
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="p-head">
            <Icon name="barChart" size={18} />
            <h3>Ingénierie financière</h3>
            <span style={{ flex: 1 }}></span>
            <button className="se-btn se-btn-ghost btn-sm" onClick={openAssistant}>
              Ouvrir l'assistant 7 étapes
              <Icon name="arrowRight" size={15} />
            </button>
          </div>
          <div className="p-body">
            {[
              { l: "Aides collectives (MPR Copro, CEE, Fonds)", v: d.aidesColl, blue: false },
              { l: "Aides individuelles (MPR profils)", v: d.aidesIndiv, blue: true },
              { l: "Éco-PTZ collectif mobilisé", v: d.ecoPtzMontant, blue: true },
              { l: "Reste à charge copropriété", v: d.resteACharge, blue: false },
            ].map((row) => (
              <div key={row.l} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                  <span>{row.l}</span>
                  <span style={{ fontWeight: 700 }}>{fmtEuro(row.v)}</span>
                </div>
                <Progress value={d.coutTotal ? (row.v / d.coutTotal) * 100 : 0} blue={row.blue} />
              </div>
            ))}
            {!active.validated_at && (
              <p className="se-small" style={{ color: "var(--fg-muted)" }}>
                Scénario non validé — les montants sont calculés à la volée. Validez l'étape 7 pour figer les plans.
              </p>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="p-head">
            <Icon name="users" size={18} />
            <h3>Prêt collectif — adhésions</h3>
            <span style={{ flex: 1 }}></span>
            <Badge kind={ouverte ? "success" : "neutral"}>{ouverte ? "Campagne ouverte" : "Fermée"}</Badge>
          </div>
          <div className="p-body">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12.5, color: "var(--fg2)" }}>Banque partenaire</label>
                <select className="edit-inp" value={banque} onChange={(e) => setBanque(e.target.value)}>
                  {BANQUES.map((b) => (
                    <option key={b} value={b} disabled={b !== "CEGEE"}>
                      {b}{b !== "CEGEE" ? " (bientôt)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12.5, color: "var(--fg2)" }}>Durée votée en AG (ans)</label>
                <input
                  className="edit-inp"
                  type="number"
                  min={3}
                  max={20}
                  style={{ width: 90 }}
                  value={duree}
                  onChange={(e) => setDuree(Number(e.target.value))}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, cursor: "pointer", paddingBottom: 8 }}>
                <input type="checkbox" checked={ouverte} onChange={(e) => setOuverte(e.target.checked)} />
                Adhésions ouvertes sur le portail
              </label>
              <button
                className="se-btn se-btn-secondary btn-sm"
                style={{ marginBottom: 4 }}
                disabled={!configDirty || saveConfig.isPending || duree < 3 || duree > 20}
                onClick={() => saveConfig.mutate({ banque, dureeAnnees: duree, adhesionOuverte: ouverte })}
              >
                {saveConfig.isPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>

            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 2 }}>
              {(adhesions ?? []).length === 0 ? (
                <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
                  Aucun dossier d'adhésion pour l'instant — les copropriétaires y accèdent depuis leur portail
                  après avoir choisi le prêt collectif.
                </p>
              ) : (
                (adhesions ?? []).map((a, i, arr) => {
                  const bulletins = (a.bulletins as { lotNum: string; path: string }[] | null) ?? [];
                  return (
                    <div
                      key={a.id}
                      className="task-row"
                      style={{ padding: "11px 4px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}
                    >
                      <Icon name={a.statut === "signee" ? "checkCircle" : "clock"} size={16}
                        style={{ color: a.statut === "signee" ? "var(--color-success-500)" : "var(--fg-muted)" }} />
                      <div style={{ minWidth: 0 }}>
                        <div className="t-title" style={{ fontSize: 13 }}>
                          {a.coproprietaire?.nom ?? "—"}
                        </div>
                        <div className="t-copro">
                          {a.statut === "signee"
                            ? `Signé · ${bulletins.length} bulletin${bulletins.length > 1 ? "s" : ""}`
                            : "Brouillon en cours"}
                          {a.rib_concordance === "concordant" && " · RIB concordant"}
                          {a.rib_concordance === "discordant" && " · ⚠ IBAN ≠ RIB"}
                          {a.rib_concordance === "non_verifie" && " · RIB à vérifier"}
                        </div>
                      </div>
                      <span className="spacer"></span>
                      {a.statut === "signee" && (
                        <>
                          {bulletins.map((b) => (
                            <button
                              key={b.path}
                              className="icon-btn"
                              title={`Bulletin lot n°${b.lotNum}`}
                              onClick={() => void downloadAdhesionDoc(b.path, `bulletin-${a.coproprietaire?.nom ?? "adherent"}-lot-${b.lotNum}.pdf`)}
                            >
                              <Icon name="fileText" size={16} />
                            </button>
                          ))}
                          {a.sepa_path && (
                            <button
                              className="icon-btn"
                              title="Mandat SEPA pré-rempli"
                              onClick={() => void downloadAdhesionDoc(a.sepa_path!, `sepa-${a.coproprietaire?.nom ?? "adherent"}.pdf`)}
                            >
                              <Icon name="download" size={16} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head">
            <Icon name="trendingUp" size={18} />
            <h3>Indicateurs</h3>
          </div>
          <div className="p-body">
            <div className="kv">
              <span className="k">Gain énergétique</span>
              <span className="v" style={{ color: "var(--color-primary-700)" }}>
                {c.gain_pct != null ? `+${c.gain_pct} %` : "—"}
              </span>
            </div>
            <div className="kv">
              <span className="k">Seuil {bareme.mprCopro.seuilMin} %</span>
              <span className="v">
                <Badge kind={seuilAtteint ? "success" : "warn"}>{seuilAtteint ? "Atteint" : "Non atteint"}</Badge>
              </span>
            </div>
            <div className="kv">
              <span className="k">Taux d'aides</span>
              <span className="v">{Math.round(d.tauxAides * 100)} %</span>
            </div>
            <div className="kv">
              <span className="k">Étiquette visée</span>
              <span className="v">
                <DpePair before={c.energy_before as DpeClass | null} after={c.energy_after as DpeClass | null} />
              </span>
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="p-head">
            <Icon name="fileText" size={18} />
            <h3>Plans individuels</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{plans?.length ?? 0}</span>
          </div>
          <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(plans ?? []).length === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Aucun plan généré — validez l'étape 7 de l'assistant pour créer les plans individuels.
              </p>
            ) : (
              <>
                {(plans ?? []).slice(0, 5).map((p, i, arr) => (
                  <div
                    key={p.id}
                    className="task-row"
                    style={{ padding: "11px 4px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}
                  >
                    <Icon name="user" size={16} style={{ color: "var(--fg-muted)" }} />
                    <div>
                      <div className="t-title" style={{ fontSize: 13 }}>
                        {(p as { coproprietaires: { nom: string } | null }).coproprietaires?.nom ?? "—"}
                      </div>
                      <div className="t-copro">
                        Quote-part {fmtEuro(p.quote_part)} · reste {fmtEuro(p.reste)}
                      </div>
                    </div>
                    <span className="spacer"></span>
                    <Icon name="fileText" size={16} style={{ color: "var(--color-secondary-500)" }} />
                  </div>
                ))}
                <button className="se-btn se-btn-ghost btn-sm" style={{ marginTop: 8, alignSelf: "flex-start" }} onClick={openAssistant}>
                  Voir les {plans?.length} plans
                  <Icon name="arrowRight" size={15} />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="p-head">
            <Icon name="users" size={18} />
            <h3>Choix de financement (portail)</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{choix?.length ?? 0}</span>
          </div>
          <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(choix ?? []).length === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Aucun choix transmis — les copropriétaires choisissent leur financement depuis leur portail.
              </p>
            ) : (
              (choix ?? []).map((ch, i, arr) => (
                <div
                  key={ch.id}
                  className="task-row"
                  style={{ padding: "11px 4px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}
                >
                  <Icon
                    name={ch.type === "collectif" ? "users" : ch.type === "individuel" ? "user" : "euro"}
                    size={16}
                    style={{ color: "var(--fg-muted)" }}
                  />
                  <div>
                    <div className="t-title" style={{ fontSize: 13 }}>
                      {(ch as { coproprietaires: { nom: string } | null }).coproprietaires?.nom ?? "—"}
                    </div>
                    <div className="t-copro">
                      {ch.type === "collectif"
                        ? `Prêt collectif · ${ch.duree_annees ?? "—"} ans`
                        : ch.type === "individuel"
                          ? `Prêt individuel · ${ch.lot_ids.length} lot${ch.lot_ids.length > 1 ? "s" : ""}`
                          : "Fonds propres"}
                      {" · " + fmtDate(ch.transmitted_at)}
                    </div>
                  </div>
                  <span className="spacer"></span>
                  <Badge kind={ch.type === "fonds" ? "neutral" : "primary"} dot>
                    {ch.type === "collectif" ? "Collectif" : ch.type === "individuel" ? "Individuel" : "Fonds propres"}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
