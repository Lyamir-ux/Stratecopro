// Edge function « notifier-syndic » - alertes e-mail entre l'équipe AMO et le
// syndic d'un dossier. Trois événements :
//   - message_amo    : l'AMO a écrit sur le canal syndic → alerte (sans le
//                      contenu) aux gestionnaires du dossier et aux directeurs
//                      de l'enseigne ;
//   - message_syndic : le syndic a écrit → alerte à l'équipe AMO du dossier ;
//   - pf_valide      : le plan de financement définitif vient d'être validé →
//                      les gestionnaires et directeurs en sont informés.
// Envoi réel via Resend si RESEND_API_KEY est configuré, sinon 'simule'
// (même parti pris que notifier-consultation et notifier-depot-document).
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

type TypeNotif = "message_amo" | "message_syndic" | "pf_valide";

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

  const { copro_id, type } = await req.json().catch(() => ({}));
  if (!copro_id || !type) return json(400, { error: "copro_id et type attendus" });
  const typeNotif = type as TypeNotif;
  if (!["message_amo", "message_syndic", "pf_valide"].includes(typeNotif)) {
    return json(400, { error: "type inconnu" });
  }
  // message_amo / pf_valide : émis par l'AMO ; message_syndic : émis par le syndic
  if (typeNotif === "message_syndic" ? profile.role !== "syndic" : profile.role !== "amo") {
    return json(403, { error: "Rôle de l'appelant incompatible avec ce type d'alerte" });
  }

  const { data: copro } = await admin
    .from("coproprietes")
    .select("id, name, organisation_id, chef_projet")
    .eq("id", copro_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!copro) return json(404, { error: "Copropriété introuvable" });

  // --- Destinataires ---
  // Côté syndic : gestionnaires rattachés au dossier (copro_members 'syndic')
  // + directeurs de l'enseigne. Côté AMO : l'équipe du dossier.
  const cibles = new Map<string, { user_id: string; nom: string }>();

  if (typeNotif === "message_syndic") {
    const { data: membres } = await admin
      .from("copro_members")
      .select("user_id, member_role, profiles(full_name, role, active)")
      .eq("copro_id", copro_id);
    for (const m of membres ?? []) {
      const p = m.profiles as { full_name?: string; role?: string; active?: boolean } | null;
      if (p?.role === "amo" && p.active) cibles.set(m.user_id, { user_id: m.user_id, nom: p.full_name ?? "" });
    }
  } else {
    const { data: membres } = await admin
      .from("copro_members")
      .select("user_id, member_role, profiles(full_name, role, active)")
      .eq("copro_id", copro_id);
    for (const m of membres ?? []) {
      const p = m.profiles as { full_name?: string; role?: string; active?: boolean } | null;
      if (m.member_role === "syndic" && p?.role === "syndic" && p.active) {
        cibles.set(m.user_id, { user_id: m.user_id, nom: p.full_name ?? "" });
      }
    }
    if (copro.organisation_id) {
      const { data: dirs } = await admin
        .from("organisation_membres")
        .select("user_id, org_role, profiles(full_name, active)")
        .eq("organisation_id", copro.organisation_id)
        .eq("org_role", "directeur");
      for (const d of dirs ?? []) {
        const p = d.profiles as { full_name?: string; active?: boolean } | null;
        if (p?.active) cibles.set(d.user_id, { user_id: d.user_id, nom: p.full_name ?? "" });
      }
    }
  }
  cibles.delete(userData.user.id); // on n'alerte pas l'auteur de l'événement

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";

  const contenu = (nom: string): { sujet: string; html: string } => {
    const bonjour = `<p>Bonjour${nom ? " " + nom : ""},</p>`;
    const signature = `<p>Bien cordialement,<br/><strong>Strat Eco pro</strong></p>`;
    if (typeNotif === "message_amo") {
      return {
        sujet: `Nouveau message de Strat Eco - ${copro.name}`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
            ${bonjour}
            <p>L'équipe Strat Eco${profile.full_name ? ` (${profile.full_name})` : ""} vous a écrit un message
            au sujet du dossier <strong>${copro.name}</strong>. Il vous attend dans votre espace syndic.</p>
            ${BOUTON(`${appUrl}/syndic/messages?copro=${copro.id}`, "Lire le message")}
            ${signature}
          </div>`,
      };
    }
    if (typeNotif === "message_syndic") {
      return {
        sujet: `Message du syndic - ${copro.name}`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
            ${bonjour}
            <p>Le syndic${profile.full_name ? ` (${profile.full_name})` : ""} vous a écrit un message
            sur le dossier <strong>${copro.name}</strong> (onglet Communications).</p>
            ${copro.chef_projet ? `<p>Chef de projet du dossier : <strong>${copro.chef_projet}</strong>.</p>` : ""}
            ${BOUTON(`${appUrl}/copros/${copro.id}/communications`, "Lire le message")}
            ${signature}
          </div>`,
      };
    }
    return {
      sujet: `Plan de financement validé - ${copro.name}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
          ${bonjour}
          <p>Le plan de financement définitif de la copropriété <strong>${copro.name}</strong> vient d'être
          validé par l'équipe Strat Eco. Vous pouvez le consulter poste par poste (travaux par entreprise,
          frais annexes, aides) dans votre espace syndic, onglet Financement.</p>
          ${BOUTON(`${appUrl}/syndic/copros/${copro.id}/financement`, "Consulter le plan de financement")}
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
