import { describe, expect, it } from "vitest";
import { determineProfil } from "../profil";
import { BAREME_2024_HORS_IDF as B } from "../bareme2024";

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
