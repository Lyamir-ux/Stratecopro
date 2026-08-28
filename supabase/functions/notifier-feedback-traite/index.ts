// Edge function « notifier-feedback-traite » - appelée quand un membre de
// l'équipe AMO clique « Traiter » sur un retour de test (page Paramètres).
// Envoie automatiquement un mail de compte rendu à l'auteur du retour :
// son adresse est celle de son compte (auth.users), aucune saisie nécessaire.
// Le résultat de l'envoi est tracé sur la ligne du feedback
// (traite_email_statut / traite_email_le, migration 0042).
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

const TYPE_LABEL: Record<string, string> = {
  bug: "bug",
  idee: "idée",
  remarque: "remarque",
};

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

  const { feedback_id } = await req.json().catch(() => ({}));
  if (!feedback_id) return json(400, { error: "feedback_id manquant" });

  const { data: fb } = await admin
    .from("feedbacks")
    .select("id, user_id, auteur_nom, type, message, page, created_at")
    .eq("id", feedback_id)
    .maybeSingle();
  if (!fb) return json(404, { error: "Retour introuvable" });

  const trace = async (statut: "envoye" | "simule" | "erreur" | "sans_email") => {
    await admin
      .from("feedbacks")
      .update({ traite_email_statut: statut, traite_email_le: new Date().toISOString() })
      .eq("id", fb.id);
  };

  // --- Adresse de l'auteur : celle de son compte ---
  let email: string | null = null;
  if (fb.user_id) {
    const { data: auteur } = await admin.auth.admin.getUserById(fb.user_id);
    email = auteur?.user?.email ?? null;
  }
  if (!email) {
    await trace("sans_email");
    return json(200, { statut: "sans_email" });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  if (!resendKey) {
    await trace("simule");
    return json(200, { statut: "simule" });
  }

  const date = new Date(fb.created_at).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const type = TYPE_LABEL[fb.type] ?? "remarque";
  const prenom = (fb.auteur_nom ?? "").trim();
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
      <p>Bonjour${prenom ? " " + prenom : ""},</p>
      <p>Votre ${type} du <strong>${date}</strong> sur l'application Strat Eco a été
      <strong>traité par l'équipe</strong> :</p>
      <blockquote style="margin:14px 0;padding:10px 14px;border-left:3px solid #355717;background:#f4f6f1;white-space:pre-wrap">${
        fb.message
      }</blockquote>
      <p>La correction ou la réponse correspondante est en ligne - n'hésitez pas à
      vérifier lors de votre prochaine connexion et à redéposer un retour si le
      problème persiste.</p>
      <p>Merci pour votre contribution,<br/><strong>L'équipe Strat Eco</strong></p>
    </div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Votre retour a été traité - Strat Eco",
        html,
      }),
    });
    // La raison du refus (domaine non vérifié, from invalide...) part dans les
    // logs de la fonction - sinon l'erreur est invisible et indiagnosticable.
    if (!r.ok) console.error("Resend a refusé l'envoi:", r.status, await r.text().catch(() => ""));
    await trace(r.ok ? "envoye" : "erreur");
    return json(200, { statut: r.ok ? "envoye" : "erreur" });
  } catch {
    await trace("erreur");
    return json(200, { statut: "erreur" });
  }
});
