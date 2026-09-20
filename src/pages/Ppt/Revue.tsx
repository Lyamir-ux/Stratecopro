// Revue d'un PPPT (dirigeant) - /ppt/rapports/:id
// 1. Télécharger le PDF, l'analyser en local avec le skill pppt-verif, importer
//    le JSON pppt-verif/1.0 produit (contrat strict : refus explicite).
// 2. Les contrôles déterministes de la plateforme sont rejoués sur le JSON et
//    la fiche à chaque modification ; l'éditeur corrige les postes et la fiche ;
//    chaque modification est journalisée (ppt_corrections) à l'enregistrement.
// 3. Valider (bloquants levés avec motif) ou rejeter. Le syndic ne voit rien
//    avant la validation.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import {
  telechargerPptRapport,
  useEnregistrerRevue,
  useImporterAnalyse,
  usePptAnalyse,
  usePptCopro,
  usePptCorrections,
  usePptRapport,
  usePptTraitements,
  useRejeterRapport,
  useValiderRapport,
} from "@/api/ppt";
import type { Controle, PpptVerifJson, TravailNormalise } from "@/lib/ppt/schema";
import { codePriorite } from "@/lib/ppt/schema";
import { bloquantsRestants, compterSeverites, controlesPlateforme } from "@/lib/ppt/controles";
import { cleRemarque, cloner, diffJson, validerJson } from "@/lib/ppt/import";
import { montantTtcPoste, parametresDepuisJson, postesDepuisJson, totauxParAnnee } from "@/lib/ppt/formules";
import { STATUT_CONTROLE_LABEL, TYPE_RAPPORT_LABEL, VERDICT_LABEL } from "@/lib/ppt/referentiels";
import { SeveriteBadge, StatutRapportBadge, VerdictBadge, fmtDateCourte, fmtEur, fmtPct } from "@/pages/SyndicPpt/commun";

const PRIORITES: TravailNormalise["priorite"][] = ["Préservation", "Énergétique", "Amélioration"];

function Chrono({ depuis }: { depuis: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor((Date.now() - depuis) / 1000);
  return <span title="temps passé sur cette revue (objectif : 10 minutes par dossier)" style={{ fontVariantNumeric: "tabular-nums", color: s > 600 ? "var(--color-warning-700)" : "var(--fg-muted)" }}><Icon name="clock" size={13} /> {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>;
}

function LigneControle({ c, editable, onChange }: { c: Controle; editable: boolean; onChange?: (patch: Partial<Controle>) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const effectif = c.statut === "NON_CONFORME" || c.statut === "PARTIEL";
  return (
    <div style={{ padding: "8px 4px", borderBottom: "1px solid var(--border)", opacity: effectif ? 1 : 0.6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", cursor: "pointer" }} onClick={() => setOuvert((v) => !v)}>
        <SeveriteBadge severite={c.severite} />
        <Badge kind="neutral">{c.code}</Badge>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{c.libelle}{c.poste_code ? <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}> · {c.poste_code}</span> : null}</span>
        {editable && onChange ? (
          <select className="edit-inp sm" style={{ maxWidth: 140, fontSize: 12 }} value={c.statut} onClick={(e) => e.stopPropagation()} onChange={(e) => onChange({ statut: e.target.value as Controle["statut"] })}>
            {Object.entries(STATUT_CONTROLE_LABEL).map(([k, v]) => <option key={k} value={k.toUpperCase()}>{v}</option>)}
          </select>
        ) : (
          <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{STATUT_CONTROLE_LABEL[c.statut.toLowerCase()] ?? c.statut}</span>
        )}
        {onChange && (
          <label className="se-small" title="Visible du syndic après validation" style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--fg-muted)" }} onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={c.visible_syndic ?? true} onChange={(e) => onChange({ visible_syndic: e.target.checked })} /> syndic
          </label>
        )}
      </div>
      {ouvert && (
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
          {c.constat && <p style={{ margin: 0 }}>{c.constat}</p>}
          {(c.attendu || c.observe || c.ecart) && <p className="se-small" style={{ margin: "3px 0 0", color: "var(--fg-muted)" }}>{[c.attendu && `attendu ${c.attendu}`, c.observe && `observé ${c.observe}`, c.ecart && `écart ${c.ecart}`].filter(Boolean).join(" · ")}</p>}
          {c.action && <p className="se-small" style={{ margin: "3px 0 0", color: "var(--color-primary-700)" }}>→ {c.action}</p>}
          {c.reference && <p className="se-small" style={{ margin: "3px 0 0", color: "var(--fg-muted)" }}>{c.reference}{c.page ? ` · p. ${c.page}` : ""}</p>}
        </div>
      )}
    </div>
  );
}

export default function Revue() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const dirigeant = !!profile?.dirigeant;
  const { data: rapport, isLoading } = usePptRapport(id);
  const { data: copro } = usePptCopro(rapport?.ppt_copro_id);
  const { data: analyse } = usePptAnalyse(id);
  const { data: corrections } = usePptCorrections(id);
  const { data: traitements } = usePptTraitements(id);
  const importer = useImporterAnalyse();
  const enregistrer = useEnregistrerRevue();
  const valider = useValiderRapport();
  const rejeter = useRejeterRapport();
  useCrumbs([{ label: "Suivi PPT", to: "/ppt" }, { label: rapport?.copro?.nom ?? "Revue" }]);

  const [depuis] = useState(() => Date.now());
  const [json, setJson] = useState<PpptVerifJson | null>(null);
  const [base, setBase] = useState<PpptVerifJson | null>(null); // dernier état enregistré
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [avertissements, setAvertissements] = useState<string[]>([]);
  const [leves, setLeves] = useState<string[]>([]);
  const [motifLevee, setMotifLevee] = useState("");
  const [motifRejet, setMotifRejet] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // le JSON de travail suit l'analyse chargée (import ou enregistrement)
  useEffect(() => {
    if (analyse?.json_corrige) {
      const j = analyse.json_corrige as unknown as PpptVerifJson;
      setJson(cloner(j));
      setBase(cloner(j));
    }
  }, [analyse?.json_corrige, analyse?.updated_at]);

  const fiche = useMemo(() => (copro ? { nom: copro.nom, adresse: copro.adresse, commune: copro.commune, nb_lots: copro.nb_lots, nb_logements: copro.nb_logements, surface_m2: copro.surface_m2, annee_construction: copro.annee_construction, etiquette_energie: copro.etiquette_energie, cep_kwhep_m2_an: copro.cep_kwhep_m2_an, date_dpe: copro.date_dpe, fonds_travaux_solde: copro.fonds_travaux_solde, fonds_travaux_cotisation_annuelle: copro.fonds_travaux_cotisation_annuelle, budget_previsionnel_annuel: copro.budget_previsionnel_annuel } : {}), [copro]);
  // contrôles plateforme rejoués à chaque modification ; la visibilité syndic choisie est conservée par clé
  const remarquesPlateforme = useMemo(() => {
    if (!json) return [];
    const precedentes = new Map((json.remarques_plateforme ?? []).map((c) => [cleRemarque(c), c]));
    return controlesPlateforme(json, fiche).map((c) => ({ ...c, visible_syndic: precedentes.get(cleRemarque(c))?.visible_syndic ?? true }));
  }, [json, fiche]);
  const jsonComplet = useMemo(() => (json ? { ...json, remarques_plateforme: remarquesPlateforme } : null), [json, remarquesPlateforme]);
  const bloquants = jsonComplet ? bloquantsRestants(jsonComplet) : [];
  const bloquantsRestant = jsonComplet ? bloquantsRestants(jsonComplet, leves) : [];
  const severites = jsonComplet ? compterSeverites([...jsonComplet.controles, ...remarquesPlateforme]) : null;
  const dirty = !!json && !!base && JSON.stringify(jsonComplet) !== JSON.stringify({ ...base, remarques_plateforme: base.remarques_plateforme ?? remarquesPlateforme });
  const params = json ? parametresDepuisJson(json.parametres_ppt) : null;
  const totaux = json && params ? totauxParAnnee(postesDepuisJson(json), params) : null;
  const revuePossible = dirigeant && rapport && ["depose", "en_analyse", "a_relire", "echec", "rejete"].includes(rapport.statut);
  const revueActive = revuePossible && rapport?.statut !== "valide";

  const importerFichier = async (f: File) => {
    setMessage(null);
    setErreurs([]);
    let brut: unknown;
    try {
      brut = JSON.parse(await f.text());
    } catch {
      setErreurs(["Le fichier n'est pas un JSON lisible."]);
      return;
    }
    const r = validerJson(brut);
    setAvertissements(r.avertissements);
    if (!r.ok || !r.json) {
      setErreurs(r.erreurs);
      return;
    }
    try {
      await importer.mutateAsync({ rapportId: id!, json: r.json });
      setMessage(`Analyse importée : ${r.json.travaux_normalises.length} postes, verdict ${VERDICT_LABEL[r.json.synthese.verdict] ?? r.json.synthese.verdict}.`);
    } catch (e) {
      setErreurs([e instanceof Error ? e.message : "Import refusé par la base."]);
    }
  };

  const majPoste = (idPoste: string, patch: Partial<TravailNormalise>) =>
    setJson((j) => (j ? { ...j, travaux_normalises: j.travaux_normalises.map((t) => (t.id === idPoste ? { ...t, ...patch } : t)) } : j));
  const majControle = (code: string, patch: Partial<Controle>) => setJson((j) => (j ? { ...j, controles: j.controles.map((c) => (c.code === code ? { ...c, ...patch } : c)) } : j));
  const majRemarque = (cle: string, patch: Partial<Controle>) =>
    setJson((j) => {
      if (!j) return j;
      const liste = remarquesPlateforme.map((c) => (cleRemarque(c) === cle ? { ...c, ...patch } : c));
      return { ...j, remarques_plateforme: liste };
    });
  const ajouterPoste = () =>
    setJson((j) => {
      if (!j) return j;
      const n = j.travaux_normalises.length + 1;
      const idN = `A${String(n).padStart(2, "0")}`;
      return {
        ...j,
        travaux_source: [...j.travaux_source, { id: idN, libelle_source: "(ajouté en revue)", batiment: null, ouvrage: null, priorite_source: null, annee_source: null, periode_source: null, cout_source_eur: null, cout_source_base: null, tva_source_pct: null, gain_energetique_source_pct: null, justification: null, page: null }],
        travaux_normalises: [...j.travaux_normalises, { id: idN, libelle: "Nouveau poste", priorite: "Préservation", critere: null, batiment: null, ouvrage: "", cout_ht_base_eur: null, cout_ht_origine: "estime_strateco", tva_pct: 10, regle_tva: null, avec_moe: true, annee_prevue: j.parametres_ppt.annee_base + 1, annee_origine: "a_confirmer", gain_energetique_pct: null, commentaire: "ajouté en revue", controles_lies: [] }],
      };
    });
  const retirerPoste = (idPoste: string) => setJson((j) => (j ? { ...j, travaux_normalises: j.travaux_normalises.filter((t) => t.id !== idPoste) } : j));

  const sauvegarder = async (motif: string | null = null) => {
    if (!jsonComplet || !base) return;
    const diff = diffJson(base, jsonComplet, motif);
    await enregistrer.mutateAsync({ rapportId: id!, json: jsonComplet, corrections: diff });
    setMessage(`Revue enregistrée${diff.length ? ` - ${diff.length} correction${diff.length > 1 ? "s" : ""} journalisée${diff.length > 1 ? "s" : ""}` : ""}.`);
  };

  const validerRapport = async () => {
    if (!jsonComplet) return;
    if (bloquantsRestant.length) return;
    if (leves.length && !motifLevee.trim()) {
      setMessage("Indiquez le motif de levée des bloquants.");
      return;
    }
    const diff = base ? diffJson(base, jsonComplet) : [];
    if (leves.length) diff.push({ chemin_json: "levee_bloquants", poste_code: null, valeur_avant: leves, valeur_apres: null, motif: motifLevee.trim() });
    await enregistrer.mutateAsync({ rapportId: id!, json: jsonComplet, corrections: diff });
    await valider.mutateAsync({ rapportId: id!, levees: leves });
    navigate("/ppt");
  };

  if (isLoading) return <div className="page"><p className="se-small">Chargement…</p></div>;
  if (!rapport) return <div className="page"><p className="se-body">Rapport introuvable.</p></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{rapport.copro?.nom ?? "Rapport"}</h1>
          <p className="page-sub">
            {rapport.enseigne ?? "sans enseigne"} · {rapport.copro?.gestionnaire_nom ?? "gestionnaire non désigné"} · {TYPE_RAPPORT_LABEL[rapport.type] ?? rapport.type} déposé le {fmtDateCourte(rapport.depose_le)}{rapport.taux_honoraires_pct != null ? <> · <strong title="taux d'honoraires de suivi de travaux indiqué par le syndic au dépôt, à appliquer au tableau PPT de sortie">honoraires syndic {rapport.taux_honoraires_pct.toLocaleString("fr-FR")} %</strong></> : null} · <StatutRapportBadge statut={rapport.statut} />
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Chrono depuis={depuis} />
          <button className="se-btn se-btn-secondary btn-sm" onClick={() => void telechargerPptRapport(rapport)}>
            <Icon name="download" size={14} />
            PDF
          </button>
          {revueActive && (
            <label className="se-btn se-btn-primary btn-sm" style={{ cursor: "pointer" }}>
              <Icon name="upload" size={14} />
              {importer.isPending ? "Import…" : analyse ? "Réimporter le JSON" : "Importer le JSON"}
              <input type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importerFichier(f); }} />
            </label>
          )}
        </div>
      </div>

      {!dirigeant && (
        <div className="panel" style={{ padding: "10px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <Icon name="lock" size={16} style={{ color: "var(--fg-muted)" }} />
          <span style={{ fontSize: 13.5 }}>Revue en lecture seule : l'import, les corrections et la validation sont réservés au dirigeant.</span>
        </div>
      )}
      {erreurs.length > 0 && (
        <div className="panel" style={{ padding: "12px 16px", marginBottom: 16, background: "var(--color-error-50)", color: "var(--color-error-700)" }}>
          <b>Import refusé</b> - le JSON ne respecte pas le contrat pppt-verif/1.0 :
          <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 13 }}>{erreurs.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {avertissements.length > 0 && <p className="se-small" style={{ color: "var(--color-warning-700)", marginTop: 0 }}>{avertissements.join(" ")}</p>}
      {message && <p className="se-small" style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-soft)", border: "1px solid var(--border)" }}>{message}</p>}

      {!analyse || !json || !jsonComplet ? (
        <div className="panel" style={{ padding: 22 }}>
          <h3 style={{ margin: "0 0 8px" }}>Analyse à faire</h3>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
            <li>Télécharger le PDF ci-dessus{copro?.nb_logements ? ` (${copro.nb_logements} logements déclarés)` : ""}.</li>
            <li>Dans Claude Code : « Vérifie ce PPPT avec le skill pppt-verif » - il produit <code>PPPT_VERIF_&lt;Copro&gt;_&lt;date&gt;.json</code>, le tableau Excel et une synthèse.</li>
            <li>Importer ici le JSON : les contrôles de la plateforme sont rejoués, les postes deviennent éditables, chaque correction est journalisée.</li>
            <li>Déposer le classeur Excel sur la copropriété (type « Tableau PPT Strat Eco ») pour le remettre au cabinet après validation.</li>
          </ol>
          {rapport.motif_rejet && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 12 }}>Rejeté : {rapport.motif_rejet}</p>}
        </div>
      ) : (
        <>
          <div className="panel" style={{ padding: "12px 18px", marginBottom: 16, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontSize: 13.5 }}>
            <VerdictBadge verdict={json.synthese.verdict} />
            <span>{json.document_source.nature_detectee} · {json.document_source.auteur.raison_sociale ?? "rédacteur inconnu"}{json.document_source.auteur.type ? ` (${json.document_source.auteur.type})` : ""} · daté du {fmtDateCourte(json.document_source.date_document)}</span>
            <span style={{ color: "var(--fg-muted)" }}>scores R {json.synthese.score_conformite_pct} % · C {json.synthese.score_coherence_pct} %</span>
            {severites && <span>🔴 {severites.BLOQUANT} · 🟡 {severites.MAJEUR} · {severites.MINEUR} mineurs · {severites.INFO} infos</span>}
            <span style={{ color: "var(--fg-muted)" }}>{json.travaux_normalises.length} postes · année de base {json.parametres_ppt.annee_base}</span>
            {(traitements ?? []).length > 0 && <span style={{ color: "var(--fg-muted)" }}>importé le {fmtDateCourte(traitements![0].demarre_le)} ({traitements![0].mode === "api" ? `API ${traitements![0].modele ?? ""}, ${traitements![0].cout_usd ?? "?"} $` : "analyse locale"})</span>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1.1fr) minmax(0, 2fr)", gap: 16, alignItems: "start" }}>
            {/* Contrôles */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="panel">
                <div className="p-head"><Icon name="alert" size={18} /><h3>Contrôles</h3><span style={{ flex: 1 }}></span><span style={{ fontSize: 12, color: "var(--fg-muted)" }}>skill {json.controles.length} · plateforme {remarquesPlateforme.length}</span></div>
                <div className="p-body" style={{ paddingTop: 0, maxHeight: 640, overflowY: "auto" }}>
                  <div className="se-eyebrow" style={{ color: "var(--fg-muted)", margin: "10px 0 4px" }}>Plateforme (recalculés)</div>
                  {remarquesPlateforme.length === 0 && <p className="se-small" style={{ color: "var(--fg-muted)" }}>Aucune remarque.</p>}
                  {[...remarquesPlateforme].sort((a, b) => ["BLOQUANT", "MAJEUR", "MINEUR", "INFO"].indexOf(a.severite) - ["BLOQUANT", "MAJEUR", "MINEUR", "INFO"].indexOf(b.severite)).map((c) => (
                    <LigneControle key={cleRemarque(c)} c={c} editable={false} onChange={revueActive ? (p) => majRemarque(cleRemarque(c), p) : undefined} />
                  ))}
                  <div className="se-eyebrow" style={{ color: "var(--fg-muted)", margin: "14px 0 4px" }}>Grille du skill (R / C)</div>
                  {[...json.controles].sort((a, b) => ["BLOQUANT", "MAJEUR", "MINEUR", "INFO"].indexOf(a.severite) - ["BLOQUANT", "MAJEUR", "MINEUR", "INFO"].indexOf(b.severite)).map((c) => (
                    <LigneControle key={c.code} c={c} editable={!!revueActive} onChange={revueActive ? (p) => majControle(c.code, p) : undefined} />
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="p-head"><Icon name="building" size={18} /><h3>Copropriété : document ↔ fiche</h3></div>
                <div className="p-body" style={{ paddingTop: 0 }}>
                  {([
                    ["Lots", json.copropriete.nb_lots_total, copro?.nb_lots],
                    ["Logements", json.copropriete.nb_logements, copro?.nb_logements],
                    ["Surface (m²)", json.copropriete.surface_m2, copro?.surface_m2],
                    ["Année", json.copropriete.annee_construction, copro?.annee_construction],
                    ["Étiquette", json.diagnostics_sources.dpe_collectif.etiquette_energie, copro?.etiquette_energie],
                    ["Cep", json.diagnostics_sources.dpe_collectif.cep_kwhep_m2_an, copro?.cep_kwhep_m2_an],
                    ["Commune", json.copropriete.commune, copro?.commune],
                  ] as [string, unknown, unknown][]).map(([l, d, f]) => (
                    <div key={l} className="kv" style={{ fontSize: 13 }}>
                      <span className="k">{l}</span>
                      <span className="v" style={{ color: f != null && d != null && String(f) !== String(d) ? "var(--color-warning-700)" : undefined }}>{String(d ?? "-")} <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>/ fiche {String(f ?? "-")}</span></span>
                    </div>
                  ))}
                  <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 8, marginBottom: 0 }}>À la validation, les champs vides de la fiche sont complétés depuis le document ; les champs déjà saisis sont conservés.</p>
                </div>
              </div>
            </div>

            {/* Postes */}
            <div className="panel">
              <div className="p-head">
                <Icon name="calendar" size={18} />
                <h3>Postes normalisés</h3>
                <span style={{ flex: 1 }}></span>
                {totaux && <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>HT base {fmtEur(json.travaux_normalises.reduce((s, t) => s + (t.cout_ht_base_eur ?? 0), 0))} · TTC actualisé {fmtEur([...totaux.values()].reduce((s, v) => s + v, 0))}</span>}
                {revueActive && <button className="se-btn se-btn-ghost btn-sm" onClick={ajouterPoste}><Icon name="plus" size={13} />Poste</button>}
              </div>
              <div className="p-body" style={{ paddingTop: 0 }}>
                <div className="tablewrap">
                  <table className="dossiers" style={{ fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        <th>Id</th>
                        <th>Libellé</th>
                        <th>Nature</th>
                        <th className="num">Année</th>
                        <th className="num">HT base</th>
                        <th className="num">TVA</th>
                        <th className="num">Gain</th>
                        <th className="num">TTC</th>
                        {revueActive && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {json.travaux_normalises.map((t) => {
                        const src = json.travaux_source.find((s) => s.id === t.id);
                        const ttc = params ? montantTtcPoste({ cout_ht_base: t.cout_ht_base_eur, tva_pct: t.tva_pct, avec_moe: t.avec_moe, annee_prevue: t.annee_prevue, gain_energetique_pct: t.gain_energetique_pct, priorite: codePriorite(t.priorite) }, params) : null;
                        const lie = [...json.controles, ...remarquesPlateforme].some((c) => (c.poste_code === t.id || t.controles_lies.includes(c.code)) && (c.statut === "NON_CONFORME" || c.statut === "PARTIEL"));
                        return (
                          <tr key={t.id} style={{ cursor: "default", background: lie ? "var(--color-warning-50, transparent)" : undefined }}>
                            <td style={{ color: "var(--fg-muted)" }} title={src ? `${src.libelle_source}${src.page ? ` (p. ${src.page})` : ""}` : ""}>{t.id}{lie && <span title="contrôle non conforme lié"> ⚠</span>}</td>
                            <td style={{ minWidth: 200 }}>
                              {revueActive ? <input className="edit-inp sm" style={{ maxWidth: "none", width: "100%" }} value={t.libelle} onChange={(e) => majPoste(t.id, { libelle: e.target.value })} /> : <b>{t.libelle}</b>}
                              {src && src.libelle_source !== t.libelle && <span style={{ display: "block", fontSize: 11, color: "var(--fg-muted)" }}>{src.libelle_source}{src.page ? ` · p. ${src.page}` : ""}</span>}
                            </td>
                            <td>
                              {revueActive ? (
                                <select className="edit-inp sm" style={{ maxWidth: 120 }} value={t.priorite} onChange={(e) => { const p = e.target.value as TravailNormalise["priorite"]; majPoste(t.id, { priorite: p, avec_moe: codePriorite(p) === "preservation", tva_pct: codePriorite(p) === "energetique" ? 5.5 : t.tva_pct === 5.5 ? 10 : t.tva_pct }); }}>
                                  {PRIORITES.map((p) => <option key={p} value={p}>{p}</option>)}
                                </select>
                              ) : t.priorite}
                            </td>
                            <td className="num">
                              {revueActive ? <input className="edit-inp sm" style={{ width: 70, textAlign: "right" }} type="number" value={t.annee_prevue ?? ""} onChange={(e) => majPoste(t.id, { annee_prevue: e.target.value ? Number(e.target.value) : null, annee_origine: "a_confirmer" })} /> : (t.annee_prevue ?? "-")}
                              {t.annee_origine !== "source" && <span title={t.annee_origine} style={{ color: "var(--fg-muted)" }}> ~</span>}
                            </td>
                            <td className="num">
                              {revueActive ? <input className="edit-inp sm" style={{ width: 96, textAlign: "right", borderColor: t.cout_ht_base_eur == null ? "var(--color-warning-500)" : undefined }} type="number" value={t.cout_ht_base_eur ?? ""} placeholder="à chiffrer" onChange={(e) => majPoste(t.id, { cout_ht_base_eur: e.target.value ? Number(e.target.value) : null, cout_ht_origine: e.target.value ? "estime_strateco" : null })} /> : (t.cout_ht_base_eur != null ? fmtEur(t.cout_ht_base_eur) : <span style={{ color: "var(--color-warning-700)" }}>à chiffrer</span>)}
                            </td>
                            <td className="num">
                              {revueActive ? (
                                <select className="edit-inp sm" style={{ width: 70 }} value={t.tva_pct} onChange={(e) => majPoste(t.id, { tva_pct: Number(e.target.value) })}>
                                  {[5.5, 10, 20].map((v) => <option key={v} value={v}>{v} %</option>)}
                                </select>
                              ) : `${t.tva_pct} %`}
                            </td>
                            <td className="num">
                              {revueActive && codePriorite(t.priorite) === "energetique" ? (
                                <input className="edit-inp sm" style={{ width: 64, textAlign: "right" }} type="number" step={1} min={0} max={70} value={t.gain_energetique_pct == null ? "" : Math.round((t.gain_energetique_pct > 1 ? t.gain_energetique_pct : t.gain_energetique_pct * 100) * 10) / 10} onChange={(e) => majPoste(t.id, { gain_energetique_pct: e.target.value ? Number(e.target.value) / 100 : null })} />
                              ) : t.gain_energetique_pct != null ? fmtPct(t.gain_energetique_pct) : "-"}
                            </td>
                            <td className="num">{ttc != null ? fmtEur(ttc) : "-"}</td>
                            {revueActive && <td><button className="icon-btn" title="Retirer ce poste" onClick={() => { if (window.confirm(`Retirer « ${t.libelle} » du plan ?`)) retirerPoste(t.id); }}><Icon name="trash" size={14} /></button></td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10, marginBottom: 0 }}>
                  TTC = HT × (1 + {(json.parametres_ppt.inflation * 100).toLocaleString("fr-FR")} %)^k × (1 + TVA{json.parametres_ppt.honoraires_moe ? ` + MOE ${(json.parametres_ppt.honoraires_moe * 100).toLocaleString("fr-FR")} % si préservation` : ""} + syndic {(json.parametres_ppt.honoraires_syndic * 100).toLocaleString("fr-FR")} %), k = année - {json.parametres_ppt.annee_base}. « ~ » : année déduite ou à confirmer.
                </p>
              </div>
            </div>
          </div>

          {/* Décision */}
          {revueActive && (
            <div className="panel" style={{ marginTop: 16, padding: "16px 20px" }}>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 320 }}>
                  {bloquants.length > 0 ? (
                    <>
                      <div className="se-eyebrow" style={{ color: "var(--color-error-700)", marginBottom: 6 }}>{bloquants.length} contrôle{bloquants.length > 1 ? "s" : ""} bloquant{bloquants.length > 1 ? "s" : ""} non conforme{bloquants.length > 1 ? "s" : ""}</div>
                      {bloquants.map((b) => (
                        <label key={b.code + (b.poste_code ?? "")} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 0" }}>
                          <input type="checkbox" checked={leves.includes(b.code)} onChange={(e) => setLeves((l) => (e.target.checked ? [...new Set([...l, b.code])] : l.filter((x) => x !== b.code)))} />
                          <Badge kind="neutral">{b.code}</Badge> {b.libelle} <span style={{ color: "var(--fg-muted)" }}>- lever (le syndic verra la remarque comme traitée)</span>
                        </label>
                      ))}
                      {leves.length > 0 && <input className="edit-inp" style={{ maxWidth: "none", marginTop: 8 }} placeholder="Motif de la levée (obligatoire, journalisé)" value={motifLevee} onChange={(e) => setMotifLevee(e.target.value)} />}
                    </>
                  ) : (
                    <div className="se-eyebrow" style={{ color: "var(--color-primary-700)" }}>Aucun bloquant : le rapport peut être validé</div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="se-btn se-btn-secondary btn-sm" disabled={!dirty || enregistrer.isPending} onClick={() => void sauvegarder()}>
                      <Icon name="check" size={14} />
                      {enregistrer.isPending ? "Enregistrement…" : dirty ? "Enregistrer la revue" : "Revue enregistrée"}
                    </button>
                    <button className="se-btn se-btn-primary btn-sm" disabled={bloquantsRestant.length > 0 || valider.isPending || enregistrer.isPending} title={bloquantsRestant.length ? "Levez ou corrigez les bloquants" : "Matérialise postes et remarques pour le cabinet"} onClick={() => void validerRapport()}>
                      <Icon name="checkCircle" size={14} />
                      {valider.isPending ? "Validation…" : `Valider${bloquantsRestant.length ? ` - ${bloquantsRestant.length} à lever` : ""}`}
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="edit-inp sm" style={{ maxWidth: 260 }} placeholder="Motif de rejet" value={motifRejet} onChange={(e) => setMotifRejet(e.target.value)} />
                    <button className="se-btn se-btn-ghost btn-sm" disabled={!motifRejet.trim() || rejeter.isPending} onClick={() => { if (window.confirm("Rejeter ce rapport ? Le cabinet en sera informé.")) void rejeter.mutateAsync({ rapportId: id!, motif: motifRejet.trim() }).then(() => navigate("/ppt")); }}>
                      <Icon name="x" size={14} />
                      Rejeter
                    </button>
                  </div>
                  {(valider.isError || enregistrer.isError || rejeter.isError) && (
                    <p className="se-small" style={{ color: "var(--color-error-700)", margin: 0 }}>{String(((valider.error ?? enregistrer.error ?? rejeter.error) as Error)?.message)}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {(corrections ?? []).length > 0 && (
            <div className="panel" style={{ marginTop: 16 }}>
              <div className="p-head"><Icon name="edit" size={18} /><h3>Corrections journalisées</h3><span style={{ flex: 1 }}></span><span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{corrections!.length} - matière première des futures règles</span></div>
              <div className="p-body" style={{ paddingTop: 0, maxHeight: 260, overflowY: "auto" }}>
                {corrections!.map((c) => (
                  <div key={c.id} className="kv" style={{ fontSize: 12.5 }}>
                    <span className="k" style={{ fontFamily: "var(--font-mono, monospace)" }}>{c.chemin_json}</span>
                    <span className="v" style={{ fontWeight: 400, textAlign: "right" }}>
                      {JSON.stringify(c.valeur_avant)} → {JSON.stringify(c.valeur_apres)}
                      <span style={{ display: "block", fontSize: 11, color: "var(--fg-muted)" }}>{new Date(c.le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}{c.motif ? ` · ${c.motif}` : ""}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
