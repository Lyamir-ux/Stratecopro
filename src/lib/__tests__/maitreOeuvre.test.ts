import { describe, expect, it } from "vitest";
import { moeCite, nomMoeNormalise, resoudreMaitreOeuvre } from "../maitreOeuvre";

const fiches = [{ raison_sociale: "AMC" }, { raison_sociale: "Ingedair" }, { raison_sociale: "CNB.archi" }, { raison_sociale: "Frög architecture" }];

describe("correspondance maître d'œuvre ↔ fiches (règle SQL moe_cite, 0120)", () => {
  it("normalise comme nom_moe_normalise", () => {
    expect(nomMoeNormalise("  CNB.archi ")).toBe("cnb archi");
    expect(nomMoeNormalise("Frög  architecture")).toBe("frög architecture");
  });

  it("cite en mots entiers seulement", () => {
    expect(moeCite("AMC sous-traitant Ingedair", "AMC")).toBe(true);
    expect(moeCite("AMC sous-traitant Ingedair", "Ingedair")).toBe(true);
    expect(moeCite("AMCO", "AMC")).toBe(false);
    expect(moeCite(null, "AMC")).toBe(false);
  });
});

describe("nouveau maître d'œuvre (bug d'Amir du 01/10/2026)", () => {
  it("crée une fiche pour un nom inconnu", () => {
    expect(resoudreMaitreOeuvre("Pierre  Baumann", fiches)).toEqual({ nom: "Pierre Baumann", fiche: null, ficheACreer: true });
  });

  it("reprend la fiche du même nom, casse et accents ignorés", () => {
    expect(resoudreMaitreOeuvre("frog ARCHITECTURE", fiches)).toEqual({
      nom: "Frög architecture",
      fiche: { raison_sociale: "Frög architecture" },
      ficheACreer: false,
    });
  });

  it("ne crée rien pour un champ qui cite déjà des fiches, sauf choix explicite « Nouveau »", () => {
    expect(resoudreMaitreOeuvre("AMC sous-traitant Ingedair", fiches).ficheACreer).toBe(false);
    expect(resoudreMaitreOeuvre("AMC sous-traitant Ingedair", fiches, { citationSuffit: false }).ficheACreer).toBe(true);
    expect(resoudreMaitreOeuvre("  ", fiches)).toEqual({ nom: "", fiche: null, ficheACreer: false });
  });
});
