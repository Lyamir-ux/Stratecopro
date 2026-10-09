// Edge function « modifier-email-compte » - changement de l'adresse e-mail d'un
// compte syndic (membre d'une enseigne), depuis Paramètres → Organisations
// (feedback d'Amir du 05/10/2026 : « je dois voir les mails de chaque
// gestionnaire et autres, et pouvoir les modifier en direct »).
//
// Réservée au dirigeant, comme toute opération sur les comptes (voir
// creer-collaborateur). L'e-mail est l'identifiant de connexion : le compte est
// modifié avec une adresse confirmée d'office (l'équipe la saisit en
// connaissance de cause ; l'utilisateur se connecte avec la nouvelle adresse,
// son mot de passe est inchangé). Aucun e-mail n'est envoyé.
//
// L'adresse sert aussi à désigner le gestionnaire d'un dossier
// (coproprietes.gestionnaire_email, ppt_coproprietes.gestionnaire_email) : une
// fois le compte modifié, la fonction SQL propager_email_compte (0140) reporte
// l'ancienne adresse sur ces dossiers, sans quoi ils redeviendraient « non
// attribués ». Si cette propagation échoue, l'adresse du compte est rétablie.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- L'appelant : le dirigeant (AMO actif) ---
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });

  const { data: appelant } = await admin
    .from("profiles")
    .select("role, active, dirigeant")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!appelant || !appelant.active) return json(403, { error: "Profil inactif" });
  if (appelant.role !== "amo" || appelant.dirigeant !== true) {
    return json(403, { error: "Seul le dirigeant de Strat Eco peut modifier l'adresse e-mail d'un compte" });
  }

  const { user_id, email } = await req.json().catch(() => ({}));
  const adresse = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (typeof user_id !== "string" || !user_id || !adresse) return json(400, { error: "user_id et email requis" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) return json(400, { error: "Adresse e-mail invalide" });

  // --- Le compte visé : un compte syndic (membre d'enseigne), jamais un compte AMO ---
  const { data: cible } = await admin
    .from("profiles")
    .select("role, full_name")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!cible) return json(404, { error: "Compte introuvable" });
  if (cible.role !== "syndic") {
    return json(403, { error: "Seule l'adresse d'un compte syndic peut être modifiée ici" });
  }
  const { data: actuel, error: actuelErr } = await admin.auth.admin.getUserById(user_id);
  const ancienne = actuel?.user?.email?.trim().toLowerCase();
  if (actuelErr || !ancienne) return json(404, { error: "Compte introuvable" });
  if (ancienne === adresse) return json(200, { user_id, email: adresse, inchange: true, copros: 0, ppt: 0 });

  // --- 1. L'adresse du compte (identifiant de connexion) ---
  const { error: majErr } = await admin.auth.admin.updateUserById(user_id, { email: adresse, email_confirm: true });
  if (majErr) {
    // adresse déjà portée par un autre compte : l'API d'administration répond alors
    // par une 500 « Error updating user » (contrainte users_email_partial_key) sans
    // le code email_exists, d'où la vérification directe (0152)
    const { data: prise } = await admin.rpc("compte_email_existe", { p_email: adresse, p_sauf: user_id });
    const deja = prise === true || majErr.code === "email_exists" || /already|registered|exists/i.test(majErr.message ?? "");
    if (!deja) console.error("Changement d'adresse :", majErr.message);
    return json(deja ? 409 : 500, {
      error: deja ? "Un compte existe déjà avec cette adresse e-mail" : "La modification de l'adresse a échoué",
    });
  }

  // --- 2. Les dossiers où il est désigné gestionnaire (par son adresse) ---
  const { data: propage, error: propErr } = await admin.rpc("propager_email_compte", {
    p_ancien: ancienne,
    p_nouveau: adresse,
  });
  if (propErr) {
    console.error("Propagation de l'adresse :", propErr.message);
    // rétablit l'adresse d'origine : le compte et les dossiers restent cohérents
    const { error: retourErr } = await admin.auth.admin.updateUserById(user_id, { email: ancienne, email_confirm: true });
    if (retourErr) console.error("Rétablissement de l'adresse :", retourErr.message);
    return json(500, {
      error: retourErr
        ? "L'adresse du compte a changé mais pas celle des dossiers : contactez l'équipe technique"
        : "La modification a échoué, l'ancienne adresse est conservée. Réessayez.",
    });
  }

  const bilan = (propage ?? {}) as { copros?: number; ppt?: number };
  return json(200, { user_id, email: adresse, inchange: false, copros: bilan.copros ?? 0, ppt: bilan.ppt ?? 0 });
});
