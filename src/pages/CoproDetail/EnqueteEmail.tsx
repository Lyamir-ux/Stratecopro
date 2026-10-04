// E-mail d'envoi du questionnaire d'enquête - idée d'Amir du 04/10/2026 :
// « un petit bouton avant l'envoi des questionnaires pour vérifier le mail
// envoyé aux copropriétaires, afin de le modifier si nécessaire ». Deux
// fenêtres : la vérification (objet et message modifiables, aperçu fidèle à
// l'e-mail de l'edge function creer-espace-coproprietaire) et l'envoi
// (confirmation, progression, compte rendu). Les e-mails partent réellement.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { messageErreur } from "@/lib/erreurs";
import { resumeResultats, useCreerEspaces, type ResultatEspace } from "@/api/espaces";
import { useUpdateEnquete, type Enquete } from "@/api/enquete";
import {
  MAX_MESSAGE,
  MAX_SUJET,
  aEnregistrer,
  dateEnLettres,
  messageEnqueteParDefaut,
  paragraphes,
  sujetEnqueteParDefaut,
  texteEmailEnquete,
  type ClassementDestinataires,
  type Destinataire,
} from "@/lib/emailEnquete";

const APP_URL = "https://stratecopro.vercel.app";

/** L'e-mail tel que le copropriétaire le reçoit (mise en page de l'edge function). */
export function ApercuEmailEnquete({
  sujet,
  message,
  dateLimite,
  destinataire,
  espaceActif,
}: {
  sujet: string;
  message: string;
  dateLimite: string | null;
  destinataire: { nom: string; email: string | null } | null;
  espaceActif: boolean;
}) {
  const date = dateEnLettres(dateLimite);
  const email = destinataire?.email || "adresse@exemple.fr";
  return (
    <div className="mail-fiche">
      <div className="mail-entete">
        <span>
          De : <b>Strat Eco</b>
        </span>
        <span>
          À : <b>{destinataire ? destinataire.nom : "Nom du copropriétaire"}</b> · {email}
        </span>
        <span>
          Objet : <b>{sujet.trim() || "(objet vide)"}</b>
        </span>
      </div>
      <div className="mail-corps">
        <p>Bonjour {destinataire ? destinataire.nom : "[nom du copropriétaire]"},</p>
        {paragraphes(message).map((lignes, i) => (
          <p key={i}>
            {lignes.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {l}
              </span>
            ))}
          </p>
        ))}
        {date && (
          <p>
            Merci de répondre avant le <strong>{date}</strong>.
          </p>
        )}
        {espaceActif ? (
          <>
            <span className="mail-bouton">Répondre à l'enquête</span>
            <p>
              Connectez-vous avec votre adresse e-mail (<strong>{email}</strong>) et votre mot de passe habituel.
            </p>
            <p className="mail-note">
              Mot de passe oublié ? Rendez-vous sur {APP_URL}/mot-de-passe-oublie : vous recevrez un lien pour en choisir
              un nouveau.
            </p>
          </>
        ) : (
          <>
            <p>Votre espace copropriétaire est ouvert : pour y accéder, choisissez votre mot de passe.</p>
            <span className="mail-bouton">Choisir mon mot de passe</span>
            <p>
              Votre identifiant de connexion est votre adresse e-mail : <strong>{email}</strong>. Une fois votre mot de
              passe choisi, l'enquête vous attend dans la rubrique « Enquête sociale » de votre espace.
            </p>
            <p className="mail-note">
              Ce lien est personnel et valable pour une durée limitée. S'il a expiré, rendez-vous sur {APP_URL}
              /mot-de-passe-oublie et saisissez cette adresse ({email}) : vous recevrez un nouveau lien.
            </p>
          </>
        )}
        <p style={{ marginBottom: 0 }}>
          Bien cordialement,
          <br />
          <strong>L'équipe Strat Eco</strong>
        </p>
      </div>
    </div>
  );
}

/** Choix de la variante de l'aperçu (espace activé ou non). */
function VarianteApercu({ actif, onChange }: { actif: boolean; onChange: (actif: boolean) => void }) {
  return (
    <div className="opt-mini" style={{ marginBottom: 10 }}>
      <button className={actif ? "" : "on"} onClick={() => onChange(false)}>
        Espace pas encore activé
      </button>
      <button className={actif ? "on" : ""} onClick={() => onChange(true)}>
        Espace déjà activé
      </button>
    </div>
  );
}

/**
 * Vérification de l'e-mail : objet et message modifiables, enregistrés sur
 * l'enquête du dossier ; le texte proposé reste disponible en un clic.
 */
export function EmailEnqueteFenetre({
  enquete,
  copro,
  coproId,
  exemples,
  onClose,
}: {
  enquete: Enquete;
  copro: string;
  coproId: string;
  /** Destinataires de l'envoi en cours : le premier sert d'exemple dans l'aperçu. */
  exemples: Destinataire[];
  onClose: () => void;
}) {
  const update = useUpdateEnquete(coproId);
  const initial = texteEmailEnquete(enquete, copro);
  const sujetDefaut = sujetEnqueteParDefaut(copro);
  const messageDefaut = messageEnqueteParDefaut(copro);
  const [sujet, setSujet] = useState(initial.sujet);
  const [message, setMessage] = useState(initial.message);
  const [actif, setActif] = useState(() => exemples.length > 0 && exemples.every((d) => d.espaceActif));
  const [erreur, setErreur] = useState<string | null>(null);

  const exemple = exemples.find((d) => d.espaceActif === actif) ?? null;
  const modifie = sujet.trim() !== initial.sujet || message.trim() !== initial.message;
  const differentDuDefaut = sujet.trim() !== sujetDefaut || message.trim() !== messageDefaut;
  const vide = sujet.trim() === "" || message.trim() === "";

  const enregistrer = () => {
    setErreur(null);
    update.mutate(
      {
        id: enquete.id,
        email_sujet: aEnregistrer(sujet.replace(/\s+/g, " "), sujetDefaut),
        email_message: aEnregistrer(message, messageDefaut),
      },
      {
        onSuccess: onClose,
        onError: (e) => setErreur(messageErreur(e, "L'enregistrement de l'e-mail a échoué.")),
      }
    );
  };

  return (
    <Modal title="E-mail aux copropriétaires" onClose={onClose} width={720} closeOnBackdrop={!modifie}>
      <p className="se-small" style={{ marginTop: 0, color: "var(--fg-muted)" }}>
        Relisez l'e-mail qui accompagne le questionnaire et modifiez l'objet ou le message si nécessaire. La formule
        d'appel, la date limite, le bouton d'accès et la signature sont ajoutés pour chaque copropriétaire.
      </p>
      <div className="mail-champ">
        <label htmlFor="mail-sujet">Objet</label>
        <input
          id="mail-sujet"
          value={sujet}
          maxLength={MAX_SUJET}
          onChange={(e) => setSujet(e.target.value)}
        />
      </div>
      <div className="mail-champ">
        <label htmlFor="mail-message">Message</label>
        <textarea
          id="mail-message"
          rows={8}
          value={message}
          maxLength={MAX_MESSAGE}
          onChange={(e) => setMessage(e.target.value)}
        />
        <span className="hint">
          Laissez une ligne vide entre deux paragraphes. {message.length} / {MAX_MESSAGE} caractères.
        </span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg2)", margin: "4px 0 8px" }}>Aperçu</div>
      <VarianteApercu actif={actif} onChange={setActif} />
      <ApercuEmailEnquete
        sujet={sujet}
        message={message}
        dateLimite={enquete.date_limite}
        destinataire={exemple}
        espaceActif={actif}
      />

      {vide && (
        <p className="se-small" style={{ color: "var(--color-error-700)" }}>
          L'objet et le message ne peuvent pas être vides.
        </p>
      )}
      {erreur && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{erreur}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        {differentDuDefaut && (
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() => {
              setSujet(sujetDefaut);
              setMessage(messageDefaut);
            }}
            title="Remet l'objet et le message proposés par l'application"
          >
            <Icon name="undo" size={14} />
            Rétablir le texte proposé
          </button>
        )}
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-ghost btn-sm" onClick={onClose}>
          {modifie ? "Annuler" : "Fermer"}
        </button>
        <button className="se-btn se-btn-primary btn-sm" onClick={enregistrer} disabled={!modifie || vide || update.isPending}>
          <Icon name="check" size={14} />
          {update.isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </Modal>
  );
}

/** Ligne du compte rendu pour une fiche dont l'e-mail n'est pas parti. */
function libelleResultat(r: ResultatEspace): string {
  if (r.envoi === "echec") return "L'e-mail n'est pas parti, à renvoyer";
  switch (r.statut) {
    case "sans_email":
      return "Pas d'adresse e-mail valide";
    case "email_pris":
      return "Adresse déjà prise";
    case "sortant":
      return "Fiche sortante";
    case "erreur":
      return "Erreur";
    default:
      return r.detail ? "Pas d'e-mail" : "E-mail non envoyé";
  }
}

/**
 * Envoi du questionnaire : confirmation (les e-mails partent réellement),
 * progression, puis compte rendu des fiches à reprendre. L'enquête est
 * marquée envoyée dès qu'un e-mail est parti.
 */
export function EnvoyerEnqueteFenetre({
  enquete,
  copro,
  coproId,
  classement,
  onVerifier,
  onClose,
}: {
  enquete: Enquete;
  copro: string;
  coproId: string;
  classement: ClassementDestinataires;
  onVerifier: () => void;
  onClose: () => void;
}) {
  const creer = useCreerEspaces(coproId);
  const update = useUpdateEnquete(coproId);
  const [progres, setProgres] = useState(0);
  const [resultats, setResultats] = useState<ResultatEspace[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { envoyables, avecEspace, sansEspace, sansEmail, emailPris } = classement;
  const n = envoyables.length;
  const texte = texteEmailEnquete(enquete, copro);
  const date = dateEnLettres(enquete.date_limite);
  const nomDe = (r: ResultatEspace) => r.nom || envoyables.find((d) => d.id === r.id)?.nom || "Fiche";

  const lancer = () => {
    setErreur(null);
    creer.mutate(
      {
        cibles: envoyables,
        enquete: { sujet: texte.sujet, message: texte.message, date_limite: enquete.date_limite },
        onProgres: setProgres,
      },
      {
        onSuccess: (res) => {
          setResultats(res);
          const r = resumeResultats(res);
          if (r.envoyes + r.simules > 0) {
            const maintenant = new Date().toISOString();
            update.mutate({
              id: enquete.id,
              statut: "envoyee",
              sent_at: maintenant,
              email_envoye_le: maintenant,
              email_envoye_nb: r.envoyes,
            });
          }
        },
        onError: (e) => setErreur(messageErreur(e, "L'envoi du questionnaire a échoué.")),
      }
    );
  };

  const titre = "Envoyer le questionnaire";

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
              {r.envoyes} e-mail{r.envoyes > 1 ? "s" : ""} envoyé{r.envoyes > 1 ? "s" : ""} avec le questionnaire.
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
                      {libelleResultat(x)}
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
          Envoi du questionnaire… {progres}/{n}
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
    <Modal title={titre} onClose={onClose} width={580}>
      <p className="se-body" style={{ marginTop: 0 }}>
        <b>
          {n} copropriétaire{n > 1 ? "s" : ""}
        </b>{" "}
        {n > 1 ? "vont" : "va"} recevoir le questionnaire par e-mail
        {date ? <>, à rendre avant le {date}</> : ""} :
      </p>
      <ul className="se-small" style={{ marginTop: 0, paddingLeft: 18, color: "var(--fg2)" }}>
        {avecEspace > 0 && (
          <li>
            {avecEspace} avec un espace déjà activé : lien vers l'enquête de leur espace.
          </li>
        )}
        {sansEspace > 0 && (
          <li>
            {sansEspace} sans espace activé : leur espace est ouvert et l'e-mail porte le lien pour choisir leur mot de
            passe.
          </li>
        )}
      </ul>
      <div
        style={{
          maxHeight: 180,
          overflowY: "auto",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: "8px 12px",
          fontSize: 13,
          marginBottom: 12,
        }}
      >
        {envoyables.map((d) => (
          <div key={d.id} style={{ padding: "3px 0" }}>
            <b>{d.nom}</b> <span style={{ color: "var(--fg-muted)" }}>· {d.email}</span>
          </div>
        ))}
      </div>
      {sansEmail + emailPris > 0 && (
        <p className="se-small" style={{ color: "var(--fg-muted)" }}>
          Laissés de côté :{" "}
          {[
            sansEmail > 0 && `${sansEmail} sans adresse e-mail`,
            emailPris > 0 &&
              `${emailPris} dont l'adresse appartient déjà à un compte Strat Eco, syndic ou prestataire (autre adresse à saisir sur la fiche)`,
          ]
            .filter(Boolean)
            .join(" · ")}
          .
        </p>
      )}
      <div className="mail-ligne">
        <Icon name="mail" size={16} style={{ color: "var(--accent)", flex: "none" }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          Objet : <b>{texte.sujet}</b>
          {texte.modifie && <span style={{ color: "var(--fg-muted)" }}> · texte modifié</span>}
        </span>
        <button className="se-btn se-btn-ghost btn-sm" onClick={onVerifier}>
          <Icon name="eye" size={14} />
          Vérifier l'e-mail
        </button>
      </div>
      <div className="cc-next" style={{ marginTop: 12, marginBottom: 16 }}>
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
