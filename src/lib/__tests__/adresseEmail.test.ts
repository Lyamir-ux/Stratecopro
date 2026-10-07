import { describe, expect, it } from "vitest";
import { premiereAdresse } from "@/lib/adresseEmail";

describe("premiereAdresse", () => {
  it("rend l'adresse unique en minuscules", () => {
    expect(premiereAdresse("Jean.Dupont@Exemple.fr")).toBe("jean.dupont@exemple.fr");
    expect(premiereAdresse("  jean@exemple.fr ")).toBe("jean@exemple.fr");
  });

  it("ne garde que la première de plusieurs adresses, quel que soit le séparateur", () => {
    expect(premiereAdresse("a@x.fr / b@y.fr")).toBe("a@x.fr");
    expect(premiereAdresse("a@x.fr ; b@y.fr")).toBe("a@x.fr");
    expect(premiereAdresse("a@x.fr; b@y.fr")).toBe("a@x.fr");
    expect(premiereAdresse("a@x.fr / / c@z.fr")).toBe("a@x.fr");
    expect(premiereAdresse("a@x.fr, b@y.fr")).toBe("a@x.fr");
  });

  it("ignore le texte autour de l'adresse", () => {
    expect(premiereAdresse("Mme Martin <martin@exemple.fr>")).toBe("martin@exemple.fr");
    expect(premiereAdresse("martin@exemple.fr.")).toBe("martin@exemple.fr");
  });

  it("rend null sans adresse exploitable", () => {
    expect(premiereAdresse(null)).toBeNull();
    expect(premiereAdresse("")).toBeNull();
    expect(premiereAdresse("pas d'e-mail")).toBeNull();
    expect(premiereAdresse("contact@societe")).toBeNull();
  });
});
