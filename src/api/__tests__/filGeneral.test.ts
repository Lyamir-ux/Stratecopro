import { describe, expect, it } from "vitest";
import { nonLusFilGeneral } from "../messages";

// Fil général « Équipe Strat Eco » (0124) : chaque côté compte les messages de
// l'autre, postérieurs à son repère de lecture.
const messages = [
  { prestataire_id: "a", auteur_role: "presta", created_at: "2026-10-01T16:00:00Z" },
  { prestataire_id: "a", auteur_role: "amo", created_at: "2026-10-01T16:10:00Z" },
  { prestataire_id: "a", auteur_role: "presta", created_at: "2026-10-01T16:20:00Z" },
  { prestataire_id: "b", auteur_role: "presta", created_at: "2026-10-01T15:00:00Z" },
];

describe("nonLusFilGeneral", () => {
  it("l'équipe compte les messages des entreprises, par entreprise", () => {
    const n = nonLusFilGeneral(messages, [], "amo");
    expect(n.get("a")).toBe(2);
    expect(n.get("b")).toBe(1);
  });
  it("le repère de lecture éteint les messages lus", () => {
    const n = nonLusFilGeneral(messages, [{ prestataire_id: "a", last_read_at: "2026-10-01T16:05:00Z" }], "amo");
    expect(n.get("a")).toBe(1);
  });
  it("l'entreprise compte les réponses de l'équipe", () => {
    const n = nonLusFilGeneral(messages, [], "presta");
    expect(n.get("a")).toBe(1);
    expect(n.has("b")).toBe(false);
  });
});
