// Réinitialisation du mot de passe — page d'atterrissage du lien envoyé
// par Supabase (resetPasswordForEmail). Le lien ouvre une session de
// récupération ; sans session valide, le lien est expiré ou déjà utilisé.
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { PasswordInput } from "@/components/PasswordInput";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { homeFor } from "@/auth/RequireRole";
import type { RoleId } from "@/lib/referentiels";

export default function Reinitialisation() {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne sont pas identiques.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(
        err.message.includes("different from the old")
          ? "Le nouveau mot de passe doit être différent de l'ancien."
          : "La mise à jour a échoué. Le lien a peut-être expiré : refaites une demande depuis « Mot de passe oublié »."
      );
      return;
    }
    setDone(true);
  };

  const card = (content: ReactNode) => (
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
        {content}
      </div>
    </div>
  );

  if (loading) {
    return card(<p className="se-body" style={{ margin: 0 }}>Vérification du lien…</p>);
  }

  // pas de session : lien expiré, déjà utilisé, ou arrivée directe sur la page
  if (!session) {
    return card(
      <>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, margin: "0 0 10px" }}>
          Lien invalide ou expiré
        </h1>
        <p className="se-body" style={{ marginTop: 0 }}>
          Ce lien de réinitialisation n'est plus valable. Refaites une demande pour en recevoir un nouveau.
        </p>
        <Link
          to="/mot-de-passe-oublie"
          className="se-btn se-btn-primary"
          style={{ width: "100%", marginTop: 18, justifyContent: "center" }}
        >
          Demander un nouveau lien
        </Link>
      </>
    );
  }

  if (done) {
    return card(
      <>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, margin: "0 0 10px" }}>
          Mot de passe modifié
        </h1>
        <p className="se-body" style={{ marginTop: 0 }}>
          Votre nouveau mot de passe est enregistré. Vous êtes connecté(e) : vous pouvez accéder directement à votre
          espace.
        </p>
        <button
          className="se-btn se-btn-primary"
          style={{ width: "100%", marginTop: 18 }}
          onClick={() => navigate(homeFor(profile?.role as RoleId | undefined), { replace: true })}
        >
          Accéder à mon espace
          <Icon name="arrowRight" size={18} />
        </button>
      </>
    );
  }

  return card(
    <form onSubmit={submit}>
      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, margin: "0 0 6px" }}>
        Nouveau mot de passe
      </h1>
      <p className="se-body" style={{ marginTop: 0 }}>
        Choisissez un nouveau mot de passe pour le compte <strong>{session.user.email}</strong>.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
        <div className="field" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>
            Nouveau mot de passe (8 caractères min.)
          </label>
          <PasswordInput
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="field" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>Confirmez le mot de passe</label>
          <PasswordInput
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
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

      <button className="se-btn se-btn-primary" style={{ width: "100%", marginTop: 20 }} type="submit" disabled={busy}>
        {busy ? "Enregistrement…" : "Enregistrer le mot de passe"}
        <Icon name="arrowRight" size={18} />
      </button>
    </form>
  );
}
