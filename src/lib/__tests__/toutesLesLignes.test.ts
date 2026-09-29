// Lecture par pages (bug Amir 29/09) : l'API Supabase tronque à 1 000 lignes
// sans erreur ; les 1 580 jalons d'honoraires en perdaient 580.
import { beforeAll, describe, expect, it, vi } from "vitest";

let toutesLesLignes: typeof import("@/lib/supabase").toutesLesLignes;
let LIGNES_PAR_PAGE: number;

beforeAll(async () => {
  vi.stubEnv("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL || "http://localhost:54321");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", import.meta.env.VITE_SUPABASE_ANON_KEY || "cle-de-test");
  ({ toutesLesLignes, LIGNES_PAR_PAGE } = await import("@/lib/supabase"));
});

/** Table simulée : renvoie au plus 1 000 lignes par appel, comme l'API. */
function table(n: number) {
  const lignes = Array.from({ length: n }, (_, i) => i);
  const appels: [number, number][] = [];
  const page = async (debut: number, fin: number) => {
    appels.push([debut, fin]);
    return { data: lignes.slice(debut, Math.min(fin + 1, debut + LIGNES_PAR_PAGE)), error: null };
  };
  return { page, appels };
}

describe("toutesLesLignes", () => {
  it("lit les 1 580 lignes en deux pages, sans en sauter ni en doubler", async () => {
    const { page, appels } = table(1580);
    const r = await toutesLesLignes(page);
    expect(r).toHaveLength(1580);
    expect(new Set(r).size).toBe(1580);
    expect(appels).toEqual([[0, 999], [1000, 1999]]);
  });

  it("relit une page vide quand le total tombe pile sur 1 000", async () => {
    const { page, appels } = table(1000);
    expect(await toutesLesLignes(page)).toHaveLength(1000);
    expect(appels).toHaveLength(2);
  });

  it("s'arrête à la première page d'une petite table", async () => {
    const { page, appels } = table(12);
    expect(await toutesLesLignes(page)).toHaveLength(12);
    expect(appels).toHaveLength(1);
  });

  it("remonte l'erreur de l'API", async () => {
    const erreur = { message: "permission denied", code: "42501" };
    await expect(toutesLesLignes(async () => ({ data: null, error: erreur }))).rejects.toBe(erreur);
  });
});
