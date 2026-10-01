import { describe, expect, it } from "vitest";
import {
  nomOrganisationDisponible,
  nomSyndicBenevole,
  normaliserNomOrganisation,
  trouverOrganisationParNom,
} from "../organisations";

const ORGS = [
  { id: "immo4", nom: "Citya Immo 4" },
  { id: "ruhl", nom: "Citya Ruhl Segesca" },
  { id: "immium", nom: "IMMIUM" },
  { id: "laemmel", nom: "IMMIUM Laemmel" },
  { id: "demo", nom: "SYNDIC 3000 GRAND EST" },
];

describe("normaliserNomOrganisation", () => {
  it("ignore casse, accents et espaces multiples", () => {
    expect(normaliserNomOrganisation("  Citya   IMMO 4 ")).toBe("citya immo 4");
    expect(normaliserNomOrganisation("Résidence Été")).toBe("residence ete");
  });
});

describe("trouverOrganisationParNom", () => {
  it("retrouve l'enseigne quelle que soit la casse saisie", () => {
    expect(trouverOrganisationParNom(ORGS, "citya immo 4")?.id).toBe("immo4");
    expect(trouverOrganisationParNom(ORGS, "Immium")?.id).toBe("immium");
    expect(trouverOrganisationParNom(ORGS, "IMMIUM LAEMMEL")?.id).toBe("laemmel");
  });

  it("ne confond pas deux enseignes proches", () => {
    expect(trouverOrganisationParNom(ORGS, "Citya Ruhl Segesca")?.id).toBe("ruhl");
    expect(trouverOrganisationParNom(ORGS, "Citya")).toBeNull();
  });

  it("renvoie null pour un nom vide ou inconnu (le rattachement existant est conservé)", () => {
    expect(trouverOrganisationParNom(ORGS, "")).toBeNull();
    expect(trouverOrganisationParNom(ORGS, null)).toBeNull();
    expect(trouverOrganisationParNom(ORGS, "Foncia Colmar")).toBeNull();
  });
});

describe("nomSyndicBenevole", () => {
  it("reprend la convention des enseignes en base (nom du dossier en capitales)", () => {
    expect(nomSyndicBenevole("HERMITE")).toBe("Syndic Bénévole HERMITE");
    expect(nomSyndicBenevole("19 rue Saint Paul")).toBe("Syndic Bénévole 19 RUE SAINT PAUL");
  });

  it("retire le préfixe « Copropriété des / du / de la »", () => {
    expect(nomSyndicBenevole("COPROPRIETE DES TROIS FIGUIERS")).toBe("Syndic Bénévole TROIS FIGUIERS");
    expect(nomSyndicBenevole("Copropriété du Parc")).toBe("Syndic Bénévole PARC");
    expect(nomSyndicBenevole("Copropriété de l'Ill")).toBe("Syndic Bénévole ILL");
    expect(nomSyndicBenevole("Copropriété Les Lilas")).toBe("Syndic Bénévole LES LILAS");
  });

  it("ne coupe pas un nom qui contient le mot ailleurs", () => {
    expect(nomSyndicBenevole("Les Copropriétés du Rhin")).toBe("Syndic Bénévole LES COPROPRIÉTÉS DU RHIN");
  });
});

describe("nomOrganisationDisponible", () => {
  const BENEVOLES = [
    { id: "a", nom: "Syndic Bénévole HERMITE" },
    { id: "b", nom: "Syndic Benevole LES LILAS" },
    { id: "c", nom: "Syndic Bénévole LES LILAS (2)" },
  ];

  it("garde le nom s'il est libre", () => {
    expect(nomOrganisationDisponible("Syndic Bénévole PARC", BENEVOLES)).toBe("Syndic Bénévole PARC");
  });

  it("numérote un homonyme (casse et accents ignorés)", () => {
    expect(nomOrganisationDisponible("Syndic Bénévole hermite", BENEVOLES)).toBe("Syndic Bénévole hermite (2)");
    expect(nomOrganisationDisponible("Syndic Bénévole LES LILAS", BENEVOLES)).toBe("Syndic Bénévole LES LILAS (3)");
  });
});
