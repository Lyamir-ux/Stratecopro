import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { formAdherentSupplementaire, genBulletin, type AdherentSupplementaire, type AdhesionForm } from "../pdf/adhesion";

const DOSSIER: AdhesionForm = {
  adherent1: {
    nomPrenom: "SCHMITT Paul",
    nomNaissance: "",
    dateLieuNaissance: "17/10/1972 à Colmar",
    profession: "Gérant",
    professionDepuis: "",
    situation: "mariee",
    situationDepuis: "",
  },
  adherent2: null,
  adresse: "1 rue de la Lauch",
  cp: "68000",
  ville: "Colmar",
  telDomicile: "",
  telBureau: "",
  portable: "06 12 34 56 78",
  email: "paul@exemple.fr",
  montantType: "autre",
  montantAutre: "12000",
  lieuSignature: "Colmar",
};

const ANNA: AdherentSupplementaire = {
  civilite: "Madame",
  nom: "SCHMITT",
  prenom: "Anna",
  email: "anna@exemple.fr",
  telephone: "+49 152 12345678",
  adresse_ligne1: "3 Hauptstrasse",
  code_postal: "79098",
  ville: "Freiburg",
  date_naissance: "1975-03-02",
  lieu_naissance: "Mulhouse",
  nomNaissance: "MEYER",
  profession: "Architecte",
  professionDepuis: "01/09/2001",
  situation: "divorcee",
  situationDepuis: "05/06/2015",
  telDomicile: "",
  telBureau: "03 89 00 00 00",
};

describe("bulletin d'un adhérent supplémentaire", () => {
  it("il y est l'adhérent 1, avec ses propres coordonnées ; montant et lieu de signature du dossier", () => {
    expect(formAdherentSupplementaire(DOSSIER, ANNA)).toEqual({
      adherent1: {
        nomPrenom: "SCHMITT Anna",
        nomNaissance: "MEYER",
        dateLieuNaissance: "02/03/1975 à Mulhouse",
        profession: "Architecte",
        professionDepuis: "01/09/2001",
        situation: "divorcee",
        situationDepuis: "05/06/2015",
      },
      adherent2: null,
      adresse: "3 Hauptstrasse",
      cp: "79098",
      ville: "Freiburg",
      telDomicile: "",
      telBureau: "03 89 00 00 00",
      portable: "+49 152 12345678",
      email: "anna@exemple.fr",
      montantType: "autre",
      montantAutre: "12000",
      lieuSignature: "Colmar",
    });
  });
});

describe("genBulletin : une page formulaire par adhérent supplémentaire", () => {
  const gabarit = readFileSync(resolve(__dirname, "../../../public/modeles/bulletin-adhesion-cegee.pdf"));
  vi.stubGlobal("fetch", async () => new Response(gabarit));

  const ctx = { adresseImmeuble: "1 rue de la Lauch, Colmar", nomSyndic: "Syndic", interlocuteur: "Gestionnaire", lotNum: "12", tantiemes: "48" };
  const date = new Date(2026, 9, 12);

  it("sans adhérent supplémentaire : le gabarit tel quel (3 pages)", async () => {
    const pdf = await PDFDocument.load(await genBulletin(DOSSIER, ctx, date));
    expect(pdf.getPageCount()).toBe(3);
  });

  it("deux adhérents supplémentaires : leurs pages suivent la première, avant les conditions", async () => {
    const base = await PDFDocument.load(gabarit);
    const tailles = base.getPages().map((p) => p.getSize());
    const pdf = await PDFDocument.load(
      await genBulletin({ ...DOSSIER, adherentsSupplementaires: [ANNA, { ...ANNA, prenom: "Karl", email: "karl@exemple.fr" }] }, ctx, date),
    );
    expect(pdf.getPageCount()).toBe(5);
    // pages 2 et 3 = copies de la page formulaire, puis les deux pages de conditions
    expect(pdf.getPages().map((p) => p.getSize())).toEqual([tailles[0], tailles[0], tailles[0], tailles[1], tailles[2]]);
  });
});
