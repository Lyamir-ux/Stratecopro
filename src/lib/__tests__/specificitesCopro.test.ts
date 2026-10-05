import { describe, expect, it } from "vitest";
import { noteResteAFinancer, texteEtiquetteVisee } from "../specificitesCopro";

const ARMORIAL = "48ad2833-ab56-43ee-ad17-0053734d4032";

describe("particularités du portail par copropriété", () => {
  it("Armorial : rappel hors vente des combles, sans montant", () => {
    const note = noteResteAFinancer(ARMORIAL);
    expect(note).toBe("Le reste à financer s'entend hors vente des combles.");
    expect(note).not.toMatch(/\d/);
  });

  it("Armorial : la phrase de l'étiquette n'évoque plus l'étage, l'exposition ni les équipements", () => {
    const t = texteEtiquetteVisee(ARMORIAL);
    expect(t).toContain("DPE collectif de la copropriété");
    expect(t).toContain("et non de l'étiquette individuelle de votre logement");
    expect(t).not.toMatch(/étage|exposition|équipements/);
  });

  it("les autres copropriétés gardent le texte standard et aucune note", () => {
    expect(noteResteAFinancer("autre-id")).toBeNull();
    expect(noteResteAFinancer(undefined)).toBeNull();
    expect(texteEtiquetteVisee("autre-id")).toMatch(/étage, son exposition ou ses équipements/);
    expect(texteEtiquetteVisee(null)).toBe(texteEtiquetteVisee("autre-id"));
  });
});
