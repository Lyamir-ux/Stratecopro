import { normaliserRecherche } from "@/lib/format";

type EntrepriseCherchable = {
  raison_sociale: string;
  ville: string | null;
  contact_nom: string | null;
};

/** Entreprises dont le nom, les métiers, la ville ou le contact contiennent la
 *  recherche, sans tenir compte des accents ni des majuscules. Recherche vide :
 *  toutes. Sert au choix de l'entreprise dans l'aperçu AMO de l'espace prestataire. */
export function filtrerEntreprises<T extends EntrepriseCherchable>(
  liste: T[],
  recherche: string,
  metiers: (p: T) => string
): T[] {
  const q = normaliserRecherche(recherche.trim());
  if (!q) return liste;
  return liste.filter((p) =>
    normaliserRecherche([p.raison_sociale, metiers(p), p.ville ?? "", p.contact_nom ?? ""].join(" ")).includes(q)
  );
}

/** Pourquoi une entreprise du métier ne peut pas recevoir l'alerte d'une
 *  consultation (null : elle peut la recevoir). Même règle que
 *  notifier-consultation : fiche active, avec un e-mail, sans « Ne pas consulter ». */
export function motifNonAlertable(p: { actif: boolean; email: string | null; ne_pas_consulter: boolean }): string | null {
  if (!p.actif) return "Fiche suspendue";
  if (!p.email?.trim()) return "Sans e-mail";
  if (p.ne_pas_consulter) return "Ne souhaite pas être consultée";
  return null;
}
