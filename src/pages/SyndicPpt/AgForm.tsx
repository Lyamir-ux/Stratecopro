// Saisie d'une assemblée générale et de ses résolutions sur les postes du PPT.
// Chaque poste coché devient une résolution (article, issue, montant voté) ;
// le trigger ppt_appliquer_resolution met à jour le statut du poste : un
// poste rejeté ou reporté ressort l'année suivante, jamais perdu.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { useDeposerPptRapport, useSaisirAg, type PptCopro, type PptPoste, type PptResolution, type ResolutionSaisie } from "@/api/ppt";
import { articleSuggere } from "@/lib/ppt/referentiels";
import { fmtEur, type PrioriteCode } from "./commun";
import { messageErreur } from "@/lib/erreurs";

type Article = NonNullable<PptResolution["article"]>;
type Issue = PptResolution["issue"];

interface Ligne {
  poste: PptPoste | null;
  intitule: string;
  coche: boolean;
  article: Article;
  issue: Issue;
  montant: string;
}

const ARTICLES: { id: Article; label: string }[] = [
  { id: "24", label: "Art. 24 - majorité simple" },
  { id: "25", label: "Art. 25 - majorité absolue" },
  { id: "25-1", label: "Art. 25-1 - second vote" },
  { id: "26", label: "Art. 26 - double majorité" },
];

const ISSUES: { id: Issue; label: string }[] = [
  { id: "adopte", label: "Adoptée" },
  { id: "rejete", label: "Rejetée" },
  { id: "reporte", label: "Reportée" },
  { id: "non_presente", label: "Non présentée" },
];

export function AgForm({ copro, postes, onClose }: { copro: Pick<PptCopro, "id" | "organisation_id">; postes: PptPoste[]; onClose: () => void }) {
  const saisir = useSaisirAg();
  const deposer = useDeposerPptRapport();
  const [dateAg, setDateAg] = useState("");
  const [type, setType] = useState<"ordinaire" | "extraordinaire">("ordinaire");
  const [notes, setNotes] = useState("");
  const [pv, setPv] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const candidats = postes.filter((p) => p.actif && !["vote", "realise", "abandonne"].includes(p.statut));
  const [lignes, setLignes] = useState<Ligne[]>(
    candidats.map((p) => ({ poste: p, intitule: p.libelle, coche: false, article: articleSuggere(p.priorite as PrioriteCode), issue: "adopte", montant: "" }))
  );

  const maj = (i: number, patch: Partial<Ligne>) => setLignes((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const cochees = lignes.filter((l) => l.coche && l.intitule.trim());
  const valide = !!dateAg && (cochees.length > 0 || notes.trim().length > 0);
  const busy = saisir.isPending || deposer.isPending;

  const submit = async () => {
    if (!valide || busy) return;
    setErreur(null);
    try {
      let pvId: string | null = null;
      if (pv) pvId = (await deposer.mutateAsync({ copro, file: pv, type: "pv_ag" })).id;
      const resolutions: ResolutionSaisie[] = cochees.map((l) => ({
        poste_id: l.poste?.id ?? null,
        intitule: l.intitule.trim(),
        article: l.article,
        issue: l.issue,
        montant_vote: l.montant ? Number(l.montant) : null,
      }));
      await saisir.mutateAsync({ ppt_copro_id: copro.id, date_ag: dateAg, type, notes: notes.trim() || null, pv_rapport_id: pvId, resolutions });
      onClose();
    } catch (e) {
      setErreur(messageErreur(e, "L'enregistrement a échoué."));
    }
  };

  return (
    <Modal title="Saisir une assemblée générale" onClose={onClose} width={860} closeOnBackdrop={false}>
      <div style={{ display: "grid", gridTemplateColumns: "180px 200px 1fr", gap: 12, marginBottom: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
          Date de l'AG *
          <input className="edit-inp" style={{ maxWidth: "none" }} type="date" value={dateAg} onChange={(e) => setDateAg(e.target.value)} autoFocus />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
          Type
          <select className="edit-inp" style={{ maxWidth: "none" }} value={type} onChange={(e) => setType(e.target.value as "ordinaire" | "extraordinaire")}>
            <option value="ordinaire">Ordinaire</option>
            <option value="extraordinaire">Extraordinaire</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
          Procès-verbal (PDF, facultatif)
          <input className="edit-inp" style={{ maxWidth: "none", padding: 6 }} type="file" accept="application/pdf,.pdf" onChange={(e) => setPv(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      <div className="se-eyebrow" style={{ color: "var(--fg-muted)", margin: "6px 0 8px" }}>Postes présentés</div>
      {candidats.length === 0 && <p className="se-small" style={{ color: "var(--fg-muted)" }}>Aucun poste du plan n'est en attente de vote. Vous pouvez tout de même consigner l'AG (notes).</p>}
      <div className="tablewrap">
        <table className="dossiers" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Poste</th>
              <th>Article</th>
              <th>Issue</th>
              <th className="num">Montant voté (€ TTC)</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={l.poste?.id ?? `libre-${i}`} style={{ cursor: "default", opacity: l.coche ? 1 : 0.75 }}>
                <td>
                  <input type="checkbox" checked={l.coche} onChange={(e) => maj(i, { coche: e.target.checked })} />
                </td>
                <td>
                  {l.poste ? (
                    <>
                      <div style={{ fontWeight: 600 }}>{l.poste.libelle}</div>
                      <div style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
                        {l.poste.annee_prochaine_presentation ?? l.poste.annee_prevue ?? "année à fixer"} · {l.poste.cout_ht_base ? fmtEur(l.poste.cout_ht_base) + " HT estimés" : "non chiffré"}
                        {l.poste.statut === "rejete" || l.poste.statut === "reporte" ? " · à représenter" : ""}
                      </div>
                    </>
                  ) : (
                    <input className="edit-inp sm" style={{ maxWidth: "none" }} placeholder="Intitulé de la résolution" value={l.intitule} onChange={(e) => maj(i, { intitule: e.target.value, coche: true })} />
                  )}
                </td>
                <td>
                  <select className="edit-inp sm" style={{ width: 200, maxWidth: "none" }} value={l.article} onChange={(e) => maj(i, { article: e.target.value as Article, coche: true })}>
                    {ARTICLES.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select className="edit-inp sm" style={{ width: 140, maxWidth: "none" }} value={l.issue} onChange={(e) => maj(i, { issue: e.target.value as Issue, coche: true })}>
                    {ISSUES.map((x) => (
                      <option key={x.id} value={x.id}>{x.label}</option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <input className="edit-inp sm" style={{ width: 120, textAlign: "right" }} type="number" min={0} step={100} value={l.montant} disabled={l.issue !== "adopte"} onChange={(e) => maj(i, { montant: e.target.value, coche: true })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="se-btn se-btn-ghost btn-sm"
        style={{ marginTop: 8 }}
        onClick={() => setLignes((l) => [...l, { poste: null, intitule: "", coche: false, article: "24", issue: "adopte", montant: "" }])}
      >
        <Icon name="plus" size={13} />
        Résolution hors plan
      </button>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500, marginTop: 14 }}>
        Notes
        <textarea className="cs-textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contexte du vote, quorum, points reportés…"></textarea>
      </label>

      {erreur && <p style={{ margin: "10px 0 0", padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>{erreur}</p>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="se-btn se-btn-ghost btn-sm" onClick={onClose}>Annuler</button>
        <button className="se-btn se-btn-primary btn-sm" disabled={!valide || busy} onClick={() => void submit()}>
          <Icon name="check" size={14} />
          {busy ? "Enregistrement…" : `Enregistrer${cochees.length ? ` (${cochees.length} résolution${cochees.length > 1 ? "s" : ""})` : ""}`}
        </button>
      </div>
    </Modal>
  );
}
