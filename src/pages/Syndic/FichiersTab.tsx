// Onglet Fichiers (syndic) - base documentaire du dossier : ce que l'AMO et la
// maîtrise d'œuvre y ont déposé ET ce que le syndic a lui-même fourni (depuis
// cet onglet ou depuis « Documents à produire »). Présentation alignée sur le
// portail AMO : cartes de dossiers (avec bulles d'aide), clic pour lister les
// pièces, aperçu sans téléchargement ou téléchargement.
//
// Dépôt (feedback du 03/09/2026) : exactement le même dispositif que l'AMO -
// bouton « Déposer » avec sélecteur de dossier, glissé-déposé sur la zone ou
// directement sur une carte, archives zip (extraire / conserver) et renommage
// assisté avant envoi. Le syndic ne retire que ses propres dépôts.
import { useRef, useState } from "react";
import { ApercuDocument } from "@/components/ApercuDocument";
import { DepotZipDialog, estZip } from "@/components/DepotZipDialog";
import { Icon } from "@/components/Icon";
import { Badge, type BadgeKind } from "@/components/ui";
import { RenommageDialog } from "@/components/RenommageDialog";
import { fmtDate } from "@/lib/format";
import { DOSSIERS, DOSSIER_AIDE, estVisualisable } from "@/api/fichiers";
import {
  ORIGINE_LABEL,
  telechargerDocument,
  useDocumentsSyndic,
  useSupprimerDocumentSyndic,
  useUploadDocumentSyndic,
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
  const upload = useUploadDocumentSyndic(c.id);
  const supprimer = useSupprimerDocumentSyndic(c.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [uploadFolder, setUploadFolder] = useState<string>(DOSSIERS[0]);
  const [apercu, setApercu] = useState<DocumentSyndic | null>(null);
  // Glissé-déposé : "panel" = zone générale, sinon nom du dossier survolé
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Fichiers en attente de renommage assisté avant dépôt
  const [depot, setDepot] = useState<{ files: File[]; dossier: string } | null>(null);
  // Archives zip en attente du choix de format (extraire / conserver)
  const [depotZip, setDepotZip] = useState<{ zips: File[]; autres: File[]; dossier: string } | null>(null);
  const sending = depot != null || depotZip != null;

  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  const tous = documents ?? [];
  // Les 7 dossiers du projet (dépôt possible), puis les dossiers « montage
  // bancaire » (Éco-PTZ collectif, ANAH…) qui n'apparaissent que s'ils
  // contiennent une pièce - on y dépose depuis « Documents à produire ».
  const extras = [...new Set(tous.map((d) => d.dossier))]
    .filter((f) => !(DOSSIERS as readonly string[]).includes(f))
    .sort((a, b) => a.localeCompare(b, "fr"));
  const byFolder = (f: string) => tous.filter((d) => d.dossier === f);
  const folderDocs = openFolder ? byFolder(openFolder) : [];
  const openEstProjet = openFolder != null && (DOSSIERS as readonly string[]).includes(openFolder);

  // Le dépôt (input multiple ou glissé-déposé) ouvre le dialogue de renommage,
  // qui appelle l'upload une fois le nom validé. Les archives zip passent
  // d'abord par le choix du format de dépôt.
  const uploadFiles = (list: FileList | File[], dossier: string) => {
    const files = Array.from(list);
    if (!files.length) return;
    const zips = files.filter(estZip);
    if (zips.length) setDepotZip({ zips, autres: files.filter((f) => !estZip(f)), dossier });
    else setDepot({ files, dossier });
  };

  const selectFolder = (f: string, deposable: boolean) => {
    setOpenFolder(openFolder === f ? null : f);
    if (deposable) setUploadFolder(f); // le sélecteur de dépôt suit le dossier cliqué
  };

  const carte = (f: string, deposable: boolean) => {
    const n = byFolder(f).length;
    const aide = DOSSIER_AIDE[f as keyof typeof DOSSIER_AIDE];
    return (
      <div
        className="file-card"
        key={f}
        onClick={() => selectFolder(f, deposable)}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (deposable) setDragOver(f);
          else e.dataTransfer.dropEffect = "none";
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          setDragOver(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(null);
          if (!deposable) return;
          setUploadFolder(f);
          setOpenFolder(f);
          if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files, f);
        }}
        style={{
          position: "relative",
          cursor: "pointer",
          outline:
            dragOver === f
              ? "2px dashed var(--accent)"
              : openFolder === f
                ? "2px solid var(--accent)"
                : deposable
                  ? "none"
                  : "1px dashed var(--border)",
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
        <Icon name={deposable ? "folder" : "layers"} size={26} className="fc-ico" />
        <div className="fc-name">{f}</div>
        <div className="fc-sub">
          {n} fichier{n > 1 ? "s" : ""}
        </div>
      </div>
    );
  };

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
          <select
            className="edit-inp"
            value={uploadFolder}
            onChange={(e) => setUploadFolder(e.target.value)}
            style={{ maxWidth: 180 }}
          >
            {DOSSIERS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button className="se-btn se-btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={sending}>
            <Icon name="plus" size={15} />
            {sending ? "Dépôt en cours…" : "Déposer"}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.length) void uploadFiles(e.target.files, uploadFolder);
              e.target.value = "";
            }}
          />
        </div>
        <div
          className="p-body"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver((d) => (d && d !== "panel" ? d : "panel"));
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(null);
            if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files, uploadFolder);
          }}
          style={
            dragOver === "panel"
              ? { outline: "2px dashed var(--accent)", outlineOffset: -6, borderRadius: "var(--radius-md)" }
              : undefined
          }
        >
          <div className="file-grid">{DOSSIERS.map((f) => carte(f, true))}</div>
          {extras.length > 0 && (
            <>
              <div className="se-eyebrow" style={{ margin: "18px 0 8px", color: "var(--fg-muted)" }}>
                Pièces fournies à la banque - depuis « Documents à produire », aucun dépôt ici
              </div>
              <div className="file-grid">{extras.map((f) => carte(f, false))}</div>
            </>
          )}
          <p className="se-small" style={{ marginTop: 12, marginBottom: 0, color: "var(--fg-muted)" }}>
            <Icon name="upload" size={13} /> Glissez-déposez un ou plusieurs fichiers ici - directement sur une carte
            pour choisir le dossier. Une archive <b>.zip</b> est acceptée : vous choisissez alors d'en extraire le
            contenu (fichier par fichier) ou de la déposer telle quelle.
          </p>
          {upload.isError && (
            <p className="se-small" style={{ marginTop: 8, marginBottom: 0, color: "var(--color-error-700)" }}>
              Échec de l'envoi : {String((upload.error as Error)?.message ?? upload.error)}
            </p>
          )}
          {supprimer.isError && (
            <p className="se-small" style={{ marginTop: 8, marginBottom: 0, color: "var(--color-error-700)" }}>
              Le retrait a échoué : {String((supprimer.error as Error)?.message ?? supprimer.error)}
            </p>
          )}
          {openFolder && (
            <div style={{ marginTop: 18 }}>
              <div className="se-eyebrow" style={{ marginBottom: 8, color: "var(--fg-muted)" }}>
                {openFolder}
              </div>
              {folderDocs.length === 0 ? (
                <p className="se-small" style={{ color: "var(--fg-muted)" }}>
                  {openEstProjet ? "Dossier vide - déposez un premier fichier." : "Dossier vide pour l'instant."}
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
                    {doc.mien && (
                      <button
                        className="icon-btn"
                        title="Retirer ce fichier (votre dépôt)"
                        disabled={supprimer.isPending}
                        onClick={() => {
                          if (window.confirm(`Retirer « ${doc.name} » ?`)) void supprimer.mutateAsync(doc);
                        }}
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 14, marginBottom: 0 }}>
            <Icon name="eye" size={13} /> Cliquez sur un dossier pour consulter ses pièces : l'œil en donne un aperçu
            sans les télécharger. Le badge indique qui a déposé chaque document (AMO, MOE ou votre équipe) ; vous
            pouvez retirer vos propres dépôts.
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

      {depotZip && (
        <DepotZipDialog
          zips={depotZip.zips}
          autres={depotZip.autres}
          onChoix={(files) => {
            const dossier = depotZip.dossier;
            setDepotZip(null);
            if (files.length) setDepot({ files, dossier });
          }}
          onClose={() => setDepotZip(null)}
        />
      )}

      {depot && (
        <RenommageDialog
          files={depot.files}
          prefixe={c.name}
          dossiers={DOSSIERS}
          dossierInitial={depot.dossier}
          onConfirm={(file, meta) =>
            upload.mutateAsync({ file, dossier: meta.dossier ?? depot.dossier, nameOriginal: meta.nameOriginal })
          }
          onClose={() => setDepot(null)}
        />
      )}
    </>
  );
}
