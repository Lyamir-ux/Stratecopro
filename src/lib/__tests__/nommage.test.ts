import { describe, expect, it } from "vitest";
import { nomFichierSansAccents } from "@/lib/nommage";

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
