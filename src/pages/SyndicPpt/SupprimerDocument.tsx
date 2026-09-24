// Suppression d'un document de la branche PPT (0082, 0095). Feedback Amir
// 24/09/2026 : « supprimer un PPPT, un PPT, un fichier, afin de recommencer en
// cas de validation ». Un document non validé part avec son fichier (déposant
// ou équipe Strat Eco) ; un rapport validé se supprime par le seul dirigeant et
// emporte son plan et ses remarques - la fenêtre dit avant confirmation ce qui
// part (postes retouchés par le cabinet compris) et ce qui reste.
// Depuis la liste des copropriétés (feedback 24/09, 11:48), la corbeille de la
// ligne ouvre d'abord le choix du document (DocumentsASupprimer).
// Mode « analyse » (0096, précision d'Amir du 24/09) : supprimer seulement le
// JSON intégré et le plan qu'il a produit, même retouché par le cabinet ; le PDF
// reste et repasse « déposé » pour qu'un nouveau JSON soit importé.
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/auth/AuthProvider";
import {
  useCorbeillePptCopro,
  usePptAgs,
  usePptCopro,
  usePptCorrections,
  usePptPostes,
  usePptRapports,
  usePptRemarques,
  useSupprimerAnalyse,
  useSupprimerPptRapport,
  type PptCopro,
  type PptRapport,
} from "@/api/ppt";
import { consequencesSuppression, consequencesSuppressionAnalyse, impactSuppression } from "@/lib/ppt/suppression";
import { TYPE_RAPPORT_LABEL } from "@/lib/ppt/referentiels";
import { StatutRapportBadge, fmtDateCourte } from "./commun";

export type DocumentASupprimer = Pick<PptRapport, "id" | "ppt_copro_id" | "name" | "type" | "statut" | "valide_le" | "depose_le" | "schema_version">;

/** Le bouton de suppression s'affiche-t-il ? Un rapport validé : dirigeant seulement (la base refuse les autres). */
export function peutSupprimer(r: Pick<PptRapport, "statut">, dirigeant: boolean): boolean {
  return r.statut !== "valide" || dirigeant;
}

/** Un JSON est intégré (schema_version posée à l'import) : le dirigeant peut le supprimer en gardant le PDF (0096). */
export function peutSupprimerJson(r: Pick<PptRapport, "schema_version">, dirigeant: boolean): boolean {
  return dirigeant && r.schema_version != null;
}

export function SupprimerDocument({
  rapport,
  onClose,
  mode = "document",
}: {
  rapport: DocumentASupprimer;
  onClose: (supprime: boolean) => void;
  /** « analyse » : seul le JSON intégré et son plan partent, le PDF reste. */
  mode?: "document" | "analyse";
}) {
  const analyse = mode === "analyse";
  const { profile } = useAuth();
  const amo = profile?.role === "amo";
  const ids = [rapport.ppt_copro_id];
  const { data: copro } = usePptCopro(rapport.ppt_copro_id);
  const rapports = usePptRapports(ids);
  const postes = usePptPostes(ids);
  const remarques = usePptRemarques(rapport.ppt_copro_id);
  const ags = usePptAgs(ids);
  const corrections = usePptCorrections(analyse ? rapport.id : undefined);
  const supprimer = useSupprimerPptRapport();
  const supprimerJson = useSupprimerAnalyse();
  const corbeille = useCorbeillePptCopro();
  const [motif, setMotif] = useState("");
  const [viderCopro, setViderCopro] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charge = rapports.isSuccess && postes.isSuccess && remarques.isSuccess && ags.isSuccess && (!analyse || corrections.isSuccess);
  const impact = charge
    ? impactSuppression(rapport, { rapports: rapports.data, postes: postes.data, remarques: remarques.data, nbAg: ags.data.length })
    : null;
  const { part, reste } = !impact ? { part: [], reste: [] } : analyse ? consequencesSuppressionAnalyse(impact, corrections.data?.length ?? 0) : consequencesSuppression(impact);
  // perte sans retour : rapport validé, ou plan / JSON retiré
  const grave = !!impact && (impact.valide || analyse);
  // la copropriété ne contient plus rien : l'équipe Strat Eco peut la mettre à la corbeille dans la foulée
  const proposeCorbeille = !analyse && amo && !!impact?.coproVidee && !!copro;
  const busy = supprimer.isPending || supprimerJson.isPending || corbeille.isPending;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!impact || busy) return;
    setErreur(null);
    try {
      if (analyse) await supprimerJson.mutateAsync({ rapportId: rapport.id, motif: motif.trim() || null });
      else await supprimer.mutateAsync({ rapportId: rapport.id, motif: motif.trim() || null });
      if (proposeCorbeille && viderCopro) await corbeille.mutateAsync({ id: rapport.ppt_copro_id });
      onClose(true);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Suppression refusée.");
    }
  };

  const liste = (items: string[], couleur: string) => (
    <ul style={{ margin: "4px 0 0 18px", padding: 0, fontSize: 13, color: couleur, display: "flex", flexDirection: "column", gap: 3 }}>
      {items.map((t) => <li key={t}>{t}</li>)}
    </ul>
  );

  return (
    <Modal title={analyse ? "Supprimer le JSON intégré" : impact?.valide ? "Supprimer le rapport validé" : "Supprimer le document"} onClose={() => onClose(false)} width={520} closeOnBackdrop={!busy}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="doc-row" style={{ padding: "0 0 12px" }}>
          <span className="d-ico"><Icon name="fileText" size={18} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="d-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rapport.name}</div>
            <div className="d-sub">
              {TYPE_RAPPORT_LABEL[rapport.type] ?? rapport.type}
              {copro ? ` · ${copro.nom}` : ""} · déposé le {fmtDateCourte(rapport.depose_le)}
              {rapport.valide_le ? ` · validé le ${fmtDateCourte(rapport.valide_le)}` : ""}
            </div>
          </div>
        </div>

        {!impact ? (
          <p className="se-small" style={{ margin: 0, color: "var(--fg-muted)" }}>Calcul de ce que la suppression emporte…</p>
        ) : (
          <>
            <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: grave ? "var(--color-error-50)" : "var(--bg)" }}>
              <strong style={{ fontSize: 13, color: grave ? "var(--color-error-700)" : undefined }}>
                {grave ? "Supprimés définitivement, sans retour possible :" : "Suppression définitive"}
              </strong>
              {liste(part, grave ? "var(--color-error-700)" : "var(--fg)")}
            </div>
            <div>
              <strong style={{ fontSize: 13 }}>Conservé :</strong>
              {liste(reste, "var(--fg-muted)")}
            </div>
            {grave && (
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                Motif (facultatif, gardé dans l'historique de la copropriété)
                <input className="edit-inp" style={{ maxWidth: "none" }} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={analyse ? "ex. nouvelle analyse du skill à importer" : "ex. revalidation après correction du rapport"} />
              </label>
            )}
            {proposeCorbeille && (
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                <input type="checkbox" checked={viderCopro} onChange={(e) => setViderCopro(e.target.checked)} style={{ marginTop: 2 }} />
                <span>Mettre aussi « {copro!.nom} » à la corbeille : elle ne contiendra plus ni document, ni poste, ni AG.</span>
              </label>
            )}
          </>
        )}

        {erreur && (
          <p style={{ margin: 0, padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>{erreur}</p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={() => onClose(false)} disabled={busy}>Annuler</button>
          <button type="submit" className="se-btn se-btn-primary btn-sm" style={{ background: "var(--color-error-700)", borderColor: "var(--color-error-700)" }} disabled={!impact || busy}>
            <Icon name="trash" size={14} />
            {busy ? "Suppression…" : analyse ? "Supprimer le JSON" : impact?.valide ? "Supprimer le rapport et son plan" : "Supprimer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Choix du document à supprimer parmi ceux d'une copropriété (corbeille d'une ligne de la liste). */
export function DocumentsASupprimer({ copro, rapports, onClose }: { copro: Pick<PptCopro, "id" | "nom">; rapports: DocumentASupprimer[]; onClose: () => void }) {
  const { profile } = useAuth();
  const dirigeant = !!profile?.dirigeant;
  const [choisi, setChoisi] = useState<{ rapport: DocumentASupprimer; mode: "document" | "analyse" } | null>(null);
  const docs = [...rapports].sort((a, b) => b.depose_le.localeCompare(a.depose_le));

  if (choisi) {
    return (
      <SupprimerDocument
        rapport={choisi.rapport}
        mode={choisi.mode}
        onClose={(supprime) => {
          setChoisi(null);
          // dernier document supprimé : plus rien à choisir
          if (supprime && choisi.mode === "document" && docs.length <= 1) onClose();
        }}
      />
    );
  }
  return (
    <Modal title="Supprimer un document" onClose={onClose} width={560}>
      <p className="se-small" style={{ margin: "0 0 10px", color: "var(--fg-muted)" }}>
        {copro.nom} · {docs.length} document{docs.length > 1 ? "s" : ""}. Choisissez celui à supprimer : la fenêtre suivante dit ce qui part et ce qui reste.
        {dirigeant ? " « Supprimer le JSON » garde le PDF et retire seulement l'analyse intégrée, pour en importer une nouvelle." : ""}
      </p>
      {docs.length === 0 && <p className="se-small" style={{ margin: 0 }}>Aucun document.</p>}
      {docs.map((r) => {
        const possible = peutSupprimer(r, dirigeant);
        return (
          <div key={r.id} className="doc-row" style={{ padding: "10px 0" }}>
            <span className="d-ico"><Icon name="fileText" size={18} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="d-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>{r.name}</div>
              <div className="d-sub">
                {TYPE_RAPPORT_LABEL[r.type] ?? r.type} · déposé le {fmtDateCourte(r.depose_le)}
                {r.valide_le ? ` · validé le ${fmtDateCourte(r.valide_le)}` : ""}
              </div>
            </div>
            {(r.type === "pppt" || r.type === "ppt_adopte") && <StatutRapportBadge statut={r.statut} />}
            {peutSupprimerJson(r, dirigeant) && (
              <button
                type="button"
                className="se-btn se-btn-ghost btn-sm"
                style={{ color: "var(--color-error-700)", flex: "none" }}
                title="Garder le PDF et supprimer seulement le JSON intégré (et le plan qu'il a produit), pour en importer un nouveau"
                onClick={() => setChoisi({ rapport: r, mode: "analyse" })}
              >
                <Icon name="refresh" size={14} /> Supprimer le JSON
              </button>
            )}
            <button
              type="button"
              className="se-btn se-btn-ghost btn-sm"
              style={{ color: possible ? "var(--color-error-700)" : undefined, flex: "none" }}
              disabled={!possible}
              title={possible ? (r.statut === "valide" ? "Supprimer ce rapport validé et son plan, pour recommencer" : "Supprimer ce document") : "Rapport validé : seul le dirigeant de Strat Eco peut le supprimer"}
              onClick={() => setChoisi({ rapport: r, mode: "document" })}
            >
              <Icon name="trash" size={14} /> Supprimer
            </button>
          </div>
        );
      })}
    </Modal>
  );
}
