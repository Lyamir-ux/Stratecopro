import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
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
  return (
    <>
      <Outlet />
      {/* version test : module de remarques flottant, commun à tous les espaces */}
      <FeedbackWidget />
    </>
  );
}
