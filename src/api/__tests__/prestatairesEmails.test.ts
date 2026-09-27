import { describe, expect, it } from "vitest";
import { emailValide, normaliserEmails } from "../prestataires";

describe("normaliserEmails", () => {
  it("garde la principale et les copies, nettoyées", () => {
    expect(normaliserEmails(" Contact@Atelier.fr ", ["compta@atelier.fr", " Chantier@Atelier.fr"])).toEqual({
      email: "contact@atelier.fr",
      emails_secondaires: ["compta@atelier.fr", "chantier@atelier.fr"],
    });
  });

  it("retire les vides et les doublons, y compris la principale répétée", () => {
    expect(normaliserEmails("a@x.fr", ["", "A@x.fr", "b@x.fr", "b@x.fr "])).toEqual({
      email: "a@x.fr",
      emails_secondaires: ["b@x.fr"],
    });
  });

  it("fait monter la première copie quand la principale est vide", () => {
    expect(normaliserEmails("", ["b@x.fr", "c@x.fr"])).toEqual({ email: "b@x.fr", emails_secondaires: ["c@x.fr"] });
    expect(normaliserEmails(null, [])).toEqual({ email: null, emails_secondaires: [] });
  });
});

describe("emailValide", () => {
  it("accepte une adresse, refuse le reste", () => {
    expect(emailValide("contact@atelier-g5.fr")).toBe(true);
    expect(emailValide(" contact@atelier-g5.fr ")).toBe(true);
    expect(emailValide("contact@atelier")).toBe(false);
    expect(emailValide("deux mots@x.fr")).toBe(false);
  });
});
