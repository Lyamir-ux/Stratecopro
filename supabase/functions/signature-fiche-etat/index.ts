// Edge function « signature-fiche-etat » - signature électronique de la fiche
// « État de la copropriété » du dossier ANAH (MaPrimeRénov' Copro), 23/09/2026.
//
// Deux signataires, ordre libre : le président du conseil syndical (sans
// compte, lien personnel tokenisé envoyé par e-mail) et le syndic (connecté à
// son espace). Signature électronique simple : case d'attestation « Je
// certifie exacts les renseignements de cette fiche » + code à usage unique
// reçu par e-mail. Une modification de la fiche après signature ne redemande
// pas de signature (arbitrage d'Amir) : l'empreinte des valeurs au moment de
// la signature est conservée comme preuve.
//
// Actions (champ `action` du POST) :
//  - token : lien_ouvrir, lien_otp_demander, lien_otp_valider (président) ;
//  - JWT   : amo_envoyer, amo_relancer (équipe AMO),
//            syndic_otp_demander, syndic_otp_valider (syndic du dossier).
// Écritures en service role uniquement (fiche_etat_signatures, audit_log).
// Secrets : RESEND_API_KEY / RESEND_FROM / APP_URL (sans clé Resend : e-mails
// simulés, code et lien renvoyés dans la réponse pour les tests).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOKEN_VALIDITE_JOURS = 30;
const OTP_VALIDITE_MIN = 10;
const OTP_TENTATIVES_MAX = 3;
const OTP_ENVOIS_PAR_HEURE = 3;
const TYPE_FICHE = "fiche_etat_anah";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// ========== Crypto (mêmes procédés que signature-flux) ==========

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

function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function genToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return b64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function genOtp(): string {
  const max = 1_000_000;
  const limite = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limite);
  return String(n % max).padStart(6, "0");
}

async function hashOtp(code: string, saltB64?: string): Promise<string> {
  const salt = saltB64 ? b64decode(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 100_000 }, key, 256,
  );
  return `pbkdf2$100000$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

async function verifOtp(code: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  return (await hashOtp(code, parts[2])) === stored;
}

/** Empreinte stable des valeurs de la fiche (clés triées). */
async function empreinteValeurs(resolu: Record<string, string>): Promise<string> {
  const trie = Object.fromEntries(Object.keys(resolu).sort().map((k) => [k, resolu[k] ?? ""]));
  return sha256Hex(JSON.stringify(trie));
}

function ipDe(req: Request): string | null {
  const xf = req.headers.get("x-forwarded-for");
  return xf ? xf.split(",")[0].trim() : null;
}

const emailValide = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

function echapper(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// ========== E-mails (Resend, simulation sans clé) ==========

const simulation = () => !Deno.env.get("RESEND_API_KEY");
const appUrl = () => Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";

async function envoyerEmail(to: string, subject: string, html: string): Promise<"envoye" | "simule" | "erreur"> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.log(`[simulation e-mail] à ${to} : ${subject}`);
    return "simule";
  }
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

function bouton(url: string, libelle: string): string {
  return `<p style="margin:22px 0">
    <a href="${url}" style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">${libelle}</a>
  </p>`;
}

// ========== Accès données ==========

type Admin = SupabaseClient;

type Sig = {
  id: string; copro_id: string; role: "president_cs" | "syndic"; nom: string; email: string;
  user_id: string | null; statut: string;
  token_hash: string | null; token_expire_le: string | null; token_consomme_le: string | null;
  otp_hash: string | null; otp_expire_le: string | null; otp_tentatives: number; otp_envois: string[] | null;
  attestation_le: string | null; signe_le: string | null; donnees_hash: string | null;
};

type Fiche = { data: Record<string, unknown>; statut: string };

async function journal(admin: Admin, req: Request | null, sigId: string, evenement: string, payload?: Record<string, unknown>) {
  const { error } = await admin.from("audit_log").insert({
    bulletin_id: sigId,
    signataire_id: sigId,
    evenement,
    payload: payload ?? null,
    ip: req ? ipDe(req) : null,
    user_agent: req?.headers.get("user-agent") ?? null,
  });
  if (error) console.error("audit_log :", error.message);
}

async function chargerFiche(admin: Admin, coproId: string): Promise<Fiche | null> {
  const { data } = await admin.from("montage_formulaires").select("data, statut")
    .eq("copro_id", coproId).eq("type", TYPE_FICHE).maybeSingle();
  if (!data) return null;
  return { data: (data.data ?? {}) as Record<string, unknown>, statut: data.statut };
}

function resoluDe(f: Fiche): Record<string, string> {
  const r = f.data.resolu;
  return r && typeof r === "object" ? (r as Record<string, string>) : {};
}

async function coproNom(admin: Admin, coproId: string): Promise<string> {
  const { data } = await admin.from("coproprietes").select("name").eq("id", coproId).maybeSingle();
  return data?.name ?? "votre copropriété";
}

async function signatures(admin: Admin, coproId: string): Promise<Sig[]> {
  const { data } = await admin.from("fiche_etat_signatures").select("*").eq("copro_id", coproId);
  return (data ?? []) as Sig[];
}

/** Crée ou actualise la ligne d'un signataire (sans toucher à une signature déjà posée). */
async function preparerSignataire(admin: Admin, coproId: string, role: Sig["role"], nom: string, email: string): Promise<Sig> {
  const { data: exist } = await admin.from("fiche_etat_signatures").select("*")
    .eq("copro_id", coproId).eq("role", role).maybeSingle();
  if (exist) {
    if (exist.signe_le) return exist as Sig;
    const { data } = await admin.from("fiche_etat_signatures").update({ nom, email })
      .eq("id", exist.id).select("*").single();
    return data as Sig;
  }
  const { data, error } = await admin.from("fiche_etat_signatures")
    .insert({ copro_id: coproId, role, nom, email }).select("*").single();
  if (error) throw error;
  return data as Sig;
}

/** Nouveau lien personnel du président (l'ancien est invalidé) + e-mail. */
async function envoyerLienPresident(admin: Admin, req: Request, s: Sig, nomCopro: string, relance: boolean) {
  const token = genToken();
  const expire = new Date(Date.now() + TOKEN_VALIDITE_JOURS * 24 * 3600 * 1000);
  await admin.from("fiche_etat_signatures").update({
    token_hash: await sha256Hex(token),
    token_expire_le: expire.toISOString(),
    token_consomme_le: null,
    lien_envoye_le: new Date().toISOString(),
  }).eq("id", s.id);
  const url = `${appUrl()}/signature-fiche/${token}`;
  const statut = await envoyerEmail(
    s.email,
    `${relance ? "Rappel : " : ""}Signature de la fiche État de la copropriété - ${nomCopro}`,
    gabarit(`
      <p>Bonjour ${echapper(s.nom)},</p>
      <p>${relance ? "Petit rappel : votre" : "En tant que président(e) du conseil syndical, votre"} signature est attendue sur la
      <strong>fiche « État de la copropriété »</strong> de <strong>${echapper(nomCopro)}</strong>, pièce du dossier de
      subvention MaPrimeRénov' Copropriété déposé auprès de l'Anah.</p>
      <p>Il vous suffit de relire la fiche, de certifier l'exactitude des renseignements, puis de signer avec un code
      reçu par e-mail.</p>
      ${bouton(url, "Relire et signer la fiche")}
      <p style="color:#555">Ce lien est personnel : ne le transmettez à personne. Il est valable jusqu'au
      ${expire.toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" })}.</p>`),
  );
  await journal(admin, req, s.id, relance ? "fiche_etat.relance" : "fiche_etat.lien_envoye", { statut });
  return { statut, lien: simulation() ? url : undefined };
}

async function resoudreToken(admin: Admin, token: string): Promise<Sig | null> {
  if (!token || token.length < 20) return null;
  const { data } = await admin.from("fiche_etat_signatures").select("*")
    .eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!data || data.role !== "president_cs") return null;
  if (data.token_consomme_le && !data.signe_le) return null;
  if (data.token_expire_le && new Date(data.token_expire_le) < new Date() && !data.signe_le) return null;
  return data as Sig;
}

// ========== OTP + signature ==========

async function demanderOtp(admin: Admin, req: Request, s: Sig, email: string, nomCopro: string, attestation: boolean): Promise<Response> {
  if (s.signe_le) return json(400, { error: "deja_signe" });
  if (!attestation) return json(400, { error: "attestation_requise" });
  const depuis = Date.now() - 3600 * 1000;
  const envois = (s.otp_envois ?? []).filter((d) => new Date(d).getTime() > depuis);
  if (envois.length >= OTP_ENVOIS_PAR_HEURE) return json(429, { error: "trop_de_renvois" });
  const code = genOtp();
  const maintenant = new Date().toISOString();
  await admin.from("fiche_etat_signatures").update({
    otp_hash: await hashOtp(code),
    otp_expire_le: new Date(Date.now() + OTP_VALIDITE_MIN * 60 * 1000).toISOString(),
    otp_tentatives: 0,
    otp_envois: [...envois, maintenant],
    attestation_le: s.attestation_le ?? maintenant,
  }).eq("id", s.id);
  const statut = await envoyerEmail(
    email,
    `Votre code de signature - fiche État - ${nomCopro}`,
    gabarit(`
      <p>Bonjour,</p>
      <p>Votre code pour signer la fiche « État de la copropriété » de <strong>${echapper(nomCopro)}</strong> :</p>
      <p style="font-size:30px;font-weight:bold;letter-spacing:6px;margin:18px 0">${code}</p>
      <p>Ce code est valable ${OTP_VALIDITE_MIN} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce
      message et signalez-le à contact@strateco.fr.</p>`),
  );
  await journal(admin, req, s.id, "fiche_etat.otp_demande", { canal: statut === "simule" ? "simulation" : "email", statut });
  if (statut === "erreur") return json(502, { error: "envoi_echec" });
  return json(200, {
    ok: true,
    canal: statut === "simule" ? "simulation" : "email",
    validite_min: OTP_VALIDITE_MIN,
    ...(statut === "simule" ? { code_test: code } : {}),
  });
}

async function validerOtp(
  admin: Admin, req: Request, s: Sig, code: string, resolu: Record<string, string>,
  identite: { nom?: string; email?: string; user_id?: string | null },
): Promise<Response> {
  if (s.signe_le) return json(400, { error: "deja_signe" });
  if (!/^\d{6}$/.test(code ?? "")) return json(400, { error: "code_invalide" });
  if (!s.otp_hash || !s.otp_expire_le || new Date(s.otp_expire_le) < new Date()) return json(400, { error: "code_expire" });
  if (s.otp_tentatives >= OTP_TENTATIVES_MAX) return json(400, { error: "trop_de_tentatives" });
  if (!(await verifOtp(code, s.otp_hash))) {
    const tentatives = s.otp_tentatives + 1;
    await admin.from("fiche_etat_signatures").update({ otp_tentatives: tentatives }).eq("id", s.id);
    await journal(admin, req, s.id, "fiche_etat.otp_echec", { tentatives });
    return json(400, {
      error: tentatives >= OTP_TENTATIVES_MAX ? "trop_de_tentatives" : "code_faux",
      restantes: Math.max(0, OTP_TENTATIVES_MAX - tentatives),
    });
  }
  const maintenant = new Date().toISOString();
  const donneesHash = await empreinteValeurs(resolu);
  const { error } = await admin.from("fiche_etat_signatures").update({
    statut: "signe",
    signe_le: maintenant,
    signe_ip: ipDe(req),
    signe_user_agent: req.headers.get("user-agent"),
    donnees_hash: donneesHash,
    otp_hash: null,
    token_consomme_le: s.token_hash ? maintenant : null,
    ...(identite.nom ? { nom: identite.nom } : {}),
    ...(identite.email ? { email: identite.email } : {}),
    ...(identite.user_id !== undefined ? { user_id: identite.user_id } : {}),
  }).eq("id", s.id).is("signe_le", null);
  if (error) return json(500, { error: "signature_echec" });
  await journal(admin, req, s.id, "fiche_etat.signe", { role: s.role, donnees_hash: donneesHash });
  await apresSignature(admin, s.copro_id);
  return json(200, { ok: true, signe_le: maintenant });
}

/** Les deux ont signé : confirmation aux deux signataires. */
async function apresSignature(admin: Admin, coproId: string) {
  const sigs = await signatures(admin, coproId);
  if (!(sigs.length === 2 && sigs.every((s) => s.signe_le))) return;
  const nomCopro = await coproNom(admin, coproId);
  for (const s of sigs) {
    if (!emailValide(s.email)) continue;
    await envoyerEmail(
      s.email,
      `Fiche État signée - ${nomCopro}`,
      gabarit(`
        <p>Bonjour ${echapper(s.nom)},</p>
        <p>La fiche « État de la copropriété » de <strong>${echapper(nomCopro)}</strong> est désormais signée par le
        président du conseil syndical et par le syndic. Strat Eco la joint au dossier de subvention MaPrimeRénov'
        Copropriété.</p>
        <p>Merci pour votre signature.</p>`),
    );
  }
}

// ========== Serveur ==========

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const corps = await req.json().catch(() => ({}));
  const action = String(corps.action ?? "");

  // ---------- Président du conseil syndical (lien personnel, sans compte) ----------
  if (action.startsWith("lien_")) {
    const s = await resoudreToken(admin, String(corps.token ?? ""));
    if (!s) return json(404, { error: "lien_invalide" });
    const fiche = await chargerFiche(admin, s.copro_id);
    if (!fiche) return json(404, { error: "lien_invalide" });
    const nomCopro = await coproNom(admin, s.copro_id);
    const resolu = resoluDe(fiche);

    switch (action) {
      case "lien_ouvrir": {
        await journal(admin, req, s.id, "fiche_etat.lien_ouvert");
        const images = (fiche.data.images ?? {}) as { aerienne?: string | null; situation?: string | null };
        const url = async (p?: string | null) => {
          if (!p) return null;
          const { data } = await admin.storage.from("copro-files").createSignedUrl(p, 600);
          return data?.signedUrl ?? null;
        };
        const sigs = await signatures(admin, s.copro_id);
        return json(200, {
          copro: nomCopro,
          resolu,
          images: { aerienne: await url(images.aerienne), situation: await url(images.situation) },
          signataire: { nom: s.nom, statut: s.statut, signe_le: s.signe_le },
          signatures: sigs.filter((x) => x.signe_le).map((x) => ({ role: x.role, nom: x.nom, signe_le: x.signe_le, donnees_hash: x.donnees_hash })),
        });
      }
      case "lien_otp_demander":
        return demanderOtp(admin, req, s, s.email, nomCopro, !!corps.attestation);
      case "lien_otp_valider":
        return validerOtp(admin, req, s, String(corps.code ?? ""), resolu, {});
      default:
        return json(400, { error: "action_inconnue" });
    }
  }

  // ---------- Actions authentifiées (AMO, syndic) ----------
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });
  const user = userData.user;
  const { data: profil } = await admin.from("profiles").select("role, active, full_name").eq("user_id", user.id).maybeSingle();
  const estAmo = !!profil && profil.active && profil.role === "amo";

  const coproId = String(corps.copro_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(coproId)) return json(400, { error: "copro_id attendu" });
  const fiche = await chargerFiche(admin, coproId);
  if (!fiche) return json(404, { error: "fiche_absente" });
  const nomCopro = await coproNom(admin, coproId);
  const resolu = resoluDe(fiche);

  switch (action) {
    case "amo_envoyer": {
      if (!estAmo) return json(403, { error: "interdit" });
      const emailPcs = (resolu.pcs_email ?? "").trim();
      const nomPcs = (resolu.pcs_nom ?? "").trim();
      if (!emailValide(emailPcs) || !nomPcs) return json(400, { error: "email_president_invalide" });
      // validation AMO de la fiche
      await admin.from("montage_formulaires").update({
        statut: "valide",
        data: { ...fiche.data, validee_le: new Date().toISOString(), validee_par_nom: profil?.full_name ?? null },
        updated_by: user.id,
      }).eq("copro_id", coproId).eq("type", TYPE_FICHE);

      const pcs = await preparerSignataire(admin, coproId, "president_cs", nomPcs, emailPcs);
      const syndic = await preparerSignataire(
        admin, coproId, "syndic",
        (resolu.syndic_gestionnaire ?? resolu.syndic_nom ?? "").trim(), (resolu.syndic_email ?? "").trim(),
      );
      let president: { statut: string; lien?: string } = { statut: "deja_signe" };
      if (!pcs.signe_le) president = await envoyerLienPresident(admin, req, pcs, nomCopro, false);
      let syndicStatut = "deja_signe";
      if (!syndic.signe_le && emailValide(syndic.email)) {
        const url = `${appUrl()}/syndic/copros/${coproId}/banque`;
        syndicStatut = await envoyerEmail(
          syndic.email,
          `Fiche État à signer - ${nomCopro}`,
          gabarit(`
            <p>Bonjour,</p>
            <p>Strat Eco a validé la fiche « État de la copropriété » de <strong>${echapper(nomCopro)}</strong>. Votre
            signature est attendue, ainsi que celle du président du conseil syndical (un lien lui a été envoyé).</p>
            <p>Signez depuis votre espace : Documents à produire, dossier ANAH - MaPrimeRénov' Copro, étape 1.</p>
            ${bouton(url, "Ouvrir la fiche")}`),
        );
        await journal(admin, req, syndic.id, "fiche_etat.syndic_notifie", { statut: syndicStatut });
      }
      await journal(admin, req, pcs.id, "fiche_etat.validee", { par: user.id });
      return json(200, { ok: true, president: president.statut, syndic: syndicStatut, lien_test: president.lien });
    }
    case "amo_relancer": {
      if (!estAmo) return json(403, { error: "interdit" });
      const pcs = (await signatures(admin, coproId)).find((s) => s.role === "president_cs");
      if (!pcs) return json(400, { error: "fiche_non_validee" });
      if (pcs.signe_le) return json(400, { error: "deja_signe" });
      const r = await envoyerLienPresident(admin, req, pcs, nomCopro, true);
      return json(200, { ok: true, statut: r.statut, lien_test: r.lien });
    }
    case "syndic_otp_demander":
    case "syndic_otp_valider": {
      // le syndic du dossier (gestionnaire rattaché ou direction de l'enseigne)
      const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: estSyndic } = await client.rpc("is_syndic_of", { p_copro_id: coproId });
      if (!estSyndic) return json(403, { error: "interdit" });
      if (fiche.statut !== "valide") return json(400, { error: "fiche_non_validee" });
      const s = (await signatures(admin, coproId)).find((x) => x.role === "syndic");
      if (!s) return json(400, { error: "fiche_non_validee" });
      if (!user.email) return json(400, { error: "email_compte_absent" });
      if (action === "syndic_otp_demander") return demanderOtp(admin, req, s, user.email, nomCopro, !!corps.attestation);
      return validerOtp(admin, req, s, String(corps.code ?? ""), resolu, {
        nom: (profil?.full_name ?? "").trim() || s.nom,
        email: user.email,
        user_id: user.id,
      });
    }
    default:
      return json(400, { error: "action_inconnue" });
  }
});
