// Scellement d'un bulletin à adhérents supplémentaires (retour de SCI SCHMITT PATRIMOINE du
// 13/10/2026) : le nombre de pages formulaire se lit sur le document, pas seulement sur le brouillon.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import {
  PAGES_GABARIT_BULLETIN,
  nbAdherentsSupplementaires,
} from "../../../supabase/functions/signature-flux/nbSupplementaires";
import { genBulletin, type AdherentSupplementaire, type AdhesionForm } from "../pdf/adhesion";

describe("nbAdherentsSupplementaires", () => {
  it("les pages du bulletin font foi quand la clé du formulaire a disparu (le cas de la testeuse)", () => {
    // bulletin à 5 pages = formulaire + 2 pages d'adhérents supplémentaires + 2 pages de conditions
    expect(nbAdherentsSupplementaires(5, undefined)).toBe(2);
    expect(nbAdherentsSupplementaires(5, null)).toBe(2);
    expect(nbAdherentsSupplementaires(4, undefined)).toBe(1);
  });

  it("les pages l'emportent aussi sur un brouillon réécrit avec une liste vide", () => {
    expect(nbAdherentsSupplementaires(5, [])).toBe(2);
  });

  it("gabarit seul : la clé distingue « nouveau format sans supplémentaire » d'un dossier d'avant le 12/10/2026", () => {
    expect(nbAdherentsSupplementaires(PAGES_GABARIT_BULLETIN, [])).toBe(0);
    expect(nbAdherentsSupplementaires(PAGES_GABARIT_BULLETIN, undefined)).toBeNull();
    expect(nbAdherentsSupplementaires(PAGES_GABARIT_BULLETIN, null)).toBeNull();
  });

  it("une clé qui ne serait pas une liste n'invente rien", () => {
    expect(nbAdherentsSupplementaires(PAGES_GABARIT_BULLETIN, "n'importe quoi")).toBeNull();
    expect(nbAdherentsSupplementaires(PAGES_GABARIT_BULLETIN, {})).toBeNull();
  });
});

describe("accord avec genBulletin : une page formulaire par adhérent supplémentaire", () => {
  const gabarit = readFileSync(resolve(__dirname, "../../../public/modeles/bulletin-adhesion-cegee.pdf"));
  vi.stubGlobal("fetch", async () => new Response(gabarit));

  const dossier: AdhesionForm = {
    adherent1: {
      nomPrenom: "MUNSTERMANN Wolfgang",
      nomNaissance: "",
      dateLieuNaissance: "17/10/1972 à Stuttgart",
      profession: "Avocat",
      professionDepuis: "",
      situation: "celibataire",
      situationDepuis: "",
    },
    adherent2: null,
    adresse: "1 rue de la Lauch",
    cp: "68000",
    ville: "Colmar",
    telDomicile: "",
    telBureau: "",
    portable: "06 12 34 56 78",
    email: "w@exemple.fr",
    montantType: "100",
    montantAutre: "",
    lieuSignature: "Colmar",
  };
  const adherent = (prenom: string): AdherentSupplementaire => ({
    civilite: "Monsieur",
    nom: "SCHMITT",
    prenom,
    email: `${prenom.toLowerCase()}@exemple.fr`,
    telephone: "+49 152 12345678",
    adresse_ligne1: "3 Hauptstrasse",
    code_postal: "79098",
    ville: "Freiburg",
    date_naissance: "1975-03-02",
    lieu_naissance: "Mulhouse",
    nomNaissance: "",
    profession: "",
    professionDepuis: "",
    situation: "celibataire",
    situationDepuis: "",
    telDomicile: "",
    telBureau: "",
  });
  const ctx = { adresseImmeuble: "1 rue de la Lauch, Colmar", nomSyndic: "Syndic", interlocuteur: "Gestionnaire", lotNum: "1", tantiemes: "48" };

  it("le nombre de pages du bulletin généré redonne le nombre d'adhérents supplémentaires, quelle que soit la clé du brouillon", async () => {
    for (const n of [0, 1, 2, 3]) {
      const supplementaires = ["Gunther", "Cynthia", "Karl"].slice(0, n).map(adherent);
      const pdf = await PDFDocument.load(await genBulletin({ ...dossier, adherentsSupplementaires: supplementaires }, ctx, new Date(2026, 9, 13)));
      expect(pdf.getPageCount()).toBe(PAGES_GABARIT_BULLETIN + n);
      // brouillon réécrit sans la clé : les pages disent la vérité
      expect(nbAdherentsSupplementaires(pdf.getPageCount(), undefined)).toBe(n === 0 ? null : n);
    }
  });
});
