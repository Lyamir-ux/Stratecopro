// Comparatif d'un PF estimatif à plusieurs scénarios (cas Le Rodin, 23/09/2026) :
// les scénarios importés ensemble côte à côte, recalculés par le moteur du PF
// (mêmes formules que le classeur), avec l'export Excel au format du chef de projet.
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { useCopro } from "@/api/copros";
import {
  archiverClasseurEstimatif,
  scenariosDuGroupe,
  scenariosEstimatifs,
  usePlansDefinitifs,
  type PlanDefinitif,
} from "@/api/planDefinitif";
import { fmtDate, fmtEuro, fmtEuroFull } from "@/lib/format";
import {
  alignerAides,
  alignerMoe,
  alignerTravaux,
  computePlanDefinitif,
  estAjustementTva,
  exportPlanEstimatif,
  PHASES_MOE,
  type PlanDefinitifResult,
  type ScenarioEstimatif,
} from "@/lib/finance";
import { useQueryClient } from "@tanstack/react-query";

const tdR: CSSProperties = { textAlign: "right", whiteSpace: "nowrap" };
const pct = (n: number) => `${(n * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

export default function PlanEstimatifPage() {
  const { id: coproId, groupeId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: c } = useCopro(coproId);
  const { data: plans, isLoading } = usePlansDefinitifs(coproId);
  const [archivage, setArchivage] = useState<"idle" | "pending" | "ok" | "ko">("idle");

  useCrumbs([
    { label: "Vos copropriétés", to: "/" },
    { label: c?.name ?? "…", to: `/copros/${coproId}/financement` },
    { label: "PF estimatif" },
  ]);

  const groupe: PlanDefinitif[] = useMemo(() => scenariosDuGroupe(plans, groupeId), [plans, groupeId]);
  const S: ScenarioEstimatif[] = useMemo(() => scenariosEstimatifs(groupe), [groupe]);
  const R: PlanDefinitifResult[] = useMemo(() => S.map((s) => computePlanDefinitif(s.data)), [S]);

  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;
  if (!groupe.length)
    return (
      <div className="page">
        <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate(`/copros/${coproId}/financement`)}>
          <Icon name="chevronLeft" size={16} />
          Financement
        </button>
        <p style={{ color: "var(--fg-muted)" }}>Ce plan de financement estimatif n'existe plus.</p>
      </div>
    );

  const d0 = S[0].data;
  const nomCopro = d0.infos.nomCopro || c?.name || "copro";
  const ouvrir = (p: PlanDefinitif) => navigate(`/copros/${coproId}/plan-definitif/${p.id}`);

  const doExport = () => {
    XLSX.writeFile(exportPlanEstimatif(S), `Plan de financement estimatif - ${nomCopro}.xlsx`);
  };
  const doArchiver = async () => {
    setArchivage("pending");
    try {
      await archiverClasseurEstimatif({ coproId: coproId!, coproNom: c?.name ?? nomCopro, scenarios: S, etat: "état courant" });
      void qc.invalidateQueries({ queryKey: ["fichiers", coproId] });
      setArchivage("ok");
    } catch {
      setArchivage("ko");
    }
  };

  // Scénario au reste à charge le plus bas (repère, pas une recommandation)
  const iMinRac = R.reduce((best, r, i) => (r.resteACharge < R[best].resteACharge ? i : best), 0);
  const ajustements = S.map((s) =>
    s.data.lots.reduce((t, lot) => t + lot.lignes.filter(estAjustementTva).reduce((u, l) => u + (l.tvaMontant ?? 0), 0), 0)
  );

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ---- barre d'actions ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate(`/copros/${coproId}/financement`)}>
          <Icon name="chevronLeft" size={16} />
          Financement
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontFamily: "var(--font-display)" }}>PF estimatif · {nomCopro}</h1>
        <span className="se-small" style={{ color: "var(--fg-muted)" }}>
          {groupe[0].source_fichier ? `importé de « ${groupe[0].source_fichier} » ` : "importé "}
          le {fmtDate(groupe[0].created_at)}
          {groupe[0].source_fichier_id ? " (archivé dans Fichiers)" : ""}
        </span>
        <span style={{ flex: 1 }}></span>
        <Badge kind="neutral">
          {S.length} scénario{S.length > 1 ? "s" : ""}
        </Badge>
        <button className="se-btn se-btn-secondary btn-sm" onClick={doExport}>
          <Icon name="download" size={15} />
          Exporter .xlsx
        </button>
        <button
          className="se-btn se-btn-ghost btn-sm"
          disabled={archivage === "pending"}
          title="Dépose l'export .xlsx des scénarios dans l'onglet Fichiers (dossier Plans de financement)"
          onClick={() => void doArchiver()}
        >
          <Icon name="folder" size={15} />
          {archivage === "pending"
            ? "Archivage…"
            : archivage === "ok"
              ? "Archivé dans Fichiers"
              : archivage === "ko"
                ? "Échec de l'archivage"
                : "Archiver dans Fichiers"}
        </button>
      </div>

      {/* ---- synthèse par scénario ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {S.map((s, k) => {
          const r = R[k];
          return (
            <div key={groupe[k].id} className="panel" style={{ display: "flex", flexDirection: "column" }}>
              <div className="p-head" style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>Scénario {s.ordre}</h3>
                  {s.libelle && (
                    <div className="se-small" style={{ color: "var(--fg2)", marginTop: 3 }}>
                      {s.libelle}
                    </div>
                  )}
                </div>
                <span style={{ flex: 1 }}></span>
                {S.length > 1 && k === iMinRac && <Badge kind="success">Reste à charge le plus bas</Badge>}
              </div>
              <div className="p-body" style={{ flex: 1 }}>
                <Kv k="Coût de l'opération TTC" v={fmtEuroFull(r.totalOperationTtc)} />
                <Kv k={`Aides (${pct(r.tauxCouverture)} de l'opération)`} v={fmtEuroFull(r.totalAides)} />
                <Kv k="Fonds travaux et montants déjà appelés" v={fmtEuroFull(s.data.params.fondsTravaux)} />
                <Kv k="Reste à charge collectif" v={fmtEuroFull(r.resteACharge)} strong />
                <Kv
                  k={`Coût au tantième après aides (/${s.data.params.totalTantiemes.toLocaleString("fr-FR")})`}
                  v={fmtEuroFull(r.collectif.coutTantiemeApres)}
                />
                <Kv k="Gain énergétique" v={`${r.performancePct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`} />
              </div>
              <div style={{ padding: "0 18px 16px" }}>
                <button className="se-btn se-btn-secondary btn-sm" onClick={() => ouvrir(groupe[k])}>
                  <Icon name="edit" size={14} />
                  Ouvrir le scénario
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- comparatif détaillé ---- */}
      <div className="panel">
        <div className="p-head">
          <Icon name="columns" size={18} />
          <h3>Comparatif détaillé</h3>
          <span style={{ flex: 1 }}></span>
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
            Les montants qui changent d'un scénario à l'autre sont en gras.
          </span>
        </div>
        <div className="p-body" style={{ padding: 0 }}>
          <ComparatifTable S={S} R={R} ajustements={ajustements} />
        </div>
      </div>
    </div>
  );
}

function Kv({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="kv">
      <span className="k" style={strong ? { fontWeight: 700, color: "var(--fg1)" } : undefined}>
        {k}
      </span>
      <span className="v" style={strong ? { fontFamily: "var(--font-display)", fontSize: 16 } : undefined}>
        {v}
      </span>
    </div>
  );
}

type Cell = number | string | null;

function ComparatifTable({ S, R, ajustements }: { S: ScenarioEstimatif[]; R: PlanDefinitifResult[]; ajustements: number[] }) {
  const travaux = alignerTravaux(S);
  const moe = alignerMoe(S);
  const aides = alignerAides(S).filter((a) => a.index.some((i, k) => i != null && R[k].aides[i].montant != null));
  const exemples = S[0].data.params.tantiemesExemples;
  const T = S[0].data.params.totalTantiemes;
  const rows: ReactNode[] = [];
  let n = 0;

  const section = (titre: string) =>
    rows.push(
      <tr key={`s${n++}`} style={{ cursor: "default", background: "var(--bg2)" }}>
        <td colSpan={S.length + 1} style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--fg2)" }}>
          {titre}
        </td>
      </tr>
    );
  const ligne = (
    libelle: ReactNode,
    valeurs: Cell[],
    opts: { total?: boolean; format?: (v: number) => string; note?: ReactNode } = {}
  ) => {
    const format = opts.format ?? fmtEuroFull;
    const nums = valeurs.map((v) => (typeof v === "number" ? Math.round(v * 100) : v));
    const differe = nums.some((v) => v !== nums[0]);
    rows.push(
      <tr key={`l${n++}`} style={{ cursor: "default", ...(opts.total ? { borderTop: "1px solid var(--border-strong)" } : {}) }}>
        <td style={opts.total ? { fontWeight: 700 } : undefined}>
          {libelle}
          {opts.note && (
            <div className="se-small" style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
              {opts.note}
            </div>
          )}
        </td>
        {valeurs.map((v, k) => (
          <td
            key={k}
            className="mono"
            style={{
              ...tdR,
              fontWeight: opts.total || differe ? 700 : 400,
              color: differe && !opts.total ? "var(--color-primary-700)" : undefined,
            }}
          >
            {v == null ? "-" : typeof v === "number" ? format(v) : v}
          </td>
        ))}
      </tr>
    );
  };

  section("Projet");
  ligne("Consommation énergie primaire projet (kWhEP/m²/an)", S.map((s) => s.data.infos.cepProjet), { format: (v) => v.toLocaleString("fr-FR") });
  ligne("Gain énergétique", R.map((r) => r.performancePct), { format: (v) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` });
  ligne("Passage d'étiquette", S.map((s) => (s.data.infos.etiquetteInitiale ? `${s.data.infos.etiquetteInitiale} → ${s.data.infos.etiquetteProjet}` : null)));

  section("Descriptif des travaux (HT)");
  for (const t of travaux) {
    const retenu = t.retenus.some(Boolean);
    ligne(
      <>
        {t.provisions ? "" : `Lot ${String(t.lotNumero).padStart(2, "0")} - `}
        {t.designation}
        {retenu && (
          <span className="se-small" style={{ color: "var(--color-primary-700)", marginLeft: 6 }} title="Retenu dans l'assiette MaPrimeRénov'">
            MPR
          </span>
        )}
      </>,
      t.montants
    );
  }
  ligne("Total travaux HT", R.map((r) => r.totalTravauxHt), { total: true });
  ligne("Travaux retenus (assiette MaPrimeRénov')", R.map((r) => r.assietteMprTravaux));
  ligne("Total travaux TTC", R.map((r) => r.totalTravauxTtc), {
    note: ajustements.some((a) => a !== 0)
      ? `TTC du classeur : dont ajustement de TVA ${ajustements.map((a) => fmtEuro(a)).join(" / ")}`
      : undefined,
  });
  ligne(
    `Total travaux TTC avec imprévus (${S.map((s) => String(s.data.params.imprevusPct).replace(".", ",")).filter((v, i, a) => a.indexOf(v) === i).join(" / ")} %)`,
    R.map((r) => r.totalTravauxTtcImprevus)
  );

  section("MOE et frais annexes (TTC)");
  for (const ph of PHASES_MOE) {
    const lignes = moe.filter((m) => m.phase === ph.id);
    if (!lignes.length) continue;
    // Les lignes identiques d'un scénario à l'autre sont résumées par phase ;
    // seules celles qui changent sont détaillées
    const detail = lignes.filter((m) => {
      const v = m.index.map((i, k) => (i == null ? null : Math.round(R[k].moe[i].montantTtc * 100)));
      return v.some((x) => x !== v[0]);
    });
    ligne(
      ph.label,
      R.map((r, k) =>
        lignes.reduce((s, m) => {
          const i = m.index[k];
          return s + (i == null ? 0 : r.moe[i].montantTtc);
        }, 0)
      )
    );
    for (const m of detail)
      ligne(
        <span style={{ paddingLeft: 14, color: "var(--fg2)" }}>dont {m.designation}</span>,
        m.index.map((i, k) => (i == null ? null : R[k].moe[i].montantTtc))
      );
  }
  ligne("Total MOE et frais annexes", R.map((r) => r.totalMoeTtc), { total: true });
  ligne("Coût de l'opération TTC avec imprévus", R.map((r) => r.totalOperationTtc), { total: true });

  section("Aides mobilisables");
  for (const a of aides)
    ligne(
      `${a.groupe ? `${a.groupe} · ` : ""}${a.libelle}`,
      a.index.map((i, k) => (i == null ? null : R[k].aides[i].montant))
    );
  ligne("Total aides", R.map((r) => r.totalAides), { total: true });
  ligne("Taux de couverture", R.map((r) => r.tauxCouverture), { format: pct });

  section("Reste à charge");
  ligne("Fonds travaux et montants déjà appelés", S.map((s) => s.data.params.fondsTravaux), {
    note: S[0].data.params.commentaireFondsTravaux,
  });
  ligne("Reste à charge définitif collectif", R.map((r) => r.resteACharge), { total: true });
  if (R.some((r) => r.primeCee !== 0)) ligne("Reste à financer (prime CEE versée en fin de travaux)", R.map((r) => r.collectif.resteAFinancer));
  ligne(`Coût au tantième avant aides (/${T.toLocaleString("fr-FR")})`, R.map((r) => r.coutTantiemeAvant));
  ligne(`Coût au tantième après aides (/${T.toLocaleString("fr-FR")})`, R.map((r) => r.collectif.coutTantiemeApres));

  if (exemples.length) {
    const duree = S[0].data.params.dureeEcoPtzAns;
    const avance = S.some((s) => s.data.variantes.collectif);
    section(`Exemples pour un lot (éco-PTZ collectif ${duree} ans${avance ? " avec avance de subventions" : ""})`);
    exemples.forEach((t, j) => {
      const ex = R.map((r) => r.collectif.exemples[j]);
      ligne(`${t} tantièmes - quote-part avant aides`, ex.map((e) => e?.quotePartAvant ?? null));
      ligne(`${t} tantièmes - reste à charge`, ex.map((e) => e?.resteAFinancer ?? null));
      ligne(`${t} tantièmes - mensualité sur ${duree} ans`, ex.map((e) => e?.mensualiteEcoPtz ?? null));
      ligne(`${t} tantièmes - subventions publiques`, ex.map((e) => e?.subventionsPubliques ?? null));
      if (avance)
        ligne(`${t} tantièmes - coût du prêt avance de subventions`, ex.map((e) => e?.coutPretAvance ?? null));
    });
  }

  section("Garde-fous");
  R[0].gardeFous.forEach((g, j) =>
    ligne(
      g.libelle,
      R.map((r) => {
        const x = r.gardeFous[j];
        return x ? `${fmtEuro(x.valeur)}${x.ok ? "" : " - dépassé"}` : null;
      })
    )
  );

  return (
    <div className="tablewrap">
      <table className="dossiers" style={{ fontSize: 12.5 }}>
        <thead>
          <tr>
            <th>Poste</th>
            {S.map((s) => (
              <th key={s.ordre} style={{ textAlign: "right", minWidth: 130 }}>
                Scénario {s.ordre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}
