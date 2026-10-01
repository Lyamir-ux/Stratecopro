// Edge function « creer-espace-prestataire » - crée l'accès d'une entreprise
// de la Base prestataires à son espace, sur un clic de l'AMO dans la fiche
// (question d'Amir du 01/10/2026 sur la fiche « Best Ryan » : aucune entreprise
// n'avait de compte, le rattachement se faisait en SQL). Migration 0123.
//
// Pour la fiche demandée (prestataire_id) :
//   • adresse principale libre : compte créé (e-mail confirmé d'office, sans mot
//     de passe), profil « presta », fiche reliée (prestataires.user_id), puis
//     e-mail avec un lien pour choisir son mot de passe (/activer-espace) ;
//   • compte prestataire relié à aucune fiche : fiche reliée à ce compte ;
//   • fiche déjà reliée mais lien jamais utilisé : l'e-mail est renvoyé ;
//   • adresse d'un compte AMO, syndic ou copropriétaire, ou d'un compte
//     prestataire déjà relié à une autre entreprise : refusée (un compte garde
//     un seul rôle et ne voit qu'une entreprise, règle du 30/09) ;
//   • fiche suspendue ou sans adresse : rien n'est créé.
// Le jeton est généré ici (generateLink) et envoyé par Resend, comme pour les
// copropriétaires (creer-espace-coproprietaire) : la page /activer-espace ne
// le vérifie qu'au clic, les messageries qui pré-ouvrent les liens ne le
// consomment pas.
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

/** Initiales : première lettre du premier et du dernier mot du nom. */
function initialesDe(nom: string): string {
  const mots = nom.trim().split(/\s+/);
  const premiere = mots[0]?.[0] ?? "";
  const derniere = mots.length > 1 ? mots[mots.length - 1][0] : (mots[0]?.[1] ?? "");
  return (premiere + derniere).toUpperCase();
}

const ENTITES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ENTITES[ch] ?? ch);

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Statut = "invite" | "relie" | "renvoye" | "deja_actif" | "sans_email" | "suspendu" | "email_pris" | "erreur";
type Envoi = "envoye" | "simule" | "echec" | null;
interface Resultat {
  statut: Statut;
  envoi: Envoi;
  email?: string;
  detail?: string;
}

const ROLE_LIBELLE: Record<string, string> = {
  amo: "un compte Strat Eco",
  syndic: "un compte syndic",
  copro: "un compte copropriétaire",
  moe: "un compte maître d'œuvre",
};

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

  const { prestataire_id } = await req.json().catch(() => ({}));
  if (typeof prestataire_id !== "string" || !prestataire_id) {
    return json(400, { error: "prestataire_id attendu" });
  }

  const { data: f, error: ficheErr } = await admin
    .from("prestataires")
    .select("id, raison_sociale, contact_nom, email, user_id, actif")
    .eq("id", prestataire_id)
    .maybeSingle();
  if (ficheErr) return json(500, { error: "Lecture de la fiche impossible" });
  if (!f) return json(404, { error: "Fiche introuvable" });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";
  const mode = resendKey ? "resend" : "simulation";
  const entreprise: string = f.raison_sociale;
  const contact: string = (f.contact_nom ?? "").trim();

  /** Envoi Resend ; « simule » sans clé Resend. */
  const envoyer = async (to: string, sujet: string, html: string): Promise<Envoi> => {
    if (!resendKey) return "simule";
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject: sujet, html }),
      });
      if (r.ok) return "envoye";
      console.error("Resend a refusé l'envoi", r.status, await r.text().catch(() => ""));
      return "echec";
    } catch (e) {
      console.error("Envoi impossible", e);
      return "echec";
    }
  };

  const gabarit = (corps: string) => `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
      <p>Bonjour${contact ? " " + esc(contact) : ""},</p>
      ${corps}
      <p>Bien cordialement,<br/><strong>L'équipe Strat Eco</strong></p>
    </div>`;
  const bouton = (href: string, libelle: string) => `
    <p style="margin:22px 0">
      <a href="${href}" style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
        ${libelle}
      </a>
    </p>`;
  const sujet = `Votre espace prestataire Strat Eco - ${entreprise}`;

  /** E-mail d'activation : lien vers /activer-espace pour choisir son mot de passe. */
  const envoyerActivation = async (email: string): Promise<Envoi> => {
    const { data: lien, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    const jeton = lien?.properties?.hashed_token;
    if (error || !jeton) {
      console.error("Lien d'activation impossible", error);
      return "echec";
    }
    const actionLink = `${appUrl}/activer-espace?token_hash=${encodeURIComponent(jeton)}&espace=prestataire`;
    const html = gabarit(
      `<p>Strat Eco accompagne des copropriétés dans leurs projets de rénovation énergétique et a référencé
      <strong>${esc(entreprise)}</strong> dans sa base de prestataires. Votre espace prestataire est ouvert : vous y
      retrouverez les consultations qui correspondent à vos prestations, pourrez y déposer vos offres et suivre vos
      projets.</p>
      <p>Pour y accéder, choisissez votre mot de passe :</p>
      ${bouton(actionLink, "Choisir mon mot de passe")}
      <p>Votre identifiant de connexion est votre adresse e-mail : <strong>${esc(email)}</strong>.</p>
      <p style="color:#5c6470;font-size:13px">Ce lien est personnel et valable pour une durée limitée. S'il a expiré,
      rendez-vous sur <a href="${appUrl}/mot-de-passe-oublie">${appUrl}/mot-de-passe-oublie</a> et saisissez
      cette adresse : vous recevrez un nouveau lien.</p>`,
    );
    return envoyer(email, sujet, html);
  };

  /** E-mail d'information : un compte déjà utilisé est relié à l'entreprise. */
  const envoyerAjout = (email: string): Promise<Envoi> => {
    const html = gabarit(
      `<p>Votre compte Strat Eco donne désormais accès à l'espace prestataire de <strong>${esc(entreprise)}</strong>.
      Connectez-vous avec votre adresse e-mail et votre mot de passe habituels.</p>
      ${bouton(`${appUrl}/prestataire`, "Accéder à mon espace")}`,
    );
    return envoyer(email, sujet, html);
  };

  const tracerEnvoi = () =>
    admin
      .from("prestataires")
      .update({ espace_invite_le: new Date().toISOString(), espace_invite_par: userData.user.id })
      .eq("id", f.id);

  const r: Resultat = { statut: "erreur", envoi: null };

  try {
    if (!f.actif) {
      r.statut = "suspendu";
      r.detail = "Fiche suspendue : réactivez-la avant de créer l'accès";
      return json(200, { resultat: r, mode });
    }

    // --- Fiche déjà reliée : renvoi du lien tant qu'il n'a pas servi ---
    if (f.user_id) {
      const { data: u } = await admin.auth.admin.getUserById(f.user_id);
      const emailCompte = u?.user?.email;
      if (!emailCompte) {
        r.detail = "Compte relié introuvable";
        return json(200, { resultat: r, mode });
      }
      r.email = emailCompte;
      if (u.user.last_sign_in_at) {
        r.statut = "deja_actif";
        return json(200, { resultat: r, mode });
      }
      r.statut = "renvoye";
      r.envoi = await envoyerActivation(emailCompte);
      if (r.envoi === "envoye") await tracerEnvoi();
      return json(200, { resultat: r, mode });
    }

    const email = (f.email ?? "").trim().toLowerCase();
    if (!email || !EMAIL_VALIDE.test(email)) {
      r.statut = "sans_email";
      return json(200, { resultat: r, mode });
    }
    r.email = email;

    // --- Compte existant pour cette adresse ? ---
    let userId: string | null = null;
    let dejaConnecte = false;
    const { data: comptes } = await admin.rpc("compte_par_email", { p_email: email });
    const compte = (comptes ?? [])[0] as
      | { user_id: string; role: string | null; derniere_connexion: string | null }
      | undefined;
    if (compte) {
      if (compte.role !== "presta") {
        r.statut = "email_pris";
        r.detail = compte.role
          ? `Adresse déjà utilisée par ${ROLE_LIBELLE[compte.role] ?? "un autre compte"}`
          : "Adresse déjà utilisée par un compte incomplet";
        return json(200, { resultat: r, mode });
      }
      const { data: autre } = await admin
        .from("prestataires")
        .select("raison_sociale")
        .eq("user_id", compte.user_id)
        .neq("id", f.id)
        .limit(1)
        .maybeSingle();
      if (autre) {
        r.statut = "email_pris";
        r.detail = `Adresse déjà utilisée par le compte de ${autre.raison_sociale}`;
        return json(200, { resultat: r, mode });
      }
      userId = compte.user_id;
      dejaConnecte = !!compte.derniere_connexion;
      r.statut = "relie";
    }

    // --- Sinon : création du compte et du profil prestataire ---
    if (!userId) {
      const nom = contact || entreprise;
      const { data: cree, error: creeErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: nom },
      });
      if (creeErr || !cree.user) {
        r.detail = "La création du compte a échoué";
        console.error("createUser", creeErr);
        return json(200, { resultat: r, mode });
      }
      const { error: profilErr } = await admin.from("profiles").insert({
        user_id: cree.user.id,
        full_name: nom,
        initials: initialesDe(nom),
        role: "presta",
      });
      if (profilErr) {
        // pas de compte orphelin sans profil
        await admin.auth.admin.deleteUser(cree.user.id);
        r.detail = "La création du profil a échoué";
        console.error("profil", profilErr);
        return json(200, { resultat: r, mode });
      }
      userId = cree.user.id;
      r.statut = "invite";
    }

    const { data: reliee, error: relierErr } = await admin
      .from("prestataires")
      .update({ user_id: userId })
      .eq("id", f.id)
      .is("user_id", null)
      .select("id");
    if (relierErr || !reliee?.length) {
      console.error("Rattachement", relierErr);
      // compte créé par cet appel : pas de compte orphelin sans fiche (le profil suit)
      if (r.statut === "invite") await admin.auth.admin.deleteUser(userId);
      r.statut = "erreur";
      r.detail = "Rattachement de la fiche impossible";
      return json(200, { resultat: r, mode });
    }

    r.envoi = dejaConnecte ? await envoyerAjout(email) : await envoyerActivation(email);
    if (r.envoi === "envoye") await tracerEnvoi();
  } catch (e) {
    console.error("Espace prestataire", f.id, e);
    r.statut = "erreur";
    r.detail = "Erreur inattendue";
  }

  return json(200, { resultat: r, mode });
});
