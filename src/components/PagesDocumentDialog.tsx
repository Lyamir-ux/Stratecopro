// Pièce du portail déposée en plusieurs fichiers (remarque d'Amir du 12/10/2026 :
// « permettre aux copropriétaires de déposer plusieurs documents, notamment s'ils
// prennent en photo leurs documents », par exemple un avis d'imposition page par
// page). Le copropriétaire réunit ses photos ou fichiers, les remet dans l'ordre,
// en ajoute un à la fois (une photo prise au téléphone, puis la suivante), et le
// tout part en UN SEUL PDF (lib/pdf/assemblagePages) : vérification par l'AMO,
// aperçu et purge restent ceux d'une pièce à fichier unique.
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { useGlisserDeposer } from "@/components/useGlisserDeposer";
import { ACCEPT_PIECE, erreurFormatPiece, typeMimePiece } from "@/lib/formatPiece";
import { assemblerPages, nomDocumentAssemble } from "@/lib/pdf/assemblagePages";

function taille(octets: number): string {
  if (octets < 1024 * 1024) return Math.max(1, Math.round(octets / 1024)) + " Ko";
  return (octets / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Mo";
}

/** Premier choix de fichiers : une fenêtre de pages s'impose-t-elle ? Un PDF seul
 *  contient déjà toutes ses pages et part directement ; une photo appelle souvent
 *  la suivante (verso, page 2…). */
export function pagesADemander(fichiers: File[]): boolean {
  return fichiers.length > 1 || (fichiers.length === 1 && typeMimePiece(fichiers[0]) !== "application/pdf");
}

export function PagesDocumentDialog({
  titre,
  fichiers: initiaux,
  onValider,
  onClose,
}: {
  /** nom de la pièce attendue (ex. « Avis d'imposition (N-1) ») */
  titre: string;
  fichiers: File[];
  /** le document assemblé, prêt pour le nommage puis le dépôt */
  onValider: (document: File) => void;
  onClose: () => void;
}) {
  const [fichiers, setFichiers] = useState<File[]>(initiaux);
  const [erreur, setErreur] = useState<string | null>(null);
  const [assemblage, setAssemblage] = useState(false);
  const ajoutRef = useRef<HTMLInputElement>(null);

  // vignettes des photos, libérées quand la liste change ou que la fenêtre se ferme
  const [vignettes, setVignettes] = useState<(string | null)[]>([]);
  useEffect(() => {
    const urls = fichiers.map((f) => (typeMimePiece(f) === "application/pdf" ? null : URL.createObjectURL(f)));
    setVignettes(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [fichiers]);

  const ajouter = (liste: File[]) => {
    const refus = liste.map(erreurFormatPiece).find(Boolean) ?? null;
    setErreur(refus);
    const valides = liste.filter((f) => !erreurFormatPiece(f));
    if (valides.length) setFichiers((l) => [...l, ...valides]);
  };
  const glisser = useGlisserDeposer((_f, tous) => ajouter(tous), !assemblage);

  const deplacer = (i: number, sens: -1 | 1) =>
    setFichiers((l) => {
      const j = i + sens;
      if (j < 0 || j >= l.length) return l;
      const copie = [...l];
      [copie[i], copie[j]] = [copie[j], copie[i]];
      return copie;
    });

  const continuer = async () => {
    setErreur(null);
    setAssemblage(true);
    try {
      const blob = await assemblerPages(fichiers);
      onValider(blob instanceof File ? blob : new File([blob], nomDocumentAssemble(fichiers), { type: "application/pdf" }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Les fichiers n'ont pas pu être réunis.");
      setAssemblage(false);
    }
  };

  return (
    <Modal title="Pages de la pièce" onClose={() => !assemblage && onClose()} width={560} closeOnBackdrop={false}>
      <p className="se-body" style={{ marginTop: 0 }}>
        <b>{titre}</b> : ajoutez une photo ou un fichier par page, jusqu'à ce que le document soit complet (toutes les
        pages, recto et verso). Ils seront réunis dans un seul PDF, dans l'ordre ci-dessous.
      </p>
      <input
        ref={ajoutRef}
        type="file"
        multiple
        accept={ACCEPT_PIECE}
        style={{ display: "none" }}
        onChange={(e) => {
          ajouter(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <div
        {...glisser.props}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 8,
          borderRadius: "var(--radius-md)",
          border: "1px dashed " + (glisser.survol ? "var(--accent)" : "var(--border)"),
          background: glisser.survol ? "var(--accent-soft)" : undefined,
          maxHeight: "46vh",
          overflowY: "auto",
        }}
      >
        {fichiers.length === 0 && (
          <p className="se-small" style={{ margin: 8, color: "var(--fg-muted)", textAlign: "center" }}>
            Aucune page pour l'instant : ajoutez une photo ou un fichier.
          </p>
        )}
        {fichiers.map((f, i) => (
          <div
            key={i + f.name + f.size + f.lastModified}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", background: "var(--bg)", borderRadius: "var(--radius-sm)" }}
          >
            {vignettes[i] ? (
              <img src={vignettes[i]!} alt="" style={{ width: 40, height: 52, objectFit: "cover", borderRadius: 4, border: "1px solid var(--border)", flex: "none" }} />
            ) : (
              <span style={{ width: 40, height: 52, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: "1px solid var(--border)", flex: "none", color: "var(--fg-muted)" }}>
                <Icon name="fileText" size={18} />
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                {typeMimePiece(f) === "application/pdf" ? `Fichier PDF ${i + 1}` : `Page ${i + 1}`}
              </div>
              <div className="se-small" style={{ color: "var(--fg-muted)", overflowWrap: "anywhere" }}>
                {f.name} · {taille(f.size)}
              </div>
            </div>
            <button className="icon-btn" title="Monter" aria-label="Monter" disabled={i === 0 || assemblage} onClick={() => deplacer(i, -1)}>
              <Icon name="chevronUp" size={16} />
            </button>
            <button
              className="icon-btn"
              title="Descendre"
              aria-label="Descendre"
              disabled={i === fichiers.length - 1 || assemblage}
              onClick={() => deplacer(i, 1)}
            >
              <Icon name="chevronDown" size={16} />
            </button>
            <button
              className="icon-btn"
              title="Retirer"
              aria-label="Retirer"
              disabled={assemblage}
              onClick={() => setFichiers((l) => l.filter((_, k) => k !== i))}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
      </div>
      {erreur && (
        <p className="se-small" role="alert" style={{ color: "var(--color-error-700)", margin: "10px 0 0" }}>
          {erreur}
        </p>
      )}
      <div style={{ marginTop: 10 }}>
        <button className="se-btn se-btn-secondary btn-sm" disabled={assemblage} onClick={() => ajoutRef.current?.click()}>
          <Icon name="plus" size={14} />
          Ajouter une page
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
        <button className="se-btn se-btn-ghost" disabled={assemblage} onClick={onClose}>
          Annuler
        </button>
        <button className="se-btn se-btn-primary" disabled={assemblage || fichiers.length === 0} onClick={() => void continuer()}>
          {assemblage
            ? "Préparation…"
            : `Continuer (${fichiers.length} fichier${fichiers.length > 1 ? "s" : ""})`}
        </button>
      </div>
    </Modal>
  );
}
