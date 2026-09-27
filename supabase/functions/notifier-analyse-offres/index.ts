// Edge function « notifier-analyse-offres » - l'équipe vient de publier
// l'analyse des offres d'une consultation PPPT + DPE collectif demandée depuis
// le suivi des PPT (0109, idée d'Amir 27/09/2026). Préviennent : l'auteur de
// la demande, le gestionnaire affecté au dossier PPT et la direction de
// l'enseigne ; lien vers l'onglet Consultation de la fiche.
// Envoi réel via Resend si RESEND_API_KEY est configuré, sinon 'simule'.
// Tirets simples partout.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const BOUTON = (href: string, libelle: string) =>
  `<p style="margin:22px 0">
     <a href="${href}" style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">${libelle}</a>
   </p>`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });

  const { data: profile } = await admin.from("profiles").select("role, active").eq("user_id", userData.user.id).maybeSingle();
  if (!profile || !profile.active || profile.role !== "amo") return json(403, { error: "Réservé à l'équipe AMO" });

  const { consultation_id } = await req.json().catch(() => ({}));
  if (!consultation_id) return json(400, { error: "consultation_id attendu" });

  const { data: cs } = await admin
    .from("consultations")
    .select("id, ppt_copro_id, analyse_publiee_le, analyse_candidature_id, ppt_coproprietes(id, nom, organisation_id)")
    .eq("id", consultation_id)
    .maybeSingle();
  if (!cs || !cs.ppt_copro_id) return json(404, { error: "Consultation PPT introuvable" });
  if (!cs.analyse_publiee_le) return json(409, { error: "L'analyse n'est pas publiée" });
  const copro = cs.ppt_coproprietes as unknown as { id: string; nom: string; organisation_id: string } | null;
  if (!copro) return json(404, { error: "Copropriété introuvable" });

  const { count: nbOffres } = await admin
    .from("candidatures")
    .select("id", { count: "exact", head: true })
    .eq("consultation_id", cs.id)
    .is("retrait_at", null);
  let recommandee: string | null = null;
  if (cs.analyse_candidature_id) {
    const { data: ca } = await admin.from("candidatures").select("org_name").eq("id", cs.analyse_candidature_id).maybeSingle();
    recommandee = ca?.org_name ?? null;
  }

  // --- Destinataires : auteur de la demande, gestionnaire affecté, direction de l'enseigne ---
  const cibles = new Map<string, string>();
  const { data: demandes } = await admin.from("demandes_amo").select("demandeur_user_id, demandeur_nom").eq("consultation_id", cs.id);
  for (const d of demandes ?? []) if (d.demandeur_user_id) cibles.set(d.demandeur_user_id, d.demandeur_nom ?? "");
  const { data: aff } = await admin.from("ppt_affectations").select("user_id, nom").eq("ppt_copro_id", copro.id).is("au", null);
  for (const a of aff ?? []) if (a.user_id) cibles.set(a.user_id, a.nom ?? "");
  const { data: dirs } = await admin
    .from("organisation_membres")
    .select("user_id, profiles(full_name, active)")
    .eq("organisation_id", copro.organisation_id)
    .eq("org_role", "directeur");
  for (const d of dirs ?? []) {
    const p = d.profiles as { full_name?: string; active?: boolean } | null;
    if (p?.active) cibles.set(d.user_id, p.full_name ?? "");
  }
  cibles.delete(userData.user.id);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";
  const style = `font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px`;
  const n = nbOffres ?? 0;

  const contenu = (nom: string) => ({
    sujet: `Analyse des offres PPPT + DPE collectif - ${copro.nom}`,
    html: `<div style="${style}">
      <p>Bonjour${nom ? " " + nom : ""},</p>
      <p>La consultation pour la réalisation du PPPT et du DPE collectif de la copropriété <strong>${copro.nom}</strong> est terminée :
      ${n} offre${n > 1 ? "s" : ""} de bureaux d'études ${n > 1 ? "ont été reçues" : "a été reçue"}.</p>
      <p>L'analyse de Strat Eco${recommandee ? `, qui recommande l'offre de <strong>${recommandee}</strong>,` : ""} est disponible dans votre espace syndic,
      avec les offres, leurs pièces et un PDF à présenter en assemblée générale.</p>
      ${BOUTON(`${appUrl}/syndic/ppt/copros/${copro.id}/consultation`, "Voir l'analyse des offres")}
      <p>Bien cordialement,<br/><strong>Strat Eco pro</strong></p>
    </div>`,
  });

  let envoyes = 0, simules = 0, erreurs = 0;
  for (const [userId, nom] of cibles) {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    const email = u?.user?.email;
    if (!email) continue;
    if (!resendKey) {
      simules++;
      continue;
    }
    const { sujet, html } = contenu(nom);
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

  return json(200, { total: cibles.size, envoyes, simules, erreurs, mode: resendKey ? "resend" : "simulation" });
});
