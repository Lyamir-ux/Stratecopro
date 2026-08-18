// Mes quotes-parts : cascade par lot et par scénario partagé.
// Le reste à financer avant travaux exclut les CEE (versés à la fin du
// chantier) ; le fonds travaux déjà versé est isolé à titre indicatif.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { Cascade } from "@/components/Cascade";
import { fmtEuro } from "@/lib/format";
import {
  computeIndiv,
  lotTantiemes,
  totalTantiemes,
  useMonPlan,
  type Membership,
  type Scenario,
} from "@/api/portail";
import { readParams } from "@/api/scenarios";
import type { Bareme, Profil } from "@/lib/finance";
import type { SectionId } from "./index";
import { MentionsPrudence } from "./Mentions";

const USAGE_LABEL: Record<string, string> = {
  habitation: "Habitation",
  garage: "Garage",
  caves: "Caves",
  autres: "Autres",
};

export function QuotesParts({
  membership,
  scenarios,
  bareme,
  profil,
  go,
}: {
  membership: Membership;
  scenarios: Scenario[];
  scenario: Scenario | null;
  bareme: Bareme | null;
  plan: unknown;
  profil: Profil | null;
  go: (s: SectionId) => void;
}) {
  const lots = membership.lots;
  const [lotIdx, setLotIdx] = useState(0);
  const [scnId, setScnId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const scn = scenarios.find((s) => s.id === scnId) ?? scenarios[0] ?? null;
  const { data: plan } = useMonPlan(scn?.id, membership.coproprietaireId);

  if (!scn || !bareme) {
    return (
      <div className="fade">
        <h1 className="sec-title">Mes quotes-parts</h1>
        <p className="sec-sub">Estimation par lot et par scénario de travaux.</p>
        <div className="cc-next">
          <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
          <span>Aucun scénario n'a encore été partagé par votre AMO — vos quotes-parts apparaîtront ici.</span>
        </div>
      </div>
    );
  }

  const params = readParams(scn.params, bareme);
  const cle = params.cle;
  const lot = lots[Math.min(lotIdx, Math.max(0, lots.length - 1))] ?? null;
  const lotT = lot ? lotTantiemes(lot, cle) : 0;
  const totalT = totalTantiemes(lots, cle);

  const indiv = computeIndiv(scn, bareme, plan ?? null, lotT, profil);
  const totalIndiv = computeIndiv(scn, bareme, plan ?? null, totalT, profil);

  const telechargerPdf = async () => {
    setPdfBusy(true);
    try {
      const { genererPlanIndividuelPdf, telechargerPdfBytes } = await import("@/lib/pdf/planIndividuel");
      const bytes = await genererPlanIndividuelPdf({
        membership,
        scenarioName: scn.name,
        params,
        bareme,
        indiv: totalIndiv,
        profil,
        cle,
      });
      telechargerPdfBytes(bytes, `Plan de financement - ${membership.nom} - ${membership.copro.name}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="fade">
      <h1 className="sec-title">Mes quotes-parts</h1>
      <p className="sec-sub">
        {lots.length > 1 ? lots.length + " lots dans la copropriété" : "Votre lot"} · estimation par lot et par
        scénario de travaux{scenarios.length > 1 ? " partagé" : ""}.
      </p>

      <div className="qp-controls">
        {lots.length > 1 && (
          <div className="qp-group">
            <span className="qp-lbl">Lot</span>
            <div className="seg">
              {lots.map((l, i) => (
                <button key={l.id} className={i === lotIdx ? "on" : ""} onClick={() => setLotIdx(i)}>
                  Lot n°{l.num}
                </button>
              ))}
            </div>
          </div>
        )}
        {scenarios.length > 1 && (
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
        )}
        {lots.length > 1 && (
          <div className="qp-total">
            À financer avant travaux, cumulé ({lots.length} lots) · <b>{fmtEuro(totalIndiv.resteAvantTravaux)}</b>
          </div>
        )}
      </div>

      <div className="split">
        <div className="card-xl">
          <div className="cx-head">
            <Icon name="euro" size={20} style={{ color: "var(--accent)" }} />
            <h2>{lot ? `Lot n°${lot.num} — de votre quote-part à votre reste à charge` : "Votre quote-part"}</h2>
          </div>
          <div className="cx-body">
            <Cascade
              total={{ l: lot ? "Quote-part de travaux du lot n°" + lot.num : "Quote-part de travaux", v: indiv.quotePart }}
              rows={[
                { l: "MaPrimeRénov' individuelle" + (profil ? " (profil " + profil + ")" : ""), v: indiv.mprIndiv, k: "primary" },
                { l: "Subvention collective affectée", v: indiv.subvColl - indiv.fondsPart, k: "primary" },
                { l: "Fonds travaux déjà versés (à titre indicatif)", v: indiv.fondsPart, k: "blue" },
              ]}
              reste={{ l: "À financer avant travaux (hors CEE)", v: indiv.resteAvantTravaux }}
            />
            <div className="apres-chantier">
              <div className="ac-head">
                <Icon name="leaf" size={15} />
                Après le chantier
              </div>
              <p>
                Vos <b>CEE — {fmtEuro(indiv.cee)}</b> sont versés <b>à la fin du chantier</b>, une fois les
                travaux réceptionnés : ils ne réduisent pas le montant à financer avant travaux, mais viendront
                en déduction une fois perçus.
              </p>
              <div className="ac-reste">
                <span>Reste à charge final estimé (CEE déduits)</span>
                <b>{fmtEuro(indiv.reste)}</b>
              </div>
            </div>
            {!profil && (
              <div className="cc-next" style={{ marginTop: 18 }}>
                <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
                <span>
                  Estimation basée sur le profil <b>Jaune</b>. Complétez l'enquête sociale pour affiner vos aides.
                </span>
              </div>
            )}
            {!indiv.exact && profil && (
              <div className="cc-next" style={{ marginTop: 18 }}>
                <Icon name="alert" size={15} className="ico" />
                <span>Estimation au prorata des tantièmes — le plan individuel définitif sera publié par votre AMO.</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card-xl">
            <div className="cx-head">
              <Icon name="user" size={19} />
              <h2 style={{ fontSize: 18 }}>Lot sélectionné</h2>
            </div>
            <div className="cx-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
              {lot ? (
                <>
                  <div className="kv">
                    <span className="k">Lot</span>
                    <span className="v">n°{lot.num}{lot.batiment ? " · Bât. " + lot.batiment : ""}</span>
                  </div>
                  <div className="kv">
                    <span className="k">Usage</span>
                    <span className="v">{USAGE_LABEL[lot.usage] ?? lot.usage}</span>
                  </div>
                  <div className="kv">
                    <span className="k">Tantièmes</span>
                    <span className="v">{lotT}/1000</span>
                  </div>
                </>
              ) : (
                <p className="se-small">Aucun lot rattaché à votre compte.</p>
              )}
              <div className="kv">
                <span className="k">Scénario</span>
                <span className="v"><Badge kind="primary" dot>{scn.name}</Badge></span>
              </div>
              <div className="kv">
                <span className="k">Profil MaPrimeRénov'</span>
                <span className="v">
                  {profil ? <Badge kind="primary" dot>{profil}</Badge> : <span style={{ color: "var(--fg-muted)" }}>à déterminer</span>}
                </span>
              </div>
            </div>
          </div>
          <button className="se-btn se-btn-secondary" onClick={() => go("pret")}>
            <Icon name="trendingUp" size={17} />Financer mon reste à charge
          </button>
          <button className="se-btn se-btn-ghost" onClick={() => void telechargerPdf()} disabled={pdfBusy}>
            <Icon name="download" size={17} />
            {pdfBusy ? "Génération…" : "Télécharger mon plan (PDF)"}
          </button>
        </div>
      </div>

      <MentionsPrudence />
    </div>
  );
}
