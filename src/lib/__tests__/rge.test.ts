import { describe, expect, it } from "vitest";
import {
  analyserLignesRge,
  certificatPdf,
  couvertureDomaines,
  DOMAINES_RGE,
  domainesAttendus,
  etablissements,
  etatValidite,
  formaterSiret,
  nomOrganisme,
  situationADate,
  verificationRgePour,
  type LigneRge,
} from "../rge";

// Lignes réelles de l'API ADEME (07/10/2026), raccourcies.
const QUALIBAT = "https://www.qualibat.com/Views/GetFichier.aspx?fn=2024\\D64-Certificat-201039-E201039-1-20240729-RGEAnnexe.pdf";
const ligne = (p: Partial<LigneRge>): LigneRge => ({
  siret: "80419263100013",
  nom_entreprise: "RCP",
  adresse: "12 rue des Lilas",
  code_postal: "47230",
  commune: "BARBASTE",
  organisme: "qualibat",
  nom_certificat: "QUALIBAT-RGE",
  url_qualification: QUALIBAT,
  lien_date_debut: "2024-10-04",
  lien_date_fin: "2027-10-04",
  ...p,
});
const RCP: LigneRge[] = [
  ligne({ code_qualification: "4131D114", nom_qualification: "Plaques de plâtre (4131D114)", domaine: "Isolation des combles perdus" }),
  ligne({ code_qualification: "4131D115", nom_qualification: "Plaques de plâtre (4131D115)", domaine: "Isolation des planchers bas" }),
  ligne({
    code_qualification: "7131",
    nom_qualification: "Isolation thermique par l'extérieur (7131)",
    domaine: "Isolation des murs par l'extérieur",
    lien_date_debut: "2021-03-01",
    lien_date_fin: "2025-03-01",
    url_qualification: "https://www.qualibat.com/Views/GetFichier.aspx?fn=2021\\ancien.pdf",
  }),
];

describe("etatValidite", () => {
  it("bornes comprises, alerte à 60 jours, qualification pas encore commencée", () => {
    expect(etatValidite("2024-10-04", "2027-10-04", "2026-10-07")).toBe("valide");
    expect(etatValidite("2024-10-04", "2026-11-30", "2026-10-07")).toBe("bientot");
    expect(etatValidite("2024-10-04", "2026-10-07", "2026-10-07")).toBe("bientot");
    expect(etatValidite("2024-10-04", "2026-10-06", "2026-10-07")).toBe("expiree");
    expect(etatValidite("2026-11-01", "2029-11-01", "2026-10-07")).toBe("future");
    expect(etatValidite(null, null, "2026-10-07")).toBe("valide");
  });
});

describe("analyserLignesRge", () => {
  const r = analyserLignesRge(RCP, "2026-10-07")!;

  it("regroupe par certificat, en cours d'abord, et liste les domaines couverts", () => {
    expect(r.siret).toBe("80419263100013");
    expect(r.entreprise).toBe("RCP");
    expect(r.adresse).toBe("12 rue des Lilas, 47230 BARBASTE");
    expect(r.rge).toBe(true);
    expect(r.certificats).toHaveLength(2);
    expect(r.certificats[0].etat).toBe("valide");
    expect(r.certificats[0].organisme).toBe("Qualibat");
    expect(r.certificats[0].pdf).toBe(true);
    expect(r.certificats[0].qualifications.map((q) => q.code)).toEqual(["4131D114", "4131D115"]);
    expect(r.certificats[1].etat).toBe("expiree");
    expect(r.domainesValides).toEqual(["Isolation des combles perdus", "Isolation des planchers bas"]);
  });

  it("domaine échu non compté ; aucune qualification en cours = pas RGE", () => {
    expect(r.domainesValides).not.toContain("Isolation des murs par l'extérieur");
    const echu = analyserLignesRge([RCP[2]], "2026-10-07")!;
    expect(echu.rge).toBe(false);
    expect(echu.domainesValides).toEqual([]);
  });

  it("plusieurs domaines dans une ligne (AFNOR) ; liste vide = null", () => {
    const afnor = analyserLignesRge(
      [
        ligne({
          organisme: "afnor",
          url_qualification: "https://certificats-attestations.afnor.org/certification=109281114903",
          domaine: "Audit énergétique Maison individuelle; Audit énergétique Logement collectif",
          nom_qualification: "AUDIT ENERGETIQUE BATIMENT (CP032)",
          code_qualification: "CP032",
        }),
      ],
      "2026-10-07"
    )!;
    expect(afnor.domainesValides).toEqual(["Audit énergétique Maison individuelle", "Audit énergétique Logement collectif"]);
    expect(afnor.certificats[0].pdf).toBe(false);
    expect(analyserLignesRge([], "2026-10-07")).toBeNull();
  });
});

describe("domainesAttendus", () => {
  it("lit l'objet du devis, sans accents ni majuscules", () => {
    expect(domainesAttendus("Isolation ITE")).toEqual([DOMAINES_RGE.ite]);
    expect(domainesAttendus("Isolation thermique par l'extérieur des façades")).toEqual([DOMAINES_RGE.ite]);
    expect(domainesAttendus("Remplacement des menuiseries")).toEqual([DOMAINES_RGE.fenetres]);
    expect(domainesAttendus("Fenêtres de toit")).toEqual([DOMAINES_RGE.fenetresToit]);
    expect(domainesAttendus("VMC hygro B")).toEqual([DOMAINES_RGE.ventilation]);
    expect(domainesAttendus("Isolation des plafonds de caves")).toEqual([DOMAINES_RGE.plancherBas]);
    expect(domainesAttendus("Chaudière gaz à condensation")).toEqual([DOMAINES_RGE.chaudiere]);
    expect(domainesAttendus("Chaudière à granulés")).toEqual([DOMAINES_RGE.chaudiereBois]);
    expect(domainesAttendus("PAC air/eau")).toEqual([DOMAINES_RGE.pac]);
  });

  it("plusieurs lots dans l'objet ; objet vide ou sans rapport : rien", () => {
    expect(domainesAttendus("ITE + combles + VMC")).toEqual([DOMAINES_RGE.ite, DOMAINES_RGE.combles, DOMAINES_RGE.ventilation]);
    expect(domainesAttendus("")).toEqual([]);
    expect(domainesAttendus("Ravalement de la cage d'escalier")).toEqual([]);
    expect(domainesAttendus("Suite et site")).toEqual([]);
  });
});

describe("couvertureDomaines", () => {
  it("compare aux domaines en cours, malgré les espaces doublés de la source", () => {
    const r = analyserLignesRge(
      [...RCP, ligne({ code_qualification: "X", domaine: "Isolation par l'intérieur des murs ou rampants de toitures  ou plafonds" })],
      "2026-10-07"
    );
    expect(couvertureDomaines(r, [DOMAINES_RGE.combles, DOMAINES_RGE.ite, DOMAINES_RGE.iti])).toEqual([
      { domaine: DOMAINES_RGE.combles, couvert: true },
      { domaine: DOMAINES_RGE.ite, couvert: false },
      { domaine: DOMAINES_RGE.iti, couvert: true },
    ]);
    expect(couvertureDomaines(null, [DOMAINES_RGE.ite])).toEqual([{ domaine: DOMAINES_RGE.ite, couvert: false }]);
  });
});

describe("situationADate", () => {
  const r = analyserLignesRge(RCP.slice(0, 2), "2026-10-07");
  it("devis couvert, antérieur au cycle en cours, ou sans date", () => {
    expect(situationADate(r, "2025-06-12")).toBe("couvert");
    expect(situationADate(r, "2024-01-15")).toBe("anterieur");
    expect(situationADate(r, "2028-01-15")).toBe("posterieur");
    expect(situationADate(r, null)).toBeNull();
  });
});

describe("etablissements", () => {
  it("dédoublonne par SIRET, écarte l'établissement vérifié, département de la copro d'abord", () => {
    const lignes = [
      ligne({ siret: "48519755200352", nom_entreprise: "SOPREMA ENTREPRISES", code_postal: "86000", commune: "POITIERS" }),
      ligne({ siret: "48519755200352", nom_entreprise: "SOPREMA ENTREPRISES", code_postal: "86000", commune: "POITIERS" }),
      ligne({ siret: "48519755200295", nom_entreprise: "SOPREMA ENTREPRISES", code_postal: "57070", commune: "METZ" }),
      ligne({ siret: "48519755200999", nom_entreprise: "SOPREMA ENTREPRISES", code_postal: "67100", commune: "STRASBOURG" }),
    ];
    expect(etablissements(lignes, "67000").map((e) => e.commune)).toEqual(["STRASBOURG", "POITIERS", "METZ"]);
    expect(etablissements(lignes, null, "48519755200352").map((e) => e.siret)).toEqual(["48519755200295", "48519755200999"]);
  });
});

describe("petits utilitaires", () => {
  it("SIRET, organismes, liens PDF, types de documents", () => {
    expect(formaterSiret("80419263100013")).toBe("804 192 631 00013");
    expect(formaterSiret("804 192")).toBe("804 192");
    expect(nomOrganisme("qualitenr")).toBe("Qualit'EnR");
    expect(nomOrganisme("inconnu-x")).toBe("inconnu-x");
    expect(certificatPdf("https://www.qualifelec.fr/certifmoteur/59735/753375.pdf")).toBe(true);
    expect(certificatPdf("https://www.qualypso.fr/download_file.php?id=5c93")).toBe(true);
    expect(certificatPdf("http://opqibi.com/fiche/2689")).toBe(false);
    expect(certificatPdf(null)).toBe(false);
    expect(verificationRgePour("devis_travaux")).toBe(true);
    expect(verificationRgePour("cctp_dce")).toBe(false);
    expect(verificationRgePour(null)).toBe(false);
  });
});
