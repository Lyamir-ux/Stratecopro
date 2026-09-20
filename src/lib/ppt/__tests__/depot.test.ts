import { describe, expect, it } from "vitest";
import { TYPES_ANALYSES, TYPES_DEPOT, trouverCopro, typeDevine } from "../depot";

describe("typeDevine", () => {
  it("reconnaît le DPE collectif, le PV d'AG, le tableau et le PPT adopté", () => {
    expect(typeDevine("DPE-collectif-Tilleuls.pdf")).toBe("dpe_collectif");
    expect(typeDevine("PV AG 2026.pdf")).toBe("pv_ag");
    expect(typeDevine("Procès-verbal assemblée.pdf")).toBe("pv_ag");
    expect(typeDevine("Tableau PPT Strat Eco.xlsx")).toBe("tableau_ppt");
    expect(typeDevine("plan.xls")).toBe("tableau_ppt");
    expect(typeDevine("PPT adopté 2025.pdf")).toBe("ppt_adopte");
  });
  it("retombe sur le PPPT par défaut", () => {
    expect(typeDevine("PPPT Résidence Les Tilleuls.pdf")).toBe("pppt");
    expect(typeDevine("rapport.pdf")).toBe("pppt");
    // « ag » n'est reconnu qu'en mot entier : pas dans « village »
    expect(typeDevine("village-vert.pdf")).toBe("pppt");
  });
  it("ne propose que des types connus", () => {
    expect(TYPES_DEPOT).toContain(typeDevine("x.pdf"));
    for (const t of TYPES_ANALYSES) expect(TYPES_DEPOT).toContain(t);
  });
});

describe("trouverCopro", () => {
  const copros = [{ nom: "Résidence Les Tilleuls" }, { nom: "Le Bayard " }];
  it("ignore accents, casse et espaces de bord", () => {
    expect(trouverCopro(copros, "residence les tilleuls")).toBe(copros[0]);
    expect(trouverCopro(copros, "  LE BAYARD")).toBe(copros[1]);
  });
  it("ne renvoie rien pour un nom vide ou inconnu", () => {
    expect(trouverCopro(copros, "")).toBeUndefined();
    expect(trouverCopro(copros, "Anémones")).toBeUndefined();
  });
});
