import { describe, expect, it } from "vitest";
import { appelsDepuisInscrits } from "../syndic";

// Appels de fonds inscrits (RPC appels_de_fonds_syndic) : la table par
// copropriétaire garde les montants au centime (banque / appel du syndic).
describe("appelsDepuisInscrits", () => {
  it("indexe l'appel et la prime CEE par copropriétaire, arrondis au centime", () => {
    const m = appelsDepuisInscrits([
      { coproprietaire_id: "a", appel: 11637.45, prime_cee: 1942.5, source: "pf" },
      { coproprietaire_id: "b", appel: 8059.049999, prime_cee: 0, source: "appel_syndic" },
    ]);
    expect(m.get("a")).toEqual({ appel: 11637.45, primeCee: 1942.5 });
    expect(m.get("b")).toEqual({ appel: 8059.05, primeCee: 0 });
    expect(m.has("c")).toBe(false);
  });
  it("rend une table vide sans montant inscrit", () => {
    expect(appelsDepuisInscrits([]).size).toBe(0);
  });
});
