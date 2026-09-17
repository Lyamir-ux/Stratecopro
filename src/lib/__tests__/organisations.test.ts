import { describe, expect, it } from "vitest";
import { normaliserNomOrganisation, trouverOrganisationParNom } from "../organisations";

const ORGS = [
  { id: "immo4", nom: "Citya Immo 4" },
  { id: "ruhl", nom: "Citya Ruhl Segesca" },
  { id: "immium", nom: "IMMIUM" },
  { id: "laemmel", nom: "IMMIUM Laemmel" },
  { id: "demo", nom: "SYNDIC 3000 GRAND EST" },
];

describe("normaliserNomOrganisation", () => {
  it("ignore casse, accents et espaces multiples", () => {
    expect(normaliserNomOrganisation("  Citya   IMMO 4 ")).toBe("citya immo 4");
    expect(normaliserNomOrganisation("Résidence Été")).toBe("residence ete");
  });
});

describe("trouverOrganisationParNom", () => {
  it("retrouve l'enseigne quelle que soit la casse saisie", () => {
    expect(trouverOrganisationParNom(ORGS, "citya immo 4")?.id).toBe("immo4");
    expect(trouverOrganisationParNom(ORGS, "Immium")?.id).toBe("immium");
    expect(trouverOrganisationParNom(ORGS, "IMMIUM LAEMMEL")?.id).toBe("laemmel");
  });

  it("ne confond pas deux enseignes proches", () => {
    expect(trouverOrganisationParNom(ORGS, "Citya Ruhl Segesca")?.id).toBe("ruhl");
    expect(trouverOrganisationParNom(ORGS, "Citya")).toBeNull();
  });

  it("renvoie null pour un nom vide ou inconnu (le rattachement existant est conservé)", () => {
    expect(trouverOrganisationParNom(ORGS, "")).toBeNull();
    expect(trouverOrganisationParNom(ORGS, null)).toBeNull();
    expect(trouverOrganisationParNom(ORGS, "Foncia Colmar")).toBeNull();
  });
});
