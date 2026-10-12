// Edge function « creer-espace-prestataire » - ouvre l'accès d'une personne
// d'une entreprise de la Base prestataires à l'espace de l'entreprise, sur un
// clic de l'AMO dans la fiche (question d'Amir du 01/10/2026 sur la fiche
// « Best Ryan », migration 0123).
//
// v2 (12/10/2026, migration 0162, demande d'Amir : « chaque adresse mail est une
// personne et a un accès personnalisé, chaque personne a accès au même compte
// du maître d'œuvre ») : un compte par adresse de la fiche (principale ou
// autre), relié par prestataire_comptes. Corps :
//   { prestataire_id, email }        l'adresse de la fiche à traiter ;
//   { prestataire_id, tous: true }   toutes les adresses encore sans accès ;
//   { prestataire_id }               l'adresse principale (ancienne version de
//                                    l'application).
// Pour chaque adresse :
//   • adresse libre : compte créé (e-mail confirmé d'office, sans mot de passe),
//     profil « presta » au nom du contact connu de l'adresse (à défaut la raison
//     sociale), compte relié à la fiche, puis e-mail avec un lien pour choisir
//     son mot de passe (/activer-espace) ;
//   • compte prestataire relié à aucune fiche : relié à celle-ci ;
//   • accès déjà ouvert mais lien jamais utilisé : l'e-mail est renvoyé ;
//   • adresse d'un compte AMO, syndic ou copropriétaire, ou d'un compte
//     prestataire déjà relié à une entreprise : refusée (un compte garde un
//     seul rôle et ne voit qu'une entreprise, règle du 30/09) ;
//   • fiche suspendue : rien n'est créé.
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
const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

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

  const corps = await req.json().catch(() => ({}));
  const { prestataire_id } = corps;
  if (typeof prestataire_id !== "string" || !prestataire_id) {
    return json(400, { error: "prestataire_id attendu" });
  }

  const { data: f, error: ficheErr } = await admin
    .from("prestataires")
    .select("id, raison_sociale, contact_nom, email, emails_secondaires, actif")
    .eq("id", prestataire_id)
    .maybeSingle();
  if (ficheErr) return json(500, { error: "Lecture de la fiche impossible" });
  if (!f) return json(404, { error: "Fiche introuvable" });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";
  const mode = resendKey ? "resend" : "simulation";
  const entreprise: string = f.raison_sociale;
  const principale = norm(f.email);
  const adresses = [...new Set([f.email, ...(f.emails_secondaires ?? [])].map(norm).filter(Boolean))];

  // Nom de la personne d'une adresse : contact de l'entreprise à cette adresse,
  // sinon le contact de la fiche pour l'adresse principale.
  const { data: contacts } = await admin
    .from("prestataire_contacts")
    .select("nom, email")
    .eq("prestataire_id", f.id);
  const nomDe = (email: string): string | null => {
    const c = (contacts ?? []).find((x) => norm(x.email) === email && (x.nom ?? "").trim());
    if (c) return c.nom!.trim();
    if (email === principale && (f.contact_nom ?? "").trim()) return f.contact_nom!.trim();
    return null;
  };

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

  const gabarit = (nom: string | null, corps: string) => `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
      <p>Bonjour${nom ? " " + esc(nom) : ""},</p>
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
  const personnel = `<p>Cet accès vous est personnel. Les autres adresses de ${esc(entreprise)} enregistrées
    auprès de Strat Eco peuvent recevoir le leur : chacun se connecte avec sa propre adresse et retrouve le même
    espace (consultations, offres, projets, messages).</p>`;

  /** E-mail d'activation : lien vers /activer-espace pour choisir son mot de passe. */
  const envoyerActivation = async (email: string, nom: string | null): Promise<Envoi> => {
    const { data: lien, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    const jeton = lien?.properties?.hashed_token;
    if (error || !jeton) {
      console.error("Lien d'activation impossible", error);
      return "echec";
    }
    const actionLink = `${appUrl}/activer-espace?token_hash=${encodeURIComponent(jeton)}&espace=prestataire`;
    const html = gabarit(
      nom,
      `<p>Strat Eco accompagne des copropriétés dans leurs projets de rénovation énergétique et a référencé
      <strong>${esc(entreprise)}</strong> dans sa base de prestataires. Votre espace prestataire est ouvert : vous y
      retrouverez les consultations qui correspondent à vos prestations, pourrez y déposer vos offres et suivre vos
      projets.</p>
      <p>Pour y accéder, choisissez votre mot de passe :</p>
      ${bouton(actionLink, "Choisir mon mot de passe")}
      <p>Votre identifiant de connexion est votre adresse e-mail : <strong>${esc(email)}</strong>.</p>
      ${personnel}
      <p style="color:#5c6470;font-size:13px">Ce lien est personnel et valable pour une durée limitée. S'il a expiré,
      rendez-vous sur <a href="${appUrl}/mot-de-passe-oublie">${appUrl}/mot-de-passe-oublie</a> et saisissez
      cette adresse : vous recevrez un nouveau lien.</p>`,
    );
    return envoyer(email, sujet, html);
  };

  /** E-mail d'information : un compte déjà utilisé est relié à l'entreprise. */
  const envoyerAjout = (email: string, nom: string | null): Promise<Envoi> => {
    const html = gabarit(
      nom,
      `<p>Votre compte Strat Eco donne désormais accès à l'espace prestataire de <strong>${esc(entreprise)}</strong>.
      Connectez-vous avec votre adresse e-mail et votre mot de passe habituels.</p>
      ${bouton(`${appUrl}/prestataire`, "Accéder à mon espace")}
      ${personnel}`,
    );
    return envoyer(email, sujet, html);
  };

  const tracerEnvoi = (userId: string) =>
    admin
      .from("prestataire_comptes")
      .update({ invite_le: new Date().toISOString(), invite_par: userData.user.id })
      .eq("user_id", userId);

  /** Ouvre (ou relance) l'accès d'une adresse de la fiche. */
  const traiter = async (email: string): Promise<Resultat> => {
    const r: Resultat = { statut: "erreur", envoi: null, email };
    const nom = nomDe(email);
    try {
      // --- Accès déjà ouvert à cette adresse : renvoi du lien tant qu'il n'a pas servi ---
      const { data: membre } = await admin
        .from("prestataire_comptes")
        .select("user_id")
        .eq("prestataire_id", f.id)
        .eq("email", email)
        .maybeSingle();
      if (membre) {
        const { data: u } = await admin.auth.admin.getUserById(membre.user_id);
        const emailCompte = u?.user?.email;
        if (!emailCompte) {
          r.detail = "Compte relié introuvable";
          return r;
        }
        r.email = emailCompte;
        if (u.user.last_sign_in_at) {
          r.statut = "deja_actif";
          return r;
        }
        r.statut = "renvoye";
        r.envoi = await envoyerActivation(emailCompte, nom);
        if (r.envoi === "envoye") await tracerEnvoi(membre.user_id);
        return r;
      }

      if (!EMAIL_VALIDE.test(email)) {
        r.statut = "sans_email";
        r.detail = "Adresse invalide";
        return r;
      }

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
          return r;
        }
        const { data: autre } = await admin
          .from("prestataire_comptes")
          .select("prestataires(raison_sociale)")
          .eq("user_id", compte.user_id)
          .maybeSingle();
        if (autre) {
          const fiche = (autre as unknown as { prestataires: { raison_sociale: string } | null }).prestataires;
          r.statut = "email_pris";
          r.detail = `Adresse déjà utilisée par le compte de ${fiche?.raison_sociale ?? "une autre entreprise"}`;
          return r;
        }
        userId = compte.user_id;
        dejaConnecte = !!compte.derniere_connexion;
        r.statut = "relie";
      }

      // --- Sinon : création du compte et du profil prestataire ---
      if (!userId) {
        const nomCompte = nom || entreprise;
        const { data: cree, error: creeErr } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: nomCompte },
        });
        if (creeErr || !cree.user) {
          r.detail = "La création du compte a échoué";
          console.error("createUser", creeErr);
          return r;
        }
        const { error: profilErr } = await admin.from("profiles").insert({
          user_id: cree.user.id,
          full_name: nomCompte,
          initials: initialesDe(nomCompte),
          role: "presta",
        });
        if (profilErr) {
          // pas de compte orphelin sans profil
          await admin.auth.admin.deleteUser(cree.user.id);
          r.detail = "La création du profil a échoué";
          console.error("profil", profilErr);
          return r;
        }
        userId = cree.user.id;
        r.statut = "invite";
      }

      const { error: relierErr } = await admin
        .from("prestataire_comptes")
        .insert({ user_id: userId, prestataire_id: f.id, email, invite_par: userData.user.id });
      if (relierErr) {
        console.error("Rattachement", relierErr);
        // compte créé par cet appel : pas de compte orphelin sans fiche (le profil suit)
        if (r.statut === "invite") await admin.auth.admin.deleteUser(userId);
        r.statut = "erreur";
        r.detail = "Rattachement à la fiche impossible";
        return r;
      }

      r.envoi = dejaConnecte ? await envoyerAjout(email, nom) : await envoyerActivation(email, nom);
      if (r.envoi === "envoye") await tracerEnvoi(userId);
    } catch (e) {
      console.error("Espace prestataire", f.id, email, e);
      r.statut = "erreur";
      r.detail = "Erreur inattendue";
    }
    return r;
  };

  if (!f.actif) {
    const r: Resultat = { statut: "suspendu", envoi: null, detail: "Fiche suspendue : réactivez-la avant de créer l'accès" };
    return json(200, { resultat: r, resultats: [r], mode });
  }

  // --- Adresses à traiter ---
  let cibles: string[];
  if (typeof corps.email === "string" && corps.email.trim()) {
    const email = norm(corps.email);
    if (!adresses.includes(email)) {
      return json(400, { error: "Cette adresse n'est pas enregistrée sur la fiche : enregistrez la fiche d'abord." });
    }
    cibles = [email];
  } else if (corps.tous === true) {
    const { data: membres } = await admin.from("prestataire_comptes").select("email").eq("prestataire_id", f.id);
    const ouvertes = new Set((membres ?? []).map((m) => m.email));
    cibles = adresses.filter((e) => !ouvertes.has(e));
  } else {
    cibles = principale ? [principale] : [];
  }
  if (cibles.length === 0) {
    const r: Resultat = { statut: "sans_email", envoi: null, detail: "Aucune adresse à traiter" };
    return json(200, { resultat: r, resultats: [r], mode });
  }

  const resultats: Resultat[] = [];
  for (const [i, email] of cibles.entries()) {
    // Resend limite le débit : un envoi par demi-seconde au plus
    if (i > 0) await pause(600);
    resultats.push(await traiter(email));
  }

  return json(200, { resultat: resultats[0], resultats, mode });
});
