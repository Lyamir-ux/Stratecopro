// Edge function « rge-certificat » (07/10/2026, demande d'Amir) : rapatrie le
// certificat RGE d'une entreprise (PDF de Qualibat, Qualifelec, Qualit'EnR,
// Qualitel, Ordre des architectes…) pour que le chef de projet l'archive dans
// le dossier de la copropriété. Le navigateur ne peut pas le télécharger
// lui-même : les sites des organismes n'autorisent pas les appels d'une autre
// origine.
//
// v2 (07/10/2026, 0147) : ouverte aussi au maître d'œuvre connecté (fiche
// entreprise active, métier MOE), qui archive le certificat dans ses documents
// de projet depuis « Mes projets ».
//
// Garde-fous : équipe AMO ou maître d'œuvre actifs ; le lien demandé doit figurer dans
// la liste officielle des entreprises RGE de l'ADEME pour CE SIRET (la fonction
// ne sert jamais de relais vers une adresse quelconque) ; PDF de 15 Mo au plus.
// Lien vers une page web (OPQIBI, AFNOR) : 422, le chef de projet ouvre le lien.
import { createClient } from "npm:@supabase/supabase-js@2";

const API_RGE = "https://data.ademe.fr/data-fair/api/v1/datasets/liste-des-entreprises-rge-2";
const TAILLE_MAX = 15 * 1024 * 1024;

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

  // --- Appelant : équipe AMO, ou maître d'œuvre (v2) ---
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });
  const { data: profile } = await admin
    .from("profiles")
    .select("role, active")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile || !profile.active) return json(403, { error: "Compte inactif" });
  if (profile.role !== "amo") {
    // v2 (0147) : maître d'œuvre connecté à sa fiche entreprise active
    const { data: moe } = await admin
      .from("prestataires")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("actif", true)
      .contains("types", ["moe"])
      .maybeSingle();
    if (profile.role !== "presta" || !moe) return json(403, { error: "Réservé à l'équipe Strat Eco et aux maîtres d'œuvre" });
  }

  const body = await req.json().catch(() => ({}));
  const siret = String(body?.siret ?? "").replace(/\D/g, "");
  const url = String(body?.url ?? "").trim();
  if (siret.length !== 14 || !url) return json(400, { error: "SIRET (14 chiffres) et lien du certificat attendus" });

  // --- Le lien doit appartenir à cet établissement dans la liste de l'ADEME ---
  const params = new URLSearchParams({ qs: `siret:"${siret}"`, size: "1000", select: "url_qualification" });
  const rep = await fetch(`${API_RGE}/lines?${params}`).catch(() => null);
  if (!rep?.ok) return json(502, { error: "La liste RGE de l'ADEME ne répond pas : réessayez dans un instant." });
  const lignes = ((await rep.json().catch(() => ({})))?.results ?? []) as { url_qualification?: string }[];
  if (!lignes.some((l) => (l.url_qualification ?? "").trim() === url))
    return json(404, { error: "Ce certificat ne figure plus dans la liste RGE de l'ADEME pour cet établissement." });

  let cible: URL;
  try {
    cible = new URL(url);
  } catch {
    return json(422, { error: "Lien de certificat illisible." });
  }
  if (cible.protocol !== "https:" && cible.protocol !== "http:") return json(422, { error: "Lien de certificat illisible." });

  // --- Téléchargement du certificat ---
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const doc = await fetch(cible, { redirect: "follow", signal: ctrl.signal });
    if (!doc.ok) return json(502, { error: `Le site de l'organisme a répondu ${doc.status} : ouvrez le lien du certificat.` });
    const annonce = Number(doc.headers.get("content-length") ?? 0);
    if (annonce > TAILLE_MAX) return json(413, { error: "Certificat trop volumineux pour être archivé : ouvrez le lien." });
    const octets = new Uint8Array(await doc.arrayBuffer());
    if (octets.length > TAILLE_MAX) return json(413, { error: "Certificat trop volumineux pour être archivé : ouvrez le lien." });
    const estPdf = octets.length > 4 && String.fromCharCode(...octets.slice(0, 5)) === "%PDF-";
    if (!estPdf)
      return json(422, { error: "Le lien de l'organisme mène à une page web, pas à un PDF : ouvrez-le pour enregistrer le certificat." });
    return new Response(octets, {
      status: 200,
      headers: { ...cors, "Content-Type": "application/pdf", "Cache-Control": "no-store" },
    });
  } catch {
    return json(504, { error: "Le site de l'organisme ne répond pas : réessayez ou ouvrez le lien du certificat." });
  } finally {
    clearTimeout(minuterie);
  }
});
