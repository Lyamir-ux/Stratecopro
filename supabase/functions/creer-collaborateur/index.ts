// Edge function « creer-collaborateur » - création d'un compte collaborateur
// depuis la page /collaborateurs (demande d'Amir du 02/09/2026). Réservée au
// dirigeant : crée l'utilisateur Supabase (e-mail confirmé d'office) avec un
// mot de passe provisoire généré ici, puis sa fiche profil AMO (niveau
// pièces 2 par défaut, le plus restrictif). Le mot de passe est renvoyé UNE
// SEULE FOIS au dirigeant pour transmission ; le compte est marqué
// « mot_de_passe_provisoire » : le collaborateur est bloqué à sa première
// connexion tant qu'il n'a pas défini son mot de passe personnel via le
// parcours « Mot de passe oublié ».
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Mot de passe provisoire lisible : 3 blocs de 4 caractères sans ambiguïté (O/0, l/1…). */
function genererMotDePasse(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const octets = new Uint8Array(12);
  crypto.getRandomValues(octets);
  const chars = Array.from(octets, (o) => alphabet[o % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`;
}

/** Initiales : première lettre du premier et du dernier mot du nom. */
function initialesDe(nom: string): string {
  const mots = nom.trim().split(/\s+/);
  const premiere = mots[0]?.[0] ?? "";
  const derniere = mots.length > 1 ? mots[mots.length - 1][0] : (mots[0]?.[1] ?? "");
  return (premiere + derniere).toUpperCase();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- L'appelant doit être le dirigeant (AMO actif) ---
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });

  const { data: appelant } = await admin
    .from("profiles")
    .select("role, active, dirigeant")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!appelant || !appelant.active || appelant.role !== "amo" || !appelant.dirigeant) {
    return json(403, { error: "Seul le dirigeant peut créer un collaborateur" });
  }

  const { email, full_name, job_title } = await req.json().catch(() => ({}));
  const nom = typeof full_name === "string" ? full_name.trim() : "";
  const adresse = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!nom || !adresse) return json(400, { error: "email et full_name requis" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) return json(400, { error: "Adresse e-mail invalide" });

  // --- Compte Supabase : e-mail confirmé d'office (connexion immédiate avec
  //     le mot de passe provisoire), marqueur de première connexion ---
  const motDePasse = genererMotDePasse();
  const { data: cree, error: creeErr } = await admin.auth.admin.createUser({
    email: adresse,
    password: motDePasse,
    email_confirm: true,
    user_metadata: { full_name: nom, mot_de_passe_provisoire: true },
  });
  if (creeErr || !cree.user) {
    const deja = creeErr?.code === "email_exists" || /already/i.test(creeErr?.message ?? "");
    return json(deja ? 409 : 500, {
      error: deja ? "Un compte existe déjà avec cette adresse e-mail" : "La création du compte a échoué",
    });
  }

  // --- Fiche profil AMO (niveau_pieces reste au défaut 2, le plus restrictif) ---
  const { error: profilErr } = await admin.from("profiles").insert({
    user_id: cree.user.id,
    full_name: nom,
    initials: initialesDe(nom),
    role: "amo",
    job_title: typeof job_title === "string" && job_title.trim() ? job_title.trim() : null,
  });
  if (profilErr) {
    // rollback : pas de compte orphelin sans fiche
    await admin.auth.admin.deleteUser(cree.user.id);
    console.error("Création du profil :", profilErr.message);
    return json(500, { error: "La création de la fiche collaborateur a échoué" });
  }

  return json(200, { user_id: cree.user.id, email: adresse, mot_de_passe: motDePasse });
});
