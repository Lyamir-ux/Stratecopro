import { describe, expect, it } from "vitest";
import { messageErreur } from "../erreurs";
import { scriptEntree } from "../version";

describe("messageErreur", () => {
  it("lit le message d'une erreur Supabase (objet simple, pas une instance d'Error)", () => {
    const e = { message: "Retour impossible : le syndic a déjà travaillé 1 poste(s)", code: "P0001", details: null, hint: null };
    expect(e instanceof Error).toBe(false);
    expect(messageErreur(e, "Retour en vérification refusé.")).toBe("Retour impossible : le syndic a déjà travaillé 1 poste(s)");
  });
  it("lit une Error et une chaîne", () => {
    expect(messageErreur(new Error("Échec du dépôt"), "x")).toBe("Échec du dépôt");
    expect(messageErreur("Hors ligne", "x")).toBe("Hors ligne");
  });
  it("retombe sur le texte de secours sinon", () => {
    expect(messageErreur(null, "secours")).toBe("secours");
    expect(messageErreur({ message: "  " }, "secours")).toBe("secours");
    expect(messageErreur({ code: 42 }, "secours")).toBe("secours");
    expect(messageErreur(new Error(""), "secours")).toBe("secours");
  });
});

describe("scriptEntree", () => {
  it("trouve le script d'entrée haché de index.html", () => {
    const html = '<head><script type="module" crossorigin src="/assets/index-BZdn7w8O.js"></script><link rel="stylesheet" href="/assets/index-Cx1.css"></head>';
    expect(scriptEntree(html)).toBe("/assets/index-BZdn7w8O.js");
  });
  it("rend null en développement ou sur une page sans bundle", () => {
    expect(scriptEntree('<script type="module" src="/src/main.tsx"></script>')).toBeNull();
  });
});
