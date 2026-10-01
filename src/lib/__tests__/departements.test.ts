import { describe, expect, it } from "vitest";
import {
  DEPARTEMENTS,
  codePostalDans,
  couvreDepartement,
  departementConsultation,
  departementDuCodePostal,
  entrepriseConsultee,
  resumeDepartements,
  trierDepartements,
} from "../departements";

describe("DEPARTEMENTS", () => {
  it("compte les 101 départements, sans doublon, aux codes acceptés par la base (0122)", () => {
    expect(DEPARTEMENTS).toHaveLength(101);
    expect(new Set(DEPARTEMENTS.map((d) => d.code)).size).toBe(101);
    const regleSql = /^(0[1-9]|1[0-9]|2[1-9]|2A|2B|[3-8][0-9]|9[0-5]|97[1-6])$/;
    for (const d of DEPARTEMENTS) expect(d.code).toMatch(regleSql);
  });
});

describe("departementDuCodePostal", () => {
  it("prend les deux premiers chiffres", () => {
    expect(departementDuCodePostal("67000")).toBe("67");
    expect(departementDuCodePostal("68100")).toBe("68");
    expect(departementDuCodePostal("01000")).toBe("01");
    expect(departementDuCodePostal(" 57 000 ")).toBe("57");
  });
  it("distingue la Corse-du-Sud et la Haute-Corse", () => {
    expect(departementDuCodePostal("20000")).toBe("2A");
    expect(departementDuCodePostal("20167")).toBe("2A");
    expect(departementDuCodePostal("20200")).toBe("2B");
    expect(departementDuCodePostal("20600")).toBe("2B");
  });
  it("garde trois chiffres outre-mer", () => {
    expect(departementDuCodePostal("97400")).toBe("974");
    expect(departementDuCodePostal("97600")).toBe("976");
  });
  it("refuse ce qui n'est pas un code postal", () => {
    expect(departementDuCodePostal(null)).toBeNull();
    expect(departementDuCodePostal("")).toBeNull();
    expect(departementDuCodePostal("6700")).toBeNull();
    expect(departementDuCodePostal("Strasbourg")).toBeNull();
    expect(departementDuCodePostal("00100")).toBeNull();
    expect(departementDuCodePostal("97500")).toBeNull();
  });
});

describe("codePostalDans", () => {
  it("trouve le code postal d'une ville ou d'une adresse", () => {
    expect(codePostalDans("67000 Strasbourg")).toBe("67000");
    expect(codePostalDans("3 rue du Rhin, 68100 Mulhouse")).toBe("68100");
    expect(codePostalDans("F-57000 Metz")).toBe("57000");
  });
  it("ignore un nombre plus long et l'absence de code", () => {
    expect(codePostalDans("Strasbourg")).toBeNull();
    expect(codePostalDans("SIRET 12345678900012")).toBeNull();
    expect(codePostalDans(null)).toBeNull();
  });
});

describe("departementConsultation", () => {
  it("lit d'abord le code postal de la copropriété", () => {
    expect(departementConsultation({ copro: { code_postal: "54000" }, copro_externe_ville: "67000 Strasbourg" })).toBe("54");
  });
  it("se replie sur la ville puis l'adresse d'une copropriété hors plateforme (consultation PPPT : « CP commune »)", () => {
    expect(departementConsultation({ copro: null, copro_externe_ville: "67200 Strasbourg" })).toBe("67");
    expect(departementConsultation({ copro_externe_ville: "Colmar", copro_externe_adresse: "2 rue X 68000 Colmar" })).toBe("68");
  });
  it("renvoie null quand rien ne situe la copropriété", () => {
    expect(departementConsultation({ copro: { code_postal: null }, copro_externe_ville: "Strasbourg" })).toBeNull();
  });
});

describe("couvreDepartement et entrepriseConsultee", () => {
  const presta = { types: ["moe", "be"], departements: ["67", "68"], ne_pas_consulter: false };
  it("liste vide = toute la France, département inconnu = consultée", () => {
    expect(couvreDepartement([], "75")).toBe(true);
    expect(couvreDepartement(["67"], null)).toBe(true);
    expect(couvreDepartement(["67"], "57")).toBe(false);
  });
  it("demande la prestation, le département et l'absence de « Ne pas consulter »", () => {
    expect(entrepriseConsultee(presta, "moe", "67")).toBe(true);
    expect(entrepriseConsultee(presta, "diag", "67")).toBe(false);
    expect(entrepriseConsultee(presta, "moe", "57")).toBe(false);
    expect(entrepriseConsultee(presta, "be", null)).toBe(true);
    expect(entrepriseConsultee({ ...presta, ne_pas_consulter: true }, "moe", "67")).toBe(false);
  });
});

describe("trierDepartements et resumeDepartements", () => {
  it("trie dans l'ordre officiel, dédoublonne et retire l'inconnu", () => {
    expect(trierDepartements(["68", "2B", "67", "21", "2A", "68", "zz"])).toEqual(["2A", "2B", "21", "67", "68"]);
  });
  it("résume la liste", () => {
    expect(resumeDepartements([])).toBe("Toute la France");
    expect(resumeDepartements(["68", "57", "67"])).toBe("57 · 67 · 68");
  });
});
