// Espaces copropriétaires (portail) - pastille d'état et fenêtre d'ouverture,
// partagées par l'onglet Copropriétaires et l'onglet Enquête (feedback d'Amir
// du 30/09/2026). L'espace s'ouvre seulement sur un clic de l'AMO ; les
// e-mails partent réellement, d'où la confirmation.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { fmtDate } from "@/lib/format";
import {
  resumeResultats,
  useCreerEspaces,
  type EspaceCoproprietaire,
  type ResultatEspace,
} from "@/api/espaces";

export function EspaceBadge({ espace }: { espace: EspaceCoproprietaire | undefined }) {
  if (!espace) return <span style={{ color: "var(--fg-muted)" }}>-</span>;
  switch (espace.etat) {
    case "actif":
      return <Badge kind="success">Activé</Badge>;
    case "invite":
      return (
        <span title={`E-mail d'activation envoyé${espace.inviteLe ? ` le ${fmtDate(espace.inviteLe)}` : ""}, lien pas encore utilisé`}>
          <Badge kind="warn">Invité</Badge>
        </span>
      );
    case "a_creer":
      return <Badge kind="neutral">À créer</Badge>;
    case "email_pris":
      return (
        <span className="badge b-error" title="Adresse déjà utilisée par un compte Strat Eco, syndic ou prestataire : saisissez une autre adresse sur la fiche">
          Adresse prise
        </span>
      );
    default:
      return <span style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>Sans e-mail</span>;
  }
}

export interface CibleEspace {
  id: string;
  nom: string;
  email: string | null;
}

const LIBELLE_STATUT: Record<ResultatEspace["statut"], string> = {
  invite: "Espace créé",
  relie: "Relié à son compte existant",
  renvoye: "E-mail renvoyé",
  deja_actif: "Espace déjà activé, rien à envoyer",
  sans_email: "Pas d'adresse e-mail valide",
  sortant: "Fiche sortante",
  email_pris: "Adresse déjà prise",
  erreur: "Erreur",
};

/**
 * Fenêtre d'ouverture des espaces : confirmation (les e-mails partent
 * réellement), progression, puis compte rendu fiche par fiche des cas à reprendre.
 */
export function OuvrirEspacesFenetre({
  coproId,
  cibles,
  renvoi = false,
  ignores,
  onClose,
}: {
  coproId: string;
  cibles: CibleEspace[];
  /** Fiche unique déjà invitée : nouvel e-mail d'activation. */
  renvoi?: boolean;
  /** Fiches écartées d'avance (sans e-mail, adresse prise), pour information. */
  ignores?: { sansEmail: number; emailPris: number };
  onClose: () => void;
}) {
  const creer = useCreerEspaces(coproId);
  const [progres, setProgres] = useState(0);
  const [resultats, setResultats] = useState<ResultatEspace[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const n = cibles.length;
  const seul = n === 1 ? cibles[0] : null;
  const nomDe = (r: ResultatEspace) => r.nom || cibles.find((c) => c.id === r.id)?.nom || "Fiche";

  const lancer = () => {
    setErreur(null);
    creer.mutate(
      { ids: cibles.map((c) => c.id), onProgres: setProgres },
      {
        onSuccess: setResultats,
        onError: (e) => setErreur(e instanceof Error ? e.message : "L'ouverture des espaces a échoué."),
      }
    );
  };

  const titre = seul ? `Espace de ${seul.nom}` : "Créer les espaces manquants";

  // ---------- Compte rendu ----------
  if (resultats) {
    const r = resumeResultats(resultats);
    const aReprendre = resultats.filter((x) => x.envoi !== "envoye");
    return (
      <Modal title={titre} onClose={onClose} width={620}>
        <p className="se-body" style={{ marginTop: 0 }}>
          {r.envoyes > 0 ? (
            <>
              <Icon name="checkCircle" size={16} style={{ color: "var(--color-success-500)", verticalAlign: "-3px" }} />{" "}
              {r.envoyes} e-mail{r.envoyes > 1 ? "s" : ""} d'accès envoyé{r.envoyes > 1 ? "s" : ""}.
            </>
          ) : (
            "Aucun e-mail n'est parti."
          )}
          {r.simules > 0 && ` ${r.simules} en simulation (clé d'envoi absente du serveur).`}
        </p>
        {aReprendre.length > 0 && (
          <div className="tablewrap" style={{ maxHeight: 320, overflowY: "auto", marginBottom: 14 }}>
            <table className="dossiers" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Copropriétaire</th>
                  <th>Résultat</th>
                </tr>
              </thead>
              <tbody>
                {aReprendre.map((x) => (
                  <tr key={x.id} style={{ cursor: "default" }}>
                    <td style={{ fontWeight: 600 }}>{nomDe(x)}</td>
                    <td>
                      {LIBELLE_STATUT[x.statut]}
                      {x.envoi === "echec" && " - l'e-mail n'est pas parti, à renvoyer"}
                      {x.detail && <span style={{ color: "var(--fg-muted)" }}> - {x.detail}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="se-btn se-btn-primary btn-sm" onClick={onClose}>
            Fermer
          </button>
        </div>
      </Modal>
    );
  }

  // ---------- Envoi en cours ----------
  if (creer.isPending) {
    const pct = n ? Math.round((progres / n) * 100) : 0;
    return (
      <Modal title={titre} onClose={() => {}} width={520} closeOnBackdrop={false}>
        <p className="se-body" style={{ marginTop: 0 }}>
          Ouverture des espaces et envoi des e-mails… {progres}/{n}
        </p>
        <div className="prog">
          <i style={{ width: pct + "%" }}></i>
        </div>
        <p className="se-small" style={{ color: "var(--fg-muted)", marginBottom: 0 }}>
          Les e-mails sont espacés de quelques instants : gardez cette fenêtre ouverte.
        </p>
      </Modal>
    );
  }

  // ---------- Confirmation ----------
  return (
    <Modal title={titre} onClose={onClose} width={560}>
      {seul ? (
        <p className="se-body" style={{ marginTop: 0 }}>
          {renvoi ? (
            <>
              Un nouvel e-mail d'activation va partir à <b>{seul.email}</b> : le lien précédent n'a pas encore été
              utilisé.
            </>
          ) : (
            <>
              <b>{seul.nom}</b> va recevoir à <b>{seul.email}</b> un e-mail avec un lien pour choisir son mot de passe
              et accéder à son espace copropriétaire.
            </>
          )}
        </p>
      ) : (
        <>
          <p className="se-body" style={{ marginTop: 0 }}>
            <b>{n} copropriétaire{n > 1 ? "s" : ""}</b> {n > 1 ? "vont" : "va"} recevoir un e-mail avec un lien pour
            choisir leur mot de passe et accéder à leur espace :
          </p>
          <div
            style={{
              maxHeight: 200,
              overflowY: "auto",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {cibles.map((c) => (
              <div key={c.id} style={{ padding: "3px 0" }}>
                <b>{c.nom}</b> <span style={{ color: "var(--fg-muted)" }}>· {c.email}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {ignores && ignores.sansEmail + ignores.emailPris > 0 && (
        <p className="se-small" style={{ color: "var(--fg-muted)" }}>
          Laissés de côté :{" "}
          {[
            ignores.sansEmail > 0 && `${ignores.sansEmail} sans adresse e-mail`,
            ignores.emailPris > 0 &&
              `${ignores.emailPris} dont l'adresse appartient déjà à un compte Strat Eco, syndic ou prestataire (autre adresse à saisir sur la fiche)`,
          ]
            .filter(Boolean)
            .join(" · ")}
          .
        </p>
      )}
      <div className="cc-next" style={{ marginTop: 4, marginBottom: 16 }}>
        <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
        <span>Les e-mails partent réellement, aux adresses des fiches.</span>
      </div>
      {erreur && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{erreur}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button className="se-btn se-btn-ghost btn-sm" onClick={onClose}>
          Annuler
        </button>
        <button className="se-btn se-btn-primary btn-sm" onClick={lancer} disabled={n === 0}>
          <Icon name="send" size={14} />
          {n > 1 ? `Envoyer ${n} e-mails` : "Envoyer l'e-mail"}
        </button>
      </div>
    </Modal>
  );
}
