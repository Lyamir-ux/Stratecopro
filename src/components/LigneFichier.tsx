// Une ligne de fichier des onglets Fichiers (AMO et syndic) : nom, détail,
// aperçu, téléchargement et, quand l'utilisateur en a le droit, « Modifier »
// (renommage sur place, extension conservée) et « Supprimer » (feedbacks
// d'Amir du 02/10/2026). Le droit est décidé par l'appelant : AMO hors pièces
// émises par la facturation, syndic sur ses propres dépôts seulement.
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { estVisualisable } from "@/api/fichiers";
import { messageErreur } from "@/lib/erreurs";
import { extensionDe, nomRenomme, nomSansExtension } from "@/lib/nommage";

/** Présentation de la ligne : liste compacte AMO, ou ligne de document syndic. */
const VARIANTES = {
  amo: { ligne: "task-row fichier-ligne", nom: "t-title", detail: "t-copro", icone: 16 },
  syndic: { ligne: "doc-row fichier-ligne", nom: "d-name", detail: "d-sub", icone: 18 },
} as const;

export function LigneFichier({
  variante,
  name,
  detail,
  avant,
  confirmation,
  onApercu,
  onTelecharger,
  onRenommer,
  onSupprimer,
}: {
  variante: keyof typeof VARIANTES;
  name: string;
  detail: ReactNode;
  /** Avant l'aperçu (partage au portail, badge d'origine) - masqué pendant la saisie du nom. */
  avant?: ReactNode;
  /** Question posée avant la suppression. */
  confirmation: string;
  onApercu: () => void;
  onTelecharger: () => void;
  /** Absent = pas de bouton « Modifier ». */
  onRenommer?: (name: string) => Promise<unknown>;
  /** Absent = pas de bouton « Supprimer ». */
  onSupprimer?: () => Promise<unknown>;
}) {
  const v = VARIANTES[variante];
  const [saisie, setSaisie] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const ext = extensionDe(name);

  const fermer = () => {
    setSaisie(null);
    setErreur(null);
  };

  const enregistrer = async () => {
    if (saisie == null || busy || !onRenommer) return;
    const nouveau = nomRenomme(saisie, name);
    if (!nouveau) {
      setErreur("Le nom ne peut pas être vide.");
      return;
    }
    if (nouveau === name) return fermer();
    setBusy(true);
    try {
      await onRenommer(nouveau);
      fermer();
    } catch (e) {
      setErreur(messageErreur(e, "Le fichier n'a pas pu être renommé."));
    } finally {
      setBusy(false);
    }
  };

  const supprimer = async () => {
    if (!onSupprimer || !window.confirm(confirmation)) return;
    setBusy(true);
    setErreur(null);
    try {
      await onSupprimer();
    } catch (e) {
      setErreur(messageErreur(e, "Le fichier n'a pas pu être supprimé."));
      setBusy(false);
    }
  };

  const icone =
    variante === "syndic" ? (
      <span className="d-ico">
        <Icon name="fileText" size={18} />
      </span>
    ) : (
      <Icon name="fileText" size={16} style={{ color: "var(--color-secondary-500)" }} />
    );

  return (
    <div className={v.ligne}>
      {icone}
      {saisie != null ? (
        <div className="fichier-edition">
          <div className="fichier-edition-champ">
            <input
              className="edit-inp"
              autoFocus
              value={saisie}
              // lecture seule (et non désactivé) pendant l'envoi : le champ garde
              // le focus, Échap et Entrée restent actifs après une erreur
              readOnly={busy}
              aria-label="Nouveau nom du fichier"
              onChange={(e) => setSaisie(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void enregistrer();
                if (e.key === "Escape") fermer();
              }}
            />
            {ext && <span className="fichier-ext">.{ext}</span>}
          </div>
          {erreur && <div className="fichier-erreur">{erreur}</div>}
        </div>
      ) : (
        <div style={{ minWidth: 0 }}>
          <div className={v.nom} style={variante === "amo" ? { fontSize: 13 } : undefined}>
            {name}
          </div>
          <div className={v.detail}>{detail}</div>
          {erreur && <div className="fichier-erreur">{erreur}</div>}
        </div>
      )}
      <span className="spacer"></span>
      {saisie != null ? (
        <div className="fichier-actions">
          <button className="se-btn se-btn-primary btn-sm" disabled={busy} onClick={() => void enregistrer()}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button className="se-btn se-btn-ghost btn-sm" disabled={busy} onClick={fermer}>
            Annuler
          </button>
        </div>
      ) : (
        <>
          {avant}
          <button
            className="icon-btn"
            title={estVisualisable(name) ? "Aperçu sans téléchargement" : "Ce format ne s'affiche pas dans le navigateur"}
            onClick={onApercu}
          >
            <Icon name="eye" size={v.icone} />
          </button>
          <button className="icon-btn" title="Télécharger" onClick={onTelecharger}>
            <Icon name="download" size={v.icone} />
          </button>
          {(onRenommer || onSupprimer) && (
            <div className="fichier-actions">
              {onRenommer && (
                <button
                  className="se-btn se-btn-ghost btn-sm"
                  title="Modifier le nom du fichier"
                  disabled={busy}
                  onClick={() => {
                    setSaisie(nomSansExtension(name));
                    setErreur(null);
                  }}
                >
                  <Icon name="edit" size={14} />
                  Modifier
                </button>
              )}
              {onSupprimer && (
                <button
                  className="se-btn se-btn-ghost btn-sm"
                  style={{ color: "var(--color-error-700)" }}
                  title="Supprimer le fichier"
                  disabled={busy}
                  onClick={() => void supprimer()}
                >
                  <Icon name="trash" size={14} />
                  Supprimer
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
