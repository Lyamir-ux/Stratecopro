// File de revue des PPPT (espace AMO) - /ppt
// Tous les rapports déposés par les cabinets, par statut et par enseigne. La
// revue et la validation sont réservées au dirigeant (is_dirigeant en base) ;
// les autres AMO consultent.
// Le type d'un document est deviné au dépôt d'après le nom du fichier : seuls
// un PPPT et un PPT adopté passent par l'analyse, les autres documents sont
// rangés dans la copropriété. Rien ne disparaît pour autant : ils ont leur vue
// « Autres documents », la recherche porte sur tous les dépôts et le dirigeant
// peut requalifier un document mal deviné pour le ramener dans la file.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { telechargerPptRapport, useRequalifierPptRapport, usePptCopros, usePptRapportsRevue, type RapportRevue, type TypeRapport } from "@/api/ppt";
import { TYPES_DEPOT } from "@/lib/ppt/depot";
import { aRevoir, filtrerRevue, requalifiable } from "@/lib/ppt/fileRevue";
import { STATUT_RAPPORT_LABEL, TYPE_RAPPORT_LABEL } from "@/lib/ppt/referentiels";
import { StatutRapportBadge, VerdictBadge, fmtDateCourte } from "@/pages/SyndicPpt/commun";
import { CorrigerDocument, type DocumentACorriger } from "@/pages/SyndicPpt/CorrigerDocument";

const STATUTS = ["depose", "a_relire", "valide", "rejete", "echec"] as const;

export default function FileRevue() {
  useCrumbs([{ label: "Suivi PPT" }]);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: rapports, isLoading } = usePptRapportsRevue();
  const { data: copros } = usePptCopros();
  const requalifier = useRequalifierPptRapport();
  const [statut, setStatut] = useState<string>("a_traiter");
  const [enseigne, setEnseigne] = useState<string>("toutes");
  const [recherche, setRecherche] = useState("");
  // correction d'un dépôt mal rattaché (copropriété, type, nom du fichier) - 0081
  const [aCorriger, setACorriger] = useState<DocumentACorriger | null>(null);

  const tous = rapports ?? [];
  const analysables = tous.filter(aRevoir);
  const autres = tous.filter((r) => !aRevoir(r));
  const n = (s: string) => analysables.filter((r) => r.statut === s).length;
  const enseignes = useMemo(() => [...new Set(tous.map((r) => r.enseigne).filter((e): e is string => !!e))].sort((a, b) => a.localeCompare(b, "fr")), [tous]);

  // la recherche porte sur tous les dépôts, filtre de statut ignoré : on doit
  // retrouver un document par le nom de la copropriété ou du fichier, où qu'il soit
  const q = recherche.trim();
  const lignes = filtrerRevue(tous, statut, enseigne, recherche);

  const cible = (r: RapportRevue) => (aRevoir(r) || !r.copro ? `/ppt/rapports/${r.id}` : `/syndic/ppt/copros/${r.copro.id}/documents`);

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
          <input
            className="edit-inp"
            style={{ maxWidth: 220 }}
            placeholder="Rechercher une copropriété, un fichier…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
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
            <button className={statut === "autres" ? "on" : ""} onClick={() => setStatut("autres")} title="Documents déposés qui ne passent pas par l'analyse : tableau PPT, DPE collectif, PV d'AG, autre">
              Autres documents{autres.length ? ` (${autres.length})` : ""}
            </button>
            <button className={statut === "tous" ? "on" : ""} onClick={() => setStatut("tous")}>Tous</button>
          </div>
        </div>
        <div className="p-body" style={{ paddingTop: 0 }}>
          {q && (
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: "10px 0 0" }}>
              Recherche sur l'ensemble des dépôts, filtre de statut ignoré : {lignes.length} document{lignes.length > 1 ? "s" : ""}.
            </p>
          )}
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
                    <tr key={r.id} onClick={() => navigate(cible(r))}>
                      <td style={{ fontWeight: 600 }}>
                        {r.copro?.nom ?? "-"}
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 400 }}>
                          {[r.copro?.commune, r.copro?.gestionnaire_nom, r.copro?.nb_logements ? `${r.copro.nb_logements} logts` : null].filter(Boolean).join(" · ")}
                        </span>
                      </td>
                      <td>{r.enseigne ?? <span style={{ color: "var(--fg-muted)" }}>-</span>}</td>
                      <td>
                        {requalifiable(r, !!profile?.dirigeant) ? (
                          <select
                            className="edit-inp sm"
                            style={{ maxWidth: 190, fontSize: 12 }}
                            title="Type de document deviné au dépôt - le corriger ramène un PPPT dans la file d'analyse"
                            value={r.type}
                            disabled={requalifier.isPending}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => { e.stopPropagation(); void requalifier.mutateAsync({ rapportId: r.id, type: e.target.value as TypeRapport }); }}
                          >
                            {TYPES_DEPOT.map((t) => <option key={t} value={t}>{TYPE_RAPPORT_LABEL[t]}</option>)}
                          </select>
                        ) : (
                          <Badge kind="neutral">{TYPE_RAPPORT_LABEL[r.type] ?? r.type}</Badge>
                        )}
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                      </td>
                      <td>{fmtDateCourte(r.depose_le)}</td>
                      <td><StatutRapportBadge statut={r.statut} /></td>
                      <td><VerdictBadge verdict={r.verdict} /></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {r.statut !== "valide" && (
                          <button className="icon-btn" title="Corriger : copropriété, type ou nom du fichier" onClick={(e) => { e.stopPropagation(); setACorriger(r); }}><Icon name="edit" size={16} /></button>
                        )}
                        <button className="icon-btn" title="Télécharger le document" onClick={(e) => { e.stopPropagation(); void telechargerPptRapport(r); }}><Icon name="download" size={16} /></button>
                        <button className="icon-btn" title={aRevoir(r) ? "Ouvrir la revue" : "Ouvrir la copropriété"}><Icon name="arrowRight" size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {lignes.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ color: "var(--fg-muted)", cursor: "default" }}>
                        {q
                          ? "Aucun document ne correspond à cette recherche."
                          : statut === "a_traiter"
                            ? "Rien à traiter : aucun PPPT en attente d'analyse ou de revue."
                            : statut === "autres"
                              ? "Aucun document hors analyse."
                              : "Aucun rapport dans cette vue."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {!q && statut === "a_traiter" && autres.length > 0 && (
            <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
              <Icon name="inbox" size={12} /> {autres.length} autre{autres.length > 1 ? "s" : ""} document{autres.length > 1 ? "s" : ""} déposé{autres.length > 1 ? "s" : ""} hors analyse (tableau PPT, DPE, PV d'AG){" "}
              <button className="se-btn se-btn-ghost btn-sm" style={{ padding: "0 6px" }} onClick={() => setStatut("autres")}>voir</button>
              {profile?.dirigeant ? " - si l'un d'eux est en réalité un PPPT, corrigez son type dans la colonne Document pour le ramener ici." : ""}
            </p>
          )}
          {!profile?.dirigeant && (
            <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
              <Icon name="lock" size={12} /> L'import du JSON, la revue et la validation sont réservés au dirigeant ; vous pouvez consulter les rapports.
            </p>
          )}
        </div>
      </div>

      {aCorriger && <CorrigerDocument rapport={aCorriger} onClose={() => setACorriger(null)} />}
    </div>
  );
}
