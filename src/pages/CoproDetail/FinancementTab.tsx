// Onglet Plans de financement - porté de detail.jsx (FinancementTab), branché sur les scénarios réels.
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
import {
  computeFinance,
  computePlansIndividuelsPf,
  itemsARepartirPf,
  readPlanDefinitif,
  type CoproTantiemes,
  type FinanceResult,
  type PlanDefinitifData,
} from "@/lib/finance";
import { readParams, useBareme, useChoixFinancementScenario, usePlansIndividuels, useScenarios } from "@/api/scenarios";
import {
  useDeletePlanDefinitif,
  usePartagerPfCopros,
  usePfPartage,
  usePlansDefinitifs,
  useUpdatePlanDefinitif,
  useValiderPlanDefinitif,
  type PlanDefinitif,
} from "@/api/planDefinitif";
import { useDonnees } from "@/api/donnees";
import { Modal } from "@/components/Modal";
import { fmtDate } from "@/lib/format";
import type { CoproWithStats } from "@/api/copros";
import { StatutPill } from "@/pages/Ingenierie/ScenarioMenu";
import { ImportPlanDefinitifDialog } from "@/pages/PlanDefinitif/ImportPlanDefinitifDialog";
import type { PlanDefinitifResult } from "@/lib/finance";

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
  const { data: pfPlans } = usePlansDefinitifs(c.id);
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

  // Le PF définitif validé fait foi : il remplit automatiquement les panneaux
  // de l'onglet (coût d'opération, aides, reste à charge, indicateurs).
  const planValide = (pfPlans ?? [])
    .filter((p) => p.statut === "valide")
    .sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1))[0];
  const pv = (planValide?.resultat ?? null) as unknown as PlanDefinitifResult | null;
  const pvData = planValide && pv ? readPlanDefinitif(planValide.data) : null;
  const openPfValide = () => planValide && navigate(`/copros/${c.id}/plan-definitif/${planValide.id}`);

  if (!active) {
    return (
      <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <PlanDefinitifPanel coproId={c.id} />
        {planValide && pv && pvData ? (
          <div className="detail-grid">
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <PanelCoutOperationPf plan={planValide} pv={pv} />
              <PanelIngenieriePf pv={pv} fondsTravaux={pvData.params.fondsTravaux} onOpen={openPfValide} />
            </div>
            <PlansIndividuelsPfPanel coproId={c.id} plan={planValide} pv={pv} pvData={pvData} />
          </div>
        ) : (
          <div className="placeholder-screen">
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
        )}
      </div>
    );
  }

  const params = readParams(active.params, bareme);
  const d: FinanceResult =
    (active.resultat as unknown as FinanceResult | null) ??
    computeFinance(params, { lots: c.stats?.lots ?? 0, lotsHab: c.stats?.lots_hab ?? 0 }, bareme);
  const gainPct = pv ? pv.performancePct : c.gain_pct;
  const seuilAtteint = (gainPct ?? 0) >= bareme.mprCopro.seuilMin;
  const seuilMajoreAtteint = (gainPct ?? 0) >= bareme.mprCopro.seuilMajore;
  // Étiquettes : celles du PF définitif validé (initiale → projet) en priorité.
  const lireEtiquette = (s: string | undefined): DpeClass | null => {
    const l = (s ?? "").trim().toUpperCase().slice(0, 1);
    return "ABCDEFG".includes(l) && l !== "" ? (l as DpeClass) : null;
  };
  const etiquetteAvant = lireEtiquette(pvData?.infos.etiquetteInitiale) ?? (c.energy_before as DpeClass | null);
  const etiquetteApres = lireEtiquette(pvData?.infos.etiquetteProjet) ?? (c.energy_after as DpeClass | null);

  return (
    <div className="detail-grid fade">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <PlanDefinitifPanel coproId={c.id} />
        {planValide && pv ? (
          <PanelCoutOperationPf plan={planValide} pv={pv} />
        ) : (
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
        )}
        {planValide && pv && pvData ? (
          <PanelIngenieriePf pv={pv} fondsTravaux={pvData.params.fondsTravaux} onOpen={openPfValide} />
        ) : (
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
                  Scénario non validé - les montants sont calculés à la volée. Validez l'étape 7 pour figer les plans.
                </p>
              )}
            </div>
          </div>
        )}
        <div className="panel">
          <div className="p-head">
            <Icon name="users" size={18} />
            <h3>Prêt collectif - adhésions</h3>
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
                  Aucun dossier d'adhésion pour l'instant - les copropriétaires y accèdent depuis leur portail
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
                          {a.coproprietaire?.nom ?? "-"}
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
                {pv ? `+${pv.performancePct.toFixed(1).replace(".", ",")} %` : c.gain_pct != null ? `+${c.gain_pct} %` : "-"}
              </span>
            </div>
            <div className="kv">
              <span className="k">Seuil {bareme.mprCopro.seuilMin} %</span>
              <span className="v">
                <Badge kind={seuilAtteint ? "success" : "warn"}>{seuilAtteint ? "Atteint" : "Non atteint"}</Badge>
              </span>
            </div>
            <div className="kv">
              <span className="k">Seuil {bareme.mprCopro.seuilMajore} %</span>
              <span className="v">
                <Badge kind={seuilMajoreAtteint ? "success" : "warn"}>
                  {seuilMajoreAtteint ? "Atteint" : "Non atteint"}
                </Badge>
              </span>
            </div>
            <div className="kv">
              <span className="k">Taux d'aides</span>
              <span className="v">{Math.round((pv ? pv.tauxCouverture : d.tauxAides) * 100)} %</span>
            </div>
            <div className="kv">
              <span className="k">Étiquette visée</span>
              <span className="v">
                <DpePair before={etiquetteAvant} after={etiquetteApres} />
              </span>
            </div>
          </div>
        </div>
        {planValide && pv && pvData ? (
          <PlansIndividuelsPfPanel coproId={c.id} plan={planValide} pv={pv} pvData={pvData} />
        ) : (
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
                Aucun plan généré - validez le plan de financement définitif : les plans individuels seront
                répartis suivant les clés de tantièmes de la copropriété.
              </p>
            ) : (
              <>
                {(plans ?? []).slice(0, 5).map((p, i, arr) => (
                  <div
                    key={p.id}
                    className="task-row"
                    role="button"
                    tabIndex={0}
                    title="Ouvrir le portail de ce copropriétaire (aperçu AMO)"
                    onClick={() => navigate(`/portail?cp=${p.coproprietaire_id}`)}
                    onKeyDown={(e) => e.key === "Enter" && navigate(`/portail?cp=${p.coproprietaire_id}`)}
                    style={{
                      padding: "11px 4px",
                      borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                      cursor: "pointer",
                    }}
                  >
                    <Icon name="user" size={16} style={{ color: "var(--fg-muted)" }} />
                    <div>
                      <div className="t-title" style={{ fontSize: 13 }}>
                        {(p as { coproprietaires: { nom: string } | null }).coproprietaires?.nom ?? "-"}
                      </div>
                      <div className="t-copro">
                        Quote-part {fmtEuro(p.quote_part)} · reste {fmtEuro(p.reste)}
                      </div>
                    </div>
                    <span className="spacer"></span>
                    <Icon name="arrowRight" size={16} style={{ color: "var(--accent)" }} />
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
        )}
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
                Aucun choix transmis - les copropriétaires choisissent leur financement depuis leur portail.
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
                      {(ch as { coproprietaires: { nom: string } | null }).coproprietaires?.nom ?? "-"}
                    </div>
                    <div className="t-copro">
                      {ch.type === "collectif"
                        ? `Prêt collectif · ${ch.duree_annees ?? "-"} ans`
                        : ch.type === "individuel"
                          ? `Prêt individuel · ${ch.lot_ids.length} lot${ch.lot_ids.length > 1 ? "s" : ""}`
                          : "Fonds propres"}
                      {" · " + fmtDate(ch.transmitted_at)}
                      {ch.saisi_par === "syndic" ? " · saisi par le syndic" : ch.saisi_par === "amo" ? " · saisi par Strat Eco" : ""}
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

/**
 * Plans de financement définitifs (nomenclature chef de projet) : import du
 * classeur Excel, liste des plans, ouverture de l'éditeur avec recalcul.
 */
function PlanDefinitifPanel({ coproId }: { coproId: string }) {
  const navigate = useNavigate();
  const { data: plans } = usePlansDefinitifs(coproId);
  const del = useDeletePlanDefinitif(coproId);
  const valider = useValiderPlanDefinitif(coproId);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="fileCheck" size={18} />
        <h3>Plan de financement définitif</h3>
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-secondary btn-sm" onClick={() => setImportOpen(true)}>
          <Icon name="upload" size={15} />
          Importer un classeur
        </button>
      </div>
      <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {(plans ?? []).length === 0 ? (
          <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
            Aucun plan définitif - importez le classeur Excel du chef de projet (onglets « PF définitif Eco PTZ
            collectif / individuel » + lots avec colonne « Retenu ») : le logiciel reconnaît la nomenclature et
            recalcule le plan à chaque modification.
          </p>
        ) : (
          (plans ?? []).map((p, i, arr) => {
            const res = p.resultat as unknown as PlanDefinitifResult | null;
            return (
              <div
                key={p.id}
                className="task-row"
                style={{ padding: "11px 4px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer" }}
                onClick={() => navigate(`/copros/${coproId}/plan-definitif/${p.id}`)}
              >
                <Icon name="fileText" size={16} style={{ color: "var(--color-secondary-500)" }} />
                <div style={{ minWidth: 0 }}>
                  <div className="t-title" style={{ fontSize: 13 }}>
                    {p.nom}
                  </div>
                  <div className="t-copro">
                    {res
                      ? `Opération ${fmtEuro(res.totalOperationTtc)} · aides ${fmtEuro(res.totalAides)} · reste à charge ${fmtEuro(res.resteACharge)}`
                      : "À compléter"}
                    {" · maj " + fmtDate(p.updated_at)}
                  </div>
                </div>
                <span className="spacer"></span>
                <Badge kind={p.statut === "valide" ? "success" : p.statut === "partage" ? "blue" : "neutral"}>
                  {p.statut === "valide" ? "Validé" : p.statut === "partage" ? "Partagé" : "Brouillon"}
                </Badge>
                {p.statut === "valide" ? (
                  <button
                    className="se-btn se-btn-ghost btn-sm"
                    title="Repasser ce plan en brouillon - les panneaux du financement ne seront plus remplis à partir de ce plan"
                    disabled={valider.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      valider.mutate({ id: p.id, valider: false });
                    }}
                  >
                    Repasser en brouillon
                  </button>
                ) : (
                  <button
                    className="se-btn se-btn-secondary btn-sm"
                    title="Valider ce plan : les panneaux du financement (coût d'opération, aides, reste à charge, indicateurs) se remplissent automatiquement"
                    disabled={valider.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      valider.mutate({ id: p.id, valider: true });
                    }}
                  >
                    <Icon name="checkCircle" size={14} />
                    Valider
                  </button>
                )}
                <button
                  className="icon-btn"
                  title="Supprimer ce plan"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Supprimer « ${p.nom} » ?`)) del.mutate(p.id);
                  }}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            );
          })
        )}
      </div>
      {importOpen && <ImportPlanDefinitifDialog coproId={coproId} onClose={() => setImportOpen(false)} />}
    </div>
  );
}

/** Coûts de l'opération issus du PF définitif validé (remplace le panneau scénario). */
function PanelCoutOperationPf({ plan, pv }: { plan: PlanDefinitif; pv: PlanDefinitifResult }) {
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="fileCheck" size={18} />
        <h3>Coût de l'opération · {plan.nom}</h3>
        <span style={{ flex: 1 }}></span>
        <Badge kind="success" dot>
          PF validé
        </Badge>
      </div>
      <div className="p-body">
        <div className="kv">
          <span className="k">Travaux TTC (imprévus inclus)</span>
          <span className="v">{fmtEuro(pv.totalTravauxTtcImprevus)}</span>
        </div>
        <div className="kv">
          <span className="k">MOE et frais annexes TTC</span>
          <span className="v">{fmtEuro(pv.totalMoeTtc)}</span>
        </div>
        <div className="kv" style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 12 }}>
          <span className="k" style={{ fontWeight: 700, color: "var(--fg1)" }}>
            Coût total opération TTC
          </span>
          <span className="v" style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
            {fmtEuroFull(pv.totalOperationTtc)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Ingénierie financière remplie automatiquement depuis le PF définitif validé. */
function PanelIngenieriePf({
  pv,
  fondsTravaux,
  onOpen,
}: {
  pv: PlanDefinitifResult;
  fondsTravaux: number;
  onOpen: () => void;
}) {
  const total = pv.totalPhaseTravauxTtc;
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="barChart" size={18} />
        <h3>Ingénierie financière</h3>
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-ghost btn-sm" onClick={onOpen}>
          Ouvrir le PF définitif
          <Icon name="arrowRight" size={15} />
        </button>
      </div>
      <div className="p-body">
        {[
          { l: "Aides mobilisables (MPR, CEE, Climaxion…)", v: pv.totalAides, blue: false },
          { l: "Fonds travaux mobilisé", v: fondsTravaux, blue: true },
          { l: "Reste à charge définitif collectif", v: pv.resteACharge, blue: false },
          { l: "Reste à financer (prime CEE en fin de travaux)", v: pv.collectif.resteAFinancer, blue: true },
        ].map((row) => (
          <div key={row.l} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
              <span>{row.l}</span>
              <span style={{ fontWeight: 700 }}>{fmtEuro(row.v)}</span>
            </div>
            <Progress value={total ? (row.v / total) * 100 : 0} blue={row.blue} />
          </div>
        ))}
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
          Champs remplis automatiquement à partir du plan de financement définitif validé.
        </p>
      </div>
    </div>
  );
}

/**
 * Plans individuels générés depuis le PF définitif validé. Une seule clé de
 * répartition dans la copropriété → tout est réparti automatiquement avec
 * elle ; plusieurs clés → l'AMO choisit, lot par lot et item par item, la clé
 * à appliquer (choix conservés dans le plan).
 */
function PlansIndividuelsPfPanel({
  coproId,
  plan,
  pv,
  pvData,
}: {
  coproId: string;
  plan: PlanDefinitif;
  pv: PlanDefinitifResult;
  pvData: PlanDefinitifData;
}) {
  const navigate = useNavigate();
  const { data: donnees } = useDonnees(coproId);
  const { data: bareme } = useBareme();
  const { data: scenarioPf } = usePfPartage(plan.id);
  const update = useUpdatePlanDefinitif(coproId);
  const partagerMut = usePartagerPfCopros(coproId);
  const [configOpen, setConfigOpen] = useState(false);

  const cles = donnees?.cles ?? [];
  const items = itemsARepartirPf(pvData, pv);

  // Tantièmes par copropriétaire (sommés sur ses lots) et totaux par clé.
  const totauxCles: Record<string, number> = {};
  const parCopro = new Map<string, CoproTantiemes>();
  for (const lot of donnees?.lots ?? []) {
    for (const [code, t] of Object.entries(lot.tantiemes)) totauxCles[code] = (totauxCles[code] ?? 0) + t;
    if (!lot.coproprietaire_id) continue;
    const co =
      parCopro.get(lot.coproprietaire_id) ??
      { coproprietaireId: lot.coproprietaire_id, nom: lot.coproprietaire?.nom ?? "-", tantiemes: {} };
    for (const [code, t] of Object.entries(lot.tantiemes)) co.tantiemes[code] = (co.tantiemes[code] ?? 0) + t;
    parCopro.set(lot.coproprietaire_id, co);
  }

  const cleUnique = cles.length === 1 ? cles[0].code : null;
  const cleParItem: Record<string, string> = cleUnique
    ? Object.fromEntries(items.map((it) => [it.id, cleUnique]))
    : (pvData.repartitionCles ?? {});

  const { plans, manquants } = computePlansIndividuelsPf({
    items,
    cleParItem,
    copros: [...parCopro.values()],
    totauxCles,
    totalAides: pv.totalAides,
    fondsTravaux: pvData.params.fondsTravaux,
    totalPhaseTravauxTtc: pv.totalPhaseTravauxTtc,
  });

  const saveCles = (config: Record<string, string>) =>
    update.mutate(
      { id: plan.id, data: { ...pvData, repartitionCles: config } },
      { onSuccess: () => setConfigOpen(false) }
    );

  // Partage au portail copropriétaire : clé de référence pour la mise à
  // l'échelle par lot (clé unique, sinon clé par défaut de la copro).
  const cleRef = cleUnique ?? cles.find((k) => k.is_default)?.code ?? cles[0]?.code ?? null;
  const partage = scenarioPf?.statut === "partage";
  const partageable = plans.length > 0 && manquants.length === 0 && !!cleRef && !!bareme;
  const togglePartage = (partager: boolean) => {
    if (!cleRef || !bareme) return;
    const tantiemesRef = Object.fromEntries(
      [...parCopro.values()].map((co) => [co.coproprietaireId, co.tantiemes[cleRef] ?? 0])
    );
    partagerMut.mutate({ plan, pv, pvData, plans, tantiemesRef, cleRef, bareme, partager });
  };
  const openPortail = (coproprietaireId: string) => navigate(`/portail?cp=${coproprietaireId}`);

  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="fileText" size={18} />
        <h3>Plans individuels</h3>
        {partage && (
          <Badge kind="success" dot>
            Partagé au portail
          </Badge>
        )}
        <span style={{ flex: 1 }}></span>
        {cles.length > 1 && (
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => setConfigOpen(true)}>
            Clés de répartition
          </button>
        )}
        {partageable &&
          (partage ? (
            <button
              className="se-btn se-btn-ghost btn-sm"
              disabled={partagerMut.isPending}
              onClick={() => togglePartage(false)}
            >
              Ne plus partager
            </button>
          ) : (
            <button
              className="se-btn se-btn-primary btn-sm"
              disabled={partagerMut.isPending}
              onClick={() => togglePartage(true)}
              title="Publier les quotes-parts sur le portail des copropriétaires"
            >
              <Icon name="eye" size={14} />
              {partagerMut.isPending ? "Partage…" : "Partager aux copropriétaires"}
            </button>
          ))}
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{plans.length}</span>
      </div>
      <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {!donnees ? (
          <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>Chargement…</p>
        ) : cles.length === 0 ? (
          <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
            Importez le tableau des lots (onglet Données de la copro) : les clés de tantièmes du fichier
            serviront à répartir le plan définitif entre les copropriétaires.
          </p>
        ) : manquants.length > 0 ? (
          cleUnique ? (
            <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
              La clé « {cles[0].label || cles[0].code} » n'a aucun tantième - vérifiez l'import des lots
              (onglet Données de la copro).
            </p>
          ) : (
          <>
            <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
              La copropriété a {cles.length} clés de répartition : choisissez, lot par lot et item par item,
              la clé à appliquer ({manquants.length} item{manquants.length > 1 ? "s" : ""} restant à affecter).
            </p>
            <button
              className="se-btn se-btn-primary btn-sm"
              style={{ marginTop: 10, alignSelf: "flex-start" }}
              onClick={() => setConfigOpen(true)}
            >
              Choisir les clés de répartition
            </button>
          </>
          )
        ) : (
          <>
            {cleUnique && (
              <p className="se-small" style={{ margin: "0 0 6px", color: "var(--fg-muted)" }}>
                Répartition automatique - clé unique « {cles[0].label || cles[0].code} »
                {" "}(total {totauxCles[cleUnique] ?? 0}).
              </p>
            )}
            {plans.map((p, i, arr) => (
              <div
                key={p.coproprietaireId}
                className="task-row"
                role="button"
                tabIndex={0}
                title={`Ouvrir le portail de ${p.nom} (aperçu AMO)`}
                onClick={() => openPortail(p.coproprietaireId)}
                onKeyDown={(e) => e.key === "Enter" && openPortail(p.coproprietaireId)}
                style={{
                  padding: "11px 4px",
                  borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                  cursor: "pointer",
                }}
              >
                <Icon name="user" size={16} style={{ color: "var(--fg-muted)" }} />
                <div>
                  <div className="t-title" style={{ fontSize: 13 }}>{p.nom}</div>
                  <div className="t-copro">
                    Quote-part {fmtEuro(p.quotePartAvant)} · aides et fonds {fmtEuro(p.aidesEtFonds)} · reste{" "}
                    {fmtEuro(p.reste)}
                  </div>
                </div>
                <span className="spacer"></span>
                <Icon name="arrowRight" size={16} style={{ color: "var(--accent)" }} />
              </div>
            ))}
          </>
        )}
      </div>
      {configOpen && (
        <RepartitionClesDialog
          items={items}
          cles={cles}
          totauxCles={totauxCles}
          initial={cleParItem}
          pending={update.isPending}
          onSave={saveCles}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}

/** Choix de la clé de répartition, lot par lot et item par item. */
function RepartitionClesDialog({
  items,
  cles,
  totauxCles,
  initial,
  pending,
  onSave,
  onClose,
}: {
  items: ReturnType<typeof itemsARepartirPf>;
  cles: { code: string; label: string | null; is_default: boolean }[];
  totauxCles: Record<string, number>;
  initial: Record<string, string>;
  pending: boolean;
  onSave: (config: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<Record<string, string>>(() => ({ ...initial }));
  const defaut = cles.find((k) => k.is_default)?.code ?? cles[0]?.code ?? "";
  const [cleGlobale, setCleGlobale] = useState(defaut);
  const manquants = items.filter((it) => !config[it.id]).length;
  const libelleCle = (k: { code: string; label: string | null }) =>
    `${k.code}${k.label && k.label !== k.code ? ` - ${k.label}` : ""} (total ${totauxCles[k.code] ?? 0})`;

  return (
    <Modal title="Clés de répartition des plans individuels" onClose={onClose} width={760} closeOnBackdrop={false}>
      <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 0 }}>
        Chaque lot de travaux (imprévus inclus) et chaque frais de la phase travaux est réparti entre les
        copropriétaires suivant la clé choisie.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13 }}>Appliquer à tous les items :</span>
        <select className="edit-inp" value={cleGlobale} onChange={(e) => setCleGlobale(e.target.value)}>
          {cles.map((k) => (
            <option key={k.code} value={k.code}>
              {libelleCle(k)}
            </option>
          ))}
        </select>
        <button
          className="se-btn se-btn-secondary btn-sm"
          onClick={() => setConfig(Object.fromEntries(items.map((it) => [it.id, cleGlobale])))}
        >
          Appliquer
        </button>
      </div>
      <div className="tablewrap">
        <table className="dossiers" style={{ fontSize: 12.5 }}>
          <thead>
            <tr>
              <th>Lot / item</th>
              <th style={{ textAlign: "right", width: 130 }}>Montant TTC</th>
              <th style={{ width: 240 }}>Clé de répartition</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} style={{ cursor: "default" }}>
                <td>{it.libelle}</td>
                <td className="mono" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmtEuroFull(it.montantTtc)}</td>
                <td>
                  <select
                    className="edit-inp"
                    style={{ width: "100%" }}
                    value={config[it.id] ?? ""}
                    onChange={(e) => setConfig((c2) => ({ ...c2, [it.id]: e.target.value }))}
                  >
                    <option value="" disabled>
                      - choisir -
                    </option>
                    {cles.map((k) => (
                      <option key={k.code} value={k.code}>
                        {libelleCle(k)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
        <button className="se-btn se-btn-ghost btn-sm" onClick={onClose}>
          Annuler
        </button>
        <button
          className="se-btn se-btn-primary btn-sm"
          disabled={manquants > 0 || pending}
          title={manquants > 0 ? `${manquants} item(s) sans clé` : undefined}
          onClick={() => onSave(config)}
        >
          {pending ? "Enregistrement…" : "Enregistrer la répartition"}
        </button>
      </div>
    </Modal>
  );
}
