// Plan de financement global de la copropriété (scénario partagé par l'AMO).
// Quand le scénario est issu du PF définitif validé, chaque poste se déplie
// (feedback du 03/09/2026) : lots de travaux avec leur entreprise et leurs
// lignes de devis, honoraires et frais annexes, détail de chaque aide.
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { Cascade } from "@/components/Cascade";
import { fmtEuro, fmtEuroFull } from "@/lib/format";
import { readParams } from "@/api/scenarios";
import { usePlanDefinitifPartage, type Membership, type Scenario } from "@/api/portail";
import type { Bareme } from "@/lib/finance";
import { PHASES_MOE, type AideResult } from "@/lib/finance/planDefinitif";

/** Ligne « clé / valeur » dépliable : le contenu apparaît sous la ligne. */
function Depliant({
  label,
  value,
  strong,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const depliable = children != null;
  return (
    <div style={{ borderBottom: "1px dashed var(--border)" }}>
      <div
        className="kv"
        role={depliable ? "button" : undefined}
        tabIndex={depliable ? 0 : undefined}
        onClick={() => depliable && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (depliable && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        style={{ borderBottom: "none", cursor: depliable ? "pointer" : "default", alignItems: "center", gap: 8 }}
      >
        <span
          className="k"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            ...(strong ? { fontWeight: 700, color: "var(--fg1)" } : {}),
          }}
        >
          {depliable ? (
            <Icon name={open ? "chevronDown" : "chevronRight"} size={14} style={{ flexShrink: 0 }} />
          ) : (
            <span style={{ width: 14, flexShrink: 0 }}></span>
          )}
          {label}
        </span>
        <span className="v" style={strong ? { fontFamily: "var(--font-display)" } : undefined}>
          {value}
        </span>
      </div>
      {open && depliable && (
        <div className="fade" style={{ margin: "0 0 10px 20px", paddingLeft: 12, borderLeft: "2px solid var(--border)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Sous-ligne d'un détail : libellé + précision + montant. */
function SousLigne({ l, sub, v }: { l: ReactNode; sub?: ReactNode; v?: ReactNode }) {
  return (
    <div className="kv" style={{ fontSize: 13, padding: "7px 0" }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ color: "var(--fg1)" }}>{l}</span>
        {sub && <span style={{ display: "block", color: "var(--fg-muted)", fontSize: 12 }}>{sub}</span>}
      </span>
      {v != null && <span className="v" style={{ whiteSpace: "nowrap", marginLeft: 12 }}>{v}</span>}
    </div>
  );
}

const PHASE_LABEL: Record<string, string> = Object.fromEntries(
  PHASES_MOE.map((p) => [p.id, p.label.replace(/^\d\.\s*/, "")])
);

export function PlanCopro({
  membership,
  scenarios,
  bareme,
}: {
  membership: Membership;
  scenarios: Scenario[];
  bareme: Bareme | null;
}) {
  const [scnId, setScnId] = useState<string | null>(null);
  const scn = scenarios.find((s) => s.id === scnId) ?? scenarios[0] ?? null;
  const copro = membership.copro;
  const { data: pf } = usePlanDefinitifPartage(scn?.plan_definitif_id ?? null);
  // Lots de travaux dépliés (lignes de devis)
  const [lotsOuverts, setLotsOuverts] = useState<Set<number>>(new Set());
  const toggleLot = (n: number) =>
    setLotsOuverts((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  if (!scn || !bareme) {
    return (
      <div className="fade">
        <h1 className="sec-title">Plan de financement global</h1>
        <div className="cc-next">
          <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
          <span>Le plan de financement global sera visible ici dès qu'un scénario sera partagé par votre AMO.</span>
        </div>
      </div>
    );
  }

  const params = readParams(scn.params, bareme);
  const coutTotal = params.travaux + params.honoraires + params.aleas;
  const tauxMpr = params.mprCoproPct + (params.bonusPassoire ? bareme.mprCopro.bonusPassoire : 0);
  const mprCopro = (params.travaux * tauxMpr) / 100;
  const deductions = mprCopro + params.cee + params.fonds;
  const resteCollectif = coutTotal - deductions;

  const resultat = (scn.resultat ?? {}) as { aidesIndiv?: number };
  const aidesIndiv = typeof resultat.aidesIndiv === "number" ? resultat.aidesIndiv : null;

  const aides = [
    { l: `Subventions préfinançables (MPR Copro ${tauxMpr} %)`, v: mprCopro, k: "primary" as const },
    { l: "Fonds (Alur, provisions)", v: params.fonds, k: "blue" as const },
    { l: "CEE (Certificats d'Économie d'Énergie)", v: params.cee, k: "blue" as const },
  ];

  // Détail issu du PF définitif validé (absent pour un scénario simple)
  const pv = pf?.resultat ?? null;
  const pvData = pf?.data ?? null;
  const aidesPubliques: AideResult[] = pv ? pv.aides.filter((a) => a.publique && a.montant != null) : [];
  const aidesCee: AideResult[] = pv ? pv.aides.filter((a) => !a.publique && a.montant != null) : [];
  const aidesInfo: AideResult[] = pv ? pv.aides.filter((a) => a.montant == null) : [];
  const libelleAide = (a: AideResult) => (a.groupe && !a.libelle.startsWith(a.groupe) ? `${a.groupe} - ${a.libelle}` : a.libelle);

  return (
    <div className="fade">
      <h1 className="sec-title">Plan de financement global</h1>
      <p className="sec-sub">
        Scénario « {scn.name} » · {copro.name}
        {pf ? " · d'après le plan de financement définitif validé par votre AMO" : ""}
      </p>

      {scenarios.length > 1 && (
        <div className="qp-controls">
          <div className="qp-group">
            <span className="qp-lbl">Scénario</span>
            <div className="seg">
              {scenarios.map((s) => (
                <button key={s.id} className={s.id === scn.id ? "on" : ""} onClick={() => setScnId(s.id)}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="split">
        <div className="card-xl">
          <div className="cx-head">
            <Icon name="barChart" size={20} style={{ color: "var(--accent)" }} />
            <h2>Du coût total au reste à charge</h2>
            <span style={{ flex: 1 }}></span>
            {copro.gain_pct != null && (
              <Badge kind="primary"><Icon name="trendingUp" size={12} />+{Number(copro.gain_pct)} %</Badge>
            )}
          </div>
          <div className="cx-body">
            <Cascade
              total={{ l: "Coût total de l'opération (TTC)", v: coutTotal }}
              rows={aides}
              reste={{ l: "Reste à charge collectif", v: resteCollectif }}
            />
            {aidesIndiv != null && (
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 13 }}>
                <div className="casc-row">
                  <div className="cr-top">
                    <span className="cr-lbl">
                      <span className="sw" style={{ background: "var(--color-primary-500)" }}></span>
                      − Aides individuelles cumulées (MaPrimeRénov')
                    </span>
                    <span className="cr-val minus">− {fmtEuro(aidesIndiv)}</span>
                  </div>
                  <div className="casc-track">
                    <i style={{ width: (aidesIndiv / coutTotal) * 100 + "%", background: "var(--color-primary-500)" }}></i>
                  </div>
                </div>
                <div className="casc-reste">
                  <span className="l">Reste à charge net réparti</span>
                  <span className="v">{fmtEuro(resteCollectif - aidesIndiv)}</span>
                </div>
              </div>
            )}
            <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 16, marginBottom: 0 }}>
              <Icon name="leaf" size={13} /> Les CEE sont versés à la fin du chantier : ils réduisent le reste à
              charge final mais pas le montant à financer avant travaux.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card-xl">
            <div className="cx-head">
              <Icon name="euro" size={19} />
              <h2 style={{ fontSize: 18 }}>Détail du coût</h2>
              {pv && (
                <>
                  <span style={{ flex: 1 }}></span>
                  <span className="se-small" style={{ color: "var(--fg-muted)" }}>cliquez pour déplier</span>
                </>
              )}
            </div>
            <div className="cx-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
              <Depliant label="Travaux" value={fmtEuro(params.travaux)}>
                {pv && pvData ? (
                  <>
                    {pv.lots.map((lot) => {
                      const lignes = pvData.lots.find((l) => l.numero === lot.numero)?.lignes ?? [];
                      const ouvert = lotsOuverts.has(lot.numero);
                      return (
                        <div key={lot.numero}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleLot(lot.numero)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleLot(lot.numero);
                              }
                            }}
                            style={{ cursor: lignes.length ? "pointer" : "default" }}
                          >
                            <SousLigne
                              l={
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                  {lignes.length > 0 && <Icon name={ouvert ? "chevronDown" : "chevronRight"} size={12} />}
                                  <b>Lot {lot.numero}</b> - {lot.titre}
                                </span>
                              }
                              sub={lot.entreprise ? `Entreprise : ${lot.entreprise}` : "Entreprise à désigner après consultation"}
                              v={fmtEuro(lot.totalTtc)}
                            />
                          </div>
                          {ouvert && lignes.length > 0 && (
                            <div className="fade" style={{ margin: "0 0 6px 18px", paddingLeft: 10, borderLeft: "2px solid var(--border)" }}>
                              {lignes
                                .filter((l) => l.montantHt !== 0)
                                .map((l, i) => (
                                  <SousLigne
                                    key={i}
                                    l={l.designation || "Ligne de devis"}
                                    sub={`HT · TVA ${l.tvaPct} %${l.retenu ? "" : " · hors assiette MaPrimeRénov'"}`}
                                    v={fmtEuro(l.montantHt)}
                                  />
                                ))}
                              {lot.remise > 0 && <SousLigne l="Remise commerciale" v={"− " + fmtEuro(lot.remise)} />}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {pv.lots.length === 0 && <SousLigne l="Aucun lot de travaux renseigné." />}
                    <SousLigne l="Total travaux TTC" v={<b>{fmtEuro(pv.totalTravauxTtc)}</b>} />
                  </>
                ) : (
                  <SousLigne l="Le détail par lot de travaux (entreprises, lignes de devis) sera disponible dès que votre AMO aura validé le plan de financement définitif." />
                )}
              </Depliant>
              <Depliant label="Honoraires et frais annexes" value={fmtEuro(params.honoraires)}>
                {pv ? (
                  <>
                    {pv.moe.map((m, i) => (
                      <SousLigne
                        key={i}
                        l={m.designation}
                        sub={[m.entreprise, PHASE_LABEL[m.phase]].filter(Boolean).join(" · ")}
                        v={fmtEuro(m.montantTtc)}
                      />
                    ))}
                    {pv.moe.length === 0 && <SousLigne l="Aucun honoraire renseigné." />}
                  </>
                ) : (
                  <SousLigne l="Maîtrise d'œuvre, AMO, études et assurances - détail disponible après validation du plan définitif." />
                )}
              </Depliant>
              <Depliant label="Aléas" value={fmtEuro(params.aleas)}>
                <SousLigne
                  l={
                    pvData
                      ? `Provision pour imprévus : ${pvData.params.imprevusPct} % du montant TTC des travaux.`
                      : "Provision pour imprévus de chantier."
                  }
                />
              </Depliant>
              <Depliant label="Total TTC" value={fmtEuroFull(coutTotal)} strong />
            </div>
          </div>

          <div className="card-xl">
            <div className="cx-head">
              <Icon name="leaf" size={19} style={{ color: "var(--accent)" }} />
              <h2 style={{ fontSize: 18 }}>Aides mobilisées</h2>
              {pv && (
                <>
                  <span style={{ flex: 1 }}></span>
                  <span className="se-small" style={{ color: "var(--fg-muted)" }}>cliquez pour déplier</span>
                </>
              )}
            </div>
            <div className="cx-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
              <Depliant label={aides[0].l} value={fmtEuro(aides[0].v)}>
                {pv ? (
                  <>
                    {aidesPubliques.map((a) => (
                      <SousLigne key={a.id} l={libelleAide(a)} sub={a.commentaire} v={fmtEuro(a.montant ?? 0)} />
                    ))}
                    {aidesPubliques.length === 0 && <SousLigne l="Aucune aide collective publique retenue." />}
                    <SousLigne l="Total aides publiques" v={<b>{fmtEuro(pv.totalAidesPubliques)}</b>} />
                    {aidesInfo.length > 0 && (
                      <SousLigne
                        l={aidesInfo.map(libelleAide).join(", ")}
                        sub="Aides individuelles : montant selon le profil de chaque ménage - voir « Mes quotes-parts »."
                      />
                    )}
                  </>
                ) : (
                  <SousLigne l={`MaPrimeRénov' Copropriété : ${tauxMpr} % du montant des travaux. Le détail par aide sera disponible après validation du plan définitif.`} />
                )}
              </Depliant>
              <Depliant label={aides[1].l} value={fmtEuro(aides[1].v)}>
                <SousLigne
                  l={
                    pvData?.params.commentaireFondsTravaux ||
                    "Fonds travaux (loi Alur) et provisions déjà constitués par la copropriété, mobilisés sur l'opération."
                  }
                />
              </Depliant>
              <Depliant label={aides[2].l} value={fmtEuro(aides[2].v)}>
                {pv ? (
                  <>
                    {aidesCee.map((a) => (
                      <SousLigne key={a.id} l={libelleAide(a)} sub={a.commentaire} v={fmtEuro(a.montant ?? 0)} />
                    ))}
                    {aidesCee.length === 0 && <SousLigne l="Aucune prime CEE retenue." />}
                    <SousLigne l="Prime privée, versée à la réception des travaux." />
                  </>
                ) : (
                  <SousLigne l="Prime privée versée par un fournisseur d'énergie à la réception des travaux." />
                )}
              </Depliant>
              <Depliant
                label="Total déductions"
                value={<span style={{ color: "var(--color-primary-700)" }}>{fmtEuro(deductions)}</span>}
                strong
              />
            </div>
          </div>
          {copro.gain_pct != null && Number(copro.gain_pct) >= bareme.mprCopro.seuilMin && (
            <div className="cc-next">
              <Icon name="checkCircle" size={15} className="ico" />
              <span>
                Gain énergétique supérieur au seuil de {bareme.mprCopro.seuilMin} % :
                {Number(copro.gain_pct) >= bareme.mprCopro.seuilMajore ? " taux d'aides majorés." : " copropriété éligible aux aides collectives."}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
