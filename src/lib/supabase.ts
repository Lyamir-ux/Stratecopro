import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants — voir .env.example");
}

// Singleton résistant au rechargement à chaud (HMR) de Vite : si ce module est
// ré-évalué, on réutilise le client existant. Deux instances simultanées se
// partagent mal la session : les requêtes partent sans jeton, la RLS renvoie
// des résultats vides et l'app croit le compte non provisionné (déconnexion).
const g = globalThis as { __supabase?: SupabaseClient<Database> };
export const supabase = g.__supabase ?? (g.__supabase = createClient<Database>(url, anonKey));
