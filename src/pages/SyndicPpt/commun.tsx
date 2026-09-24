// Briques partagées de la branche Suivi PPT (syndic et revue AMO) : badges de
// statut, adaptateurs lignes de base → types « légers » des indicateurs,
// formats.
import { Badge, type BadgeKind } from "@/components/ui";
import type { PptAg, PptCoproAvecStats, PptPoste, PptRapport } from "@/api/ppt";
import type { AgLite, CoproLite, PosteLite, RapportLite } from "@/lib/ppt/indicateurs";
import { PRIORITE_LABEL, type PrioriteCode } from "@/lib/ppt/schema";
import { ISSUE_LABEL, SEVERITE_LABEL, STATUT_POSTE_LABEL, STATUT_RAPPORT_LABEL, VERDICT_LABEL } from "@/lib/ppt/referentiels";
import { statutParc, type StatutParc } from "@/lib/ppt/importPortefeuille";
import { PHASES } from "@/lib/referentiels";

/** Copropriété rapprochée d'un dossier de rénovation globale Strat Eco (0077) : phase du dossier. */
export function RenoBadge({ phase }: { phase: string }) {
  const label = PHASES.find((p) => p.id === phase)?.label ?? phase;
  return (
    <Badge kind="primary" dot>
      En rénovation · {label}
    </Badge>
  );
}

export const STATUT_PARC_LABEL: Record<StatutParc, string> = {
  en_reno: "En rénovation",
  pppt_a_presenter: "PPPT à présenter",
  pppt_presente: "PPPT présenté",
  inconnu: "-",
};

/** Statut du portefeuille : dossier de rénovation rapproché, sinon PPPT déclaré par le syndic à l'import. */
export function StatutParcBadge({ c }: { c: PptCoproAvecStats }) {
  const s = statutParc(c);
  if (s === "en_reno" && c.stats?.reno_phase) return <RenoBadge phase={c.stats.reno_phase} />;
  if (s === "pppt_a_presenter") return <Badge kind="warn" dot>PPPT à présenter</Badge>;
  if (s === "pppt_presente") return <Badge kind="success">PPPT présenté</Badge>;
  return <span style={{ color: "var(--fg-muted)" }}>{c.plus_de_15_ans === true ? "+ 15 ans" : c.plus_de_15_ans === false ? "moins de 15 ans" : "-"}</span>;
}

export const fmtEur = (n: number | null | undefined, decimales = 0) =>
  n == null ? "-" : n.toLocaleString("fr-FR", { maximumFractionDigits: decimales }) + " €";

/** fmtPct : fraction → % (gains cumulés, couverture) ; fmtPoints : champs `_pct` en points, sans conversion. */
export { fmtPct, fmtPoints } from "@/lib/ppt/formats";

export const fmtDateCourte = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

export const anneeCourante = () => new Date().getFullYear();

const STATUT_POSTE_KIND: Record<string, BadgeKind> = {
  programme: "neutral",
  presente: "blue",
  vote: "success",
  rejete: "warn",
  reporte: "warn",
  realise: "primary",
  abandonne: "neutral",
};

export function StatutPosteBadge({ statut }: { statut: string }) {
  return <Badge kind={STATUT_POSTE_KIND[statut] ?? "neutral"}>{STATUT_POSTE_LABEL[statut] ?? statut}</Badge>;
}

const STATUT_RAPPORT_KIND: Record<string, BadgeKind> = {
  depose: "neutral",
  en_analyse: "blue",
  a_relire: "warn",
  valide: "success",
  rejete: "warn",
  echec: "warn",
};

export function StatutRapportBadge({ statut }: { statut: string }) {
  return (
    <Badge kind={STATUT_RAPPORT_KIND[statut] ?? "neutral"} dot={statut === "a_relire" || statut === "depose"}>
      {STATUT_RAPPORT_LABEL[statut] ?? statut}
    </Badge>
  );
}

const SEVERITE_KIND: Record<string, BadgeKind> = { bloquant: "warn", majeur: "warn", mineur: "blue", info: "neutral" };

export function SeveriteBadge({ severite }: { severite: string }) {
  const s = severite.toLowerCase();
  return (
    <Badge kind={SEVERITE_KIND[s] ?? "neutral"} dot={s === "bloquant"}>
      {SEVERITE_LABEL[s] ?? severite}
    </Badge>
  );
}

export function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return null;
  const kind: BadgeKind = verdict === "EXPLOITABLE" ? "success" : verdict === "EXPLOITABLE_AVEC_RESERVES" ? "blue" : "warn";
  return <Badge kind={kind}>{VERDICT_LABEL[verdict] ?? verdict}</Badge>;
}

export function PrioriteBadge({ priorite }: { priorite: string }) {
  const kind: BadgeKind = priorite === "energetique" ? "primary" : priorite === "preservation" ? "blue" : priorite === "securite" ? "warn" : priorite === "sante" ? "success" : "neutral";
  return <Badge kind={kind}>{PRIORITE_LABEL[priorite as keyof typeof PRIORITE_LABEL] ?? priorite}</Badge>;
}

export const issueLabel = (i: string) => ISSUE_LABEL[i] ?? i;

// ---------- Adaptateurs vers les types des indicateurs ----------

export type { PrioriteCode } from "@/lib/ppt/schema";

export function posteLite(p: PptPoste): PosteLite {
  return {
    id: p.id,
    ppt_copro_id: p.ppt_copro_id,
    libelle: p.libelle,
    statut: p.statut,
    montant_vote: p.montant_vote,
    actif: p.actif,
    cout_ht_base: p.cout_ht_base,
    tva_pct: p.tva_pct,
    avec_moe: p.avec_moe,
    annee_prevue: p.annee_prevue,
    annee_prochaine_presentation: p.annee_prochaine_presentation,
    gain_energetique_pct: p.gain_energetique_pct,
    priorite: p.priorite as PrioriteCode,
    montant_syndic: p.montant_syndic,
  };
}

export function coproLite(c: PptCoproAvecStats): CoproLite {
  return {
    id: c.id,
    nom: c.nom,
    organisation_id: c.organisation_id,
    gestionnaire_nom: c.gestionnaire_nom,
    gestionnaire_email: c.gestionnaire_email,
    nb_logements: c.nb_logements,
    etiquette_energie: c.etiquette_energie,
    date_dpe: c.date_dpe,
    fonds_travaux_solde: c.fonds_travaux_solde,
    fonds_travaux_cotisation_annuelle: c.fonds_travaux_cotisation_annuelle,
    created_at: c.created_at,
  };
}

export const agLite = (a: PptAg): AgLite => ({ id: a.id, ppt_copro_id: a.ppt_copro_id, date_ag: a.date_ag });

export const rapportLite = (r: PptRapport): RapportLite => ({
  id: r.id,
  ppt_copro_id: r.ppt_copro_id,
  type: r.type,
  statut: r.statut,
  valide_le: r.valide_le,
  date_document: r.date_document,
  depose_le: r.depose_le,
});

/** Info-bulle d'un dossier que l'utilisateur ne peut pas ouvrir. */
export const TITRE_VERROU = (c: PptCoproAvecStats) =>
  `dossier suivi par ${c.gestionnaire_nom || "un autre gestionnaire"} - accès réservé à la direction`;

/** Titre d'une tuile de tableau de bord. */
export function Tuile({ label, valeur, pied, accent }: { label: string; valeur: string; pied?: string; accent?: boolean }) {
  return (
    <div className="tile">
      <div className="t-lbl">{label}</div>
      <div className={"t-val" + (accent ? " accent" : "")}>{valeur}</div>
      {pied && <div className="t-foot">{pied}</div>}
    </div>
  );
}
