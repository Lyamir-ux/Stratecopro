// Import d'un classeur « Plan de financement définitif » (nomenclature chef de projet) :
// lecture SheetJS → reconnaissance des onglets PF + lots → contrôles fichier ↔ recalcul → création.
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/ui";
import { fmtEuroFull } from "@/lib/format";
import { importPlanDefinitif, type ImportPlanResult } from "@/lib/finance/importPlanDefinitif";
import { useCreatePlanDefinitif } from "@/api/planDefinitif";

interface Props {
  coproId: string;
  /** Nom du dossier - préfixe du classeur archivé dans l'onglet Fichiers. */
  coproNom?: string;
  onClose: () => void;
}

export function ImportPlanDefinitifDialog({ coproId, coproNom, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportPlanResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const create = useCreatePlanDefinitif(coproId);

  const onFile = async (f: File) => {
    setParseError(null);
    setResult(null);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      setResult(importPlanDefinitif(wb));
      setFileName(f.name);
      setFile(f);
    } catch (e) {
      setFileName(f.name);
      setParseError(e instanceof Error ? e.message : String(e));
    }
  };

  const doImport = async () => {
    if (!result) return;
    const nom = result.data.infos.nomCopro
      ? `PF définitif - ${result.data.infos.nomCopro}`
      : "Plan de financement définitif";
    const row = await create.mutateAsync({
      nom,
      data: result.data,
      sourceFichier: fileName ?? undefined,
      file: file ?? undefined,
      coproNom,
    });
    onClose();
    navigate(`/copros/${coproId}/plan-definitif/${row.id}`);
  };

  const controlesKo = result?.controles.filter((c) => !c.ok) ?? [];

  return (
    <Modal title="Importer un plan de financement définitif" onClose={onClose} width={780}>
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
          <p style={{ margin: "12px 0 4px", fontWeight: 600 }}>Choisir le classeur .xlsx du plan de financement</p>
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
            Nomenclature attendue : onglets « PF définitif Eco PTZ collectif / individuel »
            <br />+ un onglet par lot de travaux avec la colonne « Retenu » (assiette MaPrimeRénov').
            <br />Le classeur source est archivé dans l'onglet Fichiers (dossier Plans de financement).
            </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
          />
        </div>
      ) : parseError ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              background: "var(--color-error-50)",
              borderRadius: "var(--radius-md)",
              padding: "12px 14px",
              fontSize: 13.5,
              color: "var(--color-error-700)",
            }}
          >
            <b>{fileName}</b> : {parseError}
          </div>
          <button className="se-btn se-btn-secondary" onClick={() => { setFileName(null); setParseError(null); }}>
            Choisir un autre fichier
          </button>
        </div>
      ) : result ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="import-note">
            <Icon name="fileCheck" size={16} />
            <span>
              <b>{fileName}</b> · {result.data.lots.length} lots ·{" "}
              {result.data.lots.reduce((s, l) => s + l.lignes.length, 0)} lignes de devis ·{" "}
              {result.data.moe.length} lignes MOE · {result.data.aides.length} aides
            </span>
            <button onClick={() => { setFileName(null); setResult(null); }} aria-label="Changer de fichier">
              <Icon name="x" size={14} />
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Badge kind={controlesKo.length === 0 ? "success" : "warn"}>
              {controlesKo.length === 0
                ? `${result.controles.length} contrôles fichier ↔ recalcul : tous conformes`
                : `${controlesKo.length} contrôle${controlesKo.length > 1 ? "s" : ""} en écart sur ${result.controles.length}`}
            </Badge>
            <span className="se-small" style={{ color: "var(--fg-muted)" }}>
              {result.data.infos.nomCopro} · {result.data.infos.nbLogements} logements
            </span>
          </div>

          {(controlesKo.length > 0 || result.avertissements.length > 0) && (
            <div
              style={{
                background: "var(--color-warning-50)",
                borderRadius: "var(--radius-md)",
                padding: "10px 14px",
                fontSize: 13,
                color: "var(--color-warning-700)",
                maxHeight: 150,
                overflowY: "auto",
              }}
            >
              {result.avertissements.map((a, i) => (
                <div key={i}>• {a}</div>
              ))}
            </div>
          )}

          <div className="tablewrap" style={{ maxHeight: 240, overflowY: "auto" }}>
            <table className="dossiers" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th>Contrôle</th>
                  <th style={{ textAlign: "right" }}>Fichier</th>
                  <th style={{ textAlign: "right" }}>Recalcul logiciel</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {result.controles.map((c, i) => (
                  <tr key={i} style={{ cursor: "default" }}>
                    <td>{c.libelle}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{fmtEuroFull(c.fichier)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{fmtEuroFull(c.recalcule)}</td>
                    <td>
                      <Icon
                        name={c.ok ? "checkCircle" : "alert"}
                        size={15}
                        style={{ color: c.ok ? "var(--color-success-500)" : "var(--color-warning-700)" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {create.isError && (
            <p style={{ color: "var(--color-error-700)", fontSize: 13.5, margin: 0 }}>
              Échec de l'import : {String((create.error as Error)?.message ?? create.error)}
            </p>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="se-btn se-btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button className="se-btn se-btn-primary" disabled={create.isPending} onClick={() => void doImport()}>
              <Icon name="upload" size={16} />
              {create.isPending ? "Import en cours…" : "Importer et ouvrir l'éditeur"}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
