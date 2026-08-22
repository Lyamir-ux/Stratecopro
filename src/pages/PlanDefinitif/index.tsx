// Éditeur du plan de financement définitif (nomenclature chef de projet).
// Toute modification (ligne de lot, « retenu », MOE, aide, paramètre) recalcule
// immédiatement les deux variantes de financement - mêmes formules que le classeur.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { useCopro } from "@/api/copros";
import { usePlanDefinitif, useUpdatePlanDefinitif, useValiderPlanDefinitif } from "@/api/planDefinitif";
import { fmtEuro, fmtEuroFull } from "@/lib/format";
import {
  computePlanDefinitif,
  exportPlanDefinitif,
  makeAidesDefaut,
  PHASES_MOE,
  readPlanDefinitif,
  type AideDef,
  type LigneLot,
  type LigneMoe,
  type ModeAide,
  type PlanDefinitifData,
} from "@/lib/finance";

const TVA_CHOICES = [0, 5.5, 10, 20];

// ---------- petits helpers d'édition ----------

function NumInput({
  value,
  onChange,
  width,
  step = "any",
  min,
}: {
  value: number;
  onChange: (n: number) => void;
  /** Largeur en px ; par défaut, remplit la colonne. */
  width?: number;
  step?: string;
  min?: number;
}) {
  return (
    <input
      className="edit-inp"
      type="number"
      step={step}
      min={min}
      style={{ width: width ?? "100%", textAlign: "right" }}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
    />
  );
}

function TvaSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const choices = TVA_CHOICES.includes(value) ? TVA_CHOICES : [...TVA_CHOICES, value];
  return (
    <select className="edit-inp" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {choices.map((t) => (
        <option key={t} value={t}>
          {String(t).replace(".", ",")} %
        </option>
      ))}
    </select>
  );
}

const thR: CSSProperties = { textAlign: "right" };
const tdR: CSSProperties = { textAlign: "right", whiteSpace: "nowrap" };

// ---------- page ----------

export default function PlanDefinitifPage() {
  const { id: coproId, planId } = useParams();
  const navigate = useNavigate();
  const { data: c } = useCopro(coproId);
  const { data: plan, isLoading } = usePlanDefinitif(planId);
  const update = useUpdatePlanDefinitif(coproId ?? "");
  const valider = useValiderPlanDefinitif(coproId ?? "");

  const [data, setData] = useState<PlanDefinitifData | null>(null);
  const [dirty, setDirty] = useState(false);
  // Lots repliés par défaut : on ne déroule que le lot qu'on veut consulter/éditer.
  const [lotsOuverts, setLotsOuverts] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (plan && !dirty) setData(readPlanDefinitif(plan.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, plan?.updated_at]);

  useCrumbs([
    { label: "Vos copropriétés", to: "/" },
    { label: c?.name ?? "…", to: `/copros/${coproId}/financement` },
    { label: "PF définitif" },
  ]);

  const r = useMemo(() => (data ? computePlanDefinitif(data) : null), [data]);

  if (isLoading || !plan || !data || !r)
    return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  const edit = (fn: (d: PlanDefinitifData) => PlanDefinitifData) => {
    setData((d) => (d ? fn(structuredClone(d)) : d));
    setDirty(true);
  };

  const save = () => {
    if (!data) return;
    update.mutate({ id: plan.id, data }, { onSuccess: () => setDirty(false) });
  };

  const doExport = () => {
    const wb = exportPlanDefinitif(data);
    XLSX.writeFile(wb, `Plan de financement définitif - ${data.infos.nomCopro || c?.name || "copro"}.xlsx`);
  };

  const gardeFousKo = r.gardeFous.filter((g) => !g.ok);

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ---- barre d'actions ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate(`/copros/${coproId}/financement`)}>
          <Icon name="chevronLeft" size={16} />
          Financement
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontFamily: "var(--font-display)" }}>{plan.nom}</h1>
        {plan.source_fichier && (
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
            importé de « {plan.source_fichier} »
          </span>
        )}
        <span style={{ flex: 1 }}></span>
        <Badge kind={plan.statut === "valide" ? "success" : "neutral"}>
          {plan.statut === "valide" ? "Validé" : plan.statut === "partage" ? "Partagé" : "Brouillon"}
        </Badge>
        <Badge kind={gardeFousKo.length ? "warn" : "success"}>
          {gardeFousKo.length ? `${gardeFousKo.length} garde-fou dépassé` : "Garde-fous OK"}
        </Badge>
        <button className="se-btn se-btn-secondary btn-sm" onClick={doExport}>
          <Icon name="download" size={15} />
          Exporter .xlsx
        </button>
        {plan.statut === "valide" ? (
          <button
            className="se-btn se-btn-ghost btn-sm"
            disabled={valider.isPending}
            title="Les panneaux du financement ne seront plus remplis à partir de ce plan"
            onClick={() => valider.mutate({ id: plan.id, valider: false })}
          >
            Repasser en brouillon
          </button>
        ) : (
          <button
            className="se-btn se-btn-secondary btn-sm"
            disabled={dirty || update.isPending || valider.isPending}
            title={
              dirty
                ? "Enregistrez d'abord vos modifications pour pouvoir valider"
                : "Valider ce plan : les panneaux du financement se remplissent automatiquement"
            }
            onClick={() => valider.mutate({ id: plan.id, valider: true })}
          >
            <Icon name="checkCircle" size={15} />
            Valider
          </button>
        )}
        <button
          className="se-btn se-btn-primary btn-sm"
          disabled={!dirty || update.isPending}
          onClick={save}
        >
          <Icon name="check" size={15} />
          {update.isPending ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}
        </button>
      </div>

      {/* ---- infos générales ---- */}
      <div className="panel">
        <div className="p-head">
          <Icon name="building" size={18} />
          <h3>Informations générales</h3>
          <span style={{ flex: 1 }}></span>
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
            Performance : <b style={{ color: "var(--color-primary-700)" }}>{r.performancePct.toFixed(1)} %</b>{" "}
            d'économie d'énergie
          </span>
        </div>
        <div className="p-body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
          {(
            [
              ["Nom de la copropriété", "nomCopro", "text"],
              ["Adresse de l'immeuble", "adresse", "text"],
              ["Logements principaux", "nbLogements", "num"],
              ["Logements + équivalent", "nbLogementsEquiv", "num"],
              ["Surface habitable ou équiv. (m²)", "surfaceHabitable", "num"],
              ["Nombre d'étages", "nbEtages", "num"],
              ["Nombre d'entrées", "nbEntrees", "num"],
              ["Type de chauffage", "typeChauffage", "text"],
              ["Cep initial (kWhEP/m²/an)", "cepInitial", "num"],
              ["Cep projet (kWhEP/m²/an)", "cepProjet", "num"],
              ["Étiquette initiale", "etiquetteInitiale", "text"],
              ["Étiquette projet", "etiquetteProjet", "text"],
            ] as const
          ).map(([label, key, kind]) => (
            <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--fg2)" }}>
              {label}
              {kind === "num" ? (
                <NumInput
                  value={data.infos[key] as number}
                  onChange={(n) => edit((d) => (((d.infos as unknown as Record<string, number>)[key] = n), d))}
                />
              ) : (
                <input
                  className="edit-inp"
                  value={data.infos[key] as string}
                  onChange={(e) => edit((d) => (((d.infos as unknown as Record<string, string>)[key] = e.target.value), d))}
                />
              )}
            </label>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, marginTop: 16 }}>
            <input
              type="checkbox"
              checked={data.infos.dispositifClimaxion}
              onChange={(e) => edit((d) => ((d.infos.dispositifClimaxion = e.target.checked), d))}
            />
            Dispositif CLIMAXION
          </label>
        </div>
      </div>

      {/* ---- lots de travaux ---- */}
      <div className="panel">
        <div className="p-head">
          <Icon name="hammer" size={18} />
          <h3>Descriptif des travaux - lots</h3>
          <span style={{ flex: 1 }}></span>
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() => {
              const idx = data.lots.length;
              edit((d) => {
                const numero = Math.max(1, ...d.lots.map((l) => l.numero)) + 1;
                d.lots.push({ numero, titre: "Nouveau lot", entreprise: "", remisePct: 0, lignes: [] });
                return d;
              });
              setLotsOuverts((o) => ({ ...o, [idx]: true }));
            }}
          >
            <Icon name="plus" size={15} />
            Ajouter un lot
          </button>
        </div>
        <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {data.lots.map((lot, li) => {
            const rl = r.lots.find((x) => x.numero === lot.numero && x.titre === lot.titre) ?? r.lots[li];
            const ouvert = !!lotsOuverts[li];
            const toggle = () => setLotsOuverts((o) => ({ ...o, [li]: !o[li] }));
            return (
              <div key={li} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg2)", flexWrap: "wrap" }}>
                  <button className="icon-btn" title={ouvert ? "Replier le lot" : "Dérouler le lot"} onClick={toggle}>
                    <Icon name={ouvert ? "chevronDown" : "chevronRight"} size={16} />
                  </button>
                  <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>Lot</span>
                  <NumInput width={58} value={lot.numero} onChange={(n) => edit((d) => ((d.lots[li].numero = n), d))} />
                  <input
                    className="edit-inp"
                    style={{ minWidth: 200, flex: 1 }}
                    value={lot.titre}
                    onChange={(e) => edit((d) => ((d.lots[li].titre = e.target.value), d))}
                  />
                  <input
                    className="edit-inp"
                    style={{ width: 160 }}
                    placeholder="Entreprise"
                    value={lot.entreprise ?? ""}
                    onChange={(e) => edit((d) => ((d.lots[li].entreprise = e.target.value), d))}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--fg2)" }}>
                    Remise
                    <NumInput width={64} value={lot.remisePct} onChange={(n) => edit((d) => ((d.lots[li].remisePct = n), d))} />
                    %
                  </label>
                  <button
                    className="icon-btn"
                    title="Supprimer le lot"
                    onClick={() => {
                      edit((d) => ((d.lots.splice(li, 1)), d));
                      setLotsOuverts((o) => {
                        const next: Record<number, boolean> = {};
                        for (const [k, v] of Object.entries(o)) {
                          const i = Number(k);
                          if (i < li) next[i] = v;
                          else if (i > li) next[i - 1] = v;
                        }
                        return next;
                      });
                    }}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
                {!ouvert ? (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 18, padding: "9px 14px", borderTop: "1px solid var(--border)", fontSize: 13, flexWrap: "wrap", cursor: "pointer" }}
                    onClick={toggle}
                    title="Dérouler le lot"
                  >
                    <span style={{ color: "var(--fg-muted)" }}>
                      {lot.lignes.length} ligne{lot.lignes.length > 1 ? "s" : ""} de devis
                    </span>
                    <span style={{ flex: 1 }}></span>
                    <span>
                      HT {lot.remisePct > 0 ? "après remise " : ""}
                      <b>{fmtEuroFull(rl?.totalHtApresRemise ?? 0)}</b>
                    </span>
                    <span>
                      Retenu MPR <b style={{ color: "var(--color-primary-700)" }}>{fmtEuroFull(rl?.totalHtRetenu ?? 0)}</b>
                    </span>
                    <span>
                      TTC <b>{fmtEuroFull(rl?.totalTtc ?? 0)}</b>
                    </span>
                  </div>
                ) : (
                <>
                <div className="tablewrap">
                  <table className="dossiers" style={{ fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 170 }}>Groupe</th>
                        <th>Désignation</th>
                        <th style={{ width: 70 }} title="Montant retenu dans l'assiette MaPrimeRénov'">
                          Retenu
                        </th>
                        <th style={{ ...thR, width: 130 }}>€ HT</th>
                        <th style={{ width: 90 }}>TVA</th>
                        <th style={{ width: 36 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lot.lignes.map((l: LigneLot, i) => (
                        <tr key={i} style={{ cursor: "default" }}>
                          <td>
                            <input
                              className="edit-inp"
                              style={{ width: "100%" }}
                              placeholder="-"
                              value={l.groupe ?? ""}
                              onChange={(e) =>
                                edit((d) => ((d.lots[li].lignes[i].groupe = e.target.value || undefined), d))
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="edit-inp"
                              style={{ width: "100%" }}
                              value={l.designation}
                              onChange={(e) => edit((d) => ((d.lots[li].lignes[i].designation = e.target.value), d))}
                            />
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={l.retenu}
                              onChange={(e) => edit((d) => ((d.lots[li].lignes[i].retenu = e.target.checked), d))}
                            />
                          </td>
                          <td style={tdR}>
                            <NumInput value={l.montantHt} onChange={(n) => edit((d) => ((d.lots[li].lignes[i].montantHt = n), d))} />
                          </td>
                          <td>
                            <TvaSelect value={l.tvaPct} onChange={(n) => edit((d) => ((d.lots[li].lignes[i].tvaPct = n), d))} />
                          </td>
                          <td>
                            <button className="icon-btn" title="Supprimer la ligne" onClick={() => edit((d) => (d.lots[li].lignes.splice(i, 1), d))}>
                              <Icon name="x" size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "9px 14px", borderTop: "1px solid var(--border)", fontSize: 13, flexWrap: "wrap" }}>
                  <button
                    className="se-btn se-btn-ghost btn-sm"
                    onClick={() =>
                      edit((d) => {
                        d.lots[li].lignes.push({ designation: "", retenu: false, montantHt: 0, tvaPct: 10 });
                        return d;
                      })
                    }
                  >
                    <Icon name="plus" size={14} />
                    Ligne
                  </button>
                  <span style={{ flex: 1 }}></span>
                  <span>
                    HT {lot.remisePct > 0 ? "après remise " : ""}
                    <b>{fmtEuroFull(rl?.totalHtApresRemise ?? 0)}</b>
                  </span>
                  <span>
                    Retenu MPR <b style={{ color: "var(--color-primary-700)" }}>{fmtEuroFull(rl?.totalHtRetenu ?? 0)}</b>
                  </span>
                  <span>
                    TTC <b>{fmtEuroFull(rl?.totalTtc ?? 0)}</b>
                  </span>
                </div>
                </>
                )}
              </div>
            );
          })}

          <div className="kv" style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13.5 }}>
            <span>
              Total travaux HT <b>{fmtEuroFull(r.totalTravauxHt)}</b>
            </span>
            <span>
              Retenu MPR {fmtEuro(r.travauxRetenusHt)} → assiette plafonnée{" "}
              <b style={{ color: "var(--color-primary-700)" }}>{fmtEuroFull(r.assietteMprTravaux)}</b>
              <span className="se-small" style={{ color: "var(--fg-muted)" }}>
                {" "}
                (plafond {fmtEuro(r.plafondAssiette)})
              </span>
            </span>
            <span>
              Total TTC <b>{fmtEuroFull(r.totalTravauxTtc)}</b>
            </span>
            <span>
              TTC + imprévus {String(data.params.imprevusPct).replace(".", ",")} %{" "}
              <b>{fmtEuroFull(r.totalTravauxTtcImprevus)}</b>
            </span>
          </div>
        </div>
      </div>

      {/* ---- MOE et frais annexes ---- */}
      <div className="panel">
        <div className="p-head">
          <Icon name="clipboard" size={18} />
          <h3>MOE et frais annexes</h3>
          <span style={{ flex: 1 }}></span>
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
            Total TTC <b>{fmtEuroFull(r.totalMoeTtc)}</b> · opération {fmtEuroFull(r.totalOperationTtc)}
          </span>
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() =>
              edit((d) => {
                d.moe.push({
                  designation: "",
                  phase: "travaux",
                  montant: { mode: "forfait", montantHt: 0 },
                  tvaPct: 20,
                  eligibleMprEtudes: false,
                  eligibleMprAmo: false,
                });
                return d;
              })
            }
          >
            <Icon name="plus" size={15} />
            Ligne
          </button>
        </div>
        <div className="p-body">
          <div className="tablewrap">
            <table className="dossiers" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th style={{ width: 130 }} title="Entreprise / prestataire de la mission - reprise au suivi financier du syndic">
                    Entreprise
                  </th>
                  <th style={{ width: 120 }}>Phase</th>
                  <th style={{ width: 150 }}>Mode</th>
                  <th style={{ ...thR, width: 120 }}>HT / taux %</th>
                  <th style={{ width: 88 }}>TVA</th>
                  <th style={{ width: 66 }} title="Assiette Maprimerénov' partie études">
                    MPR ét.
                  </th>
                  <th style={{ width: 56 }} title="Assiette Maprimerénov' AMO (50 %)">
                    AMO
                  </th>
                  <th style={{ ...thR, width: 110 }}>TTC</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.moe.map((l: LigneMoe, i) => (
                  <tr key={i} style={{ cursor: "default" }}>
                    <td>
                      <input
                        className="edit-inp"
                        style={{ width: "100%" }}
                        value={l.designation}
                        onChange={(e) => edit((d) => ((d.moe[i].designation = e.target.value), d))}
                      />
                    </td>
                    <td>
                      <input
                        className="edit-inp"
                        style={{ width: "100%" }}
                        placeholder="-"
                        value={l.entreprise ?? ""}
                        onChange={(e) => edit((d) => ((d.moe[i].entreprise = e.target.value || undefined), d))}
                      />
                    </td>
                    <td>
                      <select
                        className="edit-inp"
                        value={l.phase}
                        onChange={(e) => edit((d) => ((d.moe[i].phase = e.target.value as LigneMoe["phase"]), d))}
                      >
                        {PHASES_MOE.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="edit-inp"
                        value={l.montant.mode}
                        onChange={(e) =>
                          edit((d) => {
                            const mode = e.target.value as LigneMoe["montant"]["mode"];
                            const ht = r.moe[i]?.montantHt ?? 0;
                            d.moe[i].montant =
                              mode === "forfait"
                                ? { mode, montantHt: ht }
                                : mode === "pctTravauxHt"
                                  ? { mode, taux: r.totalTravauxHt ? (ht / r.totalTravauxHt) * 100 : 0 }
                                  : { mode, taux: r.totalTravauxTtc ? (ht / r.totalTravauxTtc) * 100 : 0 };
                            return d;
                          })
                        }
                      >
                        <option value="forfait">Forfait HT</option>
                        <option value="pctTravauxHt">% travaux HT</option>
                        <option value="pctTravauxTtc">% travaux TTC</option>
                      </select>
                    </td>
                    <td style={tdR}>
                      <NumInput
                        value={l.montant.mode === "forfait" ? l.montant.montantHt : l.montant.taux}
                        onChange={(n) =>
                          edit((d) => {
                            const m = d.moe[i].montant;
                            if (m.mode === "forfait") m.montantHt = n;
                            else m.taux = n;
                            return d;
                          })
                        }
                      />
                    </td>
                    <td>
                      <TvaSelect value={l.tvaPct} onChange={(n) => edit((d) => ((d.moe[i].tvaPct = n), d))} />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={l.eligibleMprEtudes}
                        onChange={(e) => edit((d) => ((d.moe[i].eligibleMprEtudes = e.target.checked), d))}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={l.eligibleMprAmo}
                        onChange={(e) => edit((d) => ((d.moe[i].eligibleMprAmo = e.target.checked), d))}
                      />
                    </td>
                    <td className="mono" style={tdR}>
                      {fmtEuroFull(r.moe[i]?.montantTtc ?? 0)}
                    </td>
                    <td>
                      <button className="icon-btn" title="Supprimer" onClick={() => edit((d) => (d.moe.splice(i, 1), d))}>
                        <Icon name="x" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: "10px 0 0" }}>
            « % travaux HT/TTC » : le montant suit automatiquement le total des travaux (MOE phase travaux,
            honoraires syndic, dommage-ouvrage). Total phase travaux TTC : <b>{fmtEuroFull(r.totalPhaseTravauxTtc)}</b>
          </p>
        </div>
      </div>

      {/* ---- aides ---- */}
      <div className="panel">
        <div className="p-head">
          <Icon name="euro" size={18} />
          <h3>Aides mobilisables</h3>
          <span style={{ flex: 1 }}></span>
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
            Total NET <b>{fmtEuroFull(r.totalAides)}</b> · publiques {fmtEuroFull(r.totalAidesPubliques)}
          </span>
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() =>
              edit((d) => {
                d.aides.push({
                  id: `aide-${Date.now()}`,
                  groupe: "Autre",
                  libelle: "Nouvelle aide",
                  calcul: { mode: "manuel", montant: 0 },
                  publique: true,
                });
                return d;
              })
            }
          >
            <Icon name="plus" size={15} />
            Aide
          </button>
          <button
            className="se-btn se-btn-ghost btn-sm"
            title="Réinitialiser le catalogue standard (CEE, MPR, Climaxion, EMS)"
            onClick={() => edit((d) => ((d.aides = makeAidesDefaut()), d))}
          >
            Catalogue standard
          </button>
        </div>
        <div className="p-body">
          <div className="tablewrap">
            <table className="dossiers" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Groupe</th>
                  <th style={{ width: 220 }}>Libellé</th>
                  <th>Formule</th>
                  <th style={{ width: 76 }} title="Compte dans le total des aides publiques (décoché : prime privée type CEE)">
                    Publique
                  </th>
                  <th style={{ ...thR, width: 120 }}>Montant</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.aides.map((a: AideDef, i) => (
                  <tr key={a.id} style={{ cursor: "default" }}>
                    <td>
                      <input
                        className="edit-inp"
                        style={{ width: "100%" }}
                        value={a.groupe}
                        onChange={(e) => edit((d) => ((d.aides[i].groupe = e.target.value), d))}
                      />
                    </td>
                    <td>
                      <input
                        className="edit-inp"
                        style={{ width: "100%" }}
                        value={a.libelle}
                        onChange={(e) => edit((d) => ((d.aides[i].libelle = e.target.value), d))}
                      />
                    </td>
                    <td>
                      <AideFormule
                        calcul={a.calcul}
                        onChange={(calc) => edit((d) => ((d.aides[i].calcul = calc), d))}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={a.publique}
                        onChange={(e) => edit((d) => ((d.aides[i].publique = e.target.checked), d))}
                      />
                    </td>
                    <td className="mono" style={tdR}>
                      {r.aides[i]?.montant == null ? "-" : fmtEuroFull(r.aides[i].montant)}
                    </td>
                    <td>
                      <button className="icon-btn" title="Supprimer" onClick={() => edit((d) => (d.aides.splice(i, 1), d))}>
                        <Icon name="x" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ---- paramètres ---- */}
      <div className="panel">
        <div className="p-head">
          <Icon name="gauge" size={18} />
          <h3>Paramètres de financement</h3>
        </div>
        <div className="p-body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))", gap: 12 }}>
          {(
            [
              ["Imprévus (% du TTC travaux)", "imprevusPct"],
              ["Plafond assiette MPR (€ HT/logt)", "plafondTravauxParLogement"],
              ["Garde-fou MPR travaux (€/logt)", "plafondMprParLogement"],
              ["Garde-fou AMO (€ HT/logt)", "plafondAmoParLogement"],
              ["Fonds travaux mobilisé (€)", "fondsTravaux"],
              ["Total tantièmes", "totalTantiemes"],
              ["Durée éco-PTZ (ans)", "dureeEcoPtzAns"],
              ["Coef. assurance non solidaire", "coefAssurance"],
              ["Coût prêt avance subventions (%)", "tauxPretAvancePct"],
              ["Aides avancées - variante individuelle (%)", "pctAvanceAides"],
            ] as const
          ).map(([label, key]) => (
            <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--fg2)" }}>
              {label}
              <NumInput
                value={data.params[key]}
                onChange={(n) => edit((d) => (((d.params as unknown as Record<string, number>)[key] = n), d))}
              />
            </label>
          ))}
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--fg2)" }}>
            Tantièmes d'exemple (séparés par des virgules)
            <input
              className="edit-inp"
              value={data.params.tantiemesExemples.join(", ")}
              onChange={(e) =>
                edit((d) => {
                  d.params.tantiemesExemples = e.target.value
                    .split(/[,;\s]+/)
                    .map((s) => Number(s))
                    .filter((n) => Number.isFinite(n) && n > 0);
                  return d;
                })
              }
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--fg2)" }}>
            Commentaire fonds travaux
            <input
              className="edit-inp"
              value={data.params.commentaireFondsTravaux ?? ""}
              onChange={(e) => edit((d) => ((d.params.commentaireFondsTravaux = e.target.value || undefined), d))}
            />
          </label>
        </div>
      </div>

      {/* ---- résultats : variantes de financement ----
          Empilées (collectif au-dessus, individuel en dessous) et affichées
          uniquement si le projet est concerné - les cases suivent les onglets
          du classeur importé et restent modifiables ici. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, fontFamily: "var(--font-display)" }}>
            Variantes de financement présentées :
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={data.variantes.collectif}
              onChange={(e) => edit((d) => ((d.variantes.collectif = e.target.checked), d))}
            />
            Éco-PTZ collectif + avance de subventions
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={data.variantes.collectifSansAvance}
              onChange={(e) => edit((d) => ((d.variantes.collectifSansAvance = e.target.checked), d))}
            />
            Éco-PTZ collectif sans avance de subventions
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={data.variantes.individuel}
              onChange={(e) => edit((d) => ((d.variantes.individuel = e.target.checked), d))}
            />
            Éco-PTZ individuel - appels de fonds
          </label>
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
            Seules les variantes cochées apparaissent ici et dans l'export Excel.
          </span>
        </div>
        {data.variantes.collectif && <VarianteCollectif r={r} data={data} />}
        {data.variantes.collectifSansAvance && <VarianteCollectifSansAvance r={r} data={data} />}
        {data.variantes.individuel && <VarianteIndividuel r={r} data={data} />}
        {!data.variantes.collectif && !data.variantes.collectifSansAvance && !data.variantes.individuel && (
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
            Aucune variante affichée - cochez au moins l'option de financement concernée par le projet.
          </p>
        )}
      </div>

      {/* ---- garde-fous ---- */}
      <div className="panel">
        <div className="p-head">
          <Icon name="alert" size={18} />
          <h3>Garde-fous</h3>
        </div>
        <div className="p-body" style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
          {r.gardeFous.map((g) => (
            <div key={g.libelle} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              <Icon
                name={g.ok ? "checkCircle" : "alert"}
                size={16}
                style={{ color: g.ok ? "var(--color-success-500)" : "var(--color-error-700)" }}
              />
              {g.libelle} : <b>{fmtEuroFull(g.valeur)}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- formule d'aide (éditeur par mode) ----------

function AideFormule({ calcul, onChange }: { calcul: ModeAide; onChange: (m: ModeAide) => void }) {
  const set = (patch: Record<string, number | boolean>) => onChange({ ...calcul, ...patch } as unknown as ModeAide);
  const inline: CSSProperties = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12.5 };
  const modeSelect = (
    <select
      className="edit-inp"
      value={calcul.mode}
      onChange={(e) => {
        const mode = e.target.value as ModeAide["mode"];
        const defs: Record<ModeAide["mode"], ModeAide> = {
          manuel: { mode: "manuel", montant: 0 },
          parM2Shab: { mode: "parM2Shab", tauxEurM2: 27, coef: 0.9 },
          pctAssietteTravaux: { mode: "pctAssietteTravaux", taux: 45, coef: 0.9 },
          pctEtudes: { mode: "pctEtudes", taux: 45, coef: 0.9 },
          pctAmo: { mode: "pctAmo", taux: 50 },
          forfaitPlusParLogement: { mode: "forfaitPlusParLogement", base: 10000, parLogement: 2500, surEquivalent: true },
          parLogement: { mode: "parLogement", montant: 1000, surEquivalent: true },
          info: { mode: "info" },
        };
        onChange(defs[mode]);
      }}
    >
      <option value="manuel">Montant manuel</option>
      <option value="parM2Shab">€ / m² habitable</option>
      <option value="pctAssietteTravaux">% assiette travaux MPR</option>
      <option value="pctEtudes">% études (prorata énergétique)</option>
      <option value="pctAmo">% AMO</option>
      <option value="forfaitPlusParLogement">Forfait + € / logement</option>
      <option value="parLogement">€ / logement</option>
      <option value="info">Ligne informative</option>
    </select>
  );
  return (
    <div style={inline}>
      {modeSelect}
      {calcul.mode === "manuel" && (
        <NumInput width={100} value={calcul.montant} onChange={(n) => set({ montant: n })} />
      )}
      {calcul.mode === "parM2Shab" && (
        <>
          <NumInput width={64} value={calcul.tauxEurM2} onChange={(n) => set({ tauxEurM2: n })} /> €/m² ×
          <NumInput width={60} value={calcul.coef} onChange={(n) => set({ coef: n })} />
        </>
      )}
      {(calcul.mode === "pctAssietteTravaux" || calcul.mode === "pctEtudes") && (
        <>
          <NumInput width={60} value={calcul.taux} onChange={(n) => set({ taux: n })} /> % ×
          <NumInput width={60} value={calcul.coef} onChange={(n) => set({ coef: n })} />
        </>
      )}
      {calcul.mode === "pctAmo" && (
        <>
          <NumInput width={60} value={calcul.taux} onChange={(n) => set({ taux: n })} /> %
        </>
      )}
      {calcul.mode === "forfaitPlusParLogement" && (
        <>
          <NumInput width={86} value={calcul.base} onChange={(n) => set({ base: n })} /> +
          <NumInput width={76} value={calcul.parLogement} onChange={(n) => set({ parLogement: n })} /> €/logt
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={calcul.surEquivalent} onChange={(e) => set({ surEquivalent: e.target.checked })} />
            équiv.
          </label>
        </>
      )}
      {calcul.mode === "parLogement" && (
        <>
          <NumInput width={76} value={calcul.montant} onChange={(n) => set({ montant: n })} /> €/logt
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={calcul.surEquivalent} onChange={(e) => set({ surEquivalent: e.target.checked })} />
            équiv.
          </label>
        </>
      )}
    </div>
  );
}

// ---------- variantes de financement ----------

function Kv({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="kv">
      <span className="k" style={strong ? { fontWeight: 700, color: "var(--fg1)" } : undefined}>{k}</span>
      <span className="v" style={strong ? { fontFamily: "var(--font-display)", fontSize: 16 } : undefined}>{v}</span>
    </div>
  );
}

function ExemplesTable({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="tablewrap" style={{ marginTop: 10 }}>
      <table className="dossiers" style={{ fontSize: 12.5 }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} style={i > 0 ? thR : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ cursor: "default" }}>
              {row.map((cell, j) => (
                <td key={j} className={j > 0 ? "mono" : undefined} style={j > 0 ? tdR : undefined}>
                  {typeof cell === "number" ? fmtEuroFull(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VarianteCollectif({ r, data }: { r: NonNullable<ReturnType<typeof computePlanDefinitif>>; data: PlanDefinitifData }) {
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="users" size={18} />
        <h3>Éco-PTZ collectif + avance de subventions</h3>
      </div>
      <div className="p-body">
        <Kv k="Taux de couverture par les aides" v={`${(r.tauxCouverture * 100).toFixed(1)} %`} />
        <Kv k="Fonds travaux mobilisé" v={fmtEuroFull(data.params.fondsTravaux)} />
        <Kv k="Reste à charge définitif collectif" v={fmtEuroFull(r.resteACharge)} />
        <Kv k="Reste à financer (prime CEE en fin de travaux)" v={fmtEuroFull(r.collectif.resteAFinancer)} strong />
        <Kv k={`Coût au tantième avant aides (/${data.params.totalTantiemes})`} v={fmtEuroFull(r.coutTantiemeAvant)} />
        <Kv k="Coût au tantième après aides publiques et fonds" v={fmtEuroFull(r.collectif.coutTantiemeApres)} />
        <ExemplesTable
          head={["Tantièmes", "Quote-part avant aides", "Reste à financer", `Mensualité ${data.params.dureeEcoPtzAns} ans`, "Coût prêt avance", "Prime CEE", "Prix de revient"]}
          rows={r.collectif.exemples.map((e) => [
            `${e.tantiemes}/${data.params.totalTantiemes}`,
            e.quotePartAvant,
            e.resteAFinancer,
            e.mensualiteEcoPtz,
            e.coutPretAvance,
            e.primeCee,
            e.prixRevient,
          ])}
        />
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
          Prix de revient = reste à financer + coût du prêt avance de subventions ({String(data.params.tauxPretAvancePct).replace(".", ",")} %) − prime CEE.
        </p>
      </div>
    </div>
  );
}

function VarianteCollectifSansAvance({ r, data }: { r: NonNullable<ReturnType<typeof computePlanDefinitif>>; data: PlanDefinitifData }) {
  const v = r.collectifSansAvance;
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="users" size={18} />
        <h3>Éco-PTZ collectif sans avance de subventions</h3>
      </div>
      <div className="p-body">
        <Kv k="Taux de couverture par les aides" v={`${(r.tauxCouverture * 100).toFixed(1)} %`} />
        <Kv k="Fonds travaux mobilisé" v={fmtEuroFull(data.params.fondsTravaux)} />
        <Kv k="Reste à charge définitif collectif" v={fmtEuroFull(r.resteACharge)} />
        <Kv k="Reste à financer (prime CEE en fin de travaux)" v={fmtEuroFull(v.resteAFinancer)} strong />
        <Kv k={`Coût au tantième avant aides (/${data.params.totalTantiemes})`} v={fmtEuroFull(r.coutTantiemeAvant)} />
        <Kv k="Coût au tantième après aides publiques et fonds" v={fmtEuroFull(v.coutTantiemeApres)} />
        <ExemplesTable
          head={["Tantièmes", "Quote-part avant aides", "Reste à financer", `Mensualité ${data.params.dureeEcoPtzAns} ans`, "Prime CEE", "Prix de revient"]}
          rows={v.exemples.map((e) => [
            `${e.tantiemes}/${data.params.totalTantiemes}`,
            e.quotePartAvant,
            e.resteAFinancer,
            e.mensualiteEcoPtz,
            e.primeCee,
            e.prixRevient,
          ])}
        />
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
          Sans prêt d'avance : les subventions publiques sont perçues directement par la copropriété -
          aucun coût d'avance n'est facturé. Prix de revient = reste à financer − prime CEE.
        </p>
      </div>
    </div>
  );
}

function VarianteIndividuel({ r, data }: { r: NonNullable<ReturnType<typeof computePlanDefinitif>>; data: PlanDefinitifData }) {
  const pct = data.params.pctAvanceAides;
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="user" size={18} />
        <h3>Éco-PTZ individuel - appels de fonds {pct} % / {100 - pct} %</h3>
      </div>
      <div className="p-body">
        <Kv k={`${pct} % des aides publiques (déduites des appels)`} v={fmtEuroFull(r.individuel.aidesAvancees)} />
        <Kv k={`${100 - pct} % remboursés en fin de chantier`} v={fmtEuroFull(r.individuel.aidesFinChantier)} />
        <Kv k="Reste à charge définitif collectif" v={fmtEuroFull(r.resteACharge)} />
        <Kv k={`Appels de fonds (${pct} % des aides déduits)`} v={fmtEuroFull(r.individuel.appelsFonds)} strong />
        <Kv k="Coût au tantième après toutes aides et fonds" v={fmtEuroFull(r.individuel.coutTantiemeApresAides)} />
        <Kv k={`Coût au tantième avec ${pct} % des aides déduites`} v={fmtEuroFull(r.individuel.coutTantiemeAvecAvance)} />
        <ExemplesTable
          head={["Tantièmes", "Quote-part avant aides", "Appels de fonds", "Remboursé fin de chantier", `Mensualité ${data.params.dureeEcoPtzAns} ans`, "Prix de revient"]}
          rows={r.individuel.exemples.map((e) => [
            `${e.tantiemes}/${data.params.totalTantiemes}`,
            e.quotePartAvant,
            e.appelsFonds,
            e.remboursementFinChantier,
            e.mensualiteEcoPtz,
            e.prixRevient,
          ])}
        />
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
          Chaque copropriétaire finance sa quote-part (éco-PTZ individuel possible) ; {100 - pct} % des aides
          publiques lui sont remboursés à la fin du chantier.
        </p>
      </div>
    </div>
  );
}
