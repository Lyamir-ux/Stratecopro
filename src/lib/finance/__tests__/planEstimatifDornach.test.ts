// PF estimatif Dornach III (23/09/2026) : 5 scénarios, le 4 « Scénario choisi »
// seul intégré (Amir) ; postes fusionnés en colonne A, assiette MPR écrite en
// total moins les lignes non retenues, tantièmes sur 1 000, prorata énergétique
// de la MPR études saisi en dur (recalculé par le logiciel, arbitrage d'Amir).
import { describe, expect, it } from "vitest";
import { read, write } from "xlsx";
import { computePlanDefinitif, type PlanDefinitifResult } from "../planDefinitif";
import { estClasseurEstimatif, exportPlanEstimatif, importPlanEstimatif, LIBELLE_AJUSTEMENT_TVA } from "../planEstimatif";
import { makeClasseurDornach } from "./fixtureDornachEstimatif";

// Valeurs affichées par le classeur (colonnes D à H)
const CLASSEUR = {
  totalHt: [150000, 199000, 161000, 210000, 216000],
  retenu: [135000, 184000, 146000, 195000, 195000],
  ttc: [159352.5, 211047.5, 170957.5, 222652.5, 229252.5],
  moe: [67826.7919, 69890.7919, 70455.5919, 72719.5919, 73435.5919],
  operation: [235146.9169, 291490.6669, 249960.9669, 306504.7169, 314150.7169],
};

describe("import du PF estimatif Dornach III (5 scénarios)", () => {
  const wb = makeClasseurDornach();
  const { scenarios, controles, avertissements } = importPlanEstimatif(wb);
  const R: PlanDefinitifResult[] = scenarios.map((s) => computePlanDefinitif(s.data));
  const aide = (k: number, libelle: string) => R[k].aides.find((a) => a.libelle === libelle)!.montant;

  it("lit l'en-tête « Scénario 4 : Scénario choisi » comme le scénario 4", () => {
    expect(estClasseurEstimatif(wb)).toBe(true);
    expect(scenarios.map((s) => s.ordre)).toEqual([1, 2, 3, 4, 5]);
    expect(scenarios.map((s) => s.libelle)).toEqual(["", "", "", "Scénario choisi", ""]);
    const d = scenarios[3].data;
    expect(d.infos.nomCopro).toBe("Dornach III");
    expect(d.infos.nbLogements).toBe(11);
    expect(d.infos.surfaceHabitable).toBe(428);
    expect([d.infos.cepInitial, d.infos.cepProjet]).toEqual([311, 123]);
    expect([d.infos.etiquetteInitiale, d.infos.etiquetteProjet]).toEqual(["E", "C"]);
    expect(d.infos.dispositifClimaxion).toBe(true);
  });

  it("groupe les lignes d'un poste fusionné en colonne A dans un seul lot", () => {
    const lots = scenarios[3].data.lots;
    expect(lots.map((l) => l.titre)).toEqual([
      "ITE et plancher bas",
      "Toiture",
      "Menuiseries",
      "VMC",
      "Chauffage",
      "Électricité",
      "Sanitaire",
      "Peinture",
      "EP",
      "Platerie",
      "Maçonnerie",
    ]);
    expect(lots[1].lignes.map((l) => [l.designation, l.montantHt, l.tvaPct])).toEqual([
      ["Plafond vers combles", 10500, 5.5],
      ["Modification et adaptation toiture", 5000, 10],
    ]);
    // désignation « Ventilation » fusionnée sur la ligne de plus-value (sans libellé en B25)
    expect(lots[3].lignes.map((l) => [l.designation, l.montantHt])).toEqual([
      ["Ventilation", 30000],
      ["Ventilation", 18000],
    ]);
    expect(lots[3].lignes[1].commentaire).toContain("Plus value pour cheminement");
    // la chaudière du scénario 5 rejoint le lot Chauffage, même numéro d'un scénario à l'autre
    const chauffage = scenarios[4].data.lots.find((l) => l.titre === "Chauffage")!;
    expect(chauffage.numero).toBe(lots[4].numero);
    expect(chauffage.lignes.map((l) => l.designation)).toEqual(["Adaptation du réseau", "Remplacement chaudière"]);
    const lignes = scenarios.flatMap((s) => s.data.lots.flatMap((l) => l.lignes));
    expect(lignes.some((l) => l.designation === LIBELLE_AJUSTEMENT_TVA)).toBe(false);
  });

  it("lit l'assiette MPR écrite en total moins les lignes non retenues", () => {
    const nonRetenues = (k: number) =>
      scenarios[k].data.lots.flatMap((l) => l.lignes.filter((x) => !x.retenu).map((x) => x.designation));
    expect(nonRetenues(3)).toEqual(["Modification et adaptation toiture", "Electricité", "Sanitaire / Assainissement", "Peinture"]);
    // « H35-H22-H27-… » : chaudière gaz hors assiette au scénario 5
    expect(nonRetenues(4)).toContain("Remplacement chaudière");
  });

  it("retrouve travaux, MOE et opération du classeur au centime", () => {
    for (let k = 0; k < 5; k++) {
      expect(R[k].totalTravauxHt).toBeCloseTo(CLASSEUR.totalHt[k], 2);
      expect(R[k].assietteMprTravaux).toBeCloseTo(CLASSEUR.retenu[k], 2);
      expect(R[k].totalTravauxTtc).toBeCloseTo(CLASSEUR.ttc[k], 2);
      expect(R[k].totalMoeTtc).toBeCloseTo(CLASSEUR.moe[k], 2);
      expect(R[k].totalOperationTtc).toBeCloseTo(CLASSEUR.operation[k], 2);
    }
    // seuls les totaux d'aides s'écartent : prorata de la MPR études recalculé
    const ko = controles.filter((c) => !c.ok).map((c) => c.libelle);
    expect([...new Set(ko)]).toEqual(["Total aides", "Reste à charge définitif collectif", "Reste à financer"]);
  });

  it("recalcule la MPR études du scénario choisi avec le prorata assiette / travaux HT", () => {
    // classeur : prorata 0,929 figé → 16 318,05 € ; logiciel : 195 000 / 210 000
    expect(aide(3, "Maprimerénov' partie études")).toBeCloseTo(16310.52, 2);
    expect(avertissements.some((a) => a.startsWith("Scénario 4 : Aide « Maprimerénov' partie études » : prorata"))).toBe(true);
    expect(aide(3, "Maprimerénov' partie travaux")).toBeCloseTo(78975, 2);
    expect(aide(3, "Maprimerénov' AMO")).toBeCloseTo(4500, 2);
    expect(aide(3, "Coup de pouce CEE")).toBeCloseTo(11556, 2);
    expect(aide(3, "CLIMAXION Aide travaux")).toBe(37500);
    expect(aide(3, "EMS Aide travaux")).toBe(11000);
    expect(aide(3, "EMS Aide MOE")).toBeCloseTo(9511.515, 3);
    expect(aide(3, "EMS Aide AMO")).toBe(1500);
    expect(R[3].totalAides).toBeCloseTo(170853.03, 2);
    expect(R[3].resteACharge).toBeCloseTo(100251.68, 2);
    expect(R[3].collectif.resteAFinancer).toBeCloseTo(111807.68, 2);
  });

  it("lit les tantièmes sur 1 000, le fonds travaux et le déjà appelé cumulés", () => {
    const p = scenarios[3].data.params;
    expect(p.totalTantiemes).toBe(1000);
    expect(p.tantiemesExemples).toEqual([83, 112]);
    expect(p.fondsTravaux).toBe(35400);
    expect(p.imprevusPct).toBe(5);
    expect(p.coefAssurance).toBe(1.03);
    expect(scenarios[3].data.variantes).toEqual({ collectif: true, collectifSansAvance: false, individuel: false });
    expect(R[3].collectif.exemples[0].quotePartAvant).toBeCloseTo(25439.8915, 3);
  });
});

describe("export du PF estimatif Dornach III puis réimport", () => {
  const source = importPlanEstimatif(makeClasseurDornach()).scenarios;
  const buf = write(exportPlanEstimatif(source), { type: "buffer", bookType: "xlsx" });
  const relu = importPlanEstimatif(read(buf, { type: "buffer" }));

  it("redonne les mêmes scénarios", () => {
    expect(relu.scenarios).toEqual(source);
    expect(relu.controles.filter((c) => !c.ok)).toEqual([]);
  });
});
