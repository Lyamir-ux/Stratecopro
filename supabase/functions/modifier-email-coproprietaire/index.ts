// Edge function « modifier-email-coproprietaire » - changement de l'adresse e-mail
// d'un copropriétaire, en un clic dans l'onglet Données du dossier (bug d'Amir du
// 08/10/2026 : « me permettre aussi de changer l'adresse mail comme le nom de
// copropriétaire, en cliquant juste dessus »).
//
// Réservée à l'équipe AMO active (l'écriture sur coproprietaires leur est déjà
// ouverte par la RLS ; la fonction sert à toucher le COMPTE du portail, ce qui exige
// la clé de service). Règles :
// - fiche sans espace : seule l'adresse de la fiche change (vide = effacée) ;
// - fiche avec un espace dont l'invitation n'a jamais servi (aucune connexion) :
//   l'identifiant de connexion du compte change aussi, sinon « Renvoyer
//   l'invitation » repartirait à l'ancienne adresse (creer-espace-coproprietaire écrit
//   à l'adresse du compte, pas à celle de la fiche) ; aucun e-mail n'est envoyé ;
// - fiche avec un espace déjà utilisé : seule l'adresse de la fiche change, le compte
//   garde son identifiant (on ne retire pas à quelqu'un l'adresse avec laquelle il se
//   connecte) ; l'écran le dit ;
// - un compte qui n'est pas un compte copropriétaire n'est jamais touché.
// L'adresse de la fiche peut porter plusieurs adresses (« a@x.fr / b@y.fr ») : la
// première sert (même règle que adresseEmail.ts, creer-espace-coproprietaire et la
// fonction SQL premiere_adresse, 0145 : à garder alignées à la main).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LONGUEUR_MAX = 200;
const ADRESSE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:[.][A-Za-z0-9-]+)+/;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function premiereAdresse(texte: string | null | undefined): string | null {
  const m = ADRESSE.exec(texte ?? "");
  return m ? m[0].toLowerCase() : null;
}

/** Espaces de bord retirés, espaces multiples (et insécables) ramenés à un seul. */
function nettoyer(texte: string): string {
  return texte.replace(/\s+/g, " ").trim();
}

type EtatCompte = "aucun" | "suit" | "garde" | "introuvable";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- L'appelant : un AMO actif ---
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });
  const { data: appelant } = await admin
    .from("profiles")
    .select("role, active")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!appelant || appelant.role !== "amo" || !appelant.active) {
    return json(403, { error: "Réservé à l'équipe Strat Eco" });
  }

  // --- La demande ---
  const corps = await req.json().catch(() => ({}));
  const id = corps?.coproprietaire_id;
  if (typeof id !== "string" || !id) return json(400, { error: "coproprietaire_id attendu" });
  const brut = corps?.email == null ? "" : corps.email;
  if (typeof brut !== "string") return json(400, { error: "Adresse e-mail invalide" });
  const saisie = nettoyer(brut);
  if (saisie.length > LONGUEUR_MAX) {
    return json(400, { error: `L'adresse est trop longue (${LONGUEUR_MAX} caractères au plus)` });
  }
  const premiere = saisie ? premiereAdresse(saisie) : null;
  if (saisie && !premiere) return json(400, { error: "Adresse e-mail invalide" });
  // une adresse seule est stockée en minuscules ; plusieurs adresses, telles que saisies
  const stockee: string | null = !saisie ? null : saisie.toLowerCase() === premiere ? premiere : saisie;

  // --- La fiche ---
  const { data: fiche } = await admin
    .from("coproprietaires")
    .select("id, email, user_id, coproprietes!inner(deleted_at)")
    .eq("id", id)
    .maybeSingle();
  // deno-lint-ignore no-explicit-any
  if (!fiche || (fiche as any).coproprietes?.deleted_at) return json(404, { error: "Copropriétaire introuvable" });
  if (!stockee && fiche.user_id) {
    return json(400, {
      error: "Ce copropriétaire a un espace : son adresse ne peut pas être vide",
    });
  }
  if ((stockee ?? "") === nettoyer(fiche.email ?? "")) {
    return json(200, { email: fiche.email ?? null, inchange: true, compte: "aucun" as EtatCompte, autres_fiches: 0 });
  }

  // --- Le compte du portail, s'il y en a un ---
  let compte: EtatCompte = "aucun";
  let ancienneConnexion: string | null = null;
  let autresFiches = 0;
  if (fiche.user_id) {
    const [{ data: u }, { data: profil }] = await Promise.all([
      admin.auth.admin.getUserById(fiche.user_id),
      admin.from("profiles").select("role").eq("user_id", fiche.user_id).maybeSingle(),
    ]);
    const emailCompte = u?.user?.email?.trim().toLowerCase() ?? null;
    if (!emailCompte) {
      compte = "introuvable";
    } else if (profil?.role !== "copro" || u?.user?.last_sign_in_at) {
      // espace déjà utilisé, ou compte d'un autre type : on n'y touche pas
      compte = "garde";
    } else {
      compte = "suit";
      if (emailCompte !== premiere) {
        const { error: majErr } = await admin.auth.admin.updateUserById(fiche.user_id, {
          email: premiere!,
          email_confirm: true,
        });
        if (majErr) {
          // adresse déjà portée par un autre compte : l'API d'administration répond
          // alors par une 500 « Error updating user » (contrainte users_email_partial_key)
          // sans le code email_exists, d'où la vérification directe (0152)
          const { data: prise } = await admin.rpc("compte_email_existe", { p_email: premiere, p_sauf: fiche.user_id });
          const deja = prise === true || majErr.code === "email_exists" || /already|registered|exists/i.test(majErr.message ?? "");
          if (!deja) console.error("Changement d'adresse du compte :", majErr.message);
          return json(deja ? 409 : 500, {
            error: deja
              ? "Un compte existe déjà avec cette adresse e-mail"
              : "La modification de l'adresse a échoué",
          });
        }
        ancienneConnexion = emailCompte;
        const { error: idErr } = await admin.rpc("sync_identite_email", { p_user_id: fiche.user_id, p_email: premiere });
        if (idErr) console.error("Synchronisation de l'identité :", idErr.message);
        const { count } = await admin
          .from("coproprietaires")
          .select("id", { count: "exact", head: true })
          .eq("user_id", fiche.user_id)
          .neq("id", id);
        autresFiches = count ?? 0;
      }
    }
  }

  // --- La fiche ---
  const { error: ficheErr } = await admin.from("coproprietaires").update({ email: stockee }).eq("id", id);
  if (ficheErr) {
    console.error("Mise à jour de la fiche :", ficheErr.message);
    // la fiche et le compte restent cohérents : l'ancien identifiant est rétabli
    if (ancienneConnexion && fiche.user_id) {
      const { error: retourErr } = await admin.auth.admin.updateUserById(fiche.user_id, {
        email: ancienneConnexion,
        email_confirm: true,
      });
      if (retourErr) console.error("Rétablissement de l'adresse du compte :", retourErr.message);
      else await admin.rpc("sync_identite_email", { p_user_id: fiche.user_id, p_email: ancienneConnexion });
      if (retourErr) {
        return json(500, {
          error: "L'adresse de connexion a changé mais pas celle de la fiche : contactez l'équipe technique",
        });
      }
    }
    return json(500, { error: "La modification a échoué, l'ancienne adresse est conservée. Réessayez." });
  }

  return json(200, { email: stockee, inchange: false, compte, autres_fiches: autresFiches });
});
