// Suppression d'un document de la branche PPT (0082, 0095). Feedback Amir
// 24/09/2026 : « supprimer un PPPT, un PPT, un fichier, afin de recommencer en
// cas de validation ». Un document non validé part avec son fichier (déposant
// ou équipe Strat Eco) ; un rapport validé se supprime par le seul dirigeant et
// emporte son plan et ses remarques - la fenêtre dit avant confirmation ce qui
// part (postes retouchés par le cabinet compris) et ce qui reste.
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/auth/AuthProvider";
import { useCorbeillePptCopro, usePptAgs, usePptCopro, usePptPostes, usePptRapports, usePptRemarques, useSupprimerPptRapport, type PptRapport } from "@/api/ppt";
import { consequencesSuppression, impactSuppression } from "@/lib/ppt/suppression";
import { TYPE_RAPPORT_LABEL } from "@/lib/ppt/referentiels";
import { fmtDateCourte } from "./commun";

export type DocumentASupprimer = Pick<PptRapport, "id" | "ppt_copro_id" | "name" | "type" | "statut" | "valide_le" | "depose_le">;

/** Le bouton de suppression s'affiche-t-il ? Un rapport validé : dirigeant seulement (la base refuse les autres). */
export function peutSupprimer(r: Pick<PptRapport, "statut">, dirigeant: boolean): boolean {
  return r.statut !== "valide" || dirigeant;
}

export function SupprimerDocument({ rapport, onClose }: { rapport: DocumentASupprimer; onClose: (supprime: boolean) => void }) {
  const { profile } = useAuth();
  const amo = profile?.role === "amo";
  const ids = [rapport.ppt_copro_id];
  const { data: copro } = usePptCopro(rapport.ppt_copro_id);
  const rapports = usePptRapports(ids);
  const postes = usePptPostes(ids);
  const remarques = usePptRemarques(rapport.ppt_copro_id);
  const ags = usePptAgs(ids);
  const supprimer = useSupprimerPptRapport();
  const corbeille = useCorbeillePptCopro();
  const [motif, setMotif] = useState("");
  const [viderCopro, setViderCopro] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charge = rapports.isSuccess && postes.isSuccess && remarques.isSuccess && ags.isSuccess;
  const impact = charge
    ? impactSuppression(rapport, { rapports: rapports.data, postes: postes.data, remarques: remarques.data, nbAg: ags.data.length })
    : null;
  const { part, reste } = impact ? consequencesSuppression(impact) : { part: [], reste: [] };
  // la copropriété ne contient plus rien : l'équipe Strat Eco peut la mettre à la corbeille dans la foulée
  const proposeCorbeille = amo && !!impact?.coproVidee && !!copro;
  const busy = supprimer.isPending || corbeille.isPending;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!impact || busy) return;
    setErreur(null);
    try {
      await supprimer.mutateAsync({ rapportId: rapport.id, motif: motif.trim() || null });
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
    <Modal title={impact?.valide ? "Supprimer le rapport validé" : "Supprimer le document"} onClose={() => onClose(false)} width={520} closeOnBackdrop={!busy}>
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
            <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: impact.valide ? "var(--color-error-50)" : "var(--bg)" }}>
              <strong style={{ fontSize: 13, color: impact.valide ? "var(--color-error-700)" : undefined }}>
                {impact.valide ? "Supprimés définitivement, sans retour possible :" : "Suppression définitive"}
              </strong>
              {liste(part, impact.valide ? "var(--color-error-700)" : "var(--fg)")}
            </div>
            <div>
              <strong style={{ fontSize: 13 }}>Conservé :</strong>
              {liste(reste, "var(--fg-muted)")}
            </div>
            {impact.valide && (
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                Motif (facultatif, gardé dans l'historique de la copropriété)
                <input className="edit-inp" style={{ maxWidth: "none" }} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="ex. revalidation après correction du rapport" />
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
            {busy ? "Suppression…" : impact?.valide ? "Supprimer le rapport et son plan" : "Supprimer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
