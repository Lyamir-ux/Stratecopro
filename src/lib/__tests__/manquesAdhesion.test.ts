import { describe, expect, it } from "vitest";
import type { CosignataireDeclare } from "@/api/signature";
import type { AdherentSupplementaire, AdhesionForm } from "../pdf/adhesion";
import {
  coordonneesEnDouble,
  manquesAdhesion,
  normaliserTelephone,
  telValide,
  type EtatDossierAdhesion,
} from "../manquesAdhesion";

const fiche = (patch: Partial<CosignataireDeclare> = {}): CosignataireDeclare => ({
  civilite: "",
  nom: "",
  prenom: "",
  email: "",
  telephone: "",
  adresse_ligne1: "",
  code_postal: "",
  ville: "",
  date_naissance: "",
  lieu_naissance: "",
  ...patch,
});

// adhérent supplémentaire complet (associé de la SCI)
const supp = (patch: Partial<AdherentSupplementaire> = {}): AdherentSupplementaire => ({
  ...fiche({
    email: "anna.schmitt@exemple.fr",
    telephone: "06 11 22 33 44",
    prenom: "Anna",
    nom: "Schmitt",
    adresse_ligne1: "3 rue des Vosges",
    code_postal: "68000",
    ville: "Colmar",
    date_naissance: "1975-03-02",
    lieu_naissance: "Mulhouse",
  }),
  nomNaissance: "",
  profession: "",
  professionDepuis: "",
  situation: "celibataire",
  situationDepuis: "",
  telDomicile: "",
  telBureau: "",
  ...patch,
});

// brouillon enregistré par la testeuse de SCI SCHMITT PATRIMOINE le 12/10/2026, juste avant son retour
const FORM_SCI: AdhesionForm = {
  adherent1: {
    nomPrenom: "Munstermann Wolfgang",
    situation: "mariee",
    profession: "Avocat",
    nomNaissance: "",
    situationDepuis: "12/10/1994",
    professionDepuis: "07/05/1990",
    dateLieuNaissance: "17/10/1972 à Stuttgart",
  },
  adherent2: null,
  adresse: "10 Rue d'Alsace",
  cp: "08000",
  ville: "Charleville-Mézières",
  telDomicile: "",
  telBureau: "",
  portable: "+49 0152 1112",
  email: "w.munstermann@exemple.fr",
  montantType: "100",
  montantAutre: "",
  lieuSignature: "Charleville-Mézières",
};

const etat = (patch: Partial<EtatDossierAdhesion> = {}): EtatDossierAdhesion => ({
  form: FORM_SCI,
  principal: { prenom: "Wolfgang", nom: "Munstermann" },
  couple: true,
  ficheAdherent2: fiche(),
  cosignataires: [],
  attestHonneur: true,
  infoAvis: true,
  ...patch,
});

describe("manquesAdhesion : ce qui grise « Passer à la signature »", () => {
  it("dossier complet : rien ne manque", () => {
    expect(manquesAdhesion(etat())).toEqual([]);
  });

  it("le brouillon de la SCI, cases non cochées : seules les deux cases manquent", () => {
    expect(manquesAdhesion(etat({ attestHonneur: false, infoAvis: false }))).toEqual([
      "Cochez l'attestation sur l'honneur (coordonnées des personnes déclarées)",
      "Cochez la case d'information sur la transmission de votre avis d'imposition",
    ]);
  });

  it("un associé déclaré en adhérent supplémentaire, fiche incomplète : nommé avec ce qui lui manque", () => {
    const m = manquesAdhesion(
      etat({
        cosignataires: [supp(), supp({ email: "karl@exemple.fr", telephone: "0152 12345678", nom: "" })],
      }),
    );
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/^Adhérent supplémentaire 2 : téléphone mobile non valide \(.*\+49.*\), nom$/);
  });

  it("adhérent supplémentaire : les mêmes champs obligatoires que l'adhérent 1 (son propre bulletin)", () => {
    const m = manquesAdhesion(
      etat({
        cosignataires: [
          supp({ date_naissance: "", lieu_naissance: "", adresse_ligne1: "", code_postal: "", ville: "", professionDepuis: "01/02/0201" }),
        ],
      }),
    );
    expect(m).toEqual([
      "Adhérent supplémentaire 1 : date de naissance, lieu de naissance, année de « Profession exercée depuis le » (4 chiffres), adresse personnelle, code postal, ville",
    ]);
  });

  it("formulaire vide : chaque champ obligatoire est cité, dans l'ordre du formulaire", () => {
    const vide: AdhesionForm = {
      ...FORM_SCI,
      adherent1: { ...FORM_SCI.adherent1, nomPrenom: "", dateLieuNaissance: "", professionDepuis: "", situationDepuis: "" },
      adresse: "",
      cp: "",
      ville: "",
      portable: "",
      email: "",
      lieuSignature: "",
    };
    expect(manquesAdhesion(etat({ form: vide, principal: { prenom: "", nom: "" } }))).toEqual([
      "Adhérent 1 : nom et prénom, date de naissance, lieu de naissance",
      "Adresse personnelle",
      "Code postal",
      "Ville",
      "Téléphone portable",
      "E-mail",
      "Fait à (lieu de signature)",
      "Signataire principal : prénom, nom",
    ]);
  });

  it("année tapée en partie (Chrome donne 0198 avant 1980) : signalée, jamais acceptée", () => {
    const form = {
      ...FORM_SCI,
      adherent1: { ...FORM_SCI.adherent1, dateLieuNaissance: "17/10/0197 à Stuttgart", professionDepuis: "07/05/0199" },
    };
    expect(manquesAdhesion(etat({ form }))).toEqual([
      "Adhérent 1 : année de naissance (4 chiffres), année de « Profession exercée depuis le » (4 chiffres)",
    ]);
  });

  it("téléphone et e-mail renseignés mais refusés : dit pourquoi", () => {
    const form = { ...FORM_SCI, portable: "0152 12345678", email: "w.munstermann" };
    const m = manquesAdhesion(etat({ form }));
    expect(m[0]).toMatch(/^Téléphone portable : numéro non valide \(06 ou 07/);
    expect(m[1]).toBe("E-mail : adresse non valide");
  });

  it("autre montant choisi sans montant", () => {
    const form = { ...FORM_SCI, montantType: "autre" as const };
    expect(manquesAdhesion(etat({ form }))).toEqual(["Montant demandé : indiquez l'autre montant"]);
  });

  it("adhérent 2 d'un couple : nom ET prénom, naissance et adresse e-mail", () => {
    const form: AdhesionForm = {
      ...FORM_SCI,
      adherent2: { ...FORM_SCI.adherent1, nomPrenom: "Munstermann", dateLieuNaissance: "", email: "" },
    };
    expect(manquesAdhesion(etat({ form }))).toEqual([
      "Adhérent 2 : nom et prénom (les deux), date de naissance, lieu de naissance, adresse e-mail",
    ]);
  });

  it("adhérent 2 hors couple : sa fiche de signature est demandée à part", () => {
    const form: AdhesionForm = {
      ...FORM_SCI,
      adherent1: { ...FORM_SCI.adherent1, situation: "celibataire" },
      adherent2: { ...FORM_SCI.adherent1, nomPrenom: "Schmitt Anna", situation: "celibataire" },
    };
    expect(manquesAdhesion(etat({ form, couple: false, ficheAdherent2: fiche({ email: "anna@exemple.fr" }) }))).toEqual([
      "Adhérent 2, informations pour sa signature : téléphone mobile, prénom, nom",
    ]);
  });

  it("deux signataires avec le même e-mail : refusé et dit", () => {
    const e = etat({
      cosignataires: [supp({ email: "W.Munstermann@exemple.fr " })],
    });
    expect(coordonneesEnDouble(e)).toBe(true);
    expect(manquesAdhesion(e)).toEqual(["Chaque signataire doit avoir son propre e-mail et son propre téléphone"]);
  });
});

describe("SCI : cadre « Adhérent personne morale », demandé une seule fois", () => {
  const PM = {
    siren: "552 120 222",
    raisonSociale: "SCI SCHMITT PATRIMOINE",
    representant: "MUNSTERMANN Wolfgang",
    adresseSiege: "5 place de la Cathédrale",
    cpSiege: "68000",
    villeSiege: "Colmar",
  };

  it("complet : rien ne manque", () => {
    expect(manquesAdhesion(etat({ personneMorale: PM }))).toEqual([]);
  });

  it("SIREN, raison sociale, représentant et siège obligatoires ; SIREN contrôlé (9 chiffres, clé)", () => {
    expect(manquesAdhesion(etat({ personneMorale: { siren: "", raisonSociale: " ", representant: "" } }))).toEqual([
      "SCI (adhérent personne morale) : N° de SIREN, raison sociale, représentée par, adresse du siège, code postal du siège, ville du siège",
    ]);
    expect(manquesAdhesion(etat({ personneMorale: { ...PM, siren: "552 120 223" } }))).toEqual([
      "SCI (adhérent personne morale) : N° de SIREN non valide (9 chiffres)",
    ]);
  });

  it("l'adhérent 1 d'une SCI est le gérant, pas la SCI", () => {
    const form = { ...FORM_SCI, adherent1: { ...FORM_SCI.adherent1, nomPrenom: "SCI SCHMITT PATRIMOINE" } };
    expect(manquesAdhesion(etat({ form, personneMorale: PM }))).toEqual([
      "Adhérent 1 : nom et prénom du gérant (pas le nom de la SCI)",
    ]);
    // hors SCI, aucun contrôle de ce genre
    expect(manquesAdhesion(etat({ form }))).toEqual([]);
  });
});

describe("téléphone des signataires", () => {
  it("mobile français vers +33, numéro international gardé", () => {
    expect(normaliserTelephone("06 12 34 56 78")).toBe("+33612345678");
    expect(normaliserTelephone("+49 152 1234 5678")).toBe("+4915212345678");
    expect(telValide("07.12.34.56.78")).toBe(true);
    expect(telValide("+49 152 12345678")).toBe(true);
  });

  it("numéro national étranger ou fixe français : refusé", () => {
    expect(telValide("0152 12345678")).toBe(false);
    expect(telValide("03 89 12 34 56")).toBe(false);
  });
});
