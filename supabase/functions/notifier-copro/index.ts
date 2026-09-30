// Edge function « notifier-copro » - alertes e-mail du fil privé entre un
// copropriétaire et l'équipe AMO de son dossier (onglet « Nous contacter » du
// portail, feedback Amir 22/09/2026). Deux événements :
//   - message_copro     : le copropriétaire a écrit → alerte « Une question de
//                         UNTEL vous attend pour telle copropriété » au chef de
//                         projet du dossier (demande d'Amir du 30/09/2026), et
//                         aux membres AMO du dossier (copro_members) s'il y en a ;
//   - message_amo_copro : l'AMO a répondu dans le fil privé → alerte au
//                         copropriétaire concerné.
// L'alerte ne contient jamais le corps du message : il se lit dans l'espace.
// Envoi réel via Resend si RESEND_API_KEY est configuré, sinon 'simule'
// (même parti pris que notifier-syndic).
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

type TypeNotif = "message_copro" | "message_amo_copro";

/** Comparaison de noms : minuscules, sans accents, espaces simples (même règle
 *  que notifier-passation et la fonction SQL devis_amo_normaliser_nom). */
function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Texte saisi (noms) inséré dans le HTML de l'e-mail. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const BOUTON = (href: string, libelle: string) =>
  `<p style="margin:22px 0">
     <a href="${href}"
        style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
       ${libelle}
     </a>
   </p>`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- Appelant authentifié ---
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });

  const { data: profile } = await admin
    .from("profiles")
    .select("role, active, full_name")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile || !profile.active) return json(403, { error: "Profil inactif" });

  const { copro_id, coproprietaire_id, type } = await req.json().catch(() => ({}));
  if (!copro_id || !coproprietaire_id || !type) {
    return json(400, { error: "copro_id, coproprietaire_id et type attendus" });
  }
  const typeNotif = type as TypeNotif;
  if (!["message_copro", "message_amo_copro"].includes(typeNotif)) {
    return json(400, { error: "type inconnu" });
  }
  // message_copro : émis par le copropriétaire ; message_amo_copro : par l'AMO
  if (typeNotif === "message_copro" ? profile.role !== "copro" : profile.role !== "amo") {
    return json(403, { error: "Rôle de l'appelant incompatible avec ce type d'alerte" });
  }

  const { data: copro } = await admin
    .from("coproprietes")
    .select("id, name, chef_projet")
    .eq("id", copro_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!copro) return json(404, { error: "Copropriété introuvable" });

  const { data: coproprietaire } = await admin
    .from("coproprietaires")
    .select("id, nom, user_id, copro_id")
    .eq("id", coproprietaire_id)
    .maybeSingle();
  if (!coproprietaire || coproprietaire.copro_id !== copro_id) {
    return json(404, { error: "Copropriétaire introuvable sur ce dossier" });
  }
  // un copropriétaire n'alerte que depuis son propre fil
  if (typeNotif === "message_copro" && coproprietaire.user_id !== userData.user.id) {
    return json(403, { error: "Ce fil n'est pas le vôtre" });
  }

  // --- Destinataires ---
  // role : chef = chef de projet du dossier, equipe = membre AMO du dossier,
  // repli = dirigeant alerté faute de chef de projet identifié
  const cibles = new Map<string, { user_id: string; nom: string; role?: "chef" | "equipe" | "repli" }>();
  let chefNom: string | null = null;

  if (typeNotif === "message_copro") {
    // Le chef de projet est saisi en clair sur la fiche : on retrouve son compte
    // parmi les AMO actifs par son nom. Le 30/09/2026, seuls 6 dossiers sur 204
    // avaient un membre AMO (copro_members) : les questions du portail ne
    // prévenaient donc personne (Parc des Cigognes).
    const { data: equipe } = await admin
      .from("profiles")
      .select("user_id, full_name, dirigeant")
      .eq("role", "amo")
      .eq("active", true);
    const chefSaisi = (copro.chef_projet ?? "").trim();
    const chef = chefSaisi
      ? (equipe ?? []).find((p) => normaliser(p.full_name ?? "") === normaliser(chefSaisi))
      : undefined;
    if (chef) {
      chefNom = chef.full_name ?? chefSaisi;
      cibles.set(chef.user_id, { user_id: chef.user_id, nom: chef.full_name ?? "", role: "chef" });
    }
    const { data: membres } = await admin
      .from("copro_members")
      .select("user_id, profiles(full_name, role, active)")
      .eq("copro_id", copro_id);
    for (const m of membres ?? []) {
      const p = m.profiles as { full_name?: string; role?: string; active?: boolean } | null;
      if (p?.role === "amo" && p.active && !cibles.has(m.user_id)) {
        cibles.set(m.user_id, { user_id: m.user_id, nom: p.full_name ?? "", role: "equipe" });
      }
    }
    // ni chef de projet identifié ni équipe : le dirigeant, pour qu'aucune
    // question ne reste sans lecteur
    if (cibles.size === 0) {
      for (const p of equipe ?? []) {
        if (p.dirigeant) cibles.set(p.user_id, { user_id: p.user_id, nom: p.full_name ?? "", role: "repli" });
      }
    }
  } else if (coproprietaire.user_id) {
    const { data: p } = await admin
      .from("profiles")
      .select("full_name, active")
      .eq("user_id", coproprietaire.user_id)
      .maybeSingle();
    if (p?.active) {
      cibles.set(coproprietaire.user_id, {
        user_id: coproprietaire.user_id,
        nom: p.full_name || coproprietaire.nom || "",
      });
    }
  }
  cibles.delete(userData.user.id); // on n'alerte pas l'auteur du message

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";

  const contenu = (nom: string, role?: "chef" | "equipe" | "repli"): { sujet: string; html: string } => {
    const bonjour = `<p>Bonjour${nom ? " " + esc(nom) : ""},</p>`;
    const signature = `<p>Bien cordialement,<br/><strong>Strat Eco pro</strong></p>`;
    if (typeNotif === "message_copro") {
      const auteur = coproprietaire.nom || profile.full_name || "un copropriétaire";
      const chefSaisi = (copro.chef_projet ?? "").trim();
      // le bouton ouvre directement le fil privé de ce copropriétaire, prêt pour la réponse
      const lien = `${appUrl}/copros/${copro.id}/communications?canal=coproprietaires&cp=${coproprietaire.id}`;
      return {
        sujet: `Une question de ${auteur} vous attend pour ${copro.name}`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
            ${bonjour}
            <p>Une question de <strong>${esc(auteur)}</strong> vous attend pour la copropriété
            <strong>${esc(copro.name)}</strong>.</p>
            <p>Elle a été posée depuis l'espace copropriétaire (onglet « Nous contacter »). Vous pouvez la
            lire et y répondre en privé dans l'onglet Communications du dossier.</p>
            ${role === "equipe" && chefNom ? `<p>Chef de projet du dossier : <strong>${esc(chefNom)}</strong>.</p>` : ""}
            ${role === "repli"
              ? `<p>Cette alerte vous est adressée car ${chefSaisi
                  ? `le chef de projet saisi sur le dossier (« ${esc(chefSaisi)} ») ne correspond à aucun compte Strat Eco`
                  : "le dossier n'a pas de chef de projet"}.</p>`
              : ""}
            ${BOUTON(lien, "Lire et répondre")}
            ${signature}
          </div>`,
      };
    }
    return {
      sujet: `Réponse de Strat Eco - ${copro.name}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
          ${bonjour}
          <p>L'équipe Strat Eco${profile.full_name ? ` (${profile.full_name})` : ""} vous a répondu au sujet
          de votre copropriété <strong>${copro.name}</strong>. Le message vous attend dans votre espace
          copropriétaire, onglet « Nous contacter ».</p>
          ${BOUTON(`${appUrl}/portail/messages`, "Lire la réponse")}
          ${signature}
        </div>`,
    };
  };

  let envoyes = 0, simules = 0, erreurs = 0;

  for (const cible of cibles.values()) {
    const { data: u } = await admin.auth.admin.getUserById(cible.user_id);
    const email = u?.user?.email;
    if (!email) continue;

    if (!resendKey) {
      simules++;
      continue;
    }
    const { sujet, html } = contenu(cible.nom, cible.role);
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email], subject: sujet, html }),
      });
      if (r.ok) envoyes++;
      else {
        erreurs++;
        console.error("Resend a refusé l'envoi", r.status, await r.text().catch(() => ""));
      }
    } catch (e) {
      erreurs++;
      console.error("Envoi impossible", e);
    }
  }

  return json(200, {
    total: cibles.size,
    envoyes,
    simules,
    erreurs,
    mode: resendKey ? "resend" : "simulation",
  });
});
