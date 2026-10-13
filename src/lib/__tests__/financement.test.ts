import { describe, expect, it } from "vitest";
import {
  accesFinancement,
  adhesionDepassee,
  adhesionPossible,
  dossierAdhesionDepose,
  dureePretDuPf,
  ecoPtzPossible,
  idsNonConcernesParEnquete,
  limiteAdhesion,
  MOTIF_FINANCEMENT_VERROUILLE,
  peutRepondreEnquete,
  MOTIF_SANS_ECO_PTZ,
  MOTIF_SCI_IS,
  motifSansEcoPtz,
  sciSoumiseIs,
} from "../financement";

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

describe("date limite d'adhésion au prêt collectif (idée d'Amir du 11/10/2026)", () => {
  it("la deuxième date, fixée par la dernière relance, fait foi quand elle existe", () => {
    expect(limiteAdhesion({ date_limite_adhesion: "2026-11-15", date_limite_adhesion_2: "2026-12-01" })).toBe("2026-12-01");
    expect(limiteAdhesion({ date_limite_adhesion: "2026-11-15", date_limite_adhesion_2: null })).toBe("2026-11-15");
    expect(limiteAdhesion({ date_limite_adhesion: null })).toBeNull();
    expect(limiteAdhesion(null)).toBeNull();
  });

  it("le jour même de la date limite est encore ouvert, le lendemain non ; sans date, jamais dépassée", () => {
    expect(adhesionDepassee("2026-11-15", "2026-11-15")).toBe(false);
    expect(adhesionDepassee("2026-11-15", "2026-11-14")).toBe(false);
    expect(adhesionDepassee("2026-11-15", "2026-11-16")).toBe(true);
    expect(adhesionDepassee(null, "2030-01-01")).toBe(false);
  });

  it("un dossier est déposé dès qu'un bulletin est sorti de la préparation, ou pour un ancien dossier signé", () => {
    expect(dossierAdhesionDepose([{ statut: "brouillon" }])).toBe(false);
    expect(dossierAdhesionDepose([{ statut: "annule" }])).toBe(false);
    expect(dossierAdhesionDepose([])).toBe(false);
    expect(dossierAdhesionDepose(null)).toBe(false);
    expect(dossierAdhesionDepose([{ statut: "en_signature" }])).toBe(true);
    expect(dossierAdhesionDepose([{ statut: "brouillon" }, { statut: "complet" }])).toBe(true);
    expect(dossierAdhesionDepose([], true)).toBe(true);
  });

  it("l'adhésion n'est possible que campagne ouverte et date limite pas dépassée", () => {
    const base = { campagneOuverte: true, limite: "2026-11-15", aujourdhui: "2026-11-10" };
    expect(adhesionPossible(base)).toBe(true);
    expect(adhesionPossible({ ...base, aujourdhui: "2026-11-16" })).toBe(false);
    expect(adhesionPossible({ ...base, campagneOuverte: false })).toBe(false);
    expect(adhesionPossible({ ...base, limite: null, aujourdhui: "2030-01-01" })).toBe(true);
  });
});

describe("SCI soumise à l'impôt sur les sociétés : pas d'éco-PTZ (règle d'Amir du 12/10/2026)", () => {
  const LOGEMENT = [{ usage: "habitation" }];
  it("seul le type « SCI soumise à l'impôt sur les sociétés » de l'enquête ferme l'éco-PTZ", () => {
    expect(sciSoumiseIs("SCI soumise à l'impôt sur les sociétés")).toBe(true);
    expect(sciSoumiseIs("SCI soumise à l'impôt sur le revenu")).toBe(false);
    expect(sciSoumiseIs("Personne physique")).toBe(false);
    expect(sciSoumiseIs(null)).toBe(false);
  });
  it("motif : pas de logement d'abord, puis SCI à l'IS ; sinon ouvert", () => {
    expect(motifSansEcoPtz(LOGEMENT, "SCI soumise à l'impôt sur le revenu")).toBeNull();
    expect(motifSansEcoPtz(LOGEMENT, "SCI soumise à l'impôt sur les sociétés")).toBe(MOTIF_SCI_IS);
    expect(motifSansEcoPtz([{ usage: "garage" }], "SCI soumise à l'impôt sur les sociétés")).toBe(MOTIF_SANS_ECO_PTZ);
    expect(motifSansEcoPtz(LOGEMENT, undefined)).toBeNull();
  });
});

describe("dureePretDuPf", () => {
  it("reprend la durée du plan de financement (20 ans, bug du 13/10/2026)", () => {
    expect(dureePretDuPf(20)).toBe(20);
    expect(dureePretDuPf(15)).toBe(15);
    expect(dureePretDuPf(3)).toBe(3);
  });

  it("arrondit à l'année entière", () => {
    expect(dureePretDuPf(14.6)).toBe(15);
    expect(dureePretDuPf(12.2)).toBe(12);
  });

  it("ignore une durée hors des bornes du prêt (3 à 20 ans) ou illisible", () => {
    expect(dureePretDuPf(2)).toBeNull();
    expect(dureePretDuPf(25)).toBeNull();
    expect(dureePretDuPf(0)).toBeNull();
    expect(dureePretDuPf(Number.NaN)).toBeNull();
    expect(dureePretDuPf("20")).toBeNull();
    expect(dureePretDuPf(undefined)).toBeNull();
  });
});
