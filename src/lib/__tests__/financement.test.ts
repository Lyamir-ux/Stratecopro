import { describe, expect, it } from "vitest";
import { ecoPtzPossible } from "../financement";

describe("ecoPtzPossible", () => {
  it("ouvert dès qu'un lot d'habitation est à son nom", () => {
    expect(ecoPtzPossible([{ usage: "habitation" }])).toBe(true);
    expect(ecoPtzPossible([{ usage: "garage" }, { usage: "habitation" }, { usage: "caves" }])).toBe(true);
  });

  it("fermé pour un copropriétaire qui n'a que des garages, caves ou locaux d'activité", () => {
    expect(ecoPtzPossible([{ usage: "garage" }, { usage: "caves" }])).toBe(false);
    expect(ecoPtzPossible([{ usage: "commerces" }, { usage: "bureaux" }, { usage: "autres" }])).toBe(false);
  });

  it("fermé sans aucun lot", () => {
    expect(ecoPtzPossible([])).toBe(false);
  });
});
