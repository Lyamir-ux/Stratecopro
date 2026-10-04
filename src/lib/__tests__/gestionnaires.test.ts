import { describe, expect, it } from "vitest";
import { emailsDuGestionnaire, gestionnairesConnus } from "../gestionnaires";

const dossiers = [
  { gestionnaire_nom: "Thuy NGUYEN", gestionnaire_email: "tnguyen@citya.com", syndic_name: "Citya Ruhl Segesca" },
  { gestionnaire_nom: "Thuy  Nguyen ", gestionnaire_email: "TNguyen@citya.com", syndic_name: "Citya Ruhl Segesca" },
  { gestionnaire_nom: "Nicolas KERN", gestionnaire_email: "nkern@immium.com", syndic_name: "IMMIUM Laemmel" },
  { gestionnaire_nom: "Nicolas KERN", gestionnaire_email: "nicolas.kern@immium.com", syndic_name: "IMMIUM Laemmel" },
  { gestionnaire_nom: "Nicolas KERN", gestionnaire_email: "nicolas.kern@immium.com", syndic_name: "IMMIUM Laemmel" },
  { gestionnaire_nom: "Gaëlle PICART", gestionnaire_email: "contact@bsimmobilier.net", syndic_name: "BS Immobilier" },
  { gestionnaire_nom: "Sans Mail", gestionnaire_email: null, syndic_name: "Foncia" },
  { gestionnaire_nom: null, gestionnaire_email: "orphelin@exemple.fr", syndic_name: null },
];

describe("gestionnaires connus", () => {
  const connus = gestionnairesConnus(dossiers);

  it("un gestionnaire par nom, avec ses adresses, sans les noms sans e-mail", () => {
    expect(connus.map((g) => g.nom)).toEqual(["Gaëlle PICART", "Nicolas KERN", "Thuy NGUYEN"]);
    const thuy = connus.find((g) => g.nom === "Thuy NGUYEN")!;
    expect(thuy.emails).toEqual([{ email: "tnguyen@citya.com", syndic: "Citya Ruhl Segesca", dossiers: 2 }]);
  });

  it("propose l'adresse enregistrée, casse et accents ignorés", () => {
    expect(emailsDuGestionnaire(connus, "thuy nguyen").map((e) => e.email)).toEqual(["tnguyen@citya.com"]);
    expect(emailsDuGestionnaire(connus, "GAELLE picart").map((e) => e.email)).toEqual(["contact@bsimmobilier.net"]);
    expect(emailsDuGestionnaire(connus, "Inconnu")).toEqual([]);
    expect(emailsDuGestionnaire(connus, "  ")).toEqual([]);
  });

  it("plusieurs adresses : la plus fréquente d'abord, celle du syndic saisi en tête", () => {
    expect(emailsDuGestionnaire(connus, "Nicolas Kern").map((e) => e.email)).toEqual(["nicolas.kern@immium.com", "nkern@immium.com"]);
    const homonymes = gestionnairesConnus([
      ...dossiers,
      { gestionnaire_nom: "Nicolas Kern", gestionnaire_email: "nk@foncia.fr", syndic_name: "Foncia Strasbourg" },
    ]);
    expect(emailsDuGestionnaire(homonymes, "Nicolas Kern", "foncia strasbourg")[0].email).toBe("nk@foncia.fr");
  });
});
