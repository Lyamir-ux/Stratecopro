import { describe, expect, it } from "vitest";
import { EXEMPLE } from "./exemple";
import { cloner } from "../import";
import { accepterEnBloc, aReprendre, bilanPropositions, commentaireRequis, decider, libelleChoix, lignesAReprendre, propositionsEnAttente, propositionsSansCommentaire, texteDecisions } from "../propositions";

describe("propositions du skill (pppt-verif/1.1)", () => {
  it("le jeu d'essai a trois propositions à valider, aucune à reprendre", () => {
    expect(propositionsEnAttente(EXEMPLE)).toHaveLength(3);
    expect(bilanPropositions(EXEMPLE)).toEqual({ total: 3, en_attente: 3, validees: 0, refusees: 0, modifiees: 0, a_reprendre: 0 });
    expect(lignesAReprendre(EXEMPLE).size).toBe(0);
  });

  it("décider est immuable et normalise le commentaire", () => {
    const j = decider(EXEMPLE, "P01", "REFUSEE", "  ITE abandonnée  ");
    expect(EXEMPLE.propositions[0].statut_validation).toBe("A_VALIDER");
    expect(j.propositions[0]).toMatchObject({ statut_validation: "REFUSEE", commentaire_validateur: "ITE abandonnée" });
    expect(decider(j, "P01", "VALIDEE", "").propositions[0].commentaire_validateur).toBeNull();
    // commentaire non fourni = conservé
    expect(decider(j, "P01", "MODIFIEE").propositions[0].commentaire_validateur).toBe("ITE abandonnée");
  });

  it("accepter en bloc tranche dans le sens du skill et respecte les décisions déjà prises", () => {
    const j = accepterEnBloc(decider(EXEMPLE, "P02", "MODIFIEE", "syndic 4 %"));
    expect(j.propositions.map((p) => p.statut_validation)).toEqual(["VALIDEE", "MODIFIEE", "REFUSEE"]);
    expect(propositionsEnAttente(j)).toHaveLength(0);
    // P03 refusée n'était pas appliquée : rien à reprendre ; P02 modifiée l'est
    expect(lignesAReprendre(j).size).toBe(0);
    expect(bilanPropositions(j).a_reprendre).toBe(1);
  });

  it("une décision à contre-courant du tableau désigne les lignes à reprendre", () => {
    const j = decider(decider(cloner(EXEMPLE), "P01", "REFUSEE", "ITE abandonnée"), "P03", "VALIDEE");
    expect(aReprendre(j.propositions[0])).toBe(true); // appliquée + refusée
    expect(aReprendre(j.propositions[2])).toBe(true); // alternative + retenue
    const lignes = lignesAReprendre(j);
    expect(lignes.get("T04")).toEqual(["P01", "P03"]);
    expect(lignes.get("T01")).toEqual(["P01"]);
    expect(lignes.has("T03")).toBe(false);
  });

  it("refuser une décision appliquée ou modifier exige un commentaire ; ne pas retenir une alternative, non", () => {
    expect(commentaireRequis({ appliquee_dans_ppt: true, statut_validation: "REFUSEE" })).toBe(true);
    expect(commentaireRequis({ appliquee_dans_ppt: false, statut_validation: "REFUSEE" })).toBe(false);
    expect(commentaireRequis({ appliquee_dans_ppt: false, statut_validation: "MODIFIEE" })).toBe(true);
    expect(commentaireRequis({ appliquee_dans_ppt: true, statut_validation: "VALIDEE" })).toBe(false);
    const j = decider(cloner(EXEMPLE), "P01", "REFUSEE", "");
    expect(propositionsSansCommentaire(j).map((p) => p.code)).toEqual(["P01"]);
  });

  it("les libellés des choix suivent le sens de la décision", () => {
    expect(libelleChoix({ appliquee_dans_ppt: true }, "VALIDEE")).toBe("Accepter");
    expect(libelleChoix({ appliquee_dans_ppt: false }, "VALIDEE")).toBe("Appliquer");
    expect(libelleChoix({ appliquee_dans_ppt: true }, "REFUSEE")).toBe("Refuser");
    expect(libelleChoix({ appliquee_dans_ppt: false }, "REFUSEE")).toBe("Ne pas retenir");
  });

  it("le texte des décisions est celui attendu par le skill pour régénérer l'Excel", () => {
    const j = decider(decider(accepterEnBloc(EXEMPLE), "P03", "REFUSEE"), "P02", "MODIFIEE", "syndic 4 %");
    expect(texteDecisions(j)).toBe("P01 oui, P02 modifier (syndic 4 %), P03 non");
  });

  it("un JSON sans bloc propositions se comporte comme une liste vide", () => {
    const j = { ...EXEMPLE, propositions: undefined as never };
    expect(propositionsEnAttente(j)).toEqual([]);
    expect(texteDecisions(j)).toBe("");
  });
});
