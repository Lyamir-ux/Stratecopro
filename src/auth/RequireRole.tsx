// Garde de route par rôle : chaque espace n'est accessible qu'à son rôle,
// les autres utilisateurs connectés sont renvoyés vers leur espace.
import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import type { RoleId } from "@/lib/referentiels";

/** Route d'accueil de chaque rôle (syndic/moe : phase 2, repli portail). */
export function homeFor(role: RoleId | undefined): string {
  return role === "copro" ? "/portail" : "/";
}

export function RequireRole({ role }: { role: RoleId }) {
  const { profile, loading, signOut } = useAuth();

  // session sans profil : compte non provisionné — déconnexion (hors rendu)
  useEffect(() => {
    if (!loading && !profile) void signOut();
  }, [loading, profile, signOut]);

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", color: "var(--fg-muted)" }}>
        Chargement…
      </div>
    );
  }
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.role !== role) return <Navigate to={homeFor(profile.role as RoleId)} replace />;
  return <Outlet />;
}
