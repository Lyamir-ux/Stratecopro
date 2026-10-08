import { describe, expect, it } from "vitest";
import { lienVueAmo, lienVueCopropriete, lienVueSyndic } from "../vuesCopro";

describe("bascule AMO <-> syndic", () => {
  it("garde l'onglet qui existe des deux côtés", () => {
    for (const onglet of ["projet", "donnees", "financement", "enquete", "fichiers"]) {
      expect(lienVueSyndic("c1", onglet)).toBe(`/syndic/copros/c1/${onglet}`);
      expect(lienVueAmo("c1", onglet)).toBe(`/copros/c1/${onglet}`);
    }
  });

  it("onglet AMO sans pendant syndic : Projet", () => {
    for (const onglet of ["coproprietaires", "prestataires", "communications", undefined, "inconnu"]) {
      expect(lienVueSyndic("c1", onglet)).toBe("/syndic/copros/c1/projet");
    }
  });

  it("montage bancaire et suivi financier : plans de financement côté AMO", () => {
    expect(lienVueAmo("c1", "banque")).toBe("/copros/c1/financement");
    expect(lienVueAmo("c1", "suivi")).toBe("/copros/c1/financement");
    expect(lienVueAmo("c1", undefined)).toBe("/copros/c1/projet");
  });

  it("portail copropriétaire : aperçu ouvert sur la copropriété du dossier", () => {
    expect(lienVueCopropriete("c1")).toBe("/portail?copro=c1");
  });
});
