import { describe, expect, it } from "vitest";
import { adresseConnue, decouperAdressePostale, reponseIdentiteEnquete } from "../adressePostale";

describe("decouperAdressePostale", () => {
  it("découpe une adresse d'import « rue, code postal ville »", () => {
    expect(decouperAdressePostale("9 rue Fabert, 57000 Metz")).toEqual({
      adresse: "9 rue Fabert",
      cp: "57000",
      ville: "Metz",
    });
  });

  it("accepte l'absence de virgule, les espaces multiples et la mention Cedex", () => {
    expect(decouperAdressePostale("  12  rue des Jardins 67200   Strasbourg Cedex 2 ")).toEqual({
      adresse: "12 rue des Jardins",
      cp: "67200",
      ville: "Strasbourg Cedex 2",
    });
  });

  it("garde un numéro de rue à plusieurs chiffres hors du code postal", () => {
    expect(decouperAdressePostale("1234 route de Paris, 68000 Colmar")).toEqual({
      adresse: "1234 route de Paris",
      cp: "68000",
      ville: "Colmar",
    });
  });

  it("sans code postal, tout reste dans la rue", () => {
    expect(decouperAdressePostale("14 Rue des Bonnes Gens")).toEqual({
      adresse: "14 Rue des Bonnes Gens",
      cp: "",
      ville: "",
    });
  });

  it("code postal en tête : la suite devient la rue", () => {
    expect(decouperAdressePostale("57000 Metz, 9 rue Fabert")).toEqual({
      adresse: "Metz, 9 rue Fabert",
      cp: "57000",
      ville: "",
    });
  });

  it("vide ou absente", () => {
    expect(decouperAdressePostale("")).toEqual({ adresse: "", cp: "", ville: "" });
    expect(decouperAdressePostale(null)).toEqual({ adresse: "", cp: "", ville: "" });
    expect(decouperAdressePostale("   ")).toEqual({ adresse: "", cp: "", ville: "" });
  });
});

describe("adresseConnue", () => {
  it("la réponse de l'enquête l'emporte sur l'import", () => {
    expect(adresseConnue("3 rue A, 10000 Troyes", "9 rue Fabert, 57000 Metz")).toEqual({
      texte: "3 rue A, 10000 Troyes",
      source: "enquete",
    });
  });

  it("à défaut, l'adresse de l'import", () => {
    expect(adresseConnue(undefined, "9 rue Fabert, 57000 Metz")).toEqual({
      texte: "9 rue Fabert, 57000 Metz",
      source: "import",
    });
    expect(adresseConnue("  ", "9 rue Fabert, 57000 Metz")?.source).toBe("import");
  });

  it("rien de connu", () => {
    expect(adresseConnue(undefined, null)).toBeNull();
    expect(adresseConnue(42, "")).toBeNull();
  });
});

describe("reponseIdentiteEnquete", () => {
  // forme réelle de enquete_reponses.reponses : les réponses d'identité sont sous « copro »
  const reponses = {
    copro: { adresse: " 3 rue A, 10000 Troyes ", telephone: "06 12 34 56 78", rfr: 12000 },
    lots: { "lot-1": { "nb-habitants": 2 } },
    complet: true,
  };

  it("lit adresse et téléphone sous « copro »", () => {
    expect(reponseIdentiteEnquete(reponses, "adresse")).toBe("3 rue A, 10000 Troyes");
    expect(reponseIdentiteEnquete(reponses, "telephone")).toBe("06 12 34 56 78");
  });

  it("ne lit pas la racine (c'était le défaut de la première version)", () => {
    expect(reponseIdentiteEnquete({ adresse: "3 rue A" }, "adresse")).toBeNull();
  });

  it("réponse absente, vide ou non textuelle", () => {
    expect(reponseIdentiteEnquete(reponses, "email")).toBeNull();
    expect(reponseIdentiteEnquete({ copro: { adresse: "  " } }, "adresse")).toBeNull();
    expect(reponseIdentiteEnquete(reponses, "rfr")).toBeNull();
    expect(reponseIdentiteEnquete(null, "adresse")).toBeNull();
    expect(reponseIdentiteEnquete(undefined, "adresse")).toBeNull();
  });
});
