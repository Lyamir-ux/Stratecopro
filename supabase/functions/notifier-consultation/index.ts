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

const OPTION_LABELS: Record<string, string> = {
  audit_reglementaire: "Audit réglementaire",
  pppt: "PPPT",
  memoire_climaxion: "Mémoire ClimAxion",
};

const SOUS_TYPE_LABELS: Record<string, string> = {
  amiante_plomb: "Diagnostic amiante et plomb avant travaux",
  etancheite: "Test d'étanchéité à l'air",
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
  const typeLabel = cs.sous_type
    ? `${TYPE_LABELS[cs.type] ?? cs.type} — ${SOUS_TYPE_LABELS[cs.sous_type] ?? cs.sous_type}`
    : (TYPE_LABELS[cs.type] ?? cs.type);
  const dateLimite = cs.date_limite
    ? new Date(cs.date_limite).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const logements: number | null = cs.nb_logements ?? cs.copro_externe_lots ?? null;
  const optionsLabels: string[] = ((cs.options ?? []) as string[]).map((o) => OPTION_LABELS[o] ?? o);
  const { count: nbDocs } = await admin
    .from("consultation_docs")
    .select("*", { count: "exact", head: true })
    .eq("consultation_id", consultation_id);

  let envoyes = 0, simules = 0, erreurs = 0;

  for (const p of cibles) {
    let statut: "simule" | "envoye" | "erreur" = "simule";
    let erreur: string | null = null;

    if (resendKey) {
      const lienConsultations = `${appUrl}/prestataire/consultations`;
      const ligne = (label: string, valeur: string) =>
        `<tr><td style="padding:4px 14px 4px 0;color:#666;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0;color:#1a1a1a">${valeur}</td></tr>`;
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
          <p>Bonjour${p.contact_nom ? " " + p.contact_nom : ""},</p>
          <p><strong>Strat Eco</strong>, assistant à maîtrise d'ouvrage, lance une consultation
          pour laquelle votre entreprise est référencée :</p>
          <table style="border-collapse:collapse;margin:14px 0;font-size:14.5px">
            ${ligne("Copropriété", `<strong>${coproNom}</strong>${coproLieu ? " — " + coproLieu : ""}`)}
            ${logements ? ligne("Taille", `${logements} logements`) : ""}
            ${cs.nb_batiments ? ligne("Bâtiments", `${cs.nb_batiments}`) : ""}
            ${ligne("Mission", `<strong>${typeLabel}</strong> — ${cs.mission}`)}
            ${optionsLabels.length ? ligne("Options à chiffrer", optionsLabels.join(", ")) : ""}
            ${dateLimite ? ligne("Date limite de réponse", `<strong>${dateLimite}</strong>`) : ""}
          </table>
          ${
            nbDocs
              ? `<p>Le dossier de consultation (${nbDocs} document${nbDocs > 1 ? "s" : ""} : cahier des charges, audit…) est à télécharger depuis votre espace prestataire.</p>`
              : ""
          }
          ${
            cs.type === "moe"
              ? `<p>Pour cette mission de maîtrise d'œuvre, votre offre détaillera chaque phase
                 — DIAG/AVP, PRO/DCE, suivi de chantier — ainsi que chaque option demandée.</p>`
              : ""
          }
          <p style="margin:22px 0">
            <a href="${lienConsultations}"
               style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
              Consulter le dossier et déposer mon offre
            </a>
          </p>
          <p>Pour y accéder, <a href="${lienConsultations}" style="color:#355717">connectez-vous à votre espace prestataire</a>
          avec votre adresse e-mail (${p.email}).
          Mot de passe oublié ? <a href="${appUrl}/mot-de-passe-oublie" style="color:#355717">Réinitialisez-le ici</a>.</p>
          <p>À réception, votre candidature est transmise à l'équipe Strat Eco,
          qui reviendra vers vous à l'issue de la consultation.</p>
          <p>Bien cordialement,<br/><strong>L'équipe Strat Eco</strong></p>
          <p style="color:#888;font-size:13px;border-top:1px solid #e5e5e5;padding-top:12px;margin-top:24px">
            Vous recevez cet e-mail car votre entreprise est référencée « ${TYPE_LABELS[cs.type] ?? cs.type} » auprès de Strat Eco.
            Pour ne plus recevoir ces alertes, répondez simplement à cet e-mail.
          </p>
        </div>`;
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
