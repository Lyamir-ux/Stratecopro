import { describe, expect, it } from "vitest";
import { espaceEffectif, lireEspace } from "@/lib/espaceConnexion";

describe("espaceEffectif", () => {
  const moi = "u-1";

  it("compte AMO connecté par la tuile Copropriétaire : traité en copropriétaire", () => {
    expect(espaceEffectif("amo", moi, { userId: moi, espace: "copro" })).toBe("copro");
  });

  it("compte AMO connecté par la tuile AMO, ou sans choix mémorisé : espace AMO (aperçu des autres espaces)", () => {
    expect(espaceEffectif("amo", moi, { userId: moi, espace: "amo" })).toBe("amo");
    expect(espaceEffectif("amo", moi, null)).toBe("amo");
  });

  it("les tuiles Syndic et MOE ne changent pas l'espace d'un compte AMO", () => {
    expect(espaceEffectif("amo", moi, { userId: moi, espace: "syndic" })).toBe("amo");
    expect(espaceEffectif("amo", moi, { userId: moi, espace: "presta" })).toBe("amo");
  });

  it("le choix d'un autre compte du même navigateur ne s'applique pas", () => {
    expect(espaceEffectif("amo", moi, { userId: "u-2", espace: "copro" })).toBe("amo");
    expect(espaceEffectif("amo", null, { userId: moi, espace: "copro" })).toBe("amo");
  });

  it("les autres comptes restent dans l'espace de leur rôle, quelle que soit la tuile", () => {
    expect(espaceEffectif("syndic", moi, { userId: moi, espace: "copro" })).toBe("syndic");
    expect(espaceEffectif("copro", moi, { userId: moi, espace: "amo" })).toBe("copro");
    expect(espaceEffectif("presta", moi, null)).toBe("presta");
  });

  it("sans profil : pas d'espace", () => {
    expect(espaceEffectif(null, moi, { userId: moi, espace: "copro" })).toBeNull();
    expect(espaceEffectif(undefined, moi, null)).toBeNull();
  });
});

describe("lireEspace", () => {
  it("relit un choix enregistré", () => {
    expect(lireEspace(JSON.stringify({ userId: "u-1", espace: "copro" }))).toEqual({ userId: "u-1", espace: "copro" });
  });

  it("valeur absente, illisible ou incomplète : aucun choix", () => {
    expect(lireEspace(null)).toBeNull();
    expect(lireEspace("")).toBeNull();
    expect(lireEspace("{pas du json")).toBeNull();
    expect(lireEspace("null")).toBeNull();
    expect(lireEspace(JSON.stringify({ espace: "copro" }))).toBeNull();
    expect(lireEspace(JSON.stringify({ userId: "u-1", espace: "admin" }))).toBeNull();
  });
});
