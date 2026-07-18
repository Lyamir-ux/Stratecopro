import { describe, expect, it } from "vitest";
import { buildRows, checkTotals, guessMapping, parseFrNumber, parseUsage } from "../importLots";

describe("parseFrNumber — formats français", () => {
  it("gère espaces, virgules et points de milliers", () => {
    expect(parseFrNumber("1 234,56")).toBe(1234.56);
    expect(parseFrNumber("1.234,56")).toBe(1234.56);
    expect(parseFrNumber("52")).toBe(52);
    expect(parseFrNumber(47.5)).toBe(47.5);
  });
  it("rejette les valeurs non numériques", () => {
    expect(parseFrNumber("abc")).toBeNull();
    expect(parseFrNumber("")).toBeNull();
    expect(parseFrNumber(null)).toBeNull();
  });
});

describe("parseUsage", () => {
  it("classe les usages courants", () => {
    expect(parseUsage("Appartement T3")).toBe("habitation");
    expect(parseUsage("PARKING")).toBe("garage");
    expect(parseUsage("cave")).toBe("caves");
    expect(parseUsage("local commercial")).toBe("autres");
    expect(parseUsage("")).toBe("habitation");
  });
});

describe("guessMapping", () => {
  it("détecte les colonnes usuelles", () => {
    expect(guessMapping(["N° lot", "Bâtiment", "Propriétaire", "Usage", "Tantièmes MUN", "Tantièmes escalier"])).toEqual(
      ["num", "batiment", "coproprietaire", "usage", "tan_mun", "tan_esc"]
    );
  });
  it("ne mappe jamais deux colonnes sur le même rôle", () => {
    const m = guessMapping(["Lot", "Numéro"]);
    expect(m.filter((r) => r === "num")).toHaveLength(1);
  });
});

describe("buildRows", () => {
  const mapping = guessMapping(["N° lot", "Bâtiment", "Propriétaire", "Usage", "Tantièmes MUN"]);
  it("construit les lignes valides et signale les erreurs ligne à ligne", () => {
    const { rows, errors } = buildRows(
      [
        ["1", "A", "Copropriétaire 1", "Appartement", "520,5"],
        ["", "A", "X", "cave", "10"],
        ["2", "A", "Copropriétaire 2", "garage", "abc"],
        ["3", "B", "Copropriétaire 3", "", "479,5"],
        ["3", "B", "Doublon", "", "1"],
        [null, null, null, null, null],
      ],
      mapping
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ num: "1", batiment: "A", usage: "habitation", tantiemes: { MUN: 520.5 } });
    expect(rows[1]).toMatchObject({ num: "3", usage: "habitation", tantiemes: { MUN: 479.5 } });
    expect(errors.map((e) => e.line)).toEqual([2, 3, 5]);
  });
});

describe("checkTotals", () => {
  it("valide une clé MUN à 1000 ‰ (tolérance ±1)", () => {
    expect(checkTotals([{ num: "1", batiment: null, coproprietaire: null, usage: "habitation", tantiemes: { MUN: 999.5 } }])).toBeNull();
  });
  it("signale un écart", () => {
    expect(checkTotals([{ num: "1", batiment: null, coproprietaire: null, usage: "habitation", tantiemes: { MUN: 900 } }])).toContain("900");
  });
});
