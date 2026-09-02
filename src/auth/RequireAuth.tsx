import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { MotDePasseProvisoire } from "./MotDePasseProvisoire";
import { FeedbackWidget } from "@/components/FeedbackWidget";

export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", color: "var(--fg-muted)" }}>
        Chargement…
      </div>
    );
  }
  if (!session) {
    // mémorise la page demandée (lien profond d'un e-mail par ex.) :
    // la page de connexion y renverra après authentification
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  // compte créé par le dirigeant : mot de passe provisoire à remplacer avant
  // tout accès (le marqueur est effacé par la page /reinitialisation)
  if (session.user.user_metadata?.mot_de_passe_provisoire && session.user.email) {
    return <MotDePasseProvisoire email={session.user.email} />;
  }
  return (
    <>
      <Outlet />
      {/* version test : module de remarques flottant, commun à tous les espaces */}
      <FeedbackWidget />
    </>
  );
}
