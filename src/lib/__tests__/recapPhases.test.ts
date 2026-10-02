import { describe, expect, it } from "vitest";
import { GROUPES_TRAVAUX, recapPhases, type TacheTravaux } from "../recapPhases";
import { buildTaskTemplate } from "../taskTemplate";

const travauxGabarit = (faites: string[] = []): TacheTravaux[] =>
  buildTaskTemplate("travaux")
    .filter((t) => t.phase === "travaux")
    .map((t) => ({ titre: t.title, fait: faites.includes(t.title) }));

describe("récapitulatif des étapes du portail (idée d'Amir du 02/10/2026)", () => {
  it("les groupes Travaux couvrent exactement les tâches Travaux du gabarit", () => {
    const gabarit = travauxGabarit().map((t) => t.titre).sort();
    expect(GROUPES_TRAVAUX.flatMap((g) => g.taches).sort()).toEqual(gabarit);
  });

  it("phase Diagnostic : rien de réalisé, tous les travaux restent", () => {
    const r = recapPhases({ phase: "diagnostic", energyBefore: "E", dateAg: null, travaux: undefined });
    expect(r.diagnostic).toBeUndefined();
    expect(r.etudes).toBeUndefined();
    expect(r.travaux).toEqual({ mode: "reste", items: GROUPES_TRAVAUX.map((g) => g.libelle) });
  });

  it("phase Études : récap du diagnostic avec l'étiquette actuelle", () => {
    const r = recapPhases({ phase: "etudes", energyBefore: "E", dateAg: null, travaux: undefined });
    expect(r.diagnostic?.mode).toBe("realise");
    expect(r.diagnostic?.items).toContain("Audit énergétique vérifié (étiquette E)");
    expect(r.etudes).toBeUndefined();
    expect(r.travaux?.items).toHaveLength(4);
  });

  it("phase Travaux : récap des études avec la date d'AG, reste calculé sur les tâches", () => {
    const r = recapPhases({
      phase: "travaux",
      energyBefore: null,
      dateAg: "2026-05-12",
      travaux: travauxGabarit(["Dépôt des dossiers des aides", "Mobilisation des prêts", "Suivi de chantier"]),
    });
    expect(r.diagnostic?.items).toContain("Audit énergétique vérifié");
    expect(r.etudes?.items).toContain("Dossier préparé pour l'AG du 12 mai 2026");
    // « Demandes d'acompte » reste à faire : le chantier reste dans la liste
    expect(r.travaux).toEqual({
      mode: "reste",
      items: ["Réalisation du chantier", "Réception des travaux", "Versement du solde des aides"],
    });
  });

  it("phase Travaux : rien tant que les tâches ne sont pas chargées", () => {
    expect(recapPhases({ phase: "travaux", energyBefore: null, dateAg: null, travaux: undefined }).travaux).toBeUndefined();
  });

  it("toutes les tâches Travaux faites : étapes réalisées", () => {
    const tout = travauxGabarit().map((t) => t.titre);
    const r = recapPhases({ phase: "travaux", energyBefore: null, dateAg: null, travaux: travauxGabarit(tout) });
    expect(r.travaux).toEqual({ mode: "realise", items: ["Toutes les étapes des travaux sont réalisées"] });
  });
});
