// Import Excel/CSV des lots : parse (SheetJS) → mapping des colonnes → aperçu avec erreurs → validation.
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { useImportLots } from "@/api/donnees";
import {
  buildRows,
  COLUMN_ROLES,
  guessMapping,
  tantiemeColumns,
  type ColumnRole,
} from "@/lib/importLots";

interface Props {
  coproId: string;
  hasExistingLots: boolean;
  onClose: () => void;
}

export function ImportLotsDialog({ coproId, hasExistingLots, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<ColumnRole[]>([]);
  const [replace, setReplace] = useState(false);
  const importLots = useImportLots(coproId);

  const onFile = async (f: File) => {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    if (rows.length < 2) return;
    const hdr = (rows[0] as unknown[]).map((h) => String(h ?? ""));
    setFileName(f.name);
    setHeaders(hdr);
    setData(rows.slice(1) as unknown[][]);
    setMapping(guessMapping(hdr));
  };

  const { rows, errors } = useMemo(
    () => (data.length ? buildRows(data, mapping, headers) : { rows: [], errors: [] }),
    [data, mapping, headers]
  );
  const tanCols = useMemo(() => tantiemeColumns(mapping, headers), [mapping, headers]);
  const canImport = rows.length > 0 && mapping.includes("num") && !importLots.isPending;

  const doImport = async () => {
    await importLots.mutateAsync({ rows, replace });
    onClose();
  };

  return (
    <Modal title="Importer les lots & tantièmes" onClose={onClose} width={760}>
      {!fileName ? (
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: "2px dashed var(--border-strong)",
            borderRadius: "var(--radius-lg)",
            padding: "44px 20px",
            textAlign: "center",
            cursor: "pointer",
            color: "var(--fg2)",
          }}
        >
          <Icon name="upload" size={28} style={{ color: "var(--color-primary-500)" }} />
          <p style={{ margin: "12px 0 4px", fontWeight: 600 }}>Choisir un fichier .xlsx ou .csv</p>
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
            Colonnes reconnues : n° de lot, bâtiment, copropriétaire, adresse mail, téléphone, adresse postale,
            usage, et une colonne par clé de tantièmes — l'en-tête de la colonne devient le nom de la clé.
            <br />
            La première ligne doit contenir les en-têtes.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="import-note">
            <Icon name="fileCheck" size={16} />
            <span>
              <b>{fileName}</b> · {data.length} lignes lues, {rows.length} lots valides
              {errors.length > 0 && `, ${errors.length} en erreur`}
            </span>
            <button onClick={() => { setFileName(null); setData([]); }} aria-label="Changer de fichier">
              <Icon name="x" size={14} />
            </button>
          </div>

          <div>
            <div className="se-eyebrow" style={{ marginBottom: 8, color: "var(--fg-muted)" }}>
              Correspondance des colonnes
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
              {headers.map((h, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={h}>
                    {h || `Colonne ${i + 1}`}
                  </span>
                  <select
                    className="edit-inp"
                    value={mapping[i]}
                    onChange={(e) =>
                      setMapping((m) => m.map((r, j) => (j === i ? (e.target.value as ColumnRole) : r)))
                    }
                  >
                    {COLUMN_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {errors.length > 0 && (
            <div
              style={{
                background: "var(--color-error-50)",
                borderRadius: "var(--radius-md)",
                padding: "10px 14px",
                fontSize: 13,
                color: "var(--color-error-700)",
                maxHeight: 120,
                overflowY: "auto",
              }}
            >
              {errors.slice(0, 20).map((e, i) => (
                <div key={i}>
                  Ligne {e.line} : {e.message}
                </div>
              ))}
              {errors.length > 20 && <div>… et {errors.length - 20} autres</div>}
            </div>
          )}
          {rows.length > 0 && (
            <div className="tablewrap" style={{ maxHeight: 220, overflowY: "auto" }}>
              <table className="dossiers" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Bâtiment</th>
                    <th>Copropriétaire</th>
                    <th>Mail</th>
                    <th>Tél.</th>
                    <th>Usage</th>
                    {tanCols.map((tc) => (
                      <th key={tc.index}>{tc.code}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r) => (
                    <tr key={r.num} style={{ cursor: "default" }}>
                      <td className="mono">{r.num}</td>
                      <td>{r.batiment ?? "—"}</td>
                      <td>{r.coproprietaire ?? "—"}</td>
                      <td>{r.email ?? "—"}</td>
                      <td className="mono">{r.telephone ?? "—"}</td>
                      <td>{r.usage}</td>
                      {tanCols.map((tc) => (
                        <td key={tc.index} className="mono">
                          {r.tantiemes[tc.code]?.toLocaleString("fr-FR") ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && (
                <p className="se-small" style={{ color: "var(--fg-muted)", padding: "6px 10px" }}>
                  Aperçu limité aux 50 premières lignes — les {rows.length} lots seront importés.
                </p>
              )}
            </div>
          )}

          {hasExistingLots && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Remplacer les lots existants (sinon, mise à jour par n° de lot)
            </label>
          )}
          {importLots.isError && (
            <p style={{ color: "var(--color-error-700)", fontSize: 13.5, margin: 0 }}>
              Échec de l'import : {String((importLots.error as Error)?.message ?? importLots.error)}
            </p>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="se-btn se-btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button className="se-btn se-btn-primary" disabled={!canImport} onClick={() => void doImport()}>
              <Icon name="upload" size={16} />
              {importLots.isPending ? "Import en cours…" : `Importer ${rows.length} lots`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
