import { describe, expect, it } from "vitest";
import { CHEF_NON_ATTRIBUE, chefProjetEst, dansPerimetre, libellePerimetre, perimetreTaches } from "../perimetreChef";

describe("dossiers d'un chef de projet", () => {
  it("reconnaît les dossiers d'un chef de projet saisi en clair", () => {
    expect(chefProjetEst("Radia", "Radia")).toBe(true);
    expect(chefProjetEst(" radia ", "RADIA")).toBe(true);
    expect(chefProjetEst("Thea", "Théa")).toBe(true);
    expect(chefProjetEst("Cyrielle", "Cyrielle MILEKIC")).toBe(true);
    expect(chefProjetEst("Cyrielle Milekic", "Cyrielle MILEKIC")).toBe(true);
    expect(chefProjetEst("Kawtar", "Radia")).toBe(false);
    expect(chefProjetEst(null, "Radia")).toBe(false);
    expect(chefProjetEst("", "")).toBe(false);
    expect(chefProjetEst("Radia", undefined)).toBe(false);
  });
});

describe("périmètre de « Vos tâches »", () => {
  it("sans choix sur le tableau de bord : les dossiers du compte connecté", () => {
    const p = perimetreTaches("", "Radia");
    expect(p).toEqual({ type: "moi", nom: "Radia" });
    expect(dansPerimetre(p, "Radia")).toBe(true);
    expect(dansPerimetre(p, "radia")).toBe(true);
    expect(dansPerimetre(p, "Kawtar")).toBe(false);
    expect(dansPerimetre(p, null)).toBe(false);
    expect(libellePerimetre(p)).toBe("vos dossiers");
    // compte sans nom : aucun dossier
    expect(dansPerimetre(perimetreTaches("", null), "Radia")).toBe(false);
  });

  it("chef de projet choisi sur le tableau de bord : ses dossiers, même règle que le filtre", () => {
    const p = perimetreTaches("Kawtar", "Amir");
    expect(dansPerimetre(p, "Kawtar")).toBe(true);
    expect(dansPerimetre(p, "Amir")).toBe(false);
    expect(libellePerimetre(p)).toBe("les dossiers de Kawtar");
  });

  it("« Non attribués » : les dossiers sans chef de projet", () => {
    const p = perimetreTaches(CHEF_NON_ATTRIBUE, "Amir");
    expect(dansPerimetre(p, null)).toBe(true);
    expect(dansPerimetre(p, "  ")).toBe(true);
    expect(dansPerimetre(p, "Radia")).toBe(false);
    expect(libellePerimetre(p)).toBe("les dossiers sans chef de projet");
  });
});
