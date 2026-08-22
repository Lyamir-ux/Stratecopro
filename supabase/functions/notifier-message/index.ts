// Edge function « notifier-message » - appelée par l'AMO après l'envoi d'un
// message aux prestataires d'un projet (onglet Communications du dossier).
// Envoie une simple alerte « vous avez un message en attente » SANS le contenu
// du message (exigence : le message se lit dans l'espace prestataire).
// Destinataires : l'entreprise visée si le message est privé, sinon toutes les
// entreprises retenues sur une consultation de la copro.
// Envoi réel via Resend si RESEND_API_KEY est configuré, sinon 'simule'.
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

  // --- L'appelant doit être un AMO actif ---
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });

  const { data: profile } = await admin
    .from("profiles")
    .select("role, active")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile || !profile.active || profile.role !== "amo") {
    return json(403, { error: "Réservé à l'équipe AMO" });
  }

  const { copro_id, prestataire_id } = await req.json().catch(() => ({}));
  if (!copro_id) return json(400, { error: "copro_id manquant" });

  const { data: copro } = await admin
    .from("coproprietes")
    .select("name")
    .eq("id", copro_id)
    .maybeSingle();

  // --- Destinataires : entreprise visée, ou toutes les retenues du projet ---
  let cibles: { id: string; raison_sociale: string; contact_nom: string | null; email: string }[] = [];
  if (prestataire_id) {
    const { data } = await admin
      .from("prestataires")
      .select("id, raison_sociale, contact_nom, email")
      .eq("id", prestataire_id)
      .eq("actif", true);
    cibles = data ?? [];
  } else {
    const { data } = await admin
      .from("candidatures")
      .select("prestataires(id, raison_sociale, contact_nom, email, actif), consultations!inner(copro_id)")
      .eq("statut", "retenue")
      .eq("consultations.copro_id", copro_id);
    const vus = new Set<string>();
    for (const row of data ?? []) {
      const p = row.prestataires as unknown as
        | { id: string; raison_sociale: string; contact_nom: string | null; email: string; actif: boolean }
        | null;
      if (p && p.actif && !vus.has(p.id)) {
        vus.add(p.id);
        cibles.push(p);
      }
    }
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:5173";
  const lien = `${appUrl}/prestataire/messages`;

  let envoyes = 0, simules = 0, erreurs = 0;

  for (const p of cibles) {
    if (!resendKey) {
      simules++;
      continue;
    }
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
        <p>Bonjour${p.contact_nom ? " " + p.contact_nom : ""},</p>
        <p>L'équipe <strong>Strat Eco</strong> vous a adressé un message concernant l'opération
        <strong>${copro?.name ?? ""}</strong>.</p>
        <p>Pour des raisons de confidentialité, le contenu du message n'est pas transmis par e-mail :
        il vous attend dans votre espace prestataire.</p>
        <p style="margin:22px 0">
          <a href="${lien}"
             style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
            Lire le message
          </a>
        </p>
        <p>Bien cordialement,<br/><strong>L'équipe Strat Eco</strong></p>
      </div>`;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [p.email],
          subject: `Nouveau message Strat Eco - ${copro?.name ?? "votre projet"}`,
          html,
        }),
      });
      if (r.ok) envoyes++;
      else erreurs++;
    } catch {
      erreurs++;
    }
  }

  return json(200, {
    total: cibles.length,
    envoyes,
    simules,
    erreurs,
    mode: resendKey ? "resend" : "simulation",
  });
});
