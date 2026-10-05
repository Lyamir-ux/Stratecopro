import { describe, expect, it } from "vitest";
import {
  GROUPES_DIAGNOSTIC,
  GROUPES_ETUDES,
  GROUPES_TRAVAUX,
  recapPhases,
  type TachePortail,
} from "../recapPhases";
import { buildTaskTemplate } from "../taskTemplate";
import type { PhaseId } from "../referentiels";

/** Tâches du gabarit d'un dossier en phase `phase`, avec les titres donnés faits. */
const gabarit = (phase: PhaseId, faites: string[] = []): TachePortail[] =>
  buildTaskTemplate(phase).map((t) => ({
    phase: t.phase,
    titre: t.title,
    fait: t.status === "done" || faites.includes(t.title),
    en_cours: t.status === "doing" && !faites.includes(t.title),
  }));

describe("récapitulatif des étapes du portail (idées d'Amir des 02/10 et 05/10/2026)", () => {
  it("les groupes couvrent exactement les tâches de chaque phase du gabarit", () => {
    const titres = (p: PhaseId) =>
      buildTaskTemplate("travaux").filter((t) => t.phase === p).map((t) => t.title).sort();
    expect(GROUPES_DIAGNOSTIC.flatMap((g) => g.taches).sort()).toEqual(titres("diagnostic"));
    expect(GROUPES_ETUDES.flatMap((g) => g.taches).sort()).toEqual(titres("etudes"));
    expect(GROUPES_TRAVAUX.flatMap((g) => g.taches).sort()).toEqual(titres("travaux"));
  });

  it("phase Diagnostic : tâches en cours puis reste, tous les travaux restent", () => {
    const r = recapPhases({ phase: "diagnostic", energyBefore: "E", dateAg: null, taches: gabarit("diagnostic") });
    expect(r.diagnostic).toEqual({
      mode: "encours",
      items: ["Recensement des copropriétaires et des lots"],
      suite: [
        "Consultations préalables",
        "Vérification de l'audit énergétique",
        "Enquête sociale auprès des copropriétaires",
      ],
    });
    expect(r.etudes).toBeUndefined();
    expect(r.travaux).toEqual({ mode: "reste", items: GROUPES_TRAVAUX.map((g) => g.libelle) });
  });

  it("phase Diagnostic : rien à afficher tant que les tâches ne sont pas chargées", () => {
    const r = recapPhases({ phase: "diagnostic", energyBefore: "E", dateAg: null, taches: undefined });
    expect(r.diagnostic).toBeUndefined();
    expect(r.travaux?.items).toHaveLength(4);
  });

  it("phase Études : récap du diagnostic avec l'étiquette actuelle, études en cours", () => {
    const r = recapPhases({ phase: "etudes", energyBefore: "E", dateAg: null, taches: gabarit("etudes") });
    expect(r.diagnostic?.mode).toBe("realise");
    expect(r.diagnostic?.items).toContain("Audit énergétique vérifié (étiquette E)");
    expect(r.etudes).toEqual({
      mode: "encours",
      items: ["Scénarios de travaux et chiffrage", "Plans de financement et aides"],
      suite: ["Consultation des entreprises", "Préparation du dossier d'assemblée générale"],
    });
    expect(r.travaux?.items).toHaveLength(4);
  });

  it("phase Études : sans tâche en cours, simple liste de ce qui reste", () => {
    const taches = gabarit("etudes").map((t) => ({ ...t, en_cours: false }));
    expect(recapPhases({ phase: "etudes", energyBefore: null, dateAg: null, taches }).etudes).toEqual({
      mode: "reste",
      items: GROUPES_ETUDES.map((g) => g.libelle),
    });
  });

  it("phase Travaux : récap des études avec la date d'AG, en cours puis reste", () => {
    const r = recapPhases({
      phase: "travaux",
      energyBefore: null,
      dateAg: "2026-05-12",
      taches: gabarit("travaux", ["Dépôt des dossiers des aides", "Mobilisation des prêts"]),
    });
    expect(r.diagnostic?.items).toContain("Audit énergétique vérifié");
    expect(r.etudes?.items).toContain("Dossier préparé pour l'AG du 12 mai 2026");
    // « Suivi de chantier » est en cours ; « Demandes d'acompte » reste à faire dans le même groupe
    expect(r.travaux).toEqual({
      mode: "encours",
      items: ["Réalisation du chantier"],
      suite: ["Réception des travaux", "Versement du solde des aides"],
    });
  });

  it("phase Travaux : rien tant que les tâches ne sont pas chargées", () => {
    expect(recapPhases({ phase: "travaux", energyBefore: null, dateAg: null, taches: undefined }).travaux).toBeUndefined();
  });

  it("toutes les tâches Travaux faites : étapes réalisées", () => {
    const tout = gabarit("travaux").map((t) => t.titre);
    const r = recapPhases({ phase: "travaux", energyBefore: null, dateAg: null, taches: gabarit("travaux", tout) });
    expect(r.travaux).toEqual({ mode: "realise", items: ["Toutes les étapes des travaux sont réalisées"] });
  });
});
