// Test de sécurité - fuite de clés dans le bundle de production.
//
// Un attaquant lit tout le JavaScript livré au navigateur. Ce test échoue si
// un secret NON public apparaît dans dist/ : clé service_role, clé Resend,
// secret de chiffrement/scellement de signature, ou un JWT dont le rôle n'est
// pas « anon ». Seules la clé anon et la clé publishable sont tolérées.
//
// À lancer APRÈS `npm run build` (le dossier dist/ doit exister et être à jour).
// Si dist/ est absent, le test est ignoré avec un message plutôt que rouge.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const DIST = resolve(__dirname, "../../../dist");

function fichiersTexte(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...fichiersTexte(p));
    else if (/\.(js|css|html|map|json|txt)$/.test(e)) out.push(p);
  }
  return out;
}

function decodePayloadJwt(jwt: string): Record<string, unknown> | null {
  try {
    const p = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(p, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

const distPresent = existsSync(DIST);
const suite = distPresent ? describe : describe.skip;

if (!distPresent) {
  // eslint-disable-next-line no-console
  console.warn("[securite] dist/ absent : lancez `npm run build` avant `npm run test:securite`.");
}

suite("Aucune clé secrète dans le bundle de production (dist/)", () => {
  const contenu = fichiersTexte(DIST)
    .map((f) => ({ f, txt: readFileSync(f, "utf8") }));

  it("ne contient aucun JWT dont le rôle est service_role", () => {
    const fautifs: string[] = [];
    for (const { f, txt } of contenu) {
      const jwts = txt.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}/g) ?? [];
      for (const j of jwts) {
        const role = decodePayloadJwt(j)?.role;
        if (role && role !== "anon") fautifs.push(`${f}: JWT role=${String(role)}`);
      }
    }
    expect(fautifs, `Secret exposé dans le bundle:\n${fautifs.join("\n")}`).toEqual([]);
  });

  it("ne contient pas de vraie clé service_role/secret Supabase (avec valeur)", () => {
    // On cible une VALEUR (préfixe suivi de caractères), pas le simple littéral
    // « sb_secret_ » présent dans la librairie supabase-js.
    const motifs = [
      /sb_secret_[A-Za-z0-9]{15,}/,          // clé secrète Supabase renseignée
      /service_role["']?\s*[:=]\s*["']eyJ/,   // affectation d'une clé service_role
    ];
    const fautifs: string[] = [];
    for (const { f, txt } of contenu) {
      for (const m of motifs) if (m.test(txt)) fautifs.push(`${f}: ${m}`);
    }
    expect(fautifs, fautifs.join("\n")).toEqual([]);
  });

  it("ne contient aucune clé Resend (re_…)", () => {
    const fautifs = contenu
      .filter(({ txt }) => /\bre_[A-Za-z0-9]{20,}/.test(txt))
      .map(({ f }) => f);
    expect(fautifs, `Clé Resend exposée: ${fautifs.join(", ")}`).toEqual([]);
  });

  it("ne contient aucun secret de signature (clé privée PEM ou clé de chiffrement)", () => {
    const fautifs: string[] = [];
    for (const { f, txt } of contenu) {
      if (/-----BEGIN (?:EC |RSA |)PRIVATE KEY-----/.test(txt)) fautifs.push(`${f}: PEM`);
      if (/SIGNATURE_CHIFFREMENT_CLE\s*[:=]\s*["'][A-Za-z0-9+/=]{20,}/.test(txt))
        fautifs.push(`${f}: cle chiffrement`);
    }
    expect(fautifs, fautifs.join("\n")).toEqual([]);
  });
});
