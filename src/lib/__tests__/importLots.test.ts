import { describe, expect, it } from "vitest";
import { buildRows, cleCodeFromHeader, guessMapping, parseFrNumber, parseUsage, tantiemeColumns } from "../importLots";

describe("parseFrNumber - formats français", () => {
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
    expect(parseUsage("local commercial")).toBe("commerces");
    expect(parseUsage("Boutique")).toBe("commerces");
    expect(parseUsage("Bureaux")).toBe("bureaux");
    expect(parseUsage("grenier")).toBe("autres");
    expect(parseUsage("")).toBe("habitation");
  });
});

describe("guessMapping", () => {
  it("détecte les colonnes usuelles, dont plusieurs colonnes de tantièmes", () => {
    expect(
      guessMapping(["N° lot", "Bâtiment", "Propriétaire", "Usage", "Tantièmes MUN", "Charges escalier"])
    ).toEqual(["num", "batiment", "coproprietaire", "usage", "tantiemes", "tantiemes"]);
  });
  it("détecte les colonnes de contact", () => {
    expect(guessMapping(["Lot", "Nom", "Adresse mail", "Téléphone", "Adresse postale"])).toEqual([
      "num",
      "coproprietaire",
      "email",
      "telephone",
      "adresse",
    ]);
  });
  it("ne mappe jamais deux colonnes sur le même rôle (hors tantièmes)", () => {
    const m = guessMapping(["Lot", "Numéro"]);
    expect(m.filter((r) => r === "num")).toHaveLength(1);
  });
});

describe("tantiemeColumns - clés reprises de l'en-tête du fichier", () => {
  it("reprend l'en-tête tel quel comme code de clé", () => {
    const headers = ["Lot", "Tantièmes généraux", "Charges ascenseur"];
    const cols = tantiemeColumns(["num", "tantiemes", "tantiemes"], headers);
    expect(cols).toEqual([
      { index: 1, code: "Tantièmes généraux" },
      { index: 2, code: "Charges ascenseur" },
    ]);
  });
  it("nomme les colonnes sans en-tête par leur position", () => {
    expect(cleCodeFromHeader("  ", 3)).toBe("Colonne 4");
  });
});

describe("buildRows", () => {
  const headers = ["N° lot", "Bâtiment", "Propriétaire", "Usage", "Tantièmes généraux"];
  const mapping = guessMapping(headers);
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
      mapping,
      headers
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      num: "1",
      batiment: "A",
      usage: "habitation",
      tantiemes: { "Tantièmes généraux": 520.5 },
    });
    expect(rows[1]).toMatchObject({ num: "3", usage: "habitation", tantiemes: { "Tantièmes généraux": 479.5 } });
    expect(errors.map((e) => e.line)).toEqual([2, 3, 5]);
  });
  it("n'impose aucune somme : 10 000, 1 000 ou n'importe quel total est accepté", () => {
    const { rows, errors } = buildRows(
      [
        ["1", "A", "C1", "", "8000"],
        ["2", "A", "C2", "", "2000"],
      ],
      mapping,
      headers
    );
    expect(errors).toHaveLength(0);
    expect(rows.reduce((a, r) => a + (r.tantiemes["Tantièmes généraux"] ?? 0), 0)).toBe(10000);
  });
  it("reprend email, téléphone et adresse du copropriétaire", () => {
    const h = ["Lot", "Nom", "Adresse mail", "Téléphone", "Adresse postale"];
    const m = guessMapping(h);
    const { rows } = buildRows([["1", "Dupont", "d@ex.fr", "06 01 02 03 04", "1 rue A, Strasbourg"]], m, h);
    expect(rows[0]).toMatchObject({
      coproprietaire: "Dupont",
      email: "d@ex.fr",
      telephone: "06 01 02 03 04",
      adresse: "1 rue A, Strasbourg",
    });
  });
});
