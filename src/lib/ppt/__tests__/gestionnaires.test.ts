import { describe, expect, it } from "vitest";
import { NON_ATTRIBUE, messageTransfert, optionsGestionnaire, patchGestionnaire, valeurActuelle, type MembreEnseigne } from "../gestionnaires";

const membres: MembreEnseigne[] = [
  { user_id: "u1", nom: "Thomas Keller", email: "Thomas.Keller@syndic3000.fr", org_role: "gestionnaire" },
  { user_id: "u2", nom: "Hélène Marchal", email: "helene.marchal@syndic3000.fr", org_role: "directeur" },
  { user_id: "u3", nom: "Sans e-mail", email: null, org_role: "gestionnaire" },
];
const vide = { gestionnaire_nom: null, gestionnaire_email: null };

describe("valeurActuelle", () => {
  it("prend l'e-mail en minuscules, sinon le nom, sinon non attribué", () => {
    expect(valeurActuelle({ gestionnaire_nom: "Thomas", gestionnaire_email: " Thomas.Keller@Syndic3000.fr " })).toBe("thomas.keller@syndic3000.fr");
    expect(valeurActuelle({ gestionnaire_nom: "Paul", gestionnaire_email: null })).toBe("nom:Paul");
    expect(valeurActuelle(vide)).toBe(NON_ATTRIBUE);
  });
});

describe("optionsGestionnaire", () => {
  it("liste les comptes de l'enseigne ayant un e-mail, triés par nom, avec leur rôle", () => {
    const o = optionsGestionnaire(membres, vide);
    expect(o.map((x) => x.libelle)).toEqual(["Hélène Marchal (direction)", "Thomas Keller (gestionnaire)"]);
    expect(o.every((x) => !x.horsListe)).toBe(true);
  });
  it("garde en tête un gestionnaire de la fiche sans compte dans l'enseigne", () => {
    const o = optionsGestionnaire(membres, { gestionnaire_nom: "Eric LEROUX", gestionnaire_email: "eric@exemple.fr" });
    expect(o[0]).toEqual({ valeur: "eric@exemple.fr", libelle: "Eric LEROUX <eric@exemple.fr> - sans compte dans l'enseigne", horsListe: true });
    expect(o).toHaveLength(3);
  });
  it("n'ajoute rien quand le gestionnaire de la fiche a un compte", () => {
    expect(optionsGestionnaire(membres, { gestionnaire_nom: "T. Keller", gestionnaire_email: "thomas.keller@syndic3000.fr" })).toHaveLength(2);
  });
});

describe("patchGestionnaire", () => {
  it("pose le nom et l'e-mail du compte choisi", () => {
    expect(patchGestionnaire(membres, vide, "thomas.keller@syndic3000.fr")).toEqual({ gestionnaire_nom: "Thomas Keller", gestionnaire_email: "thomas.keller@syndic3000.fr" });
  });
  it("retire le gestionnaire", () => {
    expect(patchGestionnaire(membres, { gestionnaire_nom: "Paul", gestionnaire_email: "paul@x.fr" }, NON_ATTRIBUE)).toEqual(vide);
  });
  it("ne change rien sur la valeur actuelle ou une valeur inconnue", () => {
    const c = { gestionnaire_nom: "Eric", gestionnaire_email: "eric@exemple.fr" };
    expect(patchGestionnaire(membres, c, "eric@exemple.fr")).toBeNull();
    expect(patchGestionnaire(membres, vide, NON_ATTRIBUE)).toBeNull();
    expect(patchGestionnaire(membres, vide, "inconnu@x.fr")).toBeNull();
  });
});

describe("messageTransfert", () => {
  const copro = { nom: "Les Tilleuls", gestionnaire_nom: "Thomas Keller", gestionnaire_email: "thomas.keller@syndic3000.fr" };
  it("annonce le transfert et la perte d'accès de l'ancien gestionnaire", () => {
    expect(messageTransfert(copro, { gestionnaire_nom: "Hélène Marchal", gestionnaire_email: "helene.marchal@syndic3000.fr" }))
      .toBe("Confier « Les Tilleuls » à Hélène Marchal ? Thomas Keller n'y aura plus accès. L'historique est conservé.");
  });
  it("se contente de l'e-mail quand le nom manque, sans ancien gestionnaire", () => {
    expect(messageTransfert({ ...copro, ...vide }, { gestionnaire_nom: null, gestionnaire_email: "paul@x.fr" }))
      .toBe("Confier « Les Tilleuls » à paul@x.fr ? L'historique est conservé.");
  });
  it("annonce le retrait", () => {
    expect(messageTransfert(copro, vide)).toBe("Retirer Thomas Keller de « Les Tilleuls » ? Seule la direction de l'enseigne y aura accès.");
  });
});
