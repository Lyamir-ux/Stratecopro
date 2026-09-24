// Texte d'une erreur à afficher à l'écran.
// Les erreurs de Supabase (PostgREST, RPC) arrivent en objets simples
// { message, code, details, hint }, pas en instances d'Error : un test
// « e instanceof Error » les écartait et l'écran n'affichait que le texte de
// secours (feedback Amir 24/09 : « Retour en vérification refusé - Retour en
// vérification refusé » au lieu du motif donné par la base).

export function messageErreur(e: unknown, defaut: string): string {
  if (typeof e === "string" && e.trim()) return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return defaut;
}
