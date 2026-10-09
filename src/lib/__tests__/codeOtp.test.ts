import { describe, expect, it } from "vitest";
import { extraireCodeOtp } from "../codeOtp";

describe("extraireCodeOtp", () => {
  it("garde la saisie chiffre par chiffre", () => {
    expect(extraireCodeOtp("")).toBe("");
    expect(extraireCodeOtp("12")).toBe("12");
    expect(extraireCodeOtp("123456")).toBe("123456");
  });
  it("ne tronque plus un collage précédé d'un espace ou d'un retour à la ligne (feedback du 09/10/2026)", () => {
    expect(extraireCodeOtp(" 123456")).toBe("123456");
    expect(extraireCodeOtp("\n123456\n")).toBe("123456");
    expect(extraireCodeOtp(" 123456")).toBe("123456");
  });
  it("ignore les séparateurs d'un code collé en deux groupes", () => {
    expect(extraireCodeOtp("123 456")).toBe("123456");
    expect(extraireCodeOtp("123-456")).toBe("123456");
  });
  it("retrouve le code dans une phrase collée depuis l'e-mail", () => {
    expect(extraireCodeOtp("Votre code : 482913")).toBe("482913");
    expect(extraireCodeOtp("Ce code est valable 10 minutes : 482913")).toBe("482913");
  });
  it("s'arrête à 6 chiffres quand on tape un chiffre de trop", () => {
    expect(extraireCodeOtp("1234567")).toBe("123456");
  });
});
