// Onglet « Montage bancaire » (syndic) - préparation du dossier de la
// copropriété pour la banque et les assureurs, montage par montage. Chaque
// montage disponible (éco-PTZ collectif CEGEE, dommages-ouvrage ROEDERER) est
// un parcours en étapes décrit dans le registre PARCOURS. Chaque étape liste
// les documents attendus : le syndic dépose les siens (clic ou glissé-déposé
// directement sur la ligne du document), les pièces Strat Eco / maîtrise
// d'œuvre sont affichées pour suivi.
import { useMemo, useRef, useState, type DragEvent } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Progress } from "@/components/ui";
import { RenommageDialog } from "@/components/RenommageDialog";
import { fmtDate } from "@/lib/format";
import { useAuth } from "@/auth/AuthProvider";
import {
  MONTAGES,
  PARCOURS,
  docFiles,
  downloadMontageFile,
  etapeProgress,
  useFormulairesMontage,
  useMontageDocs,
  useRemoveMontageFile,
  useSetDocNonApplicable,
  useUploadMontageDoc,
  type DocDef,
  type EtapeDef,
  type FormulaireType,
  type MontageDoc,
  type MontageFormulaire,
  type MontageId,
} from "@/api/montage";
import type { SyndicCopro } from "@/api/syndic";
import { FormulaireMontage } from "./MontageForms";

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " Ko";
  return (bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Mo";
}

const EXTENSIONS_OK = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"];
const extensionOk = (name: string) => EXTENSIONS_OK.some((e) => name.toLowerCase().endsWith(e));

export function MontageTabSyndic({ c }: { c: SyndicCopro }) {
  const [montage, setMontage] = useState<MontageId | null>(null);

  if (montage && PARCOURS[montage])
    return <MontageParcours c={c} montage={montage} onBack={() => setMontage(null)} />;

  return (
    <div className="fade">
      <p className="se-body" style={{ marginTop: 0, color: "var(--fg2)", maxWidth: 720 }}>
        Pour chaque dispositif de financement du projet, la banque et les financeurs attendent un dossier
        documentaire de la copropriété. Choisissez un montage pour voir ce qu'il reste à préparer.
      </p>
      <div className="montage-grid">
        {MONTAGES.map((m) => (
          <button
            key={m.id}
            className={"montage-card" + (m.dispo ? "" : " off")}
            disabled={!m.dispo}
            onClick={() => m.dispo && setMontage(m.id)}
          >
            <span className="mc-ico">
              <Icon name={m.icon} size={22} />
            </span>
            <span className="mc-body">
              <span className="mc-name">{m.label}</span>
              <span className="mc-sub">{m.sub}</span>
            </span>
            {m.dispo ? (
              <Icon name="chevronRight" size={18} />
            ) : (
              <Badge kind="neutral">Bientôt disponible</Badge>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ========== Parcours générique d'un montage (étapes + documents) ==========

function MontageParcours({
  c,
  montage,
  onBack,
}: {
  c: SyndicCopro;
  montage: MontageId;
  onBack: () => void;
}) {
  const parcours = PARCOURS[montage]!;
  const { profile } = useAuth();
  const isAmo = profile?.role === "amo";
  const { data: docs, isLoading } = useMontageDocs(c.id, montage);
  const { data: forms } = useFormulairesMontage(c.id);
  const upload = useUploadMontageDoc(c.id, montage);
  const removeFile = useRemoveMontageFile(c.id, montage);
  const setNa = useSetDocNonApplicable(c.id, montage);

  const [openEtape, setOpenEtape] = useState<string>(parcours.etapes[0].id);
  const [formOpen, setFormOpen] = useState<FormulaireType | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingDoc, setPendingDoc] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  // Fichier en attente de renommage assisté avant dépôt
  const [depot, setDepot] = useState<{ docKey: string; file: File } | null>(null);

  const docsByKey = useMemo(
    () => new Map((docs ?? []).map((d) => [d.doc_key, d])),
    [docs]
  );
  const formsByType = useMemo(
    () => new Map((forms ?? []).map((f) => [f.type as FormulaireType, f])),
    [forms]
  );

  if (formOpen) return <FormulaireMontage c={c} type={formOpen} onBack={() => setFormOpen(null)} />;
  if (isLoading) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  const totaux = parcours.etapes.reduce(
    (acc, e) => {
      const p = etapeProgress(e, docsByKey, formsByType);
      return { done: acc.done + p.done, total: acc.total + p.total };
    },
    { done: 0, total: 0 }
  );

  const pick = (docKey: string) => {
    setPendingDoc(docKey);
    inputRef.current?.click();
  };
  const onFile = (file: File | undefined) => {
    if (file && pendingDoc) setDepot({ docKey: pendingDoc, file });
    setPendingDoc(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  const onDrop = (docKey: string, file: File) => {
    if (!extensionOk(file.name)) {
      setDropError(`« ${file.name} » n'est pas accepté - formats attendus : PDF, image, Word ou Excel.`);
      return;
    }
    setDropError(null);
    setDepot({ docKey, file });
  };

  return (
    <div className="fade">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
        style={{ display: "none" }}
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <button className="se-btn se-btn-ghost btn-sm" onClick={onBack}>
          <Icon name="chevronLeft" size={15} />
          Montages
        </button>
        <span style={{ flex: 1 }}></span>
        <span className="se-small" style={{ color: "var(--fg-muted)" }}>
          {totaux.done}/{totaux.total} éléments prêts
        </span>
        <div style={{ width: 130 }}>
          <Progress value={totaux.total ? (totaux.done / totaux.total) * 100 : 0} />
        </div>
      </div>

      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 21, margin: "10px 0 4px" }}>
        {parcours.titre}
      </h2>
      <p className="se-small" style={{ margin: "0 0 18px", color: "var(--fg-muted)", maxWidth: 720 }}>
        {parcours.intro}
      </p>

      {parcours.etapes.map((etape) => (
        <EtapePanel
          key={etape.id}
          etape={etape}
          open={openEtape === etape.id}
          onToggle={() => setOpenEtape(openEtape === etape.id ? "" : etape.id)}
          docsByKey={docsByKey}
          formsByType={formsByType}
          isAmo={isAmo}
          busyDoc={upload.isPending ? pendingDoc : null}
          onPick={pick}
          onDrop={onDrop}
          onOpenForm={setFormOpen}
          onRemove={(docKey, path) => removeFile.mutate({ docKey, path })}
          onToggleNa={(docKey, na) => setNa.mutate({ docKey, nonApplicable: na })}
        />
      ))}

      {dropError && (
        <p className="se-small" style={{ color: "var(--color-error-700)" }}>{dropError}</p>
      )}
      {(upload.isError || removeFile.isError) && (
        <p className="se-small" style={{ color: "var(--color-error-700)" }}>
          L'opération a échoué. Vérifiez le fichier et réessayez.
        </p>
      )}

      {depot && (
        <RenommageDialog
          files={[depot.file]}
          prefixe={c.name}
          onConfirm={(file, meta) =>
            upload.mutateAsync({ docKey: depot.docKey, file, nameOriginal: meta.nameOriginal })
          }
          onClose={() => setDepot(null)}
        />
      )}
    </div>
  );
}

function EtapePanel({
  etape,
  open,
  onToggle,
  docsByKey,
  formsByType,
  isAmo,
  busyDoc,
  onPick,
  onDrop,
  onOpenForm,
  onRemove,
  onToggleNa,
}: {
  etape: EtapeDef;
  open: boolean;
  onToggle: () => void;
  docsByKey: Map<string, MontageDoc>;
  formsByType: Map<FormulaireType, MontageFormulaire>;
  isAmo: boolean;
  busyDoc: string | null;
  onPick: (docKey: string) => void;
  onDrop: (docKey: string, file: File) => void;
  onOpenForm: (t: FormulaireType) => void;
  onRemove: (docKey: string, path: string) => void;
  onToggleNa: (docKey: string, na: boolean) => void;
}) {
  const p = etapeProgress(etape, docsByKey, formsByType);
  const complete = p.done >= p.total && p.total > 0;

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <button className="mstep-head" onClick={onToggle}>
        <span className={"mstep-num" + (complete ? " done" : "")}>
          {complete ? <Icon name="check" size={16} /> : etape.num}
        </span>
        <span className="mstep-label">{etape.label}</span>
        <span style={{ flex: 1 }}></span>
        <Badge kind={complete ? "success" : "neutral"}>
          {p.done}/{p.total}
        </Badge>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={17} />
      </button>

      {open && (
        <div className="p-body" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="se-small" style={{ marginTop: 0, color: "var(--fg-muted)" }}>
            {etape.intro}
          </p>

          {(etape.formulaires ?? []).map((f) => {
            const saved = formsByType.get(f.type);
            const transmis = saved?.statut === "transmis";
            return (
              <div
                key={f.type}
                className={"dropzone" + (transmis ? " filled" : "")}
                style={{ marginBottom: 12, cursor: "pointer" }}
                onClick={() => onOpenForm(f.type)}
              >
                <span className="dz-ico">
                  <Icon name={transmis ? "check" : "edit"} size={18} />
                </span>
                <div>
                  <div className="dz-name">{f.name}</div>
                  <div className="dz-hint">
                    {transmis
                      ? "Transmise à Strat Eco le " + fmtDate(saved!.updated_at)
                      : saved
                        ? "Brouillon enregistré le " + fmtDate(saved.updated_at)
                        : f.hint}
                  </div>
                </div>
                <span className="spacer"></span>
                <span className="dz-action">{transmis ? "Consulter / modifier" : "Compléter"}</span>
              </div>
            );
          })}

          {etape.groupes.map((g, gi) => (
            <div key={gi} style={{ marginTop: g.titre ? 18 : 0 }}>
              {g.titre && <div className="se-eyebrow" style={{ marginBottom: 4 }}>{g.titre}</div>}
              {g.note && (
                <p className="se-small" style={{ margin: "0 0 10px", color: "var(--fg-muted)" }}>
                  {g.note}
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {g.docs.map((d) => (
                  <DocRow
                    key={d.key + gi}
                    def={d}
                    row={docsByKey.get(d.key)}
                    isAmo={isAmo}
                    busy={busyDoc === d.key}
                    onPick={() => onPick(d.key)}
                    onDrop={(file) => onDrop(d.key, file)}
                    onRemove={(path) => onRemove(d.key, path)}
                    onToggleNa={(na) => onToggleNa(d.key, na)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const FOURNISSEUR_LABEL: Record<DocDef["fournisseur"], string> = {
  syndic: "À déposer par vos soins",
  amo: "Fourni par Strat Eco",
  moe: "Via la maîtrise d'œuvre",
};

function DocRow({
  def,
  row,
  isAmo,
  busy,
  onPick,
  onDrop,
  onRemove,
  onToggleNa,
}: {
  def: DocDef;
  row: MontageDoc | undefined;
  isAmo: boolean;
  busy: boolean;
  onPick: () => void;
  onDrop: (file: File) => void;
  onRemove: (path: string) => void;
  onToggleNa: (na: boolean) => void;
}) {
  const files = docFiles(row);
  const na = row?.statut === "non_applicable";
  const depose = files.length > 0;
  const uploadable = def.fournisseur === "syndic" || isAmo;
  const droppable = uploadable && !na && !busy;
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e: DragEvent) => {
    if (!droppable) return;
    e.preventDefault();
    setDragOver(true);
  };
  const handleDrop = (e: DragEvent) => {
    if (!droppable) return;
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onDrop(file);
  };

  return (
    <div
      className={"mdoc" + (depose ? " filled" : "") + (na ? " na" : "") + (dragOver ? " dragover" : "")}
      title={droppable ? "Glissez-déposez votre fichier sur cette ligne, ou cliquez sur le bouton" : undefined}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="mdoc-main">
        <span className="dz-ico">
          <Icon name={depose ? "check" : na ? "x" : "fileText"} size={18} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="dz-name">{def.name}</div>
          {def.hint && <div className="dz-hint">{def.hint}</div>}
          <div className="mdoc-meta">
            <Badge kind={def.fournisseur === "syndic" ? "blue" : "neutral"}>
              {FOURNISSEUR_LABEL[def.fournisseur]}
            </Badge>
            {def.modele && (
              <a className="mdoc-link" href={`/modeles/${def.modele}`} download>
                <Icon name="download" size={13} />
                Modèle
              </a>
            )}
            {def.lien && (
              <a className="mdoc-link" href={def.lien.url} target="_blank" rel="noreferrer">
                <Icon name="share" size={13} />
                {def.lien.label}
              </a>
            )}
          </div>
        </div>
        <span className="spacer"></span>
        {def.conditionnel && !depose && (
          <label className="mdoc-na">
            <input type="checkbox" checked={na} onChange={(e) => onToggleNa(e.target.checked)} />
            Non concerné
          </label>
        )}
        {!na && uploadable && (
          <button className="se-btn se-btn-secondary btn-sm" disabled={busy} onClick={onPick}>
            <Icon name="upload" size={14} />
            {busy ? "Envoi…" : depose ? "Ajouter" : "Téléverser"}
          </button>
        )}
        {!na && !uploadable && !depose && <Badge kind="warn">En attente</Badge>}
      </div>

      {files.length > 0 && (
        <div className="mdoc-files">
          {files.map((f) => (
            <div key={f.path} className="mdoc-file">
              <Icon name="fileCheck" size={14} />
              <span className="fname">{f.name}</span>
              <span className="fmeta">
                {[fmtSize(f.size), fmtDate(f.uploaded_at)].filter(Boolean).join(" · ")}
              </span>
              <button className="icon-btn" title="Télécharger" onClick={() => void downloadMontageFile(f)}>
                <Icon name="download" size={15} />
              </button>
              {uploadable && (
                <button className="icon-btn" title="Retirer" onClick={() => onRemove(f.path)}>
                  <Icon name="trash" size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
