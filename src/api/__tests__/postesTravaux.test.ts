import { describe, expect, it } from "vitest";
import {
  consultationAvecPostes,
  lirePostesTravaux,
  postesAEnregistrer,
  totalPostesTravaux,
} from "../consultations";

describe("consultationAvecPostes (idée de Louis du 13/10/2026)", () => {
  it("MOE, contrôle technique, SPS et diagnostic amiante et plomb", () => {
    expect(consultationAvecPostes("moe")).toBe(true);
    expect(consultationAvecPostes("ct")).toBe(true);
    expect(consultationAvecPostes("sps")).toBe(true);
    expect(consultationAvecPostes("diag", "amiante_plomb")).toBe(true);
  });
  it("ni le test d'étanchéité, ni les autres métiers", () => {
    expect(consultationAvecPostes("diag", "etancheite")).toBe(false);
    expect(consultationAvecPostes("diag", null)).toBe(false);
    expect(consultationAvecPostes("be")).toBe(false);
    expect(consultationAvecPostes("pppt_dpe")).toBe(false);
    expect(consultationAvecPostes("autre")).toBe(false);
  });
});

describe("lirePostesTravaux / postesAEnregistrer", () => {
  it("écarte les lignes sans poste et nettoie les textes", () => {
    const postes = postesAEnregistrer([
      { poste: "  Isolation des façades ", montant: 120000, precisions: " ITE " },
      { poste: "   ", montant: 5000, precisions: "ligne oubliée" },
      { poste: "Toiture", montant: null, precisions: "" },
    ]);
    expect(postes).toEqual([
      { poste: "Isolation des façades", montant: 120000, precisions: "ITE" },
      { poste: "Toiture", montant: null, precisions: "" },
    ]);
  });
  it("relit une colonne JSON abîmée sans planter", () => {
    expect(lirePostesTravaux(null)).toEqual([]);
    expect(lirePostesTravaux({})).toEqual([]);
    expect(lirePostesTravaux(["x", 3, null, { poste: 4 }, { poste: "VMC", montant: "12" }])).toEqual([
      { poste: "VMC", montant: null, precisions: "" },
    ]);
  });
});

describe("totalPostesTravaux", () => {
  it("somme les postes chiffrés", () => {
    expect(
      totalPostesTravaux([
        { poste: "A", montant: 1000, precisions: "" },
        { poste: "B", montant: null, precisions: "" },
        { poste: "C", montant: 250.5, precisions: "" },
      ])
    ).toBe(1250.5);
  });
  it("null quand aucun poste n'est chiffré", () => {
    expect(totalPostesTravaux([{ poste: "A", montant: null, precisions: "" }])).toBeNull();
    expect(totalPostesTravaux([])).toBeNull();
  });
});
