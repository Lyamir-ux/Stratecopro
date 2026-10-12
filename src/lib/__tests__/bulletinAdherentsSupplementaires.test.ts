import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import {
  formAdherentSupplementaire,
  genBulletin,
  representantEffectif,
  sirenFormate,
  sirenValide,
  type AdherentSupplementaire,
  type AdhesionForm,
} from "../pdf/adhesion";

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
      personneMorale: null,
    });
  });

  it("SCI : le cadre personne morale du dossier est repris tel quel sur sa page", () => {
    const pm = { siren: "552120222", raisonSociale: "SCI SCHMITT PATRIMOINE", representant: "SCHMITT Paul" };
    expect(formAdherentSupplementaire({ ...DOSSIER, personneMorale: pm }, ANNA).personneMorale).toEqual(pm);
  });
});

describe("SIREN et représentant de la SCI", () => {
  it("SIREN : 9 chiffres et clé de Luhn, espaces tolérés ; La Poste en exception", () => {
    expect(sirenValide("552 120 222")).toBe(true);
    expect(sirenValide("552120223")).toBe(false);
    expect(sirenValide("55212022")).toBe(false);
    expect(sirenValide("356 000 000")).toBe(true);
    expect(sirenFormate("552120222")).toBe("552 120 222");
  });

  it("représentant : le signataire principal tant qu'il n'a pas été modifié", () => {
    expect(representantEffectif({ representant: null }, { nom: "SCHMITT", prenom: "Paul" })).toBe("SCHMITT Paul");
    expect(representantEffectif({ representant: "DUPONT Marie" }, { nom: "SCHMITT", prenom: "Paul" })).toBe("DUPONT Marie");
    expect(representantEffectif({ representant: "" }, { nom: "SCHMITT", prenom: "Paul" })).toBe("");
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

  it("SCI : SIREN, raison sociale et représentant imprimés sur la page du gérant et sur celle de chaque associé", async () => {
    const bytes = await genBulletin(
      {
        ...DOSSIER,
        personneMorale: { siren: "552120222", raisonSociale: "SCI SCHMITT PATRIMOINE", representant: "SCHMITT Paul" },
        adherentsSupplementaires: [ANNA],
      },
      ctx,
      date,
    );
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
    for (const n of [1, 2]) {
      const items = (await (await doc.getPage(n)).getTextContent()).items as { str: string; transform: number[] }[];
      const a = (texte: string) => items.find((i) => i.str === texte)?.transform.slice(4, 6).map(Math.round);
      expect(a("552 120 222")).toEqual([262, 666]);
      expect(a("SCI SCHMITT PATRIMOINE")).toEqual([326, 653]);
      expect(a("SCHMITT Paul")).toEqual([332, 641]);
    }
    const p2 = (await (await doc.getPage(2)).getTextContent()).items.map((i) => (i as { str: string }).str);
    expect(p2).toContain("SCHMITT Anna");
  });
});
