import { describe, expect, it } from "vitest";
import { cleNomFamille, conventionNoms, trierParNomFamille } from "../nomFamille";

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
