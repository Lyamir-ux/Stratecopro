// Fenêtre de la colonne « Sans PPPT » du tableau de bord PPT (feedback Amir
// 27/09/2026, page /syndic/ppt) : un clic sur une copropriété qui n'a aucun
// PPPT demande « Voulez-vous une consultation pour la réalisation du PPPT et
// du DPE collectif ? ». Oui = demande à Strat Eco (demandes_amo, objet
// consultation_pppt_dpe, 0107), avec ce que la fiche sait déjà ; l'équipe la
// reçoit par e-mail et dans « Demandes des syndics ». Une demande en cours
// s'affiche à la place de la question (pas de doublon). La fiche reste
// accessible depuis la fenêtre (déposer un PPPT existant, compléter la fiche).
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { useDemanderConsultationPpt, type DemandeAmo } from "@/api/demandesAmo";
import type { PptCoproAvecStats } from "@/api/ppt";
import { messageErreur } from "@/lib/erreurs";
import { fmtDateCourte } from "./commun";

export function ConsultationPppt({
  copro,
  demande,
  apercuAmo,
  organisationId,
  syndicName,
  onOuvrirFiche,
  onClose,
}: {
  copro: PptCoproAvecStats;
  /** Demande à traiter ou prise en charge (demandeEnCours), sinon null. */
  demande: DemandeAmo | null;
  apercuAmo: boolean;
  organisationId: string | null;
  syndicName: string | null;
  onOuvrirFiche: () => void;
  onClose: () => void;
}) {
  const demander = useDemanderConsultationPpt();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoyee, setEnvoyee] = useState(false);

  const sub = [
    copro.nb_lots ? `${copro.nb_lots} lots` : copro.nb_logements ? `${copro.nb_logements} logements` : null,
    copro.commune,
    copro.plus_de_15_ans === true ? "plus de 15 ans" : copro.plus_de_15_ans === false ? "moins de 15 ans" : null,
    copro.gestionnaire_nom,
  ].filter(Boolean).join(" · ");

  const envoyer = async () => {
    setErreur(null);
    try {
      await demander.mutateAsync({ copro, organisationId, syndicName });
      setEnvoyee(true);
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

  // demande envoyée ou déjà en cours : on dit où elle en est, sans reposer la question
  if (envoyee || demande) {
    const priseEnCharge = !envoyee && demande?.statut === "traitee";
    return (
      <Modal title="Consultation PPPT + DPE collectif" onClose={onClose} width={540}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {enTete}
          {envoyee ? (
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--color-success-50)", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Icon name="checkCircle" size={18} style={{ color: "var(--color-success-700)", flex: "none", marginTop: 1 }} />
              <span style={{ fontSize: 13.5 }}>
                Demande envoyée à Strat Eco. L'équipe lance la consultation pour la réalisation du PPPT et du DPE collectif et revient vers vous.
              </span>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                {priseEnCharge ? <Badge kind="success">Prise en charge par Strat Eco</Badge> : <Badge kind="blue" dot>Demande en attente</Badge>}
                <span className="se-small" style={{ color: "var(--fg-muted)" }}>
                  Demandée le {fmtDateCourte(demande!.created_at)}
                  {demande!.demandeur_nom ? ` par ${demande!.demandeur_nom}` : ""}
                  {priseEnCharge && demande!.traite_le ? ` · prise en charge le ${fmtDateCourte(demande!.traite_le)}` : ""}
                </span>
              </div>
              {demande!.commentaire_amo && (
                <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg)", fontSize: 13.5 }}>
                  <strong style={{ fontSize: 12.5, color: "var(--fg2)" }}>Suite donnée par Strat Eco</strong>
                  <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{demande!.commentaire_amo}</div>
                </div>
              )}
              {!priseEnCharge && (
                <p className="se-small" style={{ margin: 0, color: "var(--fg-muted)" }}>
                  La consultation pour la réalisation du PPPT et du DPE collectif a déjà été demandée pour cette copropriété : l'équipe Strat Eco revient vers vous.
                </p>
              )}
            </>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {boutonFiche}
            <button type="button" className="se-btn se-btn-primary btn-sm" onClick={onClose}>Fermer</button>
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
          La demande part à l'équipe Strat Eco avec les informations de la fiche (adresse, nombre de lots, chauffage) : elle lance la consultation et revient vers vous.
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
            {demander.isPending ? "Envoi…" : "Oui, demander la consultation"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
