// Vérification d'une pièce justificative déposée par un copropriétaire
// (feedback Amir 10/09/2026) : l'administratif Strat Eco voit qui a déposé la
// pièce et quand, la qualifie d'un petit menu déroulant (conforme, illisible,
// incomplet, mauvaise année…) ; un refus part immédiatement par e-mail au
// copropriétaire (edge notifier-piece-refusee) avec le motif. Utilisé dans la
// fiche individuelle (onglet Copropriétaires) et dans la file « Pièces à
// vérifier » de la page Vos tâches.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { LIBELLE_STATUT_PIECE, QUALIFICATIONS_PIECE, libelleQualification, useQualifierPiece } from "@/api/portail";
import type { PieceJustificative } from "@/api/dossiersCopros";
import { messageErreur } from "@/lib/erreurs";

export function StatutPieceBadge({ piece }: { piece: Pick<PieceJustificative, "statut" | "qualification"> }) {
  const kind = piece.statut === "valide" ? "success" : piece.statut === "refuse" ? "warn" : "neutral";
  const lib = piece.statut === "refuse" && piece.qualification && piece.qualification !== "autre"
    ? `Refusée · ${libelleQualification(piece.qualification).toLowerCase()}`
    : LIBELLE_STATUT_PIECE[piece.statut];
  return (
    <Badge kind={kind} dot={piece.statut === "a_verifier"}>
      {lib}
    </Badge>
  );
}

const EMAIL_STATUT: Record<string, string> = {
  envoye: "e-mail envoyé au copropriétaire",
  simule: "e-mail simulé (envoi non configuré)",
  erreur: "échec de l'envoi de l'e-mail",
  sans_email: "copropriétaire sans adresse e-mail",
};

export function VerificationPiece({ piece, compact }: { piece: PieceJustificative; compact?: boolean }) {
  const qualifier = useQualifierPiece();
  const [choix, setChoix] = useState<string>(piece.qualification ?? "");
  const [motif, setMotif] = useState<string>(piece.motif_refus ?? "");
  const [erreur, setErreur] = useState<string | null>(null);

  const appliquer = (q: string) => {
    setErreur(null);
    qualifier.mutate(
      { piece, qualification: q || null, motifLibre: q === "autre" ? motif : null },
      { onError: (e) => setErreur(messageErreur(e, "Enregistrement impossible")) }
    );
  };

  const onChoix = (v: string) => {
    setChoix(v);
    // « Autre motif » attend un texte libre avant d'envoyer le refus
    if (v !== "autre") appliquer(v);
  };

  const verif = piece.statut !== "a_verifier";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
      <div style={{ color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Icon name="upload" size={12} />
        <span>
          Déposée le {fmtDate(piece.uploaded_at)}
          {piece.deposee_par_nom ? ` par ${piece.deposee_par_nom}` : ""}
        </span>
        {verif && (
          <>
            <span>·</span>
            <Icon name={piece.statut === "valide" ? "checkCircle" : "alert"} size={12} />
            <span>
              {LIBELLE_STATUT_PIECE[piece.statut]} le {fmtDate(piece.verifiee_le)}
              {piece.verifiee_par_nom ? ` par ${piece.verifiee_par_nom}` : ""}
            </span>
          </>
        )}
        {piece.statut === "refuse" && (
          <>
            <span>·</span>
            <Icon name="mail" size={12} />
            <span>{EMAIL_STATUT[piece.refus_email_statut ?? ""] ?? "e-mail en cours d'envoi…"}</span>
          </>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <select
          className="chip-filter"
          value={choix}
          disabled={qualifier.isPending}
          onChange={(e) => onChoix(e.target.value)}
          style={{ cursor: "pointer", maxWidth: compact ? 190 : undefined }}
          title="Qualifier la pièce : « Conforme » la valide, tout autre choix la refuse et prévient le copropriétaire par e-mail"
        >
          <option value="">{verif ? "Remettre à vérifier" : "Qualifier la pièce…"}</option>
          {QUALIFICATIONS_PIECE.map((q) => (
            <option key={q.id} value={q.id}>
              {q.label}
            </option>
          ))}
        </select>
        {choix === "autre" && (
          <>
            <input
              className="se-input"
              style={{ flex: 1, minWidth: 180, fontSize: 12.5, padding: "5px 8px" }}
              placeholder="Motif communiqué au copropriétaire"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
            />
            <button
              className="se-btn se-btn-secondary btn-sm"
              disabled={!motif.trim() || qualifier.isPending}
              onClick={() => appliquer("autre")}
            >
              <Icon name="send" size={13} />
              {piece.statut === "refuse" && piece.qualification === "autre" ? "Mettre à jour" : "Confirmer le refus"}
            </button>
          </>
        )}
        {qualifier.isPending && <span style={{ color: "var(--fg-muted)" }}>Enregistrement…</span>}
      </div>
      {piece.statut === "refuse" && piece.motif_refus && (
        <div style={{ color: "var(--color-error-700)" }}>Motif : {piece.motif_refus}</div>
      )}
      {erreur && <div style={{ color: "var(--color-error-700)" }}>{erreur}</div>}
    </div>
  );
}
