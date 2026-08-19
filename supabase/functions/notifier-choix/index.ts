// Edge function « notifier-choix » — appelée par l'AMO quand il retient ou
// refuse une candidature. Envoie l'e-mail de décision au prestataire (via
// Resend si RESEND_API_KEY est configuré, sinon statut 'simule') et trace la
// décision sur la candidature (decision_at, decision_email_statut).
// Candidature saisie à la main (hors plateforme, sans prestataire) : aucun
// e-mail possible — la décision est tracée quand même.
import { createClient } from "npm:@supabase/supabase-js@2";

const TYPE_LABELS: Record<string, string> = {
  moe: "Maîtrise d'œuvre",
  diag: "Diagnostiqueur",
  ct: "Contrôleur technique",
  sps: "Coordonnateur SPS",
  autre: "Autre intervenant",
};

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

  const { candidature_id } = await req.json().catch(() => ({}));
  if (!candidature_id) return json(400, { error: "candidature_id manquant" });

  const { data: cand, error: candErr } = await admin
    .from("candidatures")
    .select("*, consultations(*, coproprietes(name, adresse, city)), prestataires(raison_sociale, contact_nom, email)")
    .eq("id", candidature_id)
    .maybeSingle();
  if (candErr || !cand) return json(404, { error: "Candidature introuvable" });
  if (cand.statut !== "retenue" && cand.statut !== "non_retenue") {
    return json(400, { error: "La candidature n'a pas encore de décision (retenue / non retenue)" });
  }

  const cs = cand.consultations;
  const presta = cand.prestataires;
  const retenue = cand.statut === "retenue";

  // Candidature hors plateforme : pas d'e-mail, mais la décision est datée
  if (!presta?.email) {
    await admin
      .from("candidatures")
      .update({ decision_at: new Date().toISOString(), decision_email_statut: null })
      .eq("id", candidature_id);
    return json(200, { statut: "aucun_email", retenue });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:5173";

  const coproNom = cs?.coproprietes?.name ?? cs?.copro_externe_nom ?? "—";
  const typeLabel = TYPE_LABELS[cs?.type ?? ""] ?? cs?.type ?? "";
  const lienEspace = `${appUrl}/prestataire/candidatures`;
  const estMoe = cs?.type === "moe";

  let statut: "envoye" | "simule" | "erreur" = "simule";
  let erreur: string | null = null;

  if (resendKey) {
    const html = retenue
      ? `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
          <p>Bonjour${presta.contact_nom ? " " + presta.contact_nom : ""},</p>
          <p>Bonne nouvelle : votre candidature <strong>${typeLabel}</strong> pour la copropriété
          <strong>${coproNom}</strong> a été <strong>retenue</strong> par l'équipe Strat Eco.</p>
          <p>Prochaine étape : connectez-vous à votre espace prestataire et
          <strong>confirmez votre engagement</strong> sur l'opération${estMoe ? " — le projet apparaîtra alors dans votre section « Mes projets » avec l'accès aux données de l'opération" : ""}.</p>
          <p style="margin:22px 0">
            <a href="${lienEspace}"
               style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
              Confirmer mon engagement
            </a>
          </p>
          <p>Bien cordialement,<br/><strong>L'équipe Strat Eco</strong></p>
        </div>`
      : `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
          <p>Bonjour${presta.contact_nom ? " " + presta.contact_nom : ""},</p>
          <p>Nous vous remercions pour votre offre <strong>${typeLabel}</strong> concernant la copropriété
          <strong>${coproNom}</strong>.</p>
          <p>Au terme de l'analyse des candidatures, votre offre n'a <strong>pas été retenue</strong>
          pour cette opération. Cette décision ne remet pas en cause votre référencement :
          vous continuerez à recevoir nos prochaines consultations.</p>
          <p>Bien cordialement,<br/><strong>L'équipe Strat Eco</strong></p>
        </div>`;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [presta.email],
          subject: retenue
            ? `Candidature retenue — ${coproNom}`
            : `Consultation ${typeLabel} — ${coproNom} : réponse`,
          html,
        }),
      });
      if (r.ok) statut = "envoye";
      else {
        statut = "erreur";
        erreur = `Resend ${r.status}: ${(await r.text()).slice(0, 300)}`;
      }
    } catch (e) {
      statut = "erreur";
      erreur = String(e).slice(0, 300);
    }
  }

  await admin
    .from("candidatures")
    .update({ decision_at: new Date().toISOString(), decision_email_statut: statut })
    .eq("id", candidature_id);

  return json(200, { statut, erreur, retenue, email: presta.email });
});
