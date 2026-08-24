// Edge function « notifier-passation » - appelée quand le chef de projet
// d'un dossier change (création du dossier ou édition de la fiche Données).
// Alerte automatiquement par e-mail le nouveau chef de projet, et l'ancien
// s'il est identifié. Le chef de projet est saisi en clair sur le dossier :
// on retrouve son compte en comparant son nom (normalisé) aux profils AMO
// actifs ; sans correspondance, la passation est tracée « sans_email ».
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

/** Comparaison de noms : minuscules, sans accents, espaces simples. */
function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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

  const { copro_id, ancien_chef, nouveau_chef } = await req.json().catch(() => ({}));
  if (!copro_id || !nouveau_chef) return json(400, { error: "copro_id et nouveau_chef requis" });

  const { data: copro } = await admin
    .from("coproprietes")
    .select("id, name, city, syndic_name")
    .eq("id", copro_id)
    .maybeSingle();
  if (!copro) return json(404, { error: "Dossier introuvable" });

  // --- Correspondance nom saisi → compte collaborateur (profils AMO actifs) ---
  const { data: equipe } = await admin
    .from("profiles")
    .select("user_id, full_name")
    .eq("role", "amo")
    .eq("active", true);
  const trouverEmail = async (nom: string | null | undefined): Promise<string | null> => {
    if (!nom) return null;
    const cible = normaliser(nom);
    const match = (equipe ?? []).find((p) => normaliser(p.full_name ?? "") === cible);
    if (!match) return null;
    const { data: u } = await admin.auth.admin.getUserById(match.user_id);
    return u?.user?.email ?? null;
  };

  const emailNouveau = await trouverEmail(nouveau_chef);
  const ancien = ancien_chef && normaliser(ancien_chef) !== normaliser(nouveau_chef) ? ancien_chef : null;
  const emailAncien = await trouverEmail(ancien);

  const trace = async (statut: "envoye" | "simule" | "erreur" | "sans_email") => {
    await admin.from("passations").insert({
      copro_id: copro.id,
      ancien_chef: ancien,
      nouveau_chef,
      email_statut: statut,
      notifie_par: userData.user!.id,
    });
  };

  if (!emailNouveau && !emailAncien) {
    await trace("sans_email");
    return json(200, { statut: "sans_email" });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  if (!resendKey) {
    await trace(emailNouveau ? "simule" : "sans_email");
    return json(200, { statut: emailNouveau ? "simule" : "sans_email" });
  }

  const lieu = copro.city ? ` (${copro.city})` : "";
  const syndic = copro.syndic_name ? `<li>Syndic : <strong>${copro.syndic_name}</strong></li>` : "";
  const envoyer = async (to: string, subject: string, intro: string): Promise<boolean> => {
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
        <p>Bonjour,</p>
        <p>${intro}</p>
        <ul>
          <li>Dossier : <strong>${copro.name}</strong>${lieu}</li>
          ${syndic}
          ${ancien ? `<li>Précédent chef de projet : <strong>${ancien}</strong></li>` : ""}
          <li>Nouveau chef de projet : <strong>${nouveau_chef}</strong></li>
        </ul>
        <p>Retrouvez le dossier complet (fiche, fichiers de passation, tâches) sur le
        progiciel Strat Eco.</p>
        <p>Bonne reprise,<br/><strong>L'équipe Strat Eco</strong></p>
      </div>`;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, html }),
      });
      return r.ok;
    } catch {
      return false;
    }
  };

  let statut: "envoye" | "erreur" | "sans_email" = "sans_email";
  if (emailNouveau) {
    const ok = await envoyer(
      emailNouveau,
      `Passation de dossier - ${copro.name}`,
      `Le dossier <strong>${copro.name}</strong> vient de vous être confié${ancien ? ` (passation depuis ${ancien})` : ""}.`,
    );
    statut = ok ? "envoye" : "erreur";
  }
  if (emailAncien) {
    await envoyer(
      emailAncien,
      `Passation de dossier - ${copro.name}`,
      `Votre dossier <strong>${copro.name}</strong> a été transmis à <strong>${nouveau_chef}</strong>.`,
    );
  }

  await trace(statut);
  return json(200, { statut });
});
