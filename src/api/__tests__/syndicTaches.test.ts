import { describe, expect, it } from "vitest";
import { dossierTermine, phaseAvancement } from "../syndicTaches";

const t = (phase: string, statut: string) => ({ phase, statut }) as Parameters<typeof phaseAvancement>[1][number];

// Dossier « Terminé » côté syndic (feedback Amir 23/09) : toutes les tâches
// validées - bulle ardoise dans le portefeuille, badge sur la fiche.
describe("dossierTermine", () => {
  it("est vrai quand toutes les tâches sont faites", () => {
    expect(dossierTermine([t("diagnostic", "done"), t("etudes", "done"), t("travaux", "done")])).toBe(true);
  });
  it("est faux dès qu'une tâche reste à faire ou en cours", () => {
    expect(dossierTermine([t("diagnostic", "done"), t("travaux", "doing")])).toBe(false);
    expect(dossierTermine([t("diagnostic", "done"), t("travaux", "todo")])).toBe(false);
  });
  it("se replie sur les compteurs de copro_stats sans tâches chargées", () => {
    expect(dossierTermine([], { staches_total: 22, staches_faites: 22 })).toBe(true);
    expect(dossierTermine([], { staches_total: 22, staches_faites: 21 })).toBe(false);
  });
  it("n'est jamais vrai sans aucune tâche (gabarit pas encore semé)", () => {
    expect(dossierTermine([])).toBe(false);
    expect(dossierTermine([], { staches_total: 0, staches_faites: 0 })).toBe(false);
    expect(dossierTermine([], null)).toBe(false);
  });
  it("les tâches chargées priment sur des compteurs en retard", () => {
    expect(dossierTermine([t("travaux", "todo")], { staches_total: 22, staches_faites: 22 })).toBe(false);
  });
});

describe("phaseAvancement", () => {
  it("reste sur la dernière phase à tâches quand tout est fait", () => {
    expect(phaseAvancement("diagnostic", [t("diagnostic", "done"), t("travaux", "done")])).toBe("travaux");
  });
});
