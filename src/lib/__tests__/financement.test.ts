import { describe, expect, it } from "vitest";
import { ecoPtzPossible, idsNonConcernesParEnquete, peutRepondreEnquete } from "../financement";

describe("ecoPtzPossible", () => {
  it("ouvert dès qu'un lot d'habitation est à son nom", () => {
    expect(ecoPtzPossible([{ usage: "habitation" }])).toBe(true);
    expect(ecoPtzPossible([{ usage: "garage" }, { usage: "habitation" }, { usage: "caves" }])).toBe(true);
  });

  it("fermé pour un copropriétaire qui n'a que des garages, caves ou locaux d'activité", () => {
    expect(ecoPtzPossible([{ usage: "garage" }, { usage: "caves" }])).toBe(false);
    expect(ecoPtzPossible([{ usage: "commerces" }, { usage: "bureaux" }, { usage: "autres" }])).toBe(false);
  });

  it("fermé sans aucun lot", () => {
    expect(ecoPtzPossible([])).toBe(false);
  });
});

describe("peutRepondreEnquete", () => {
  it("ouverte dès qu'un lot d'habitation est à son nom", () => {
    expect(peutRepondreEnquete([{ usage: "habitation" }])).toBe(true);
    expect(peutRepondreEnquete([{ usage: "garage" }, { usage: "habitation" }])).toBe(true);
  });

  it("fermée pour des garages, caves, parkings, commerces ou bureaux seuls", () => {
    expect(peutRepondreEnquete([{ usage: "garage" }, { usage: "caves" }])).toBe(false);
    expect(peutRepondreEnquete([{ usage: "commerces" }, { usage: "bureaux" }, { usage: "autres" }])).toBe(false);
  });

  it("ouverte quand aucun lot n'est connu : rien ne prouve qu'il n'y a pas de logement", () => {
    expect(peutRepondreEnquete([])).toBe(true);
  });
});

describe("idsNonConcernesParEnquete", () => {
  it("ne retient que les propriétaires dont les lots connus sont tous hors habitation", () => {
    const lots = [
      { coproprietaire_id: "a", usage: "habitation" },
      { coproprietaire_id: "a", usage: "garage" },
      { coproprietaire_id: "b", usage: "garage" },
      { coproprietaire_id: "b", usage: "caves" },
      { coproprietaire_id: "c", usage: "commerces" },
      { coproprietaire_id: null, usage: "garage" },
    ];
    expect([...idsNonConcernesParEnquete(lots)].sort()).toEqual(["b", "c"]);
  });

  it("une fiche sans lot n'y figure pas", () => {
    expect(idsNonConcernesParEnquete([]).size).toBe(0);
  });
});
