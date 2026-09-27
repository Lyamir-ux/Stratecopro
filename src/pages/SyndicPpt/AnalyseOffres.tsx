// Analyse des offres d'une consultation PPPT + DPE collectif (0109, idée
// d'Amir 27/09/2026) - briques communes à l'équipe et au syndic :
//   • TableauOffres : comparatif (rang, montants HT et TTC, écart au
//     moins-disant, pièce, observations), offre recommandée surlignée ;
//   • BoutonPdfAnalyse : PDF à présenter en assemblée générale ;
//   • AnalysePourSyndic : bloc de la carte « Consulter un intervenant » où
//     l'équipe choisit l'offre recommandée, rédige son avis et publie
//     l'analyse (la consultation est clôturée, le syndic est prévenu).
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { ouvrirOffre, type Consultation } from "@/api/consultations";
import { usePublierAnalyse, useRetirerAnalyse } from "@/api/consultationPpt";
import { comparerOffres, libellePrestation, syntheseOffres, type OffreComparee, type PrestationOffre } from "@/lib/ppt/analyseOffres";
import type { AnalyseOffresPdfInput } from "@/lib/pdf/analyseOffresPpt";
import { nomFichierSansAccents } from "@/lib/nommage";
import { fmtEuro } from "@/lib/format";
import { messageErreur } from "@/lib/erreurs";
import { fmtDateCourte } from "./commun";

const ecartLibelle = (e: number | null) => (e == null ? "-" : e === 0 ? "moins-disant" : `+ ${Math.round(e * 100)} %`);

/** Prix HT et délai d'une prestation (PPPT ou DPE collectif, 0110) dans une cellule. */
function CellulePrestation({ p }: { p: PrestationOffre }) {
  const l = libellePrestation(p, fmtEuro);
  return (
    <td className="num">
      {l.prix}
      {l.delai && <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>en {l.delai}</span>}
    </td>
  );
}

/** Détail PPPT / DPE sur une ligne (vue compacte). */
function detailCompact(o: OffreComparee): string | null {
  const part = (nom: string, p: PrestationOffre) => {
    if (p.ht == null && p.delaiSemaines == null) return null;
    const l = libellePrestation(p, fmtEuro);
    return `${nom} ${l.prix}${l.delai ? ` (${l.delai})` : ""}`;
  };
  return [part("PPPT", o.pppt), part("DPE", o.dpe)].filter(Boolean).join(" · ") || null;
}

/** `compact` : sans TTC ni observations (carte étroite de « Consulter un intervenant », où les messages sont déjà listés) ;
 *  le détail PPPT / DPE (prix et délais, 0110) passe alors sous le total. */
export function TableauOffres({ offres, compact }: { offres: OffreComparee[]; compact?: boolean }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const ouvrir = async (path: string) => {
    setErreur(null);
    try {
      await ouvrirOffre(path);
    } catch (e) {
      setErreur(messageErreur(e, "Pièce indisponible."));
    }
  };
  // colonnes PPPT / DPE dès qu'une offre les détaille (offres antérieures à 0110 : total seul)
  const detail = !compact && syntheseOffres(offres).detaillees > 0;
  const nbCols = compact ? 4 : detail ? 8 : 6;
  return (
    <>
      <div className="tablewrap">
        <table className="dossiers" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th>Bureau d'études</th>
              {detail && <th className="num">PPPT HT</th>}
              {detail && <th className="num">DPE collectif HT</th>}
              <th className="num">{detail ? "Total HT" : "Montant HT"}</th>
              {!compact && <th className="num">{detail ? "Total TTC" : "Montant TTC"}</th>}
              <th className="num">Écart</th>
              <th>Offre</th>
              {!compact && <th>Observations</th>}
            </tr>
          </thead>
          <tbody>
            {offres.map((o) => {
              const sous = compact ? detailCompact(o) : null;
              return (
                <tr key={o.id} style={{ cursor: "default", background: o.recommandee ? "var(--color-success-50)" : undefined }}>
                  <td style={{ fontWeight: 600 }}>
                    {o.rang != null ? `${o.rang}. ` : ""}
                    {o.bureau}
                    {o.recommandee && (
                      <span style={{ display: "block", marginTop: 3 }}>
                        <Badge kind="success">Recommandée par Strat Eco</Badge>
                      </span>
                    )}
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 400 }}>reçue le {fmtDateCourte(o.recueLe)}</span>
                  </td>
                  {detail && <CellulePrestation p={o.pppt} />}
                  {detail && <CellulePrestation p={o.dpe} />}
                  <td className="num" style={{ fontWeight: o.recommandee ? 700 : undefined }}>
                    {o.montantHt != null ? fmtEuro(o.montantHt) : "non chiffrée"}
                    {sous && <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 400, whiteSpace: "nowrap" }}>{sous}</span>}
                  </td>
                  {!compact && <td className="num">{o.montantTtc != null ? fmtEuro(o.montantTtc) : "-"}</td>}
                  <td className="num" style={{ color: o.ecart === 0 ? "var(--color-success-700)" : undefined }}>{ecartLibelle(o.ecart)}</td>
                  <td>
                    {o.fichier ? (
                      <button className="se-btn se-btn-ghost btn-sm" title={o.fichier.name} onClick={() => void ouvrir(o.fichier!.path)}>
                        <Icon name="download" size={13} />
                        {compact || detail ? "Offre" : o.fichier.name.length > 26 ? o.fichier.name.slice(0, 24) + "…" : o.fichier.name}
                      </button>
                    ) : (
                      <span style={{ color: "var(--fg-muted)" }}>-</span>
                    )}
                  </td>
                  {!compact && <td style={{ maxWidth: 300, whiteSpace: "pre-wrap", color: o.message ? "var(--fg2)" : "var(--fg-muted)" }}>{o.message ?? "-"}</td>}
                </tr>
              );
            })}
            {offres.length === 0 && (
              <tr>
                <td colSpan={nbCols} style={{ color: "var(--fg-muted)" }}>Aucune offre.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {erreur && <p className="se-small" style={{ color: "var(--color-error-700)", margin: "6px 0 0" }}>{erreur}</p>}
      {!compact && (
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
          Montants TTC calculés avec une TVA de 20 % (prestations intellectuelles).{detail ? " Délais de réalisation annoncés par les bureaux d'études, en semaines à compter de la commande." : ""}
        </p>
      )}
    </>
  );
}

export function BoutonPdfAnalyse({ input, libelle = "PDF pour l'assemblée générale", secondaire }: { input: AnalyseOffresPdfInput; libelle?: string; secondaire?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const generer = async () => {
    setBusy(true);
    setErreur(null);
    try {
      const { genererAnalyseOffresPdf } = await import("@/lib/pdf/analyseOffresPpt");
      const { telechargerPdfBytes } = await import("@/lib/pdf/planIndividuel");
      const bytes = await genererAnalyseOffresPdf(input);
      telechargerPdfBytes(bytes, nomFichierSansAccents(`Analyse des offres PPPT DPE - ${input.copro.nom.replace(/[\\/:*?"<>|]+/g, "-")}.pdf`));
    } catch (e) {
      setErreur(messageErreur(e, "La génération du PDF a échoué."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className={"se-btn btn-sm " + (secondaire ? "se-btn-secondary" : "se-btn-primary")} disabled={busy} onClick={() => void generer()}>
        <Icon name="fileText" size={14} />
        {busy ? "PDF en cours…" : libelle}
      </button>
      {erreur && <span className="se-small" style={{ color: "var(--color-error-700)" }}>{erreur}</span>}
    </>
  );
}

/** Entrée du PDF depuis une consultation (côté équipe : pas d'enseigne connue ici, pas de fiche PPT chargée). */
export function entreePdfDepuisConsultation(cs: Pick<Consultation, "copro_externe_nom" | "copro_externe_adresse" | "copro_externe_ville" | "copro_externe_lots" | "nb_logements" | "mission" | "published_at" | "date_limite">, offres: OffreComparee[], avis: string, bureauxConsultes: number | null, nomEnseigne?: string | null): AnalyseOffresPdfInput {
  return {
    copro: { nom: cs.copro_externe_nom ?? "Copropriété", adresse: cs.copro_externe_adresse, commune: cs.copro_externe_ville, nb_lots: cs.copro_externe_lots, nb_logements: cs.nb_logements },
    nomEnseigne: nomEnseigne ?? null,
    mission: cs.mission,
    publieeLe: cs.published_at,
    dateLimite: cs.date_limite,
    bureauxConsultes,
    offres,
    avis,
  };
}

/** Bloc « Analyse pour le syndic » d'une consultation issue du suivi PPT (carte de « Consulter un intervenant »). */
export function AnalysePourSyndic({ cs }: { cs: Consultation }) {
  const publier = usePublierAnalyse();
  const retirer = useRetirerAnalyse();
  const [avis, setAvis] = useState(cs.analyse_avis ?? "");
  const [reco, setReco] = useState<string>(cs.analyse_candidature_id ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const publiee = !!cs.analyse_publiee_le;

  const offres = useMemo(() => comparerOffres(cs.candidatures, reco || null), [cs.candidatures, reco]);
  const s = syntheseOffres(offres);
  const alertes = cs.notifications.filter((n) => n.statut !== "erreur").length;
  const busy = publier.isPending || retirer.isPending;

  const publierAnalyse = async () => {
    setErreur(null);
    setInfo(null);
    if (!avis.trim()) return setErreur("Rédigez l'avis de Strat Eco avant de publier.");
    if (offres.length === 0) return setErreur("Aucune offre à analyser.");
    if (!window.confirm("Publier l'analyse au syndic ? La consultation est clôturée, le syndic voit les offres et leurs pièces sur sa fiche PPT et reçoit un e-mail.")) return;
    try {
      const n = await publier.mutateAsync({ consultationId: cs.id, avis: avis.trim(), candidatureId: reco || null });
      setInfo(n ? (n.total === 0 ? "Analyse publiée. Aucun destinataire à prévenir par e-mail." : `Analyse publiée. ${n.envoyes || n.simules} e-mail${(n.envoyes || n.simules) > 1 ? "s" : ""} au syndic${n.simules ? " (envoi simulé)" : ""}.`) : "Analyse publiée. L'e-mail au syndic n'a pas pu partir.");
    } catch (e) {
      setErreur(messageErreur(e, "Publication refusée."));
    }
  };

  const retirerPublication = async () => {
    setErreur(null);
    setInfo(null);
    if (!window.confirm("Retirer la publication ? Le syndic ne voit plus les offres ni l'analyse ; la demande repasse « à traiter ».")) return;
    try {
      await retirer.mutateAsync(cs.id);
    } catch (e) {
      setErreur(messageErreur(e, "Retrait refusé."));
    }
  };

  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14 }}>Analyse pour le syndic</strong>
        {publiee ? <Badge kind="success">Publiée le {fmtDateCourte(cs.analyse_publiee_le)}</Badge> : <Badge kind="warn" dot>À publier</Badge>}
        <span className="se-small" style={{ color: "var(--fg-muted)" }}>
          {s.nb} offre{s.nb > 1 ? "s" : ""}{s.minHt != null ? ` · de ${fmtEuro(s.minHt)} à ${fmtEuro(s.maxHt)} HT` : ""}
        </span>
      </div>
      <TableauOffres offres={offres} compact />
      <label className="se-small" style={{ fontWeight: 700, color: "var(--fg2)", display: "flex", flexDirection: "column", gap: 6 }}>
        Offre recommandée
        <select className="edit-inp" style={{ maxWidth: 420 }} value={reco} disabled={publiee} onChange={(e) => setReco(e.target.value)}>
          <option value="">Aucune (avis seul)</option>
          {offres.map((o) => (
            <option key={o.id} value={o.id}>
              {o.bureau}{o.montantHt != null ? ` - ${fmtEuro(o.montantHt)} HT` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="se-small" style={{ fontWeight: 700, color: "var(--fg2)", display: "flex", flexDirection: "column", gap: 6 }}>
        Avis de Strat Eco (visible du syndic, repris dans le PDF)
        <textarea
          className="edit-inp"
          style={{ maxWidth: "none", width: "100%", minHeight: 96, fontFamily: "inherit", resize: "vertical" }}
          placeholder="Points forts et limites de chaque offre, délai, visite des logements, restitution en AG… et l'offre que nous recommandons."
          value={avis}
          disabled={publiee}
          onChange={(e) => setAvis(e.target.value)}
        />
      </label>
      {erreur && <p style={{ margin: 0, padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>{erreur}</p>}
      {info && <p className="se-small" style={{ margin: 0, color: "var(--color-success-700)" }}>{info}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <BoutonPdfAnalyse input={entreePdfDepuisConsultation(cs, offres, avis.trim() || "Avis à rédiger.", alertes || null)} libelle="Aperçu du PDF" secondaire />
        {publiee ? (
          <button className="se-btn se-btn-ghost btn-sm" disabled={busy} onClick={() => void retirerPublication()}>
            <Icon name="refresh" size={14} />
            Retirer la publication
          </button>
        ) : (
          <button className="se-btn se-btn-primary btn-sm" disabled={busy || offres.length === 0} onClick={() => void publierAnalyse()} title="Clôt la consultation, rend offres et analyse visibles du syndic et le prévient par e-mail">
            <Icon name="send" size={14} />
            {publier.isPending ? "Publication…" : "Publier au syndic"}
          </button>
        )}
      </div>
    </div>
  );
}
