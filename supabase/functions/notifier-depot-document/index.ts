// Edge function « notifier-depot-document » - appelée après un dépôt de
// document par le syndic (montage bancaire). Alerte par e-mail l'équipe AMO
// rattachée au dossier (copro_members), au premier chef le chef de projet,
// pour qu'aucun dépôt ne passe inaperçu.
//
// Envoi réel via Resend si le secret RESEND_API_KEY est configuré
// (voir notifier-consultation) ; sans clé, l'envoi est simulé et la réponse
// l'indique - le parcours reste testable sans provider.
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

  // --- Déposant authentifié (le JWT est vérifié par la gateway) ---
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });

  const { data: profile } = await admin
    .from("profiles")
    .select("role, active, full_name")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile || !profile.active) return json(403, { error: "Profil inactif" });

  // Seuls les dépôts du syndic déclenchent une alerte : l'équipe AMO n'a pas
  // besoin d'être notifiée de ses propres dépôts.
  if (profile.role !== "syndic") return json(200, { skipped: "deposant non syndic" });

  const { copro_id, doc_name, contexte } = await req.json().catch(() => ({}));
  if (!copro_id || !doc_name) return json(400, { error: "copro_id et doc_name attendus" });

  const { data: copro } = await admin
    .from("coproprietes")
    .select("id, name, chef_projet")
    .eq("id", copro_id)
    .maybeSingle();
  if (!copro) return json(404, { error: "Copropriété introuvable" });

  // --- Équipe AMO du dossier ---
  const { data: membres } = await admin
    .from("copro_members")
    .select("user_id, profiles(full_name, role, active)")
    .eq("copro_id", copro_id);
  const cibles = (membres ?? []).filter(
    (m) => (m.profiles as { role?: string; active?: boolean } | null)?.role === "amo" &&
      (m.profiles as { active?: boolean } | null)?.active,
  );

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";

  let envoyes = 0, simules = 0, erreurs = 0;

  for (const m of cibles) {
    const { data: u } = await admin.auth.admin.getUserById(m.user_id);
    const email = u?.user?.email;
    if (!email) continue;

    if (!resendKey) {
      simules++;
      continue;
    }
    const nomMembre = (m.profiles as { full_name?: string } | null)?.full_name ?? "";
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
        <p>Bonjour${nomMembre ? " " + nomMembre : ""},</p>
        <p>Le syndic${profile.full_name ? ` (${profile.full_name})` : ""} vient de déposer un document
        sur le dossier <strong>${copro.name}</strong> :</p>
        <p style="padding:10px 14px;background:#f4f6f0;border-left:3px solid #7AB52C;border-radius:4px">
          <strong>${doc_name}</strong>${contexte ? `<br/><span style="color:#666">${contexte}</span>` : ""}
        </p>
        ${copro.chef_projet ? `<p>Chef de projet du dossier : <strong>${copro.chef_projet}</strong>.</p>` : ""}
        <p style="margin:22px 0">
          <a href="${appUrl}/copros/${copro.id}"
             style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
            Ouvrir le dossier
          </a>
        </p>
        <p>Bien cordialement,<br/><strong>Strat Eco pro</strong></p>
      </div>`;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [email],
          subject: `Dépôt syndic - ${doc_name} · ${copro.name}`,
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
