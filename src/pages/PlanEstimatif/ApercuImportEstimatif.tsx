// Aperçu de l'import d'un PF estimatif (une colonne par scénario) : contrôles
// fichier ↔ recalcul scénario par scénario, puis création des scénarios.
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtEuroFull } from "@/lib/format";
import type { ImportEstimatifResult } from "@/lib/finance/planEstimatif";
import { useCreatePlansEstimatifs } from "@/api/planDefinitif";

interface Props {
  coproId: string;
  coproNom?: string;
  fileName: string;
  file: File | null;
  result: ImportEstimatifResult;
  onReset: () => void;
  onClose: () => void;
}

export function ApercuImportEstimatif({ coproId, coproNom, fileName, file, result, onReset, onClose }: Props) {
  const navigate = useNavigate();
  const create = useCreatePlansEstimatifs(coproId);
  const { scenarios, controles, avertissements } = result;
  const ko = controles.filter((c) => !c.ok);
  // Tableau des contrôles : une ligne par contrôle, une colonne par scénario
  const libelles = [...new Set(controles.map((c) => c.libelle))];
  const d0 = scenarios[0]?.data;

  const doImport = async () => {
    const groupe = await create.mutateAsync({
      scenarios,
      sourceFichier: fileName,
      file: file ?? undefined,
      coproNom,
    });
    onClose();
    navigate(`/copros/${coproId}/plan-estimatif/${groupe}`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="import-note">
        <Icon name="fileCheck" size={16} />
        <span>
          <b>{fileName}</b> · PF estimatif · {scenarios.length} scénario{scenarios.length > 1 ? "s" : ""}
          {d0 ? ` · ${d0.infos.nomCopro} · ${d0.infos.nbLogements} logements` : ""}
        </span>
        <button onClick={onReset} aria-label="Changer de fichier">
          <Icon name="x" size={14} />
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {scenarios.map((s) => (
          <div key={s.ordre} className="se-small" style={{ color: "var(--fg2)" }}>
            <b>Scénario {s.ordre}</b>
            {s.libelle ? ` - ${s.libelle}` : ""} · {s.data.lots.length} lots · {s.data.moe.length} lignes MOE ·{" "}
            {s.data.aides.length} aides
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Badge kind={ko.length === 0 ? "success" : "warn"}>
          {ko.length === 0
            ? `${controles.length} contrôles fichier ↔ recalcul : tous conformes`
            : `${ko.length} contrôle${ko.length > 1 ? "s" : ""} en écart sur ${controles.length}`}
        </Badge>
      </div>

      {avertissements.length > 0 && (
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
          {avertissements.map((a, i) => (
            <div key={i}>• {a}</div>
          ))}
        </div>
      )}

      <div className="tablewrap" style={{ maxHeight: 260, overflowY: "auto" }}>
        <table className="dossiers" style={{ fontSize: 12.5 }}>
          <thead>
            <tr>
              <th>Contrôle (fichier)</th>
              {scenarios.map((s) => (
                <th key={s.ordre} style={{ textAlign: "right" }}>
                  Scénario {s.ordre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {libelles.map((l) => (
              <tr key={l} style={{ cursor: "default" }}>
                <td>{l}</td>
                {scenarios.map((s) => {
                  const c = controles.find((x) => x.libelle === l && x.scenario === s.ordre);
                  return (
                    <td
                      key={s.ordre}
                      className="mono"
                      style={{ textAlign: "right", whiteSpace: "nowrap" }}
                      title={c && !c.ok ? `Recalcul logiciel : ${fmtEuroFull(c.recalcule)}` : undefined}
                    >
                      {c ? (
                        <>
                          {fmtEuroFull(c.fichier)}{" "}
                          <Icon
                            name={c.ok ? "checkCircle" : "alert"}
                            size={13}
                            style={{ color: c.ok ? "var(--color-success-500)" : "var(--color-warning-700)", verticalAlign: -2 }}
                          />
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                  );
                })}
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
          {create.isPending
            ? "Import en cours…"
            : scenarios.length > 1
              ? `Importer les ${scenarios.length} scénarios et comparer`
              : "Importer le scénario"}
        </button>
      </div>
    </div>
  );
}
