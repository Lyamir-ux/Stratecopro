// Edge function « notifier-consultation » — appelée par l'AMO juste après la
// publication d'une consultation. Cherche dans la base les prestataires
// référencés ACTIFS dont les métiers (types) couvrent la prestation consultée,
// leur envoie un e-mail d'alerte et journalise chaque envoi dans
// consultation_notifications.
//
// Envoi réel via Resend si le secret RESEND_API_KEY est configuré
// (supabase secrets set RESEND_API_KEY=re_xxx [RESEND_FROM="Strat Eco <consultations@strateco.fr>"] [APP_URL=https://...]).
// Sans clé : chaque notification est journalisée avec le statut 'simule'
// — le parcours reste testable de bout en bout sans provider.
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

  // --- L'appelant doit être un AMO actif (le JWT est déjà vérifié par la gateway) ---
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

  const { consultation_id } = await req.json().catch(() => ({}));
  if (!consultation_id) return json(400, { error: "consultation_id manquant" });

  const { data: cs, error: csErr } = await admin
    .from("consultations")
    .select("*, coproprietes(name, adresse, city)")
    .eq("id", consultation_id)
    .maybeSingle();
  if (csErr || !cs) return json(404, { error: "Consultation introuvable" });

  // --- Prestataires référencés actifs couvrant ce métier, pas encore alertés ---
  const { data: prestas, error: pErr } = await admin
    .from("prestataires")
    .select("id, raison_sociale, contact_nom, email")
    .eq("actif", true)
    .contains("types", [cs.type]);
  if (pErr) return json(500, { error: pErr.message });

  const { data: deja } = await admin
    .from("consultation_notifications")
    .select("prestataire_id")
    .eq("consultation_id", consultation_id);
  const dejaIds = new Set((deja ?? []).map((n) => n.prestataire_id));
  const cibles = (prestas ?? []).filter((p) => !dejaIds.has(p.id));

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:5173";

  const coproNom = cs.coproprietes?.name ?? cs.copro_externe_nom ?? "—";
  const coproLieu = cs.coproprietes
    ? [cs.coproprietes.adresse, cs.coproprietes.city].filter(Boolean).join(", ")
    : [cs.copro_externe_adresse, cs.copro_externe_ville].filter(Boolean).join(", ");
  const typeLabel = TYPE_LABELS[cs.type] ?? cs.type;
  const dateLimite = cs.date_limite
    ? new Date(cs.date_limite).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null;

  let envoyes = 0, simules = 0, erreurs = 0;

  for (const p of cibles) {
    let statut: "simule" | "envoye" | "erreur" = "simule";
    let erreur: string | null = null;

    if (resendKey) {
      const html = `
        <p>Bonjour${p.contact_nom ? " " + p.contact_nom : ""},</p>
        <p>Une nouvelle consultation <strong>${typeLabel}</strong> vient d'être publiée
        sur la plateforme Strat Eco Pro pour la copropriété <strong>${coproNom}</strong>${coproLieu ? " (" + coproLieu + ")" : ""}.</p>
        <blockquote style="border-left:3px solid #7AB52C;padding-left:12px;color:#444">${cs.mission}</blockquote>
        ${dateLimite ? `<p>Date limite de réponse : <strong>${dateLimite}</strong>.</p>` : ""}
        <p>Si cette mission vous intéresse, connectez-vous à votre espace prestataire pour déposer votre offre :</p>
        <p><a href="${appUrl}/login" style="background:#7AB52C;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Consulter et postuler</a></p>
        <p style="color:#888;font-size:13px">Vous recevez cet e-mail car votre entreprise est référencée « ${typeLabel} » auprès de Strat Eco.</p>`;
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: [p.email],
            subject: `Nouvelle consultation ${typeLabel} — ${coproNom}`,
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

    await admin.from("consultation_notifications").insert({
      consultation_id,
      prestataire_id: p.id,
      email: p.email,
      statut,
      erreur,
    });
    if (statut === "envoye") envoyes++;
    else if (statut === "simule") simules++;
    else erreurs++;
  }

  return json(200, {
    total: cibles.length,
    envoyes,
    simules,
    erreurs,
    mode: resendKey ? "resend" : "simulation",
  });
});
