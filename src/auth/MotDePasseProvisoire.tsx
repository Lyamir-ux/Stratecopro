// Verrou de première connexion : un compte créé par le dirigeant porte un
// mot de passe provisoire (métadonnée mot_de_passe_provisoire posée par
// l'edge function creer-collaborateur). Tant qu'il n'est pas remplacé, tout
// l'espace connecté est bloqué : le collaborateur reçoit ici le lien
// « Mot de passe oublié » et définit son mot de passe personnel sur
// /reinitialisation, qui efface le marqueur.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";

export function MotDePasseProvisoire({ email }: { email: string }) {
  const { signOut } = useAuth();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const envoyer = async () => {
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reinitialisation`,
    });
    setBusy(false);
    if (err) {
      const { code, status } = err as { code?: string; status?: number };
      setError(
        code === "over_request_rate_limit" || status === 429
          ? "Un lien vient déjà d'être envoyé. Patientez une minute avant d'en redemander un."
          : "L'envoi a échoué. Réessayez dans quelques instants.",
      );
      return;
    }
    setSent(true);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg-soft)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          padding: "36px 40px",
        }}
      >
        <img src="/logo-strateco-pro.png" alt="Strat Eco" style={{ height: 36, marginBottom: 24 }} />
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, margin: "0 0 10px" }}>
          Bienvenue ! Définissez votre mot de passe
        </h1>
        {sent ? (
          <p className="se-body" style={{ marginTop: 0 }}>
            Un e-mail vient d'être envoyé à <strong>{email}</strong> : cliquez sur le lien qu'il contient
            pour choisir votre mot de passe personnel, puis reconnectez-vous. Pensez à vérifier vos
            courriers indésirables.
          </p>
        ) : (
          <p className="se-body" style={{ marginTop: 0 }}>
            Votre compte <strong>{email}</strong> a été créé avec un <strong>mot de passe provisoire</strong>.
            Avant d'accéder au progiciel, vous devez le remplacer par un mot de passe personnel : nous vous
            envoyons un lien de réinitialisation par e-mail.
          </p>
        )}

        {error && (
          <p
            style={{
              marginTop: 14,
              marginBottom: 0,
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              background: "var(--color-error-50)",
              color: "var(--color-error-700)",
              fontSize: 13.5,
            }}
          >
            {error}
          </p>
        )}

        {!sent && (
          <button
            className="se-btn se-btn-primary"
            style={{ width: "100%", marginTop: 18 }}
            disabled={busy}
            onClick={() => void envoyer()}
          >
            {busy ? "Envoi…" : "Recevoir le lien par e-mail"}
            <Icon name="arrowRight" size={18} />
          </button>
        )}

        <p style={{ textAlign: "center", fontSize: 13, marginTop: 16, marginBottom: 0 }}>
          <button
            onClick={() => void signOut()}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: 13 }}
          >
            Se déconnecter
          </button>
        </p>
      </div>
    </div>
  );
}
