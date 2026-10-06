// Correction du nom d'un copropriétaire en un clic (idée d'Amir du 06/10/2026).
import { describe, expect, it } from "vitest";
import { nettoyerNom, verdictNom } from "../nomCoproprietaire";

describe("correction du nom d'un copropriétaire", () => {
  it("nettoie les espaces de la saisie", () => {
    expect(nettoyerNom("  DUPONT   Jean ")).toBe("DUPONT Jean");
    expect(nettoyerNom("DUPONT" + String.fromCharCode(160, 8239) + "Jean")).toBe("DUPONT Jean");
    expect(nettoyerNom("   ")).toBe("");
  });

  it("refuse un nom vide, ignore un nom inchangé, accepte une correction", () => {
    expect(verdictNom("   ", "MULER Anne")).toEqual({ etat: "vide" });
    expect(verdictNom("MULER Anne", "MULER Anne")).toEqual({ etat: "inchange" });
    // seuls les espaces changent : rien à enregistrer
    expect(verdictNom(" MULER  Anne ", "MULER Anne")).toEqual({ etat: "inchange" });
    expect(verdictNom("MULLER Anne", "MULER Anne")).toEqual({ etat: "modifie", nom: "MULLER Anne" });
    // la casse est une vraie correction
    expect(verdictNom("Muller Anne", "MULLER Anne")).toEqual({ etat: "modifie", nom: "Muller Anne" });
  });
});
