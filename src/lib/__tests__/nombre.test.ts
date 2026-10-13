import { describe, expect, it } from "vitest";
import { formaterNombreSaisi, lireNombreSaisi, nettoyerSaisieNombre } from "../nombre";

describe("lireNombreSaisi", () => {
  it("le point est accepté comme la virgule (bug du 13/10/2026)", () => {
    expect(lireNombreSaisi("12.5")).toBe(12.5);
    expect(lireNombreSaisi("12,5")).toBe(12.5);
    expect(lireNombreSaisi("0.05")).toBe(0.05);
    expect(lireNombreSaisi(",5")).toBe(0.5);
    expect(lireNombreSaisi(".5")).toBe(0.5);
  });

  it("entiers, signes et séparateurs de milliers", () => {
    expect(lireNombreSaisi("15000")).toBe(15000);
    expect(lireNombreSaisi("15 000")).toBe(15000);
    expect(lireNombreSaisi("15\u00a0000,25")).toBe(15000.25);
    expect(lireNombreSaisi("1.234,56")).toBe(1234.56);
    expect(lireNombreSaisi("-3,2")).toBe(-3.2);
    expect(lireNombreSaisi("\u22123")).toBe(-3);
  });

  it("frappe en cours : un séparateur final est lu, un signe seul ne l'est pas encore", () => {
    expect(lireNombreSaisi("12,")).toBe(12);
    expect(lireNombreSaisi("12.")).toBe(12);
    expect(lireNombreSaisi("-")).toBeNull();
    expect(lireNombreSaisi(",")).toBeNull();
    expect(lireNombreSaisi("")).toBeNull();
    expect(lireNombreSaisi("   ")).toBeNull();
  });

  it("refuse ce qui n'est pas un nombre", () => {
    expect(lireNombreSaisi("12,5,3")).toBeNull();
    expect(lireNombreSaisi("1.2.3")).toBeNull();
    expect(lireNombreSaisi("abc")).toBeNull();
    expect(lireNombreSaisi("12 €")).toBeNull();
  });
});

describe("formaterNombreSaisi", () => {
  it("virgule décimale, sans milliers ni bruit de virgule flottante", () => {
    expect(formaterNombreSaisi(12.5)).toBe("12,5");
    expect(formaterNombreSaisi(15000)).toBe("15000");
    expect(formaterNombreSaisi(0.1 + 0.2)).toBe("0,3");
    expect(formaterNombreSaisi(0)).toBe("0");
  });

  it("vide pour une valeur absente ou non finie", () => {
    expect(formaterNombreSaisi(undefined)).toBe("");
    expect(formaterNombreSaisi(null)).toBe("");
    expect(formaterNombreSaisi(Number.NaN)).toBe("");
  });

  it("un nombre affiché se relit à l'identique", () => {
    for (const n of [0, 12.5, 15000, 1234.56, -3.2]) expect(lireNombreSaisi(formaterNombreSaisi(n))).toBe(n);
  });
});

describe("nettoyerSaisieNombre", () => {
  it("laisse passer chiffres, séparateurs et signe", () => {
    expect(nettoyerSaisieNombre("1 234,5")).toBe("1 234,5");
    expect(nettoyerSaisieNombre("-12.5")).toBe("-12.5");
    expect(nettoyerSaisieNombre("")).toBe("");
  });

  it("retire lettres et symboles, y compris dans un texte collé", () => {
    expect(nettoyerSaisieNombre("12a")).toBe("12");
    expect(nettoyerSaisieNombre("12e3")).toBe("123");
    expect(nettoyerSaisieNombre("abc0,5x")).toBe("0,5");
    expect(nettoyerSaisieNombre("12 500 €")).toBe("12 500 ");
  });
});
