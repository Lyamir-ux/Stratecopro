// Tampon du syndic d'une organisation : aperçu, import et remplacement (0163). Partagé entre
// l'onglet Financement d'un dossier (avant d'ouvrir la campagne d'adhésion) et Paramètres >
// Organisations (demande d'Amir du 14/10/2026) ; chaque écran apporte son titre et son message.
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useImporterTamponSyndic, useTamponOrganisation } from "@/api/tamponSyndic";
import { messageErreur } from "@/lib/erreurs";
import { ACCEPT_TAMPON, LIBELLE_FORMATS_TAMPON } from "@/lib/tamponSyndic";

export function TamponSyndic({
  organisationId,
  nomSyndic,
  libelleImport,
  sansTampon,
  alerte = false,
}: {
  organisationId: string | null;
  nomSyndic: string | null;
  /** Texte du bouton quand aucun tampon n'est encore importé. */
  libelleImport: string;
  /** Explication affichée tant que l'organisation n'a pas de tampon. */
  sansTampon: string;
  /** Met l'explication en rouge (le tampon manque et c'est bloquant ou déjà gênant). */
  alerte?: boolean;
}) {
  const { data, isLoading, error } = useTamponOrganisation(organisationId);
  const importer = useImporterTamponSyndic(organisationId);
  const champ = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const nom = data?.nom ?? nomSyndic ?? "ce syndic";
  const image = data?.image ?? null;

  const choisir = (f: File | undefined) => {
    if (!f) return;
    setMessage(null);
    importer.mutate(f, { onError: (e) => setMessage(messageErreur(e, "Import du tampon impossible")) });
  };

  const bouton = (libelle: string, primaire: boolean) => (
    <>
      <button
        type="button"
        className={`se-btn ${primaire ? "se-btn-secondary" : "se-btn-ghost"} btn-sm`}
        disabled={importer.isPending}
        onClick={() => champ.current?.click()}
      >
        <Icon name="upload" size={14} />
        {importer.isPending ? "Import en cours…" : libelle}
      </button>
      <input
        ref={champ}
        type="file"
        accept={ACCEPT_TAMPON}
        style={{ display: "none" }}
        onChange={(e) => {
          choisir(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );

  return (
    <div>
      {!organisationId ? (
        <p className="se-small" style={{ color: "var(--color-error-700)", margin: 0 }}>
          Ce dossier n'est rattaché à aucune organisation : choisissez-la dans l'onglet Données, le tampon se range par
          organisation.
        </p>
      ) : isLoading ? (
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>Chargement…</p>
      ) : error ? (
        <p className="se-small" style={{ color: "var(--color-error-700)", margin: 0 }}>
          {messageErreur(error, "Lecture du tampon impossible")}
        </p>
      ) : image ? (
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <img
            src={image}
            alt={`Tampon de ${nom}`}
            style={{ maxHeight: 64, maxWidth: 220, border: "1px solid var(--border)", borderRadius: 6, background: "#fff", padding: 4 }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
            <span className="se-small" style={{ color: "var(--fg-muted)" }}>
              Tampon de {nom}, repris sur tous les bulletins des dossiers de l'organisation. Un bulletin déjà généré
              garde l'ancien tampon.
            </span>
            {bouton("Remplacer le tampon", false)}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <span className="se-small" style={{ color: alerte ? "var(--color-error-700)" : "var(--fg-muted)" }}>
            {sansTampon}
          </span>
          {bouton(libelleImport, true)}
        </div>
      )}
      {message && (
        <p className="se-small" style={{ color: "var(--color-error-700)", margin: "8px 0 0" }}>
          {message}
        </p>
      )}
      <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
        Image du tampon en {LIBELLE_FORMATS_TAMPON} (scan ou photo recadrée sur le tampon, fond transparent de préférence).
      </p>
    </div>
  );
}
