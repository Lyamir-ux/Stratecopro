import { describe, expect, it } from "vitest";
import { extractIbans } from "../ribCheck";
import { isValidBic, isValidIban, normalizeIban } from "../adhesion";

// IBAN de test valide (clé 76 correcte)
const IBAN = "FR7630001007941234567890185";

describe("isValidIban", () => {
  it("accepte un IBAN français valide, espacé ou non", () => {
    expect(isValidIban(IBAN)).toBe(true);
    expect(isValidIban("FR76 3000 1007 9412 3456 7890 185")).toBe(true);
  });
  it("refuse une clé de contrôle fausse ou un format invalide", () => {
    expect(isValidIban("FR7530001007941234567890185")).toBe(false);
    expect(isValidIban("FR76")).toBe(false);
    expect(isValidIban("")).toBe(false);
  });
});

describe("isValidBic", () => {
  it("accepte 8 ou 11 caractères", () => {
    expect(isValidBic("CEPAFRPP")).toBe(true);
    expect(isValidBic("CEPAFRPP513")).toBe(true);
    expect(isValidBic("cepafrpp513")).toBe(true);
  });
  it("refuse le reste", () => {
    expect(isValidBic("CEPA")).toBe(false);
    expect(isValidBic("CEPAFRPP51")).toBe(false);
  });
});

describe("extractIbans", () => {
  it("trouve l'IBAN dans un texte de RIB, même suivi du mot BIC", () => {
    // cas réel : la regex gourmande avalait « BIC » comme groupe - la clé de
    // contrôle doit ramener le candidat à l'IBAN exact
    const text = "IBAN : FR76 3000 1007 9412 3456 7890 185 BIC : CEPAFRPP513";
    expect(extractIbans(text)).toEqual([IBAN]);
  });
  it("trouve un IBAN compact", () => {
    expect(extractIbans(`Compte ${IBAN} ouvert le…`)).toEqual([IBAN]);
  });
  it("ignore les faux candidats (clé invalide)", () => {
    expect(extractIbans("FR75 3000 1007 9412 3456 7890 185")).toEqual([]);
    expect(extractIbans("aucun iban ici")).toEqual([]);
  });
  it("normalise la casse et les espaces", () => {
    expect(normalizeIban("fr76 3000 1007 9412 3456 7890 185".toUpperCase())).toBe(IBAN);
  });
});
