// Plan de financement général de la copropriété (scénario partagé par l'AMO).
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { Cascade } from "@/components/Cascade";
import { fmtEuro, fmtEuroFull } from "@/lib/format";
import { readParams } from "@/api/scenarios";
import type { Membership, Scenario } from "@/api/portail";
import type { Bareme } from "@/lib/finance";

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

  if (!scn || !bareme) {
    return (
      <div className="fade">
        <h1 className="sec-title">Plan de financement de la copropriété</h1>
        <div className="cc-next">
          <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
          <span>Le plan de financement collectif sera visible ici dès qu'un scénario sera partagé par votre AMO.</span>
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

  return (
    <div className="fade">
      <h1 className="sec-title">Plan de financement de la copropriété</h1>
      <p className="sec-sub">Scénario « {scn.name} » · {copro.name}</p>

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
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card-xl">
            <div className="cx-head"><Icon name="euro" size={19} /><h2 style={{ fontSize: 18 }}>Détail du coût</h2></div>
            <div className="cx-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
              <div className="kv"><span className="k">Travaux</span><span className="v">{fmtEuro(params.travaux)}</span></div>
              <div className="kv"><span className="k">Honoraires</span><span className="v">{fmtEuro(params.honoraires)}</span></div>
              <div className="kv"><span className="k">Aléas</span><span className="v">{fmtEuro(params.aleas)}</span></div>
              <div className="kv">
                <span className="k" style={{ fontWeight: 700, color: "var(--fg1)" }}>Total TTC</span>
                <span className="v" style={{ fontFamily: "var(--font-display)" }}>{fmtEuroFull(coutTotal)}</span>
              </div>
            </div>
          </div>
          <div className="card-xl">
            <div className="cx-head"><Icon name="leaf" size={19} style={{ color: "var(--accent)" }} /><h2 style={{ fontSize: 18 }}>Aides mobilisées</h2></div>
            <div className="cx-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
              {aides.map((a) => (
                <div key={a.l} className="kv">
                  <span className="k" style={{ maxWidth: 200 }}>{a.l}</span>
                  <span className="v">{fmtEuro(a.v)}</span>
                </div>
              ))}
              <div className="kv">
                <span className="k" style={{ fontWeight: 700, color: "var(--fg1)" }}>Total déductions</span>
                <span className="v" style={{ color: "var(--color-primary-700)" }}>{fmtEuro(deductions)}</span>
              </div>
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
