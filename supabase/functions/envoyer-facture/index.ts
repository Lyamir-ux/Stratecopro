// Edge function « envoyer-facture » - facturation directe (0115), demande
// d'Amir du 28/09/2026. Appelée par l'app juste après la validation d'une
// facture ou d'un avoir (brouillon vérifié par un membre de l'équipe AMO) et
// le classement de son PDF dans les fichiers de la copropriété.
//
// Envoie la pièce en pièce jointe au gestionnaire du syndic (factures AMO) ou
// à Hellio (factures CEE), avec le chef de projet du dossier et le dirigeant
// en copie ; trace le statut sur la pièce (envoi_statut : envoye | simule |
// erreur | sans_email) et dans le journal de facturation.
//
// En mode test, les vrais destinataires reçoivent la pièce (choix d'Amir),
// avec « [TEST] » dans l'objet et un encadré « document de test, sans valeur,
// ne pas régler » ; la pièce elle-même porte un numéro TEST-FAC / TEST-AVR.
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

const echap = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LIBELLE_JALON: Record<string, string> = {
  P1a: "P1a", P1b: "P1b", P1c: "P1c", P2a: "P2a", P2b: "P2b", P2c: "P2c", FCEE1: "FCEE 1", FCEE2: "FCEE 2",
};

/** « 1 439,96 € » */
const euros = (v: number) =>
  Number(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ") + " €";

/** AAAA-MM-JJ → JJ/MM/AAAA */
const dateFr = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

const emailValide = (e: unknown): e is string => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- appelant authentifié : équipe AMO active uniquement ---
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });

  const { data: profile } = await admin
    .from("profiles")
    .select("role, active, full_name")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile || !profile.active || profile.role !== "amo") return json(403, { error: "Réservé à l'équipe Strat Eco" });

  const { facture_id } = await req.json().catch(() => ({}));
  if (!facture_id) return json(400, { error: "facture_id attendu" });

  const { data: f } = await admin
    .from("factures")
    .select("id, type, statut, test, copro_id, jalon, nature, facture_origine_id, numero, date_emission, date_echeance, client_nom, destinataire_nom, reference, total_ttc, pdf_path")
    .eq("id", facture_id)
    .maybeSingle();
  if (!f) return json(404, { error: "Pièce introuvable" });
  if (f.statut !== "emise" || !f.numero) return json(409, { error: "La pièce n'est pas encore validée" });
  if (!f.pdf_path) return json(409, { error: "Le PDF de la pièce n'est pas encore classé" });

  const { data: dest } = await admin.rpc("facture_destinataires", { p_id: f.id });
  const d = (dest ?? {}) as {
    to?: string | null;
    to_nom?: string | null;
    chef?: { nom: string; email: string } | null;
    dirigeants?: string[];
    copro?: string;
  };

  const tracer = async (statut: string, detail: string) => {
    await admin
      .from("factures")
      .update({ envoi_statut: statut, envoi_le: new Date().toISOString(), envoi_detail: detail })
      .eq("id", f.id);
    await admin.from("facturation_journal").insert({
      facture_id: f.id,
      copro_id: f.copro_id,
      jalon: f.jalon,
      action: "envoi",
      test: f.test,
      detail,
      par: userData.user.id,
    });
  };

  const to = d.to?.trim() ?? "";
  if (!emailValide(to)) {
    await tracer("sans_email", "Aucun e-mail de destinataire valide");
    return json(200, { statut: "sans_email" });
  }
  // copie : chef de projet du dossier et dirigeant, sans doublon
  const cc = [...new Set([d.chef?.email, ...(d.dirigeants ?? [])].filter(emailValide).map((e) => e.trim().toLowerCase()))]
    .filter((e) => e !== to.toLowerCase());
  const replyTo = emailValide(d.chef?.email) ? d.chef!.email : (d.dirigeants ?? []).find(emailValide);

  // numéro et date de la facture annulée par un avoir
  let origine: { numero: string | null; date_emission: string | null } | null = null;
  if (f.type === "avoir" && f.facture_origine_id) {
    const { data: o } = await admin.from("factures").select("numero, date_emission").eq("id", f.facture_origine_id).maybeSingle();
    origine = o ?? null;
  }

  const { data: fichier, error: dlErr } = await admin.storage.from("copro-files").download(f.pdf_path);
  if (dlErr || !fichier) {
    await tracer("erreur", "PDF introuvable dans les fichiers");
    return json(200, { statut: "erreur", erreur: "PDF introuvable" });
  }
  const pdf = new Uint8Array(await fichier.arrayBuffer());

  const avoir = f.type === "avoir";
  const nomCopro = d.copro ?? "";
  const jalon = LIBELLE_JALON[f.jalon] ?? f.jalon;
  const piece = avoir ? "l'avoir" : "la facture";
  const objet = f.nature === "cee"
    ? `Honoraires CEE - Copropriété ${nomCopro.toUpperCase()}`
    : `${f.client_nom} - ${jalon}`;
  const subject = `${f.test ? "[TEST] " : ""}${avoir ? "Avoir" : "Facture"} ${f.numero} - ${objet}`;
  const signataire = d.chef?.nom ?? profile.full_name ?? "L'équipe Strat Eco";
  const bonjour = f.destinataire_nom?.trim() ? `Bonjour ${echap(f.destinataire_nom.trim())},` : "Madame, Monsieur,";

  const encadreTest = f.test
    ? `<p style="padding:10px 14px;background:#fff4e5;border-left:3px solid #d97706;border-radius:4px">
         <strong>Document de test</strong>, émis pendant la mise en service de la facturation Strat Eco pro :
         il n'a aucune valeur et ne doit pas être réglé.</p>`
    : "";

  const corps = avoir
    ? `<p>Veuillez trouver ci-joint notre avoir n° <strong>${echap(f.numero)}</strong> du ${dateFr(f.date_emission)},
       d'un montant de <strong>${euros(Math.abs(Number(f.total_ttc)))} TTC</strong>, qui annule
       ${origine?.numero ? `la facture n° ${echap(origine.numero)} du ${dateFr(origine.date_emission)}` : "la facture correspondante"}
       (${echap(objet)}).</p>`
    : `<p>Veuillez trouver ci-joint notre facture n° <strong>${echap(f.numero)}</strong> du ${dateFr(f.date_emission)},
       d'un montant de <strong>${euros(Number(f.total_ttc))} TTC</strong> (${echap(f.reference)}).</p>
       <p>Règlement par virement au plus tard le <strong>${dateFr(f.date_echeance)}</strong> ;
       nos coordonnées bancaires figurent sur la facture.</p>`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
      ${encadreTest}
      <p>${bonjour}</p>
      ${corps}
      <p>Pour toute question sur ${piece}, il vous suffit de répondre à ce message.</p>
      <p>Bien cordialement,<br/><strong>${echap(signataire)}</strong><br/>Strat Eco</p>
    </div>`;

  const detail = `À ${to}${cc.length ? ` - copie ${cc.join(", ")}` : ""}`;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    await tracer("simule", `${detail} (envoi simulé, clé Resend absente)`);
    return json(200, { statut: "simule", to, cc });
  }

  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        ...(cc.length ? { cc } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        html,
        attachments: [{ filename: `${f.numero}.pdf`, content: b64(pdf) }],
      }),
    });
    if (!r.ok) {
      const txt = (await r.text().catch(() => "")).slice(0, 300);
      await tracer("erreur", `${detail} - refus de Resend ${r.status} ${txt}`);
      return json(200, { statut: "erreur", to, cc });
    }
    await tracer("envoye", detail);
    return json(200, { statut: "envoye", to, cc });
  } catch (e) {
    await tracer("erreur", `${detail} - ${String(e).slice(0, 200)}`);
    return json(200, { statut: "erreur", to, cc });
  }
});
