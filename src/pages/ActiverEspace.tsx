// Activation de l'espace copropriétaire - page d'atterrissage de l'e-mail
// envoyé par l'edge function creer-espace-coproprietaire (feedback du
// 30/09/2026). Le lien porte le jeton de récupération (token_hash) mais ne le
// consomme pas : certaines messageries (Outlook, filtres de sécurité)
// ouvrent les liens pour les analyser, et un lien Supabase direct aurait été
// « déjà utilisé » avant le copropriétaire. Le jeton n'est vérifié qu'au clic
// sur le bouton ; la session ouverte mène à /reinitialisation, qui fait
// choisir le mot de passe.
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { supabase } from "@/lib/supabase";

export default function ActiverEspace() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenHash = params.get("token_hash");
  const [busy, setBusy] = useState(false);
  const [expire, setExpire] = useState(false);

  const activer = async () => {
    if (!tokenHash) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    setBusy(false);
    if (error) {
      setExpire(true);
      return;
    }
    navigate("/reinitialisation", { replace: true });
  };

  const card = (content: ReactNode) => (
    <div className="auth-fond">
      <div className="auth-carte">
        <img src="/logo-strateco-pro.png" alt="Strat Eco" style={{ height: 36, marginBottom: 24 }} />
        {content}
      </div>
    </div>
  );

  if (!tokenHash || expire) {
    return card(
      <>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, margin: "0 0 10px" }}>
          Lien invalide ou expiré
        </h1>
        <p className="se-body" style={{ marginTop: 0 }}>
          Ce lien d'activation n'est plus valable. Saisissez votre adresse e-mail sur la page suivante : vous recevrez un
          nouveau lien pour choisir votre mot de passe.
        </p>
        <Link
          to="/mot-de-passe-oublie"
          className="se-btn se-btn-primary"
          style={{ width: "100%", marginTop: 18, justifyContent: "center" }}
        >
          Recevoir un nouveau lien
        </Link>
      </>
    );
  }

  return card(
    <>
      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, margin: "0 0 10px" }}>
        Votre espace copropriétaire
      </h1>
      <p className="se-body" style={{ marginTop: 0 }}>
        Bienvenue ! Pour activer votre espace, choisissez votre mot de passe. Votre identifiant de connexion sera votre
        adresse e-mail.
      </p>
      <button
        className="se-btn se-btn-primary"
        style={{ width: "100%", marginTop: 18, justifyContent: "center" }}
        onClick={() => void activer()}
        disabled={busy}
      >
        {busy ? "Vérification…" : "Choisir mon mot de passe"}
        {!busy && <Icon name="arrowRight" size={18} />}
      </button>
    </>
  );
}
