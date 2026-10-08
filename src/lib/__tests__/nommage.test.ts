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
      construireNomFichier(
        champs("devis_travaux", { objet: "Isolation ITE", emetteur: "Soprema", date: "2026-09-12", etat: "signé" }),
        "pdf"
      )
    ).toBe("DEVIS ENTREPRISE - LE FORUM - Isolation ITE - SOPREMA - 2026-09-12 - signé.pdf");
  });

  it("« RIB XX » : l'entreprise est dans le terme", () => {
    expect(construireNomFichier(champs("rib_entreprises", { emetteur: "Soprema" }), "pdf")).toBe("RIB SOPREMA - LE FORUM.pdf");
    expect(construireNomFichier(champs("rib_entreprises"), "pdf")).toBe("RIB - LE FORUM.pdf");
  });

  it("garde l'ancien ordre pour un type absent de la nomenclature", () => {
    expect(construireNomFichier(champs("devis", { objet: "Ventilation" }), "pdf")).toBe("LE FORUM - Devis - Ventilation.pdf");
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
  });

  it("relit objet, émetteur et date d'un nom au format de la banque", () => {
    expect(champsDepuisNom("DEVIS ENTREPRISE - LE FORUM - Isolation ITE - SOPREMA - 2026-09-12 - signe.pdf")).toEqual({
      type: "devis_travaux",
      objet: "Isolation ITE",
      emetteur: "SOPREMA",
      date: "2026-09-12",
    });
    expect(champsDepuisNom("DEVIS ENTREPRISE - LE FORUM - SOPREMA.pdf")).toEqual({
      type: "devis_travaux",
      objet: null,
      emetteur: "SOPREMA",
      date: null,
    });
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
    expect(champsDepuisNom(nom)).toMatchObject({ type: "devis_travaux", objet: "Isolation ITE", emetteur: "SOPREMA", date: "2026-09-12" });
  });
});
