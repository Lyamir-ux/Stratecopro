// Mot de passe oublié - envoie le lien de réinitialisation Supabase.
// Le lien renvoie vers /reinitialisation (URL à autoriser dans Supabase
// Auth → URL Configuration → Redirect URLs).
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { supabase } from "@/lib/supabase";

export default function MotDePasseOublie() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reinitialisation`,
    });
    setBusy(false);
    if (err) {
      const { code, status } = err as { code?: string; status?: number };
      if (code === "email_address_invalid") {
        setError(
          "Cette adresse ne peut pas recevoir d'e-mail (domaine inexistant ou boîte injoignable). Vérifiez la saisie.",
        );
      } else if (code === "over_request_rate_limit" || status === 429) {
        setError(
          "Un lien vient déjà d'être envoyé à cette adresse. Patientez une minute avant d'en redemander un - et pensez à vérifier vos courriers indésirables.",
        );
      } else if (code === "over_email_send_rate_limit") {
        setError("Trop de demandes d'envoi pour le moment. Réessayez dans une heure.");
      } else {
        setError("L'envoi a échoué. Réessayez dans quelques instants.");
      }
      return;
    }
    // même message que le compte existe ou non (pas d'énumération d'e-mails)
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
          maxWidth: 440,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          padding: "36px 40px",
        }}
      >
        <img src="/logo-strateco-pro.png" alt="Strat Eco" style={{ height: 36, marginBottom: 24 }} />

        {sent ? (
          <>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, margin: "0 0 10px" }}>
              E-mail envoyé
            </h1>
            <p className="se-body" style={{ marginTop: 0 }}>
              Si un compte existe pour <strong>{email}</strong>, vous recevrez dans quelques minutes un e-mail avec
              un lien pour choisir un nouveau mot de passe. Pensez à vérifier vos courriers indésirables.
            </p>
            <Link to="/login" className="se-btn" style={{ width: "100%", marginTop: 18, justifyContent: "center" }}>
              Retour à la connexion
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, margin: "0 0 6px" }}>
              Mot de passe oublié
            </h1>
            <p className="se-body" style={{ marginTop: 0 }}>
              Indiquez l'adresse e-mail de votre compte : nous vous enverrons un lien pour définir un nouveau mot de
              passe.
            </p>

            <div className="field" style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>Adresse e-mail</label>
              <input
                className="login-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

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

            <button
              className="se-btn se-btn-primary"
              style={{ width: "100%", marginTop: 20 }}
              type="submit"
              disabled={busy}
            >
              {busy ? "Envoi…" : "Envoyer le lien"}
              <Icon name="arrowRight" size={18} />
            </button>
            <p style={{ textAlign: "center", fontSize: 13, marginTop: 16, marginBottom: 0 }}>
              <Link to="/login" style={{ color: "var(--fg-muted)" }}>
                Retour à la connexion
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
