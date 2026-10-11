import { describe, expect, it } from "vitest";
import { cleNomFamille, conventionNoms, decouperNomPrenom, identiteEnquete, nomPrenomEnquete, trierParNomFamille } from "../nomFamille";

describe("cleNomFamille", () => {
  it("met devant le nom en capitales d'un libellé « Prénom NOM »", () => {
    expect(cleNomFamille("Bernard et Josiane LECLERC")).toBe("LECLERC Bernard et Josiane");
    expect(cleNomFamille("Mehdi CLAUDEL")).toBe("CLAUDEL Mehdi");
    expect(cleNomFamille("Jean DE LA FONTAINE")).toBe("DE LA FONTAINE Jean");
    expect(cleNomFamille("Sophie MARTIN et Paul DURAND")).toBe("MARTIN Sophie et Paul DURAND");
  });

  it("garde un libellé « NOM Prénom » tel quel", () => {
    expect(cleNomFamille("SCHNEIDER Delphine")).toBe("SCHNEIDER Delphine");
    expect(cleNomFamille("MATZ / RAOUL Clément / Morgan")).toBe("MATZ / RAOUL Clément / Morgan");
    expect(cleNomFamille("KRENCKER FRANCINE (Mme)")).toBe("KRENCKER FRANCINE");
  });

  it("passe les civilités et qualités derrière le nom", () => {
    expect(cleNomFamille("Indivision HENRIOT")).toBe("HENRIOT Indivision");
    expect(cleNomFamille("M. et Mme DURAND")).toBe("DURAND M. et Mme");
    expect(cleNomFamille("HERRMANN Philippe (Monsieur)")).toBe("HERRMANN Philippe");
  });

  it("trie une personne morale sur sa dénomination", () => {
    expect(cleNomFamille("SCI DU PLATEAU DE HAYE")).toBe("SCI DU PLATEAU DE HAYE");
    expect(cleNomFamille("Sci les Lilas")).toBe("Sci les Lilas");
  });

  it("sans capitales, suit la convention de la liste", () => {
    expect(cleNomFamille("Philippe Bauer")).toBe("Bauer Philippe");
    expect(cleNomFamille("Legrand Emeric", "nom-prenom")).toBe("Legrand Emeric");
    expect(cleNomFamille("AVENEL")).toBe("AVENEL");
  });
});

describe("conventionNoms", () => {
  it("déduit la convention majoritaire", () => {
    expect(conventionNoms(["WAGNER Christine", "ALEXANDRE Danièle", "Legrand Emeric", "Julie HENRY"])).toBe("nom-prenom");
    expect(conventionNoms(["Sophie et Thomas MATHIEU", "Sylvie ROSSI", "SCI COMMANDERIE"])).toBe("prenom-nom");
  });
  it("lit « Prénom Nom » sans indice", () => {
    expect(conventionNoms(["Philippe Bauer", "Laurent Klein"])).toBe("prenom-nom");
    expect(conventionNoms(["KRENCKER FRANCINE", "KS"])).toBe("prenom-nom");
  });
});

describe("trierParNomFamille", () => {
  it("classe « Prénom NOM » par nom de famille (Résidence Stanislas)", () => {
    const noms = ["Bernard et Josiane LECLERC", "Camille et Jean GEORGE", "Christophe PIERRON", "Indivision HENRIOT", "Patricia BASTIEN", "SCI COMMANDERIE"];
    expect(trierParNomFamille(noms, (n) => n)).toEqual([
      "Patricia BASTIEN",
      "Camille et Jean GEORGE",
      "Indivision HENRIOT",
      "Bernard et Josiane LECLERC",
      "Christophe PIERRON",
      "SCI COMMANDERIE",
    ]);
  });

  it("applique la convention de la liste aux libellés sans capitales", () => {
    const liste = [{ nom: "KOHLER Sophie" }, { nom: "Roehm stéphane" }, { nom: "Caillaud Bernard" }, { nom: "AVENEL" }];
    expect(trierParNomFamille(liste, (c) => c.nom).map((c) => c.nom)).toEqual(["AVENEL", "Caillaud Bernard", "KOHLER Sophie", "Roehm stéphane"]);
  });

  it("ordonne les numéros dans l'ordre naturel et ne modifie pas la liste d'origine", () => {
    const noms = ["Copropriétaire 10", "Copropriétaire 2", "Copropriétaire 1"];
    expect(trierParNomFamille(noms, (n) => n)).toEqual(["Copropriétaire 1", "Copropriétaire 2", "Copropriétaire 10"]);
    expect(noms[0]).toBe("Copropriétaire 10");
  });
});

describe("decouperNomPrenom", () => {
  it("sépare « Prénom NOM » et « NOM Prénom »", () => {
    expect(decouperNomPrenom("Pierre MAXTAFF")).toEqual({ prenom: "Pierre", nom: "MAXTAFF" });
    expect(decouperNomPrenom("SCHNEIDER Delphine")).toEqual({ prenom: "Delphine", nom: "SCHNEIDER" });
    expect(decouperNomPrenom("Jean-Pierre MARTIN")).toEqual({ prenom: "Jean-Pierre", nom: "MARTIN" });
    expect(decouperNomPrenom("Jean DE LA FONTAINE")).toEqual({ prenom: "Jean", nom: "DE LA FONTAINE" });
    expect(decouperNomPrenom("MARTIN-DUPONT Anne")).toEqual({ prenom: "Anne", nom: "MARTIN-DUPONT" });
  });

  it("ignore la civilité et la mention entre parenthèses d'une seule personne", () => {
    expect(decouperNomPrenom("Mme DURAND Julie")).toEqual({ prenom: "Julie", nom: "DURAND" });
    expect(decouperNomPrenom("HERRMANN Philippe (Monsieur)")).toEqual({ prenom: "Philippe", nom: "HERRMANN" });
  });

  it("deux mots sans capitales : prénom puis nom", () => {
    expect(decouperNomPrenom("Philippe Bauer")).toEqual({ prenom: "Philippe", nom: "Bauer" });
  });

  it("un seul mot : nom seul", () => {
    expect(decouperNomPrenom("AVENEL")).toEqual({ prenom: "", nom: "AVENEL" });
  });

  it("ne devine pas pour un couple, une indivision, une société ou un libellé ambigu", () => {
    expect(decouperNomPrenom("Bernard et Josiane LECLERC")).toBeNull();
    expect(decouperNomPrenom("M. et Mme DURAND")).toBeNull();
    expect(decouperNomPrenom("Sophie MARTIN et Paul DURAND")).toBeNull();
    expect(decouperNomPrenom("MATZ / RAOUL Clément / Morgan")).toBeNull();
    expect(decouperNomPrenom("Indivision HENRIOT")).toBeNull();
    expect(decouperNomPrenom("SCI DU PLATEAU DE HAYE")).toBeNull();
    expect(decouperNomPrenom("KRENCKER FRANCINE")).toBeNull();
    expect(decouperNomPrenom("Jean de la Fontaine")).toBeNull();
    expect(decouperNomPrenom("")).toBeNull();
  });
});

describe("nomPrenomEnquete : nom et prénom séparés dans l'enquête sociale", () => {
  it("part du libellé de la fiche quand c'est une personne", () => {
    expect(nomPrenomEnquete({}, "Pierre MAXTAFF")).toEqual({ nom: "MAXTAFF", prenom: "Pierre" });
    expect(nomPrenomEnquete({}, "SCHNEIDER Delphine")).toEqual({ nom: "SCHNEIDER", prenom: "Delphine" });
    expect(nomPrenomEnquete({}, "AVENEL")).toEqual({ nom: "AVENEL" });
  });
  it("une initiale n'est pas un prénom (« A CHELGHAM », 11/10/2026)", () => {
    expect(nomPrenomEnquete({}, "A CHELGHAM")).toEqual({ nom: "CHELGHAM" });
    expect(nomPrenomEnquete({}, "J.-P. MARTIN")).toEqual({ nom: "MARTIN" });
    expect(nomPrenomEnquete({ nom: "A. CHELGHAM" }, "")).toEqual({ nom: "A. CHELGHAM" });
    expect(nomPrenomEnquete({}, "Al CHELGHAM")).toEqual({ nom: "CHELGHAM", prenom: "Al" });
  });
  it("ne propose rien pour un couple, une indivision ou une société", () => {
    expect(nomPrenomEnquete({}, "M. et Mme DURAND")).toEqual({});
    expect(nomPrenomEnquete({}, "SCI DU PLATEAU DE HAYE")).toEqual({});
    expect(nomPrenomEnquete({}, "Indivision HENRIOT")).toEqual({});
  });
  it("garde les réponses enregistrées", () => {
    expect(nomPrenomEnquete({ nom: "CHELGHAM", prenom: "Amir" }, "Autre PERSONNE")).toEqual({ nom: "CHELGHAM", prenom: "Amir" });
    expect(nomPrenomEnquete({ nom: "CHELGHAM" }, "A CHELGHAM")).toEqual({ nom: "CHELGHAM" });
  });
  it("sépare un ancien « nom complet » enregistré sans prénom", () => {
    expect(nomPrenomEnquete({ nom: "Amir CHELGHAM" }, "")).toEqual({ nom: "CHELGHAM", prenom: "Amir" });
    expect(nomPrenomEnquete({ nom: "SCI DU RIED" }, "Pierre MAXTAFF")).toEqual({ nom: "SCI DU RIED" });
  });
  it("ignore les valeurs qui ne sont pas du texte", () => {
    expect(nomPrenomEnquete({ nom: 12, prenom: undefined }, "Pierre MAXTAFF")).toEqual({ nom: "MAXTAFF", prenom: "Pierre" });
  });
});

describe("identiteEnquete : nom et prénom de l'enquête pour le dossier d'adhésion", () => {
  it("lit les réponses rangées sous « copro »", () => {
    expect(identiteEnquete({ copro: { nom: "CHELGHAM", prenom: "Amir" }, lots: {} })).toEqual({ nom: "CHELGHAM", prenom: "Amir" });
  });
  it("sépare un ancien nom complet", () => {
    expect(identiteEnquete({ copro: { nom: "Pierre MAXTAFF" } })).toEqual({ nom: "MAXTAFF", prenom: "Pierre" });
  });
  it("rien sans réponse (pas de repli sur la fiche)", () => {
    expect(identiteEnquete({ copro: {} })).toEqual({});
    expect(identiteEnquete(null)).toEqual({});
    expect(identiteEnquete({ nom: "CHELGHAM", prenom: "Amir" })).toEqual({});
  });
});
