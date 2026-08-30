// Edge function « signature-flux » - cœur du module de signature électronique
// avancée (eIDAS art. 26) des bulletins d'adhésion à l'éco-PTZ.
// Voir SPEC_signature_bulletins_adhesion.md et CGU v1.6.
//
// Trois familles d'actions, routées par le champ `action` du POST :
//  - token   : cosignataire sans compte, authentifié par son lien personnel
//              (token 256 bits ; seul le SHA-256 est stocké) ;
//  - JWT     : signataire principal (compte portail) et AMO ;
//  - interne : scellement déclenché par la dernière signature.
//
// Toutes les écritures de preuve (tokens, OTP, signatures, audit_log) passent
// ici, en service role - le client n'y a pas accès (RLS + trigger).
//
// Secrets attendus (Dashboard > Edge Functions > Secrets) :
//  RESEND_API_KEY / RESEND_FROM / APP_URL      e-mails (absent = simulation)
//  SIGNATURE_CHIFFREMENT_CLE                   base64, 32 octets - AES-256-GCM des IBAN
//  SIGNATURE_SEAL_PRIVATE_KEY                  PEM PKCS8 Ed25519 - sceau du hash final
//  SMS : prestataire à définir (spec §12, opérateur européen à privilégier).
//  Tant qu'aucun prestataire SMS n'est configuré, le code OTP part par e-mail.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOKEN_VALIDITE_JOURS = 30;
const OTP_VALIDITE_MIN = 10;
const OTP_TENTATIVES_MAX = 3;
const OTP_RENVOIS_PAR_HEURE = 3;
const PIECE_TAILLE_MAX = 10 * 1024 * 1024;
const BUCKET_PIECES = "signature-pieces";
const BUCKET_DOCS = "signature-docs";
const BUCKET_CERTIFICATS = "signature-certificats";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ========== Crypto ==========

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

function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function genToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

/** Code OTP : 6 chiffres, CSPRNG avec rejet (pas de biais modulo). */
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

/** PBKDF2-SHA256, 100 000 itérations - le code en clair n'est jamais stocké. */
async function hashOtp(code: string, saltB64?: string): Promise<string> {
  const salt = saltB64 ? b64decode(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 100_000 }, key, 256,
  );
  return `pbkdf2$100000$${b64(salt instanceof Uint8Array ? salt : new Uint8Array(salt))}$${b64(new Uint8Array(bits))}`;
}

async function verifOtp(code: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const attendu = await hashOtp(code, parts[2]);
  return attendu === stored;
}

/** Chiffre l'IBAN en AES-256-GCM (iv 12 octets en préfixe). Null si pas de clé. */
async function chiffrerIban(iban: string): Promise<string | null> {
  const cleB64 = Deno.env.get("SIGNATURE_CHIFFREMENT_CLE");
  if (!cleB64) return null;
  const cle = await crypto.subtle.importKey("raw", b64decode(cleB64) as BufferSource, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chiffre = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, cle, new TextEncoder().encode(iban) as BufferSource),
  );
  const total = new Uint8Array(iv.length + chiffre.length);
  total.set(iv); total.set(chiffre, iv.length);
  return "\\x" + [...total].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Signe le hash final avec la clé privée Ed25519 de Strat Eco (si configurée). */
async function scellerHash(hashHex: string): Promise<string | null> {
  const pem = Deno.env.get("SIGNATURE_SEAL_PRIVATE_KEY");
  if (!pem) return null;
  try {
    const der = b64decode(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, ""));
    const key = await crypto.subtle.importKey("pkcs8", der as BufferSource, { name: "Ed25519" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(hashHex) as BufferSource);
    return b64(new Uint8Array(sig));
  } catch (e) {
    console.error("Sceau Ed25519 indisponible :", e);
    return null;
  }
}

// ========== Divers ==========

function ipDe(req: Request): string | null {
  const xf = req.headers.get("x-forwarded-for");
  return xf ? xf.split(",")[0].trim() : null;
}

function telMasque(tel: string): string {
  if (tel.length < 6) return "••••";
  return tel.slice(0, 4) + "••••••" + tel.slice(-2);
}

/** Vérifie le type réel du fichier par ses octets, pas par l'extension. */
function typeMimeReel(bytes: Uint8Array): "image/jpeg" | "image/png" | "application/pdf" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 7 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  return null;
}

const fmtDateHeure = (d: string | Date) =>
  new Date(d).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "medium", timeZone: "Europe/Paris" });

// ========== E-mails (Resend, simulation sans clé) ==========

type PieceJointe = { filename: string; content: string };

async function envoyerEmail(
  to: string, subject: string, html: string, attachments?: PieceJointe[],
): Promise<"envoye" | "simule" | "erreur"> {
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
      body: JSON.stringify({ from, to: [to], subject, html, ...(attachments ? { attachments } : {}) }),
    });
    return r.ok ? "envoye" : "erreur";
  } catch {
    return "erreur";
  }
}

function gabaritEmail(corps: string): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
      ${corps}
      <p>Bien cordialement,<br/><strong>L'équipe Strat Eco</strong></p>
    </div>`;
}

function boutonEmail(url: string, libelle: string): string {
  return `<p style="margin:22px 0">
    <a href="${url}" style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">${libelle}</a>
  </p>`;
}

/** Envoie le code OTP. SMS dès qu'un prestataire sera configuré (spec §12) ;
 *  en attendant, e-mail - le canal réellement utilisé est journalisé et
 *  affiché au signataire. Sans RESEND_API_KEY : simulation, code renvoyé au
 *  client pour permettre les tests (jamais le cas avec un envoi réel). */
async function envoyerOtp(
  email: string, prenom: string, coproNom: string, code: string,
): Promise<{ canal: "sms" | "email" | "simulation"; codeTest?: string }> {
  // TODO prestataire SMS (opérateur européen) : brancher ici, canal 'sms'.
  const statut = await envoyerEmail(
    email,
    `Votre code de signature - ${coproNom}`,
    gabaritEmail(`
      <p>Bonjour ${prenom},</p>
      <p>Votre code de vérification pour signer votre bulletin d'adhésion :</p>
      <p style="font-size:30px;font-weight:bold;letter-spacing:6px;margin:18px 0">${code}</p>
      <p>Ce code est valable ${OTP_VALIDITE_MIN} minutes. Si vous n'êtes pas à l'origine de cette
      demande, ignorez ce message et signalez-le à contact@strateco.fr.</p>`),
  );
  if (statut === "simule") return { canal: "simulation", codeTest: code };
  return { canal: "email" };
}

// ========== Accès données ==========

type Admin = SupabaseClient;

function adminClient(): Admin {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function journal(
  admin: Admin, req: Request | null,
  bulletinId: string, evenement: string,
  opts?: { signataireId?: string | null; payload?: Record<string, unknown> },
): Promise<void> {
  const { error } = await admin.from("audit_log").insert({
    bulletin_id: bulletinId,
    signataire_id: opts?.signataireId ?? null,
    evenement,
    payload: opts?.payload ?? null,
    ip: req ? ipDe(req) : null,
    user_agent: req?.headers.get("user-agent") ?? null,
  });
  if (error) console.error("audit_log :", error.message);
}

type Signataire = {
  id: string; bulletin_id: string; role: string; ordre: number;
  civilite: string | null; nom: string; prenom: string; email: string; telephone: string;
  token_hash: string | null; token_expire_le: string | null; token_consomme_le: string | null;
  piece_identite_path: string | null; piece_identite_hash: string | null;
  piece_identite_type: string | null; piece_deposee_le: string | null;
  piece_deposee_ip: string | null;
  cgu_acceptees_le: string | null; attestation_piece_le: string | null;
  attestation_honneur_le: string | null; document_lu_le: string | null;
  signe_le: string | null; signe_ip: string | null; signe_user_agent: string | null;
  document_hash_signature: string | null; statut: string;
  relance1_le: string | null; relance2_le: string | null;
};

type Bulletin = {
  id: string; copro_id: string; coproprietaire_id: string; adhesion_id: string | null;
  lot_id: string | null; lot_reference: string; tantiemes: number | null;
  statut: string; cgu_version: string;
  document_path: string | null; document_hash: string | null;
  document_signe_path: string | null; document_signe_hash: string | null;
  sceau_signature: string | null; certificat_path: string | null;
  rib_path: string | null; rib_hash: string | null; iban_dernier4: string | null;
  notification_anah_le: string | null; transmission_banque_le: string | null;
  eco_ptz_demande: boolean; purge_effectuee_le: string | null;
  cree_par: string; scelle_le: string | null;
};

/** Résout un lien de signature. Réponse identique pour token inexistant,
 *  expiré ou consommé (anti-énumération). */
async function resoudreToken(
  admin: Admin, token: string, opts?: { accepterExpire?: boolean },
): Promise<{ signataire: Signataire; bulletin: Bulletin } | null> {
  if (!token || token.length < 20) return null;
  const hash = await sha256Hex(token);
  const { data: sig } = await admin.from("signataires").select("*").eq("token_hash", hash).maybeSingle();
  if (!sig) return null;
  if (sig.token_consomme_le) return null;
  const expire = sig.token_expire_le && new Date(sig.token_expire_le) < new Date();
  if (expire && !opts?.accepterExpire) return null;
  const { data: bul } = await admin.from("bulletins").select("*").eq("id", sig.bulletin_id).maybeSingle();
  if (!bul || !["en_signature", "brouillon"].includes(bul.statut)) {
    if (!opts?.accepterExpire || !bul) return null;
  }
  return { signataire: sig as Signataire, bulletin: bul as Bulletin };
}

async function coproNom(admin: Admin, coproId: string): Promise<string> {
  const { data } = await admin.from("coproprietes").select("name").eq("id", coproId).maybeSingle();
  return data?.name ?? "votre copropriété";
}

/** État renvoyé au front du cosignataire - jamais de donnée d'un autre signataire. */
function etatPublic(s: Signataire, b: Bulletin, coproName: string) {
  return {
    copro: coproName,
    lot: b.lot_reference,
    cgu_version: b.cgu_version,
    statut_bulletin: b.statut,
    signataire: {
      civilite: s.civilite, nom: s.nom, prenom: s.prenom,
      telephone_masque: telMasque(s.telephone),
      statut: s.statut,
      cgu_acceptees: !!s.cgu_acceptees_le,
      piece_deposee: !!s.piece_deposee_le,
      document_lu: !!s.document_lu_le,
      signe: !!s.signe_le,
      expire_le: s.token_expire_le,
    },
  };
}

// ========== Envoi des liens ==========

async function envoyerLienSignataire(
  admin: Admin, req: Request | null, b: Bulletin, s: Signataire, coproName: string,
  contexte: "invitation" | "relance" | "nouveau_lien",
): Promise<"envoye" | "simule" | "erreur"> {
  // le token en clair n'est jamais stocké : chaque envoi en génère un nouveau
  // (l'ancien lien est invalidé), seul le hash part en base
  const token = genToken();
  const expire = new Date(Date.now() + TOKEN_VALIDITE_JOURS * 24 * 3600 * 1000);
  await admin.from("signataires").update({
    token_hash: await sha256Hex(token),
    token_expire_le: expire.toISOString(),
  }).eq("id", s.id);

  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";
  const url = `${appUrl}/signature/${token}`;
  const dateExp = new Date(expire).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });
  const intro = contexte === "relance"
    ? `<p>Bonjour ${s.prenom},</p>
       <p>Petit rappel : votre signature est attendue sur le bulletin d'adhésion à l'éco-prêt à taux
       zéro de la copropriété <strong>${coproName}</strong> (${b.lot_reference}).</p>`
    : contexte === "nouveau_lien"
      ? `<p>Bonjour ${s.prenom},</p>
         <p>Voici votre nouveau lien de signature pour le bulletin d'adhésion de la copropriété
         <strong>${coproName}</strong> (${b.lot_reference}). Le précédent n'est plus valable.</p>`
      : `<p>Bonjour ${s.prenom},</p>
         <p>Vous êtes invité(e) à signer électroniquement le bulletin d'adhésion à l'éco-prêt à taux
         zéro de la copropriété <strong>${coproName}</strong> (${b.lot_reference}).</p>`;
  const statut = await envoyerEmail(
    s.email,
    contexte === "relance"
      ? `Rappel : signature de votre bulletin d'adhésion - ${coproName}`
      : `Signature de votre bulletin d'adhésion - ${coproName}`,
    gabaritEmail(`
      ${intro}
      <p>Il vous sera demandé :</p>
      <ul>
        <li>d'accepter les conditions générales d'utilisation du service ;</li>
        <li>de déposer votre pièce d'identité (ayez-la à portée de main, une photo suffit) ;</li>
        <li>de lire le bulletin puis de le signer avec un code reçu sur votre téléphone.</li>
      </ul>
      ${boutonEmail(url, "Accéder à la signature")}
      <p style="color:#555">Ce lien est personnel : ne le transmettez à personne.
      Il est valable jusqu'au ${dateExp}.</p>`),
  );
  if (contexte === "relance") {
    await journal(admin, req, b.id, "signataire.relance_envoyee", {
      signataireId: s.id, payload: { email: s.email, statut },
    });
  }
  return statut;
}

// ========== Scellement final + certificat de preuve ==========

const A4: [number, number] = [595.28, 841.89];

function decoupe(texte: string, max: number): string[] {
  const mots = texte.split(" ");
  const lignes: string[] = [];
  let cur = "";
  for (const m of mots) {
    if ((cur + " " + m).trim().length > max) { if (cur) lignes.push(cur); cur = m; }
    else cur = (cur + " " + m).trim();
  }
  if (cur) lignes.push(cur);
  return lignes;
}

async function genererPdfSigne(
  original: Uint8Array, signataires: Signataire[], b: Bulletin, scelleLe: Date,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original);
  const police = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const vert = rgb(0.208, 0.341, 0.09);
  let page = pdf.addPage(A4);
  let y = A4[1] - 64;
  const nouvellePageSiBesoin = (h: number) => {
    if (y - h < 60) { page = pdf.addPage(A4); y = A4[1] - 64; }
  };
  page.drawText("Signatures électroniques", { x: 50, y, size: 17, font: gras, color: vert });
  y -= 20;
  page.drawText(
    `Bulletin d'adhésion - ${b.lot_reference} - scellé le ${fmtDateHeure(scelleLe)}`,
    { x: 50, y, size: 10, font: police },
  );
  y -= 26;
  for (const s of signataires) {
    nouvellePageSiBesoin(96);
    page.drawRectangle({ x: 50, y: y - 78, width: A4[0] - 100, height: 84, borderColor: vert, borderWidth: 1 });
    page.drawText(`${s.civilite ? s.civilite + " " : ""}${s.prenom} ${s.nom}`.trim(), {
      x: 60, y: y - 16, size: 12, font: gras,
    });
    page.drawText(s.role === "principal" ? "Signataire principal" : "Cosignataire", {
      x: 60, y: y - 30, size: 9, font: police,
    });
    page.drawText(`Signé le ${s.signe_le ? fmtDateHeure(s.signe_le) : "-"}`, {
      x: 60, y: y - 44, size: 9, font: police,
    });
    page.drawText(
      "Signature électronique avancée - identité vérifiée par pièce officielle, consentement",
      { x: 60, y: y - 58, size: 8, font: police },
    );
    page.drawText(
      `confirmé par code à usage unique. Empreinte du document : ${(s.document_hash_signature ?? "").slice(0, 32)}...`,
      { x: 60, y: y - 70, size: 8, font: police },
    );
    y -= 96;
  }
  return await pdf.save();
}

async function genererCertificat(
  b: Bulletin, signataires: Signataire[], coproName: string,
  hashFinal: string, chaineHash: string | null, scelleLe: Date,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const police = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const vert = rgb(0.208, 0.341, 0.09);
  let page = pdf.addPage(A4);
  let y = A4[1] - 60;
  const ligne = (txt: string, opts?: { taille?: number; police?: typeof police; couleur?: ReturnType<typeof rgb>; x?: number }) => {
    if (y < 60) { page = pdf.addPage(A4); y = A4[1] - 60; }
    page.drawText(txt, {
      x: opts?.x ?? 50, y, size: opts?.taille ?? 9.5,
      font: opts?.police ?? police, color: opts?.couleur,
    });
    y -= (opts?.taille ?? 9.5) + 5;
  };

  ligne("Certificat de preuve - signature électronique", { taille: 17, police: gras, couleur: vert });
  y -= 6;
  ligne(`Référence du bulletin : ${b.id}`);
  ligne(`Copropriété : ${coproName}`);
  ligne(`Lot : ${b.lot_reference}${b.tantiemes ? ` - ${b.tantiemes} tantièmes` : ""}`);
  ligne(`Date de scellement : ${fmtDateHeure(scelleLe)}`);
  ligne(`Empreinte SHA-256 du document final : ${hashFinal.slice(0, 44)}`);
  ligne(`  ${hashFinal.slice(44)}`);
  ligne(`Version des CGU acceptées : ${b.cgu_version}`);
  y -= 10;

  for (const s of signataires) {
    if (y < 190) { page = pdf.addPage(A4); y = A4[1] - 60; }
    ligne(`${s.civilite ? s.civilite + " " : ""}${s.prenom} ${s.nom} - ${s.role === "principal" ? "signataire principal" : "cosignataire"}`, { taille: 12, police: gras });
    ligne(`E-mail : ${s.email}`);
    ligne(`Téléphone : ${telMasque(s.telephone)}`);
    ligne(`CGU acceptées le : ${s.cgu_acceptees_le ? fmtDateHeure(s.cgu_acceptees_le) : "-"}`);
    ligne(`Pièce d'identité déposée le : ${s.piece_deposee_le ? fmtDateHeure(s.piece_deposee_le) : "-"}${s.piece_deposee_ip ? ` (IP ${s.piece_deposee_ip})` : ""}`);
    ligne(`Attestation « cette pièce est la mienne » : ${s.attestation_piece_le ? fmtDateHeure(s.attestation_piece_le) : "-"}`);
    ligne(`Empreinte SHA-256 de la pièce : ${s.piece_identite_hash ?? "-"}`);
    ligne(`Code OTP validé et signature le : ${s.signe_le ? fmtDateHeure(s.signe_le) : "-"}`);
    ligne(`IP de signature : ${s.signe_ip ?? "-"}`);
    for (const l of decoupe(`Navigateur : ${s.signe_user_agent ?? "-"}`, 100)) ligne(l);
    ligne(`Empreinte du document au moment de la signature : ${s.document_hash_signature ?? "-"}`);
    y -= 10;
  }

  if (y < 120) { page = pdf.addPage(A4); y = A4[1] - 60; }
  y -= 6;
  ligne("Procédé", { taille: 12, police: gras });
  for (const l of decoupe(
    "Signature électronique avancée au sens de l'article 26 du règlement (UE) n° 910/2014 (eIDAS) : " +
    "identification par pièce d'identité officielle, vérification du contrôle exclusif du téléphone mobile " +
    "par code à usage unique, scellement cryptographique SHA-256 du document, journal d'événements chaîné. " +
    "Convention de preuve : article 5.2 des CGU du service (version " + b.cgu_version + ").", 105,
  )) ligne(l);
  if (chaineHash) ligne(`Empreinte de la chaîne d'audit à la date de génération : ${chaineHash.slice(0, 40)}...`);
  return await pdf.save();
}

/** Dernier signataire passé : PDF final, sceau, certificat, e-mails. */
async function sceller(admin: Admin, req: Request | null, bulletinId: string): Promise<void> {
  const { data: b } = await admin.from("bulletins").select("*").eq("id", bulletinId).maybeSingle();
  if (!b || b.statut === "complet" || !b.document_path) return;
  const { data: sigs } = await admin
    .from("signataires").select("*").eq("bulletin_id", bulletinId).order("ordre");
  const signataires = (sigs ?? []) as Signataire[];
  if (!signataires.length || signataires.some((s) => s.statut !== "signe")) return;

  const nomCopro = await coproNom(admin, b.copro_id);
  const scelleLe = new Date();

  const { data: orig, error: eDl } = await admin.storage.from(BUCKET_DOCS).download(b.document_path);
  if (eDl || !orig) { console.error("Scellement : document introuvable", eDl?.message); return; }
  const origBytes = new Uint8Array(await orig.arrayBuffer());

  const pdfSigne = await genererPdfSigne(origBytes, signataires, b as Bulletin, scelleLe);
  const hashFinal = await sha256Hex(pdfSigne);
  const sceau = await scellerHash(hashFinal);

  const { data: dernierAudit } = await admin
    .from("audit_log").select("hash_courant").eq("bulletin_id", bulletinId)
    .order("id", { ascending: false }).limit(1).maybeSingle();

  const certificat = await genererCertificat(
    b as Bulletin, signataires, nomCopro, hashFinal, dernierAudit?.hash_courant ?? null, scelleLe,
  );

  // PDF signé et certificat dans deux buckets distincts (spec §5)
  const pathSigne = `${bulletinId}/bulletin-signe.pdf`;
  const pathCert = `${bulletinId}/certificat.pdf`;
  const up1 = await admin.storage.from(BUCKET_DOCS)
    .upload(pathSigne, pdfSigne, { contentType: "application/pdf", upsert: true });
  const up2 = await admin.storage.from(BUCKET_CERTIFICATS)
    .upload(pathCert, certificat, { contentType: "application/pdf", upsert: true });
  if (up1.error || up2.error) {
    console.error("Scellement : upload", up1.error?.message, up2.error?.message);
    return;
  }

  await admin.from("bulletins").update({
    statut: "complet",
    scelle_le: scelleLe.toISOString(),
    document_signe_path: pathSigne,
    document_signe_hash: hashFinal,
    sceau_signature: sceau,
    certificat_path: pathCert,
  }).eq("id", bulletinId);

  await journal(admin, req, bulletinId, "bulletin.scelle", {
    payload: { document_signe_hash: hashFinal, sceau: !!sceau },
  });

  // le dossier d'adhésion du portail passe « signé » quand tous ses bulletins le sont
  if (b.adhesion_id) {
    const { data: freres } = await admin
      .from("bulletins").select("statut").eq("adhesion_id", b.adhesion_id);
    if ((freres ?? []).every((f) => f.statut === "complet")) {
      await admin.from("adhesions_pret")
        .update({ statut: "signee", signed_at: scelleLe.toISOString() })
        .eq("id", b.adhesion_id);
    }
  }

  // envoi du document scellé + certificat à chaque signataire
  const attachments: PieceJointe[] = [
    { filename: "bulletin-adhesion-signe.pdf", content: b64(pdfSigne) },
    { filename: "certificat-de-preuve.pdf", content: b64(certificat) },
  ];
  for (const s of signataires) {
    await envoyerEmail(
      s.email,
      `Votre bulletin d'adhésion signé - ${nomCopro}`,
      gabaritEmail(`
        <p>Bonjour ${s.prenom},</p>
        <p>Tous les signataires ont signé : le bulletin d'adhésion du ${b.lot_reference}
        (copropriété <strong>${nomCopro}</strong>) est désormais scellé.</p>
        <p>Vous trouverez en pièces jointes le document signé et son certificat de preuve.
        Conservez-les : ils font foi du consentement de chacun.</p>`),
      attachments,
    );
  }
}

// ========== Étapes communes cosignataire / principal ==========

async function demanderOtpPour(
  admin: Admin, req: Request, s: Signataire, b: Bulletin,
): Promise<Response> {
  if (!s.cgu_acceptees_le) return json(400, { error: "cgu_requises" });
  if (!s.piece_deposee_le) return json(400, { error: "piece_requise" });
  if (!s.document_lu_le) return json(400, { error: "lecture_requise" });
  if (s.signe_le) return json(400, { error: "deja_signe" });

  const depuis = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count } = await admin.from("otp_codes")
    .select("id", { count: "exact", head: true })
    .eq("signataire_id", s.id).gt("created_at", depuis);
  if ((count ?? 0) >= OTP_RENVOIS_PAR_HEURE) return json(429, { error: "trop_de_renvois" });

  // invalide les codes précédents puis en émet un neuf
  await admin.from("otp_codes").update({ expire_le: new Date().toISOString() })
    .eq("signataire_id", s.id).is("valide_le", null);
  const code = genOtp();
  const { error } = await admin.from("otp_codes").insert({
    signataire_id: s.id,
    code_hash: await hashOtp(code),
    expire_le: new Date(Date.now() + OTP_VALIDITE_MIN * 60 * 1000).toISOString(),
  });
  if (error) return json(500, { error: "otp_insert" });

  const envoi = await envoyerOtp(s.email, s.prenom, await coproNom(admin, b.copro_id), code);
  await journal(admin, req, b.id, "signataire.otp_demande", {
    signataireId: s.id,
    payload: { canal: envoi.canal, telephone: telMasque(s.telephone) },
  });
  return json(200, {
    ok: true, canal: envoi.canal, validite_min: OTP_VALIDITE_MIN,
    ...(envoi.codeTest ? { code_test: envoi.codeTest } : {}),
  });
}

async function validerOtpEtSigner(
  admin: Admin, req: Request, s: Signataire, b: Bulletin, code: string,
): Promise<Response> {
  if (s.signe_le) return json(400, { error: "deja_signe" });
  if (!/^\d{6}$/.test(code ?? "")) return json(400, { error: "code_invalide" });

  const { data: otp } = await admin.from("otp_codes")
    .select("*").eq("signataire_id", s.id).is("valide_le", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!otp || new Date(otp.expire_le) < new Date()) return json(400, { error: "code_expire" });
  if (otp.tentatives >= OTP_TENTATIVES_MAX) return json(400, { error: "trop_de_tentatives" });

  if (!(await verifOtp(code, otp.code_hash))) {
    const tentatives = otp.tentatives + 1;
    await admin.from("otp_codes").update({ tentatives }).eq("id", otp.id);
    await journal(admin, req, b.id, "signataire.otp_echec", {
      signataireId: s.id, payload: { tentatives },
    });
    return json(400, {
      error: tentatives >= OTP_TENTATIVES_MAX ? "trop_de_tentatives" : "code_faux",
      restantes: Math.max(0, OTP_TENTATIVES_MAX - tentatives),
    });
  }

  await admin.from("otp_codes").update({ valide_le: new Date().toISOString() }).eq("id", otp.id);
  await journal(admin, req, b.id, "signataire.otp_valide", { signataireId: s.id });

  // hash du document à l'instant de la signature, recalculé depuis le Storage
  let hashInstant = b.document_hash;
  if (b.document_path) {
    const { data: doc } = await admin.storage.from(BUCKET_DOCS).download(b.document_path);
    if (doc) hashInstant = await sha256Hex(new Uint8Array(await doc.arrayBuffer()));
  }

  const maintenant = new Date().toISOString();
  const { error } = await admin.from("signataires").update({
    signe_le: maintenant,
    signe_ip: ipDe(req),
    signe_user_agent: req.headers.get("user-agent"),
    document_hash_signature: hashInstant,
    statut: "signe",
    token_consomme_le: s.token_hash ? maintenant : null,
  }).eq("id", s.id).is("signe_le", null);
  if (error) return json(500, { error: "signature_echec" });

  await journal(admin, req, b.id, "signataire.signe", {
    signataireId: s.id, payload: { document_hash: hashInstant },
  });

  const nomCopro = await coproNom(admin, b.copro_id);
  await envoyerEmail(
    s.email,
    `Signature enregistrée - ${nomCopro}`,
    gabaritEmail(`
      <p>Bonjour ${s.prenom},</p>
      <p>Votre signature du bulletin d'adhésion (${b.lot_reference}, copropriété
      <strong>${nomCopro}</strong>) a bien été enregistrée le ${fmtDateHeure(maintenant)}.</p>
      <p>Vous recevrez le document final et son certificat de preuve dès que tous les
      signataires auront signé.</p>`),
  );

  return json(200, { ok: true, signe_le: maintenant });
}

async function confirmerPiece(
  admin: Admin, req: Request, s: Signataire, b: Bulletin,
  path: string, typePiece: string, attestation: boolean,
): Promise<Response> {
  if (!s.cgu_acceptees_le) return json(400, { error: "cgu_requises" });
  if (s.signe_le) return json(400, { error: "deja_signe" });
  if (!attestation) return json(400, { error: "attestation_requise" });
  if (!["cni", "passeport", "titre_sejour"].includes(typePiece)) return json(400, { error: "type_piece_invalide" });
  if (!path?.startsWith(`${b.id}/${s.id}/`)) return json(400, { error: "chemin_invalide" });

  const { data: fichier, error } = await admin.storage.from(BUCKET_PIECES).download(path);
  if (error || !fichier) return json(400, { error: "fichier_absent" });
  const bytes = new Uint8Array(await fichier.arrayBuffer());
  if (bytes.length > PIECE_TAILLE_MAX) {
    await admin.storage.from(BUCKET_PIECES).remove([path]);
    return json(400, { error: "fichier_trop_gros" });
  }
  if (!typeMimeReel(bytes)) {
    await admin.storage.from(BUCKET_PIECES).remove([path]);
    return json(400, { error: "format_invalide" });
  }
  // le hash se calcule au dépôt : après purge il ne peut plus l'être
  const hash = await sha256Hex(bytes);
  const maintenant = new Date().toISOString();

  // remplace une éventuelle pièce précédente
  if (s.piece_identite_path && s.piece_identite_path !== path) {
    await admin.storage.from(BUCKET_PIECES).remove([s.piece_identite_path]);
  }
  await admin.from("signataires").update({
    piece_identite_path: path,
    piece_identite_hash: hash,
    piece_identite_type: typePiece,
    piece_deposee_le: maintenant,
    piece_deposee_ip: ipDe(req),
    attestation_piece_le: maintenant,
    statut: s.statut === "en_attente" ? "identite_deposee" : s.statut,
  }).eq("id", s.id);

  await journal(admin, req, b.id, "signataire.piece_deposee", {
    signataireId: s.id, payload: { type: typePiece, sha256: hash },
  });
  return json(200, { ok: true });
}

async function urlUploadPiece(admin: Admin, b: Bulletin, s: Signataire, ext: string): Promise<Response> {
  if (!["jpg", "jpeg", "png", "pdf"].includes((ext ?? "").toLowerCase())) {
    return json(400, { error: "format_invalide" });
  }
  const path = `${b.id}/${s.id}/piece-${Date.now()}.${ext.toLowerCase()}`;
  const { data, error } = await admin.storage.from(BUCKET_PIECES).createSignedUploadUrl(path);
  if (error) return json(500, { error: "upload_url" });
  return json(200, { path, token: data.token });
}

// ========== Serveur ==========

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  const admin = adminClient();
  const corps = await req.json().catch(() => ({}));
  const action = String(corps.action ?? "");

  // ---------- Actions par lien de signature (cosignataire, sans compte) ----------
  if (action.startsWith("lien_")) {
    const res = await resoudreToken(admin, corps.token, {
      accepterExpire: action === "lien_nouveau",
    });
    if (!res) return json(404, { error: "lien_invalide" });
    const { signataire: s, bulletin: b } = res;
    const nomCopro = await coproNom(admin, b.copro_id);

    switch (action) {
      case "lien_ouvrir": {
        await journal(admin, req, b.id, "signataire.lien_ouvert", { signataireId: s.id });
        return json(200, etatPublic(s, b, nomCopro));
      }
      case "lien_etat":
        return json(200, etatPublic(s, b, nomCopro));
      case "lien_accepter_cgu": {
        if (!s.cgu_acceptees_le) {
          await admin.from("signataires")
            .update({ cgu_acceptees_le: new Date().toISOString() }).eq("id", s.id);
          await journal(admin, req, b.id, "signataire.cgu_acceptees", {
            signataireId: s.id, payload: { cgu_version: b.cgu_version },
          });
        }
        return json(200, { ok: true });
      }
      case "lien_piece_upload":
        if (!s.cgu_acceptees_le) return json(400, { error: "cgu_requises" });
        return urlUploadPiece(admin, b, s, corps.ext);
      case "lien_piece_confirmer":
        return confirmerPiece(admin, req, s, b, corps.path, corps.type_piece, !!corps.attestation);
      case "lien_document_url": {
        if (!s.cgu_acceptees_le) return json(400, { error: "cgu_requises" });
        if (!b.document_path) return json(400, { error: "document_absent" });
        const { data, error } = await admin.storage.from(BUCKET_DOCS)
          .createSignedUrl(b.document_path, 60);
        if (error) return json(500, { error: "url_document" });
        return json(200, { url: data.signedUrl });
      }
      case "lien_document_lu": {
        if (!s.document_lu_le) {
          await admin.from("signataires")
            .update({ document_lu_le: new Date().toISOString() }).eq("id", s.id);
          await journal(admin, req, b.id, "signataire.document_lu", { signataireId: s.id });
        }
        return json(200, { ok: true });
      }
      case "lien_otp_demander":
        return demanderOtpPour(admin, req, s, b);
      case "lien_otp_valider": {
        const r = await validerOtpEtSigner(admin, req, s, b, corps.code);
        if (r.status === 200) await sceller(admin, req, b.id);
        return r;
      }
      case "lien_nouveau": {
        // lien expiré mais jamais consommé : on régénère et on renvoie l'e-mail
        if (s.signe_le) return json(400, { error: "deja_signe" });
        const statut = await envoyerLienSignataire(admin, req, b, s, nomCopro, "nouveau_lien");
        return json(200, { ok: true, statut });
      }
      default:
        return json(400, { error: "action_inconnue" });
    }
  }

  // ---------- Actions authentifiées (principal / AMO) ----------
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });
  const uid = userData.user.id;

  const { data: profil } = await admin.from("profiles")
    .select("role, active, niveau_pieces").eq("user_id", uid).maybeSingle();
  const estAmo = !!profil && profil.active && profil.role === "amo";

  async function bulletinDuPrincipal(bulletinId: string): Promise<Bulletin | null> {
    const { data } = await admin.from("bulletins").select("*").eq("id", bulletinId).maybeSingle();
    if (!data || data.cree_par !== uid) return null;
    return data as Bulletin;
  }
  async function signatairePrincipal(bulletinId: string): Promise<Signataire | null> {
    const { data } = await admin.from("signataires").select("*")
      .eq("bulletin_id", bulletinId).eq("role", "principal").maybeSingle();
    return (data as Signataire) ?? null;
  }

  switch (action) {
    // ----- parcours du signataire principal -----
    case "principal_initialiser": {
      // appelé juste après la création client-side du bulletin (RLS) pour
      // ouvrir la piste d'audit
      const b = await bulletinDuPrincipal(corps.bulletin_id);
      if (!b) return json(404, { error: "bulletin_introuvable" });
      const { count } = await admin.from("audit_log")
        .select("id", { count: "exact", head: true })
        .eq("bulletin_id", b.id).eq("evenement", "bulletin.cree");
      if (!count) {
        await journal(admin, req, b.id, "bulletin.cree", {
          payload: { lot: b.lot_reference, cgu_version: b.cgu_version },
        });
      }
      return json(200, { ok: true });
    }
    case "principal_document_lu": {
      const b = await bulletinDuPrincipal(corps.bulletin_id);
      if (!b) return json(404, { error: "bulletin_introuvable" });
      const s = await signatairePrincipal(b.id);
      if (!s) return json(400, { error: "signataire_absent" });
      if (!s.document_lu_le) {
        await admin.from("signataires")
          .update({ document_lu_le: new Date().toISOString() }).eq("id", s.id);
        await journal(admin, req, b.id, "signataire.document_lu", { signataireId: s.id });
      }
      return json(200, { ok: true });
    }
    case "principal_document_upload": {
      const b = await bulletinDuPrincipal(corps.bulletin_id);
      if (!b) return json(404, { error: "bulletin_introuvable" });
      if (b.statut !== "brouillon") return json(400, { error: "bulletin_verrouille" });
      const path = `${b.id}/bulletin.pdf`;
      const { data, error } = await admin.storage.from(BUCKET_DOCS)
        .createSignedUploadUrl(path, { upsert: true });
      if (error) return json(500, { error: "upload_url" });
      return json(200, { path, token: data.token });
    }
    case "principal_document_confirmer": {
      const b = await bulletinDuPrincipal(corps.bulletin_id);
      if (!b) return json(404, { error: "bulletin_introuvable" });
      if (b.statut !== "brouillon") return json(400, { error: "bulletin_verrouille" });
      const { data: doc, error } = await admin.storage.from(BUCKET_DOCS).download(`${b.id}/bulletin.pdf`);
      if (error || !doc) return json(400, { error: "fichier_absent" });
      const bytes = new Uint8Array(await doc.arrayBuffer());
      if (typeMimeReel(bytes) !== "application/pdf") return json(400, { error: "format_invalide" });
      const hash = await sha256Hex(bytes);
      await admin.from("bulletins").update({
        document_path: `${b.id}/bulletin.pdf`, document_hash: hash,
      }).eq("id", b.id);
      return json(200, { ok: true, sha256: hash });
    }
    case "principal_cgu": {
      const b = await bulletinDuPrincipal(corps.bulletin_id);
      if (!b) return json(404, { error: "bulletin_introuvable" });
      const s = await signatairePrincipal(b.id);
      if (!s) return json(400, { error: "signataire_absent" });
      if (!s.cgu_acceptees_le) {
        await admin.from("signataires")
          .update({ cgu_acceptees_le: new Date().toISOString() }).eq("id", s.id);
        await journal(admin, req, b.id, "signataire.cgu_acceptees", {
          signataireId: s.id, payload: { cgu_version: b.cgu_version },
        });
      }
      return json(200, { ok: true });
    }
    case "principal_attestation_honneur": {
      const b = await bulletinDuPrincipal(corps.bulletin_id);
      if (!b) return json(404, { error: "bulletin_introuvable" });
      const s = await signatairePrincipal(b.id);
      if (!s) return json(400, { error: "signataire_absent" });
      await admin.from("signataires")
        .update({ attestation_honneur_le: new Date().toISOString() }).eq("id", s.id);
      const { count: nbCosigs } = await admin.from("signataires")
        .select("id", { count: "exact", head: true })
        .eq("bulletin_id", b.id).eq("role", "cosignataire");
      await journal(admin, req, b.id, "bulletin.cosignataire_declare", {
        signataireId: s.id,
        payload: {
          attestation_honneur: true,
          cosignataires: nbCosigs ?? 0,
          info_avis_imposition: !!corps.info_avis,
        },
      });
      return json(200, { ok: true });
    }
    case "principal_piece_upload": {
      const b = await bulletinDuPrincipal(corps.bulletin_id);
      if (!b) return json(404, { error: "bulletin_introuvable" });
      const s = await signatairePrincipal(b.id);
      if (!s) return json(400, { error: "signataire_absent" });
      if (!s.cgu_acceptees_le) return json(400, { error: "cgu_requises" });
      return urlUploadPiece(admin, b, s, corps.ext);
    }
    case "principal_piece_confirmer": {
      const b = await bulletinDuPrincipal(corps.bulletin_id);
      if (!b) return json(404, { error: "bulletin_introuvable" });
      const s = await signatairePrincipal(b.id);
      if (!s) return json(400, { error: "signataire_absent" });
      return confirmerPiece(admin, req, s, b, corps.path, corps.type_piece, !!corps.attestation);
    }
    case "principal_rib_upload": {
      const b = await bulletinDuPrincipal(corps.bulletin_id);
      if (!b) return json(404, { error: "bulletin_introuvable" });
      if (!["jpg", "jpeg", "png", "pdf"].includes((corps.ext ?? "").toLowerCase())) {
        return json(400, { error: "format_invalide" });
      }
      const path = `${b.id}/rib-${Date.now()}.${String(corps.ext).toLowerCase()}`;
      const { data, error } = await admin.storage.from(BUCKET_PIECES).createSignedUploadUrl(path);
      if (error) return json(500, { error: "upload_url" });
      return json(200, { path, token: data.token });
    }
    case "principal_rib_confirmer": {
      const b = await bulletinDuPrincipal(corps.bulletin_id);
      if (!b) return json(404, { error: "bulletin_introuvable" });
      if (b.statut !== "brouillon") return json(400, { error: "bulletin_verrouille" });
      const path = String(corps.path ?? "");
      if (!path.startsWith(`${b.id}/rib-`)) return json(400, { error: "chemin_invalide" });
      const { data: fichier, error } = await admin.storage.from(BUCKET_PIECES).download(path);
      if (error || !fichier) return json(400, { error: "fichier_absent" });
      const bytes = new Uint8Array(await fichier.arrayBuffer());
      if (bytes.length > PIECE_TAILLE_MAX || !typeMimeReel(bytes)) {
        await admin.storage.from(BUCKET_PIECES).remove([path]);
        return json(400, { error: "fichier_invalide" });
      }
      const iban = String(corps.iban ?? "").replace(/\s/g, "").toUpperCase();
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return json(400, { error: "iban_invalide" });
      if (b.rib_path && b.rib_path !== path) {
        await admin.storage.from(BUCKET_PIECES).remove([b.rib_path]);
      }
      const chiffre = await chiffrerIban(iban);
      await admin.from("bulletins").update({
        rib_path: path,
        rib_hash: await sha256Hex(bytes),
        iban_chiffre: chiffre,
        iban_dernier4: iban.slice(-4),
      }).eq("id", b.id);
      return json(200, { ok: true, iban_chiffre: !!chiffre });
    }
    case "principal_otp_demander": {
      const b = await bulletinDuPrincipal(corps.bulletin_id);
      if (!b) return json(404, { error: "bulletin_introuvable" });
      const s = await signatairePrincipal(b.id);
      if (!s) return json(400, { error: "signataire_absent" });
      if (!s.attestation_honneur_le) return json(400, { error: "attestation_honneur_requise" });
      if (!b.document_path) return json(400, { error: "document_absent" });
      if (!b.rib_path) return json(400, { error: "rib_requis" });
      return demanderOtpPour(admin, req, s, b);
    }
    case "principal_otp_valider": {
      const b = await bulletinDuPrincipal(corps.bulletin_id);
      if (!b) return json(404, { error: "bulletin_introuvable" });
      const s = await signatairePrincipal(b.id);
      if (!s) return json(400, { error: "signataire_absent" });
      const r = await validerOtpEtSigner(admin, req, s, b, corps.code);
      if (r.status !== 200) return r;

      // signature du principal = envoi des liens aux cosignataires (spec §3.8)
      const { data: cosigs } = await admin.from("signataires").select("*")
        .eq("bulletin_id", b.id).eq("role", "cosignataire").order("ordre");
      const nomCopro = await coproNom(admin, b.copro_id);
      let envoyes = 0, simules = 0;
      for (const c of (cosigs ?? []) as Signataire[]) {
        const st = await envoyerLienSignataire(admin, req, b, c, nomCopro, "invitation");
        if (st === "envoye") envoyes++;
        if (st === "simule") simules++;
      }
      if ((cosigs ?? []).length > 0) {
        await admin.from("bulletins").update({
          statut: "en_signature",
          liens_envoyes_le: new Date().toISOString(),
        }).eq("id", b.id);
        await journal(admin, req, b.id, "bulletin.liens_envoyes", {
          payload: { cosignataires: (cosigs ?? []).length, envoyes, simules },
        });
      } else {
        await sceller(admin, req, b.id);
      }
      return json(200, { ok: true, cosignataires: (cosigs ?? []).length, envoyes, simules });
    }
    case "principal_document_url": {
      const b = await bulletinDuPrincipal(corps.bulletin_id);
      if (!b) return json(404, { error: "bulletin_introuvable" });
      const quoi = String(corps.quoi ?? "document");
      const cible = quoi === "signe"
        ? { bucket: BUCKET_DOCS, path: b.document_signe_path }
        : quoi === "certificat"
          ? { bucket: BUCKET_CERTIFICATS, path: b.certificat_path }
          : { bucket: BUCKET_DOCS, path: b.document_path };
      if (!cible.path) return json(404, { error: "document_absent" });
      const { data, error } = await admin.storage.from(cible.bucket).createSignedUrl(cible.path, 60);
      if (error) return json(500, { error: "url_document" });
      return json(200, { url: data.signedUrl });
    }
    case "relancer": {
      // principal (son bulletin) ou AMO : relance manuelle d'un cosignataire
      const { data: s } = await admin.from("signataires").select("*")
        .eq("id", corps.signataire_id).maybeSingle();
      if (!s) return json(404, { error: "signataire_introuvable" });
      const { data: b } = await admin.from("bulletins").select("*").eq("id", s.bulletin_id).maybeSingle();
      if (!b) return json(404, { error: "bulletin_introuvable" });
      if (!estAmo && b.cree_par !== uid) return json(403, { error: "interdit" });
      if (s.signe_le) return json(400, { error: "deja_signe" });
      if (b.statut !== "en_signature") return json(400, { error: "bulletin_verrouille" });
      const statut = await envoyerLienSignataire(
        admin, req, b as Bulletin, s as Signataire, await coproNom(admin, b.copro_id), "relance",
      );
      return json(200, { ok: true, statut });
    }

    // ----- actions AMO -----
    case "amo_piece_url": {
      // CGU art. 7.5.1 : contenu des pièces réservé au niveau 1 (service
      // administratif), chaque consultation journalisée
      if (!estAmo) return json(403, { error: "Réservé à l'équipe AMO" });
      if (profil!.niveau_pieces !== 1) return json(403, { error: "niveau_2_sans_lecture" });
      const quoi = String(corps.quoi ?? "piece");
      let path: string | null = null;
      let bulletinId: string;
      let signataireId: string | null = null;
      if (quoi === "rib") {
        const { data: b } = await admin.from("bulletins").select("*").eq("id", corps.bulletin_id).maybeSingle();
        if (!b?.rib_path) return json(404, { error: "document_absent" });
        path = b.rib_path; bulletinId = b.id;
      } else {
        const { data: s } = await admin.from("signataires").select("*").eq("id", corps.signataire_id).maybeSingle();
        if (!s?.piece_identite_path) return json(404, { error: "document_absent" });
        path = s.piece_identite_path; bulletinId = s.bulletin_id; signataireId = s.id;
      }
      const { data, error } = await admin.storage.from(BUCKET_PIECES).createSignedUrl(path!, 60);
      if (error) return json(500, { error: "url_document" });
      await journal(admin, req, bulletinId, "document.consulte", {
        signataireId, payload: { quoi, par: uid },
      });
      return json(200, { url: data.signedUrl });
    }
    case "amo_document_url": {
      // document signé / certificat : pas une pièce justificative, lisible par
      // toute l'équipe AMO (niveau 1 et 2)
      if (!estAmo) return json(403, { error: "Réservé à l'équipe AMO" });
      const { data: b } = await admin.from("bulletins").select("*").eq("id", corps.bulletin_id).maybeSingle();
      if (!b) return json(404, { error: "bulletin_introuvable" });
      const quoi = String(corps.quoi ?? "signe");
      const cible = quoi === "certificat"
        ? { bucket: BUCKET_CERTIFICATS, path: b.certificat_path }
        : quoi === "document"
          ? { bucket: BUCKET_DOCS, path: b.document_path }
          : { bucket: BUCKET_DOCS, path: b.document_signe_path };
      if (!cible.path) return json(404, { error: "document_absent" });
      const { data, error } = await admin.storage.from(cible.bucket).createSignedUrl(cible.path, 60);
      if (error) return json(500, { error: "url_document" });
      return json(200, { url: data.signedUrl });
    }
    case "amo_marquer": {
      // dates d'instruction, déclencheurs de la purge (CGU art. 7.4.1)
      if (!estAmo) return json(403, { error: "Réservé à l'équipe AMO" });
      const { data: b } = await admin.from("bulletins").select("*").eq("id", corps.bulletin_id).maybeSingle();
      if (!b) return json(404, { error: "bulletin_introuvable" });
      const patch: Record<string, unknown> = {};
      if (corps.notification_anah_le !== undefined) patch.notification_anah_le = corps.notification_anah_le;
      if (corps.transmission_banque_le !== undefined) patch.transmission_banque_le = corps.transmission_banque_le;
      if (corps.eco_ptz_demande !== undefined) patch.eco_ptz_demande = !!corps.eco_ptz_demande;
      if (!Object.keys(patch).length) return json(400, { error: "rien_a_marquer" });
      const { error } = await admin.from("bulletins").update(patch).eq("id", b.id);
      if (error) return json(500, { error: "maj_echec" });
      await journal(admin, req, b.id, "bulletin.instruction_marquee", {
        payload: { ...patch, par: uid },
      });
      return json(200, { ok: true });
    }
    default:
      return json(400, { error: "action_inconnue" });
  }
});
