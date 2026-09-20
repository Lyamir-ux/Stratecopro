// File de revue des PPPT (espace AMO) - /ppt
// Tous les rapports déposés par les cabinets, par statut et par enseigne. La
// revue et la validation sont réservées au dirigeant (is_dirigeant en base) ;
// les autres AMO consultent.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { telechargerPptRapport, usePptCopros, usePptRapportsRevue } from "@/api/ppt";
import { STATUT_RAPPORT_LABEL, TYPE_RAPPORT_LABEL } from "@/lib/ppt/referentiels";
import { StatutRapportBadge, VerdictBadge, fmtDateCourte } from "@/pages/SyndicPpt/commun";

const STATUTS = ["depose", "a_relire", "valide", "rejete", "echec"] as const;

export default function FileRevue() {
  useCrumbs([{ label: "Suivi PPT" }]);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: rapports, isLoading } = usePptRapportsRevue();
  const { data: copros } = usePptCopros();
  const [statut, setStatut] = useState<string>("a_traiter");
  const [enseigne, setEnseigne] = useState<string>("toutes");

  const tous = rapports ?? [];
  const analysables = tous.filter((r) => r.type === "pppt" || r.type === "ppt_adopte");
  const n = (s: string) => analysables.filter((r) => r.statut === s).length;
  const enseignes = useMemo(() => [...new Set(tous.map((r) => r.enseigne).filter((e): e is string => !!e))].sort((a, b) => a.localeCompare(b, "fr")), [tous]);
  const lignes = tous
    .filter((r) => (statut === "a_traiter" ? ["depose", "en_analyse", "a_relire", "echec"].includes(r.statut) && (r.type === "pppt" || r.type === "ppt_adopte") : statut === "tous" ? true : r.statut === statut))
    .filter((r) => enseigne === "toutes" || r.enseigne === enseigne);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Suivi PPT - revue des rapports</h1>
          <p className="page-sub">
            {copros?.length ?? 0} copropriété{(copros?.length ?? 0) > 1 ? "s" : ""} suivies · dépôt par les cabinets, analyse locale avec le skill pppt-verif, import du JSON, revue et validation par le dirigeant
          </p>
        </div>
        <button className="se-btn se-btn-secondary btn-sm" onClick={() => navigate("/syndic/ppt")}>
          <Icon name="building" size={14} />
          Aperçu espace syndic
        </button>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="k-top"><span className="k-ico"><Icon name="inbox" size={18} /></span><span className="k-label">Déposés, à analyser</span></div><div className="k-val">{n("depose") + n("en_analyse")}</div><div className="k-foot">télécharger le PDF, lancer le skill, importer le JSON</div></div>
        <div className="kpi"><div className="k-top"><span className="k-ico"><Icon name="eye" size={18} /></span><span className="k-label">À relire</span></div><div className="k-val">{n("a_relire")}</div><div className="k-foot">analyse importée, revue en attente</div></div>
        <div className="kpi"><div className="k-top"><span className="k-ico"><Icon name="checkCircle" size={18} /></span><span className="k-label">Validés</span></div><div className="k-val">{n("valide")}</div><div className="k-foot">visibles des cabinets</div></div>
        <div className="kpi"><div className="k-top"><span className="k-ico blue"><Icon name="x" size={18} /></span><span className="k-label">Rejetés / échecs</span></div><div className="k-val">{n("rejete") + n("echec")}</div><div className="k-foot">document inexploitable ou hors périmètre</div></div>
      </div>

      <div className="panel">
        <div className="p-head">
          <Icon name="fileCheck" size={18} />
          <h3>Rapports</h3>
          <span style={{ flex: 1 }}></span>
          {enseignes.length > 1 && (
            <select className="edit-inp" style={{ maxWidth: 220 }} value={enseigne} onChange={(e) => setEnseigne(e.target.value)}>
              <option value="toutes">Toutes les enseignes</option>
              {enseignes.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          )}
          <div className="opt-mini">
            <button className={statut === "a_traiter" ? "on" : ""} onClick={() => setStatut("a_traiter")}>À traiter</button>
            {STATUTS.filter((s) => s !== "depose" && s !== "a_relire").map((s) => (
              <button key={s} className={statut === s ? "on" : ""} onClick={() => setStatut(s)}>{STATUT_RAPPORT_LABEL[s]}</button>
            ))}
            <button className={statut === "tous" ? "on" : ""} onClick={() => setStatut("tous")}>Tous</button>
          </div>
        </div>
        <div className="p-body" style={{ paddingTop: 0 }}>
          {isLoading ? (
            <p className="se-small" style={{ color: "var(--fg-muted)" }}>Chargement…</p>
          ) : (
            <div className="tablewrap">
              <table className="dossiers" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Copropriété</th>
                    <th>Enseigne</th>
                    <th>Document</th>
                    <th>Déposé le</th>
                    <th>Statut</th>
                    <th>Verdict</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((r) => (
                    <tr key={r.id} onClick={() => navigate(`/ppt/rapports/${r.id}`)}>
                      <td style={{ fontWeight: 600 }}>
                        {r.copro?.nom ?? "-"}
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 400 }}>
                          {[r.copro?.commune, r.copro?.gestionnaire_nom, r.copro?.nb_logements ? `${r.copro.nb_logements} logts` : null].filter(Boolean).join(" · ")}
                        </span>
                      </td>
                      <td>{r.enseigne ?? <span style={{ color: "var(--fg-muted)" }}>-</span>}</td>
                      <td>
                        <Badge kind="neutral">{TYPE_RAPPORT_LABEL[r.type] ?? r.type}</Badge>
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                      </td>
                      <td>{fmtDateCourte(r.depose_le)}</td>
                      <td><StatutRapportBadge statut={r.statut} /></td>
                      <td><VerdictBadge verdict={r.verdict} /></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="icon-btn" title="Télécharger le PDF" onClick={(e) => { e.stopPropagation(); void telechargerPptRapport(r); }}><Icon name="download" size={16} /></button>
                        <button className="icon-btn" title="Ouvrir la revue"><Icon name="arrowRight" size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {lignes.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ color: "var(--fg-muted)", cursor: "default" }}>
                        {statut === "a_traiter" ? "Rien à traiter : aucun PPPT en attente d'analyse ou de revue." : "Aucun rapport dans cette vue."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {!profile?.dirigeant && (
            <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
              <Icon name="lock" size={12} /> L'import du JSON, la revue et la validation sont réservés au dirigeant ; vous pouvez consulter les rapports.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
