// Aperçu d'un document du bucket copro-files, sans téléchargement.
// Partagé par l'onglet Fichiers de l'espace AMO et celui de l'espace syndic.
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { estVisualisable, urlSigneeFichier } from "@/api/fichiers";

export function ApercuDocument({
  name,
  path,
  onClose,
  onTelecharger,
}: {
  name: string;
  path: string;
  onClose: () => void;
  onTelecharger: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [erreur, setErreur] = useState(false);
  // Un tableur ou un document Word ne s'affiche pas dans un cadre : on le dit
  // franchement plutôt que de présenter un aperçu vide.
  const affichable = estVisualisable(name);

  useEffect(() => {
    if (!affichable) return;
    let vivant = true;
    urlSigneeFichier(path)
      .then((u) => vivant && setUrl(u))
      .catch(() => vivant && setErreur(true));
    return () => {
      vivant = false;
    };
  }, [path, affichable]);

  return (
    <Modal title={name} onClose={onClose} width={980}>
      <div
        style={{
          height: affichable ? "72vh" : undefined,
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
        }}
      >
        {!affichable ? (
          <p className="se-small" style={{ color: "var(--fg-muted)", padding: 20, margin: 0 }}>
            Ce format ne s'affiche pas dans le navigateur - téléchargez le document pour l'ouvrir dans votre logiciel.
          </p>
        ) : erreur ? (
          <p className="se-small" style={{ color: "var(--color-error-700)", padding: 20, margin: 0 }}>
            Aperçu indisponible. Téléchargez le document pour l'ouvrir.
          </p>
        ) : url ? (
          <iframe src={url} title={name} style={{ width: "100%", height: "100%", border: 0 }} />
        ) : (
          <p className="se-small" style={{ color: "var(--fg-muted)", padding: 20, margin: 0 }}>
            Chargement de l'aperçu…
          </p>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
        <button className="se-btn se-btn-secondary btn-sm" onClick={onTelecharger}>
          <Icon name="download" size={15} />
          Télécharger
        </button>
      </div>
    </Modal>
  );
}
