// Onglet Financement de la fiche MOE (14/10/2026) - lecture seule : le PF
// définitif validé (un par bâtiment le cas échéant) ou, à défaut, le PF
// prévisionnel (scénarios du dernier PF estimatif). Synthèse des postes (même
// panneau que le syndic), puis les lots de travaux ligne à ligne avec leur TVA,
// et les frais annexes (maîtrise d'œuvre, études, assurances). Pas de
// répartition par copropriétaire : la MOE n'a pas accès aux lots nominatifs.
import { Fragment, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtEuroFull } from "@/lib/format";
import {
  couvreToutLaCopro,
  PHASES_MOE,
  tvaLigne,
  type PlanDefinitifData,
  type PlanDefinitifResult,
} from "@/lib/finance";
import { groupesEstimatifs, libellePerimetre, pfARepartir, plansValides, usePlansDefinitifs } from "@/api/planDefinitif";
import { useCompositionMoe } from "@/api/projetMoe";
import { PfDefinitifPanel } from "@/pages/Syndic/FinancementTab";
import type { Tables } from "@/lib/database.types";

const fmtTaux = (t: number) => `${t.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

/** Lots de travaux du plan : totaux par lot (HT, remise, TVA par taux, TTC), lignes au clic. */
function LotsTravauxPanel({ data, r }: { data: PlanDefinitifData; r: PlanDefinitifResult }) {
  const [ouverts, setOuverts] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setOuverts((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const tvaTotale = r.lots.reduce((s, l) => s + l.tvaParTaux.reduce((t, x) => t + x.montant, 0), 0);
  const remiseTotale = r.lots.reduce((s, l) => s + l.remise, 0);
  const imprevus = r.totalTravauxTtcImprevus - r.totalTravauxTtc;
  const tout = ouverts.size === r.lots.length && r.lots.length > 0;

  return (
    <div className="panel">
      <div className="p-head" style={{ flexWrap: "wrap" }}>
        <Icon name="hammer" size={18} />
        <h3>Lots de travaux</h3>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{r.lots.length}</span>
        <span style={{ flex: 1 }}></span>
        {r.lots.length > 0 && (
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() => setOuverts(tout ? new Set() : new Set(r.lots.map((_, i) => i)))}
          >
            <Icon name={tout ? "chevronUp" : "chevronDown"} size={14} />
            {tout ? "Tout replier" : "Tout déplier"}
          </button>
        )}
      </div>
      <div className="p-body" style={{ paddingTop: 0 }}>
        {r.lots.length === 0 ? (
          <p className="se-body" style={{ color: "var(--fg-muted)" }}>Aucun lot de travaux dans ce plan.</p>
        ) : (
          <div className="sf-wrap">
            <table className="dossiers moe-lots">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Entreprise</th>
                  <th className="num">Montant HT</th>
                  <th className="num">Remise</th>
                  <th className="num">TVA</th>
                  <th className="num">Montant TTC</th>
                </tr>
              </thead>
              <tbody>
                {r.lots.map((l, i) => {
                  const lot = data.lots[i];
                  const open = ouverts.has(i);
                  return (
                    <Fragment key={i}>
                      <tr className="moe-lot-ligne" onClick={() => toggle(i)} title={open ? "Replier le détail" : "Voir le détail du lot"}>
                        <td style={{ fontWeight: 600, whiteSpace: "normal", minWidth: 180 }}>
                          <Icon name={open ? "chevronDown" : "chevronRight"} size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                          Lot {String(l.numero).padStart(2, "0")} - {l.titre}
                        </td>
                        <td style={{ color: l.entreprise ? "var(--fg1)" : "var(--fg-muted)" }}>{l.entreprise || "-"}</td>
                        <td className="num">{fmtEuroFull(l.totalHt)}</td>
                        <td className="num">{l.remise > 0.005 ? `- ${fmtEuroFull(l.remise)}` : "-"}</td>
                        <td className="num" style={{ whiteSpace: "nowrap" }}>
                          {l.tvaParTaux.length === 0
                            ? "-"
                            : l.tvaParTaux.map((t) => (
                                <div key={t.taux}>
                                  <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>{fmtTaux(t.taux)}</span> {fmtEuroFull(t.montant)}
                                </div>
                              ))}
                        </td>
                        <td className="num" style={{ fontWeight: 700 }}>{fmtEuroFull(l.totalTtc)}</td>
                      </tr>
                      {open &&
                        (lot?.lignes ?? []).map((ligne, j) => {
                          const tva = tvaLigne(ligne);
                          return (
                            <tr key={`${i}-${j}`} className="moe-lot-detail">
                              <td colSpan={2} style={{ whiteSpace: "normal", paddingLeft: 30 }}>
                                {ligne.designation || <i>Sans désignation</i>}
                                {ligne.groupe && <span style={{ color: "var(--fg-muted)" }}> · {ligne.groupe}</span>}{" "}
                                {ligne.retenu && <Badge kind="primary">MPR</Badge>}
                              </td>
                              <td className="num">{fmtEuroFull(ligne.montantHt)}</td>
                              <td className="num" style={{ color: "var(--fg-muted)" }}>{fmtTaux(ligne.tvaPct)}</td>
                              <td className="num">{fmtEuroFull(tva)}</td>
                              <td className="num">{fmtEuroFull(ligne.montantHt + tva)}</td>
                            </tr>
                          );
                        })}
                      {open && lot && lot.remisePct > 0 && (
                        <tr className="moe-lot-detail">
                          <td colSpan={5} style={{ paddingLeft: 30, color: "var(--fg-muted)" }}>
                            Remise commerciale de {fmtTaux(lot.remisePct)} sur le total HT du lot (TVA calculée avant remise)
                          </td>
                          <td></td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total travaux</td>
                  <td></td>
                  <td className="num">{fmtEuroFull(r.lots.reduce((s, l) => s + l.totalHt, 0))}</td>
                  <td className="num">{remiseTotale > 0.005 ? `- ${fmtEuroFull(remiseTotale)}` : "-"}</td>
                  <td className="num">{fmtEuroFull(tvaTotale)}</td>
                  <td className="num">{fmtEuroFull(r.totalTravauxTtc)}</td>
                </tr>
                {imprevus > 0.005 && (
                  <tr>
                    <td colSpan={5}>Imprévus et aléas ({fmtTaux(data.params.imprevusPct)} du TTC)</td>
                    <td className="num">{fmtEuroFull(imprevus)}</td>
                  </tr>
                )}
                {imprevus > 0.005 && (
                  <tr>
                    <td colSpan={5}>Total travaux avec imprévus</td>
                    <td className="num">{fmtEuroFull(r.totalTravauxTtcImprevus)}</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
          <Icon name="help" size={13} /> Cliquez sur un lot pour voir ses lignes : montant HT, taux et montant de TVA,
          TTC. Le TTC d'un lot est son montant HT, remise déduite, plus la TVA (calculée avant remise, comme dans le
          classeur du plan). Le badge MPR signale les lignes retenues dans l'assiette MaPrimeRénov'.
        </p>
      </div>
    </div>
  );
}

/** Maîtrise d'œuvre et frais annexes du plan, ligne à ligne. */
function FraisAnnexesPanel({ data, r }: { data: PlanDefinitifData; r: PlanDefinitifResult }) {
  if (r.moe.length === 0) return null;
  const totalHt = r.moe.reduce((s, l) => s + l.montantHt, 0);
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="clipboard" size={18} />
        <h3>Maîtrise d'œuvre et frais annexes</h3>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{r.moe.length}</span>
      </div>
      <div className="p-body" style={{ paddingTop: 0 }}>
        <div className="sf-wrap">
          <table className="dossiers moe-lots">
            <thead>
              <tr>
                <th>Mission</th>
                <th>Entreprise</th>
                <th>Phase</th>
                <th className="num">Montant HT</th>
                <th className="num">TVA</th>
                <th className="num">Montant TTC</th>
              </tr>
            </thead>
            <tbody>
              {r.moe.map((l, i) => (
                <tr key={i} style={{ cursor: "default" }}>
                  <td style={{ fontWeight: 600, whiteSpace: "normal", minWidth: 180 }}>{l.designation}</td>
                  <td style={{ color: l.entreprise ? "var(--fg1)" : "var(--fg-muted)" }}>{l.entreprise || "-"}</td>
                  <td style={{ color: "var(--fg3)" }}>{PHASES_MOE.find((p) => p.id === l.phase)?.label.replace(/^\d\.\s*/, "") ?? l.phase}</td>
                  <td className="num">{fmtEuroFull(l.montantHt)}</td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>
                    <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>{fmtTaux(data.moe[i]?.tvaPct ?? 0)}</span>{" "}
                    {fmtEuroFull(l.montantTtc - l.montantHt)}
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtEuroFull(l.montantTtc)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td></td>
                <td></td>
                <td className="num">{fmtEuroFull(totalHt)}</td>
                <td className="num">{fmtEuroFull(r.totalMoeTtc - totalHt)}</td>
                <td className="num">{fmtEuroFull(r.totalMoeTtc)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

export function FinancementTabMoe({ c, presta }: { c: Tables<"coproprietes">; presta: Tables<"prestataires"> }) {
  const { data: plans, isLoading } = usePlansDefinitifs(c.id);
  const { data: compo } = useCompositionMoe(c.id, presta.id);
  const valides = useMemo(() => plansValides(plans), [plans]);
  // à défaut de PF définitif validé : les scénarios du PF estimatif le plus récent
  const groupe = useMemo(() => groupesEstimatifs(plans)[0] ?? null, [plans]);
  const estimatif = valides.length === 0;
  const choix = estimatif ? (groupe?.scenarios ?? []) : valides;
  const [selId, setSelId] = useState<string | null>(null);
  const plan = choix.find((p) => p.id === selId) ?? choix[0] ?? null;
  const pf = useMemo(() => (plan ? pfARepartir(plan) : null), [plan]);

  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  if (!plan || !pf) {
    return (
      <div className="placeholder-screen fade" style={{ minHeight: 320 }}>
        <div className="ps-ico">
          <Icon name="trendingUp" size={30} />
        </div>
        <h2>Aucun plan de financement pour l'instant</h2>
        <p>
          Le plan de financement prévisionnel, puis définitif, apparaîtra ici dès que l'équipe Strat Eco l'aura
          établi : postes de l'opération, lots de travaux avec leur TVA et frais annexes.
        </p>
      </div>
    );
  }

  const batiments = compo?.batiments ?? [];
  const perimetre = (p: Tables<"plans_definitifs">) =>
    couvreToutLaCopro(p.batiment_ids) ? null : libellePerimetre(p.batiment_ids, batiments, c.denomination_batiments);
  const libelleChoix = (p: Tables<"plans_definitifs">) => (estimatif ? p.nom : perimetre(p) ?? p.nom);

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {choix.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
            {estimatif ? "Scénarios du plan prévisionnel :" : "Un plan de financement par bâtiment :"}
          </span>
          <div className="seg" role="group" aria-label={estimatif ? "Choisir un scénario" : "Choisir un plan"}>
            {choix.map((p) => (
              <button key={p.id} className={p.id === plan.id ? "on" : ""} onClick={() => setSelId(p.id)}>
                {libelleChoix(p)}
              </button>
            ))}
          </div>
        </div>
      )}

      {estimatif && (
        <div className="panel" style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", borderLeft: "3px solid var(--color-primary-500)" }}>
          <Icon name="help" size={16} style={{ color: "var(--color-primary-700)", flex: "none" }} />
          <span style={{ fontSize: 13.5 }}>
            Plan de financement <b>prévisionnel</b> : chiffrage estimatif établi avant le choix des entreprises. Il
            sera remplacé par le plan définitif validé par l'équipe Strat Eco.
          </span>
        </div>
      )}

      <PfDefinitifPanel
        plan={plan}
        pv={pf.resultat}
        fondsTravaux={pf.data.params.fondsTravaux}
        perimetre={estimatif ? undefined : perimetre(plan) ?? undefined}
        estimatif={estimatif}
        note="Cliquez sur un poste pour dérouler son détail : travaux par entreprise, frais annexes par mission, aides de l'État par dispositif. Le détail des lots et de leur TVA suit."
      />
      <LotsTravauxPanel data={pf.data} r={pf.resultat} />
      <FraisAnnexesPanel data={pf.data} r={pf.resultat} />
    </div>
  );
}
