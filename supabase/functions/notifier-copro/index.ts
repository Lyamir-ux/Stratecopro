// Edge function « notifier-copro » - alertes e-mail du fil privé entre un
// copropriétaire et l'équipe AMO de son dossier (onglet « Nous contacter » du
// portail, feedback Amir 22/09/2026). Deux événements :
//   - message_copro     : le copropriétaire a écrit → alerte à l'équipe AMO
//                         du dossier (copro_members de rôle amo) ;
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
  const cibles = new Map<string, { user_id: string; nom: string }>();

  if (typeNotif === "message_copro") {
    const { data: membres } = await admin
      .from("copro_members")
      .select("user_id, profiles(full_name, role, active)")
      .eq("copro_id", copro_id);
    for (const m of membres ?? []) {
      const p = m.profiles as { full_name?: string; role?: string; active?: boolean } | null;
      if (p?.role === "amo" && p.active) cibles.set(m.user_id, { user_id: m.user_id, nom: p.full_name ?? "" });
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

  const contenu = (nom: string): { sujet: string; html: string } => {
    const bonjour = `<p>Bonjour${nom ? " " + nom : ""},</p>`;
    const signature = `<p>Bien cordialement,<br/><strong>Strat Eco pro</strong></p>`;
    if (typeNotif === "message_copro") {
      return {
        sujet: `Message d'un copropriétaire - ${copro.name}`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
            ${bonjour}
            <p><strong>${coproprietaire.nom}</strong>, copropriétaire de <strong>${copro.name}</strong>,
            vous a écrit depuis son portail (onglet « Nous contacter »). Son message vous attend dans
            l'onglet Communications du dossier.</p>
            ${copro.chef_projet ? `<p>Chef de projet du dossier : <strong>${copro.chef_projet}</strong>.</p>` : ""}
            ${BOUTON(`${appUrl}/copros/${copro.id}/communications`, "Lire le message")}
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
    const { sujet, html } = contenu(cible.nom);
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
