// Statut d'une tâche du dossier : la pastille se clique pour passer à l'état suivant
// (à faire, en cours, fait), dans l'onglet Projet comme dans « Vos tâches »
// (retour d'Amir du 11/10/2026 : sur /taches, la pastille ouvrait le projet au lieu de
// changer l'état).

export type StatutTacheAmo = "todo" | "doing" | "done";

export const STATUT_TACHE_SUIVANT: Record<StatutTacheAmo, StatutTacheAmo> = {
  todo: "doing",
  doing: "done",
  done: "todo",
};

/**
 * Liste des tâches ouvertes de « Vos tâches » après un changement de statut : la tâche prend son
 * nouveau statut, et sort de la liste dès qu'elle est faite (la page ne montre que les tâches
 * non terminées). Sert à l'affichage immédiat, avant la réponse du serveur.
 */
export function appliquerStatutOuvertes<T extends { id: string; status: StatutTacheAmo }>(
  taches: readonly T[],
  id: string,
  status: StatutTacheAmo
): T[] {
  return taches.map((t) => (t.id === id ? { ...t, status } : t)).filter((t) => t.status !== "done");
}
