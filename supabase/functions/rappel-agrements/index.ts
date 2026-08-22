// Edge function « rappel-agrements » - rappelle par e-mail aux prestataires
// que l'un de leurs documents de certification (agrément RGE, assurance…)
// expire bientôt (sous 30 jours) ou est déjà expiré. Un seul rappel par
// document (rappel_envoye_at) ; la mise à jour de la date de fin de validité
// dans « Mon entreprise » réarme le rappel.
// Déclenchée depuis l'app AMO (une fois par jour au premier chargement) -
// idempotente : sans document à rappeler, elle ne fait rien.
// Envoi réel via Resend si RESEND_API_KEY est configuré, sinon 'simule'
// (dans ce cas rien n'est marqué, pour ne pas consommer les rappels).
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

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

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

  // --- Documents à rappeler : expirés ou expirant sous 30 jours, jamais rappelés ---
  const horizon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const { data: docs, error: docsErr } = await admin
    .from("prestataire_docs")
    .select("id, name, expire_le, prestataires(id, raison_sociale, contact_nom, email, email_secondaire, actif)")
    .not("expire_le", "is", null)
    .lte("expire_le", horizon)
    .is("rappel_envoye_at", null);
  if (docsErr) return json(500, { error: docsErr.message });

  type Presta = {
    id: string;
    raison_sociale: string;
    contact_nom: string | null;
    email: string;
    email_secondaire: string | null;
    actif: boolean;
  };
  const parPresta = new Map<string, { presta: Presta; docs: { id: string; name: string; expire_le: string }[] }>();
  for (const d of docs ?? []) {
    const p = d.prestataires as unknown as Presta | null;
    if (!p || !p.actif || !p.email) continue;
    const entry = parPresta.get(p.id) ?? { presta: p, docs: [] };
    entry.docs.push({ id: d.id, name: d.name, expire_le: d.expire_le as string });
    parPresta.set(p.id, entry);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:5173";
  const lien = `${appUrl}/prestataire/entreprise`;

  if (!resendKey) {
    // simulation : rien n'est marqué pour que le rappel parte au vrai branchement
    return json(200, { total: parPresta.size, envoyes: 0, simules: parPresta.size, erreurs: 0, mode: "simulation" });
  }

  const aujourdHui = new Date().toISOString().slice(0, 10);
  let envoyes = 0, erreurs = 0;

  for (const { presta, docs: liste } of parPresta.values()) {
    const lignes = liste
      .map((d) => {
        const expire = d.expire_le < aujourdHui;
        return `<li><strong>${d.name}</strong> - ${expire ? "expiré depuis le" : "expire le"} ${fmtDate(d.expire_le)}</li>`;
      })
      .join("");
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
        <p>Bonjour${presta.contact_nom ? " " + presta.contact_nom : ""},</p>
        <p>Certains documents de votre fiche entreprise <strong>${presta.raison_sociale}</strong>
        arrivent en fin de validité :</p>
        <ul>${lignes}</ul>
        <p>Merci de déposer le document renouvelé (et sa nouvelle date de fin de validité)
        dans votre espace prestataire - cela conditionne votre référencement sur nos consultations.</p>
        <p style="margin:22px 0">
          <a href="${lien}"
             style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
            Mettre à jour mes documents
          </a>
        </p>
        <p>Bien cordialement,<br/><strong>L'équipe Strat Eco</strong></p>
      </div>`;
    try {
      const to = [presta.email, ...(presta.email_secondaire ? [presta.email_secondaire] : [])];
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          subject: `Documents à renouveler - ${presta.raison_sociale}`,
          html,
        }),
      });
      if (r.ok) {
        envoyes++;
        await admin
          .from("prestataire_docs")
          .update({ rappel_envoye_at: new Date().toISOString() })
          .in("id", liste.map((d) => d.id));
      } else erreurs++;
    } catch {
      erreurs++;
    }
  }

  return json(200, { total: parPresta.size, envoyes, simules: 0, erreurs, mode: "resend" });
});
