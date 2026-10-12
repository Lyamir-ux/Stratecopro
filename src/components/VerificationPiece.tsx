// Vérification d'une pièce justificative déposée par un copropriétaire
// (feedback Amir 10/09/2026) : l'administratif Strat Eco voit qui a déposé la
// pièce et quand, la qualifie d'un petit menu déroulant (conforme, illisible,
// incomplet, mauvaise année…). Utilisé dans la fiche individuelle (onglet
// Copropriétaires) et dans la file « Pièces à vérifier » de la page Vos tâches.
// Idée d'Amir du 12/10/2026 : le choix ouvre sur le côté un champ de commentaire
// facultatif, et la qualification ne part qu'au clic sur « Valider et prévenir »
// ou « Refuser et prévenir » : le copropriétaire reçoit un e-mail dans les deux
// cas, avec le commentaire (edge notifier-piece-refusee v4, 0161).
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
  const enregistree = piece.qualification ?? "";
  const [choix, setChoix] = useState<string>(enregistree);
  // champ ouvert sur le côté : qualification choisie, pas encore envoyée
  const [ouvert, setOuvert] = useState(false);
  // commentaire facultatif ; pour « Autre motif », c'est le motif du refus (obligatoire)
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const q = QUALIFICATIONS_PIECE.find((x) => x.id === choix) ?? null;
  const motifLibre = choix === "autre";
  const verif = piece.statut !== "a_verifier";

  const texteInitial = (id: string) =>
    id === "autre"
      ? (enregistree === "autre" ? piece.motif_refus ?? "" : "")
      : id === enregistree
        ? piece.commentaire_verification ?? ""
        : "";

  const ouvrir = (id: string) => {
    setErreur(null);
    setChoix(id);
    setTexte(texteInitial(id));
    setOuvert(true);
  };

  const annuler = () => {
    setErreur(null);
    setChoix(enregistree);
    setOuvert(false);
  };

  const envoyer = (id: string) => {
    setErreur(null);
    qualifier.mutate(
      {
        piece,
        qualification: id || null,
        motifLibre: id === "autre" ? texte : null,
        commentaire: id && id !== "autre" ? texte : null,
      },
      {
        onSuccess: () => setOuvert(false),
        onError: (e) => setErreur(messageErreur(e, "Enregistrement impossible")),
      }
    );
  };

  const onChoix = (v: string) => {
    if (!v) {
      // « Remettre à vérifier » : immédiat, sans e-mail
      setChoix("");
      setOuvert(false);
      if (verif) envoyer("");
      return;
    }
    ouvrir(v);
  };

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
        {verif && piece.refus_email_statut && (
          <>
            <span>·</span>
            <Icon name="mail" size={12} />
            <span>{EMAIL_STATUT[piece.refus_email_statut] ?? piece.refus_email_statut}</span>
          </>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <select
          className="chip-filter"
          value={choix}
          disabled={qualifier.isPending}
          onChange={(e) => onChoix(e.target.value)}
          style={{ cursor: "pointer", maxWidth: compact ? 190 : undefined }}
          title="Qualifier la pièce : un champ de commentaire s'ouvre à côté, puis le copropriétaire est prévenu par e-mail (validation comme refus)"
        >
          <option value="">{verif ? "Remettre à vérifier" : "Qualifier la pièce…"}</option>
          {QUALIFICATIONS_PIECE.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        {ouvert && q && (
          <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea
              className="cs-textarea"
              style={{ fontSize: 12.5, padding: "6px 8px" }}
              rows={2}
              autoFocus
              value={texte}
              maxLength={2000}
              onChange={(e) => setTexte(e.target.value)}
              placeholder={
                motifLibre
                  ? "Motif du refus communiqué au copropriétaire (obligatoire)"
                  : "Commentaire pour le copropriétaire (facultatif), repris dans l'e-mail"
              }
              aria-label={motifLibre ? "Motif du refus" : "Commentaire pour le copropriétaire"}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                className={"se-btn btn-sm " + (q.statut === "valide" ? "se-btn-primary" : "se-btn-secondary")}
                disabled={qualifier.isPending || (motifLibre && !texte.trim())}
                onClick={() => envoyer(choix)}
              >
                <Icon name="send" size={13} />
                {q.statut === "valide" ? "Valider et prévenir" : "Refuser et prévenir"}
              </button>
              <button className="se-btn se-btn-ghost btn-sm" disabled={qualifier.isPending} onClick={annuler}>
                Annuler
              </button>
            </div>
          </div>
        )}
        {!ouvert && verif && enregistree && (
          <button
            className="se-btn se-btn-ghost btn-sm"
            disabled={qualifier.isPending}
            title="Modifier le commentaire et renvoyer l'e-mail au copropriétaire, sans changer la qualification"
            onClick={() => ouvrir(enregistree)}
          >
            <Icon name="mail" size={13} />
            Commenter et renvoyer
          </button>
        )}
        {qualifier.isPending && <span style={{ color: "var(--fg-muted)", alignSelf: "center" }}>Enregistrement…</span>}
      </div>
      {piece.statut === "refuse" && piece.motif_refus && (
        <div style={{ color: "var(--color-error-700)" }}>Motif : {piece.motif_refus}</div>
      )}
      {verif && piece.commentaire_verification && !ouvert && (
        <div style={{ color: "var(--fg2)", whiteSpace: "pre-wrap" }}>Commentaire : {piece.commentaire_verification}</div>
      )}
      {erreur && <div style={{ color: "var(--color-error-700)" }}>{erreur}</div>}
    </div>
  );
}
