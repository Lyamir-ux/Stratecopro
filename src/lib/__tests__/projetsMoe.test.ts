import { describe, expect, it } from "vitest";
import { filtrerProjetsMoe } from "../projetsMoe";

const p = (name: string, adresse: string | null, city: string | null, phase: string, code_postal: string | null = null) => ({
  copro: { name, adresse, city, code_postal, phase },
});

const LISTE = [
  p("LE CHURCHILL", "12 rue Winston Churchill", "Strasbourg", "etudes", "67000"),
  p("Résidence Les Érables", "3 avenue de l'Église", "Colmar", "travaux", "68000"),
  p("ARMORIAL", "1-3 rue de l'Armorial", "Schiltigheim", "diagnostic"),
  p("Le Rodin", null, null, "etudes"),
];

describe("filtrerProjetsMoe", () => {
  it("recherche vide : tous les projets", () => {
    expect(filtrerProjetsMoe(LISTE, "  ")).toHaveLength(4);
  });

  it("par nom de copropriété, sans accents ni majuscules", () => {
    expect(filtrerProjetsMoe(LISTE, "erables").map((x) => x.copro.name)).toEqual(["Résidence Les Érables"]);
    expect(filtrerProjetsMoe(LISTE, "rodin").map((x) => x.copro.name)).toEqual(["Le Rodin"]);
  });

  it("par rue, ville ou code postal", () => {
    expect(filtrerProjetsMoe(LISTE, "Église").map((x) => x.copro.name)).toEqual(["Résidence Les Érables"]);
    expect(filtrerProjetsMoe(LISTE, "schiltigheim").map((x) => x.copro.name)).toEqual(["ARMORIAL"]);
    expect(filtrerProjetsMoe(LISTE, "67000").map((x) => x.copro.name)).toEqual(["LE CHURCHILL"]);
  });

  it("plusieurs mots : tous doivent figurer, dans n'importe quel ordre", () => {
    expect(filtrerProjetsMoe(LISTE, "churchill rue").map((x) => x.copro.name)).toEqual(["LE CHURCHILL"]);
    expect(filtrerProjetsMoe(LISTE, "rue colmar")).toHaveLength(0);
  });

  it("filtre de phase, seul ou avec la recherche", () => {
    expect(filtrerProjetsMoe(LISTE, "", "etudes").map((x) => x.copro.name)).toEqual(["LE CHURCHILL", "Le Rodin"]);
    expect(filtrerProjetsMoe(LISTE, "rodin", "travaux")).toHaveLength(0);
  });
});
