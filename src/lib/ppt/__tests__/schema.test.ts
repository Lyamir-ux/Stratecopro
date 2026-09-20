import { describe, expect, it } from "vitest";
import { PRIORITES, PRIORITE_LABEL, codePriorite } from "../schema";
import { articleSuggere } from "../referentiels";

describe("codePriorite", () => {
  it("reconnaît les cinq natures, accents et casse ignorés", () => {
    expect(codePriorite("Préservation")).toBe("preservation");
    expect(codePriorite("Performance énergétique")).toBe("energetique");
    expect(codePriorite("Amélioration")).toBe("amelioration");
    expect(codePriorite("Sécurité")).toBe("securite");
    expect(codePriorite("securite")).toBe("securite");
    expect(codePriorite("Santé")).toBe("sante");
    expect(codePriorite(null)).toBe("preservation");
  });
  it("a un libellé pour chaque nature", () => {
    for (const p of PRIORITES) expect(PRIORITE_LABEL[p]).toBeTruthy();
  });
});

describe("articleSuggere", () => {
  it("art. 24 pour conservation, sécurité et santé ; art. 25 sinon", () => {
    expect(articleSuggere("preservation")).toBe("24");
    expect(articleSuggere("securite")).toBe("24");
    expect(articleSuggere("sante")).toBe("24");
    expect(articleSuggere("energetique")).toBe("25");
    expect(articleSuggere("amelioration")).toBe("25");
  });
});
