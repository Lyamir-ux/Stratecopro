// Écran de connexion — port de design-reference/project/login.jsx
// V1 : seul l'espace AMO est actif ; les autres rôles arrivent en phase 2.
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { PasswordInput } from "@/components/PasswordInput";
import { ROLES, type RoleId } from "@/lib/referentiels";
import { homeFor } from "@/auth/RequireRole";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

export default function Login() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState<RoleId>("amo");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // page demandée avant la redirection vers /login (lien profond d'un e-mail)
  const from = (location.state as { from?: string } | null)?.from;

  if (!loading && session) return <Navigate to={from ?? "/"} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) {
      setError("Identifiants incorrects. Vérifiez votre e-mail et votre mot de passe.");
      return;
    }
    // page demandée avant connexion, sinon l'espace de la tuile choisie ;
    // RequireRole renvoie vers le bon espace si le compte n'y a pas droit
    // (seul l'AMO accède à tous les espaces)
    navigate(from ?? homeFor(role), { replace: true });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", height: "100vh" }}>
      {/* Panneau de marque */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(150deg, #213A0E 0%, #355717 55%, #4A7A1F 100%)",
          color: "#fff",
          padding: "56px 64px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <img src="/logo-strateco-white.svg" alt="Strat Eco" style={{ height: 44, alignSelf: "flex-start" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 460 }}>
          <div className="se-eyebrow" style={{ color: "rgba(255,255,255,0.7)" }}>
            Espace de pilotage AMO
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: 44,
              lineHeight: 1.06,
              letterSpacing: "-0.02em",
              margin: "14px 0 20px",
            }}
          >
            Suivez vos rénovations énergétiques, du diagnostic à la réception.
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 300,
              fontSize: 18,
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.85)",
              margin: 0,
            }}
          >
            Une plateforme partagée entre l'AMO, les syndics, la maîtrise d'œuvre et les copropriétaires.
          </p>
        </div>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: 15,
            color: "rgba(255,255,255,0.7)",
            margin: 0,
            maxWidth: 440,
          }}
        >
          « Dans un voyage ce n'est pas la destination qui compte mais toujours le chemin parcouru. »
        </p>
      </div>

      {/* Panneau de connexion */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "56px 72px",
          background: "var(--bg)",
          overflowY: "auto",
        }}
      >
        <form style={{ maxWidth: 420, width: "100%", margin: "0 auto" }} onSubmit={submit}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, margin: "0 0 6px" }}>
            Connexion
          </h2>
          <p className="se-body" style={{ marginTop: 0 }}>
            Accédez à votre espace de suivi de projet.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
            <div className="field" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>Adresse e-mail</label>
              <input
                className="login-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>Mot de passe</label>
              <PasswordInput
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="se-eyebrow" style={{ marginTop: 26, marginBottom: 12, color: "var(--fg-muted)" }}>
            Votre espace
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => r.active && setRole(r.id)}
                disabled={!r.active}
                title={r.active ? r.label : "Disponible dans une prochaine version"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  textAlign: "left",
                  cursor: r.active ? "pointer" : "not-allowed",
                  opacity: r.active ? 1 : 0.55,
                  padding: "13px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid " + (role === r.id ? "var(--accent)" : "var(--border)"),
                  background: role === r.id ? "var(--accent-soft)" : "var(--bg)",
                  boxShadow: role === r.id ? "var(--shadow-focus)" : "none",
                  transition: "all var(--dur-fast) var(--ease-out-quint)",
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "var(--radius-md)",
                    flex: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: role === r.id ? "var(--accent)" : "var(--bg-soft)",
                    color: role === r.id ? "#fff" : "var(--fg2)",
                  }}
                >
                  <Icon name={r.icon as IconName} size={19} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 14, fontFamily: "var(--font-display)" }}>
                    {r.label}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 11.5,
                      color: "var(--fg-muted)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.active ? r.sub : "Bientôt disponible"}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {error && (
            <p
              style={{
                marginTop: 16,
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

          <button className="se-btn se-btn-primary" style={{ width: "100%", marginTop: 22 }} type="submit" disabled={busy}>
            {busy ? "Connexion…" : "Se connecter"}
            <Icon name="arrowRight" size={18} />
          </button>
          <p style={{ textAlign: "center", fontSize: 13, marginTop: 16 }}>
            <Link to="/mot-de-passe-oublie" style={{ color: "var(--fg-muted)" }}>
              Mot de passe oublié ?
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
