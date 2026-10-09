import { describe, expect, it } from "vitest";
import { nettoyerEmail, noteApresChangement, verdictEmail } from "@/lib/emailCoproprietaire";

describe("nettoyerEmail", () => {
  it("retire les espaces de bord, multiples et insécables", () => {
    expect(nettoyerEmail("  jean@x.fr  ")).toBe("jean@x.fr");
    expect(nettoyerEmail("a@x.fr  /   b@y.fr")).toBe("a@x.fr / b@y.fr");
    expect(nettoyerEmail("jean@x.fr ")).toBe("jean@x.fr");
  });
});

describe("verdictEmail", () => {
  it("une adresse seule est enregistrée en minuscules", () => {
    expect(verdictEmail("  Jean.Dupont@Exemple.FR ", "ancien@x.fr")).toEqual({
      etat: "modifie",
      email: "jean.dupont@exemple.fr",
    });
  });

  it("sans changement : rien à enregistrer", () => {
    expect(verdictEmail("jean@x.fr", "jean@x.fr")).toEqual({ etat: "inchange" });
    expect(verdictEmail("  jean@x.fr  ", "jean@x.fr")).toEqual({ etat: "inchange" });
    expect(verdictEmail("", "")).toEqual({ etat: "inchange" });
    expect(verdictEmail("   ", null)).toEqual({ etat: "inchange" });
  });

  it("une adresse déjà minuscule mais saisie en majuscules est ramenée en minuscules", () => {
    expect(verdictEmail("JEAN@X.FR", "jean@x.fr")).toEqual({ etat: "inchange" });
    expect(verdictEmail("JEAN@X.FR", "Jean@X.fr")).toEqual({ etat: "modifie", email: "jean@x.fr" });
  });

  it("vider le champ efface l'adresse", () => {
    expect(verdictEmail("", "jean@x.fr")).toEqual({ etat: "modifie", email: null });
    expect(verdictEmail("  ", "jean@x.fr")).toEqual({ etat: "modifie", email: null });
  });

  it("refuse une saisie sans adresse exploitable", () => {
    expect(verdictEmail("pas d'adresse", "jean@x.fr")).toEqual({ etat: "invalide" });
    expect(verdictEmail("jean@societe", "jean@x.fr")).toEqual({ etat: "invalide" });
    expect(verdictEmail("@x.fr", "jean@x.fr")).toEqual({ etat: "invalide" });
  });

  it("plusieurs adresses : conservées telles que saisies (espaces nettoyés), la première sert", () => {
    expect(verdictEmail("a@x.fr  /  b@y.fr", "a@x.fr")).toEqual({ etat: "modifie", email: "a@x.fr / b@y.fr" });
    expect(verdictEmail("a@x.fr / b@y.fr", "a@x.fr / b@y.fr")).toEqual({ etat: "inchange" });
  });
});

describe("noteApresChangement", () => {
  it("espace jamais utilisé : l'identifiant a suivi, il faut renvoyer l'invitation", () => {
    const n = noteApresChangement("suit", 0);
    expect(n).toContain("Adresse de connexion mise à jour");
    expect(n).toContain("Renvoyez l'invitation");
    expect(n).not.toContain("autre");
  });

  it("signale les autres fiches reliées au même compte, au singulier et au pluriel", () => {
    expect(noteApresChangement("suit", 1)).toContain("1 autre fiche :");
    expect(noteApresChangement("suit", 3)).toContain("3 autres fiches :");
  });

  it("espace déjà utilisé : le compte garde son identifiant", () => {
    expect(noteApresChangement("garde", 0)).toContain("déjà connecté");
  });

  it("adresse d'un compte orphelin : la fiche l'a repris, sans e-mail, l'ancien compte reste", () => {
    const n = noteApresChangement("relie", 0, "Marius MAZZANTE");
    expect(n).toContain("(Marius MAZZANTE)");
    expect(n).toContain("sans aucune fiche");
    expect(n).toContain("mot de passe habituel");
    expect(n).toContain("aucun e-mail n'est envoyé");
    expect(noteApresChangement("relie", 0)).not.toContain("()");
  });

  it("sans espace ou compte introuvable : rien à dire", () => {
    expect(noteApresChangement("aucun", 0)).toBeNull();
    expect(noteApresChangement("introuvable", 0)).toBeNull();
  });
});
