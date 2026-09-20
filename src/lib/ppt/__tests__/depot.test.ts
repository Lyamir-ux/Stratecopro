import { describe, expect, it } from "vitest";
import { TYPES_ANALYSES, TYPES_DEPOT, cheminDepot, coproEnNomFichier, nomPourCopro, trouverCopro, typeDevine } from "../depot";

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

describe("correction d'un dépôt", () => {
  it("met le nom de la copropriété en nom de fichier", () => {
    expect(coproEnNomFichier("Porte du Soleil")).toBe("PorteDuSoleil");
    expect(coproEnNomFichier("Résidence Les Tilleuls")).toBe("ResidenceLesTilleuls");
    expect(coproEnNomFichier("1-3 rue de Barcelone")).toBe("13RueDeBarcelone");
    expect(coproEnNomFichier("   ")).toBe("");
  });

  it("propose un nom de fichier pour la copropriété d'arrivée, extension conservée", () => {
    expect(nomPourCopro("PPT_LaPorteDuSoleil_2026.xlsx", "Résidence Les Tilleuls", "tableau_ppt", "2026")).toBe("PPT_ResidenceLesTilleuls_2026.xlsx");
    expect(nomPourCopro("rapport.pdf", "Porte du Soleil", "pppt", 2025)).toBe("PPPT_PorteDuSoleil_2025.pdf");
    expect(nomPourCopro("scan", "Porte du Soleil", "pv_ag", null)).toBe("PV_AG_PorteDuSoleil");
  });

  it("construit le chemin de stockage attendu par les policies", () => {
    const chemin = cheminDepot("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "PPPT Les Tilleuls.pdf", 1700000000000);
    expect(chemin).toBe("11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/1700000000000-PPPT_Les_Tilleuls.pdf");
  });
});
