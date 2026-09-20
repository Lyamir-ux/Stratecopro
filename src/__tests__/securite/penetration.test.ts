// Test d'intrusion - rejoue les attaques d'un pirate contre le projet Supabase
// RÉEL, muni de la seule clé anon (celle que tout le monde peut lire dans le
// bundle). Vérifie que la RLS et les edge functions tiennent.
//
// Profils rejoués :
//   A. Anonyme (clé anon, aucun compte)
//   B. (documenté) Authentifié « sauvage » - non rejouable sans créer un compte
//      jetable ; couvert par le test SQL du protocole. Ici on couvre A, le pire
//      cas exploitable de l'extérieur sans interaction.
//
// Lit VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY depuis .env.local. Si absents,
// la suite est ignorée (utile en CI sans secrets) plutôt que rouge.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function chargeEnvLocal(): Record<string, string> {
  const p = resolve(__dirname, "../../../.env.local");
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (existsSync(p)) {
    for (const ligne of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = chargeEnvLocal();
const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const dispo = Boolean(URL && ANON);
const suite = dispo ? describe : describe.skip;

if (!dispo) {
  // eslint-disable-next-line no-console
  console.warn("[securite] VITE_SUPABASE_URL / _ANON_KEY absents : test d'intrusion ignoré.");
}

const H = () => ({ apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" });

async function rest(path: string) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H() });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

suite("Intrusion externe (clé anon) - la base ne fuit pas", () => {
  beforeAll(() => {
    expect(URL).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
  });

  // --- 1. Lecture des tables métier : doit renvoyer 0 ligne (RLS) ---
  const tablesSensibles = [
    "coproprietes",
    "coproprietaires",
    "profiles",
    "bulletins",
    "signataires",
    "fichiers",
    "organisations",
    "prestataires",
    "copro_stats",
    "montage_docs",
    "choix_financement",
    // module Suivi PPT (0072) : plans, analyses JSON, corrections du dirigeant
    "ppt_coproprietes",
    "ppt_rapports",
    "ppt_analyses",
    "ppt_postes",
    "ppt_remarques",
    "ppt_corrections",
    "ppt_copro_stats",
  ];
  it.each(tablesSensibles)("anon ne lit aucune ligne de %s", async (t) => {
    const { status, body } = await rest(`${t}?select=*&limit=5`);
    // 200 avec tableau vide (RLS filtre) OU 401/403 (droit retiré) : les deux sont sûrs.
    if (status === 200) expect(Array.isArray(body) && body.length === 0, `${t} a renvoyé des lignes !`).toBe(true);
    else expect([401, 403]).toContain(status);
  });

  // --- 2. Tables de preuve : lecture directe interdite ---
  it.each(["otp_codes", "audit_log"])("anon se voit refuser %s", async (t) => {
    const { status } = await rest(`${t}?select=*&limit=1`);
    expect([401, 403]).toContain(status);
  });

  // --- 3. Écriture : auto-promotion en AMO impossible ---
  it("anon ne peut pas créer de profil AMO (auto-promotion)", async () => {
    const r = await fetch(`${URL}/rest/v1/profiles`, {
      method: "POST",
      headers: { ...H(), Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: "11111111-1111-1111-1111-111111111111",
        full_name: "Pirate",
        role: "amo",
        active: true,
      }),
    });
    expect(r.status, "insert profil AMO ne doit PAS réussir").not.toBe(201);
    expect([401, 403]).toContain(r.status);
  });

  it("anon ne peut pas écrire de barème (RLS)", async () => {
    // Payload complet (vraies colonnes) pour atteindre la vérification RLS et
    // non une erreur de schéma. Supabase mappe la violation RLS 42501 en 401/403.
    const r = await fetch(`${URL}/rest/v1/baremes`, {
      method: "POST",
      headers: H(),
      body: JSON.stringify({ millesime: 9999, zone: "TEST", params: {}, actif: false }),
    });
    expect([401, 403], `statut inattendu: ${r.status}`).toContain(r.status);
    // Défense en profondeur : vérifier qu'aucune ligne n'a été créée.
    const { body } = await rest("baremes?select=millesime&millesime=eq.9999");
    expect(Array.isArray(body) ? body.length : 0, "un barème pirate a été inséré !").toBe(0);
  });

  // --- 4. Edge functions : refus sans session valide ---
  it.each([
    "creer-collaborateur",
    "notifier-syndic",
    "rapport-syndic",
    "signature-flux",
    "rappel-agrements",
  ])("l'edge function %s refuse un appel non authentifié", async (fn) => {
    const r = await fetch(`${URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: H(),
      body: JSON.stringify({}),
    });
    expect(r.status, `${fn} doit répondre 401`).toBe(401);
  });

  // --- 5. Storage : les buckets privés ne listent rien pour anon ---
  it.each(["copro-files", "pieces-copro", "signature-docs", "signature-pieces"])(
    "le bucket privé %s ne liste aucun objet pour anon",
    async (b) => {
      const r = await fetch(`${URL}/storage/v1/object/list/${b}`, {
        method: "POST",
        headers: H(),
        body: JSON.stringify({ prefix: "", limit: 10 }),
      });
      if (r.status === 200) {
        const arr = await r.json().catch(() => []);
        expect(Array.isArray(arr) && arr.length === 0, `${b} a listé des objets !`).toBe(true);
      } else {
        expect([400, 401, 403]).toContain(r.status);
      }
    },
  );

  // --- 6. RPC mutant SECURITY DEFINER : garde interne effective ---
  it("rattacher_lot refuse un lot non autorisé pour anon", async () => {
    const r = await fetch(`${URL}/rest/v1/rpc/rattacher_lot`, {
      method: "POST",
      headers: H(),
      body: JSON.stringify({
        p_lot_id: "00000000-0000-0000-0000-000000000000",
        p_cible_id: "00000000-0000-0000-0000-000000000000",
      }),
    });
    // La fonction lève « Lot non autorisé » (400) ou l'EXECUTE anon a été révoqué (401/403).
    expect([400, 401, 403]).toContain(r.status);
    expect(r.status).not.toBe(204); // 204 = mutation silencieuse réussie -> interdit
  });
});
