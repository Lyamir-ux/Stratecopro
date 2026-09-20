// Suivi de l'échéancier (fiche copro PPT, sous le récap des postes) : le
// syndic déplace un poste d'une année à l'autre au fil des votes. Logique pure,
// testée à part de l'écran ; la RPC ppt_decaler_postes (0073) applique.
import { anneeEffective, type PosteCalcul } from "./formules";

export type PosteEcheancier = Pick<PosteCalcul, "annee_prevue" | "annee_prochaine_presentation" | "statut">;

/** Statuts figés : un poste voté, réalisé ou abandonné ne se déplace plus. */
export const STATUTS_FIGES = new Set(["vote", "realise", "abandonne"]);

export function posteDeplacable(p: PosteEcheancier): boolean {
  return !STATUTS_FIGES.has(p.statut ?? "");
}

/** Année affichée pour un poste, brouillon compris. */
export function anneeAffichee(p: PosteEcheancier, brouillon: Record<string, number>, id: string): number | null {
  return brouillon[id] ?? anneeEffective(p);
}

/**
 * Colonnes du suivi : de la plus petite année (postes, année courante) jusqu'à
 * la plus grande (année courante + 10, ou le poste le plus lointain + 1), sans
 * trou. Il y a toujours une colonne libre après le dernier poste : un PPT peut
 * dépasser dix ans et la flèche verte doit toujours avoir une cible (bug 20/09).
 */
export function plageAnnees(postes: PosteEcheancier[], anneeCourante: number, brouillon: Record<string, number> = {}, ids: string[] = []): number[] {
  const annees = postes.map((p, i) => anneeAffichee(p, brouillon, ids[i] ?? "")).filter((a): a is number => a != null);
  const min = Math.min(anneeCourante, ...annees);
  const max = Math.max(anneeCourante + 10, ...annees.map((a) => a + 1));
  return Array.from({ length: max - min + 1 }, (_, k) => min + k);
}

/**
 * Décalages à envoyer : uniquement ceux qui changent l'année effective.
 * Un retour sur l'année prévue au plan est envoyé aussi (la RPC remet
 * annee_prochaine_presentation à null).
 */
export function decalagesEffectifs<T extends PosteEcheancier & { id: string }>(postes: T[], brouillon: Record<string, number>): { poste_id: string; annee: number }[] {
  const out: { poste_id: string; annee: number }[] = [];
  for (const p of postes) {
    const a = brouillon[p.id];
    if (a == null || !posteDeplacable(p)) continue;
    if (a !== anneeEffective(p)) out.push({ poste_id: p.id, annee: a });
  }
  return out;
}
