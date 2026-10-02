// Edge function « notifier-enquete-transmise » - appelée par le portail quand
// un copropriétaire transmet son enquête sociale et technique complète
// (remarque d'Amir du 02/10/2026, 20:09). Lui envoie un e-mail qui confirme que
// son enquête a été prise en compte, avec les pièces encore à déposer s'il en
// manque ; trace l'envoi sur la réponse (transmission_email_statut : envoye |
// simule | erreur | sans_email, 0130).
//
// Seul le copropriétaire lui-même déclenche l'envoi : une transmission faite
// depuis l'aperçu AMO n'envoie rien. Un seul e-mail par transmission (date de
// transmission comparée à transmission_email_le) : un double clic ou un
// rappel de la fonction ne renvoie pas le message.
//
// Envoi réel via Resend si le secret RESEND_API_KEY est configuré ; sans clé,
// l'envoi est simulé et la réponse l'indique (même convention que les autres
// notifications).
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

// Pièces demandées selon la situation (src/lib/piecesSituation.ts) : le portail
// envoie des types, jamais du texte libre.
const NOM_PIECE: Record<string, string> = {
  avis_imposition: "Avis d'imposition définitif (N-1)",
  avis_imposition_2: "Second avis d'imposition définitif (N-1)",
  justificatif_usufruit: "Justificatif d'usufruit",
  pret_usage_notarie: "Contrat de prêt à usage notarié",
  kbis_sci: "Extrait Kbis de la SCI",
  statuts_sci: "Statuts de la SCI",
  avis_associes_sci: "Avis d'imposition de tous les associés",
  jugement_protection: "Jugement de tutelle ou de curatelle",
};

const echap = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const minuscule = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

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
  const user = userData.user;

  const body = await req.json().catch(() => ({}));
  const { enquete_id, coproprietaire_id } = body as { enquete_id?: string; coproprietaire_id?: string };
  if (!enquete_id || !coproprietaire_id) return json(400, { error: "enquete_id et coproprietaire_id attendus" });
  const piecesManquantes: string[] = Array.isArray(body.pieces_manquantes)
    ? [...new Set((body.pieces_manquantes as unknown[]).filter((t): t is string => typeof t === "string" && t in NOM_PIECE))]
    : [];

  const [{ data: cp }, { data: enquete }, { data: rep }] = await Promise.all([
    admin.from("coproprietaires").select("id, nom, copro_id, user_id").eq("id", coproprietaire_id).maybeSingle(),
    admin.from("enquetes").select("id, copro_id").eq("id", enquete_id).maybeSingle(),
    admin
      .from("enquete_reponses")
      .select("id, reponses, transmission_email_le")
      .eq("enquete_id", enquete_id)
      .eq("coproprietaire_id", coproprietaire_id)
      .maybeSingle(),
  ]);
  if (!cp || !enquete || enquete.copro_id !== cp.copro_id) return json(404, { error: "Enquête introuvable" });
  // Le copropriétaire lui-même : pas d'e-mail pour une saisie faite par l'AMO
  if (cp.user_id !== user.id) return json(200, { skipped: "transmis par un autre compte que le copropriétaire" });
  if (!rep) return json(404, { error: "Réponse introuvable" });

  const reponses = (rep.reponses ?? {}) as { complet?: boolean; transmisLe?: string };
  if (!reponses.complet || !reponses.transmisLe || isNaN(new Date(reponses.transmisLe).getTime())) {
    return json(200, { skipped: "questionnaire non transmis" });
  }
  if (rep.transmission_email_le && new Date(rep.transmission_email_le) >= new Date(reponses.transmisLe)) {
    return json(200, { skipped: "e-mail déjà envoyé pour cette transmission" });
  }

  // Date retenue : au plus tôt la date de transmission (horloge du navigateur),
  // pour qu'un rappel ne renvoie pas l'e-mail même si cette horloge avance.
  // Un envoi en erreur ne la pose pas : un nouvel essai reste possible.
  const tracer = async (statut: string) => {
    const le = new Date(Math.max(Date.now(), new Date(reponses.transmisLe!).getTime())).toISOString();
    await admin
      .from("enquete_reponses")
      .update({ transmission_email_statut: statut, ...(statut === "erreur" ? {} : { transmission_email_le: le }) })
      .eq("id", rep.id);
  };

  const email = user.email ?? null;
  if (!email) {
    await tracer("sans_email");
    return json(200, { mode: "sans_email" });
  }

  const { data: copro } = await admin.from("coproprietes").select("name").eq("id", cp.copro_id).maybeSingle();
  const nomCopro = copro?.name ?? "votre copropriété";

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";

  if (!resendKey) {
    await tracer("simule");
    return json(200, { mode: "simulation", to: email });
  }

  const transmisLe = new Date(reponses.transmisLe).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const noms = piecesManquantes.map((t) => NOM_PIECE[t]);
  const pieces = noms.length === 0
    ? ""
    : noms.length === 1
    ? `<p>Dernière étape : si vous êtes éligible aux aides, déposez sur votre portail, rubrique « Enquête sociale »,
       votre <strong>${echap(minuscule(noms[0]))}</strong>, toutes les pages.</p>`
    : `<p>Dernière étape : si vous êtes éligible aux aides, déposez sur votre portail, rubrique « Enquête sociale »,
       les pièces suivantes, toutes les pages :</p>
       <ul style="margin:0 0 14px;padding-left:20px">${noms.map((n) => `<li>${echap(n)}</li>`).join("")}</ul>`;
  const bouton = noms.length
    ? { href: `${appUrl}/portail/enquete`, texte: noms.length > 1 ? "Déposer mes pièces" : "Déposer la pièce" }
    : { href: `${appUrl}/portail`, texte: "Voir mon portail" };

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
      <p>Bonjour ${echap(cp.nom)},</p>
      <p>Nous avons bien reçu votre enquête sociale et technique pour la copropriété
      <strong>${echap(nomCopro)}</strong>, transmise le ${transmisLe}. Elle est prise en compte :
      merci pour le temps que vous y avez consacré.</p>
      <p>L'équipe Strat Eco s'en sert pour préparer le projet de rénovation et calculer les aides
      auxquelles vous pouvez prétendre.</p>
      ${pieces}
      <p style="margin:22px 0">
        <a href="${bouton.href}"
           style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
          ${bouton.texte}
        </a>
      </p>
      <p style="color:#666;font-size:13px">Vous pouvez modifier vos réponses à tout moment depuis votre portail : il
      suffit de transmettre à nouveau le questionnaire. Pour toute question, écrivez-nous depuis la rubrique
      « Nous contacter » de votre portail.</p>
      <p>Bien cordialement,<br/><strong>L'équipe Strat Eco</strong><br/>Strat Eco pro</p>
    </div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Votre enquête a bien été prise en compte - ${nomCopro}`,
        html,
      }),
    });
    await tracer(r.ok ? "envoye" : "erreur");
    return json(200, { mode: "resend", statut: r.ok ? "envoye" : "erreur" });
  } catch {
    await tracer("erreur");
    return json(200, { mode: "resend", statut: "erreur" });
  }
});
