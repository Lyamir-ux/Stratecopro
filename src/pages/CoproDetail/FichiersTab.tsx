// Onglet Fichiers — porté de detail.jsx (FichiersTab), branché sur Storage + checklists réelles.
// Chaque dépôt passe par le renommage assisté (analyse documentaire + validation humaine).
import { useRef, useState } from "react";
import { ApercuDocument } from "@/components/ApercuDocument";
import { Icon } from "@/components/Icon";
import { Progress } from "@/components/ui";
import { RenommageDialog } from "@/components/RenommageDialog";
import {
  DOSSIERS,
  downloadFichier,
  estVisualisable,
  useChecklists,
  useDeleteFichier,
  useFichiers,
  useToggleChecklistItem,
  useTogglePartageFichier,
  useUploadFichier,
  type Fichier,
} from "@/api/fichiers";
import type { CoproWithStats } from "@/api/copros";

function fmtSize(n: number | null): string {
  if (n == null) return "";
  if (n > 1e6) return (n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Mo";
  return Math.max(1, Math.round(n / 1e3)) + " Ko";
}

export function FichiersTab({ c }: { c: CoproWithStats }) {
  const { data: fichiers } = useFichiers(c.id);
  const { data: checklists } = useChecklists(c.id);
  const upload = useUploadFichier(c.id);
  const del = useDeleteFichier(c.id);
  const partage = useTogglePartageFichier(c.id);
  const toggle = useToggleChecklistItem(c.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [uploadFolder, setUploadFolder] = useState<string>(DOSSIERS[0]);
  const [openChecklist, setOpenChecklist] = useState<string | null>(null);
  const [apercu, setApercu] = useState<Fichier | null>(null);
  // Glissé-déposé : "panel" = zone générale, sinon nom du dossier survolé
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Fichiers en attente de renommage assisté avant dépôt
  const [depot, setDepot] = useState<{ files: File[]; dossier: string } | null>(null);
  const sending = depot != null;

  const byFolder = (f: string) => (fichiers ?? []).filter((x) => x.dossier === f);
  const folderFiles = openFolder ? byFolder(openFolder) : [];

  // Le dépôt (input multiple ou glissé-déposé) ouvre le dialogue de renommage,
  // qui analyse chaque document et appelle l'upload une fois le nom validé.
  const uploadFiles = (list: FileList | File[], dossier: string) => {
    const files = Array.from(list);
    if (files.length) setDepot({ files, dossier });
  };

  const selectFolder = (f: string) => {
    setOpenFolder(openFolder === f ? null : f);
    setUploadFolder(f); // le sélecteur de dépôt suit le dossier cliqué
  };

  return (
    <div className="detail-grid fade">
      <div className="panel">
        <div className="p-head">
          <Icon name="folder" size={18} />
          <h3>Fichiers du projet</h3>
          <span style={{ flex: 1 }}></span>
          <select className="edit-inp" value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} style={{ maxWidth: 180 }}>
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
          <div className="file-grid">
            {DOSSIERS.map((f) => {
              const n = byFolder(f).length;
              return (
                <div
                  className="file-card"
                  key={f}
                  onClick={() => selectFolder(f)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOver(f);
                  }}
                  onDragLeave={(e) => {
                    e.stopPropagation();
                    setDragOver(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOver(null);
                    setUploadFolder(f);
                    setOpenFolder(f);
                    if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files, f);
                  }}
                  style={{
                    cursor: "pointer",
                    outline:
                      dragOver === f
                        ? "2px dashed var(--accent)"
                        : openFolder === f
                          ? "2px solid var(--accent)"
                          : "none",
                  }}
                >
                  <Icon name="folder" size={26} className="fc-ico" />
                  <div className="fc-name">{f}</div>
                  <div className="fc-sub">
                    {n} fichier{n > 1 ? "s" : ""}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="se-small" style={{ marginTop: 12, marginBottom: 0, color: "var(--fg-muted)" }}>
            <Icon name="upload" size={13} /> Glissez-déposez un ou plusieurs fichiers ici — directement sur une carte
            pour choisir le dossier.
          </p>
          {upload.isError && (
            <p className="se-small" style={{ marginTop: 8, marginBottom: 0, color: "var(--color-error-700)" }}>
              Échec de l'envoi : {String((upload.error as Error)?.message ?? upload.error)}
            </p>
          )}
          {openFolder && (
            <div style={{ marginTop: 18 }}>
              <div className="se-eyebrow" style={{ marginBottom: 8, color: "var(--fg-muted)" }}>
                {openFolder}
              </div>
              {folderFiles.length === 0 ? (
                <p className="se-small" style={{ color: "var(--fg-muted)" }}>
                  Dossier vide — déposez un premier fichier.
                </p>
              ) : (
                folderFiles.map((f) => (
                  <div key={f.id} className="task-row" style={{ padding: "9px 4px", borderBottom: "1px solid var(--border)" }}>
                    <Icon name="fileText" size={16} style={{ color: "var(--color-secondary-500)" }} />
                    <div>
                      <div className="t-title" style={{ fontSize: 13 }}>
                        {f.name}
                      </div>
                      <div className="t-copro">
                        {fmtSize(f.size)}
                        {f.partage_copro && " · visible au portail copropriétaires"}
                      </div>
                    </div>
                    <span className="spacer"></span>
                    <button
                      className="icon-btn"
                      title={f.partage_copro ? "Ne plus partager aux copropriétaires" : "Partager aux copropriétaires (portail)"}
                      style={f.partage_copro ? { color: "var(--color-primary-700)" } : undefined}
                      onClick={() => void partage.mutateAsync({ id: f.id, partage: !f.partage_copro })}
                    >
                      <Icon name="share" size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      title={
                        estVisualisable(f.name)
                          ? "Aperçu sans téléchargement"
                          : "Ce format ne s'affiche pas dans le navigateur"
                      }
                      onClick={() => setApercu(f)}
                    >
                      <Icon name="eye" size={16} />
                    </button>
                    <button className="icon-btn" title="Télécharger" onClick={() => void downloadFichier(f)}>
                      <Icon name="download" size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Supprimer"
                      onClick={() => {
                        if (window.confirm(`Supprimer « ${f.name} » ?`)) void del.mutateAsync(f);
                      }}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 14 }}>
            <Icon name="share" size={13} /> La flèche publie le fichier sur le <b>portail des copropriétaires</b> ;
            l'œil en donne un aperçu sans le télécharger. Le syndic, lui, co-gère le dossier : il voit l'ensemble des
            documents déposés ici, partagés ou non.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="p-head">
          <Icon name="clipboard" size={18} />
          <h3>Checklists de pièces</h3>
        </div>
        <div className="p-body">
          {(checklists ?? []).map((cl) => {
            const done = cl.items.filter((i) => i.done).length;
            const open = openChecklist === cl.id;
            return (
              <div key={cl.id} style={{ marginBottom: 15 }}>
                <div
                  style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 6, cursor: "pointer" }}
                  onClick={() => setOpenChecklist(open ? null : cl.id)}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
                    {cl.label}
                  </span>
                  <span style={{ fontWeight: 700, color: done === cl.items.length ? "var(--color-success-700)" : "var(--fg2)" }}>
                    {done}/{cl.items.length}
                  </span>
                </div>
                <Progress value={cl.items.length ? (done / cl.items.length) * 100 : 0} />
                {open && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    {cl.items.map((it) => (
                      <label key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={it.done}
                          onChange={(e) => void toggle.mutateAsync({ id: it.id, done: e.target.checked })}
                        />
                        <span style={{ textDecoration: it.done ? "line-through" : "none", color: it.done ? "var(--fg-muted)" : "var(--fg1)" }}>
                          {it.label}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {apercu && (
        <ApercuDocument
          name={apercu.name}
          path={apercu.storage_path}
          onClose={() => setApercu(null)}
          onTelecharger={() => void downloadFichier(apercu)}
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
    </div>
  );
}
