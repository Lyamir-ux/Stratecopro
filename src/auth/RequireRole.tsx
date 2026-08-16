// Garde de route par rôle : chaque espace n'est accessible qu'à son rôle,
// les autres utilisateurs connectés sont renvoyés vers leur espace.
// Exception : l'AMO accède à TOUS les espaces (aperçu syndic / copropriétaire /
// prestataire pour le pilotage et les démonstrations).
import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import type { RoleId } from "@/lib/referentiels";

/** Route d'accueil de chaque rôle. */
export function homeFor(role: RoleId | undefined): string {
  if (role === "copro") return "/portail";
  if (role === "presta") return "/prestataire";
  if (role === "syndic") return "/syndic";
  return "/";
}

export function RequireRole({ role }: { role: RoleId }) {
  const { profile, loading, signOut } = useAuth();

  // session sans profil : compte non provisionné — déconnexion après un délai
  // de grâce. L'état « session sans profil » est transitoire pendant une
  // fraction de seconde au moment de la connexion (le profil charge encore) :
  // déconnecter immédiatement coupait des connexions valides. Si le profil
  // arrive entre-temps, le minuteur est annulé.
  useEffect(() => {
    if (loading || profile) return;
    const t = setTimeout(() => void signOut(), 1500);
    return () => clearTimeout(t);
  }, [loading, profile, signOut]);

  if (loading || !profile) {
    // profil manquant : on reste sur l'écran de chargement pendant le délai
    // de grâce ; la déconnexion ci-dessus ramènera à /login si besoin
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", color: "var(--fg-muted)" }}>
        Chargement…
      </div>
    );
  }
  if (profile.role !== role && profile.role !== "amo") {
    return <Navigate to={homeFor(profile.role as RoleId)} replace />;
  }
  return <Outlet />;
}
