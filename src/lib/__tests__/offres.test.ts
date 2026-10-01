import { describe, expect, it } from "vitest";
import { adresseComplete, lignesOffre } from "../offres";

const VIDE = {
  tarif_diag_avp: null,
  tarif_pro_dce: null,
  tarif_pro_dce_mode: "forfait",
  tarif_chantier: null,
  tarif_chantier_mode: "forfait",
  tarif_options: null,
  tarif_etancheite_avant: null,
  tarif_etancheite_apres: null,
  tarif_conception: null,
  tarif_realisation: null,
  tarif_pppt: null,
  tarif_dpe: null,
  delai_pppt_semaines: null,
  delai_dpe_semaines: null,
};
const option = (id: string) => (id === "dtg" ? "DTG" : id);
// espaces fines insécables du format français ramenées à des espaces simples
const texte = (l: { libelle: string; valeur: string }[]) =>
  l.map((x) => `${x.libelle} ${x.valeur}`.replace(/\s/g, " "));

describe("lignesOffre", () => {
  it("rien pour une offre au seul montant global", () => {
    expect(lignesOffre(VIDE, option)).toEqual([]);
  });
  it("phases CT / SPS (offre de Best Ryan)", () => {
    expect(texte(lignesOffre({ ...VIDE, tarif_conception: 1000, tarif_realisation: 2000 }, option))).toEqual([
      "Phase conception 1 000 €",
      "Phase réalisation 2 000 €",
    ]);
  });
  it("MOE : forfait, pourcentage et options", () => {
    const l = texte(
      lignesOffre(
        {
          ...VIDE,
          tarif_diag_avp: 12000,
          tarif_pro_dce: 2.5,
          tarif_pro_dce_mode: "pourcentage",
          tarif_chantier: 8000,
          tarif_options: { dtg: 1500 },
        },
        option
      )
    );
    expect(l).toEqual([
      "DIAG-AVP 12 000 €",
      "PRO-DCE 2,5 % du montant des travaux",
      "Suivi de chantier 8 000 €",
      "DTG 1 500 €",
    ]);
  });
  it("PPPT + DPE : prix et délais, prestation non chiffrée signalée", () => {
    expect(
      texte(lignesOffre({ ...VIDE, tarif_pppt: 4000, delai_pppt_semaines: 6, delai_dpe_semaines: 4 }, option))
    ).toEqual(["PPPT 4 000 € en 6 sem.", "DPE collectif non chiffré en 4 sem."]);
  });
});

describe("adresseComplete", () => {
  it("ajoute le code postal et la ville (Parc des Cigognes)", () => {
    expect(adresseComplete("12-14 rue des Cigognes", "67000", "Strasbourg")).toBe(
      "12-14 rue des Cigognes, 67000 Strasbourg"
    );
  });
  it("ne répète pas une adresse qui porte déjà son code postal", () => {
    expect(adresseComplete("3 rue X, 68100 Mulhouse", "68100", "Mulhouse")).toBe("3 rue X, 68100 Mulhouse");
    expect(adresseComplete("3 rue X 68100 Mulhouse", null, "Mulhouse")).toBe("3 rue X 68100 Mulhouse");
  });
  it("garde une rue qui porte le nom de la ville", () => {
    expect(adresseComplete("12 rue de Strasbourg", "67000", "Strasbourg")).toBe(
      "12 rue de Strasbourg, 67000 Strasbourg"
    );
  });
  it("adresse réduite à la ville, ou absente", () => {
    expect(adresseComplete("Strasbourg", null, "Strasbourg")).toBe("Strasbourg");
    expect(adresseComplete("strasbourg", "67000", "Strasbourg")).toBe("67000 Strasbourg");
    expect(adresseComplete(null, "67000", "Strasbourg")).toBe("67000 Strasbourg");
    expect(adresseComplete("", null, null)).toBe("");
  });
});
