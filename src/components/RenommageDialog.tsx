// Dialogue de nommage : à chaque dépôt, le déposant décrit le document
// (type, objet, émetteur, date, état) et le nom normalisé se construit
// en direct - {PREFIXE} - {Type} - {Objet} - {ÉMETTEUR} - {Date}[ - {état}].
// Saisie entièrement manuelle (pas d'analyse automatique) ; « Garder le nom
// d'origine » reste toujours possible.
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import {
  construireNomFichier,
  dossierSuggere,
  extensionDe,
  renommerFile,
  TYPES_DOCUMENT,
} from "@/lib/nommage";

interface Champs {
  type: string;
  objet: string;
  emetteur: string;
  date: string;
  etat: string;
}

interface RenommageDialogProps {
  files: File[];
  /** Premier segment du nom : nom court de la copro, ou du copropriétaire au portail. */
  prefixe: string | null;
  /** Type présélectionné quand le point de dépôt le connaît déjà (pièce attendue). */
  typeInitial?: string;
  /** Si fourni, un sélecteur de dossier de classement est affiché (onglet Fichiers). */
  dossiers?: readonly string[];
  dossierInitial?: string;
  /** Dépose le fichier (déjà renommé). Appelé une fois par fichier validé. */
  onConfirm: (file: File, meta: { dossier: string | null; nameOriginal: string }) => Promise<void> | void;
  onClose: () => void;
}

export function RenommageDialog({
  files,
  prefixe,
  typeInitial,
  dossiers,
  dossierInitial,
  onConfirm,
  onClose,
}: RenommageDialogProps) {
  const [index, setIndex] = useState(0);
  const [champs, setChamps] = useState<Champs>({ type: typeInitial ?? "autre", objet: "", emetteur: "", date: "", etat: "" });
  const [dossier, setDossier] = useState<string>(dossierInitial ?? dossiers?.[0] ?? "");
  const [dossierTouche, setDossierTouche] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const file = files[index];

  // Remise à zéro des champs à chaque nouveau fichier de la file
  useEffect(() => {
    setChamps({ type: typeInitial ?? "autre", objet: "", emetteur: "", date: "", etat: "" });
    setDossier(dossierInitial ?? dossiers?.[0] ?? "");
    setDossierTouche(false);
    setErreur(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (!file) return null;

  const set = (k: keyof Champs, v: string) => {
    setChamps((c) => {
      const next = { ...c, [k]: v };
      // le dossier suit le type tant que l'utilisateur n'y a pas touché
      if (k === "type" && dossiers && !dossierTouche) {
        const sugg = dossierSuggere(v);
        if (sugg && dossiers.includes(sugg)) setDossier(sugg);
      }
      return next;
    });
  };

  const nomPropose = construireNomFichier(
    { prefixe, type: champs.type, objet: champs.objet || null, emetteur: champs.emetteur || null, date: champs.date || null, etat: champs.etat || null },
    extensionDe(file.name)
  );

  const suivant = () => {
    if (index + 1 < files.length) setIndex(index + 1);
    else onClose();
  };

  const deposer = async (nom: string) => {
    setEnvoi(true);
    setErreur(null);
    try {
      await onConfirm(nom === file.name ? file : renommerFile(file, nom), {
        dossier: dossiers ? dossier : null,
        nameOriginal: file.name,
      });
      suivant();
    } catch (e) {
      setErreur(String((e as Error)?.message ?? e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal
      title={files.length > 1 ? `Dépôt du fichier ${index + 1}/${files.length}` : "Dépôt d'un fichier"}
      onClose={onClose}
      width={620}
      closeOnBackdrop={false} // un clic à côté ne doit pas faire perdre la saisie ni la file de fichiers
    >
      <p className="se-small" style={{ margin: "0 0 14px", color: "var(--fg-muted)" }}>
        <Icon name="fileText" size={13} /> Fichier d'origine : <b>{file.name}</b>
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="cs-field">
          <label>Type de document</label>
          <select className="edit-inp" style={{ maxWidth: "none", width: "100%" }} value={champs.type} onChange={(e) => set("type", e.target.value)}>
            {TYPES_DOCUMENT.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="cs-field">
          <label>
            Objet <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· lot ou prestation</span>
          </label>
          <input
            className="edit-inp"
            style={{ maxWidth: "none", width: "100%" }}
            value={champs.objet}
            placeholder="Isolation ITE, Maîtrise d'œuvre…"
            onChange={(e) => set("objet", e.target.value)}
          />
        </div>
        <div className="cs-field">
          <label>Émetteur (société)</label>
          <input
            className="edit-inp"
            style={{ maxWidth: "none", width: "100%" }}
            value={champs.emetteur}
            placeholder="Raison sociale"
            onChange={(e) => set("emetteur", e.target.value)}
          />
        </div>
        <div className="cs-field">
          <label>Date du document</label>
          <input
            className="edit-inp"
            style={{ maxWidth: "none", width: "100%" }}
            type="date"
            value={champs.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </div>
        <div className="cs-field">
          <label>
            État <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· optionnel</span>
          </label>
          <input
            className="edit-inp"
            style={{ maxWidth: "none", width: "100%" }}
            value={champs.etat}
            placeholder="signé, V2, avenant 1…"
            onChange={(e) => set("etat", e.target.value)}
          />
        </div>
        {dossiers && (
          <div className="cs-field">
            <label>Dossier de classement</label>
            <select
              className="edit-inp"
              style={{ maxWidth: "none", width: "100%" }}
              value={dossier}
              onChange={(e) => {
                setDossier(e.target.value);
                setDossierTouche(true);
              }}
            >
              {dossiers.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: "10px 14px",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-soft)",
          border: "1px solid var(--border)",
          fontSize: 13.5,
          fontWeight: 600,
          wordBreak: "break-word",
        }}
      >
        <span style={{ color: "var(--fg-muted)", fontWeight: 400, fontSize: 12 }}>Sera enregistré sous :</span>
        <br />
        {nomPropose}
      </div>

      {erreur && (
        <p className="se-small" style={{ marginTop: 10, marginBottom: 0, color: "var(--color-error-700)" }}>
          Échec du dépôt : {erreur}
        </p>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <button className="se-btn se-btn-primary" disabled={envoi} onClick={() => void deposer(nomPropose)}>
          <Icon name="check" size={15} />
          {envoi ? "Dépôt…" : "Déposer sous ce nom"}
        </button>
        <button className="se-btn se-btn-secondary" disabled={envoi} onClick={() => void deposer(file.name)}>
          Garder le nom d'origine
        </button>
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-ghost" disabled={envoi} onClick={onClose}>
          Annuler
        </button>
      </div>
    </Modal>
  );
}
