// Validation par l'AMO de la pièce d'identité d'un signataire ou du RIB d'un
// bulletin (0155, retour de A CHELGHAM du 09/10/2026). Réservée au niveau 1, seul
// à pouvoir lire ces pièces (CGU art. 7.5.1) ; un refus prévient le signataire par
// e-mail (le cosignataire reçoit un lien pour redéposer sa pièce). Même principe
// que VerificationPiece pour les pièces justificatives du portail.
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
  verifieeLe: string | null;
  emailStatut: string | null;
}) {
  const { profile } = useAuth();
  const verifier = useVerifierPieceSignature(coproId);
  const [choix, setChoix] = useState(qualification ?? "");
  const [motifLibre, setMotifLibre] = useState(motif ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const niveau1 = profile?.niveau_pieces === 1;

  const appliquer = (q: string) => {
    setErreur(null);
    verifier.mutate(
      { quoi, bulletinId, signataireId, qualification: q || null, motif: motifLibreRequis(quoi, q) ? motifLibre : null },
      { onError: (e) => setErreur(messageErreur(e, "Enregistrement impossible")) },
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <StatutSignatureBadge statut={statut} qualification={qualification} />
        {statut && statut !== "a_verifier" && verifieeLe && (
          <span style={{ color: "var(--fg-muted)" }}>le {fmtDate(verifieeLe)}</span>
        )}
        {statut === "refuse" && emailStatut && (
          <span style={{ color: "var(--fg-muted)" }}>
            <Icon name="mail" size={11} /> {EMAIL[emailStatut] ?? emailStatut}
          </span>
        )}
        {niveau1 ? (
          <select
            className="chip-filter"
            value={choix}
            disabled={verifier.isPending}
            onChange={(e) => {
              setChoix(e.target.value);
              if (!motifLibreRequis(quoi, e.target.value)) appliquer(e.target.value);
            }}
            style={{ cursor: "pointer", maxWidth: 180 }}
            title="« Conforme » valide la pièce ; tout autre choix la refuse et prévient le signataire par e-mail"
          >
            <option value="">{statut && statut !== "a_verifier" ? "Remettre à vérifier" : "Qualifier…"}</option>
            {qualificationsPour(quoi).map((q) => (
              <option key={q.id} value={q.id}>{q.label}</option>
            ))}
          </select>
        ) : (
          statut === "a_verifier" && <span style={{ color: "var(--fg-muted)" }}>validation réservée au niveau 1</span>
        )}
        {verifier.isPending && <span style={{ color: "var(--fg-muted)" }}>Enregistrement…</span>}
      </div>
      {niveau1 && motifLibreRequis(quoi, choix) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input
            className="se-input"
            style={{ flex: 1, minWidth: 180, fontSize: 12, padding: "4px 8px" }}
            placeholder="Motif communiqué au signataire"
            value={motifLibre}
            onChange={(e) => setMotifLibre(e.target.value)}
          />
          <button
            className="se-btn se-btn-secondary btn-sm"
            disabled={!motifLibre.trim() || verifier.isPending}
            onClick={() => appliquer(choix)}
          >
            <Icon name="send" size={12} />
            Confirmer le refus
          </button>
        </div>
      )}
      {statut === "refuse" && motif && <div style={{ color: "var(--color-error-700)" }}>Motif : {motif}</div>}
      {erreur && <div style={{ color: "var(--color-error-700)" }}>{erreur}</div>}
    </div>
  );
}
