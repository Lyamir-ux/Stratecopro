import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants - voir .env.example");
}

// Singleton résistant au rechargement à chaud (HMR) de Vite : si ce module est
// ré-évalué, on réutilise le client existant. Deux instances simultanées se
// partagent mal la session : les requêtes partent sans jeton, la RLS renvoie
// des résultats vides et l'app croit le compte non provisionné (déconnexion).
const g = globalThis as { __supabase?: SupabaseClient<Database> };
export const supabase = g.__supabase ?? (g.__supabase = createClient<Database>(url, anonKey));

/** Plafond de lignes par réponse de l'API Supabase (réglage du projet). */
export const LIGNES_PAR_PAGE = 1000;

/**
 * Toutes les lignes d'une lecture, page par page : au-delà de 1 000 lignes,
 * l'API tronque la réponse sans erreur. La requête doit suivre un ordre total
 * (clé primaire en dernier), sinon une ligne peut être sautée ou lue deux fois
 * d'une page à l'autre.
 */
export async function toutesLesLignes<T>(
  page: (debut: number, fin: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const lignes: T[] = [];
  for (let debut = 0; ; debut += LIGNES_PAR_PAGE) {
    const { data, error } = await page(debut, debut + LIGNES_PAR_PAGE - 1);
    if (error) throw error;
    lignes.push(...(data ?? []));
    if ((data?.length ?? 0) < LIGNES_PAR_PAGE) return lignes;
  }
}
