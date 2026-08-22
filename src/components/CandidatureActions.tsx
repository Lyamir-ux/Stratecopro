// Décision AMO sur une candidature : retenir / refuser (e-mail automatique au
// prestataire), annulation possible, suivi de l'engagement du prestataire.
// Utilisé par /consultations et par l'onglet Prestataires du dossier copro.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { useDeciderCandidature } from "@/api/consultations";
import type { Tables } from "@/lib/database.types";

const EMAIL_LABELS: Record<string, string> = {
  envoye: "e-mail envoyé",
  simule: "e-mail simulé",
  erreur: "e-mail en erreur",
  aucun_email: "sans e-mail (hors plateforme)",
};

export function CandidatureActions({ cand }: { cand: Tables<"candidatures"> }) {
  const decider = useDeciderCandidature();
  const [enCours, setEnCours] = useState<string | null>(null);

  const decide = async (statut: Tables<"candidatures">["statut"]) => {
    setEnCours(statut);
    try {
      await decider.mutateAsync({ id: cand.id, statut });
    } finally {
      setEnCours(null);
    }
  };

  // candidature retirée par l'entreprise : plus aucune action possible
  if (cand.retrait_at) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Badge kind="neutral">Retirée par l'entreprise le {fmtDate(cand.retrait_at)}</Badge>
        {cand.retrait_motif && (
          <span style={{ fontSize: 11.5, color: "var(--fg-muted)", fontStyle: "italic" }}>
            « {cand.retrait_motif} »
          </span>
        )}
      </span>
    );
  }

  if (cand.statut === "retenue") {
    const engage = !!cand.engagement_at;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Badge kind="success" dot>Retenue{cand.decision_at ? ` · ${fmtDate(cand.decision_at)}` : ""}</Badge>
        {engage ? (
          <Badge kind="primary" dot>Engagement confirmé le {fmtDate(cand.engagement_at!)}</Badge>
        ) : (
          <Badge kind="blue">En attente d'engagement</Badge>
        )}
        {cand.decision_email_statut && (
          <span style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
            {EMAIL_LABELS[cand.decision_email_statut] ?? cand.decision_email_statut}
          </span>
        )}
        <button
          className="se-btn se-btn-ghost btn-sm"
          title={
            engage
              ? "Déverrouiller le projet en cas de rétractation du prestataire (faillite, devis expiré…) : la candidature repasse en « reçue », le projet disparaît de son espace et la consultation peut être relancée"
              : "Annuler la décision (repasse la candidature en « reçue »)"
          }
          disabled={decider.isPending}
          onClick={() => {
            if (
              !engage ||
              window.confirm(
                `Déverrouiller la sélection de ${cand.org_name} ?\n\nSon engagement sera annulé, le projet disparaîtra de son espace et vous pourrez relancer la consultation (bouton « Remettre en ligne »).`
              )
            ) {
              void decide("recue");
            }
          }}
        >
          {engage ? "Déverrouiller" : "Annuler"}
        </button>
      </span>
    );
  }

  if (cand.statut === "non_retenue") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Badge kind="neutral">Refusée{cand.decision_at ? ` · ${fmtDate(cand.decision_at)}` : ""}</Badge>
        {cand.decision_email_statut && (
          <span style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
            {EMAIL_LABELS[cand.decision_email_statut] ?? cand.decision_email_statut}
          </span>
        )}
        <button
          className="se-btn se-btn-ghost btn-sm"
          title="Annuler la décision (repasse la candidature en « reçue »)"
          disabled={decider.isPending}
          onClick={() => void decide("recue")}
        >
          Annuler
        </button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        className="se-btn se-btn-primary btn-sm"
        title="Valider l'offre : le prestataire est alerté par e-mail et, pour une MOE, accède à son projet après confirmation de son engagement"
        disabled={decider.isPending}
        onClick={() => void decide("retenue")}
      >
        <Icon name="check" size={14} />
        {enCours === "retenue" ? "Validation…" : "Valider l'offre"}
      </button>
      <button
        className="se-btn se-btn-ghost btn-sm"
        title="Refuser l'offre : le prestataire est prévenu par e-mail automatique"
        disabled={decider.isPending}
        onClick={() => {
          if (window.confirm("Refuser cette offre ? Le prestataire sera prévenu par e-mail.")) {
            void decide("non_retenue");
          }
        }}
      >
        <Icon name="x" size={14} />
        {enCours === "non_retenue" ? "Refus…" : "Refuser"}
      </button>
    </span>
  );
}
