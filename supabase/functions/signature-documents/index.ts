// Edge function « signature-documents » - signature électronique de documents
// par des signataires sans compte (02/10/2026). Premier usage : l'éco-PTZ
// individuel, CERFA Annexe 3.1 signé par les entreprises, l'auditeur et le
// syndic, attestation des montants éligibles signée par le syndic.
//
// Un envoi = des documents (PDF générés par l'app, déposés avant l'envoi) et
// des participants. Chaque participant reçoit UN lien personnel par envoi et
// signe en une fois tous les documents où il figure (choix d'Amir) :
// documents ouverts, attestation sur l'honneur, « Fait à », code à usage
// unique reçu par e-mail. Signature électronique simple, journal chaîné
// (audit_log, chaîne par envoi). Quand tous les signataires d'un document ont
// signé, le PDF est scellé : cases de signature, « Fait à » et date remplis,
// page de preuve ajoutée, empreinte SHA-256 (+ sceau Ed25519 si la clé est
// configurée), copie dans les Fichiers du dossier.
//
// Actions (champ `action` du POST) :
//  - token : lien_ouvrir, lien_document_url, lien_otp_demander, lien_otp_valider ;
//  - JWT   : amo_preparer, amo_envoyer, amo_relancer, amo_annuler (équipe AMO),
//            document_url (AMO, syndic du dossier, copropriétaire du document).
// Écritures en service role uniquement. Secrets : RESEND_API_KEY / RESEND_FROM /
// APP_URL / SIGNATURE_SEAL_PRIVATE_KEY (sans clé Resend : e-mails simulés,
// code et liens renvoyés dans la réponse pour les tests).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "signature-docs";
const BUCKET_FICHIERS = "copro-files";
const TOKEN_VALIDITE_JOURS = 30;
const OTP_VALIDITE_MIN = 10;
const OTP_TENTATIVES_MAX = 3;
const OTP_ENVOIS_PAR_HEURE = 3;
const A4: [number, number] = [595.28, 841.89];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// ========== Crypto (mêmes procédés que signature-flux / signature-fiche-etat) ==========

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const h = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
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

function ipDe(req: Request | null): string | null {
  const xf = req?.headers.get("x-forwarded-for");
  return xf ? xf.split(",")[0].trim() : null;
}

const emailValide = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const uuidValide = (s: unknown) => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

function echapper(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const fmtDateHeure = (d: string | Date) =>
  new Date(d).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });
const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });
const fmtHeure = (d: string | Date) =>
  new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

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

// ========== Types ==========

type Admin = SupabaseClient;
type Role = "entreprise" | "auditeur" | "syndic";

type Participant = {
  id: string; envoi_id: string; copro_id: string; role: Role; prestataire_id: string | null;
  societe: string; siret: string; nom: string; email: string; ordre: number;
  statut: "en_attente" | "signe" | "annule";
  token_hash: string | null; token_expire_le: string | null; lien_envoye_le: string | null; nb_envois: number;
  otp_hash: string | null; otp_expire_le: string | null; otp_tentatives: number; otp_envois: string[] | null;
  attestation_le: string | null; fait_a: string | null; signe_le: string | null;
  signe_ip: string | null; signe_user_agent: string | null;
};

type Document = {
  id: string; envoi_id: string; copro_id: string; type: "cerfa_ecoptz" | "attestation_ecoptz";
  coproprietaire_id: string | null; lot_id: string | null; libelle: string; donnees: Record<string, unknown>;
  statut: "brouillon" | "en_attente" | "signe" | "annule";
  document_path: string | null; document_hash: string | null; document_signe_path: string | null;
};

type Rect = { x: number; y: number; w: number; h: number };
type Emplacement = { page: number; signature: Rect; ligneFaitA?: Rect; faitA?: Rect; date?: Rect };

type DocSig = {
  document_id: string; participant_id: string; emplacements: Emplacement[];
  lu_le: string | null; signe_le: string | null; document_hash: string | null;
};

type Envoi = {
  id: string; copro_id: string; statut: "brouillon" | "en_cours" | "complet" | "annule";
  cree_par: string | null; cree_par_nom: string | null;
};

const LIBELLE_ROLE: Record<Role, string> = {
  entreprise: "Entreprise de travaux",
  auditeur: "Auditeur énergétique",
  syndic: "Syndic de copropriété",
};

/** Texte certifié sur l'honneur avant la signature (repris du CERFA Annexe 3.1). */
function texteAttestation(p: Participant): string {
  switch (p.role) {
    case "entreprise":
      return `Pour ${p.societe}, je certifie sur l'honneur que l'entreprise a pris connaissance de l'audit énergétique, ` +
        "que les travaux visés respectent ses prescriptions pour atteindre la performance indiquée et sont réalisés " +
        "conformément à l'arrêté du 30 mars 2009 modifié, que l'entreprise (ou son sous-traitant mentionné au devis) " +
        "dispose du signe de qualité RGE pour ces travaux, et que le montant éligible indiqué pour chaque logement est exact.";
    case "auditeur":
      return `Pour ${p.societe}, je certifie sur l'honneur que l'audit énergétique assure la conformité du projet avec ` +
        "l'article 11 de l'arrêté NOR DEVU0903668A, qu'il est transmis à l'ADEME conformément à l'article L126-32 du code " +
        "de la construction et de l'habitation, et que le prestataire remplit les critères de qualification du décret " +
        "n° 2022-780 du 4 mai 2022 modifié.";
    case "syndic":
      return `En qualité de syndic${p.societe ? ` (${p.societe})` : ""}, j'atteste du coût total éligible revenant à chaque ` +
        "logement indiqué sur les formulaires et je certifie les montants des attestations jointes.";
  }
}

async function journal(
  admin: Admin, req: Request | null, envoiId: string, participantId: string | null, evenement: string,
  payload?: Record<string, unknown>,
) {
  const { error } = await admin.from("audit_log").insert({
    bulletin_id: envoiId,
    signataire_id: participantId,
    evenement,
    payload: payload ?? null,
    ip: ipDe(req),
    user_agent: req?.headers.get("user-agent") ?? null,
  });
  if (error) console.error("audit_log :", error.message);
}

async function coproInfos(admin: Admin, coproId: string): Promise<{ nom: string; adresse: string }> {
  const { data } = await admin.from("coproprietes").select("name, adresse, code_postal, city").eq("id", coproId).maybeSingle();
  return {
    nom: data?.name ?? "la copropriété",
    adresse: [data?.adresse, [data?.code_postal, data?.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  };
}

async function chargerEnvoi(admin: Admin, envoiId: string): Promise<Envoi | null> {
  const { data } = await admin.from("signature_envois").select("id, copro_id, statut, cree_par, cree_par_nom").eq("id", envoiId).maybeSingle();
  return (data ?? null) as Envoi | null;
}

async function docsDuParticipant(admin: Admin, participantId: string): Promise<{ sig: DocSig; doc: Document }[]> {
  const { data: sigs } = await admin.from("signature_document_signataires").select("*").eq("participant_id", participantId);
  const ids = (sigs ?? []).map((s) => s.document_id);
  if (!ids.length) return [];
  const { data: docs } = await admin.from("signature_documents").select("*").in("id", ids);
  const parId = new Map((docs ?? []).map((d) => [d.id, d as Document]));
  return (sigs ?? [])
    .map((s) => ({ sig: s as DocSig, doc: parId.get(s.document_id)! }))
    .filter((x) => !!x.doc && x.doc.statut !== "annule")
    .sort((a, b) => a.doc.libelle.localeCompare(b.doc.libelle, "fr"));
}

// ========== Liens personnels ==========

async function envoyerLien(admin: Admin, req: Request | null, p: Participant, relance: boolean) {
  const token = genToken();
  const expire = new Date(Date.now() + TOKEN_VALIDITE_JOURS * 24 * 3600 * 1000);
  await admin.from("signature_participants").update({
    token_hash: await sha256Hex(token),
    token_expire_le: expire.toISOString(),
    lien_envoye_le: new Date().toISOString(),
    nb_envois: (p.nb_envois ?? 0) + 1,
  }).eq("id", p.id);
  const copro = await coproInfos(admin, p.copro_id);
  const docs = await docsDuParticipant(admin, p.id);
  const nbCerfa = docs.filter((d) => d.doc.type === "cerfa_ecoptz").length;
  const nbAttest = docs.filter((d) => d.doc.type === "attestation_ecoptz").length;
  const quoi = [
    nbCerfa ? `${nbCerfa} formulaire${nbCerfa > 1 ? "s" : ""} CERFA éco-PTZ (Annexe 3.1)` : "",
    nbAttest ? `${nbAttest} attestation${nbAttest > 1 ? "s" : ""} de montants éligibles` : "",
  ].filter(Boolean).join(" et ");
  const url = `${appUrl()}/signature-documents/${token}`;
  const statut = await envoyerEmail(
    p.email,
    `${relance ? "Rappel : " : ""}Documents éco-PTZ à signer - ${copro.nom}`,
    gabarit(`
      <p>Bonjour ${echapper(p.nom || p.societe)},</p>
      <p>${relance ? "Petit rappel : votre" : "Votre"} signature est attendue sur ${echapper(quoi || "des documents")}
      de la copropriété <strong>${echapper(copro.nom)}</strong>${copro.adresse ? ` (${echapper(copro.adresse)})` : ""},
      pour les copropriétaires qui financent leur quote-part de travaux par un éco-prêt à taux zéro individuel.</p>
      <p>En tant que ${echapper(LIBELLE_ROLE[p.role].toLowerCase())}${p.societe && p.role !== "syndic" ? ` (${echapper(p.societe)})` : ""},
      vous relisez les documents, vous certifiez les informations qui vous concernent, puis vous signez tout en une fois
      avec un code reçu par e-mail.</p>
      ${bouton(url, "Relire et signer")}
      <p style="color:#555">Ce lien est personnel : ne le transmettez à personne. Il est valable jusqu'au
      ${expire.toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" })}.</p>`),
  );
  await journal(admin, req, p.envoi_id, p.id, relance ? "envoi.relance" : "envoi.lien_envoye", { statut, role: p.role });
  return { statut, lien: simulation() ? url : undefined };
}

async function resoudreToken(admin: Admin, token: string): Promise<{ p: Participant; envoi: Envoi } | null> {
  if (!token || token.length < 20) return null;
  const { data } = await admin.from("signature_participants").select("*").eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!data) return null;
  const p = data as Participant;
  if (p.statut === "annule") return null;
  if (p.token_expire_le && new Date(p.token_expire_le) < new Date() && !p.signe_le) return null;
  const envoi = await chargerEnvoi(admin, p.envoi_id);
  if (!envoi || envoi.statut === "annule" || envoi.statut === "brouillon") return null;
  return { p, envoi };
}

// ========== Scellement ==========

const ENCRE = rgb(0.05, 0.12, 0.35);
const GRIS = rgb(0.35, 0.35, 0.35);
const BLANC = rgb(1, 1, 1);

function nettoyer(font: PDFFont, texte: string): string {
  const jeu = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of texte.replace(/[\u00a0\u202f\u2009]/g, " ").replace(/[\u2014\u2013]/g, "-")) {
    if (jeu.has(ch.codePointAt(0)!)) out += ch;
    else {
      const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      out += [...base].every((c) => jeu.has(c.codePointAt(0)!)) ? base : "?";
    }
  }
  return out;
}

function ajuster(font: PDFFont, texte: string, taille: number, largeur: number): string {
  let t = nettoyer(font, texte);
  while (t.length > 1 && font.widthOfTextAtSize(t, taille) > largeur) t = t.slice(0, -1);
  return t;
}

function cadreSignature(page: PDFPage, font: PDFFont, gras: PDFFont, p: Participant, r: Rect) {
  page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: BLANC, borderColor: ENCRE, borderWidth: 0.7 });
  const lignes: { t: string; f: PDFFont; s: number }[] = [
    { t: "Signé électroniquement par", f: font, s: 6.5 },
    { t: p.nom || p.societe, f: gras, s: 8.5 },
    ...(p.societe && p.nom ? [{ t: p.societe, f: font, s: 7 }] : []),
    { t: `le ${fmtDate(p.signe_le!)} à ${fmtHeure(p.signe_le!)} - code à usage unique`, f: font, s: 6.5 },
  ];
  const hTotal = lignes.reduce((s, l) => s + l.s + 2, 0);
  let y = r.y + r.h - Math.max(3, (r.h - hTotal) / 2) - lignes[0].s;
  for (const l of lignes) {
    page.drawText(ajuster(l.f, l.t, l.s, r.w - 8), { x: r.x + 4, y, size: l.s, font: l.f, color: ENCRE });
    y -= l.s + 2;
  }
}

function ecrireDans(page: PDFPage, font: PDFFont, texte: string, r: Rect, taille = 8.5) {
  page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: BLANC });
  page.drawText(ajuster(font, texte, taille, r.w - 3), { x: r.x + 2, y: r.y + 2.5, size: taille, font, color: ENCRE });
}

/** Ligne « Fait à : … le … » d'un poste du CERFA, réécrite entière. */
function ecrireLigneFaitA(page: PDFPage, font: PDFFont, faitA: string, date: string, r: Rect) {
  page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: BLANC });
  const y = r.y + 3;
  page.drawText("Fait à :", { x: r.x + 1.5, y, size: 9, font, color: rgb(0, 0, 0) });
  page.drawText(ajuster(font, faitA, 8.5, 140), { x: r.x + 36, y, size: 8.5, font, color: ENCRE });
  page.drawText("le", { x: r.x + 182, y, size: 9, font, color: rgb(0, 0, 0) });
  page.drawText(nettoyer(font, date), { x: r.x + 194, y, size: 8.5, font, color: ENCRE });
}

function decoupe(font: PDFFont, texte: string, taille: number, largeur: number): string[] {
  const lignes: string[] = [];
  let cur = "";
  for (const m of nettoyer(font, texte).split(/\s+/).filter(Boolean)) {
    const essai = cur ? `${cur} ${m}` : m;
    if (font.widthOfTextAtSize(essai, taille) <= largeur || !cur) cur = essai;
    else { lignes.push(cur); cur = m; }
  }
  if (cur) lignes.push(cur);
  return lignes;
}

async function pagePreuve(
  pdf: PDFDocument, font: PDFFont, gras: PDFFont, doc: Document, copro: string,
  signataires: { p: Participant; s: DocSig }[], scelleLe: Date,
) {
  let page = pdf.addPage(A4);
  let y = A4[1] - 56;
  const ligne = (t: string, taille = 8.5, f = font, couleur = ENCRE) => {
    for (const l of decoupe(f, t, taille, A4[0] - 100)) {
      if (y < 60) { page = pdf.addPage(A4); y = A4[1] - 56; }
      page.drawText(l, { x: 50, y, size: taille, font: f, color: couleur });
      y -= taille + 4;
    }
  };
  ligne("Signatures électroniques - page de preuve", 15, gras);
  y -= 4;
  ligne(`${doc.libelle} - copropriété ${copro}`);
  ligne(`Référence du document : ${doc.id} - envoi ${doc.envoi_id}`);
  ligne(`Empreinte SHA-256 du document présenté aux signataires : ${doc.document_hash ?? "-"}`, 7.5);
  ligne(`Scellé le ${fmtDateHeure(scelleLe)}`);
  y -= 8;
  for (const { p, s } of signataires) {
    ligne(`${LIBELLE_ROLE[p.role]} - ${p.nom || "-"}${p.societe ? ` (${p.societe})` : ""}`, 10.5, gras);
    if (p.siret) ligne(`SIRET : ${p.siret}`);
    ligne(`E-mail de réception du code : ${p.email}`);
    ligne(`Attestation sur l'honneur acceptée le ${p.attestation_le ? fmtDateHeure(p.attestation_le) : "-"}`);
    ligne(`Document ouvert le ${s.lu_le ? fmtDateHeure(s.lu_le) : "-"} ; signé le ${s.signe_le ? fmtDateHeure(s.signe_le) : "-"}${p.fait_a ? ` à ${p.fait_a}` : ""}`);
    ligne(`Adresse IP : ${p.signe_ip ?? "-"} - navigateur : ${(p.signe_user_agent ?? "-").slice(0, 110)}`, 7.5, font, GRIS);
    ligne(`Empreinte du document au moment de la signature : ${s.document_hash ?? "-"}`, 7.5, font, GRIS);
    y -= 6;
  }
  y -= 4;
  ligne("Procédé", 10.5, gras);
  ligne(
    "Signature électronique simple au sens du règlement (UE) n° 910/2014 (eIDAS) : lien personnel transmis par e-mail, " +
      "lecture de chaque document, attestation sur l'honneur, consentement confirmé par un code à usage unique envoyé à " +
      "l'adresse du signataire, empreinte SHA-256 du document vérifiée à la signature, journal d'événements chaîné. " +
      "Document scellé par Strat Eco Pro.",
    8,
  );
}

/** Tous les signataires d'un document ont signé : PDF final, Fichiers du dossier, e-mail au copropriétaire. */
async function sceller(admin: Admin, req: Request | null, documentId: string): Promise<boolean> {
  const { data: d } = await admin.from("signature_documents").select("*").eq("id", documentId).maybeSingle();
  const doc = d as Document | null;
  if (!doc || doc.statut !== "en_attente" || !doc.document_path) return false;
  const { data: sigs } = await admin.from("signature_document_signataires").select("*").eq("document_id", documentId);
  const lignes = (sigs ?? []) as DocSig[];
  if (!lignes.length || lignes.some((s) => !s.signe_le)) return false;
  const { data: parts } = await admin.from("signature_participants").select("*").in("id", lignes.map((s) => s.participant_id));
  const parId = new Map((parts ?? []).map((p) => [p.id, p as Participant]));
  const signataires = lignes
    .map((s) => ({ s, p: parId.get(s.participant_id)! }))
    .filter((x) => !!x.p)
    .sort((a, b) => a.p.ordre - b.p.ordre);

  const { data: orig, error: eDl } = await admin.storage.from(BUCKET).download(doc.document_path);
  if (eDl || !orig) { console.error("Scellement : document introuvable", eDl?.message); return false; }
  const pdf = await PDFDocument.load(new Uint8Array(await orig.arrayBuffer()));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  for (const { p, s } of signataires) {
    const date = fmtDate(p.signe_le!);
    for (const e of s.emplacements ?? []) {
      const page = pages[e.page];
      if (!page) continue;
      cadreSignature(page, font, gras, p, e.signature);
      if (e.ligneFaitA) ecrireLigneFaitA(page, font, p.fait_a ?? "", date, e.ligneFaitA);
      if (e.faitA) ecrireDans(page, font, p.fait_a ?? "", e.faitA);
      if (e.date) ecrireDans(page, font, date, e.date);
    }
  }
  const copro = await coproInfos(admin, doc.copro_id);
  const scelleLe = new Date();
  await pagePreuve(pdf, font, gras, doc, copro.nom, signataires, scelleLe);
  pdf.setProducer("Strat Eco Pro");
  const signe = await pdf.save();
  const hash = await sha256Hex(signe);
  const sceau = await scellerHash(hash);

  const pathSigne = doc.document_path.replace(/\.pdf$/, "") + "-signe.pdf";
  const up = await admin.storage.from(BUCKET).upload(pathSigne, signe, { contentType: "application/pdf", upsert: true });
  if (up.error) { console.error("Scellement : dépôt", up.error.message); return false; }

  // copie dans les Fichiers du dossier (classement « Plans de financement »)
  const envoi = await chargerEnvoi(admin, doc.envoi_id);
  const nom = String(doc.donnees?.nom_fichier ?? `${doc.libelle} - signe.pdf`).replace(/[\\/:*?"<>|]/g, " ");
  const pathFichier = `${doc.copro_id}/Plans_de_financement/${Date.now()}-${nom.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  let fichierId: string | null = null;
  const upF = await admin.storage.from(BUCKET_FICHIERS).upload(pathFichier, signe, { contentType: "application/pdf" });
  if (!upF.error) {
    const { data: f, error: eF } = await admin.from("fichiers").insert({
      copro_id: doc.copro_id,
      dossier: "Plans de financement",
      name: nom,
      name_original: nom,
      storage_path: pathFichier,
      size: signe.length,
      mime: "application/pdf",
      uploaded_by: envoi?.cree_par ?? null,
    }).select("id").single();
    if (eF) console.error("Scellement : fiche fichier", eF.message);
    fichierId = f?.id ?? null;
  } else console.error("Scellement : copie Fichiers", upF.error.message);

  await admin.from("signature_documents").update({
    statut: "signe",
    document_signe_path: pathSigne,
    document_signe_hash: hash,
    sceau_signature: sceau,
    scelle_le: scelleLe.toISOString(),
    fichier_id: fichierId,
  }).eq("id", doc.id);
  await journal(admin, req, doc.envoi_id, null, "document.scelle", { document_id: doc.id, hash, sceau: !!sceau });

  // le copropriétaire est prévenu quand les documents de son logement sont tous signés
  if (doc.coproprietaire_id && doc.lot_id) {
    const { data: freres } = await admin.from("signature_documents").select("id, statut")
      .eq("envoi_id", doc.envoi_id).eq("coproprietaire_id", doc.coproprietaire_id).eq("lot_id", doc.lot_id);
    if ((freres ?? []).every((f) => f.id === doc.id || f.statut === "signe")) {
      const { data: cp } = await admin.from("coproprietaires").select("nom, email").eq("id", doc.coproprietaire_id).maybeSingle();
      if (cp?.email && emailValide(cp.email)) {
        await envoyerEmail(
          cp.email,
          `Vos documents éco-PTZ sont signés - ${copro.nom}`,
          gabarit(`
            <p>Bonjour ${echapper(cp.nom ?? "")},</p>
            <p>Le formulaire CERFA de l'éco-prêt à taux zéro et l'attestation des montants éligibles de votre logement
            (copropriété <strong>${echapper(copro.nom)}</strong>) sont signés par les entreprises, l'auditeur et le syndic.</p>
            <p>Vous pouvez les télécharger dans votre espace copropriétaire, onglet Documents, et les remettre à votre banque
            avec votre demande d'éco-PTZ.</p>
            ${bouton(`${appUrl()}/portail/documents`, "Mes documents")}`),
        );
      }
    }
  }
  return true;
}

/** Envoi complet quand tous ses documents sont signés. */
async function majEnvoi(admin: Admin, envoiId: string) {
  const { data: docs } = await admin.from("signature_documents").select("statut").eq("envoi_id", envoiId);
  const actifs = (docs ?? []).filter((d) => d.statut !== "annule");
  if (actifs.length && actifs.every((d) => d.statut === "signe"))
    await admin.from("signature_envois").update({ statut: "complet", complet_le: new Date().toISOString() })
      .eq("id", envoiId).eq("statut", "en_cours");
}

// ========== Parcours du signataire ==========

async function demanderOtp(admin: Admin, req: Request, p: Participant, corps: Record<string, unknown>): Promise<Response> {
  if (p.signe_le) return json(400, { error: "deja_signe" });
  if (!corps.attestation) return json(400, { error: "attestation_requise" });
  const faitA = String(corps.fait_a ?? "").trim().slice(0, 60);
  if (!faitA) return json(400, { error: "fait_a_requis" });
  const docs = await docsDuParticipant(admin, p.id);
  if (docs.some((d) => d.doc.statut === "en_attente" && !d.sig.lu_le)) return json(400, { error: "documents_non_lus" });
  const depuis = Date.now() - 3600 * 1000;
  const envois = (p.otp_envois ?? []).filter((d) => new Date(d).getTime() > depuis);
  if (envois.length >= OTP_ENVOIS_PAR_HEURE) return json(429, { error: "trop_de_renvois" });
  const code = genOtp();
  const maintenant = new Date().toISOString();
  await admin.from("signature_participants").update({
    otp_hash: await hashOtp(code),
    otp_expire_le: new Date(Date.now() + OTP_VALIDITE_MIN * 60 * 1000).toISOString(),
    otp_tentatives: 0,
    otp_envois: [...envois, maintenant],
    attestation_le: maintenant,
    fait_a: faitA,
  }).eq("id", p.id);
  const copro = await coproInfos(admin, p.copro_id);
  const statut = await envoyerEmail(
    p.email,
    `Votre code de signature - documents éco-PTZ - ${copro.nom}`,
    gabarit(`
      <p>Bonjour,</p>
      <p>Votre code pour signer les documents éco-PTZ de la copropriété <strong>${echapper(copro.nom)}</strong> :</p>
      <p style="font-size:30px;font-weight:bold;letter-spacing:6px;margin:18px 0">${code}</p>
      <p>Ce code est valable ${OTP_VALIDITE_MIN} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce
      message et signalez-le à admin@strateco.fr.</p>`),
  );
  await journal(admin, req, p.envoi_id, p.id, "signature.otp_demande", { canal: statut === "simule" ? "simulation" : "email", statut });
  if (statut === "erreur") return json(502, { error: "envoi_echec" });
  return json(200, {
    ok: true,
    canal: statut === "simule" ? "simulation" : "email",
    validite_min: OTP_VALIDITE_MIN,
    ...(statut === "simule" ? { code_test: code } : {}),
  });
}

async function validerOtp(admin: Admin, req: Request, p: Participant, code: string): Promise<Response> {
  if (p.signe_le) return json(400, { error: "deja_signe" });
  if (!/^\d{6}$/.test(code ?? "")) return json(400, { error: "code_invalide" });
  if (!p.otp_hash || !p.otp_expire_le || new Date(p.otp_expire_le) < new Date()) return json(400, { error: "code_expire" });
  if (p.otp_tentatives >= OTP_TENTATIVES_MAX) return json(400, { error: "trop_de_tentatives" });
  if (!(await verifOtp(code, p.otp_hash))) {
    const tentatives = p.otp_tentatives + 1;
    await admin.from("signature_participants").update({ otp_tentatives: tentatives }).eq("id", p.id);
    await journal(admin, req, p.envoi_id, p.id, "signature.otp_echec", { tentatives });
    return json(400, {
      error: tentatives >= OTP_TENTATIVES_MAX ? "trop_de_tentatives" : "code_faux",
      restantes: Math.max(0, OTP_TENTATIVES_MAX - tentatives),
    });
  }

  // empreinte de chaque document recalculée depuis le stockage : elle doit
  // être celle du document présenté à l'envoi
  const docs = (await docsDuParticipant(admin, p.id)).filter((d) => d.doc.statut === "en_attente");
  const empreintes = new Map<string, string>();
  for (const { doc } of docs) {
    const { data: f } = await admin.storage.from(BUCKET).download(doc.document_path!);
    if (!f) return json(500, { error: "document_manquant" });
    const h = await sha256Hex(new Uint8Array(await f.arrayBuffer()));
    if (doc.document_hash && h !== doc.document_hash) {
      await journal(admin, req, p.envoi_id, p.id, "signature.integrite_echec", { document_id: doc.id });
      return json(409, { error: "document_manquant" });
    }
    empreintes.set(doc.id, h);
  }

  const maintenant = new Date().toISOString();
  const { error } = await admin.from("signature_participants").update({
    statut: "signe",
    signe_le: maintenant,
    signe_ip: ipDe(req),
    signe_user_agent: req.headers.get("user-agent"),
    otp_hash: null,
  }).eq("id", p.id).is("signe_le", null);
  if (error) return json(500, { error: "signature_echec" });
  for (const { doc } of docs) {
    await admin.from("signature_document_signataires")
      .update({ signe_le: maintenant, document_hash: empreintes.get(doc.id) })
      .eq("document_id", doc.id).eq("participant_id", p.id);
  }
  await journal(admin, req, p.envoi_id, p.id, "signature.signe", {
    role: p.role,
    documents: docs.map((d) => ({ id: d.doc.id, hash: empreintes.get(d.doc.id) })),
  });

  let scelles = 0;
  for (const { doc } of docs) if (await sceller(admin, req, doc.id)) scelles += 1;
  await majEnvoi(admin, p.envoi_id);

  const copro = await coproInfos(admin, p.copro_id);
  await envoyerEmail(
    p.email,
    `Signature enregistrée - documents éco-PTZ - ${copro.nom}`,
    gabarit(`
      <p>Bonjour ${echapper(p.nom || p.societe)},</p>
      <p>Votre signature est enregistrée sur ${docs.length} document${docs.length > 1 ? "s" : ""} éco-PTZ de la copropriété
      <strong>${echapper(copro.nom)}</strong>, le ${fmtDateHeure(maintenant)}. Merci.</p>
      <p>Les documents sont transmis aux copropriétaires dès que tous les signataires ont signé.</p>`),
  );
  return json(200, { ok: true, signe_le: maintenant, documents: docs.length, scelles });
}

// ========== Préparation et envoi (AMO) ==========

type PreparerParticipant = { cle: string; role: Role; prestataire_id?: string | null; societe?: string; siret?: string; nom?: string; email?: string };
type PreparerDocument = {
  cle: string; type: Document["type"]; coproprietaire_id?: string | null; lot_id?: string | null; libelle: string;
  donnees?: Record<string, unknown>; signataires: { participant: string; emplacements: Emplacement[] }[];
};

async function preparer(admin: Admin, coproId: string, userId: string, nomAuteur: string | null, corps: Record<string, unknown>): Promise<Response> {
  const participants = (corps.participants ?? []) as PreparerParticipant[];
  const documents = (corps.documents ?? []) as PreparerDocument[];
  if (!Array.isArray(participants) || !participants.length || !Array.isArray(documents) || !documents.length)
    return json(400, { error: "envoi_vide" });
  const cles = new Set<string>();
  for (const p of participants) {
    if (!p.cle || cles.has(p.cle)) return json(400, { error: "participant_invalide" });
    if (!["entreprise", "auditeur", "syndic"].includes(p.role)) return json(400, { error: "participant_invalide" });
    if (!emailValide(String(p.email ?? "").trim())) return json(400, { error: "email_invalide", participant: p.cle });
    cles.add(p.cle);
  }
  for (const d of documents) {
    if (!["cerfa_ecoptz", "attestation_ecoptz"].includes(d.type) || !d.libelle) return json(400, { error: "document_invalide" });
    if (!d.signataires?.length || d.signataires.some((s) => !cles.has(s.participant))) return json(400, { error: "document_invalide" });
  }

  const { data: envoi, error: eE } = await admin.from("signature_envois")
    .insert({ copro_id: coproId, cree_par: userId, cree_par_nom: nomAuteur }).select("id").single();
  if (eE || !envoi) return json(500, { error: "creation_echec" });

  const idParCle = new Map<string, string>();
  for (const [i, p] of participants.entries()) {
    const { data, error } = await admin.from("signature_participants").insert({
      envoi_id: envoi.id,
      copro_id: coproId,
      role: p.role,
      prestataire_id: uuidValide(p.prestataire_id) ? p.prestataire_id : null,
      societe: String(p.societe ?? "").trim().slice(0, 200),
      siret: String(p.siret ?? "").trim().slice(0, 30),
      nom: String(p.nom ?? "").trim().slice(0, 200),
      email: String(p.email ?? "").trim().toLowerCase(),
      ordre: i,
    }).select("id").single();
    if (error || !data) return json(500, { error: "creation_echec" });
    idParCle.set(p.cle, data.id);
  }

  const uploads: { cle: string; document_id: string; path: string; token: string }[] = [];
  for (const d of documents) {
    const { data: doc, error } = await admin.from("signature_documents").insert({
      envoi_id: envoi.id,
      copro_id: coproId,
      type: d.type,
      coproprietaire_id: uuidValide(d.coproprietaire_id) ? d.coproprietaire_id : null,
      lot_id: uuidValide(d.lot_id) ? d.lot_id : null,
      libelle: String(d.libelle).slice(0, 300),
      donnees: d.donnees ?? {},
    }).select("id").single();
    if (error || !doc) return json(500, { error: "creation_echec" });
    const path = `ecoptz/${coproId}/${envoi.id}/${doc.id}.pdf`;
    await admin.from("signature_documents").update({ document_path: path }).eq("id", doc.id);
    const { error: eS } = await admin.from("signature_document_signataires").insert(
      d.signataires.map((s) => ({ document_id: doc.id, participant_id: idParCle.get(s.participant)!, emplacements: s.emplacements ?? [] })),
    );
    if (eS) return json(500, { error: "creation_echec" });
    const { data: up, error: eU } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (eU || !up) return json(500, { error: "creation_echec" });
    uploads.push({ cle: d.cle, document_id: doc.id, path, token: up.token });
  }
  await journal(admin, null, envoi.id, null, "envoi.prepare", { par: userId, documents: documents.length, participants: participants.length });
  return json(200, { ok: true, envoi_id: envoi.id, uploads });
}

async function envoyer(admin: Admin, req: Request, envoiId: string, userId: string): Promise<Response> {
  const envoi = await chargerEnvoi(admin, envoiId);
  if (!envoi) return json(404, { error: "envoi_introuvable" });
  if (envoi.statut !== "brouillon") return json(400, { error: "envoi_deja_parti" });
  const { data: docs } = await admin.from("signature_documents").select("id, document_path").eq("envoi_id", envoiId);
  for (const d of docs ?? []) {
    const { data: f } = await admin.storage.from(BUCKET).download(d.document_path!);
    if (!f) return json(400, { error: "document_manquant" });
    const h = await sha256Hex(new Uint8Array(await f.arrayBuffer()));
    await admin.from("signature_documents").update({ document_hash: h, statut: "en_attente" }).eq("id", d.id);
  }
  await admin.from("signature_envois").update({ statut: "en_cours", envoye_le: new Date().toISOString() }).eq("id", envoiId);
  const { data: parts } = await admin.from("signature_participants").select("*").eq("envoi_id", envoiId).order("ordre");
  const resultats: { participant_id: string; role: Role; email: string; statut: string; lien?: string }[] = [];
  for (const p of (parts ?? []) as Participant[]) {
    const r = await envoyerLien(admin, req, p, false);
    resultats.push({ participant_id: p.id, role: p.role, email: p.email, statut: r.statut, lien: r.lien });
  }
  await journal(admin, req, envoiId, null, "envoi.envoye", { par: userId });
  return json(200, { ok: true, participants: resultats });
}

// ========== Serveur ==========

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const corps = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(corps.action ?? "");

  // ---------- Signataires (lien personnel, sans compte) ----------
  if (action.startsWith("lien_")) {
    const r = await resoudreToken(admin, String(corps.token ?? ""));
    if (!r) return json(404, { error: "lien_invalide" });
    const { p } = r;
    switch (action) {
      case "lien_ouvrir": {
        await journal(admin, req, p.envoi_id, p.id, "signature.lien_ouvert");
        const copro = await coproInfos(admin, p.copro_id);
        const docs = await docsDuParticipant(admin, p.id);
        let ville = p.fait_a ?? "";
        if (!ville && p.prestataire_id) {
          const { data: pr } = await admin.from("prestataires").select("ville").eq("id", p.prestataire_id).maybeSingle();
          ville = pr?.ville ?? "";
        }
        return json(200, {
          copro,
          participant: {
            role: p.role, role_libelle: LIBELLE_ROLE[p.role], societe: p.societe, siret: p.siret, nom: p.nom,
            statut: p.statut, signe_le: p.signe_le, ville_proposee: ville,
          },
          attestation: texteAttestation(p),
          documents: docs.map(({ doc, sig }) => ({
            id: doc.id, type: doc.type, libelle: doc.libelle, statut: doc.statut, lu: !!sig.lu_le, signe_le: sig.signe_le,
          })),
        });
      }
      case "lien_document_url": {
        const docs = await docsDuParticipant(admin, p.id);
        const x = docs.find((d) => d.doc.id === corps.document_id);
        if (!x) return json(404, { error: "lien_invalide" });
        const chemin = x.doc.statut === "signe" && x.doc.document_signe_path ? x.doc.document_signe_path : x.doc.document_path!;
        const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(chemin, 300);
        if (!s?.signedUrl) return json(500, { error: "document_manquant" });
        if (!x.sig.lu_le) {
          await admin.from("signature_document_signataires").update({ lu_le: new Date().toISOString() })
            .eq("document_id", x.doc.id).eq("participant_id", p.id);
          await journal(admin, req, p.envoi_id, p.id, "signature.document_ouvert", { document_id: x.doc.id });
        }
        return json(200, { url: s.signedUrl });
      }
      case "lien_otp_demander":
        return demanderOtp(admin, req, p, corps);
      case "lien_otp_valider":
        return validerOtp(admin, req, p, String(corps.code ?? ""));
      default:
        return json(400, { error: "action_inconnue" });
    }
  }

  // ---------- Actions authentifiées ----------
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });
  const user = userData.user;
  const { data: profil } = await admin.from("profiles").select("role, active, full_name").eq("user_id", user.id).maybeSingle();
  const estAmo = !!profil && profil.active && profil.role === "amo";

  if (action === "document_url") {
    if (!uuidValide(corps.document_id)) return json(400, { error: "document_invalide" });
    const { data: d } = await admin.from("signature_documents").select("*").eq("id", corps.document_id).maybeSingle();
    const doc = d as Document | null;
    if (!doc) return json(404, { error: "document_invalide" });
    let autorise = estAmo;
    let signeSeul = false;
    if (!autorise) {
      const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: estSyndic } = await client.rpc("is_syndic_of", { p_copro_id: doc.copro_id });
      autorise = !!estSyndic;
      if (!autorise && doc.coproprietaire_id) {
        const { data: cp } = await admin.from("coproprietaires").select("id").eq("id", doc.coproprietaire_id).eq("user_id", user.id).maybeSingle();
        autorise = !!cp;
        signeSeul = true;
      }
    }
    if (!autorise) return json(403, { error: "interdit" });
    const veutSigne = corps.version === "signe" || signeSeul;
    const chemin = veutSigne ? doc.document_signe_path : doc.document_path;
    if (!chemin) return json(404, { error: "document_manquant" });
    const nom = String(doc.donnees?.nom_fichier ?? `${doc.libelle}.pdf`);
    const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(chemin, 120, {
      download: veutSigne ? nom : nom.replace(/\.pdf$/i, " - projet.pdf"),
    });
    if (!s?.signedUrl) return json(500, { error: "document_manquant" });
    return json(200, { url: s.signedUrl });
  }

  if (!estAmo) return json(403, { error: "interdit" });

  switch (action) {
    case "amo_preparer": {
      const coproId = String(corps.copro_id ?? "");
      if (!uuidValide(coproId)) return json(400, { error: "copro_id attendu" });
      return preparer(admin, coproId, user.id, profil?.full_name ?? null, corps);
    }
    case "amo_envoyer": {
      if (!uuidValide(corps.envoi_id)) return json(400, { error: "envoi_introuvable" });
      return envoyer(admin, req, String(corps.envoi_id), user.id);
    }
    case "amo_relancer": {
      if (!uuidValide(corps.participant_id)) return json(400, { error: "participant_invalide" });
      const { data } = await admin.from("signature_participants").select("*").eq("id", corps.participant_id).maybeSingle();
      const p = data as Participant | null;
      if (!p) return json(404, { error: "participant_invalide" });
      if (p.signe_le) return json(400, { error: "deja_signe" });
      const envoi = await chargerEnvoi(admin, p.envoi_id);
      if (!envoi || envoi.statut !== "en_cours") return json(400, { error: "envoi_annule" });
      const email = String(corps.email ?? "").trim().toLowerCase();
      if (email && !emailValide(email)) return json(400, { error: "email_invalide" });
      const nom = String(corps.nom ?? "").trim();
      if (email || nom) {
        await admin.from("signature_participants").update({ ...(email ? { email } : {}), ...(nom ? { nom } : {}) }).eq("id", p.id);
        if (email) p.email = email;
        if (nom) p.nom = nom;
        await journal(admin, req, p.envoi_id, p.id, "envoi.signataire_modifie", { par: user.id, email: !!email, nom: !!nom });
      }
      const r = await envoyerLien(admin, req, p, !email);
      return json(200, { ok: true, statut: r.statut, lien_test: r.lien });
    }
    case "amo_annuler": {
      if (!uuidValide(corps.envoi_id)) return json(400, { error: "envoi_introuvable" });
      const envoi = await chargerEnvoi(admin, String(corps.envoi_id));
      if (!envoi) return json(404, { error: "envoi_introuvable" });
      if (envoi.statut === "complet") return json(400, { error: "envoi_complet" });
      await admin.from("signature_envois").update({ statut: "annule", annule_le: new Date().toISOString() }).eq("id", envoi.id);
      await admin.from("signature_participants").update({ statut: "annule", token_hash: null, otp_hash: null })
        .eq("envoi_id", envoi.id).neq("statut", "signe");
      await admin.from("signature_documents").update({ statut: "annule" }).eq("envoi_id", envoi.id).neq("statut", "signe");
      await journal(admin, req, envoi.id, null, "envoi.annule", { par: user.id });
      return json(200, { ok: true });
    }
    default:
      return json(400, { error: "action_inconnue" });
  }
});
