// Garde de route par rôle : chaque espace n'est accessible qu'à son rôle,
// les autres utilisateurs connectés sont renvoyés vers leur espace.
// Exception : l'AMO accède à TOUS les espaces (aperçu syndic / copropriétaire /
// prestataire pour le pilotage et les démonstrations) - sauf quand il s'est connecté
// par la tuile « Copropriétaire » : la session est alors celle d'un copropriétaire
// (espace effectif, lib/espaceConnexion.ts, demande d'Amir du 11/10/2026).
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

/** Chemin de l'application reçu dans un lien (« /prestataire/… »), ou null s'il mène ailleurs. */
export function cheminInterne(chemin: string | null | undefined): string | null {
  return chemin && /^\/(?![/\\])/.test(chemin) ? chemin : null;
}

export function RequireRole({ role }: { role: RoleId }) {
  const { profile, espace, loading, signOut } = useAuth();

  // session sans profil : compte non provisionné - déconnexion après un délai
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
  const espaceSession = espace ?? (profile.role as RoleId);
  if (espaceSession !== role && espaceSession !== "amo") {
    return <Navigate to={homeFor(espaceSession)} replace />;
  }
  return <Outlet />;
}
