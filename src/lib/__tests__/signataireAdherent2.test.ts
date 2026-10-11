import { describe, expect, it } from "vitest";
import { signataireDepuisAdherent2 } from "../signataireAdherent2";
import { nomEtPrenomRenseignes, separerNomPrenom } from "../nomFamille";

const ADRESSE = { adresse: "12 rue des Lilas", cp: "67000", ville: "Strasbourg" };

describe("separerNomPrenom : « NOM Prénom » vers nom et prénom", () => {
  it("le bloc en capitales est le nom, où qu'il se trouve", () => {
    expect(separerNomPrenom("CHELGHAM Hassina")).toEqual({ nom: "CHELGHAM", prenom: "Hassina" });
    expect(separerNomPrenom("Hassina CHELGHAM")).toEqual({ nom: "CHELGHAM", prenom: "Hassina" });
    expect(separerNomPrenom("DE LA FONTAINE Jean")).toEqual({ nom: "DE LA FONTAINE", prenom: "Jean" });
    expect(separerNomPrenom("MARTIN-DUPONT Anne-Sophie")).toEqual({ nom: "MARTIN-DUPONT", prenom: "Anne-Sophie" });
  });

  it("sans capitales, le nom vient d'abord (convention du formulaire)", () => {
    expect(separerNomPrenom("Chelgham Hassina")).toEqual({ nom: "Chelgham", prenom: "Hassina" });
    expect(separerNomPrenom("Dupont Marie Claire")).toEqual({ nom: "Dupont", prenom: "Marie Claire" });
  });

  it("tout en capitales : le premier mot est le nom", () => {
    expect(separerNomPrenom("CHELGHAM HASSINA")).toEqual({ nom: "CHELGHAM", prenom: "HASSINA" });
  });

  it("ignore une civilité et les espaces en trop", () => {
    expect(separerNomPrenom("  Mme   DURAND  Julie ")).toEqual({ nom: "DURAND", prenom: "Julie" });
  });

  it("un seul mot : nom sans prénom", () => {
    expect(separerNomPrenom("CHELGHAM")).toEqual({ nom: "CHELGHAM", prenom: "" });
    expect(separerNomPrenom("")).toEqual({ nom: "", prenom: "" });
  });
});

describe("nomEtPrenomRenseignes", () => {
  it("exige le nom et le prénom", () => {
    expect(nomEtPrenomRenseignes("CHELGHAM Hassina")).toBe(true);
    expect(nomEtPrenomRenseignes("CHELGHAM")).toBe(false);
    expect(nomEtPrenomRenseignes("  ")).toBe(false);
    expect(nomEtPrenomRenseignes("M. CHELGHAM")).toBe(false);
  });
});

describe("signataireDepuisAdherent2 : l'adhérent 2 ne donne plus que son e-mail", () => {
  const a = {
    nomPrenom: "CHELGHAM Hassina",
    dateLieuNaissance: "27/05/1980 à ALGER",
    email: " hassina@exemple.fr ",
  };

  it("reprend son nom, sa naissance et l'adresse du bulletin ; l'e-mail est nettoyé", () => {
    expect(signataireDepuisAdherent2(a, ADRESSE)).toEqual({
      civilite: "",
      nom: "CHELGHAM",
      prenom: "Hassina",
      email: "hassina@exemple.fr",
      telephone: "",
      adresse_ligne1: "12 rue des Lilas",
      code_postal: "67000",
      ville: "Strasbourg",
      date_naissance: "1980-05-27",
      lieu_naissance: "ALGER",
    });
  });

  it("sans téléphone : le code de signature arrive par e-mail, jamais par SMS", () => {
    expect(signataireDepuisAdherent2(a, ADRESSE).telephone).toBe("");
  });

  it("une date ou un lieu absents ne bloquent pas la création du signataire", () => {
    const s = signataireDepuisAdherent2({ ...a, dateLieuNaissance: "" }, ADRESSE);
    expect(s.date_naissance).toBe("");
    expect(s.lieu_naissance).toBe("");
    expect(signataireDepuisAdherent2({ nomPrenom: "X Y", dateLieuNaissance: "", email: undefined }, ADRESSE).email).toBe("");
  });
});
