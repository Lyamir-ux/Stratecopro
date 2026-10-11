import { describe, expect, it } from "vitest";
import { accesFinancement, ecoPtzPossible, idsNonConcernesParEnquete, MOTIF_FINANCEMENT_VERROUILLE, peutRepondreEnquete } from "../financement";

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

describe("accesFinancement : « Mon financement » après l'enquête (règle d'Amir du 11/10/2026)", () => {
  const base = { enqueteConcerne: true, enqueteExiste: true, enqueteTransmise: false, dossierEngage: false, chargement: false };

  it("verrouillé tant que l'enquête n'est pas transmise complète", () => {
    expect(accesFinancement(base)).toBe("verrouille");
  });

  it("ouvert une fois l'enquête transmise", () => {
    expect(accesFinancement({ ...base, enqueteTransmise: true })).toBe("ouvert");
  });

  it("ouvert pour un copropriétaire que l'enquête ne concerne pas (garages, caves…)", () => {
    expect(accesFinancement({ ...base, enqueteConcerne: false })).toBe("ouvert");
    expect(accesFinancement({ ...base, enqueteConcerne: false, chargement: true })).toBe("ouvert");
  });

  it("ouvert quand la copropriété n'a pas d'enquête : il n'y a rien à transmettre", () => {
    expect(accesFinancement({ ...base, enqueteExiste: false })).toBe("ouvert");
  });

  it("un dossier d'adhésion déjà engagé garde l'accès à ses documents signés", () => {
    expect(accesFinancement({ ...base, dossierEngage: true })).toBe("ouvert");
  });

  it("n'affiche ni l'encadré ni le financement tant que les données ne sont pas chargées", () => {
    expect(accesFinancement({ ...base, chargement: true })).toBe("chargement");
  });

  it("l'encadré dit ce qu'il faut faire", () => {
    expect(MOTIF_FINANCEMENT_VERROUILLE).toBe(
      "Vous ne pourrez passer cette étape que lorsque vous aurez complété l'enquête sociale et technique."
    );
  });
});
