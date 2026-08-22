// Dépôt d'une archive zip : au lieu d'imposer le dépôt pdf par pdf, l'équipe
// choisit le format - extraire le contenu (chaque fichier passe ensuite par le
// renommage assisté, comme un dépôt classique) ou déposer l'archive telle
// quelle (un seul fichier .zip dans le dossier).
import { useEffect, useState } from "react";
import JSZip from "jszip";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";

/** Types MIME des formats courants - le navigateur ne renseigne pas le type
 *  des fichiers extraits d'une archive. */
const MIMES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

export const estZip = (f: File) =>
  /\.zip$/i.test(f.name) || f.type === "application/zip" || f.type === "application/x-zip-compressed";

interface Entree {
  zip: string;
  path: string;
  nom: string;
}

export function DepotZipDialog({
  zips,
  autres,
  onChoix,
  onClose,
}: {
  zips: File[];
  /** Fichiers non-zip déposés en même temps - repris tels quels dans la file. */
  autres: File[];
  /** Fichiers retenus (contenu extrait ou archives) - passés au renommage assisté. */
  onChoix: (files: File[]) => void;
  onClose: () => void;
}) {
  // null = lecture des archives en cours
  const [entrees, setEntrees] = useState<Entree[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [extraction, setExtraction] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const all: Entree[] = [];
        for (const f of zips) {
          const zip = await JSZip.loadAsync(f);
          zip.forEach((path, entry) => {
            if (entry.dir) return;
            const nom = path.split("/").pop() ?? path;
            // fichiers système des archives macOS / cachés
            if (path.startsWith("__MACOSX/") || nom.startsWith(".")) return;
            all.push({ zip: f.name, path, nom });
          });
        }
        if (alive) setEntrees(all);
      } catch (e) {
        if (alive) setErreur(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [zips]);

  const extraire = async () => {
    if (!entrees) return;
    setExtraction(true);
    setErreur(null);
    try {
      const files: File[] = [];
      for (const f of zips) {
        const zip = await JSZip.loadAsync(f);
        for (const e of entrees.filter((x) => x.zip === f.name)) {
          const obj = zip.file(e.path);
          if (!obj) continue;
          const blob = await obj.async("blob");
          const ext = e.nom.split(".").pop()?.toLowerCase() ?? "";
          files.push(new File([blob], e.nom, { type: MIMES[ext] ?? "" }));
        }
      }
      onChoix([...files, ...autres]);
    } catch (e) {
      setErreur(String((e as Error)?.message ?? e));
      setExtraction(false);
    }
  };

  const plusieursZips = zips.length > 1;

  return (
    <Modal
      title={plusieursZips ? `Dépôt de ${zips.length} archives zip` : "Dépôt d'une archive zip"}
      onClose={onClose}
      width={560}
      closeOnBackdrop={false}
    >
      <p className="se-small" style={{ margin: "0 0 12px", color: "var(--fg-muted)" }}>
        <Icon name="folder" size={13} />{" "}
        {zips.map((z) => z.name).join(", ")}
        {autres.length > 0 && ` · ${autres.length} autre${autres.length > 1 ? "s" : ""} fichier${autres.length > 1 ? "s" : ""} déposé${autres.length > 1 ? "s" : ""} en même temps`}
      </p>
      <p className="se-body" style={{ marginTop: 0 }}>
        Choisissez le format du dépôt : extraire le contenu de l'archive - chaque fichier passe alors par le
        renommage assisté, un par un - ou conserver l'archive telle quelle.
      </p>
      {erreur && (
        <p className="se-small" style={{ color: "var(--color-error-700)" }}>
          Lecture de l'archive impossible : {erreur}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button
          className="se-btn se-btn-primary"
          disabled={!entrees || entrees.length === 0 || extraction}
          onClick={() => void extraire()}
        >
          <Icon name="upload" size={15} />
          {entrees == null
            ? "Lecture de l'archive…"
            : extraction
              ? "Extraction…"
              : `Extraire et déposer ${entrees.length} fichier${entrees.length > 1 ? "s" : ""}`}
        </button>
        <button
          className="se-btn se-btn-secondary"
          disabled={extraction}
          onClick={() => onChoix([...zips, ...autres])}
        >
          Déposer l'archive telle quelle
        </button>
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-ghost" disabled={extraction} onClick={onClose}>
          Annuler
        </button>
      </div>
      {entrees != null && entrees.length === 0 && !erreur && (
        <p className="se-small" style={{ marginTop: 10, marginBottom: 0, color: "var(--fg-muted)" }}>
          L'archive ne contient aucun fichier lisible - vous pouvez la déposer telle quelle.
        </p>
      )}
    </Modal>
  );
}
