import { describe, expect, it } from "vitest";
import {
  buildRows,
  cleBatiment,
  cleCodeFromHeader,
  codeBatimentImporte,
  guessMapping,
  parseFrNumber,
  parseUsage,
  rapprocherBatiments,
  tantiemeColumns,
  type BatimentDossier,
} from "../importLots";

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

describe("rapprochement des bâtiments (bug du 29/09, 317 avenue de Colmar)", () => {
  const bat = (id: string, code: string, declare_creation: boolean, autresLots = 0): BatimentDossier => ({
    id,
    code,
    declare_creation,
    autresLots,
  });

  it("« 1 », « 01 », « Bât. 1 » et « BAT.01 » désignent le même bâtiment", () => {
    for (const v of ["1", "01", "001", "Bât. 1", "BAT.01", "bâtiment 1", "Entrée 1"]) expect(cleBatiment(v)).toBe("1");
    expect(cleBatiment("Bât. A")).toBe("a");
    expect(cleBatiment("principal")).toBe("principal");
    expect(cleBatiment("Bâtiment")).toBe("batiment");
  });

  it("crée les bâtiments au format du dossier, sans préfixe", () => {
    expect(codeBatimentImporte("1")).toBe("01");
    expect(codeBatimentImporte("Bât. 3")).toBe("03");
    expect(codeBatimentImporte("Bâtiment A")).toBe("A");
    expect(codeBatimentImporte("principal")).toBe("principal");
  });

  it("range le bâtiment « 1 » du fichier dans le « 01 » déclaré à la création", () => {
    const r = rapprocherBatiments(["1", "1", null], [bat("b01", "01", true)]);
    expect(r.existants.get("1")).toBe("b01");
    expect(r.aCreer.size).toBe(0);
    expect(r.parDefaut).toBe("b01");
  });

  it("dossier à bâtiment unique : un autre nom ou pas de colonne bâtiment vont dans ce bâtiment", () => {
    // Armorial : « principal » ; ANDROMEDE / MEINAU : fichier sans bâtiment
    expect(rapprocherBatiments(["principal"], [bat("b01", "01", true)]).existants.get("principal")).toBe("b01");
    expect(rapprocherBatiments([null, null], [bat("b01", "01", true)]).parDefaut).toBe("b01");
    // réimport après le bug : le « 1 » créé par l'import précédent est délaissé pour le déclaré
    const r = rapprocherBatiments(["1"], [bat("b01", "01", true), bat("b1", "1", false)]);
    expect(r.existants.get("1")).toBe("b01");
  });

  it("ne fusionne pas un nouveau bâtiment dans l'unique bâtiment qui porte déjà d'autres lots", () => {
    const r = rapprocherBatiments(["B"], [bat("b01", "01", true, 12)]);
    expect(r.existants.size).toBe(0);
    expect(r.aCreer.get("B")).toBe("B");
    expect(r.parDefaut).toBeNull();
  });

  it("plusieurs bâtiments déclarés : rapprochement par clé, les inconnus sont créés, un code par clé", () => {
    const r = rapprocherBatiments(
      ["1", "Bât. 2", "3", "03", null],
      [bat("b01", "01", true), bat("b02", "02", true)]
    );
    expect(r.existants.get("1")).toBe("b01");
    expect(r.existants.get("Bât. 2")).toBe("b02");
    expect(r.aCreer.get("3")).toBe("03");
    expect(r.aCreer.get("03")).toBe("03");
    expect(r.parDefaut).toBeNull();
  });
});
