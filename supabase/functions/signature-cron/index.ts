// Edge function « signature-cron » - entretien quotidien du module de
// signature électronique (spec §9 et §10, CGU art. 7.4) :
//  - relances J+3 puis J+7 aux cosignataires qui n'ont pas signé ;
//  - alerte J+25 au signataire principal (expiration proche) ;
//  - J+30 : tokens expirés, signataires et bulletin passés à « expire » ;
//  - purge des pièces justificatives 30 jours après réalisation des
//    conditions (notification Anah + transmission banque, ou Anah seule si
//    aucun éco-PTZ n'est demandé) - seuls les hash calculés au dépôt sont
//    conservés, avec les preuves de transmission et l'audit log.
// Déclenchée au chargement de l'app par un AMO (best effort, une fois par
// jour) ou manuellement ; idempotente.
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

const JOUR = 24 * 3600 * 1000;
const TOKEN_VALIDITE_JOURS = 30;
const PURGE_DELAI_JOURS = 30;
const BUCKET_PIECES = "signature-pieces";

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const h = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64url(bytes: Uint8Array): string {
  return b64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function envoyerEmail(to: string, subject: string, html: string): Promise<"envoye" | "simule" | "erreur"> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return "simule";
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    return r.ok ? "envoye" : "erreur";
  } catch {
    return "erreur";
  }
}

function gabarit(corps: string): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
      ${corps}
      <p>Bien cordialement,<br/><strong>L'équipe Strat Eco</strong></p>
    </div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // réservé à l'équipe AMO (déclenchement au chargement de l'app)
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });
  const { data: profil } = await admin.from("profiles")
    .select("role, active").eq("user_id", userData.user.id).maybeSingle();
  if (!profil || !profil.active || profil.role !== "amo") {
    return json(403, { error: "Réservé à l'équipe AMO" });
  }

  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";
  const maintenant = Date.now();
  const bilan = { relances: 0, alertes_j25: 0, expires: 0, purges: 0, erreurs: 0 };

  async function journal(bulletinId: string, evenement: string, payload: Record<string, unknown>, signataireId?: string) {
    await admin.from("audit_log").insert({
      bulletin_id: bulletinId, signataire_id: signataireId ?? null,
      evenement, payload,
    });
  }

  // ---------- bulletins en signature : relances / alerte / expiration ----------
  const { data: enCours } = await admin.from("bulletins")
    .select("*, coproprietes(name)")
    .eq("statut", "en_signature");

  for (const b of enCours ?? []) {
    const nomCopro = (b.coproprietes as { name: string } | null)?.name ?? "votre copropriété";
    const envoyes = b.liens_envoyes_le ? new Date(b.liens_envoyes_le).getTime() : null;
    const { data: sigs } = await admin.from("signataires")
      .select("*").eq("bulletin_id", b.id).order("ordre");
    const attente = (sigs ?? []).filter(
      (s) => s.role === "cosignataire" && ["en_attente", "identite_deposee"].includes(s.statut),
    );

    // J+30 : expiration (basée sur la validité du dernier token émis)
    const tousExpires = attente.length > 0 && attente.every(
      (s) => s.token_expire_le && new Date(s.token_expire_le).getTime() < maintenant,
    );
    if (tousExpires) {
      for (const s of attente) {
        await admin.from("signataires").update({ statut: "expire" }).eq("id", s.id);
      }
      await admin.from("bulletins").update({ statut: "expire" }).eq("id", b.id);
      await journal(b.id, "bulletin.expire", { signataires_en_attente: attente.length });
      bilan.expires++;
      continue;
    }

    if (envoyes === null) continue;

    // relances J+3 puis J+7 : nouveau lien (le token en clair n'est jamais
    // stocké, chaque relance en régénère un), même parcours
    for (const s of attente) {
      if (s.token_expire_le && new Date(s.token_expire_le).getTime() < maintenant) continue;
      const due1 = maintenant - envoyes >= 3 * JOUR && !s.relance1_le;
      const due2 = maintenant - envoyes >= 7 * JOUR && !s.relance2_le;
      if (!due1 && !due2) continue;

      const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
      const expire = new Date(maintenant + TOKEN_VALIDITE_JOURS * JOUR).toISOString();
      await admin.from("signataires").update({
        token_hash: await sha256Hex(token),
        token_expire_le: expire,
        ...(due1 ? { relance1_le: new Date().toISOString() } : {}),
        ...(due2 ? { relance2_le: new Date().toISOString() } : {}),
      }).eq("id", s.id);
      const statut = await envoyerEmail(
        s.email,
        `Rappel : signature de votre bulletin d'adhésion - ${nomCopro}`,
        gabarit(`
          <p>Bonjour ${s.prenom},</p>
          <p>Votre signature est toujours attendue sur le bulletin d'adhésion à l'éco-prêt à
          taux zéro de la copropriété <strong>${nomCopro}</strong> (${b.lot_reference}).</p>
          <p style="margin:22px 0">
            <a href="${appUrl}/signature/${token}"
               style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
              Signer mon bulletin
            </a>
          </p>
          <p style="color:#555">Ce lien est personnel : ne le transmettez à personne.</p>`),
      );
      if (statut === "erreur") bilan.erreurs++;
      else bilan.relances++;
      await journal(b.id, "signataire.relance_envoyee", { auto: true, statut }, s.id);
    }

    // J+25 : alerte au signataire principal - expiration proche
    if (maintenant - envoyes >= 25 * JOUR && !b.alerte_j25_le && attente.length > 0) {
      const principal = (sigs ?? []).find((s) => s.role === "principal");
      if (principal) {
        const noms = attente.map((s) => `${s.prenom} ${s.nom}`).join(", ");
        await envoyerEmail(
          principal.email,
          `Signatures en attente : liens bientôt expirés - ${nomCopro}`,
          gabarit(`
            <p>Bonjour ${principal.prenom},</p>
            <p>Les liens de signature de votre bulletin d'adhésion (${b.lot_reference}) expirent
            dans quelques jours. En attente : <strong>${noms}</strong>.</p>
            <p>Pensez à les relancer depuis votre espace, ou contactez-les directement.</p>`),
        );
      }
      await admin.from("bulletins").update({ alerte_j25_le: new Date().toISOString() }).eq("id", b.id);
      bilan.alertes_j25++;
    }
  }

  // ---------- purge des pièces justificatives (CGU art. 7.4.1) ----------
  const { data: purgeables } = await admin.from("bulletins")
    .select("*").eq("statut", "complet").is("purge_effectuee_le", null)
    .not("notification_anah_le", "is", null);

  for (const b of purgeables ?? []) {
    // conditions cumulatives : Anah + banque ; Anah seule si pas d'éco-PTZ
    const dates = [new Date(b.notification_anah_le).getTime()];
    if (b.eco_ptz_demande) {
      if (!b.transmission_banque_le) continue;
      dates.push(new Date(b.transmission_banque_le).getTime());
    }
    if (maintenant - Math.max(...dates) < PURGE_DELAI_JOURS * JOUR) continue;

    const hashesSupprimes: Record<string, string> = {};

    // pièces d'identité des signataires : fichier effacé, hash conservé en ligne
    const { data: sigs } = await admin.from("signataires")
      .select("id, piece_identite_path, piece_identite_hash").eq("bulletin_id", b.id);
    const aEffacer: string[] = [];
    for (const s of sigs ?? []) {
      if (s.piece_identite_path) {
        aEffacer.push(s.piece_identite_path);
        if (s.piece_identite_hash) hashesSupprimes[`piece_identite:${s.id}`] = s.piece_identite_hash;
        await admin.from("signataires").update({ piece_identite_path: null }).eq("id", s.id);
      }
    }
    if (aEffacer.length) await admin.storage.from(BUCKET_PIECES).remove(aEffacer);

    // pièces du dossier (bucket pieces-copro) : avis d'imposition, taxe
    // foncière, pièce d'identité - le RIB ne suit pas ce déclencheur (il est
    // supprimé après le dernier flux financier de la mission)
    const { data: pieces } = await admin.from("pieces_justificatives")
      .select("*").eq("coproprietaire_id", b.coproprietaire_id)
      .in("type", ["avis_imposition", "taxe_fonciere", "piece_identite"]);
    for (const p of pieces ?? []) {
      let hash = p.sha256;
      if (!hash && p.storage_path) {
        // hash jamais calculé au dépôt (pièce antérieure au module) : dernier
        // calcul possible, juste avant l'effacement
        const { data: f } = await admin.storage.from("pieces-copro").download(p.storage_path);
        if (f) hash = await sha256Hex(new Uint8Array(await f.arrayBuffer()));
      }
      if (hash) hashesSupprimes[`${p.type}:${p.id}`] = hash;
      if (p.storage_path) await admin.storage.from("pieces-copro").remove([p.storage_path]);
      await admin.from("pieces_justificatives").delete().eq("id", p.id);
    }

    await admin.from("bulletins").update({ purge_effectuee_le: new Date().toISOString() }).eq("id", b.id);
    await journal(b.id, "bulletin.purge", { hashes: hashesSupprimes });
    bilan.purges++;
  }

  return json(200, bilan);
});
