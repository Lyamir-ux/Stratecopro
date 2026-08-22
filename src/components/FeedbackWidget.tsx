// Module « Feedback » de la version test : bouton flottant en bas à droite,
// visible sur toutes les pages connectées quel que soit le rôle. Les remarques
// partent dans la table feedbacks (compilées dans Paramètres → Retours de test).
// À la mise en production : VITE_FEEDBACK=off dans le .env pour le masquer.
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Icon } from "@/components/Icon";
import { FEEDBACK_TYPES, useEnvoyerFeedback, type FeedbackType } from "@/api/feedback";

export function FeedbackWidget() {
  const { profile } = useAuth();
  const location = useLocation();
  const envoyer = useEnvoyerFeedback();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("remarque");
  const [message, setMessage] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  if (import.meta.env.VITE_FEEDBACK === "off" || !profile) return null;

  const submit = async () => {
    const msg = message.trim();
    if (!msg || envoyer.isPending) return;
    await envoyer.mutateAsync({
      type,
      message: msg,
      page: location.pathname + location.search,
      auteurNom: profile.full_name,
      auteurRole: profile.role,
    });
    setMessage("");
    setType("remarque");
    setEnvoye(true);
    timerRef.current = window.setTimeout(() => {
      setEnvoye(false);
      setOpen(false);
    }, 2200);
  };

  return (
    <>
      {open && (
        <div className="fb-panel" role="dialog" aria-label="Feedback version test">
          <div className="fb-head">
            <Icon name="megaphone" size={16} />
            <span>Feedback - version test</span>
            <span style={{ flex: 1 }}></span>
            <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setOpen(false)} title="Fermer">
              <Icon name="x" size={15} />
            </button>
          </div>
          {envoye ? (
            <div className="fb-merci">
              <Icon name="checkCircle" size={26} />
              <p>Merci ! Votre remarque a bien été enregistrée.</p>
            </div>
          ) : (
            <div className="fb-body">
              <p className="fb-hint">
                Bug, idée d'amélioration, remarque d'ergonomie… tout retour est utile. La page en cours est jointe
                automatiquement.
              </p>
              <div className="fb-types">
                {FEEDBACK_TYPES.map((t) => (
                  <button
                    key={t.id}
                    className={"fb-chip" + (type === t.id ? " on" : "")}
                    onClick={() => setType(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea
                className="fb-textarea"
                rows={4}
                placeholder="Décrivez ce que vous avez constaté ou ce que vous suggérez…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                autoFocus
              />
              {envoyer.isError && (
                <p className="fb-error">Échec de l'envoi - réessayez ({(envoyer.error as Error).message}).</p>
              )}
              <button
                className="se-btn se-btn-primary btn-sm"
                style={{ width: "100%", justifyContent: "center" }}
                disabled={!message.trim() || envoyer.isPending}
                onClick={() => void submit()}
              >
                <Icon name="send" size={15} />
                {envoyer.isPending ? "Envoi…" : "Envoyer ma remarque"}
              </button>
            </div>
          )}
        </div>
      )}
      <button className="fb-fab" onClick={() => setOpen((o) => !o)} title="Donner mon avis sur la version test">
        <Icon name={open ? "x" : "megaphone"} size={19} />
        {!open && <span>Feedback</span>}
      </button>
    </>
  );
}
