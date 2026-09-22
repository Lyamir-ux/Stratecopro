// Edge function « notifier-demande-amo » - un syndic vient de déposer une
// demande d'AMO depuis son espace (feedbacks Amir 22/09/2026). L'équipe Strat
// Eco est alertée par e-mail : la demande ne porte pas encore sur un dossier,
// donc tous les comptes AMO actifs sont prévenus.
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

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });

  const { data: profile } = await admin
    .from("profiles")
    .select("role, active, full_name")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile || !profile.active) return json(403, { error: "Profil inactif" });

  const { demande_id } = await req.json().catch(() => ({}));
  if (!demande_id) return json(400, { error: "demande_id attendu" });

  const { data: demande } = await admin
    .from("demandes_amo")
    .select("*")
    .eq("id", demande_id)
    .maybeSingle();
  if (!demande) return json(404, { error: "Demande introuvable" });
  // seul l'auteur de la demande déclenche son alerte
  if (demande.demandeur_user_id !== userData.user.id) {
    return json(403, { error: "Cette demande n'est pas la vôtre" });
  }

  // Destinataires : l'équipe AMO (la demande ne porte pas encore sur un dossier)
  const { data: amos } = await admin
    .from("profiles")
    .select("user_id, full_name, active, role")
    .eq("role", "amo")
    .eq("active", true);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";

  const details = [
    demande.adresse ? `Adresse : <strong>${demande.adresse}</strong>` : null,
    demande.nb_lots ? `Nombre de lots : <strong>${demande.nb_lots}</strong>` : null,
    demande.chauffage ? `Chauffage : <strong>${demande.chauffage}</strong>` : null,
    demande.vmc == null ? null : `VMC : <strong>${demande.vmc ? "oui" : "non"}</strong>`,
  ].filter(Boolean).join("<br/>");

  const contenu = (nom: string) => ({
    sujet: `Demande d'AMO - ${demande.copro_nom}`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
        <p>Bonjour${nom ? " " + nom : ""},</p>
        <p><strong>${demande.demandeur_nom || "Un gestionnaire"}</strong>${demande.syndic_name ? ` (${demande.syndic_name})` : ""}
        souhaite l'accompagnement de Strat Eco sur la copropriété <strong>${demande.copro_nom}</strong>.</p>
        ${details ? `<p>${details}</p>` : ""}
        ${BOUTON(`${appUrl}/demandes`, "Voir la demande")}
        <p>Bien cordialement,<br/><strong>Strat Eco pro</strong></p>
      </div>`,
  });

  let envoyes = 0, simules = 0, erreurs = 0;
  const cibles = (amos ?? []).filter((a) => a.user_id !== userData.user.id);

  for (const cible of cibles) {
    const { data: u } = await admin.auth.admin.getUserById(cible.user_id);
    const email = u?.user?.email;
    if (!email) continue;

    if (!resendKey) {
      simules++;
      continue;
    }
    const { sujet, html } = contenu(cible.full_name ?? "");
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
    total: cibles.length,
    envoyes,
    simules,
    erreurs,
    mode: resendKey ? "resend" : "simulation",
  });
});
