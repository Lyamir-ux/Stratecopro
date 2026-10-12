// Validation par l'AMO de la pièce d'identité d'un signataire ou du RIB d'un
// bulletin (0155, retour de A CHELGHAM du 09/10/2026). Réservée au niveau 1, seul
// à pouvoir lire ces pièces (CGU art. 7.5.1) ; un refus prévient le signataire par
// e-mail (le cosignataire reçoit un lien pour redéposer sa pièce). Même principe
// que VerificationPiece pour les pièces justificatives du portail : depuis l'idée
// d'Amir du 12/10/2026, le choix ouvre sur le côté un champ de commentaire
// facultatif et la validation est aussi annoncée par e-mail (signature-flux v7, 0161).
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { fmtDate } from "@/lib/format";
import { messageErreur } from "@/lib/erreurs";
import { libelleQualificationSignature, motifLibreRequis, qualificationsPour } from "@/lib/verificationSignature";
import { useVerifierPieceSignature } from "@/api/signature";

const EMAIL: Record<string, string> = {
  envoye: "e-mail envoyé",
  simule: "e-mail simulé (envoi non configuré)",
  erreur: "échec de l'envoi de l'e-mail",
};

export function StatutSignatureBadge({ statut, qualification }: { statut: string | null; qualification?: string | null }) {
  if (!statut) return null;
  if (statut === "valide") return <Badge kind="success">Validée</Badge>;
  if (statut === "refuse") {
    return (
      <Badge kind="warn">
        Refusée{qualification && qualification !== "autre" ? ` · ${libelleQualificationSignature(qualification).toLowerCase()}` : ""}
      </Badge>
    );
  }
  return <Badge kind="neutral" dot>À vérifier</Badge>;
}

export function VerificationSignature({
  coproId,
  quoi,
  bulletinId,
  signataireId,
  statut,
  qualification,
  motif,
  commentaire = null,
  verifieeLe,
  emailStatut,
}: {
  coproId: string | undefined;
  quoi: "piece" | "rib";
  bulletinId?: string;
  signataireId?: string;
  statut: string | null;
  qualification: string | null;
  motif: string | null;
  /** commentaire de l'AMO envoyé avec la dernière qualification (0161) */
  commentaire?: string | null;
  verifieeLe: string | null;
  emailStatut: string | null;
}) {
  const { profile } = useAuth();
  const verifier = useVerifierPieceSignature(coproId);
  const enregistree = qualification ?? "";
  const [choix, setChoix] = useState(enregistree);
  const [ouvert, setOuvert] = useState(false);
  // commentaire facultatif ; motif obligatoire quand la qualification n'en a pas par défaut
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const niveau1 = profile?.niveau_pieces === 1;
  const verif = !!statut && statut !== "a_verifier";
  const q = qualificationsPour(quoi).find((x) => x.id === choix) ?? null;
  const motifLibre = motifLibreRequis(quoi, choix);

  const envoyer = (id: string) => {
    setErreur(null);
    const libre = motifLibreRequis(quoi, id);
    verifier.mutate(
      {
        quoi,
        bulletinId,
        signataireId,
        qualification: id || null,
        motif: libre ? texte : null,
        commentaire: id && !libre ? texte : null,
      },
      {
        onSuccess: () => setOuvert(false),
        onError: (e) => setErreur(messageErreur(e, "Enregistrement impossible")),
      },
    );
  };

  const ouvrir = (id: string) => {
    setErreur(null);
    setChoix(id);
    setTexte(
      motifLibreRequis(quoi, id)
        ? (id === enregistree ? motif ?? "" : "")
        : id === enregistree
          ? commentaire ?? ""
          : "",
    );
    setOuvert(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minHeight: 28 }}>
          <StatutSignatureBadge statut={statut} qualification={qualification} />
          {verif && verifieeLe && <span style={{ color: "var(--fg-muted)" }}>le {fmtDate(verifieeLe)}</span>}
          {verif && emailStatut && (
            <span style={{ color: "var(--fg-muted)" }}>
              <Icon name="mail" size={11} /> {EMAIL[emailStatut] ?? emailStatut}
            </span>
          )}
        </span>
        {niveau1 ? (
          <select
            className="chip-filter"
            value={choix}
            disabled={verifier.isPending}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                // « Remettre à vérifier » : immédiat, sans e-mail
                setChoix("");
                setOuvert(false);
                if (verif) envoyer("");
                return;
              }
              ouvrir(v);
            }}
            style={{ cursor: "pointer", maxWidth: 180 }}
            title="Qualifier la pièce : un champ de commentaire s'ouvre à côté, puis le signataire est prévenu par e-mail (validation comme refus)"
          >
            <option value="">{verif ? "Remettre à vérifier" : "Qualifier…"}</option>
            {qualificationsPour(quoi).map((x) => (
              <option key={x.id} value={x.id}>{x.label}</option>
            ))}
          </select>
        ) : (
          statut === "a_verifier" && <span style={{ color: "var(--fg-muted)", alignSelf: "center" }}>validation réservée au niveau 1</span>
        )}
        {niveau1 && ouvert && q && (
          <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea
              className="cs-textarea"
              style={{ fontSize: 12, padding: "5px 8px" }}
              rows={2}
              autoFocus
              maxLength={2000}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder={
                motifLibre
                  ? "Motif du refus communiqué au signataire (obligatoire)"
                  : "Commentaire pour le signataire (facultatif), repris dans l'e-mail"
              }
              aria-label={motifLibre ? "Motif du refus" : "Commentaire pour le signataire"}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                className={"se-btn btn-sm " + (q.statut === "valide" ? "se-btn-primary" : "se-btn-secondary")}
                disabled={verifier.isPending || (motifLibre && !texte.trim())}
                onClick={() => envoyer(choix)}
              >
                <Icon name="send" size={12} />
                {q.statut === "valide" ? "Valider et prévenir" : "Refuser et prévenir"}
              </button>
              <button
                className="se-btn se-btn-ghost btn-sm"
                disabled={verifier.isPending}
                onClick={() => {
                  setErreur(null);
                  setChoix(enregistree);
                  setOuvert(false);
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
        {niveau1 && !ouvert && verif && enregistree && (
          <button
            className="se-btn se-btn-ghost btn-sm"
            disabled={verifier.isPending}
            title="Modifier le commentaire et renvoyer l'e-mail, sans changer la qualification"
            onClick={() => ouvrir(enregistree)}
          >
            <Icon name="mail" size={12} />
            Commenter et renvoyer
          </button>
        )}
        {verifier.isPending && <span style={{ color: "var(--fg-muted)", alignSelf: "center" }}>Enregistrement…</span>}
      </div>
      {statut === "refuse" && motif && <div style={{ color: "var(--color-error-700)" }}>Motif : {motif}</div>}
      {verif && commentaire && !ouvert && (
        <div style={{ color: "var(--fg2)", whiteSpace: "pre-wrap" }}>Commentaire : {commentaire}</div>
      )}
      {erreur && <div style={{ color: "var(--color-error-700)" }}>{erreur}</div>}
    </div>
  );
}
