// PF estimatif L'Hippocrate (23/09/2026) : pas de « Lot NN », TVA 5,5 % / 10 %
// dans la formule du TTC, dommage ouvrage saisi en montant, MPR à 45 % sur des
// scénarios sous 50 % de gain (Amir : 30 % retenu, l'import le signale).
import { describe, expect, it } from "vitest";
import { read, write } from "xlsx";
import { computePlanDefinitif, type PlanDefinitifResult } from "../planDefinitif";
import { estClasseurEstimatif, exportPlanEstimatif, importPlanEstimatif, LIBELLE_AJUSTEMENT_TVA } from "../planEstimatif";
import { makeClasseurHippocrate } from "./fixtureHippocrateEstimatif";

// Valeurs affichées par le classeur (colonnes D, E, F)
const CLASSEUR = {
  totalHt: [408080, 423070, 520670],
  retenu: [268800, 283790, 381390],
  ttc: [437084.5, 452898.95, 555866.95],
  moe: [92745.32, 94116.905, 105280.105],
  operation: [573538.27, 592305.75, 716733.75],
  aides: [153737.1582, 160207.5379, 289012.7075],
  publiques: [140007.6582, 146478.0379, 275283.2075],
  mprEtudes: [11774.90823, 12174.33795, 14951.50745],
  resteACharge: [373686.7018, 385983.8021, 381606.6325],
  resteAFinancer: [387416.2018, 399713.3021, 395336.1325],
  tauxCouverture: [0.2680503922, 0.2704811458, 0.4032358005],
};

describe("import du PF estimatif L'Hippocrate (3 scénarios)", () => {
  const wb = makeClasseurHippocrate();
  const { scenarios, controles, avertissements } = importPlanEstimatif(wb);
  const R: PlanDefinitifResult[] = scenarios.map((s) => computePlanDefinitif(s.data));
  const aide = (k: number, libelle: string) => R[k].aides.find((a) => a.libelle === libelle)!.montant;

  it("lit les trois scénarios et les infos de l'immeuble", () => {
    expect(estClasseurEstimatif(wb)).toBe(true);
    expect(scenarios.map((s) => s.ordre)).toEqual([1, 2, 3]);
    const d = scenarios[0].data;
    expect(d.infos.nomCopro).toBe("L'Hippocrate");
    expect(d.infos.nbLogements).toBe(17);
    expect(d.infos.surfaceHabitable).toBe(565);
    expect([d.infos.etiquetteInitiale, d.infos.etiquetteProjet]).toEqual(["E", "C"]);
    expect(scenarios.map((s) => s.data.infos.cepProjet)).toEqual([177, 173, 132]);
    expect(scenarios.map((s) => s.data.infos.dispositifClimaxion)).toEqual([false, false, true]);
  });

  it("fait un lot par ligne sans « Lot NN », titré par la désignation", () => {
    const lots = (k: number) => scenarios[k].data.lots;
    expect(lots(0).map((l) => l.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(lots(2).map((l) => l.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(lots(0)[2].titre).toBe("Isolation mur ITE");
    expect(lots(2)[13].titre).toBe("Remplacement des menuiseries des parties privatives");
    const retenus = (k: number) => lots(k).filter((l) => l.lignes.some((x) => x.retenu)).map((l) => l.numero);
    expect(retenus(0)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(retenus(2)).toEqual([1, 2, 3, 4, 5, 6, 7, 14]);
  });

  it("lit la TVA 5,5 % / 10 % de chaque ligne dans la formule du TTC, sans ajustement", () => {
    const parTva = (k: number, tva: number) =>
      scenarios[k].data.lots.filter((l) => l.lignes[0].tvaPct === tva).map((l) => l.numero);
    expect(parTva(0, 5.5)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(parTva(0, 10)).toEqual([1, 8, 9, 10, 11, 12, 13]);
    expect(parTva(2, 5.5)).toEqual([2, 3, 4, 5, 6, 7, 14]);
    const lignes = scenarios.flatMap((s) => s.data.lots.flatMap((l) => l.lignes));
    expect(lignes.some((l) => l.designation === LIBELLE_AJUSTEMENT_TVA)).toBe(false);
    expect(avertissements.some((a) => a.startsWith("TVA non détaillée"))).toBe(false);
  });

  it("garde le dommage ouvrage saisi en forfait, les autres MOE depuis leurs formules", () => {
    const moe = (k: number, designation: string) => scenarios[k].data.moe.find((m) => m.designation === designation)!;
    expect(scenarios.map((s) => moe(s.ordre - 1, "Dommage ouvrage").montant)).toEqual([
      { mode: "forfait", montantHt: 9056 },
      { mode: "forfait", montantHt: 9056 },
      { mode: "forfait", montantHt: 9856 },
    ]);
    expect(moe(0, "Dommage ouvrage").tvaPct).toBe(0);
    expect(moe(0, "Maîtrise d'œuvre phase travaux").montant).toEqual({ mode: "pctTravauxHt", taux: 4.5 });
    expect(moe(0, "Maîtrise d'œuvre phase travaux").tvaPct).toBe(10);
    expect(moe(0, "Honoraires syndic").montant).toEqual({ mode: "pctTravauxHt", taux: 3.5 });
    expect(moe(0, "Assistance Maîtrise d'Ouvrage (phase conseil)").montant).toEqual({ mode: "forfait", montantHt: 4500 });
    // éligibilités MPR = lignes des formules MPR études / AMO (tests d'étanchéité au scénario 3)
    expect(scenarios.map((s) => s.data.moe.filter((m) => m.eligibleMprEtudes).length)).toEqual([7, 7, 9]);
    expect(scenarios[0].data.moe.filter((m) => m.eligibleMprAmo)).toHaveLength(3);
  });

  it("retrouve les totaux du classeur au centime", () => {
    expect(controles.filter((c) => !c.ok)).toEqual([]);
    expect(controles).toHaveLength(30);
    for (let k = 0; k < 3; k++) {
      expect(R[k].totalTravauxHt).toBeCloseTo(CLASSEUR.totalHt[k], 2);
      expect(R[k].assietteMprTravaux).toBeCloseTo(CLASSEUR.retenu[k], 2);
      expect(R[k].totalTravauxTtc).toBeCloseTo(CLASSEUR.ttc[k], 2);
      expect(R[k].totalMoeTtc).toBeCloseTo(CLASSEUR.moe[k], 2);
      expect(R[k].totalOperationTtc).toBeCloseTo(CLASSEUR.operation[k], 2);
      expect(R[k].totalAides).toBeCloseTo(CLASSEUR.aides[k], 2);
      expect(R[k].totalAidesPubliques).toBeCloseTo(CLASSEUR.publiques[k], 2);
      expect(aide(k, "Maprimerénov' partie études")).toBeCloseTo(CLASSEUR.mprEtudes[k], 2);
      expect(R[k].resteACharge).toBeCloseTo(CLASSEUR.resteACharge[k], 2);
      expect(R[k].collectif.resteAFinancer).toBeCloseTo(CLASSEUR.resteAFinancer[k], 2);
      expect(R[k].tauxCouverture).toBeCloseTo(CLASSEUR.tauxCouverture[k], 8);
    }
  });

  it("lit les aides Climaxion et EMS du scénario 3", () => {
    const calcul = (k: number, libelle: string) => scenarios[k].data.aides.find((a) => a.libelle === libelle)!.calcul;
    expect(calcul(2, "Climaxion Travaux")).toEqual({ mode: "forfaitPlusParLogement", base: 10000, parLogement: 2500, surEquivalent: true });
    expect(aide(2, "Climaxion Travaux")).toBe(52500);
    expect(aide(2, "Climaxion individuelle")).toBe(17000);
    expect(aide(2, "EMS aide travaux")).toBe(17000);
    expect(aide(0, "Climaxion Travaux")).toBeNull();
    expect(aide(0, "EMS aide MOE")).toBeCloseTo(13368.75, 2);
  });

  it("signale le taux MPR 45 % des scénarios sous 50 % de gain", () => {
    const palier = avertissements.filter((a) => a.includes("donne le palier à 30 %"));
    expect(palier.map((a) => a.slice(0, 12))).toEqual(["Scénario 1 :", "Scénario 2 :"]);
    expect(palier[0]).toContain("gain énergétique (38,8 %)");
  });

  it("cumule le montant déjà appelé au fonds travaux, tantièmes sur 10 000", () => {
    const p = scenarios[0].data.params;
    expect(p.fondsTravaux).toBe(46114.41);
    expect(p.totalTantiemes).toBe(10000);
    expect(p.tantiemesExemples).toEqual([370, 803]);
    expect(p.imprevusPct).toBe(10);
    expect(scenarios[0].data.variantes).toEqual({ collectif: true, collectifSansAvance: false, individuel: false });
  });
});

describe("export du PF estimatif L'Hippocrate puis réimport", () => {
  const source = importPlanEstimatif(makeClasseurHippocrate()).scenarios;
  const buf = write(exportPlanEstimatif(source), { type: "buffer", bookType: "xlsx" });
  const relu = importPlanEstimatif(read(buf, { type: "buffer" }));

  it("redonne les mêmes scénarios, MOE propre au scénario 3 à sa place", () => {
    expect(relu.scenarios).toEqual(source);
    expect(relu.controles.filter((c) => !c.ok)).toEqual([]);
  });

  it("écrit le TTC travaux en formule par taux de TVA, relue sans avertissement", () => {
    expect(relu.avertissements.some((a) => a.startsWith("TVA non détaillée"))).toBe(false);
  });
});
