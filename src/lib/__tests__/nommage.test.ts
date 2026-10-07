import { describe, expect, it } from "vitest";
import { champsDepuisNom, nomFichierSansAccents, nomRenomme, nomSansExtension } from "@/lib/nommage";

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
