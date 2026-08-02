// Onglet Fichiers (syndic) — documents du projet partagés par l'AMO
// (mêmes fichiers que le portail copropriétaire), téléchargement seul.
import { Icon } from "@/components/Icon";
import { fmtDate } from "@/lib/format";
import { downloadFichier } from "@/api/fichiers";
import { useFichiersPartages } from "@/api/portail";
import type { SyndicCopro } from "@/api/syndic";

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " Ko";
  return (bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Mo";
}

export function FichiersTabSyndic({ c }: { c: SyndicCopro }) {
  const { data: fichiers, isLoading } = useFichiersPartages(c.id);
  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  return (
    <div className="panel fade" style={{ maxWidth: 760 }}>
      <div className="p-head">
        <Icon name="folder" size={18} />
        <h3>Documents du projet</h3>
        <span style={{ flex: 1 }}></span>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{fichiers?.length ?? 0}</span>
      </div>
      <div className="p-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
        {(fichiers ?? []).map((doc) => (
          <div key={doc.id} className="doc-row">
            <span className="d-ico">
              <Icon name="fileText" size={18} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="d-name">{doc.name}</div>
              <div className="d-sub">
                {[doc.dossier, fmtSize(doc.size), fmtDate(doc.created_at)].filter(Boolean).join(" · ")}
              </div>
            </div>
            <span className="spacer"></span>
            <button className="icon-btn" title="Télécharger" onClick={() => void downloadFichier(doc)}>
              <Icon name="download" size={18} />
            </button>
          </div>
        ))}
        {(fichiers ?? []).length === 0 && (
          <p className="se-small" style={{ color: "var(--fg-muted)", padding: "14px 0" }}>
            Aucun document n'a encore été partagé par l'équipe Strat Eco sur ce dossier.
          </p>
        )}
      </div>
    </div>
  );
}
