// Fenêtre de la colonne « Sans PPPT » du tableau de bord PPT (feedback Amir
// 27/09/2026, page /syndic/ppt) : un clic sur une copropriété qui n'a aucun
// PPPT demande « Voulez-vous une consultation pour la réalisation du PPPT et
// du DPE collectif ? ». Une demande en cours s'affiche à la place de la
// question (pas de doublon). La fiche reste accessible depuis la fenêtre
// (déposer un PPPT existant, compléter la fiche).
// Depuis l'idée d'Amir du 27/09/2026 (18:13, migration 0109), « Oui » publie
// directement la consultation aux bureaux d'études référencés du métier
// « PPPT + DPE collectif » (ppt_demander_consultation_pppt, alerte
// notifier-consultation) ; l'équipe est prévenue et publie ensuite son
// analyse des offres, que le syndic retrouve dans l'onglet Consultation.
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import type { DemandeAmo } from "@/api/demandesAmo";
import { useDemanderConsultationPppt, type ResultatDemandeConsultation } from "@/api/consultationPpt";
import type { PptCoproAvecStats } from "@/api/ppt";
import { libelleDemandeConsultation } from "@/lib/ppt/analyseOffres";
import { messageErreur } from "@/lib/erreurs";
import { fmtDateCourte } from "./commun";

const PROMESSE = "Vous récupérerez les documents directement sur la plateforme, ainsi qu'une analyse des offres à présenter en assemblée générale.";

export function ConsultationPppt({
  copro,
  demande,
  apercuAmo,
  onOuvrirFiche,
  onVoirConsultation,
  onClose,
}: {
  copro: PptCoproAvecStats;
  /** Demande en cours (demandeEnCours), sinon null. */
  demande: DemandeAmo | null;
  apercuAmo: boolean;
  onOuvrirFiche: () => void;
  /** Onglet Consultation de la fiche. */
  onVoirConsultation: () => void;
  onClose: () => void;
}) {
  const demander = useDemanderConsultationPppt();
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<ResultatDemandeConsultation | null>(null);

  const sub = [
    copro.nb_lots ? `${copro.nb_lots} lots` : copro.nb_logements ? `${copro.nb_logements} logements` : null,
    copro.commune,
    copro.plus_de_15_ans === true ? "plus de 15 ans" : copro.plus_de_15_ans === false ? "moins de 15 ans" : null,
    copro.gestionnaire_nom,
  ].filter(Boolean).join(" · ");

  const envoyer = async () => {
    setErreur(null);
    try {
      setResultat(await demander.mutateAsync(copro.id));
    } catch (err) {
      setErreur(messageErreur(err, "L'envoi de la demande a échoué."));
    }
  };

  const enTete = (
    <div className="doc-row" style={{ padding: "0 0 12px" }}>
      <span className="d-ico"><Icon name="building" size={18} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="d-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{copro.nom}</div>
        <div className="d-sub">{sub || "Aucun PPPT sur la plateforme"}</div>
      </div>
    </div>
  );

  const boutonFiche = (
    <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={onOuvrirFiche} title="Fiche de la copropriété : documents, informations">
      <Icon name="arrowRight" size={14} />
      Ouvrir la fiche
    </button>
  );

  // consultation publiée à l'instant, ou demande déjà en cours : on dit où elle en est, sans reposer la question
  if (resultat || demande) {
    const etat = demande ? libelleDemandeConsultation(demande) : null;
    const alertes = resultat?.alertes ? resultat.alertes.envoyes + resultat.alertes.simules : null;
    return (
      <Modal title="Consultation PPPT + DPE collectif" onClose={onClose} width={540}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {enTete}
          {resultat ? (
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--color-success-50)", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Icon name="checkCircle" size={18} style={{ color: "var(--color-success-700)", flex: "none", marginTop: 1 }} />
              <span style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                Consultation publiée : elle part directement à des bureaux d'études référencés locaux
                {alertes != null && alertes > 0 ? ` (${alertes} alerté${alertes > 1 ? "s" : ""} par e-mail)` : ""}, réponses attendues avant le {fmtDateCourte(resultat.date_limite)}. {PROMESSE}
              </span>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <Badge kind={etat!.kind} dot>{etat!.court}</Badge>
                <span className="se-small" style={{ color: "var(--fg-muted)" }}>
                  Demandée le {fmtDateCourte(demande!.created_at)}
                  {demande!.demandeur_nom ? ` par ${demande!.demandeur_nom}` : ""}
                  {demande!.statut === "traitee" && demande!.traite_le ? ` · publiée le ${fmtDateCourte(demande!.traite_le)}` : ""}
                </span>
              </div>
              {demande!.commentaire_amo && demande!.statut === "traitee" && (
                <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg)", fontSize: 13.5 }}>
                  <strong style={{ fontSize: 12.5, color: "var(--fg2)" }}>Suite donnée par Strat Eco</strong>
                  <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{demande!.commentaire_amo}</div>
                </div>
              )}
              <p className="se-small" style={{ margin: 0, color: "var(--fg-muted)" }}>
                {demande!.statut === "traitee"
                  ? "Les offres, leurs pièces et l'analyse de Strat Eco sont dans l'onglet Consultation de la fiche."
                  : `La consultation pour la réalisation du PPPT et du DPE collectif a déjà été demandée pour cette copropriété. ${PROMESSE}`}
              </p>
            </>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            {boutonFiche}
            <button type="button" className="se-btn se-btn-primary btn-sm" onClick={onVoirConsultation}>
              <Icon name="clipboard" size={14} />
              Voir la consultation
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Copropriété sans PPPT" onClose={onClose} width={540} closeOnBackdrop={!demander.isPending}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {enTete}
        <p style={{ margin: 0, fontSize: 15.5, fontWeight: 700, lineHeight: 1.45 }}>
          Voulez-vous une consultation pour la réalisation du PPPT et du DPE collectif ?
        </p>
        <p className="se-small" style={{ margin: 0, color: "var(--fg-muted)", lineHeight: 1.55 }}>
          La demande part directement à des bureaux d'études référencés locaux. {PROMESSE}
          {copro.plus_de_15_ans === true ? " Copropriété de plus de 15 ans : le projet de plan pluriannuel de travaux est obligatoire." : ""}
        </p>
        <div className="se-small" style={{ color: "var(--fg-muted)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--bg)" }}>
          <Icon name="upload" size={13} style={{ flex: "none" }} />
          <span style={{ flex: 1, minWidth: 200 }}>Vous avez déjà un PPPT ? Déposez-le depuis la fiche : il passera en analyse.</span>
          {boutonFiche}
        </div>
        {apercuAmo && (
          <p className="se-small" style={{ margin: 0, padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--bg)", color: "var(--fg2)" }}>
            Aperçu AMO : la demande se fait depuis le compte du syndic.
          </p>
        )}
        {erreur && (
          <p style={{ margin: 0, padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>{erreur}</p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="se-btn se-btn-secondary btn-sm" onClick={onClose} disabled={demander.isPending}>
            Non, pas maintenant
          </button>
          <button
            type="button"
            className="se-btn se-btn-primary btn-sm"
            onClick={() => void envoyer()}
            disabled={apercuAmo || demander.isPending}
            title={apercuAmo ? "Aperçu AMO : la demande se fait depuis le compte du syndic" : undefined}
          >
            <Icon name="send" size={14} />
            {demander.isPending ? "Publication…" : "Oui, demander la consultation"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
