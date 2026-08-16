// Onglet Fichiers (syndic) — base documentaire du dossier : ce que l'AMO et la
// maîtrise d'œuvre y ont déposé ET ce que le syndic a lui-même fourni depuis
// « Documents à produire ». Aperçu sans téléchargement, ou téléchargement.
import { useState } from "react";
import { ApercuDocument } from "@/components/ApercuDocument";
import { Icon } from "@/components/Icon";
import { Badge, type BadgeKind } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { estVisualisable } from "@/api/fichiers";
import {
  ORIGINE_LABEL,
  telechargerDocument,
  useDocumentsSyndic,
  type DocumentSyndic,
  type OrigineDocument,
  type SyndicCopro,
} from "@/api/syndic";

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " Ko";
  return (bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Mo";
}

const ORIGINE_BADGE: Record<OrigineDocument, BadgeKind> = {
  amo: "primary",
  moe: "warn",
  syndic: "blue",
};

type Filtre = "tous" | OrigineDocument;
const FILTRES: Filtre[] = ["tous", "amo", "moe", "syndic"];
const FILTRE_LABEL: Record<Filtre, string> = { tous: "Tous", ...ORIGINE_LABEL };

export function FichiersTabSyndic({ c }: { c: SyndicCopro }) {
  const { data: documents, isLoading } = useDocumentsSyndic(c.id);
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [apercu, setApercu] = useState<DocumentSyndic | null>(null);
  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  const tous = documents ?? [];
  const visibles = filtre === "tous" ? tous : tous.filter((d) => d.origine === filtre);
  const n = (f: Filtre) => (f === "tous" ? tous.length : tous.filter((d) => d.origine === f).length);

  return (
    <>
      <div className="panel fade" style={{ maxWidth: 760 }}>
        <div className="p-head">
          <Icon name="folder" size={18} />
          <h3>Documents du projet</h3>
          <span style={{ flex: 1 }}></span>
          <div className="opt-mini">
            {/* on masque un filtre d'origine tant qu'aucune pièce n'en vient */}
            {FILTRES.filter((f) => f === "tous" || n(f) > 0).map((f) => (
              <button key={f} className={filtre === f ? "on" : ""} onClick={() => setFiltre(f)}>
                {FILTRE_LABEL[f]} ({n(f)})
              </button>
            ))}
          </div>
        </div>
        <div className="p-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
          {visibles.map((doc) => (
            <div key={doc.id} className="doc-row">
              <span className="d-ico">
                <Icon name="fileText" size={18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="d-name">{doc.name}</div>
                <div className="d-sub">
                  {[doc.dossier, fmtSize(doc.size), fmtDate(doc.date)].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className="spacer"></span>
              <Badge kind={ORIGINE_BADGE[doc.origine]}>{ORIGINE_LABEL[doc.origine]}</Badge>
              <button
                className="icon-btn"
                title={
                  estVisualisable(doc.name)
                    ? "Aperçu sans téléchargement"
                    : "Ce format ne s'affiche pas dans le navigateur"
                }
                onClick={() => setApercu(doc)}
              >
                <Icon name="eye" size={18} />
              </button>
              <button className="icon-btn" title="Télécharger" onClick={() => void telechargerDocument(doc)}>
                <Icon name="download" size={18} />
              </button>
            </div>
          ))}
          {visibles.length === 0 && (
            <p className="se-small" style={{ color: "var(--fg-muted)", padding: "14px 0" }}>
              {tous.length === 0
                ? "Aucun document sur ce dossier pour l'instant."
                : "Aucun document dans cette catégorie."}
            </p>
          )}
        </div>
      </div>

      {apercu && (
        <ApercuDocument
          name={apercu.name}
          path={apercu.path}
          onClose={() => setApercu(null)}
          onTelecharger={() => void telechargerDocument(apercu)}
        />
      )}
    </>
  );
}
