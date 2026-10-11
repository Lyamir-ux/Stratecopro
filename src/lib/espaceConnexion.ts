// Espace choisi sur la page de connexion (tuiles « Votre espace ») - demande d'Amir du
// 11/10/2026 : une cheffe de projet met son adresse e-mail sur une fiche copropriétaire (dossier
// de test, par exemple LES BALCONS DE LA LAUCH) ; si elle se connecte avec la tuile
// « Copropriétaire », elle est considérée comme un copropriétaire : son portail, sans le bandeau
// d'aperçu AMO, et l'espace AMO lui est fermé jusqu'à sa prochaine connexion par la tuile AMO.
// La base relie la fiche à son compte par l'adresse (0159) ; ici, seul l'affichage change.
//
// Le choix est gardé dans le navigateur avec l'identifiant du compte : comme la session, il vaut
// pour tous les onglets, et il est oublié à la déconnexion. Seul un compte AMO change d'espace :
// les autres comptes restent dans celui de leur rôle quelle que soit la tuile.
import type { RoleId } from "@/lib/referentiels";

export const CLE_ESPACE_CONNEXION = "se-espace-connexion";

export interface EspaceMemorise {
  userId: string;
  espace: RoleId;
}

const ESPACES: RoleId[] = ["amo", "syndic", "presta", "copro"];

/** Espace dans lequel la session travaille : celui du rôle du compte, sauf un compte AMO entré par la tuile Copropriétaire. */
export function espaceEffectif(
  role: string | null | undefined,
  userId: string | null | undefined,
  memorise: EspaceMemorise | null,
): RoleId | null {
  if (!role) return null;
  if (role === "amo" && userId && memorise?.userId === userId && memorise.espace === "copro") return "copro";
  return role as RoleId;
}

/** Lecture tolérante : valeur absente, illisible ou stockage indisponible = aucun choix. */
export function lireEspace(brut: string | null): EspaceMemorise | null {
  if (!brut) return null;
  try {
    const v = JSON.parse(brut) as Partial<EspaceMemorise> | null;
    if (!v || typeof v.userId !== "string" || !v.userId || !ESPACES.includes(v.espace as RoleId)) return null;
    return { userId: v.userId, espace: v.espace as RoleId };
  } catch {
    return null;
  }
}

export function lireEspaceMemorise(): EspaceMemorise | null {
  try {
    return lireEspace(localStorage.getItem(CLE_ESPACE_CONNEXION));
  } catch {
    return null;
  }
}

/** Enregistre le choix (null = l'oublie). */
export function memoriserEspace(choix: EspaceMemorise | null): void {
  try {
    if (choix) localStorage.setItem(CLE_ESPACE_CONNEXION, JSON.stringify(choix));
    else localStorage.removeItem(CLE_ESPACE_CONNEXION);
  } catch {
    // stockage indisponible (navigation privée stricte) : l'espace du rôle s'applique
  }
}
