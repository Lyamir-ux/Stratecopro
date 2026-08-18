// Onglet Fichiers (syndic) — base documentaire du dossier : ce que l'AMO et la
// maîtrise d'œuvre y ont déposé ET ce que le syndic a lui-même fourni depuis
// « Documents à produire ». Présentation alignée sur le portail AMO : cartes de
// dossiers (avec bulles d'aide), clic pour lister les pièces. Lecture seule —
// aperçu sans téléchargement, ou téléchargement.
import { useState } from "react";
import { ApercuDocument } from "@/components/ApercuDocument";
import { Icon } from "@/components/Icon";
import { Badge, type BadgeKind } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { DOSSIERS, DOSSIER_AIDE, estVisualisable } from "@/api/fichiers";
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

export function FichiersTabSyndic({ c }: { c: SyndicCopro }) {
  const { data: documents, isLoading } = useDocumentsSyndic(c.id);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [apercu, setApercu] = useState<DocumentSyndic | null>(null);
  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  const tous = documents ?? [];
  // Les 7 dossiers du projet, puis les dossiers « montage bancaire » (Éco-PTZ
  // collectif, ANAH…) qui n'apparaissent que s'ils contiennent une pièce.
  const extras = [...new Set(tous.map((d) => d.dossier))].filter(
    (f) => !(DOSSIERS as readonly string[]).includes(f)
  );
  const folders: string[] = [...DOSSIERS, ...extras.sort((a, b) => a.localeCompare(b, "fr"))];
  const byFolder = (f: string) => tous.filter((d) => d.dossier === f);
  const folderDocs = openFolder ? byFolder(openFolder) : [];

  return (
    <>
      <div className="panel fade">
        <div className="p-head">
          <Icon name="folder" size={18} />
          <h3>Documents du projet</h3>
          <span style={{ flex: 1 }}></span>
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
            {tous.length} document{tous.length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="p-body">
          <div className="file-grid">
            {folders.map((f) => {
              const n = byFolder(f).length;
              const aide = DOSSIER_AIDE[f as keyof typeof DOSSIER_AIDE];
              return (
                <div
                  className="file-card"
                  key={f}
                  onClick={() => setOpenFolder(openFolder === f ? null : f)}
                  style={{
                    position: "relative",
                    outline: openFolder === f ? "2px solid var(--accent)" : "none",
                  }}
                >
                  {/* Bulle d'aide : quels documents vont dans ce dossier */}
                  {aide && (
                    <span className="fc-help" tabIndex={0} onClick={(e) => e.stopPropagation()}>
                      <Icon name="help" size={15} />
                      <span className="fc-help-bulle" role="tooltip">
                        {aide}
                      </span>
                    </span>
                  )}
                  <Icon name="folder" size={26} className="fc-ico" />
                  <div className="fc-name">{f}</div>
                  <div className="fc-sub">
                    {n} fichier{n > 1 ? "s" : ""}
                  </div>
                </div>
              );
            })}
          </div>
          {openFolder && (
            <div style={{ marginTop: 18 }}>
              <div className="se-eyebrow" style={{ marginBottom: 8, color: "var(--fg-muted)" }}>
                {openFolder}
              </div>
              {folderDocs.length === 0 ? (
                <p className="se-small" style={{ color: "var(--fg-muted)" }}>
                  Dossier vide pour l'instant.
                </p>
              ) : (
                folderDocs.map((doc) => (
                  <div key={doc.id} className="doc-row">
                    <span className="d-ico">
                      <Icon name="fileText" size={18} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="d-name">{doc.name}</div>
                      <div className="d-sub">{[fmtSize(doc.size), fmtDate(doc.date)].filter(Boolean).join(" · ")}</div>
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
                ))
              )}
            </div>
          )}
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 14, marginBottom: 0 }}>
            <Icon name="eye" size={13} /> Cliquez sur un dossier pour consulter ses pièces : l'œil en donne un aperçu
            sans les télécharger. Le badge indique qui a déposé chaque document (AMO, MOE ou votre équipe).
          </p>
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
