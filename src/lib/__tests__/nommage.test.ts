import { describe, expect, it } from "vitest";
import {
  champsDepuisNom,
  construireNomFichier,
  NOMENCLATURE_CEGEE,
  nomFichierSansAccents,
  nomRenomme,
  nomSansExtension,
  TYPES_DOCUMENT,
  typeDepuisNom,
  typesDepuisNom,
  type ChampsNom,
} from "@/lib/nommage";

// Feedback d'Amir du 09/09/2026 : plus d'accent ni de caractère spécial dans
// les noms de fichiers (ils ressortaient en « %C3%A9 » au téléchargement).
describe("nomFichierSansAccents", () => {
  it("retire les accents et conserve l'extension", () => {
    expect(nomFichierSansAccents("Rapport énergétique - Été 2026.pdf")).toBe("Rapport energetique - Ete 2026.pdf");
  });

  it("translittère les ligatures", () => {
    expect(nomFichierSansAccents("Œuvre cœur.docx")).toBe("OEuvre coeur.docx");
  });

  it("remplace les caractères spéciaux par un tiret et garde parenthèses, points, soulignés", () => {
    expect(nomFichierSansAccents("PV AG (2025) n°3 : vote_travaux ?.pdf")).toBe("PV AG (2025) n-3 - vote_travaux.pdf");
  });

  it("ne modifie pas un nom déjà propre", () => {
    expect(nomFichierSansAccents("Devis FACADES - 2026-03-01.pdf")).toBe("Devis FACADES - 2026-03-01.pdf");
  });

  it("ne renvoie jamais une chaîne vide", () => {
    expect(nomFichierSansAccents("???")).toBe("-");
    expect(nomFichierSansAccents("   ")).toBe("fichier");
  });
});

// Feedback d'Amir du 02/10/2026 : bouton « Modifier » pour renommer un fichier
// déjà déposé dans l'onglet Fichiers.
describe("nomRenomme", () => {
  it("conserve l'extension d'origine, retapée ou non", () => {
    expect(nomRenomme("PV AG lancement AMO", "ancien.pdf")).toBe("PV AG lancement AMO.pdf");
    expect(nomRenomme("PV AG lancement AMO.PDF", "ancien.pdf")).toBe("PV AG lancement AMO.pdf");
  });

  it("enregistre le nom sans accent comme au dépôt", () => {
    expect(nomRenomme("  Contrat maîtrise d'œuvre signé ", "x.pdf")).toBe("Contrat maitrise d-oeuvre signe.pdf");
  });

  it("refuse une saisie vide", () => {
    expect(nomRenomme("   ", "x.pdf")).toBeNull();
    expect(nomRenomme(".pdf", "x.pdf")).toBeNull();
  });

  it("accepte un fichier sans extension", () => {
    expect(nomRenomme("Notes", "LISEZMOI")).toBe("Notes");
  });

  it("nomSansExtension retire seulement l'extension", () => {
    expect(nomSansExtension("35 RUE D-ILLKIRCH - PV AG - 2026-01-19.pdf")).toBe("35 RUE D-ILLKIRCH - PV AG - 2026-01-19");
    expect(nomSansExtension("LISEZMOI")).toBe("LISEZMOI");
  });
});

describe("champsDepuisNom", () => {
  it("relit objet, émetteur et date d'un nom normalisé", () => {
    expect(champsDepuisNom("RENAISSANCE - Devis - Isolation ITE - SOPREMA - 2026-09-12.pdf")).toEqual({
      type: "devis",
      objet: "Isolation ITE",
      emetteur: "SOPREMA",
      date: "2026-09-12",
    });
  });

  it("libellé à « / » coupé au dépôt, segments absents", () => {
    expect(champsDepuisNom("LE FORUM - Devis - DPGF des travaux - Menuiseries - RCP - 2026-10-01 - signe.pdf")).toEqual({
      type: "devis_travaux",
      objet: "Menuiseries",
      emetteur: "RCP",
      date: "2026-10-01",
    });
    expect(champsDepuisNom("LE FORUM - Devis - RCP.pdf")).toEqual({ type: "devis", objet: null, emetteur: "RCP", date: null });
    expect(champsDepuisNom("LE FORUM - Devis - Ventilation.pdf")).toEqual({ type: "devis", objet: "Ventilation", emetteur: null, date: null });
    expect(champsDepuisNom("scan_0042.pdf")).toEqual({ type: null, objet: null, emetteur: null, date: null });
  });
});

// Nomenclature de numérisation de la Caisse d'Épargne Grand Est (colonne D, 08/10/2026) :
// les pièces du dossier de prêt commencent par le terme de la banque, la copropriété suit.
describe("nomenclature de la Caisse d'Épargne Grand Est", () => {
  const champs = (type: string, extra: Partial<ChampsNom> = {}): ChampsNom => ({
    prefixe: "Le Forum", type, objet: null, emetteur: null, date: null, etat: null, ...extra,
  });

  it("ouvre le nom par le terme de la banque, la copropriété vient après", () => {
    expect(construireNomFichier(champs("attestation_impayes", { date: "2026-10-01" }), "pdf")).toBe(
      "TAUX DE DEFAILLANCE - LE FORUM - 2026-10-01.pdf"
    );
    expect(construireNomFichier(champs("pv_ag_travaux"), "pdf")).toBe("PV AG TRAVAUX - LE FORUM.pdf");
    expect(construireNomFichier(champs("attestation_non_recours"), "pdf")).toBe("ATT. NON RECOURS - LE FORUM.pdf");
  });

  it("garde objet, émetteur, date et état après la copropriété", () => {
    expect(
      construireNomFichier(champs("audit_energetique", { objet: "Audit réglementaire", emetteur: "Ingedair", date: "2026-09-12" }), "pdf")
    ).toBe("AUDIT - LE FORUM - Audit réglementaire - INGEDAIR - 2026-09-12.pdf");
  });

  // Amir 09/10/2026 : « DEVIS ENTREPRISE, ensuite le nom de l'entreprise, puis le nom de
  // la copro, et ensuite le reste » ; « DEVIS HONORAIRES » de même pour le contrat d'AMO.
  it("devis : l'entreprise suit le terme, la copropriété vient ensuite", () => {
    const devis = { objet: "ITE", emetteur: "Decopeint", date: "2026-10-09", etat: "signe" };
    for (const type of ["devis", "devis_travaux", "devis_fenetres", "marche_travaux"])
      expect(construireNomFichier(champs(type, devis), "pdf"), type).toBe("DEVIS ENTREPRISE - DECOPEINT - LE FORUM - ITE - 2026-10-09 - signe.pdf");
    for (const type of ["devis_honoraires_moe", "contrat_moe", "offre_moe", "offre_assurance", "convention_ct"])
      expect(construireNomFichier(champs(type, { emetteur: "Ingedair" }), "pdf"), type).toBe("DEVIS HONORAIRES - INGEDAIR - LE FORUM.pdf");
    expect(construireNomFichier(champs("devis_travaux"), "pdf")).toBe("DEVIS ENTREPRISE - LE FORUM.pdf");
  });

  it("contrat d'AMO : Strat Eco par défaut, l'entreprise saisie sinon", () => {
    expect(construireNomFichier(champs("contrat_amo", { etat: "signe" }), "pdf")).toBe("DEVIS HONORAIRES - STRAT ECO - LE FORUM - signe.pdf");
    expect(construireNomFichier(champs("contrat_amo", { emetteur: "Autre AMO" }), "pdf")).toBe("DEVIS HONORAIRES - AUTRE AMO - LE FORUM.pdf");
  });

  it("un « Devis » du dossier des études est un devis d'honoraires", () => {
    const sps = champs("devis", { objet: "SPS", emetteur: "Qualiconsult", dossier: "Devis des études techniques et Frais Annexes" });
    expect(construireNomFichier(sps, "pdf")).toBe("DEVIS HONORAIRES - QUALICONSULT - LE FORUM - SPS.pdf");
    expect(construireNomFichier({ ...sps, dossier: "Marchés de travaux" }, "pdf")).toBe("DEVIS ENTREPRISE - QUALICONSULT - LE FORUM - SPS.pdf");
  });

  it("« RIB XX » : l'entreprise est dans le terme", () => {
    expect(construireNomFichier(champs("rib_entreprises", { emetteur: "Soprema" }), "pdf")).toBe("RIB SOPREMA - LE FORUM.pdf");
    expect(construireNomFichier(champs("rib_entreprises"), "pdf")).toBe("RIB - LE FORUM.pdf");
  });

  // Amir 09/10/2026 : « RGE [nom de l'entreprise] », sans le nom de la copropriété
  it("« RGE XX » : l'entreprise est dans le terme, sans la copropriété", () => {
    const rge = champs("attestation_rge", { objet: "Qualibat", emetteur: "Decopeint", date: "2026-10-09" });
    expect(construireNomFichier(rge, "pdf")).toBe("RGE DECOPEINT - Qualibat - 2026-10-09.pdf");
    expect(construireNomFichier({ ...rge, emetteur: null }, "pdf")).toBe("RGE - Qualibat - 2026-10-09.pdf");
    expect(typeDepuisNom("RGE DECOPEINT - Qualibat - 2026-10-09.pdf")).toBe("attestation_rge");
    expect(champsDepuisNom("RGE DECOPEINT - Qualibat - 2026-10-09.pdf")).toEqual({
      type: "attestation_rge", objet: "Qualibat", emetteur: "DECOPEINT", date: "2026-10-09",
    });
    // nom d'avant le 09/10 : « RGE - COPRO - organisme - ENTREPRISE - date »
    expect(champsDepuisNom("RGE - 53 RUE DE LA COURSE - Qualibat - DECOPEINT - 2026-10-09.pdf")).toEqual({
      type: "attestation_rge", objet: "Qualibat", emetteur: "DECOPEINT", date: "2026-10-09",
    });
  });

  it("garde l'ancien ordre pour un type absent de la nomenclature", () => {
    expect(construireNomFichier(champs("facture", { objet: "Ventilation" }), "pdf")).toBe("LE FORUM - Facture - Ventilation.pdf");
    expect(construireNomFichier(champs("reglement_copropriete"), "pdf")).toBe("LE FORUM - Règlement de copropriété.pdf");
  });

  it("sans copropriété, le terme ouvre quand même le nom", () => {
    expect(construireNomFichier(champs("avis_sirene", { prefixe: null }), "pdf")).toBe("SIRENE.pdf");
  });

  it("ne contient jamais de caractère interdit dans un nom de fichier, et chaque type existe", () => {
    const ids = new Set(TYPES_DOCUMENT.map((t) => t.id));
    for (const [id, terme] of Object.entries(NOMENCLATURE_CEGEE)) {
      expect(ids.has(id), id).toBe(true);
      expect(terme, id).not.toMatch(/[\/:*?"<>|]/);
      expect(terme, id).toBe(terme.trim());
    }
  });

  it("retrouve le type d'un nom au nouveau format comme à l'ancien", () => {
    expect(typeDepuisNom("PV AG TRAVAUX - LE FORUM - 2026-06-12.pdf")).toBe("pv_ag_travaux");
    expect(typeDepuisNom("TAUX DE DEFAILLANCE - LE FORUM.pdf")).toBe("attestation_impayes");
    expect(typeDepuisNom("RIB SOPREMA - LE FORUM.pdf")).toBe("rib_entreprises");
    expect(typeDepuisNom("LE FORUM - Attestation du taux d'impayés - 2026-10-01.pdf")).toBe("attestation_impayes");
    expect(typeDepuisNom("scan_0042.pdf")).toBeNull();
  });

  it("un terme partagé par deux types les renvoie tous les deux, sans en choisir un", () => {
    expect(typesDepuisNom("RIB COMPTE TRAVAUX - LE FORUM.pdf").sort()).toEqual(["rib_compte_copro", "rib_compte_travaux"]);
    expect(typeDepuisNom("RIB COMPTE TRAVAUX - LE FORUM.pdf")).toBeNull();
    expect(typesDepuisNom("DEVIS ENTREPRISE - SOPREMA - LE FORUM.pdf").sort()).toEqual(
      ["devis", "devis_fenetres", "devis_travaux", "marche_travaux"]
    );
    expect(typesDepuisNom("DEVIS HONORAIRES - STRAT ECO - LE FORUM.pdf")).toContain("contrat_amo");
  });

  it("relit objet, émetteur et date d'un devis : entreprise puis copropriété", () => {
    const attendu = { type: "devis_travaux", objet: "ITE", emetteur: "DECOPEINT", date: "2026-10-09" };
    const nom = "DEVIS ENTREPRISE - DECOPEINT - 53 RUE DE LA COURSE - ITE - 2026-10-09 - signe.pdf";
    expect(champsDepuisNom(nom, "53 rue de la Course")).toEqual(attendu);
    expect(champsDepuisNom(nom)).toEqual(attendu);
    // copropriété à « - » dans son nom
    expect(champsDepuisNom("DEVIS HONORAIRES - ANBRA - 34 RUE WIMPHELING - 34 RUE GEILER - Ventilation.pdf", "34 rue Wimpheling - 34 rue Geiler"))
      .toEqual({ type: "devis_honoraires_moe", objet: "Ventilation", emetteur: "ANBRA", date: null });
    // sans entreprise
    expect(champsDepuisNom("DEVIS ENTREPRISE - LE FORUM - Ventilation.pdf", "Le Forum")).toEqual({
      type: "devis_travaux", objet: "Ventilation", emetteur: null, date: null,
    });
  });

  it("relit encore un devis à l'ordre du 08/10 (copropriété avant l'entreprise)", () => {
    expect(champsDepuisNom("DEVIS ENTREPRISE - 53 RUE DE LA COURSE - ITE - DECOPEINT - 2026-10-09.pdf", "53 RUE DE LA COURSE")).toEqual({
      type: "devis_travaux",
      objet: "ITE",
      emetteur: "DECOPEINT",
      date: "2026-10-09",
    });
    expect(champsDepuisNom("DEVIS ENTREPRISE - LE FORUM - Isolation ITE - SOPREMA - 2026-09-12 - signe.pdf")).toEqual({
      type: "devis_travaux",
      objet: "Isolation ITE",
      emetteur: "SOPREMA",
      date: "2026-09-12",
    });
  });

  it("relit objet, émetteur et date d'un nom au format de la banque", () => {
    expect(champsDepuisNom("RIB SOPREMA - LE FORUM - Isolation ITE - 2026-09-12.pdf")).toEqual({
      type: "rib_entreprises",
      objet: "Isolation ITE",
      emetteur: "SOPREMA",
      date: "2026-09-12",
    });
  });

  it("le nom construit se relit à l'identique", () => {
    const nom = construireNomFichier(
      champs("devis_travaux", { objet: "Isolation ITE", emetteur: "Soprema", date: "2026-09-12" }),
      "pdf"
    );
    expect(champsDepuisNom(nom, "Le Forum")).toMatchObject({ type: "devis_travaux", objet: "Isolation ITE", emetteur: "SOPREMA", date: "2026-09-12" });
    expect(champsDepuisNom(nom)).toMatchObject({ type: "devis_travaux", objet: "Isolation ITE", emetteur: "SOPREMA", date: "2026-09-12" });
  });
});
