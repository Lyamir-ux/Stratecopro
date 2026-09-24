// Revue d'un PPPT (dirigeant) - /ppt/rapports/:id
// 1. Télécharger le PDF, l'analyser en local avec le skill pppt-verif, importer
//    le JSON pppt-verif/1.1 produit (contrat strict : refus explicite ; un 1.0
//    est migré, sans propositions).
// 2. Les propositions du skill (décisions prises par défaut) sont validées en
//    bloc : accepter / refuser / modifier, commentaire quand on s'écarte du
//    tableau ; les lignes à reprendre à la main sont marquées dans les postes.
//    Tant qu'une proposition reste « à valider », le rapport ne peut pas l'être
//    (UI + RPC ppt_valider_rapport, migration 0085).
// 3. Les contrôles déterministes de la plateforme sont rejoués sur le JSON et
//    la fiche à chaque modification ; l'éditeur corrige les postes et la fiche ;
//    chaque modification (dont chaque décision) est journalisée (ppt_corrections)
//    à l'enregistrement.
// 4. Valider (bloquants levés avec motif) ou rejeter. Le syndic ne voit rien
//    avant la validation. Les décisions se copient au format « P04 oui, P11 non »
//    pour que le skill régénère le classeur Excel.
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
  useDevaliderRapport,
  useRejeterRapport,
  useValiderRapport,
} from "@/api/ppt";
import type { Controle, PpptVerifJson, Proposition, StatutValidationProposition, TravailNormalise } from "@/lib/ppt/schema";
import { codePriorite } from "@/lib/ppt/schema";
import { bloquantsRestants, compterSeverites, controlesPlateforme } from "@/lib/ppt/controles";
import { cleRemarque, cloner, diffJson, migrerJson, validerJson } from "@/lib/ppt/import";
import { STATUT_VALIDATION_LABEL, accepterEnBloc, aReprendre, bilanPropositions, commentaireRequis, decider, libelleChoix, lignesAReprendre, propositionsEnAttente, propositionsSansCommentaire, texteDecisions } from "@/lib/ppt/propositions";
import { montantTtcPoste, parametresDepuisJson, postesDepuisJson, totauxParAnnee } from "@/lib/ppt/formules";
import { STATUT_CONTROLE_LABEL, TYPE_RAPPORT_LABEL, VERDICT_LABEL } from "@/lib/ppt/referentiels";
import { SeveriteBadge, StatutRapportBadge, VerdictBadge, fmtDateCourte, fmtEur, fmtPct } from "@/pages/SyndicPpt/commun";
import { SupprimerDocument } from "@/pages/SyndicPpt/SupprimerDocument";
import { messageErreur } from "@/lib/erreurs";

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

const COULEUR_STATUT: Record<StatutValidationProposition, string> = {
  A_VALIDER: "var(--color-warning-700)",
  VALIDEE: "var(--color-primary-700)",
  REFUSEE: "var(--color-error-700)",
  MODIFIEE: "var(--color-blue-700, #2E6FA8)",
};

/** Une proposition du skill : la décision, son contexte, et les trois choix du dirigeant. */
function LigneProposition({ p, editable, onDecider }: { p: Proposition; editable: boolean; onDecider?: (statut: StatutValidationProposition, commentaire?: string) => void }) {
  const [ouvert, setOuvert] = useState(p.statut_validation === "A_VALIDER");
  const reprendre = aReprendre(p);
  const manqueCommentaire = commentaireRequis(p) && !(p.commentaire_validateur ?? "").trim();
  const choix: StatutValidationProposition[] = ["VALIDEE", "REFUSEE", "MODIFIEE"];
  const aide = (st: StatutValidationProposition) => {
    if (st === "VALIDEE") return p.appliquee_dans_ppt ? "D'accord avec la décision : rien à changer" : "Retenir cette alternative : les lignes concernées sont à reprendre";
    if (st === "REFUSEE") return p.appliquee_dans_ppt ? "Refuser : les lignes concernées sont à reprendre à la main (commentaire obligatoire)" : "Laisser le tableau tel quel";
    return "Retenir en l'adaptant : dites quoi en commentaire, puis reprenez les lignes";
  };
  return (
    <div style={{ padding: "8px 4px", borderBottom: "1px solid var(--border)", background: p.statut_validation === "A_VALIDER" ? "var(--color-warning-50, transparent)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Badge kind="neutral">{p.code}</Badge>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 200, cursor: "pointer" }} onClick={() => setOuvert((v) => !v)}>
          {p.theme || p.decision}
          {p.lignes_concernees.length > 0 && <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}> · {p.lignes_concernees.join(", ")}</span>}
          {p.controle_lie && <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}> · {p.controle_lie}</span>}
        </span>
        <span className="se-small" title={p.appliquee_dans_ppt ? "Le tableau du skill reflète déjà cette décision" : "Alternative soumise par le skill, non appliquée au tableau"} style={{ color: "var(--fg-muted)" }}>
          {p.appliquee_dans_ppt ? "appliquée au tableau" : "alternative non appliquée"}
        </span>
        {editable && onDecider ? (
          <span style={{ display: "inline-flex", gap: 4 }}>
            {choix.map((st) => (
              <button key={st} type="button" className={`se-btn btn-sm ${p.statut_validation === st ? "se-btn-primary" : "se-btn-secondary"}`} style={{ padding: "2px 8px", fontSize: 12 }} title={aide(st)} onClick={() => onDecider(st)}>
                {libelleChoix(p, st)}
              </button>
            ))}
          </span>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 600, color: COULEUR_STATUT[p.statut_validation] }}>{STATUT_VALIDATION_LABEL[p.statut_validation]}</span>
        )}
        {reprendre && <span className="se-small" title="La décision prise s'écarte du tableau du skill : reprenez les lignes concernées dans les postes" style={{ color: "var(--color-warning-700)" }}>↺ lignes à reprendre</span>}
      </div>
      {(ouvert || manqueCommentaire || reprendre) && (
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
          <p style={{ margin: 0 }}>{p.decision}</p>
          {(p.valeur_source || p.valeur_proposee) && <p className="se-small" style={{ margin: "3px 0 0", color: "var(--fg-muted)" }}>{p.valeur_source ? `source ${p.valeur_source} → ` : ""}proposé {p.valeur_proposee}</p>}
          {p.impact && <p className="se-small" style={{ margin: "3px 0 0", color: "var(--fg-muted)" }}>impact : {p.impact}</p>}
          {p.alternative && <p className="se-small" style={{ margin: "3px 0 0", color: "var(--fg-muted)" }}>alternative : {p.alternative}</p>}
          {editable && onDecider && p.statut_validation !== "A_VALIDER" ? (
            <input
              className="edit-inp sm"
              style={{ maxWidth: "none", width: "100%", marginTop: 6, borderColor: manqueCommentaire ? "var(--color-warning-500)" : undefined }}
              placeholder={commentaireRequis(p) ? "Commentaire obligatoire : ce qui est fait à la place (journalisé, renvoyé au skill)" : "Commentaire (facultatif)"}
              value={p.commentaire_validateur ?? ""}
              onChange={(e) => onDecider(p.statut_validation, e.target.value)}
            />
          ) : p.commentaire_validateur ? (
            <p className="se-small" style={{ margin: "3px 0 0" }}>« {p.commentaire_validateur} »</p>
          ) : null}
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
  const devalider = useDevaliderRapport();
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
  const [erreurDecision, setErreurDecision] = useState<string | null>(null);
  const [erreurRetour, setErreurRetour] = useState<string | null>(null);
  // supprimer le rapport (même validé et retouché par le cabinet) pour recommencer - 0095,
  // ou seulement le JSON intégré en gardant le PDF, pour en importer un nouveau - 0096
  const [suppression, setSuppression] = useState<"document" | "analyse" | null>(null);

  // le JSON de travail suit l'analyse chargée (import ou enregistrement)
  useEffect(() => {
    // JSON supprimé (0096) : la revue repart de zéro, en attente d'un nouvel import
    if (analyse === null) {
      setJson(null);
      setBase(null);
      setLeves([]);
      setMotifLevee("");
      return;
    }
    if (analyse?.json_corrige) {
      // une analyse importée avant la 1.1 n'a pas de bloc propositions : migrée à la lecture
      const j = migrerJson(analyse.json_corrige as unknown as PpptVerifJson);
      setJson(cloner(j));
      setBase(cloner(j));
    }
  }, [analyse, analyse?.json_corrige, analyse?.updated_at]);

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
  // une levée porte sur une remarque précise : un même code (C04, P20) peut viser plusieurs postes
  const levees = bloquants.filter((b) => leves.includes(cleRemarque(b))).map((b) => ({ code: b.code, poste_code: b.poste_code ?? null, libelle: b.libelle }));
  const severites = jsonComplet ? compterSeverites([...jsonComplet.controles, ...remarquesPlateforme]) : null;
  const dirty = !!json && !!base && JSON.stringify(jsonComplet) !== JSON.stringify({ ...base, remarques_plateforme: base.remarques_plateforme ?? remarquesPlateforme });
  const params = json ? parametresDepuisJson(json.parametres_ppt) : null;
  const totaux = json && params ? totauxParAnnee(postesDepuisJson(json), params) : null;
  const revuePossible = dirigeant && rapport && ["depose", "en_analyse", "a_relire", "echec", "rejete"].includes(rapport.statut);
  const revueActive = revuePossible && rapport?.statut !== "valide";
  // propositions du skill : à trancher avant de matérialiser les postes
  const bilan = json ? bilanPropositions(json) : null;
  const enAttente = json ? propositionsEnAttente(json) : [];
  const sansCommentaire = json ? propositionsSansCommentaire(json) : [];
  const lignesReprise = useMemo(() => (json ? lignesAReprendre(json) : new Map<string, string[]>()), [json]);
  const [propositionsRepliees, setPropositionsRepliees] = useState(false);

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
      const nbProp = r.json.propositions.length;
      setMessage(`Analyse importée : ${r.json.travaux_normalises.length} postes, verdict ${VERDICT_LABEL[r.json.synthese.verdict] ?? r.json.synthese.verdict}${nbProp ? `, ${nbProp} proposition${nbProp > 1 ? "s" : ""} du skill à valider avant la création du tableau` : ""}.`);
    } catch (e) {
      setErreurs([messageErreur(e, "Import refusé par la base.")]);
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
  const deciderProposition = (code: string, statut: StatutValidationProposition, commentaire?: string) => {
    setErreurDecision(null);
    setJson((j) => (j ? decider(j, code, statut, commentaire) : j));
  };
  const accepterToutLeReste = () => {
    setErreurDecision(null);
    setJson((j) => (j ? accepterEnBloc(j) : j));
  };
  const copierDecisions = async () => {
    if (!json) return;
    const texte = texteDecisions(json);
    try {
      await navigator.clipboard.writeText(texte);
      setMessage(`Décisions copiées (${json.propositions.length}) : collez-les au skill pppt-verif pour régénérer le classeur Excel.`);
    } catch {
      setMessage(`Décisions : ${texte}`);
    }
  };
  const telechargerJson = () => {
    if (!jsonComplet) return;
    const nom = `PPPT_VERIF_${(rapport?.copro?.nom ?? "copro").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "")}_valide.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(jsonComplet, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nom;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sauvegarder = async (motif: string | null = null) => {
    if (!jsonComplet || !base) return;
    const diff = diffJson(base, jsonComplet, motif);
    await enregistrer.mutateAsync({ rapportId: id!, json: jsonComplet, corrections: diff });
    setMessage(`Revue enregistrée${diff.length ? ` - ${diff.length} correction${diff.length > 1 ? "s" : ""} journalisée${diff.length > 1 ? "s" : ""}` : ""}.`);
  };

  // Retour en mode vérification d'un rapport validé : la validation est défaite
  // (postes et remarques retirés du syndic), la revue reprend sur l'analyse déjà
  // importée. Refusé par la base si le syndic a travaillé les postes.
  const revenirEnVerification = async () => {
    setErreurRetour(null);
    const avertissement = [
      "Revenir au mode vérification ?",
      "",
      "Le plan et les remarques publiés au cabinet sont retirés jusqu'à la prochaine validation, et le rapport repasse « À relire ».",
      "L'analyse importée et vos corrections sont conservées : la revue reprend où elle en était.",
    ].join("\n");
    if (!window.confirm(avertissement)) return;
    try {
      await devalider.mutateAsync({ rapportId: id!, motif: null });
      setMessage("Rapport revenu en vérification : la revue est de nouveau modifiable, le cabinet ne voit plus le plan.");
    } catch (e) {
      setErreurRetour(messageErreur(e, "Retour en vérification refusé."));
    }
  };

  const validerRapport = async () => {
    setErreurDecision(null);
    if (!jsonComplet) return;
    // aucun abandon silencieux : le bouton reste actif et dit ce qui manque
    if (enAttente.length) {
      setPropositionsRepliees(false);
      setErreurDecision(`Validation impossible : ${enAttente.length} proposition${enAttente.length > 1 ? "s" : ""} du skill encore à valider (${enAttente.map((p) => p.code).join(", ")}). Tranchez-les dans le panneau « Propositions du skill » ou acceptez tout le reste en bloc.`);
      return;
    }
    if (sansCommentaire.length) {
      setPropositionsRepliees(false);
      setErreurDecision(`Indiquez ce qui est fait à la place pour ${sansCommentaire.map((p) => p.code).join(", ")} : le commentaire est journalisé et renvoyé au skill.`);
      return;
    }
    if (bloquantsRestant.length) {
      setErreurDecision(`Validation impossible : ${bloquantsRestant.length} contrôle${bloquantsRestant.length > 1 ? "s" : ""} bloquant${bloquantsRestant.length > 1 ? "s" : ""} non levé${bloquantsRestant.length > 1 ? "s" : ""} (${[...new Set(bloquantsRestant.map((b) => b.code))].join(", ")}). Corrigez le contrôle dans le panneau « Contrôles » ou cochez-le ci-contre pour le lever avec un motif.`);
      return;
    }
    if (leves.length && !motifLevee.trim()) {
      setErreurDecision("Indiquez le motif de levée des bloquants : il est journalisé et le syndic voit la remarque comme traitée.");
      return;
    }
    const diff = base ? diffJson(base, jsonComplet) : [];
    if (leves.length) diff.push({ chemin_json: "levee_bloquants", poste_code: null, valeur_avant: leves, valeur_apres: null, motif: motifLevee.trim() });
    await enregistrer.mutateAsync({ rapportId: id!, json: jsonComplet, corrections: diff });
    await valider.mutateAsync({ rapportId: id!, levees });
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginLeft: "auto", justifyContent: "flex-end" }}>
          <Chrono depuis={depuis} />
          <button className="se-btn se-btn-secondary btn-sm" onClick={() => void telechargerPptRapport(rapport)}>
            <Icon name="download" size={14} />
            PDF
          </button>
          {dirigeant && rapport.statut === "valide" && (
            <button className="se-btn se-btn-secondary btn-sm" disabled={devalider.isPending} title="Défaire la validation et rouvrir la revue : le cabinet ne voit plus le plan tant qu'il n'est pas revalidé" onClick={() => void revenirEnVerification()}>
              <Icon name="refresh" size={14} />
              {devalider.isPending ? "Retour…" : "Revenir au mode vérification"}
            </button>
          )}
          {dirigeant && rapport.schema_version != null && (
            <button className="se-btn se-btn-ghost btn-sm" style={{ color: "var(--color-error-700)" }} title="Garder le PDF et supprimer le JSON intégré, avec le plan qu'il a produit (même retouché par le cabinet), pour importer un nouveau JSON" onClick={() => setSuppression("analyse")}>
              <Icon name="refresh" size={14} />
              Supprimer le JSON
            </button>
          )}
          {dirigeant && (
            <button className="se-btn se-btn-ghost btn-sm" style={{ color: "var(--color-error-700)" }} title={rapport.statut === "valide" ? "Supprimer le rapport et son plan (postes, remarques), pour recommencer depuis un nouveau dépôt" : "Supprimer le document et son fichier"} onClick={() => setSuppression("document")}>
              <Icon name="trash" size={14} />
              Supprimer
            </button>
          )}
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
          <b>Import refusé</b> - le JSON ne respecte pas le contrat pppt-verif/1.1 :
          <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 13 }}>{erreurs.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {avertissements.length > 0 && <p className="se-small" style={{ color: "var(--color-warning-700)", marginTop: 0 }}>{avertissements.join(" ")}</p>}
      {erreurRetour && (
        <div className="panel" style={{ padding: "12px 16px", marginBottom: 16, background: "var(--color-error-50)", color: "var(--color-error-700)" }}>
          <b>Retour en vérification refusé</b> - {erreurRetour}
          <span style={{ display: "block", marginTop: 4 }}>Pour recommencer malgré tout, supprimez le JSON intégré (bouton « Supprimer le JSON ») : le PDF reste et vous importez le nouveau JSON.</span>
        </div>
      )}
      {suppression && (
        <SupprimerDocument
          rapport={rapport}
          mode={suppression}
          onClose={(supprime) => {
            const mode = suppression;
            setSuppression(null);
            if (!supprime) return;
            if (mode === "document") navigate("/ppt");
            else {
              setErreurRetour(null);
              setErreurs([]);
              setAvertissements([]);
              setMessage("JSON supprimé : le PPPT repasse « Déposé » et le cabinet ne voit plus ce plan. Importez le nouveau JSON (bouton « Importer le JSON »).");
            }
          }}
        />
      )}
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

          {/* Propositions du skill : à valider en bloc avant la création du tableau */}
          {bilan && bilan.total > 0 && (
            <div className="panel" style={{ marginBottom: 16, borderColor: bilan.en_attente ? "var(--color-warning-500)" : undefined }}>
              <div className="p-head">
                <Icon name="clipboard" size={18} />
                <h3>Propositions du skill</h3>
                <span style={{ fontSize: 12.5, color: bilan.en_attente ? "var(--color-warning-700)" : "var(--fg-muted)", fontWeight: bilan.en_attente ? 600 : 400 }}>
                  {bilan.en_attente ? `${bilan.en_attente} à valider` : "toutes tranchées"} · {bilan.validees} acceptée{bilan.validees > 1 ? "s" : ""} · {bilan.refusees} refusée{bilan.refusees > 1 ? "s" : ""} · {bilan.modifiees} modifiée{bilan.modifiees > 1 ? "s" : ""}{bilan.a_reprendre ? ` · ${bilan.a_reprendre} à répercuter sur les postes` : ""}
                </span>
                <span style={{ flex: 1 }}></span>
                {revueActive && bilan.en_attente > 0 && (
                  <button className="se-btn se-btn-primary btn-sm" title="Accepter les décisions appliquées, ne pas retenir les alternatives : le tableau du skill reste tel quel" onClick={accepterToutLeReste}>
                    <Icon name="checkCircle" size={14} />
                    Accepter tout le reste ({bilan.en_attente})
                  </button>
                )}
                <button className="se-btn se-btn-ghost btn-sm" title="Copier « P01 oui, P02 non (motif)… » à coller au skill pour régénérer le classeur Excel" onClick={() => void copierDecisions()}>
                  <Icon name="copy" size={14} />
                  Copier les décisions
                </button>
                <button className="se-btn se-btn-ghost btn-sm" title="Télécharger le JSON de travail avec les statuts de validation" onClick={telechargerJson}>
                  <Icon name="download" size={14} />
                  JSON
                </button>
                <button className="icon-btn" title={propositionsRepliees ? "Afficher" : "Replier"} onClick={() => setPropositionsRepliees((v) => !v)}>
                  <Icon name={propositionsRepliees ? "chevronDown" : "chevronUp"} size={14} />
                </button>
              </div>
              {!propositionsRepliees && (
                <div className="p-body" style={{ paddingTop: 0 }}>
                  <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 4px" }}>
                    Le skill a décidé, vous validez en bloc : une décision « appliquée au tableau » est déjà dans les postes ci-dessous ; une « alternative » ne l'est pas. Refuser une décision appliquée, retenir une alternative ou modifier vous oblige à reprendre les lignes marquées ↺ dans les postes. Chaque décision est journalisée à l'enregistrement.
                  </p>
                  {json.propositions.map((p) => (
                    <LigneProposition key={p.code} p={p} editable={!!revueActive} onDecider={revueActive ? (st, com) => deciderProposition(p.code, st, com) : undefined} />
                  ))}
                </div>
              )}
            </div>
          )}

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
                        const reprise = lignesReprise.get(t.id);
                        return (
                          <tr key={t.id} style={{ cursor: "default", background: lie || reprise ? "var(--color-warning-50, transparent)" : undefined }}>
                            <td style={{ color: "var(--fg-muted)", whiteSpace: "nowrap" }} title={src ? `${src.libelle_source}${src.page ? ` (p. ${src.page})` : ""}` : ""}>{t.id}{lie && <span title="contrôle non conforme lié"> ⚠</span>}{reprise && <span title={`à reprendre suite à votre décision sur ${reprise.join(", ")}`} style={{ color: "var(--color-warning-700)" }}> ↺ {reprise.join(", ")}</span>}</td>
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
                        <label key={cleRemarque(b)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 0" }}>
                          <input type="checkbox" checked={leves.includes(cleRemarque(b))} onChange={(e) => { setErreurDecision(null); const cle = cleRemarque(b); setLeves((l) => (e.target.checked ? [...new Set([...l, cle])] : l.filter((x) => x !== cle))); }} />
                          <Badge kind="neutral">{b.code}</Badge> {b.libelle}{b.poste_code ? <span style={{ color: "var(--fg-muted)" }}> ({b.poste_code})</span> : null} <span style={{ color: "var(--fg-muted)" }}>- lever (le syndic verra la remarque comme traitée)</span>
                        </label>
                      ))}
                      {leves.length > 0 && <input className="edit-inp" style={{ maxWidth: "none", marginTop: 8 }} placeholder="Motif de la levée (obligatoire, journalisé)" value={motifLevee} onChange={(e) => { setErreurDecision(null); setMotifLevee(e.target.value); }} />}
                    </>
                  ) : (
                    <div className="se-eyebrow" style={{ color: enAttente.length ? "var(--color-warning-700)" : "var(--color-primary-700)" }}>{enAttente.length ? `Aucun bloquant, mais ${enAttente.length} proposition${enAttente.length > 1 ? "s" : ""} du skill à valider` : "Aucun bloquant : le rapport peut être validé"}</div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="se-btn se-btn-secondary btn-sm" disabled={!dirty || enregistrer.isPending} onClick={() => void sauvegarder()}>
                      <Icon name="check" size={14} />
                      {enregistrer.isPending ? "Enregistrement…" : dirty ? "Enregistrer la revue" : "Revue enregistrée"}
                    </button>
                    <button className="se-btn se-btn-primary btn-sm" disabled={valider.isPending || enregistrer.isPending} title={enAttente.length ? "Tranchez d'abord les propositions du skill" : bloquantsRestant.length ? "Levez ou corrigez les bloquants" : "Matérialise postes et remarques pour le cabinet"} onClick={() => void validerRapport()}>
                      <Icon name="checkCircle" size={14} />
                      {valider.isPending ? "Validation…" : `Valider${enAttente.length ? ` - ${enAttente.length} proposition${enAttente.length > 1 ? "s" : ""} à valider` : bloquantsRestant.length ? ` - ${bloquantsRestant.length} à lever` : ""}`}
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="edit-inp sm" style={{ maxWidth: 260 }} placeholder="Motif de rejet" value={motifRejet} onChange={(e) => setMotifRejet(e.target.value)} />
                    <button className="se-btn se-btn-ghost btn-sm" disabled={!motifRejet.trim() || rejeter.isPending} onClick={() => { if (window.confirm("Rejeter ce rapport ? Le cabinet en sera informé.")) void rejeter.mutateAsync({ rapportId: id!, motif: motifRejet.trim() }).then(() => navigate("/ppt")); }}>
                      <Icon name="x" size={14} />
                      Rejeter
                    </button>
                  </div>
                  {erreurDecision && (
                    <p className="se-small" style={{ color: "var(--color-error-700)", margin: 0, maxWidth: 420, textAlign: "right" }}>{erreurDecision}</p>
                  )}
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
