import { describe, expect, it } from "vitest";
import {
  identiteDeLaFiche,
  identiteProposee,
  lieuSignaturePropose,
  nomPrenomDeLaFiche,
} from "../preremplissageAdhesion";

describe("identiteDeLaFiche / nomPrenomDeLaFiche", () => {
  it("sépare le libellé d'une personne", () => {
    expect(identiteDeLaFiche("Pierre MAXTAFF")).toEqual({ nom: "MAXTAFF", prenom: "Pierre" });
    expect(nomPrenomDeLaFiche("Pierre MAXTAFF")).toBe("MAXTAFF Pierre");
  });

  it("une initiale n'est pas un prénom : libellé gardé tel quel", () => {
    expect(identiteDeLaFiche("A CHELGHAM")).toEqual({ nom: "CHELGHAM" });
    expect(nomPrenomDeLaFiche("A CHELGHAM")).toBe("A CHELGHAM");
  });
});

describe("identiteProposee : nom et prénom du dossier d'adhésion (11/10/2026)", () => {
  const enquete = { nom: "CHELGHAM", prenom: "Amir" };

  it("reprend l'enquête sociale plutôt que le libellé de la fiche", () => {
    expect(identiteProposee("A CHELGHAM", undefined, enquete)).toEqual({
      principal: { nom: "CHELGHAM", prenom: "Amir" },
      adherent1: "CHELGHAM Amir",
    });
  });

  it("un brouillon qui n'a fait que reprendre la fiche cède la place à l'enquête", () => {
    expect(identiteProposee("A CHELGHAM", "A CHELGHAM", enquete).adherent1).toBe("CHELGHAM Amir");
    expect(identiteProposee("Pierre MAXTAFF", "MAXTAFF Pierre", { nom: "MAXTAFF", prenom: "Pierre-Jean" }).adherent1).toBe(
      "MAXTAFF Pierre-Jean",
    );
  });

  it("un brouillon saisi par le copropriétaire l'emporte et donne le signataire principal", () => {
    expect(identiteProposee("A CHELGHAM", "CHELGHAM Amir Karim", enquete)).toEqual({
      principal: { nom: "CHELGHAM", prenom: "Amir Karim" },
      adherent1: null,
    });
  });

  it("sans nom et prénom dans l'enquête : rien à proposer", () => {
    expect(identiteProposee("A CHELGHAM", undefined, {})).toEqual({ principal: null, adherent1: null });
    expect(identiteProposee("A CHELGHAM", "", { nom: "CHELGHAM" })).toEqual({ principal: null, adherent1: null });
  });
});

describe("lieuSignaturePropose : ville de l'adresse postale (idée du 11/10/2026)", () => {
  it("remplace le lieu par défaut (ville de la copropriété) ou vide", () => {
    expect(lieuSignaturePropose("Colmar", "Colmar", "Strasbourg")).toBe("Strasbourg");
    expect(lieuSignaturePropose(undefined, "Colmar", "Strasbourg")).toBe("Strasbourg");
    expect(lieuSignaturePropose("  ", null, "Strasbourg")).toBe("Strasbourg");
  });

  it("garde un lieu choisi par le copropriétaire", () => {
    expect(lieuSignaturePropose("Mulhouse", "Colmar", "Strasbourg")).toBeNull();
  });

  it("ville inconnue : rien à proposer", () => {
    expect(lieuSignaturePropose("Colmar", "Colmar", "")).toBeNull();
    expect(lieuSignaturePropose("Colmar", "Colmar", undefined)).toBeNull();
  });
});
