import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import {
  EMAIL_CONTACT,
  TEL_BUREAU,
  entreeDevisRevalorise,
  genererDevisAmoPdf,
  initialesDe,
  montantsDevis,
  nomFichierDevis,
  phase1Facturee,
  referenceContrat,
  texte,
  versionDevis,
} from "../devisAmo";

const p1 = (etats: ("a_facturer" | "facture" | "encaisse")[], montants = [4500, 2250, 2250]) =>
  (["P1a", "P1b", "P1c"] as const).map((code, i) => ({ code, montant: montants[i], etat: etats[i] }));

const copro = {
  name: "LES TILLEULS",
  adresse: "12 rue des Vosges",
  code_postal: "67000",
  city: "Strasbourg",
  syndic_name: "Citya Ruhl Segesca",
  organisation: { nom: "Citya" },
  chef_projet: "Radia",
};

describe("Devis AMO revalorisé (skill devis-amo)", () => {
  it("n° de contrat : initiales du chef de projet, mois de la revalorisation, version", () => {
    expect(referenceContrat("RA", new Date(2026, 8, 28), 2)).toBe("RA-2026-09-V2");
    expect(referenceContrat(null, new Date(2026, 0, 5), 3)).toBe("2026-01-V3");
    expect(versionDevis(0)).toBe(2);
    expect(versionDevis(1)).toBe(2);
    expect(versionDevis(2)).toBe(3);
  });

  it("initiales comme celles des profils", () => {
    expect(initialesDe("Cyrielle MILEKIC")).toBe("CM");
    expect(initialesDe("Mehdi")).toBe("ME");
    expect(initialesDe("Théa")).toBe("TH");
    expect(initialesDe("")).toBe("");
  });

  it("honoraires : TVA 20 % au centime, totaux", () => {
    const m = montantsDevis(9000, 12345.67);
    expect(m.p1).toEqual({ ht: 9000, tva: 1800, ttc: 10800 });
    expect(m.p2).toEqual({ ht: 12345.67, tva: 2469.13, ttc: 14814.8 });
    expect(m.total).toEqual({ ht: 21345.67, tva: 4269.13, ttc: 25614.8 });
  });

  it("remplit les 10 questions depuis le dossier", () => {
    const e = entreeDevisRevalorise({
      copro,
      nbLots: 24,
      jalonsP1: p1(["a_facturer", "a_facturer", "a_facturer"]),
      p2Ht: 15000,
      revaloriseLe: "2026-09-28T14:05:00+02:00",
      nbRevalorisations: 1,
      chef: { full_name: "Radia", initials: "RA", email: "radia@strateco.fr" },
    });
    expect(e).toEqual({
      nomCopropriete: "LES TILLEULS",
      adresse: "12 rue des Vosges, 67000 Strasbourg",
      nomSyndic: "Citya Ruhl Segesca",
      nbLots: 24,
      chargeAffaire: "Radia",
      emailChargeAffaire: "radia@strateco.fr",
      telChargeAffaire: TEL_BUREAU,
      honPhase1HT: 9000,
      honPhase2HT: 15000,
      refContrat: "RA-2026-09-V2",
      dateContrat: "28/09/2026",
      phase1DejaFacturee: null,
    });
  });

  it("phase 1 déjà facturée : totale, partielle, jalons sans montant ignorés", () => {
    expect(phase1Facturee(p1(["a_facturer", "a_facturer", "a_facturer"]))).toBeNull();
    expect(phase1Facturee(p1(["encaisse", "encaisse", "facture"]))).toEqual({
      totale: true,
      factures: ["P1a", "P1b", "P1c"],
      montantFactureHt: 9000,
      restants: [],
      montantRestantHt: 0,
    });
    expect(phase1Facturee(p1(["encaisse", "facture", "a_facturer"]))).toEqual({
      totale: false,
      factures: ["P1a", "P1b"],
      montantFactureHt: 6750,
      restants: ["P1c"],
      montantRestantHt: 2250,
    });
    // P1c sans montant au contrat : P1a et P1b facturés suffisent
    expect(phase1Facturee(p1(["facture", "facture", "a_facturer"], [6000, 3000, 0]))?.totale).toBe(true);
  });

  it("sans compte AMO : nom saisi, initiales déduites, e-mail du bureau ; syndic repris de l'enseigne", () => {
    const e = entreeDevisRevalorise({
      copro: { ...copro, chef_projet: "Mehdi", syndic_name: null, code_postal: null },
      nbLots: 0,
      jalonsP1: p1(["a_facturer", "a_facturer", "a_facturer"], [0, 0, 0]),
      p2Ht: 15000,
      revaloriseLe: "2026-09-28T14:05:00+02:00",
      nbRevalorisations: 2,
      chef: null,
    });
    expect(e.chargeAffaire).toBe("Mehdi");
    expect(e.emailChargeAffaire).toBe(EMAIL_CONTACT);
    expect(e.refContrat).toBe("ME-2026-09-V3");
    expect(e.nomSyndic).toBe("Citya");
    expect(e.adresse).toBe("12 rue des Vosges, Strasbourg");
    expect(e.nbLots).toBeNull();
  });

  it("nom du fichier comme le skill, jamais de tiret long", () => {
    expect(nomFichierDevis("RÉSIDENCE Les Lilas", "RA-2026-09-V2")).toBe("Contrat_AMO_RESIDENCELesLilas_V2.pdf");
    expect(texte("Phase 1 — Études, 12–18 mois")).toBe("Phase 1 - Études, 12-18 mois");
  });

  it("génère le contrat", async () => {
    const input = entreeDevisRevalorise({
      copro: {
        ...copro,
        name: "RÉSIDENCE RIEDISHEIM I",
        adresse: "75-79 RUE NAVIGATION, 3 RUE ALBERT SCHWEITZER, 7-9-11-13-15-17-19-21-23-25 RUE A. SCHWEITZER",
        code_postal: "68400",
        city: "Riedisheim",
        syndic_name: "Nexity Mulhouse",
      },
      nbLots: 142,
      jalonsP1: p1(["encaisse", "encaisse", "facture"], [10650, 5325, 5325]),
      p2Ht: 31950.5,
      revaloriseLe: "2026-09-28T14:05:00+02:00",
      nbRevalorisations: 1,
      chef: { full_name: "Radia", initials: "RA", email: "radia@strateco.fr" },
    });
    expect(input.honPhase1HT).toBe(21300);
    expect(input.phase1DejaFacturee?.totale).toBe(true);
    const bytes = await genererDevisAmoPdf(input);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(pdf.getTitle()).toBe("Contrat AMO Copropriété - RÉSIDENCE RIEDISHEIM I - RA-2026-09-V2");
    if (process.env.PDF_OUT_DEVIS) writeFileSync(process.env.PDF_OUT_DEVIS, bytes);
  });

  it("phase 1 facturée en partie : le contrat se génère", async () => {
    const input = entreeDevisRevalorise({
      copro,
      nbLots: 24,
      jalonsP1: p1(["encaisse", "facture", "a_facturer"]),
      p2Ht: 15000,
      revaloriseLe: "2026-09-28T14:05:00+02:00",
      nbRevalorisations: 1,
      chef: null,
    });
    const bytes = await genererDevisAmoPdf(input);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2);
    if (process.env.PDF_OUT_DEVIS_PARTIEL) writeFileSync(process.env.PDF_OUT_DEVIS_PARTIEL, bytes);
  });

  it("montants à définir : le contrat reste générable", async () => {
    const bytes = await genererDevisAmoPdf({
      nomCopropriete: "",
      adresse: null,
      nomSyndic: null,
      nbLots: null,
      chargeAffaire: null,
      emailChargeAffaire: null,
      telChargeAffaire: null,
      honPhase1HT: 0,
      honPhase2HT: 0,
      refContrat: "2026-09-V2",
      dateContrat: "28/09/2026",
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
