import { describe, expect, it } from "vitest";
import {
  adresseConnue,
  adresseDeLEnquete,
  adresseEnqueteSeparee,
  decouperAdressePostale,
  reponseIdentiteEnquete,
} from "../adressePostale";

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
    expect(adresseConnue({ adresse: "3 rue A", cp: "10000", ville: "Troyes" }, "9 rue Fabert, 57000 Metz")).toEqual({
      adresse: "3 rue A",
      cp: "10000",
      ville: "Troyes",
      source: "enquete",
    });
  });

  it("à défaut, l'adresse de l'import, découpée", () => {
    expect(adresseConnue(null, "9 rue Fabert, 57000 Metz")).toEqual({
      adresse: "9 rue Fabert",
      cp: "57000",
      ville: "Metz",
      source: "import",
    });
  });

  it("rien de connu", () => {
    expect(adresseConnue(null, null)).toBeNull();
    expect(adresseConnue(null, "  ")).toBeNull();
  });
});

describe("adresseDeLEnquete : rue, code postal et ville (11/10/2026)", () => {
  it("lit les trois questions", () => {
    const reponses = { copro: { adresse: "8 allée de la Houblonnière", "code-postal": "68000", ville: "Colmar" } };
    expect(adresseDeLEnquete(reponses)).toEqual({ adresse: "8 allée de la Houblonnière", cp: "68000", ville: "Colmar" });
  });

  it("découpe une ancienne réponse en un seul champ", () => {
    expect(adresseDeLEnquete({ copro: { adresse: "3 rue A, 10000 Troyes" } })).toEqual({
      adresse: "3 rue A",
      cp: "10000",
      ville: "Troyes",
    });
  });

  it("les questions code postal et ville l'emportent sur ce que contient la rue", () => {
    const reponses = { copro: { adresse: "3 rue A, 10000 Troyes", "code-postal": "10120", ville: "Saint-André-les-Vergers" } };
    expect(adresseDeLEnquete(reponses)).toEqual({ adresse: "3 rue A", cp: "10120", ville: "Saint-André-les-Vergers" });
  });

  it("rue sans ville : ville vide", () => {
    expect(adresseDeLEnquete({ copro: { adresse: "8 allée de la Houblonnière" } })).toEqual({
      adresse: "8 allée de la Houblonnière",
      cp: "",
      ville: "",
    });
  });

  it("aucune réponse d'adresse", () => {
    expect(adresseDeLEnquete({ copro: { telephone: "0612345678" } })).toBeNull();
    expect(adresseDeLEnquete(null)).toBeNull();
  });
});

describe("adresseEnqueteSeparee : ancienne réponse rangée dans les trois questions", () => {
  it("découpe une adresse complète", () => {
    expect(adresseEnqueteSeparee({ adresse: "9 rue Fabert, 57000 Metz" })).toEqual({
      adresse: "9 rue Fabert",
      "code-postal": "57000",
      ville: "Metz",
    });
  });

  it("ne touche à rien si le code postal ou la ville est déjà répondu", () => {
    expect(adresseEnqueteSeparee({ adresse: "9 rue Fabert, 57000 Metz", ville: "Metz" })).toEqual({});
    expect(adresseEnqueteSeparee({ adresse: "9 rue Fabert, 57000 Metz", "code-postal": "57000" })).toEqual({});
  });

  it("ne découpe pas une adresse incomplète", () => {
    expect(adresseEnqueteSeparee({ adresse: "8 allée de la Houblonnière" })).toEqual({});
    expect(adresseEnqueteSeparee({ adresse: "57000 Metz, 9 rue Fabert" })).toEqual({});
    expect(adresseEnqueteSeparee({})).toEqual({});
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
