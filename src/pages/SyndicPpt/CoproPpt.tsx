// Fiche d'une copropriété de la branche PPT - /syndic/ppt/copros/:id/:tab?
// Onglets : Échéancier (récap des postes du plan validé + suivi de l'échéancier
// où le syndic décale les travaux d'une année à l'autre, RPC 0073), Assemblées générales (saisie
// des passages et votes), Fonds travaux, Remarques (celles du rapport,
// visibles syndic), Documents (PPPT, DPE, PV, tableau PPT), Fiche, Historique.
import { useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Badge, DpeChip } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import type { DpeClass } from "@/lib/referentiels";
import { fmtEuroCourt } from "@/lib/format";
import { telechargerCsv } from "@/lib/csv";
import {
  telechargerPptRapport,
  urlSigneePpt,
  useAjouterPoste,
  useDecalerPptPostes,
  useDeposerPptRapport,
  useRetablirPoste,
  useRetirerPoste,
  useSaisirMontantPoste,
  TYPES_AVEC_HONORAIRES,
  useMajPptCopro,
  useOrganisationPpt,
  usePptAffectations,
  usePptAgs,
  usePptCopro,
  usePptJournal,
  usePptParametres,
  usePptPostes,
  usePptDeposants,
  usePptRapports,
  usePptRemarques,
  usePptResolutions,
  useSupprimerAg,
  useSupprimerPptRapport,
  type PptCoproAvecStats,
  type PptCoproPatch,
  type PptPoste,
  type TypeRapport,
} from "@/api/ppt";
import { remplacerCoproDansNom } from "@/lib/ppt/depot";
import { PARAMETRES_ORG_DEFAUT, anneeEffective, cepApres, etiquetteDepuisCep, gainCumule, montantTtcPoste, parametresDepuisOrg } from "@/lib/ppt/formules";
import { controlerResolutions } from "@/lib/ppt/indicateurs";
import { anneeAffichee, anneeCiblePossible, decalagesEffectifs, plageAnnees, posteDeplacable } from "@/lib/ppt/echeancier";
import { FONDS_TRAVAUX, TYPE_RAPPORT_LABEL } from "@/lib/ppt/referentiels";
import { SyndicShell, Loader, AucuneCopro } from "@/pages/Syndic";
import { AgForm } from "./AgForm";
import { ApercuDocument } from "@/components/ApercuDocument";
import { CorrigerDocument, RenommerFichiers, type DocumentACorriger } from "./CorrigerDocument";
import { PrioriteBadge, RenoBadge, SeveriteBadge, StatutPosteBadge, StatutRapportBadge, VerdictBadge, anneeCourante, fmtDateCourte, fmtEur, fmtPct, issueLabel, posteLite, type PrioriteCode } from "./commun";

const TABS = [
  { id: "echeancier", label: "Échéancier" },
  { id: "ag", label: "Assemblées générales" },
  { id: "fonds", label: "Fonds travaux" },
  { id: "remarques", label: "Remarques" },
  { id: "documents", label: "Documents" },
  { id: "fiche", label: "Fiche" },
  { id: "historique", label: "Historique" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function AccesReserve({ c }: { c: PptCoproAvecStats }) {
  const navigate = useNavigate();
  return (
    <SyndicShell active={null} branche="ppt">
      <div className="page fade" style={{ padding: 0 }}>
        <button className="se-btn se-btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={() => navigate("/syndic/ppt/copros")}>
          <Icon name="chevronLeft" size={15} />
          Copropriétés
        </button>
        <div className="panel" style={{ padding: "22px 24px", display: "flex", gap: 14, alignItems: "flex-start" }}>
          <Icon name="lock" size={22} style={{ color: "var(--fg-muted)", flex: "none" }} />
          <div>
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontFamily: "var(--font-display)" }}>{c.nom}</h2>
            <p className="se-body" style={{ margin: 0 }}>
              Ce dossier fait partie du portefeuille de votre enseigne, mais il est suivi par <b>{c.gestionnaire_nom || "un autre gestionnaire"}</b>. Seule la direction et le gestionnaire en charge peuvent l'ouvrir.
            </p>
          </div>
        </div>
      </div>
    </SyndicShell>
  );
}

// ---------- Échéancier ----------
/** Export PDF de l'échéancier : même document depuis l'en-tête de la fiche (grand),
 *  le récap des postes et le suivi de l'échéancier (feedback Amir 20/09). */
function BoutonPdfEcheancier({ c, postes, grand }: { c: PptCoproAvecStats; postes: PptPoste[]; grand?: boolean }) {
  const { data: org } = usePptParametres(c.organisation_id);
  const { data: orgPpt } = useOrganisationPpt();
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(false);
  const actifs = postes.filter((p) => p.actif);
  const exporter = async () => {
    setBusy(true);
    setErreur(false);
    try {
      const annee = anneeCourante();
      const params = parametresDepuisOrg(org ?? PARAMETRES_ORG_DEFAUT, annee, c.cep_kwhep_m2_an);
      const { genererEcheancierPdf } = await import("@/lib/pdf/echeancierPpt");
      const { telechargerPdfBytes } = await import("@/lib/pdf/planIndividuel");
      const bytes = await genererEcheancierPdf({
        copro: c,
        nomEnseigne: orgPpt?.nom ?? null,
        postes: actifs.map((p) => ({ ...p, priorite: p.priorite as PrioriteCode })),
        params,
        annee,
      });
      telechargerPdfBytes(bytes, `Echeancier PPT - ${c.nom.replace(/[\/:*?"<>|]+/g, "-")}.pdf`);
    } catch {
      setErreur(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      className={grand ? "se-btn se-btn-primary" : "se-btn se-btn-secondary btn-sm"}
      disabled={busy || actifs.length === 0}
      title={actifs.length === 0 ? "Aucun poste validé à exporter" : erreur ? "L'export a échoué, réessayez" : "Échéancier PPT au format PDF : synthèse, grille année par année, détail des postes"}
      onClick={() => void exporter()}
    >
      <Icon name="fileText" size={grand ? 16 : 13} />
      {busy ? "PDF en cours…" : grand ? "Exporter le PPT en PDF" : "PDF"}
    </button>
  );
}

function EcheancierTab({ c, postes }: { c: PptCoproAvecStats; postes: PptPoste[] }) {
  const { data: org } = usePptParametres(c.organisation_id);
  const annee = anneeCourante();
  const params = parametresDepuisOrg(org ?? PARAMETRES_ORG_DEFAUT, annee, c.cep_kwhep_m2_an);
  const [archives, setArchives] = useState(false);
  const actifs = postes.filter((p) => p.actif);
  // retirées par le syndic (motif, date, feedback 22/09) ≠ archivées par une nouvelle version du rapport
  const retirees = postes.filter((p) => !p.actif && p.retire_le);
  const anciens = postes.filter((p) => !p.actif && !p.retire_le);
  const lignes = [...(archives ? [...actifs, ...anciens] : actifs)].sort((a, b) => (anneeEffective(a) ?? 9999) - (anneeEffective(b) ?? 9999) || a.position - b.position);
  // TTC estimé du rapport : coût normalisé, TVA, MOE et honoraires, à l'année prévue
  // au plan, sans décalage ni saisie du syndic (le « coût HT de base » seul ne parle pas)
  const ttcEstime = (p: PptPoste) => montantTtcPoste({ ...posteLite(p), montant_syndic: null }, params, p.annee_prevue ?? annee);
  const totalEstime = actifs.reduce((s, p) => s + (ttcEstime(p) ?? 0), 0);
  const totalTtc = actifs.reduce((s, p) => s + (montantTtcPoste(posteLite(p), params) ?? 0), 0);
  const lites = actifs.map(posteLite);
  const anneesGain = [...new Set(actifs.filter((p) => p.priorite === "energetique" && p.gain_energetique_pct != null).map((p) => anneeEffective(p)).filter((a): a is number => a != null))].sort();

  if (actifs.length === 0)
    return (
      <div className="panel" style={{ padding: 22, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <p className="se-body" style={{ margin: 0, flex: 1, minWidth: 260 }}>
          {retirees.length > 0 ? `Toutes les lignes du plan ont été retirées (${retirees.length}). Rétablissez-en depuis « Lignes retirées » ou ajoutez une ligne.` : c.stats?.statut_rapport === "valide" ? "Le plan validé ne contient aucun poste." : c.stats?.rapports_en_attente ? "Le PPPT est en cours d'analyse chez Strat Eco : l'échéancier apparaîtra à la validation." : "Aucun PPPT validé pour cette copropriété - déposez le rapport depuis l'onglet Documents."}
        </p>
        {retirees.length > 0 && <BoutonLignesRetirees retirees={retirees} params={params} />}
      </div>
    );

  return (
    <>
      <div className="tiles tiles-4" style={{ marginBottom: 18 }}>
        <div className="tile"><div className="t-lbl">Postes du plan</div><div className="t-val">{actifs.length}</div><div className="t-foot">{actifs.filter((p) => p.cout_ht_base == null).length} non chiffré{actifs.filter((p) => p.cout_ht_base == null).length > 1 ? "s" : ""}</div></div>
        <div className="tile"><div className="t-lbl">TTC estimé (rapport)</div><div className="t-val">{fmtEuroCourt(totalEstime)}</div><div className="t-foot">aux années prévues au plan, tel que normalisé depuis le PPPT</div></div>
        <div className="tile"><div className="t-lbl">TTC retenu</div><div className="t-val accent">{fmtEuroCourt(totalTtc)}</div><div className="t-foot">après décalages, montants saisis et votes</div></div>
        <div className="tile"><div className="t-lbl">Gain énergétique à terme</div><div className="t-val">{fmtPct(gainCumule(lites, annee + 10))}</div><div className="t-foot">{c.cep_kwhep_m2_an ? `Cep ${c.cep_kwhep_m2_an} → ${cepApres(c.cep_kwhep_m2_an, gainCumule(lites, annee + 10))} kWh/m².an (${etiquetteDepuisCep(cepApres(c.cep_kwhep_m2_an, gainCumule(lites, annee + 10)))})` : "Cep de référence inconnu"}</div></div>
      </div>

      <div className="panel">
        <div className="p-head">
          <Icon name="clipboard" size={18} />
          <h3>Postes de travaux récap</h3>
          <span style={{ flex: 1 }}></span>
          {anciens.length > 0 && (
            <label className="se-small" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg-muted)" }}>
              <input type="checkbox" checked={archives} onChange={(e) => setArchives(e.target.checked)} /> versions précédentes ({anciens.length})
            </label>
          )}
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() =>
              telechargerCsv(
                `ppt-${c.nom.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`,
                ["Poste", "Origine", "Priorité", "Ouvrage", "Bâtiment", "Année prévue", "Nouvelle présentation", "TTC estimé (rapport)", "Coût HT base", "TVA %", "TTC retenu", "Montant saisi (syndic)", "Commentaire syndic", "Gain énergétique", "Statut", "Montant voté"],
                lignes.map((p) => [p.libelle, p.origine === "syndic" ? "Ajouté par le syndic" : "Rapport", p.priorite, p.ouvrage ?? "", p.batiment ?? "", p.annee_prevue ?? "", p.annee_prochaine_presentation ?? "", ttcEstime(p) ?? "", p.cout_ht_base ?? "", p.tva_pct ?? "", montantTtcPoste(posteLite(p), params) ?? "", p.montant_syndic ?? "", p.commentaire_syndic ?? "", p.gain_energetique_pct ?? "", p.statut, p.montant_vote ?? ""])
              )
            }
          >
            <Icon name="download" size={13} />
            CSV
          </button>
          <BoutonPdfEcheancier c={c} postes={postes} />
        </div>
        <div className="p-body" style={{ paddingTop: 0 }}>
          <div className="tablewrap">
            <table className="dossiers" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Poste</th>
                  <th>Nature</th>
                  <th className="num">Année</th>
                  <th className="num" title="TTC du rapport à l'année prévue au plan : coût normalisé, TVA, MOE et honoraires">TTC estimé</th>
                  <th className="num" title="TTC actualisé, ou montant saisi par le syndic, ou montant voté">TTC retenu</th>
                  <th className="num">Gain</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((p) => (
                  <tr key={p.id} style={{ cursor: "default", opacity: p.actif ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600 }}>
                      {p.libelle}
                      {p.origine === "syndic" && <Badge kind="neutral">ajouté par le syndic</Badge>}
                      {(p.batiment || p.commentaire) && <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 400 }}>{[p.batiment, p.commentaire].filter(Boolean).join(" · ")}</span>}
                      {p.commentaire_syndic && <span style={{ display: "block", fontSize: 11.5, color: "var(--color-primary-700)", fontWeight: 400 }}><Icon name="message" size={11} /> {p.commentaire_syndic}</span>}
                    </td>
                    <td><PrioriteBadge priorite={p.priorite} /></td>
                    <td className="num">
                      {p.annee_prochaine_presentation && p.annee_prochaine_presentation !== p.annee_prevue ? (
                        <span title={`prévu ${p.annee_prevue ?? "-"}, à représenter en ${p.annee_prochaine_presentation}`}>
                          <s style={{ color: "var(--fg-muted)" }}>{p.annee_prevue}</s> {p.annee_prochaine_presentation}
                        </span>
                      ) : (
                        p.annee_prevue ?? <span style={{ color: "var(--color-warning-700)" }}>à fixer</span>
                      )}
                      {p.annee_origine === "deduite" && <span title="année déduite d'une période (court / moyen / long terme)" style={{ color: "var(--fg-muted)" }}> ~</span>}
                    </td>
                    <td className="num">
                      {ttcEstime(p) != null ? (
                        <span title={`${fmtEur(p.cout_ht_base)} HT normalisés`}>{fmtEur(ttcEstime(p))}</span>
                      ) : p.origine === "syndic" ? (
                        /* ligne ajoutée par le syndic : pas d'estimation du rapport, case vierge (feedback 20/09) */
                        ""
                      ) : (
                        <span style={{ color: "var(--color-warning-700)" }}>à chiffrer</span>
                      )}
                    </td>
                    <td className="num">
                      {p.statut === "vote" && p.montant_vote != null ? (
                        <b title="montant voté">{fmtEur(p.montant_vote)}</b>
                      ) : p.montant_syndic != null ? (
                        <span title={`Montant saisi par le syndic${p.commentaire_syndic ? ` : ${p.commentaire_syndic}` : ""}`} style={{ color: "var(--color-primary-700)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Icon name="edit" size={11} />
                          {fmtEur(p.montant_syndic)}
                        </span>
                      ) : (
                        fmtEur(montantTtcPoste(posteLite(p), params))
                      )}
                    </td>
                    <td className="num">{p.gain_energetique_pct != null ? fmtPct(p.gain_energetique_pct) : "-"}</td>
                    <td><StatutPosteBadge statut={p.statut} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="recap-total">
                  <td colSpan={3}>Total des postes du plan{archives && anciens.length > 0 ? " (versions précédentes exclues)" : ""}</td>
                  <td className="num" title="somme des TTC estimés par le rapport, aux années prévues au plan">{fmtEur(totalEstime)}</td>
                  <td className="num" title="somme des TTC retenus : votés, saisis ou actualisés" style={{ color: "var(--color-primary-700)" }}>{fmtEur(totalTtc)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {anneesGain.length > 0 && c.cep_kwhep_m2_an != null && (
            <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
              Gain cumulé par année (gains composés) : {anneesGain.map((a) => `${a} : ${fmtPct(gainCumule(lites, a))} (Cep ${cepApres(c.cep_kwhep_m2_an, gainCumule(lites, a))}, ${etiquetteDepuisCep(cepApres(c.cep_kwhep_m2_an, gainCumule(lites, a)))})`).join(" · ")}. Montants indicatifs à confirmer par devis.
            </p>
          )}
        </div>
      </div>

      <SuiviEcheancier key={actifs.map((p) => `${p.id}:${p.annee_prochaine_presentation ?? ""}`).join("|")} copro={c} postes={actifs} retirees={retirees} params={params} annee={annee} />
    </>
  );
}

// ---------- Suivi de l'échéancier ----------
// Même principe que le suivi financier du syndic (rénovation globale) avec les
// années à la place des situations : une colonne par année, le poste est posé
// dans sa colonne avec son TTC actualisé ; un clic sur une autre colonne le
// décale (brouillon), Enregistrer applique. Le récap au-dessus reprend les
// décalages via annee_prochaine_presentation.
function SuiviEcheancier({ copro, postes, retirees, params, annee }: { copro: PptCoproAvecStats; postes: PptPoste[]; retirees: PptPoste[]; params: ReturnType<typeof parametresDepuisOrg>; annee: number }) {
  const decaler = useDecalerPptPostes();
  const [brouillon, setBrouillon] = useState<Record<string, number>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState<PptPoste | null>(null);
  const [ajout, setAjout] = useState(false);
  // bulle de commentaire : rendue hors du tableau (position fixe, portail) pour
  // ne pas être coupée par le conteneur défilant ni passer sous les en-têtes
  const [bulleEtat, setBulleEtat] = useState<{ texte: string; x: number; y: number } | null>(null);
  const montrerBulle = (texte: string | undefined) => (e: MouseEvent<HTMLElement>) => {
    if (!texte) return;
    const r = e.currentTarget.getBoundingClientRect();
    setBulleEtat({ texte, x: r.left + r.width / 2, y: r.top });
  };
  const ids = postes.map((p) => p.id);
  const annees = plageAnnees(postes, annee, brouillon, ids);
  const lignes = [...postes].sort((a, b) => (anneeAffichee(a, brouillon, a.id) ?? 9999) - (anneeAffichee(b, brouillon, b.id) ?? 9999) || a.position - b.position);
  const sansAnnee = lignes.some((p) => anneeAffichee(p, brouillon, p.id) == null);
  const changements = decalagesEffectifs(postes, brouillon);
  const totalAnnee = (a: number) => lignes.reduce((s, p) => (anneeAffichee(p, brouillon, p.id) === a ? s + (montantTtcPoste(posteLite(p), params, a) ?? 0) : s), 0);
  const nbDeplaces = (a: number) => lignes.filter((p) => anneeAffichee(p, brouillon, p.id) === a).length;

  const poser = (p: PptPoste, a: number) => {
    if (!anneeCiblePossible(p, a, annee) || decaler.isPending) return;
    setErreur(null);
    setBrouillon((b) => {
      const n = { ...b };
      if (a === anneeEffective(p)) delete n[p.id];
      else n[p.id] = a;
      return n;
    });
  };

  const enregistrer = async () => {
    if (changements.length === 0) return;
    setErreur(null);
    try {
      await decaler.mutateAsync(changements);
      setBrouillon({});
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'enregistrement a échoué.");
    }
  };

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="p-head">
        <Icon name="calendar" size={18} />
        <h3>Suivi de l'échéancier</h3>
        <span style={{ flex: 1 }}></span>
        <BoutonPdfEcheancier c={copro} postes={postes} />
        <button className="se-btn se-btn-secondary btn-sm" onClick={() => setAjout(true)} disabled={decaler.isPending}>
          <Icon name="plus" size={14} />
          Ajouter une ligne
        </button>
        <BoutonLignesRetirees retirees={retirees} params={params} />
        {changements.length > 0 && (
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => setBrouillon({})} disabled={decaler.isPending}>
            Annuler
          </button>
        )}
        <button className="se-btn se-btn-primary btn-sm" disabled={changements.length === 0 || decaler.isPending} onClick={() => void enregistrer()}>
          <Icon name="check" size={14} />
          {decaler.isPending ? "Enregistrement…" : changements.length > 0 ? `Enregistrer ${changements.length} décalage${changements.length > 1 ? "s" : ""}` : "Enregistrer"}
        </button>
      </div>
      <div className="p-body" style={{ paddingTop: 0 }}>
        {erreur && <p style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>{erreur}</p>}
        <div className="sf-wrap">
          <table className="dossiers sf-table ech-table" style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th>Poste</th>
                {sansAnnee && <th className="num">À fixer</th>}
                {annees.map((a) => (
                  <th key={a} className="num" style={{ color: a === annee ? "var(--color-primary-700)" : undefined }}>{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((p) => {
                const courante = anneeAffichee(p, brouillon, p.id);
                const initiale = anneeEffective(p);
                const libre = posteDeplacable(p);
                const modifie = brouillon[p.id] != null;
                // montant saisi à la main : pastille d'une autre couleur, commentaire en bulle au survol
                const saisi = p.montant_syndic != null && !(p.statut === "vote" && p.montant_vote != null);
                const bulle = [saisi ? `Montant saisi par le syndic (au lieu de ${fmtEuroCourt(montantTtcPoste({ ...posteLite(p), montant_syndic: null }, params, courante) ?? 0)} calculés)` : "", p.commentaire_syndic ?? ""].filter(Boolean).join(" - ") || undefined;
                return (
                  <tr key={p.id} style={{ cursor: "default" }}>
                    <td style={{ fontWeight: 600, whiteSpace: "normal", minWidth: 200 }}>
                      {p.libelle}
                      {p.origine === "syndic" && <span title="ligne ajoutée par le syndic" style={{ marginLeft: 6, color: "var(--fg-muted)", fontWeight: 400, fontSize: 11 }}>(ajoutée)</span>}
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 400 }}>
                        {p.statut === "vote" ? "voté" : p.statut === "realise" ? "réalisé" : p.statut === "abandonne" ? "abandonné" : p.statut === "reporte" ? "reporté en AG" : p.statut === "rejete" ? "rejeté en AG" : p.statut === "presente" ? "présenté" : "programmé"}
                        {p.annee_prevue != null && courante !== p.annee_prevue ? ` · prévu ${p.annee_prevue} au plan` : ""}
                      </span>
                    </td>
                    {sansAnnee && <td className="num">{courante == null && <span className="ech-chip ech-chip-vide">à fixer</span>}</td>}
                    {annees.map((a) => {
                      const ici = courante === a;
                      // jamais avant l'année en cours (feedback 23/09)
                      const cible = !ici && anneeCiblePossible(p, a, annee);
                      // flèches vertes sur l'année suivante et la précédente : repousser
                      // (feedback 20/09) ou avancer (feedback 23/09) d'un an en un clic
                      const suivante = cible && courante != null && a === courante + 1;
                      const precedente = cible && courante != null && a === courante - 1;
                      const montant = montantTtcPoste(posteLite(p), params, a);
                      return (
                        <td
                          key={a}
                          className={"num ech-cell" + (ici ? " ici" : "") + (cible ? " libre" : "")}
                          onClick={cible ? () => poser(p, a) : undefined}
                          title={ici ? (libre ? "Année actuelle du poste" : "Poste figé : voté, réalisé ou abandonné") : suivante ? `Repousser « ${p.libelle} » d'un an, en ${a}` : precedente ? `Avancer « ${p.libelle} » d'un an, en ${a}` : cible ? `Décaler « ${p.libelle} » en ${a}` : libre ? `Impossible de programmer avant ${annee}` : undefined}
                        >
                          {ici ? (
                            <button
                              type="button"
                              className={"ech-chip" + (modifie ? " modifie" : "") + (!libre ? " fige" : "") + (saisi ? " saisi" : "") + (p.statut === "vote" ? " vote" : p.statut === "rejete" ? " rejete" : "")}
                              title={bulle ? undefined : "Cliquer pour saisir un montant et un commentaire"}
                              onMouseEnter={montrerBulle(bulle)}
                              onMouseLeave={() => setBulleEtat(null)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setBulleEtat(null);
                                setEdition(p);
                              }}
                            >
                              {!libre && <Icon name="lock" size={11} />}
                              {saisi && <Icon name="edit" size={11} />}
                              {p.statut === "vote" && p.montant_vote != null ? fmtEuroCourt(p.montant_vote) : montant != null ? fmtEuroCourt(montant) : "non chiffré"}
                              {p.commentaire_syndic && <Icon name="message" size={11} />}
                            </button>
                          ) : suivante ? (
                            <span className="ech-suivant" aria-label={`Repousser en ${a}`}>
                              <Icon name="arrowRight" size={15} />
                              <span className="ech-suivant-lbl">{a}</span>
                            </span>
                          ) : precedente ? (
                            <span className="ech-suivant" aria-label={`Avancer en ${a}`}>
                              <Icon name="arrowLeft" size={15} />
                              <span className="ech-suivant-lbl">{a}</span>
                            </span>
                          ) : cible ? (
                            <span className="ech-cible">{initiale === a && modifie ? "↺" : "·"}</span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ textAlign: "left" }}>Total TTC actualisé</td>
                {sansAnnee && <td></td>}
                {annees.map((a) => {
                  const t = totalAnnee(a);
                  return (
                    <td key={a} className="num" title={`${nbDeplaces(a)} poste${nbDeplaces(a) > 1 ? "s" : ""}`}>
                      {t ? fmtEuroCourt(t) : "-"}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
          Les flèches vertes repoussent (→) ou avancent (←) le poste d'un an ; un clic sur toute autre année le décale à cette année, jamais avant {annee}. Puis Enregistrer : le récap ci-dessus et le tableau de bord suivent. Le montant est recalculé pour l'année choisie (inflation, TVA, honoraires). Un clic sur un montant permet de le saisir à la main et d'y joindre un commentaire, visible au survol, ou de retirer la ligne du plan avec un motif obligatoire ; « Lignes retirées » les liste et permet de les rétablir. Les postes votés, réalisés ou abandonnés sont figés. Tout est tracé dans l'historique.
        </p>
      </div>
      {bulleEtat &&
        createPortal(
          <div className="ech-bulle" role="tooltip" style={{ left: bulleEtat.x, top: bulleEtat.y }}>
            {bulleEtat.texte}
          </div>,
          document.body
        )}
      {edition && <SaisieMontant poste={edition} params={params} annee={anneeAffichee(edition, brouillon, edition.id)} onClose={() => setEdition(null)} />}
      {ajout && <AjoutLigne copro={copro} annee={annee} onClose={() => setAjout(false)} />}
    </div>
  );
}

const PRIORITE_OPTIONS: { id: PrioriteCode; label: string }[] = [
  { id: "preservation", label: "Préservation du bâti" },
  { id: "energetique", label: "Performance énergétique" },
  { id: "amelioration", label: "Amélioration" },
  { id: "securite", label: "Sécurité" },
  { id: "sante", label: "Santé" },
];

const champStyle = { display: "flex", flexDirection: "column" as const, gap: 6, fontSize: 13, fontWeight: 500 };

/** Saisie du montant TTC à la main + commentaire (feedback 20/09) ; Entrée valide. */
function SaisieMontant({ poste, params, annee, onClose }: { poste: PptPoste; params: ReturnType<typeof parametresDepuisOrg>; annee: number | null; onClose: () => void }) {
  const saisir = useSaisirMontantPoste();
  const retirer = useRetirerPoste();
  const [montant, setMontant] = useState(poste.montant_syndic != null ? String(poste.montant_syndic) : "");
  const [commentaire, setCommentaire] = useState(poste.commentaire_syndic ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  // retrait de la ligne (feedback 22/09) : toute ligne ni votée ni réalisée, motif obligatoire
  const [retrait, setRetrait] = useState(false);
  const [motif, setMotif] = useState("");
  const retirable = poste.statut !== "vote" && poste.statut !== "realise";
  const calcule = montantTtcPoste({ ...posteLite(poste), montant_syndic: null }, params, annee);
  const busy = saisir.isPending || retirer.isPending;
  const valeur = montant.trim() === "" ? null : Number(montant.replace(/\s/g, "").replace(",", "."));
  const valide = !busy && (valeur === null || (Number.isFinite(valeur) && valeur >= 0));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valide) return;
    setErreur(null);
    try {
      await saisir.mutateAsync({ poste_id: poste.id, montant: valeur, commentaire: commentaire.trim() || null });
      onClose();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "L'enregistrement a échoué.");
    }
  };

  return (
    <Modal title="Montant du poste" onClose={onClose} width={460} closeOnBackdrop={!busy}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{poste.libelle}</div>
          <div className="se-small" style={{ color: "var(--fg-muted)" }}>
            {annee ?? "année à fixer"} · <PrioriteBadge priorite={poste.priorite} />
            {poste.statut === "vote" && poste.montant_vote != null ? ` · voté ${fmtEur(poste.montant_vote)}` : ""}
          </div>
        </div>
        <label style={champStyle}>
          Montant TTC saisi (€)
          <input className="edit-inp" style={{ maxWidth: "none" }} inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder={calcule != null ? `calculé : ${fmtEur(calcule)}` : "non chiffré dans le rapport"} autoFocus />
          <span className="se-small" style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
            {calcule != null ? `Le rapport donne ${fmtEur(calcule)} TTC actualisés pour ${annee ?? "-"}. ` : ""}Laissez vide pour revenir au montant calculé. Le montant saisi remplace le calcul dans le récap, le suivi et le tableau de bord.
          </span>
        </label>
        <label style={champStyle}>
          Commentaire
          <textarea className="cs-textarea" rows={3} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Devis reçu, décision du conseil syndical, précision sur le périmètre…" />
          <span className="se-small" style={{ color: "var(--fg-muted)", fontWeight: 400 }}>Affiché au survol du montant et sous le poste dans le récap.</span>
        </label>
        {erreur && <p style={{ margin: 0, padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>{erreur}</p>}
        {retrait ? (
          <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={champStyle}>
              Motif du retrait *
              <textarea className="cs-textarea" rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Travaux déjà réalisés, poste hors périmètre de la copropriété, doublon avec un autre poste…" autoFocus />
              <span className="se-small" style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
                Obligatoire. La ligne sort du récap, du suivi et du tableau de bord ; elle reste consultable et rétablissable depuis « Lignes retirées ». Le motif est tracé dans l'historique.
              </span>
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={() => setRetrait(false)} disabled={busy}>Annuler</button>
              <button
                type="button"
                className="se-btn se-btn-primary btn-sm"
                style={{ background: "var(--color-error-700)", borderColor: "var(--color-error-700)" }}
                disabled={busy || !motif.trim()}
                onClick={() => {
                  setErreur(null);
                  retirer.mutateAsync({ poste_id: poste.id, motif: motif.trim() }).then(onClose).catch((err) => setErreur(err instanceof Error ? err.message : "Le retrait a échoué."));
                }}
              >
                <Icon name="trash" size={13} />
                {retirer.isPending ? "Retrait…" : "Retirer la ligne"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {retirable && (
              <button type="button" className="se-btn se-btn-ghost btn-sm" style={{ color: "var(--color-error-700)" }} disabled={busy} title="Retirer cette ligne du plan, avec un motif" onClick={() => setRetrait(true)}>
                <Icon name="trash" size={13} />
                Retirer la ligne
              </button>
            )}
            <span style={{ flex: 1 }}></span>
            <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={onClose} disabled={busy}>Annuler</button>
            <button type="submit" className="se-btn se-btn-primary btn-sm" disabled={!valide}>
              <Icon name="check" size={14} />
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}

/** « Lignes retirées » (feedback Amir 22/09) : bouton à côté de « Ajouter une ligne »,
 *  tableau des postes retirés par le cabinet avec motif et date, rétablissement en un clic. */
function BoutonLignesRetirees({ retirees, params }: { retirees: PptPoste[]; params: ReturnType<typeof parametresDepuisOrg> }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button className="se-btn se-btn-secondary btn-sm" onClick={() => setOuvert(true)} disabled={retirees.length === 0} title={retirees.length ? "Voir les lignes retirées du plan et les rétablir" : "Aucune ligne retirée"}>
        <Icon name="trash" size={14} />
        Lignes retirées{retirees.length ? ` (${retirees.length})` : ""}
      </button>
      {ouvert && <LignesRetirees retirees={retirees} params={params} onClose={() => setOuvert(false)} />}
    </>
  );
}

function LignesRetirees({ retirees, params, onClose }: { retirees: PptPoste[]; params: ReturnType<typeof parametresDepuisOrg>; onClose: () => void }) {
  const retablir = useRetablirPoste();
  const [erreur, setErreur] = useState<string | null>(null);
  const lignes = [...retirees].sort((a, b) => (b.retire_le ?? "").localeCompare(a.retire_le ?? ""));
  return (
    <Modal title="Lignes retirées" onClose={onClose} width={1060} closeOnBackdrop={!retablir.isPending}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
          Lignes retirées de l'échéancier par le cabinet, avec le motif indiqué au retrait. Elles ne comptent plus dans le récap, le suivi ni le tableau de bord. « Remettre dans le plan » remet la ligne dans l'échéancier telle qu'elle était.
        </p>
        {lignes.length === 0 ? (
          <p className="se-body" style={{ margin: 0 }}>Aucune ligne retirée.</p>
        ) : (
          <div className="tablewrap" style={{ overflowX: "auto" }}>
            <table className="dossiers" style={{ fontSize: 13, minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Poste</th>
                  <th>Nature</th>
                  <th className="num">Année</th>
                  <th className="num">TTC</th>
                  <th>Motif du retrait</th>
                  <th>Retirée le</th>
                  <th style={{ textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((p) => (
                  <tr key={p.id} style={{ cursor: "default" }}>
                    <td style={{ fontWeight: 600, whiteSpace: "normal", minWidth: 180 }}>
                      {p.libelle}
                      {p.origine === "syndic" && <Badge kind="neutral">ajouté par le syndic</Badge>}
                      {p.batiment && <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 400 }}>{p.batiment}</span>}
                    </td>
                    <td><PrioriteBadge priorite={p.priorite} /></td>
                    <td className="num">{anneeEffective(p) ?? "-"}</td>
                    <td className="num">{fmtEur(montantTtcPoste(posteLite(p), params))}</td>
                    <td style={{ whiteSpace: "normal", maxWidth: 260 }}>{p.motif_retrait}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDateCourte(p.retire_le)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        className="se-btn se-btn-secondary btn-sm"
                        style={{ whiteSpace: "nowrap" }}
                        disabled={retablir.isPending}
                        title="Remettre cette ligne dans le plan"
                        onClick={() => {
                          setErreur(null);
                          retablir.mutateAsync(p.id).catch((err) => setErreur(err instanceof Error ? err.message : "Le rétablissement a échoué."));
                        }}
                      >
                        <Icon name="refresh" size={13} />
                        Remettre dans le plan
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {erreur && <p style={{ margin: 0, padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>{erreur}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={onClose} disabled={retablir.isPending}>Fermer</button>
        </div>
      </div>
    </Modal>
  );
}

/** « Ajouter une ligne » : poste créé par le syndic (origine syndic, statut programmé). */
function AjoutLigne({ copro, annee, onClose }: { copro: PptCoproAvecStats; annee: number; onClose: () => void }) {
  const ajouter = useAjouterPoste();
  const [libelle, setLibelle] = useState("");
  const [priorite, setPriorite] = useState<PrioriteCode>("preservation");
  const [anneeSaisie, setAnneeSaisie] = useState(String(annee + 1));
  const [montant, setMontant] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const valeur = montant.trim() === "" ? null : Number(montant.replace(/\s/g, "").replace(",", "."));
  const an = anneeSaisie.trim() === "" ? null : Number(anneeSaisie);
  const valide = !ajouter.isPending && libelle.trim().length > 1 && (valeur === null || (Number.isFinite(valeur) && valeur >= 0)) && (an === null || (Number.isInteger(an) && an >= 2000 && an <= 2100));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valide) return;
    setErreur(null);
    try {
      await ajouter.mutateAsync({ copro_id: copro.id, libelle: libelle.trim(), priorite, annee: an, montant: valeur, commentaire: commentaire.trim() || null });
      onClose();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "L'ajout a échoué.");
    }
  };

  return (
    <Modal title="Ajouter une ligne" onClose={onClose} width={480} closeOnBackdrop={!ajouter.isPending}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={champStyle}>
          Poste de travaux *
          <input className="edit-inp" style={{ maxWidth: "none" }} value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Mise aux normes de l'ascenseur" autoFocus required />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={champStyle}>
            Nature
            <select className="edit-inp" style={{ maxWidth: "none" }} value={priorite} onChange={(e) => setPriorite(e.target.value as PrioriteCode)}>
              {PRIORITE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>
          <label style={champStyle}>
            Année
            <input className="edit-inp" style={{ maxWidth: "none" }} type="number" min={2000} max={2100} value={anneeSaisie} onChange={(e) => setAnneeSaisie(e.target.value)} placeholder="à fixer" />
          </label>
          <label style={champStyle}>
            Montant TTC (€)
            <input className="edit-inp" style={{ maxWidth: "none" }} inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="facultatif" />
          </label>
        </div>
        <label style={champStyle}>
          Commentaire
          <textarea className="cs-textarea" rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Origine du besoin, devis, décision…" />
        </label>
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
          La ligne est marquée « ajoutée par le syndic » : elle se décale, se vote en AG et se retrouve dans le récap comme les postes du rapport. Elle reste si Strat Eco valide une nouvelle version du PPPT.
        </p>
        {erreur && <p style={{ margin: 0, padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>{erreur}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={onClose} disabled={ajouter.isPending}>Annuler</button>
          <button type="submit" className="se-btn se-btn-primary btn-sm" disabled={!valide}>
            <Icon name="plus" size={14} />
            {ajouter.isPending ? "Ajout…" : "Ajouter"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Assemblées générales ----------
function AgTab({ c, postes }: { c: PptCoproAvecStats; postes: PptPoste[] }) {
  const { data: ags } = usePptAgs([c.id]);
  const { data: resolutions } = usePptResolutions((ags ?? []).map((a) => a.id));
  const supprimer = useSupprimerAg();
  const [saisie, setSaisie] = useState(false);
  const alertes = useMemo(() => controlerResolutions((resolutions ?? []).map((r) => ({ ag_id: r.ag_id, poste_id: r.poste_id, issue: r.issue, article: r.article, montant_vote: r.montant_vote })), postes.map(posteLite)), [resolutions, postes]);
  const parAg = new Map<string, typeof resolutions>();
  for (const r of resolutions ?? []) parAg.set(r.ag_id, [...(parAg.get(r.ag_id) ?? []), r]);
  const posteDe = new Map(postes.map((p) => [p.id, p]));

  return (
    <>
      <div className="panel">
        <div className="p-head">
          <Icon name="users" size={18} />
          <h3>Assemblées générales</h3>
          <span style={{ flex: 1 }}></span>
          <button className="se-btn se-btn-primary btn-sm" onClick={() => setSaisie(true)}>
            <Icon name="plus" size={14} />
            Saisir une AG
          </button>
        </div>
        <div className="p-body" style={{ paddingTop: 4 }}>
          {(ags ?? []).length === 0 ? (
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>Aucune assemblée saisie. Chaque présentation du plan en AG, votée ou non, se consigne ici : c'est ce qui fait vivre les postes rejetés d'une année sur l'autre.</p>
          ) : (
            (ags ?? []).map((ag) => (
              <div key={ag.id} style={{ padding: "12px 4px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon name="calendar" size={16} style={{ color: "var(--color-primary-700)" }} />
                  <b>AG {ag.type === "extraordinaire" ? "extraordinaire" : "ordinaire"} du {fmtDateCourte(ag.date_ag)}</b>
                  <span className="spacer"></span>
                  <button className="icon-btn" title="Supprimer cette AG (les postes conservent leur dernier statut)" onClick={() => { if (window.confirm("Supprimer cette assemblée et ses résolutions ?")) void supprimer.mutateAsync(ag.id); }}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
                {ag.notes && <p className="se-small" style={{ margin: "4px 0 0 26px", whiteSpace: "pre-wrap" }}>{ag.notes}</p>}
                <div style={{ margin: "6px 0 0 26px", display: "flex", flexDirection: "column", gap: 4 }}>
                  {(parAg.get(ag.id) ?? []).map((r) => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                      <Badge kind={r.issue === "adopte" ? "success" : r.issue === "non_presente" ? "neutral" : "warn"}>{issueLabel(r.issue)}</Badge>
                      <span>{r.intitule}</span>
                      {r.article && <span style={{ color: "var(--fg-muted)" }}>art. {r.article}</span>}
                      {r.montant_vote != null && <span style={{ color: "var(--fg-muted)" }}>{fmtEur(r.montant_vote)}</span>}
                      {r.poste_id && posteDe.get(r.poste_id) && r.issue !== "adopte" && posteDe.get(r.poste_id)!.annee_prochaine_presentation && (
                        <span style={{ color: "var(--color-warning-700)" }}>→ à représenter en {posteDe.get(r.poste_id)!.annee_prochaine_presentation}</span>
                      )}
                    </div>
                  ))}
                  {(parAg.get(ag.id) ?? []).length === 0 && <span className="se-small" style={{ color: "var(--fg-muted)" }}>aucune résolution sur le plan</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {alertes.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="p-head"><Icon name="alert" size={18} /><h3>Points à vérifier</h3></div>
          <div className="p-body" style={{ paddingTop: 4 }}>
            {alertes.map((a, i) => (
              <p key={i} className="se-small" style={{ margin: "4px 0" }}><Badge kind="neutral">{a.code}</Badge> {a.libelle}</p>
            ))}
          </div>
        </div>
      )}
      {saisie && <AgForm copro={c} postes={postes} onClose={() => setSaisie(false)} />}
    </>
  );
}

// ---------- Fonds travaux ----------
function FondsTab({ c, postes }: { c: PptCoproAvecStats; postes: PptPoste[] }) {
  const maj = useMajPptCopro();
  const { data: org } = usePptParametres(c.organisation_id);
  const annee = anneeCourante();
  const params = parametresDepuisOrg(org ?? PARAMETRES_ORG_DEFAUT, annee, c.cep_kwhep_m2_an);
  const [solde, setSolde] = useState(c.fonds_travaux_solde?.toString() ?? "");
  const [cotisation, setCotisation] = useState(c.fonds_travaux_cotisation_annuelle?.toString() ?? "");
  const [majLe, setMajLe] = useState(c.fonds_travaux_maj ?? "");
  const [budget, setBudget] = useState(c.budget_previsionnel_annuel?.toString() ?? "");
  const actifs = postes.filter((p) => p.actif && !["realise", "abandonne"].includes(p.statut));
  const planHt = actifs.reduce((s, p) => s + (p.cout_ht_base ?? 0), 0);
  const prochaine = actifs.filter((p) => (anneeEffective(p) ?? 9999) <= annee + 1).reduce((s, p) => s + (montantTtcPoste(posteLite(p), params) ?? 0), 0);
  const minCotisation = Math.max((planHt * FONDS_TRAVAUX.cotisationMinPctPlan) / 100, budget ? (Number(budget) * FONDS_TRAVAUX.cotisationMinPctBudget) / 100 : 0);
  const soldeN = solde ? Number(solde) : null;
  const couverture = soldeN != null && prochaine > 0 ? Math.min(1, soldeN / prochaine) : null;
  const dirty = solde !== (c.fonds_travaux_solde?.toString() ?? "") || cotisation !== (c.fonds_travaux_cotisation_annuelle?.toString() ?? "") || majLe !== (c.fonds_travaux_maj ?? "") || budget !== (c.budget_previsionnel_annuel?.toString() ?? "");

  return (
    <div className="detail-grid">
      <div className="panel">
        <div className="p-head"><Icon name="euro" size={18} /><h3>Fonds de travaux (art. 14-2-1)</h3></div>
        <div className="p-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>Solde du fonds (€)<input className="edit-inp" style={{ maxWidth: "none" }} type="number" min={0} value={solde} onChange={(e) => setSolde(e.target.value)} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>Cotisation annuelle (€)<input className="edit-inp" style={{ maxWidth: "none" }} type="number" min={0} value={cotisation} onChange={(e) => setCotisation(e.target.value)} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>Date de l'arrêté<input className="edit-inp" style={{ maxWidth: "none" }} type="date" value={majLe} onChange={(e) => setMajLe(e.target.value)} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>Budget prévisionnel annuel (€)<input className="edit-inp" style={{ maxWidth: "none" }} type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button
              className="se-btn se-btn-primary btn-sm"
              disabled={!dirty || maj.isPending}
              onClick={() => void maj.mutateAsync({ id: c.id, fonds_travaux_solde: solde ? Number(solde) : null, fonds_travaux_cotisation_annuelle: cotisation ? Number(cotisation) : null, fonds_travaux_maj: majLe || null, budget_previsionnel_annuel: budget ? Number(budget) : null })}
            >
              <Icon name="check" size={14} />
              {maj.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
      <div className="panel" style={{ alignSelf: "flex-start" }}>
        <div className="p-head"><Icon name="barChart" size={18} /><h3>Lecture</h3></div>
        <div className="p-body">
          <div className="kv"><span className="k">Montant du plan (HT base)</span><span className="v">{fmtEur(planHt)}</span></div>
          <div className="kv"><span className="k">Cotisation minimale légale</span><span className="v" style={{ color: cotisation && Number(cotisation) < minCotisation ? "var(--color-error-700)" : undefined }}>{fmtEur(minCotisation)}</span></div>
          <div className="kv"><span className="k">Travaux attendus d'ici {annee + 1} (TTC)</span><span className="v">{fmtEur(prochaine)}</span></div>
          <div className="kv"><span className="k">Couverture par le fonds</span><span className="v">{couverture == null ? "-" : fmtPct(couverture)}</span></div>
          {couverture != null && (
            <div style={{ height: 10, borderRadius: 999, background: "var(--bg-soft)", overflow: "hidden", marginTop: 10 }}>
              <div style={{ width: `${couverture * 100}%`, height: "100%", background: couverture < FONDS_TRAVAUX.couvertureMinPremiereAnnee ? "var(--color-warning-500)" : "var(--color-primary-500)" }}></div>
            </div>
          )}
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
            Cotisation minimale : {FONDS_TRAVAUX.cotisationMinPctPlan} % du montant du plan adopté et {FONDS_TRAVAUX.cotisationMinPctBudget} % du budget prévisionnel. Sous {fmtPct(FONDS_TRAVAUX.couvertureMinPremiereAnnee)} de couverture de la prochaine année, un appel de fonds ou un prêt collectif est à anticiper dès la présentation en AG.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------- Remarques ----------
function RemarquesTab({ c, postes }: { c: PptCoproAvecStats; postes: PptPoste[] }) {
  const { data: remarques } = usePptRemarques(c.id);
  const posteDe = new Map(postes.map((p) => [p.id, p.libelle]));
  const ordre = { bloquant: 0, majeur: 1, mineur: 2, info: 3 } as Record<string, number>;
  const liste = [...(remarques ?? [])].sort((a, b) => ordre[a.severite] - ordre[b.severite] || a.code.localeCompare(b.code));
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="alert" size={18} />
        <h3>Remarques de Strat Eco sur le rapport</h3>
        <span style={{ flex: 1 }}></span>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{liste.length} remarque{liste.length > 1 ? "s" : ""}</span>
      </div>
      <div className="p-body" style={{ paddingTop: 4 }}>
        {liste.length === 0 ? (
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>Aucune remarque : soit le rapport n'est pas encore validé, soit il ne présente pas d'incohérence relevée.</p>
        ) : (
          liste.map((r) => (
            <div key={r.id} style={{ padding: "10px 4px", borderBottom: "1px solid var(--border)", opacity: r.traitee ? 0.55 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <SeveriteBadge severite={r.severite} />
                <Badge kind="neutral">{r.code}</Badge>
                <b style={{ fontSize: 13.5 }}>{r.libelle}</b>
                {r.poste_id && posteDe.get(r.poste_id) && <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>· {posteDe.get(r.poste_id)}</span>}
                {r.page && <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>p. {r.page}</span>}
                {r.traitee && <Badge kind="success">Traitée</Badge>}
              </div>
              {r.constat && <p style={{ margin: "5px 0 0", fontSize: 13.5, lineHeight: 1.5 }}>{r.constat}</p>}
              {(r.attendu || r.observe) && (
                <p className="se-small" style={{ margin: "3px 0 0", color: "var(--fg-muted)" }}>
                  {r.attendu ? `Attendu : ${r.attendu}` : ""}{r.attendu && r.observe ? " · " : ""}{r.observe ? `Observé : ${r.observe}` : ""}
                </p>
              )}
              {r.action && <p className="se-small" style={{ margin: "3px 0 0", color: "var(--color-primary-700)" }}><Icon name="arrowRight" size={12} /> {r.action}</p>}
            </div>
          ))
        )}
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
          Ces remarques concernent le rapport d'origine (rédacteur du PPPT), pas votre gestion : elles vous donnent les questions à poser au bureau d'études et les points à sécuriser avant le vote.
        </p>
      </div>
    </div>
  );
}

// ---------- Documents ----------
function DocumentsTab({ c }: { c: PptCoproAvecStats }) {
  const { data: rapports } = usePptRapports([c.id]);
  const deposer = useDeposerPptRapport();
  // correction d'un dépôt mal rattaché (mauvaise copropriété, type ou nom) - 0081
  const [aCorriger, setACorriger] = useState<DocumentACorriger | null>(null);
  // aperçu sans téléchargement et retrait d'un dépôt - 0082
  const [apercu, setApercu] = useState<{ name: string; storage_path: string } | null>(null);
  const { data: deposants } = usePptDeposants(c.id);
  const supprimer = useSupprimerPptRapport();
  const [type, setType] = useState<TypeRapport>("dpe_collectif");
  const { data: orgParams } = usePptParametres(c.organisation_id);
  const [taux, setTaux] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const avecHonoraires = TYPES_AVEC_HONORAIRES.includes(type);
  const tauxSaisi = taux.trim() === "" ? (orgParams?.taux_honoraires_pct ?? null) : Number(taux.replace(",", "."));
  const tauxValide = !avecHonoraires || (tauxSaisi != null && Number.isFinite(tauxSaisi) && tauxSaisi >= 0 && tauxSaisi <= 100);
  return (
    <div className="panel">
      <div className="p-head">
        <Icon name="folder" size={18} />
        <h3>Documents</h3>
        <span style={{ flex: 1 }}></span>
        <select className="edit-inp" style={{ maxWidth: 200 }} value={type} onChange={(e) => setType(e.target.value as TypeRapport)}>
          {(["pppt", "dpe_collectif", "ppt_adopte", "pv_ag", "autre"] as TypeRapport[]).map((t) => (
            <option key={t} value={t}>{TYPE_RAPPORT_LABEL[t]}</option>
          ))}
        </select>
        {avecHonoraires && (
          <input
            className="edit-inp"
            style={{ maxWidth: 150 }}
            inputMode="decimal"
            value={taux}
            onChange={(e) => setTaux(e.target.value)}
            placeholder={orgParams?.taux_honoraires_pct != null ? `honoraires ${orgParams.taux_honoraires_pct} %` : "honoraires % *"}
            title="Taux d'honoraires de suivi de travaux (%), transmis à Strat Eco avec le document"
          />
        )}
        <label className={"se-btn se-btn-secondary btn-sm" + (!tauxValide ? " disabled" : "")} style={{ cursor: tauxValide ? "pointer" : "not-allowed", opacity: tauxValide ? 1 : 0.6 }} title={tauxValide ? undefined : "Indiquez le taux d'honoraires de suivi (0 à 100 %)"}>
          <Icon name="upload" size={14} />
          {deposer.isPending ? "Dépôt…" : "Déposer"}
          <input type="file" accept="application/pdf,.pdf,.xlsx" style={{ display: "none" }} disabled={deposer.isPending || !tauxValide} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setErreur(null); deposer.mutateAsync({ copro: c, file: f, type, taux_honoraires_pct: avecHonoraires ? tauxSaisi : null }).catch((err) => setErreur(err instanceof Error ? err.message : "Échec du dépôt")); }} />
        </label>
      </div>
      <div className="p-body" style={{ paddingTop: 4 }}>
        {erreur && <p style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>{erreur}</p>}
        {(rapports ?? []).length === 0 ? (
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>Aucun document.</p>
        ) : (
          (rapports ?? []).map((r) => (
            <div key={r.id} className="doc-row">
              <span className="d-ico"><Icon name="fileText" size={18} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="d-name">{r.name}</div>
                <div className="d-sub">
                  {TYPE_RAPPORT_LABEL[r.type] ?? r.type} · déposé le {fmtDateCourte(r.depose_le)}
                  {deposants?.get(r.id)?.nom ? ` par ${deposants.get(r.id)!.nom}` : ""}
                  {r.prestataire ? ` · ${r.prestataire}` : ""}{r.date_document ? ` · document du ${fmtDateCourte(r.date_document)}` : ""}
                  {r.motif_rejet ? ` · rejeté : ${r.motif_rejet}` : ""}
                </div>
              </div>
              <span className="spacer"></span>
              {(r.type === "pppt" || r.type === "ppt_adopte") && <StatutRapportBadge statut={r.statut} />}
              {r.statut === "valide" && <VerdictBadge verdict={r.verdict} />}
              <button className="icon-btn" title="Visualiser sans télécharger" onClick={() => setApercu(r)}><Icon name="eye" size={18} /></button>
              {r.statut !== "valide" && (
                <button className="icon-btn" title="Corriger : copropriété, type ou nom du fichier" onClick={() => setACorriger(r)}><Icon name="edit" size={17} /></button>
              )}
              <button className="icon-btn" title="Télécharger" onClick={() => void telechargerPptRapport(r)}><Icon name="download" size={18} /></button>
              {r.statut !== "valide" && (
                <button
                  className="icon-btn"
                  title="Supprimer ce document"
                  disabled={supprimer.isPending}
                  onClick={() => {
                    if (!window.confirm(`Supprimer « ${r.name} » ? Le document et son fichier sont retirés définitivement.`)) return;
                    setErreur(null);
                    supprimer.mutateAsync(r.id).catch((err) => setErreur(err instanceof Error ? err.message : "Suppression refusée"));
                  }}
                >
                  <Icon name="trash" size={17} />
                </button>
              )}
            </div>
          ))
        )}
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
          Un nouveau PPPT (actualisation décennale, nouvelle version du rédacteur) se dépose ici : après validation il remplace le plan précédent, dont les postes et l'historique d'AG sont conservés.
          Un document rangé sous la mauvaise copropriété se corrige avec le crayon : le fichier suit.
        </p>
        {aCorriger && <CorrigerDocument rapport={aCorriger} onClose={() => setACorriger(null)} />}
        {apercu && (
          <ApercuDocument
            name={apercu.name}
            path={apercu.storage_path}
            urlSignee={urlSigneePpt}
            onClose={() => setApercu(null)}
            onTelecharger={() => void telechargerPptRapport(apercu)}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Fiche ----------
function FicheTab({ c }: { c: PptCoproAvecStats }) {
  const maj = useMajPptCopro();
  // renommer la copropriété laisse son ancien nom dans les fichiers déposés (0082)
  const { data: rapports } = usePptRapports([c.id]);
  const [renommages, setRenommages] = useState<{ rapport: DocumentACorriger; nouveau: string }[]>([]);
  const champs = ["nom", "adresse", "code_postal", "commune", "immatriculation_rnc", "annee_construction", "nb_batiments", "nb_lots", "nb_logements", "surface_m2", "surface_type", "chauffage", "energie_chauffage", "etiquette_energie", "etiquette_ges", "cep_kwhep_m2_an", "date_dpe", "plus_de_15_ans", "pppt_presente", "gestionnaire_nom", "gestionnaire_email"] as const;
  type Champ = (typeof champs)[number];
  // les deux réponses oui / non du portefeuille (0077) sont éditées comme « oui » / « non »
  const texte = (k: Champ) => (c[k] == null ? "" : typeof c[k] === "boolean" ? (c[k] ? "oui" : "non") : String(c[k]));
  const init = () => Object.fromEntries(champs.map((k) => [k, texte(k)])) as Record<Champ, string>;
  const [v, setV] = useState<Record<Champ, string>>(init);
  const numeriques: Champ[] = ["annee_construction", "nb_batiments", "nb_lots", "nb_logements", "surface_m2", "cep_kwhep_m2_an"];
  const booleens: Champ[] = ["plus_de_15_ans", "pppt_presente"];
  const dirty = champs.some((k) => v[k] !== texte(k));
  const champ = (k: Champ, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label key={k} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
      {label}
      <input className="edit-inp" style={{ maxWidth: "none" }} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...props} />
    </label>
  );
  const select = (k: Champ, label: string, options: string[]) => (
    <label key={k} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
      {label}
      <select className="edit-inp" style={{ maxWidth: "none" }} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })}>
        <option value="">-</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
  return (
    <div className="panel">
      <div className="p-head"><Icon name="building" size={18} /><h3>Fiche de la copropriété</h3></div>
      <div className="p-body" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>{champ("nom", "Nom")}</div>
        <div style={{ gridColumn: "1 / 3" }}>{champ("adresse", "Adresse")}</div>
        {champ("code_postal", "Code postal")}
        {champ("commune", "Commune")}
        {champ("immatriculation_rnc", "Immatriculation au registre")}
        {champ("annee_construction", "Année de construction", { type: "number" })}
        {champ("nb_batiments", "Bâtiments", { type: "number" })}
        {champ("nb_lots", "Lots (total)", { type: "number" })}
        {champ("nb_logements", "Logements", { type: "number" })}
        {champ("surface_m2", "Surface (m²)", { type: "number" })}
        {select("surface_type", "Type de surface", ["SHAB", "SHON", "SDP", "DPE"])}
        {select("chauffage", "Chauffage", ["collectif", "individuel", "mixte"])}
        {champ("energie_chauffage", "Énergie de chauffage")}
        {select("etiquette_energie", "Étiquette énergie", ["A", "B", "C", "D", "E", "F", "G"])}
        {select("etiquette_ges", "Étiquette GES", ["A", "B", "C", "D", "E", "F", "G"])}
        {champ("cep_kwhep_m2_an", "Cep (kWhep/m².an)", { type: "number" })}
        {champ("date_dpe", "Date du DPE collectif", { type: "date" })}
        {select("plus_de_15_ans", "Copropriété de plus de 15 ans ?", ["oui", "non"])}
        {select("pppt_presente", "PPPT déjà présenté en AG ?", ["oui", "non"])}
        <span></span>
        {champ("gestionnaire_nom", "Gestionnaire en charge")}
        {champ("gestionnaire_email", "E-mail du gestionnaire", { type: "email" })}
        <p className="se-small" style={{ gridColumn: "1 / -1", color: "var(--fg-muted)", margin: 0 }}>
          Changer l'e-mail du gestionnaire transfère le dossier : l'ancien gestionnaire n'y accède plus, le nouveau y accède, l'historique est conservé (onglet Historique).
        </p>
        <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
          <button
            className="se-btn se-btn-primary btn-sm"
            disabled={!dirty || maj.isPending}
            onClick={() => {
              const patch: Record<string, string | number | boolean | null> = {};
              for (const k of champs) patch[k] = v[k] === "" ? null : numeriques.includes(k) ? Number(v[k]) : booleens.includes(k) ? v[k] === "oui" : v[k];
              const nouveauNom = v.nom.trim();
              const renomme = nouveauNom.length > 1 && nouveauNom !== c.nom ? nouveauNom : null;
              void maj.mutateAsync({ ...(patch as PptCoproPatch), id: c.id }).then(() => {
                if (!renomme) return;
                const suite = (rapports ?? [])
                  .filter((r) => r.statut !== "valide")
                  .map((r) => ({ rapport: r as DocumentACorriger, nouveau: remplacerCoproDansNom(r.name, c.nom, renomme) }))
                  .filter((x): x is { rapport: DocumentACorriger; nouveau: string } => !!x.nouveau && x.nouveau !== x.rapport.name);
                if (suite.length) setRenommages(suite);
              });
            }}
          >
            <Icon name="check" size={14} />
            {maj.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
      {renommages.length > 0 && <RenommerFichiers copro={c} renommages={renommages} onClose={() => setRenommages([])} />}
    </div>
  );
}

// ---------- Historique ----------
const JOURNAL_LABEL: Record<string, string> = {
  depot: "Document déposé",
  analyse_importee: "Analyse importée par Strat Eco",
  validation: "Rapport validé",
  devalidation: "Rapport revenu en vérification",
  rejet: "Rapport rejeté",
  ag_saisie: "Assemblée générale saisie",
  resolution: "Résolution enregistrée",
  changement_gestionnaire: "Changement de gestionnaire",
  corbeille: "Mis à la corbeille",
  restauration: "Restauré",
  decalage: "Échéancier décalé",
  montant_saisi: "Montant saisi par le syndic",
  poste_ajoute: "Ligne ajoutée par le syndic",
  poste_retire: "Ligne retirée par le syndic",
  poste_retabli: "Ligne rétablie par le syndic",
  import: "Portefeuille importé par le syndic",
  correction: "Document corrigé",
  requalification: "Type de document corrigé",
  suppression: "Document supprimé",
};

function HistoriqueTab({ c }: { c: PptCoproAvecStats }) {
  const { data: journal } = usePptJournal(c.id);
  const { data: affectations } = usePptAffectations(c.id);
  const detail = (type: string, d: Record<string, unknown>) => {
    if (type === "depot") return `${TYPE_RAPPORT_LABEL[String(d.type)] ?? d.type} - ${d.name}`;
    if (type === "resolution") return `${issueLabel(String(d.issue))}${d.article ? ` (art. ${d.article})` : ""}${d.montant ? ` - ${fmtEur(Number(d.montant))}` : ""}`;
    if (type === "changement_gestionnaire") return d.email ? `${d.nom ?? ""} ${d.email ? `<${d.email}>` : ""}${d.compte ? "" : " - aucun compte à cet e-mail"}` : "gestionnaire retiré";
    if (type === "validation") return `${d.postes ?? 0} postes`;
    if (type === "devalidation") return `${d.postes ?? 0} postes retirés${d.motif ? ` - ${d.motif}` : ""}`;
    if (type === "rejet") return String(d.motif ?? "");
    if (type === "analyse_importee") return `verdict ${String(d.verdict ?? "-")}`;
    if (type === "ag_saisie") return `AG ${d.type} du ${fmtDateCourte(String(d.date_ag))}`;
    if (type === "montant_saisi") return `${d.libelle ?? "poste"} : ${d.montant != null ? fmtEur(Number(d.montant)) : "retour au calcul"}${d.commentaire ? ` - ${d.commentaire}` : ""}`;
    if (type === "poste_ajoute") return `${d.libelle ?? "poste"}${d.annee ? ` · ${d.annee}` : ""}${d.montant != null ? ` · ${fmtEur(Number(d.montant))}` : ""}`;
    if (type === "poste_retire") return `${d.libelle ?? "poste"}${d.motif ? ` - ${d.motif}` : ""}`;
    if (type === "poste_retabli") return `${d.libelle ?? "poste"}${d.motif_retrait ? ` (retirée pour : ${d.motif_retrait})` : ""}`;
    if (type === "suppression") return `${TYPE_RAPPORT_LABEL[String(d.type)] ?? d.type} - ${d.name}`;
    if (type === "requalification") return `${TYPE_RAPPORT_LABEL[String(d.avant)] ?? d.avant} → ${TYPE_RAPPORT_LABEL[String(d.apres)] ?? d.apres}`;
    if (type === "correction")
      return [
        d.copro_avant !== d.copro_apres ? `${d.copro_avant} → ${d.copro_apres}` : null,
        d.name_avant !== d.name_apres ? `${d.name_avant} → ${d.name_apres}` : null,
        d.type_avant !== d.type_apres ? `${TYPE_RAPPORT_LABEL[String(d.type_avant)] ?? d.type_avant} → ${TYPE_RAPPORT_LABEL[String(d.type_apres)] ?? d.type_apres}` : null,
      ].filter(Boolean).join(" · ");
    if (type === "decalage") return (Array.isArray(d.postes) ? (d.postes as { libelle?: string; de?: number | null; vers?: number }[]) : []).map((x) => `${x.libelle ?? "poste"} : ${x.de ?? "à fixer"} → ${x.vers}`).join(" · ");
    return "";
  };
  return (
    <div className="detail-grid">
      <div className="panel">
        <div className="p-head"><Icon name="clock" size={18} /><h3>Journal</h3></div>
        <div className="p-body" style={{ paddingTop: 4 }}>
          {(journal ?? []).length === 0 && <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>Aucun événement.</p>}
          {(journal ?? []).map((j) => (
            <div key={j.id} className="kv" style={{ alignItems: "flex-start" }}>
              <span className="k" style={{ minWidth: 150 }}>{new Date(j.le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
              <span className="v" style={{ textAlign: "right", fontWeight: 500 }}>
                {JOURNAL_LABEL[j.type] ?? j.type}
                <span style={{ display: "block", fontSize: 12, color: "var(--fg-muted)", fontWeight: 400 }}>{detail(j.type, (j.detail ?? {}) as Record<string, unknown>)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel" style={{ alignSelf: "flex-start" }}>
        <div className="p-head"><Icon name="user" size={18} /><h3>Gestionnaires successifs</h3></div>
        <div className="p-body" style={{ paddingTop: 4 }}>
          {(affectations ?? []).length === 0 && <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>Aucun gestionnaire désigné.</p>}
          {(affectations ?? []).map((a) => (
            <div key={a.id} className="kv">
              <span className="k">{a.nom || a.email || "-"}{!a.user_id && <span title="aucun compte à cet e-mail" style={{ color: "var(--color-warning-700)" }}> *</span>}</span>
              <span className="v">{fmtDateCourte(a.du)} → {a.au ? fmtDateCourte(a.au) : "aujourd'hui"}</span>
            </div>
          ))}
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10, marginBottom: 0 }}>L'historique complet suit le dossier quand il change de gestionnaire : rien ne part avec la personne.</p>
        </div>
      </div>
    </div>
  );
}

export default function CoproPpt() {
  const { id, tab: tabParam } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: c, isLoading } = usePptCopro(id);
  const { data: postes } = usePptPostes(id ? [id] : []);
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "echeancier";

  if (isLoading) return <Loader />;
  if (!c) return <AucuneCopro />;
  if (!c.acces) return <AccesReserve c={c} />;
  const s = c.stats;
  const ps = postes ?? [];

  return (
    <SyndicShell active={null} branche="ppt">
      <div className="page fade" style={{ padding: 0 }}>
        <button className="se-btn se-btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={() => navigate("/syndic/ppt/copros")}>
          <Icon name="chevronLeft" size={15} />
          Copropriétés
        </button>
        <div className="panel" style={{ padding: "18px 22px", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, margin: 0, letterSpacing: "-0.01em" }}>{c.nom}</h1>
              <div className="cc-loc" style={{ marginTop: 4 }}>
                <Icon name="mapPin" size={14} />
                {[c.adresse, c.code_postal, c.commune].filter(Boolean).join(" ") || "Adresse à renseigner"}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                {s?.statut_rapport ? <StatutRapportBadge statut={s.statut_rapport} /> : <Badge kind="neutral">Aucun PPPT</Badge>}
                {s?.reno_phase && <RenoBadge phase={s.reno_phase} />}
                {!s?.reno_phase && c.plus_de_15_ans === true && c.pppt_presente === false && <Badge kind="warn" dot>PPPT à présenter</Badge>}
                {c.gestionnaire_nom && <Badge kind="neutral"><Icon name="user" size={12} />{c.gestionnaire_nom}</Badge>}
                {c.nb_logements != null && <Badge kind="neutral">{c.nb_logements} logements</Badge>}
                {c.annee_construction && <Badge kind="neutral">{c.annee_construction}</Badge>}
                {s?.remarques_ouvertes ? <Badge kind="warn" dot>{s.remarques_ouvertes} remarque{s.remarques_ouvertes > 1 ? "s" : ""}</Badge> : null}
                {profile?.role === "amo" && s?.rapports_en_attente ? (
                  <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate("/ppt")}>Revue AMO <Icon name="arrowRight" size={13} /></button>
                ) : null}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {c.etiquette_energie && (
                <div style={{ textAlign: "center" }}>
                  <DpeChip cls={c.etiquette_energie as DpeClass} size={40} />
                  <div className="se-small" style={{ color: "var(--fg-muted)" }}>{c.cep_kwhep_m2_an ? `${c.cep_kwhep_m2_an} kWh/m².an` : "DPE"}</div>
                </div>
              )}
              <BoutonPdfEcheancier c={c} postes={ps} grand />
              <div style={{ textAlign: "right" }}>
                <div className="se-eyebrow" style={{ color: "var(--fg-muted)" }}>Plan sur 10 ans</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24 }}>{s?.montant_ht_base ? fmtEuroCourt(s.montant_ht_base) + " HT" : "-"}</div>
                <div className="se-small" style={{ color: "var(--fg-muted)" }}>{s?.postes ? `${s.postes} postes · prochain jalon ${s.prochaine_annee ?? "-"}` : "en attente du plan validé"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="tabs" style={{ marginBottom: 18 }}>
          {TABS.map((tb) => (
            <button key={tb.id} className={"tab" + (tab === tb.id ? " on" : "")} onClick={() => navigate(`/syndic/ppt/copros/${c.id}/${tb.id}`, { replace: true })}>
              {tb.label}
            </button>
          ))}
        </div>

        {tab === "echeancier" && <EcheancierTab c={c} postes={ps} />}
        {tab === "ag" && <AgTab c={c} postes={ps} />}
        {tab === "fonds" && <FondsTab key={c.updated_at} c={c} postes={ps} />}
        {tab === "remarques" && <RemarquesTab c={c} postes={ps} />}
        {tab === "documents" && <DocumentsTab c={c} />}
        {tab === "fiche" && <FicheTab key={c.updated_at} c={c} />}
        {tab === "historique" && <HistoriqueTab c={c} />}
      </div>
    </SyndicShell>
  );
}
