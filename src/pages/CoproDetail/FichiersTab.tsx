// Onglet Fichiers — porté de detail.jsx (FichiersTab), branché sur Storage + checklists réelles.
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Progress } from "@/components/ui";
import {
  DOSSIERS,
  downloadFichier,
  useChecklists,
  useDeleteFichier,
  useFichiers,
  useToggleChecklistItem,
  useTogglePartageFichier,
  useUploadFichier,
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

  const byFolder = (f: string) => (fichiers ?? []).filter((x) => x.dossier === f);
  const folderFiles = openFolder ? byFolder(openFolder) : [];

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
          <button className="se-btn se-btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
            <Icon name="plus" size={15} />
            {upload.isPending ? "Envoi…" : "Déposer"}
          </button>
          <input
            ref={fileRef}
            type="file"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.[0]) void upload.mutateAsync({ file: e.target.files[0], dossier: uploadFolder });
              e.target.value = "";
            }}
          />
        </div>
        <div className="p-body">
          <div className="file-grid">
            {DOSSIERS.map((f) => {
              const n = byFolder(f).length;
              return (
                <div
                  className="file-card"
                  key={f}
                  onClick={() => setOpenFolder(openFolder === f ? null : f)}
                  style={{ cursor: "pointer", outline: openFolder === f ? "2px solid var(--accent)" : "none" }}
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
                        {f.partage_copro && " · visible au portail"}
                      </div>
                    </div>
                    <span className="spacer"></span>
                    <button
                      className="icon-btn"
                      title={f.partage_copro ? "Ne plus partager aux copropriétaires" : "Partager aux copropriétaires (portail)"}
                      style={f.partage_copro ? { color: "var(--color-primary-700)" } : undefined}
                      onClick={() => void partage.mutateAsync({ id: f.id, partage: !f.partage_copro })}
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
    </div>
  );
}
