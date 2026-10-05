import { describe, expect, it } from "vitest";
import type { Membership } from "@/api/portail";
import { nomFichierPlanIndividuel } from "../planPdf";

const membership = (nom: string, copro: string) => ({ nom, copro: { name: copro } }) as unknown as Membership;

describe("nomFichierPlanIndividuel", () => {
  it("nomme le plan d'après le copropriétaire et la copropriété", () => {
    expect(nomFichierPlanIndividuel({ membership: membership("Marie MARTIN", "LA VIOLETTE") })).toBe(
      "Plan de financement - Marie MARTIN - LA VIOLETTE.pdf"
    );
  });

  it("retire les caractères interdits dans un nom de fichier", () => {
    expect(nomFichierPlanIndividuel({ membership: membership("A/B", "Rés. 2-4 rue X: bât. 1") })).toBe(
      "Plan de financement - A B - Rés. 2-4 rue X  bât. 1.pdf"
    );
  });
});
