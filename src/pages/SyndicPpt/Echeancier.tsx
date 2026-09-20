// Échéancier PPT : copro × année sur 10 ans (montants TTC actualisés), filtre
// par gestionnaire en vue direction, export CSV et PDF (toutes les résidences,
// feedback Amir 20/09/2026).
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { telechargerCsv } from "@/lib/csv";
import { fmtEuroCourt } from "@/lib/format";
import { cleGestionnaire, echeancier } from "@/lib/ppt/indicateurs";
import { anneeCourante, coproLite, posteLite, TITRE_VERROU } from "./commun";
import type { PortefeuillePpt } from "./index";

export function EcheancierPpt({ pf }: { pf: PortefeuillePpt }) {
  const navigate = useNavigate();
  const annee = anneeCourante();
  const annees = Array.from({ length: 11 }, (_, i) => annee + i);
  const [gest, setGest] = useState<string>("tous");
  const source = pf.direction ? pf.copros : pf.accessibles;
  const gestionnaires = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of source) m.set(cleGestionnaire(c), c.gestionnaire_nom?.trim() || "Non attribué");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [source]);
  const copros = gest === "tous" ? source : source.filter((c) => cleGestionnaire(c) === gest);
  const lignes = useMemo(
    () => echeancier(copros.map(coproLite), pf.postes.map(posteLite), pf.params, annee).filter((l) => l.total > 0 || pf.postes.some((p) => p.ppt_copro_id === l.copro.id)),
    [copros, pf.postes, pf.params, annee]
  );
  const totaux = annees.map((a) => lignes.reduce((s, l) => s + (l.parAnnee.get(a) ?? 0), 0));
  const total = lignes.reduce((s, l) => s + l.total, 0);
  const accesDe = new Map(pf.copros.map((c) => [c.id, c]));
  const [pdfBusy, setPdfBusy] = useState(false);
  const exporterPdf = async () => {
    setPdfBusy(true);
    try {
      const { genererEcheancierPortefeuillePdf } = await import("@/lib/pdf/echeancierPpt");
      const { telechargerPdfBytes } = await import("@/lib/pdf/planIndividuel");
      const { parametresDepuisOrg } = await import("@/lib/ppt/formules");
      const bytes = await genererEcheancierPortefeuillePdf({
        nomEnseigne: pf.nomEnseigne ?? null,
        gestionnaire: gest === "tous" ? null : (gestionnaires.find(([k]) => k === gest)?.[1] ?? null),
        lignes: lignes.map((l) => ({ nom: l.copro.nom, gestionnaire_nom: l.copro.gestionnaire_nom, nb_logements: l.copro.nb_logements, parAnnee: l.parAnnee, total: l.total })),
        annees,
        params: parametresDepuisOrg(pf.params, annee),
        annee,
      });
      telechargerPdfBytes(bytes, `Echeancier PPT - portefeuille${pf.nomEnseigne ? ` - ${pf.nomEnseigne.replace(/[\/:*?"<>|]+/g, "-")}` : ""} - ${annee}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="page fade" style={{ padding: 0 }}>
      <h1 className="sec-title">Échéancier des travaux</h1>
      <p className="sec-sub">Montants TTC par année, actualisés à {pf.params.inflation_pct.toLocaleString("fr-FR")} % par an depuis {annee}, honoraires de maîtrise d'œuvre et de syndic compris. Un poste rejeté figure à l'année de sa nouvelle présentation.</p>

      <div className="panel">
        <div className="p-head">
          <Icon name="calendar" size={18} />
          <h3>{lignes.length} copropriété{lignes.length > 1 ? "s" : ""}</h3>
          <span style={{ flex: 1 }}></span>
          {pf.direction && gestionnaires.length > 1 && (
            <select className="edit-inp" style={{ maxWidth: 220 }} value={gest} onChange={(e) => setGest(e.target.value)}>
              <option value="tous">Tous les gestionnaires</option>
              {gestionnaires.map(([k, nom]) => (
                <option key={k} value={k}>{nom}</option>
              ))}
            </select>
          )}
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() =>
              telechargerCsv(
                `echeancier-ppt-${annee}.csv`,
                ["Copropriété", "Gestionnaire", "Logements", ...annees.map(String), "Total TTC"],
                lignes.map((l) => [l.copro.nom, l.copro.gestionnaire_nom ?? "", l.copro.nb_logements ?? "", ...annees.map((a) => l.parAnnee.get(a) ?? 0), l.total])
              )
            }
          >
            <Icon name="download" size={13} />
            CSV
          </button>
          <button className="se-btn se-btn-primary btn-sm" disabled={pdfBusy || lignes.length === 0} onClick={() => void exporterPdf()} title="Échéancier de toutes les copropriétés au format PDF">
            <Icon name="fileText" size={13} />
            {pdfBusy ? "PDF en cours…" : "Exporter en PDF"}
          </button>
        </div>
        <div className="p-body" style={{ paddingTop: 0 }}>
          <div className="tablewrap">
            <table className="plans">
              <thead>
                <tr>
                  <th>Copropriété</th>
                  {annees.map((a) => (
                    <th key={a}>{a}{a === annee + 10 ? " +" : ""}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => {
                  const c = accesDe.get(l.copro.id);
                  const acces = c?.acces ?? false;
                  return (
                    <tr key={l.copro.id} onClick={acces ? () => navigate(`/syndic/ppt/copros/${l.copro.id}`) : undefined} style={{ cursor: acces ? "pointer" : "default", opacity: acces ? 1 : 0.55 }} title={acces || !c ? undefined : TITRE_VERROU(c)}>
                      <td style={{ fontWeight: 600 }}>
                        {l.copro.nom}
                        {pf.direction && l.copro.gestionnaire_nom && <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 400 }}>{l.copro.gestionnaire_nom}</span>}
                      </td>
                      {annees.map((a) => (
                        <td key={a} className="mono">{l.parAnnee.get(a) ? fmtEuroCourt(l.parAnnee.get(a)) : ""}</td>
                      ))}
                      <td className="mono" style={{ fontWeight: 600 }}>{l.total ? fmtEuroCourt(l.total) : "-"}</td>
                    </tr>
                  );
                })}
                {lignes.length > 0 && (
                  <tr className="tot">
                    <td>Total</td>
                    {totaux.map((t, i) => (
                      <td key={i} className="mono">{t ? fmtEuroCourt(t) : ""}</td>
                    ))}
                    <td className="mono">{fmtEuroCourt(total)}</td>
                  </tr>
                )}
                {lignes.length === 0 && (
                  <tr>
                    <td colSpan={annees.length + 2} style={{ color: "var(--fg-muted)", textAlign: "left" }}>Aucun poste programmé : les postes apparaissent une fois le PPPT analysé et validé par Strat Eco.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
