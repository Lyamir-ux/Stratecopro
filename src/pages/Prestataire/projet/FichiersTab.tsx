// Onglet Fichiers de la fiche MOE (14/10/2026) : vos documents du projet
// (dépôt par bouton ou glissé-déposé, œil d'aperçu, nomenclature) et, en
// lecture seule, la base documentaire du dossier - fichiers non confidentiels
// déposés par l'équipe Strat Eco et le syndic (hors facturation), et vos pièces
// des Documents à produire (RPC documents_dossier_moe, 0165).
import { useState } from "react";
import { ApercuDocument } from "@/components/ApercuDocument";
import { Icon } from "@/components/Icon";
import { LigneFichier } from "@/components/LigneFichier";
import { Badge, type BadgeKind } from "@/components/ui";
import { DOSSIERS, DOSSIER_AIDE } from "@/api/fichiers";
import { telechargerDocument, type DocumentSyndic, type OrigineDocument } from "@/api/syndic";
import { useDocumentsDossierMoe } from "@/api/projetMoe";
import { fmtDate } from "@/lib/format";
import { DocumentsProjet } from "./DocumentsProjet";
import type { Tables } from "@/lib/database.types";

const ORIGINE: Record<OrigineDocument, { label: string; kind: BadgeKind }> = {
  amo: { label: "Strat Eco", kind: "primary" },
  moe: { label: "Vous", kind: "warn" },
  syndic: { label: "Syndic", kind: "blue" },
};

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " Ko";
  return (bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Mo";
}

export function FichiersTabMoe({ c, presta }: { c: Tables<"coproprietes">; presta: Tables<"prestataires"> }) {
  const { data: documents, isLoading } = useDocumentsDossierMoe(c.id, presta.id);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [apercu, setApercu] = useState<DocumentSyndic | null>(null);

  const tous = documents ?? [];
  const extras = [...new Set(tous.map((d) => d.dossier))]
    .filter((f) => !(DOSSIERS as readonly string[]).includes(f))
    .sort((a, b) => a.localeCompare(b, "fr"));
  const dossiers = [...DOSSIERS, ...extras];
  const docsDe = (f: string) => tous.filter((d) => d.dossier === f);

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <DocumentsProjet presta={presta} copro={c} />

      <div className="panel">
        <div className="p-head">
          <Icon name="layers" size={18} />
          <h3>Documents du dossier</h3>
          <span style={{ flex: 1 }}></span>
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
            {tous.length} document{tous.length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="p-body">
          {isLoading ? (
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>Chargement…</p>
          ) : (
            <>
              <div className="file-grid">
                {dossiers.map((f) => {
                  const n = docsDe(f).length;
                  const aide = DOSSIER_AIDE[f as keyof typeof DOSSIER_AIDE];
                  return (
                    <div
                      key={f}
                      className="file-card"
                      onClick={() => setOuvert(ouvert === f ? null : f)}
                      style={{ position: "relative", cursor: "pointer", outline: ouvert === f ? "2px solid var(--accent)" : "none", opacity: n === 0 ? 0.6 : 1 }}
                    >
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
              {ouvert && (
                <div style={{ marginTop: 18 }}>
                  <div className="se-eyebrow" style={{ marginBottom: 8, color: "var(--fg-muted)" }}>
                    {ouvert}
                  </div>
                  {docsDe(ouvert).length === 0 ? (
                    <p className="se-small" style={{ color: "var(--fg-muted)" }}>Dossier vide pour l'instant.</p>
                  ) : (
                    docsDe(ouvert).map((doc) => (
                      <LigneFichier
                        key={doc.id}
                        variante="syndic"
                        name={doc.name}
                        detail={[fmtSize(doc.size), fmtDate(doc.date)].filter(Boolean).join(" · ")}
                        avant={<Badge kind={ORIGINE[doc.origine].kind}>{ORIGINE[doc.origine].label}</Badge>}
                        confirmation=""
                        onApercu={() => setApercu(doc)}
                        onTelecharger={() => void telechargerDocument(doc)}
                      />
                    ))
                  )}
                </div>
              )}
              <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 14, marginBottom: 0 }}>
                <Icon name="eye" size={13} /> Cliquez sur un dossier pour consulter ses pièces : l'œil en donne un
                aperçu sans les télécharger. Ces documents sont déposés par l'équipe Strat Eco et le syndic, en lecture
                seule ; vos propres documents se déposent dans le panneau du haut.
              </p>
            </>
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
    </div>
  );
}
