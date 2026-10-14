// Activation de l'espace copropriétaire - page d'atterrissage de l'e-mail
// envoyé par l'edge function creer-espace-coproprietaire (feedback du
// 30/09/2026). Le lien porte le jeton de récupération (token_hash) mais ne le
// consomme pas : certaines messageries (Outlook, filtres de sécurité)
// ouvrent les liens pour les analyser, et un lien Supabase direct aurait été
// « déjà utilisé » avant le copropriétaire. Le jeton n'est vérifié qu'au clic
// sur le bouton ; la session ouverte mène à /reinitialisation, qui fait
// choisir le mot de passe.
// Même page pour l'accès des prestataires depuis le 01/10/2026 (0123, edge
// function creer-espace-prestataire) : le lien porte alors espace=prestataire.
// Depuis le 12/10/2026, le lien d'accès joint à une consultation
// (notifier-consultation v18) porte aussi suite=<chemin de la consultation> :
// la personne y arrive une fois son mot de passe choisi.
// Depuis le 14/10/2026, l'e-mail « Mot de passe oublié » envoyé par le mailer
// Supabase pointe aussi ici (via /reinitialisation?token_hash=..., qui renvoie
// avec motif=reinit) : même protection contre les filtres qui ouvrent les
// liens, et un texte de réinitialisation plutôt que de bienvenue.
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { supabase } from "@/lib/supabase";
import { cheminInterne } from "@/auth/RequireRole";

export default function ActiverEspace() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenHash = params.get("token_hash");
  const reinit = params.get("motif") === "reinit";
  const espace = params.get("espace") === "prestataire" ? "Votre espace prestataire" : "Votre espace copropriétaire";
  const suite = cheminInterne(params.get("suite"));
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
    navigate("/reinitialisation", { replace: true, state: suite ? { suite } : undefined });
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
          Ce lien n'est plus valable : il a expiré, il a déjà été ouvert, ou un e-mail plus récent l'a remplacé (seul le
          dernier e-mail reçu fonctionne). Vérifiez d'abord votre boîte de réception et vos courriers indésirables ;
          sinon saisissez votre adresse e-mail sur la page suivante pour recevoir un nouveau lien.
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
        {reinit ? "Nouveau mot de passe" : espace}
      </h1>
      <p className="se-body" style={{ marginTop: 0 }}>
        {reinit
          ? "Vous avez demandé à réinitialiser votre mot de passe. Cliquez ci-dessous pour en choisir un nouveau."
          : "Bienvenue ! Pour activer votre espace, choisissez votre mot de passe. Votre identifiant de connexion sera votre adresse e-mail."}
      </p>
      <button
        className="se-btn se-btn-primary"
        style={{ width: "100%", marginTop: 18, justifyContent: "center" }}
        onClick={() => void activer()}
        disabled={busy}
      >
        {busy ? "Vérification…" : reinit ? "Choisir un nouveau mot de passe" : "Choisir mon mot de passe"}
        {!busy && <Icon name="arrowRight" size={18} />}
      </button>
    </>
  );
}
