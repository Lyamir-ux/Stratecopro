// Dialogue de nommage : à chaque dépôt, le déposant décrit le document
// (type, objet, émetteur, date, état) et le nom normalisé se construit
// en direct - {PREFIXE} - {Type} - {Objet} - {ÉMETTEUR} - {Date}[ - {état}].
// Saisie entièrement manuelle (pas d'analyse automatique) ; « Garder le nom
// d'origine » reste toujours possible.
// Éco-PTZ (02/10/2026) : avec `ecoPtz`, le dépôt d'un audit, d'un devis ou d'un
// CCTP / DPGF enchaîne sur le questionnaire des données du CERFA.
// RGE (07/10/2026) : avec `rge`, le dépôt d'un devis ou d'une DPGF de travaux
// ouvre d'abord la vérification RGE de l'entreprise (SIRET lu dans le PDF).
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { QuestionnaireEcoPtzDialog } from "@/components/EcoPtzQuestionnaire";
import { VerificationRgeDialog } from "@/components/VerificationRge";
import { questionnaireEcoPtzPour } from "@/lib/ecoPtzDonnees";
import { extraireTextePdf, trouverSiret } from "@/lib/pdf/extraitDonnees";
import { verificationRgePour } from "@/lib/rge";
import {
  construireNomFichier,
  dossierSuggere,
  extensionDe,
  nomFichierSansAccents,
  renommerFile,
  TYPES_DOCUMENT_TRIES,
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
  /** Émetteur et objet pré-remplis quand le point de dépôt les connaît : dans
   *  l'espace prestataire, la société et la prestation consultée (Best Ryan,
   *  01/10/2026 : « tout de suite proposer, dans les émetteurs, le nom de la société »). */
  emetteurInitial?: string;
  objetInitial?: string;
  /** Si fourni, un sélecteur de dossier de classement est affiché (onglet Fichiers). */
  dossiers?: readonly string[];
  dossierInitial?: string;
  /** Dépose le fichier (déjà renommé). Appelé une fois par fichier validé. */
  /** meta.type : type de document choisi (id TYPES_DOCUMENT) - sert à cocher la
   *  pièce dans toutes les checklists et dossiers qui l'attendent. */
  /** Peut renvoyer la ligne `fichiers` créée : la vérification RGE s'y rattache. */
  onConfirm: (
    file: File,
    meta: { dossier: string | null; nameOriginal: string; type: string }
  ) => Promise<void | { id: string }> | void;
  onClose: () => void;
  /** Dossier d'une copropriété : questionnaire éco-PTZ après le dépôt d'un audit, devis ou CCTP / DPGF. */
  ecoPtz?: { coproId: string; peutValider?: boolean };
  /** Dossier d'une copropriété (AMO) : vérification RGE après le dépôt d'un devis ou d'une DPGF de travaux. */
  rge?: { coproId: string; codePostal?: string | null };
}

export function RenommageDialog({
  files,
  prefixe,
  typeInitial,
  emetteurInitial,
  objetInitial,
  dossiers,
  dossierInitial,
  onConfirm,
  onClose,
  ecoPtz,
  rge,
}: RenommageDialogProps) {
  const [index, setIndex] = useState(0);
  const champsInitiaux = (): Champs => ({
    type: typeInitial ?? "autre",
    objet: objetInitial ?? "",
    emetteur: emetteurInitial ?? "",
    date: "",
    etat: "",
  });
  const [champs, setChamps] = useState<Champs>(champsInitiaux);
  const [dossier, setDossier] = useState<string>(dossierInitial ?? dossiers?.[0] ?? "");
  const [dossierTouche, setDossierTouche] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [questionnaire, setQuestionnaire] = useState<{ mode: "audit" | "travaux"; file: File; emetteur: string } | null>(null);
  const [verifRge, setVerifRge] = useState<{
    file: File;
    fichierId: string | null;
    emetteur: string;
    objet: string;
    date: string;
    ensuite: "audit" | "travaux" | null;
  } | null>(null);

  const file = files[index];

  // Remise à zéro des champs à chaque nouveau fichier de la file
  useEffect(() => {
    setChamps(champsInitiaux());
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

  // sans accent ni caractère spécial : ce que l'utilisateur voit est exactement le nom enregistré
  const nomPropose = nomFichierSansAccents(
    construireNomFichier(
      { prefixe, type: champs.type, objet: champs.objet || null, emetteur: champs.emetteur || null, date: champs.date || null, etat: champs.etat || null },
      extensionDe(file.name)
    )
  );

  const suivant = () => {
    if (index + 1 < files.length) setIndex(index + 1);
    else onClose();
  };

  const deposer = async (nom: string) => {
    setEnvoi(true);
    setErreur(null);
    try {
      const propre = nomFichierSansAccents(nom);
      const depose = propre === file.name ? file : renommerFile(file, propre);
      const cree = await onConfirm(depose, {
        dossier: dossiers ? dossier : null,
        nameOriginal: file.name,
        type: champs.type,
      });
      const mode = ecoPtz ? questionnaireEcoPtzPour(champs.type) : null;
      if (rge && verificationRgePour(champs.type))
        setVerifRge({
          file: depose,
          fichierId: (cree as { id?: string } | undefined)?.id ?? null,
          emetteur: champs.emetteur,
          objet: champs.objet,
          date: champs.date,
          ensuite: mode,
        });
      else if (mode) setQuestionnaire({ mode, file: depose, emetteur: champs.emetteur });
      else suivant();
    } catch (e) {
      setErreur(String((e as Error)?.message ?? e));
    } finally {
      setEnvoi(false);
    }
  };

  if (verifRge && rge)
    return (
      <VerificationRgeDialog
        nomFichier={verifRge.file.name}
        lireSiret={async () =>
          /pdf$/i.test(verifRge.file.type || verifRge.file.name) ? trouverSiret(await extraireTextePdf(verifRge.file, 6)) : null
        }
        nomInitial={verifRge.emetteur}
        objet={verifRge.objet}
        dateDocument={verifRge.date}
        codePostalCopro={rge.codePostal}
        dossier={{ coproId: rge.coproId, prefixe, fichierId: verifRge.fichierId }}
        libelleFermer={verifRge.ensuite || index + 1 < files.length ? "Continuer" : "Terminer"}
        onClose={() => {
          const { ensuite, file: depose, emetteur } = verifRge;
          setVerifRge(null);
          if (ensuite && ecoPtz) setQuestionnaire({ mode: ensuite, file: depose, emetteur });
          else suivant();
        }}
      />
    );

  if (questionnaire && ecoPtz)
    return (
      <QuestionnaireEcoPtzDialog
        coproId={ecoPtz.coproId}
        mode={questionnaire.mode}
        fichier={questionnaire.file}
        emetteur={questionnaire.emetteur}
        peutValider={ecoPtz.peutValider}
        onClose={() => {
          setQuestionnaire(null);
          suivant();
        }}
      />
    );

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

      <div className="renommage-grille">
        <div className="cs-field">
          <label>Type de document</label>
          <select className="edit-inp" style={{ maxWidth: "none", width: "100%" }} value={champs.type} onChange={(e) => set("type", e.target.value)}>
            {TYPES_DOCUMENT_TRIES.map((t) => (
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
