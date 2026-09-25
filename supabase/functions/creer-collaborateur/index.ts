// Edge function « creer-collaborateur » - création d'un compte utilisateur.
// Réservée au dirigeant, et depuis le 25/09/2026 (arbitrage d'Amir sur le
// feedback de Pierrot LEFOU) à la direction d'une enseigne syndic pour les
// comptes de SA seule enseigne, hors direction (gestionnaire, administratif,
// comptable) ; le dirigeant est alors prévenu par e-mail. Deux usages :
//   • role "amo" (défaut) : collaborateur Strat Eco depuis /collaborateurs
//     (demande d'Amir du 02/09/2026), fiche profil AMO au niveau pièces 2
//     par défaut (le plus restrictif) ;
//   • role "syndic" : membre d'une enseigne de gestion depuis
//     Paramètres → Organisations (feedback d'Amir du 08/09/2026) ou depuis
//     « Mon organisation » de l'espace syndic (direction de l'enseigne) : le
//     compte est créé ET rattaché à l'organisation avec son rôle (direction,
//     gestionnaire…) en une seule opération.
// Dans les deux cas : utilisateur Supabase créé avec e-mail confirmé d'office
// et un mot de passe provisoire généré ici, renvoyé UNE SEULE FOIS à
// l'appelant pour transmission ; le compte est marqué
// « mot_de_passe_provisoire » : l'utilisateur est bloqué à sa première
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

  // --- L'appelant : le dirigeant (AMO actif) ou la direction d'une enseigne syndic ---
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });

  const { data: appelant } = await admin
    .from("profiles")
    .select("role, active, dirigeant, full_name")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!appelant || !appelant.active) return json(403, { error: "Profil inactif" });
  const estDirigeant = appelant.role === "amo" && appelant.dirigeant === true;

  const { email, full_name, job_title, role, organisation_id, org_role } = await req.json().catch(() => ({}));

  // Direction d'une enseigne : comptes syndic de sa seule enseigne, jamais un autre directeur
  let enseigneDirection: string | null = null;
  if (!estDirigeant) {
    const { data: membre } = appelant.role === "syndic"
      ? await admin
        .from("organisation_membres")
        .select("organisation_id, org_role")
        .eq("user_id", userData.user.id)
        .maybeSingle()
      : { data: null };
    if (!membre || membre.org_role !== "directeur") {
      return json(403, { error: "Seuls le dirigeant de Strat Eco et la direction d'une enseigne peuvent créer un compte" });
    }
    if (role !== "syndic" || organisation_id !== membre.organisation_id) {
      return json(403, { error: "Vous ne pouvez créer des comptes que pour votre enseigne" });
    }
    if (!["gestionnaire", "administratif", "comptable"].includes(org_role)) {
      return json(403, { error: "La direction de l'enseigne est désignée par Strat Eco : choisissez gestionnaire, administratif ou comptable" });
    }
    enseigneDirection = membre.organisation_id;
  }
  const nom = typeof full_name === "string" ? full_name.trim() : "";
  const adresse = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!nom || !adresse) return json(400, { error: "email et full_name requis" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) return json(400, { error: "Adresse e-mail invalide" });

  const roleCompte: "amo" | "syndic" = role === "syndic" ? "syndic" : "amo";

  // --- Compte syndic : l'enseigne et le rôle dans l'enseigne sont requis ---
  const ROLES_ORG = ["directeur", "gestionnaire", "administratif", "comptable"] as const;
  type OrgRole = (typeof ROLES_ORG)[number];
  let orgId: string | null = null;
  let orgNom = "";
  let roleOrg: OrgRole = "gestionnaire";
  if (roleCompte === "syndic") {
    if (typeof organisation_id !== "string" || !organisation_id) {
      return json(400, { error: "organisation_id requis pour un compte syndic" });
    }
    if (!ROLES_ORG.includes(org_role)) return json(400, { error: "Rôle dans l'enseigne invalide" });
    const { data: org } = await admin.from("organisations").select("id, nom").eq("id", organisation_id).maybeSingle();
    if (!org) return json(404, { error: "Organisation introuvable" });
    orgId = org.id;
    orgNom = org.nom;
    roleOrg = org_role;
  }

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
      error: deja
        ? enseigneDirection
          ? "Un compte existe déjà avec cette adresse e-mail : contactez Strat Eco pour le rattacher à votre enseigne"
          : "Un compte existe déjà avec cette adresse e-mail"
        : "La création du compte a échoué",
    });
  }

  // --- Fiche profil (pour un AMO, niveau_pieces reste au défaut 2, le plus restrictif) ---
  const { error: profilErr } = await admin.from("profiles").insert({
    user_id: cree.user.id,
    full_name: nom,
    initials: initialesDe(nom),
    role: roleCompte,
    job_title: typeof job_title === "string" && job_title.trim() ? job_title.trim() : null,
  });
  if (profilErr) {
    // rollback : pas de compte orphelin sans fiche
    await admin.auth.admin.deleteUser(cree.user.id);
    console.error("Création du profil :", profilErr.message);
    return json(500, { error: "La création de la fiche a échoué" });
  }

  // --- Compte syndic : rattachement immédiat à l'enseigne ---
  if (roleCompte === "syndic" && orgId) {
    const { error: membreErr } = await admin
      .from("organisation_membres")
      .insert({ organisation_id: orgId, user_id: cree.user.id, org_role: roleOrg });
    if (membreErr) {
      // rollback complet : le membre doit exister dans son enseigne ou pas du tout
      await admin.from("profiles").delete().eq("user_id", cree.user.id);
      await admin.auth.admin.deleteUser(cree.user.id);
      console.error("Rattachement à l'organisation :", membreErr.message);
      return json(500, { error: "Le rattachement à l'organisation a échoué" });
    }
  }

  // --- Création par la direction d'une enseigne : le dirigeant est prévenu (best effort) ---
  if (enseigneDirection) {
    try {
      await prevenirDirigeant(admin, {
        auteur: appelant.full_name ?? userData.user.email ?? "La direction",
        enseigne: orgNom,
        nom,
        email: adresse,
        role: roleOrg,
      });
    } catch (e) {
      console.error("Alerte au dirigeant :", e);
    }
  }

  return json(200, { user_id: cree.user.id, email: adresse, mot_de_passe: motDePasse });
});

const ROLE_LIBELLE: Record<string, string> = {
  gestionnaire: "gestionnaire",
  administratif: "administratif",
  comptable: "comptable",
  directeur: "direction",
};

/** E-mail au(x) dirigeant(s) : un compte vient d'être créé par la direction d'une enseigne. */
async function prevenirDirigeant(
  // deno-lint-ignore no-explicit-any
  admin: any,
  c: { auteur: string; enseigne: string; nom: string; email: string; role: string },
) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return;
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";
  const { data: dirigeants } = await admin
    .from("profiles")
    .select("user_id, full_name")
    .eq("role", "amo")
    .eq("active", true)
    .eq("dirigeant", true);
  const ENTITES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ENTITES[ch] ?? ch);
  for (const d of dirigeants ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(d.user_id);
    const to = u?.user?.email;
    if (!to) continue;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
        <p>Bonjour${d.full_name ? " " + esc(d.full_name) : ""},</p>
        <p><strong>${esc(c.auteur)}</strong> (direction de <strong>${esc(c.enseigne)}</strong>) vient de créer un compte
        depuis « Mon organisation » de l'espace syndic :</p>
        <p>${esc(c.nom)} - ${esc(c.email)}<br/>Rôle : <strong>${esc(ROLE_LIBELLE[c.role] ?? c.role)}</strong></p>
        <p>Le compte est rattaché à l'enseigne avec un mot de passe provisoire, à remplacer à la première connexion.
        Vous le retrouvez dans Paramètres - Organisations.</p>
        <p style="margin:22px 0">
          <a href="${appUrl}/parametres" style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
            Voir les organisations
          </a>
        </p>
        <p>Bien cordialement,<br/><strong>Strat Eco pro</strong></p>
      </div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: `Compte créé chez ${c.enseigne} - ${c.nom}`, html }),
    });
    if (!r.ok) console.error("Resend a refusé l'envoi", r.status, await r.text().catch(() => ""));
  }
}
