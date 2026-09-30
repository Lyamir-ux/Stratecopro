// Edge function « creer-espace-coproprietaire » - ouvre l'espace (portail) de
// copropriétaires, sur un clic de l'AMO (feedback d'Amir du 30/09/2026 : les
// nouveaux entrants d'un changement de propriétaire n'avaient pas d'espace ;
// en fait aucun copropriétaire n'en avait, rien ne créait le compte).
//
// Pour chaque fiche demandée (coproprietaire_ids, un seul dossier ou non) :
//   • adresse libre : compte créé (e-mail confirmé d'office, sans mot de passe),
//     profil « copro », fiche reliée (coproprietaires.user_id), puis e-mail
//     avec un lien pour choisir son mot de passe (/reinitialisation) ;
//   • compte copropriétaire existant (même personne dans un autre dossier) :
//     fiche reliée à ce compte, e-mail d'accès ou d'information ;
//   • fiche déjà reliée mais lien jamais utilisé : l'e-mail est renvoyé ;
//   • adresse d'un compte AMO, syndic ou prestataire : refusée (un compte garde
//     un seul rôle, arbitrage d'Amir du 30/09) ;
//   • fiche sortante (0090) ou sans adresse : ignorée.
// Le jeton est généré ici (generateLink) et envoyé par Resend, pas par le
// service d'e-mails de l'authentification. Le bouton de l'e-mail mène à la page
// /activer-espace de l'app, qui ne vérifie le jeton qu'au clic : les messageries
// qui ouvrent les liens pour les analyser ne le consomment pas. L'écran appelle
// la fonction par paquets de quelques fiches : Resend limite le débit, les
// envois sont espacés.
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
const MAX_FICHES = 25;
/** Écart minimal entre deux envois Resend (débit limité à 2 par seconde). */
const ECART_ENVOIS_MS = 600;

type Statut = "invite" | "relie" | "renvoye" | "deja_actif" | "sans_email" | "sortant" | "email_pris" | "erreur";
type Envoi = "envoye" | "simule" | "echec" | null;
interface Resultat {
  id: string;
  nom: string;
  statut: Statut;
  envoi: Envoi;
  detail?: string;
}

const ROLE_LIBELLE: Record<string, string> = {
  amo: "un compte Strat Eco",
  syndic: "un compte syndic",
  presta: "un compte prestataire",
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

  const { coproprietaire_ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(coproprietaire_ids) || coproprietaire_ids.length === 0) {
    return json(400, { error: "coproprietaire_ids attendu" });
  }
  if (coproprietaire_ids.length > MAX_FICHES) {
    return json(400, { error: `${MAX_FICHES} fiches au plus par appel` });
  }

  const { data: fiches, error: fichesErr } = await admin
    .from("coproprietaires")
    .select("id, nom, email, user_id, sortant_le, coproprietes!inner(id, name, deleted_at)")
    .in("id", coproprietaire_ids);
  if (fichesErr) return json(500, { error: "Lecture des fiches impossible" });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";

  let dernierEnvoi = 0;
  /** Envoi Resend espacé ; « simule » sans clé Resend. */
  const envoyer = async (to: string, sujet: string, html: string): Promise<Envoi> => {
    if (!resendKey) return "simule";
    const attente = dernierEnvoi + ECART_ENVOIS_MS - Date.now();
    if (attente > 0) await new Promise((r) => setTimeout(r, attente));
    dernierEnvoi = Date.now();
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

  const gabarit = (nom: string, corps: string) => `
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

  /** E-mail d'activation : lien vers /activer-espace pour choisir son mot de passe. */
  const envoyerActivation = async (email: string, nom: string, copro: string): Promise<Envoi> => {
    const { data: lien, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    const jeton = lien?.properties?.hashed_token;
    if (error || !jeton) {
      console.error("Lien d'activation impossible", error);
      return "echec";
    }
    const actionLink = `${appUrl}/activer-espace?token_hash=${encodeURIComponent(jeton)}`;
    const html = gabarit(
      nom,
      `<p>Strat Eco accompagne votre copropriété <strong>${esc(copro)}</strong> dans son projet de rénovation
      énergétique. Votre espace copropriétaire est ouvert : vous y trouverez l'enquête sociale à compléter, les
      documents partagés par l'équipe et, le moment venu, votre plan de financement individuel.</p>
      <p>Pour y accéder, choisissez votre mot de passe :</p>
      ${bouton(actionLink, "Choisir mon mot de passe")}
      <p>Votre identifiant de connexion est votre adresse e-mail : <strong>${esc(email)}</strong>.</p>
      <p style="color:#5c6470;font-size:13px">Ce lien est personnel et valable pour une durée limitée. S'il a expiré,
      rendez-vous sur <a href="${appUrl}/mot-de-passe-oublie">${appUrl}/mot-de-passe-oublie</a> et saisissez
      cette adresse : vous recevrez un nouveau lien.</p>`,
    );
    return envoyer(email, `Votre espace copropriétaire - ${copro}`, html);
  };

  /** E-mail d'information : un compte déjà actif gagne une copropriété. */
  const envoyerAjout = (email: string, nom: string, copro: string): Promise<Envoi> => {
    const html = gabarit(
      nom,
      `<p>Votre copropriété <strong>${esc(copro)}</strong> a été ajoutée à votre espace copropriétaire Strat Eco.
      Connectez-vous avec votre adresse e-mail et votre mot de passe habituels pour la retrouver.</p>
      ${bouton(`${appUrl}/portail`, "Accéder à mon espace")}`,
    );
    return envoyer(email, `Votre espace copropriétaire - ${copro}`, html);
  };

  const relier = async (ficheId: string, userId: string) => {
    const { error } = await admin
      .from("coproprietaires")
      .update({ user_id: userId })
      .eq("id", ficheId)
      .is("user_id", null);
    return !error;
  };
  const tracerEnvoi = (ficheId: string) =>
    admin
      .from("coproprietaires")
      .update({ espace_invite_le: new Date().toISOString(), espace_invite_par: userData.user.id })
      .eq("id", ficheId);

  // une adresse partagée par plusieurs fiches de l'appel : un compte, un e-mail
  const comptesDeLAppel = new Map<string, string>();
  const adressesEcrites = new Set<string>();
  const resultats: Resultat[] = [];

  for (const id of coproprietaire_ids as string[]) {
    // deno-lint-ignore no-explicit-any
    const f = (fiches ?? []).find((x: any) => x.id === id) as any;
    if (!f || f.coproprietes?.deleted_at) {
      resultats.push({ id, nom: "", statut: "erreur", envoi: null, detail: "Fiche introuvable" });
      continue;
    }
    const r: Resultat = { id, nom: f.nom, statut: "erreur", envoi: null };
    resultats.push(r);
    const copro: string = f.coproprietes.name;

    if (f.sortant_le) {
      r.statut = "sortant";
      continue;
    }

    try {
      // --- Fiche déjà reliée : renvoi du lien tant qu'il n'a pas servi ---
      if (f.user_id) {
        const { data: u } = await admin.auth.admin.getUserById(f.user_id);
        const emailCompte = u?.user?.email;
        if (!emailCompte) {
          r.detail = "Compte relié introuvable";
          continue;
        }
        if (u.user.last_sign_in_at) {
          r.statut = "deja_actif";
          continue;
        }
        r.statut = "renvoye";
        r.envoi = await envoyerActivation(emailCompte, f.nom, copro);
        if (r.envoi === "envoye") await tracerEnvoi(id);
        continue;
      }

      const email = (f.email ?? "").trim().toLowerCase();
      if (!email || !EMAIL_VALIDE.test(email)) {
        r.statut = "sans_email";
        continue;
      }

      // --- Compte existant pour cette adresse ? ---
      let userId = comptesDeLAppel.get(email) ?? null;
      let dejaConnecte = false;
      if (!userId) {
        const { data: comptes } = await admin.rpc("compte_par_email", { p_email: email });
        const compte = (comptes ?? [])[0] as
          | { user_id: string; role: string | null; derniere_connexion: string | null }
          | undefined;
        if (compte) {
          if (compte.role !== "copro") {
            r.statut = "email_pris";
            r.detail = compte.role
              ? `Adresse déjà utilisée par ${ROLE_LIBELLE[compte.role] ?? "un autre compte"}`
              : "Adresse déjà utilisée par un compte incomplet";
            continue;
          }
          userId = compte.user_id;
          dejaConnecte = !!compte.derniere_connexion;
          r.statut = "relie";
        }
      } else {
        r.statut = "relie";
      }

      // --- Sinon : création du compte et du profil copropriétaire ---
      if (!userId) {
        const { data: cree, error: creeErr } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: f.nom },
        });
        if (creeErr || !cree.user) {
          r.detail = "La création du compte a échoué";
          console.error("createUser", creeErr);
          continue;
        }
        const { error: profilErr } = await admin.from("profiles").insert({
          user_id: cree.user.id,
          full_name: f.nom,
          initials: initialesDe(f.nom),
          role: "copro",
        });
        if (profilErr) {
          // pas de compte orphelin sans profil
          await admin.auth.admin.deleteUser(cree.user.id);
          r.detail = "La création du profil a échoué";
          console.error("profil", profilErr);
          continue;
        }
        userId = cree.user.id;
        r.statut = "invite";
      }
      comptesDeLAppel.set(email, userId);

      if (!(await relier(id, userId))) {
        r.statut = "erreur";
        r.detail = "Rattachement de la fiche impossible";
        continue;
      }

      if (adressesEcrites.has(email)) {
        r.detail = "Même adresse qu'une autre fiche : un seul e-mail envoyé";
        continue;
      }
      adressesEcrites.add(email);
      r.envoi = dejaConnecte ? await envoyerAjout(email, f.nom, copro) : await envoyerActivation(email, f.nom, copro);
      if (r.envoi === "envoye") await tracerEnvoi(id);
    } catch (e) {
      console.error("Espace copropriétaire", id, e);
      r.statut = "erreur";
      r.detail = "Erreur inattendue";
    }
  }

  return json(200, { resultats, mode: resendKey ? "resend" : "simulation" });
});
