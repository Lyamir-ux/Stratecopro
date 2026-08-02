// Mes documents : téléversement des pièces justificatives (bucket privé pieces-copro)
// + consultation des documents du projet partagés par l'AMO.
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { downloadFichier } from "@/api/fichiers";
import {
  PIECES,
  useFichiersPartages,
  useMesPieces,
  useUploadPiece,
  type Membership,
  type TypePiece,
} from "@/api/portail";

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " Ko";
  return (bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Mo";
}

export function Documents({ membership }: { membership: Membership }) {
  const { data: pieces } = useMesPieces(membership.coproprietaireId);
  const { data: fichiers } = useFichiersPartages(membership.copro.id);
  const upload = useUploadPiece(membership.copro.id, membership.coproprietaireId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingType, setPendingType] = useState<TypePiece | null>(null);

  const req = PIECES.filter((p) => p.required);
  const done = req.filter((p) => (pieces ?? []).some((x) => x.type === p.type)).length;

  const pick = (type: TypePiece) => {
    setPendingType(type);
    inputRef.current?.click();
  };

  const onFile = (file: File | undefined) => {
    if (file && pendingType) upload.mutate({ type: pendingType, file });
    setPendingType(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="fade">
      <h1 className="sec-title">Mes documents</h1>
      <p className="sec-sub">Consultez les documents du projet et téléversez vos pièces justificatives.</p>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: "none" }}
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <div className="split">
        <div className="card-xl">
          <div className="cx-head">
            <Icon name="folder" size={20} style={{ color: "var(--accent)" }} />
            <h2>Vos pièces à fournir</h2>
            <span style={{ flex: 1 }}></span>
            <Badge kind={done >= req.length ? "success" : "warn"}>{done}/{req.length} obligatoires</Badge>
          </div>
          <div className="cx-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {PIECES.map((d) => {
              const piece = (pieces ?? []).find((x) => x.type === d.type);
              const busy = upload.isPending && pendingType === d.type;
              return (
                <div key={d.type} className={"dropzone" + (piece ? " filled" : "")} onClick={() => !upload.isPending && pick(d.type)}>
                  <span className="dz-ico"><Icon name={piece ? "check" : "download"} size={18} /></span>
                  <div>
                    <div className="dz-name">
                      {d.name} {d.required && <span style={{ color: "var(--color-error-500)" }}>*</span>}
                    </div>
                    <div className="dz-hint">
                      {busy ? "Téléversement…" : piece ? piece.name + " · téléversée le " + fmtDate(piece.uploaded_at) : d.hint}
                    </div>
                  </div>
                  <span className="spacer"></span>
                  <span className="dz-action">{piece ? "Remplacer" : "Téléverser"}</span>
                </div>
              );
            })}
            {upload.isError && (
              <p className="se-small" style={{ color: "var(--color-error-700)", margin: 0 }}>
                Le téléversement a échoué. Vérifiez le fichier (PDF ou image) et réessayez.
              </p>
            )}
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
              Vos pièces sont stockées de manière sécurisée et ne sont visibles que par vous et l'équipe Strat Eco.
            </p>
          </div>
        </div>

        <div className="card-xl">
          <div className="cx-head">
            <Icon name="fileText" size={20} style={{ color: "var(--color-secondary-500)" }} />
            <h2 style={{ fontSize: 19 }}>Documents du projet</h2>
          </div>
          <div className="cx-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
            {(fichiers ?? []).map((doc) => (
              <div key={doc.id} className="doc-row">
                <span className="d-ico"><Icon name="fileText" size={18} /></span>
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
                Aucun document n'a encore été partagé par votre AMO.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
