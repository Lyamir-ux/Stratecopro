import { describe, expect, it } from "vitest";
import { determineProfil } from "../profil";
import { BAREME_2024_HORS_IDF as B } from "../bareme2024";
import { BAREME_2026_HORS_IDF, BAREME_2026_IDF } from "../bareme2026";

describe("determineProfil — barème 2024 hors IDF", () => {
  it("seuils exacts pour 1 personne (bornes incluses)", () => {
    expect(determineProfil(1, 17173, B)).toBe("Bleu");
    expect(determineProfil(1, 17174, B)).toBe("Jaune");
    expect(determineProfil(1, 22015, B)).toBe("Jaune");
    expect(determineProfil(1, 22016, B)).toBe("Violet");
    expect(determineProfil(1, 30844, B)).toBe("Violet");
    expect(determineProfil(1, 30845, B)).toBe("Rose");
  });

  it("foyer de 4 personnes", () => {
    expect(determineProfil(4, 35285, B)).toBe("Bleu");
    expect(determineProfil(4, 45234, B)).toBe("Jaune");
    expect(determineProfil(4, 63844, B)).toBe("Violet");
    expect(determineProfil(4, 63845, B)).toBe("Rose");
  });

  it("foyer > 5 personnes : extrapolation par personne supplémentaire", () => {
    // 7 personnes = seuils 5 pers. + 2 × parPers
    expect(determineProfil(7, 40388 + 2 * 5094, B)).toBe("Bleu");
    expect(determineProfil(7, 40388 + 2 * 5094 + 1, B)).toBe("Jaune");
    expect(determineProfil(7, 73098 + 2 * 9254, B)).toBe("Violet");
    expect(determineProfil(7, 73098 + 2 * 9254 + 1, B)).toBe("Rose");
  });

  it("nombre de personnes dégénéré (0, négatif, décimal) → traité comme 1", () => {
    expect(determineProfil(0, 17000, B)).toBe("Bleu");
    expect(determineProfil(-3, 17000, B)).toBe("Bleu");
    expect(determineProfil(1.9, 17173, B)).toBe("Bleu"); // tronqué à 1
  });

  it("RFR nul ou négatif → Bleu", () => {
    expect(determineProfil(2, 0, B)).toBe("Bleu");
  });
});

describe("determineProfil — barème Anah 2026", () => {
  it("hors Île-de-France : bornes exactes pour 1 personne", () => {
    const b = BAREME_2026_HORS_IDF;
    expect(determineProfil(1, 17363, b)).toBe("Bleu");
    expect(determineProfil(1, 17364, b)).toBe("Jaune");
    expect(determineProfil(1, 22259, b)).toBe("Jaune");
    expect(determineProfil(1, 22260, b)).toBe("Violet");
    expect(determineProfil(1, 31185, b)).toBe("Violet");
    expect(determineProfil(1, 31186, b)).toBe("Rose");
  });

  it("hors Île-de-France : foyer de 5 personnes et extrapolation à 6", () => {
    const b = BAREME_2026_HORS_IDF;
    expect(determineProfil(5, 40835, b)).toBe("Bleu");
    expect(determineProfil(5, 52348, b)).toBe("Jaune");
    expect(determineProfil(5, 73907, b)).toBe("Violet");
    expect(determineProfil(6, 40835 + 5151, b)).toBe("Bleu");
    expect(determineProfil(6, 73907 + 9357 + 1, b)).toBe("Rose");
  });

  it("Île-de-France : bornes exactes pour 2 personnes", () => {
    const b = BAREME_2026_IDF;
    expect(determineProfil(2, 35270, b)).toBe("Bleu");
    expect(determineProfil(2, 42933, b)).toBe("Jaune");
    expect(determineProfil(2, 60051, b)).toBe("Violet");
    expect(determineProfil(2, 60052, b)).toBe("Rose");
  });
});
