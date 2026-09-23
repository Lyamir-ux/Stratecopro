// PF estimatif « 9 rue de la gare » (23/09/2026) : variante de nomenclature du
// classeur estimatif - en-têtes « Scénario V1 », pas de « Lot NN », TVA dans la
// formule du TTC, taux de MOE en colonne D, tantièmes sur 1000. Arbitrages
// d'Amir : bonus MPR plafonné, MPR études recalculée par le logiciel,
// mensualités sur 20 ans avec l'assurance ×1,03.
import { describe, expect, it } from "vitest";
import { read, write } from "xlsx";
import { computePlanDefinitif, type PlanDefinitifResult } from "../planDefinitif";
import { estClasseurEstimatif, exportPlanEstimatif, importPlanEstimatif, LIBELLE_AJUSTEMENT_TVA } from "../planEstimatif";
import { makeClasseurGareEstimatif } from "./fixtureGareEstimatif";

// Valeurs affichées par le classeur (colonnes E, F, G)
const CLASSEUR = {
  totalHt: [175537, 202277, 240777],
  ttc: [187570.985, 215781.685, 256399.185],
  ttcImprevus: [206328.0835, 237359.8535, 282039.1035],
  moe: [65285.498, 69403.458, 75332.458],
  operation: [271613.5815, 306763.3115, 357371.5615],
  mprTravaux: [45000, 67500, 67500],
  amo: [2950, 2950, 2950],
  cee: [7830, 7830, 7830],
};

describe("import du PF estimatif 9 rue de la gare (3 scénarios V1 à V3)", () => {
  const wb = makeClasseurGareEstimatif();
  const { scenarios, controles, avertissements } = importPlanEstimatif(wb);
  const R: PlanDefinitifResult[] = scenarios.map((s) => computePlanDefinitif(s.data));
  const aide = (k: number, libelle: string) => R[k].aides.find((a) => a.libelle === libelle)!.montant!;

  it("reconnaît les en-têtes « Scénario V1 / V2 / V3 »", () => {
    expect(estClasseurEstimatif(wb)).toBe(true);
    expect(scenarios.map((s) => s.ordre)).toEqual([1, 2, 3]);
    const d = scenarios[0].data;
    expect(d.infos.nomCopro).toBe("9, rue de la gare");
    expect(d.infos.nbLogements).toBe(6);
    expect(d.infos.surfaceHabitable).toBe(290);
    expect(scenarios.map((s) => [s.data.infos.etiquetteInitiale, s.data.infos.etiquetteProjet])).toEqual([
      ["F", "D"],
      ["F", "C"],
      ["F", "A"],
    ]);
    expect(scenarios.map((s) => s.data.infos.dispositifClimaxion)).toEqual([false, true, true]);
  });

  it("fait un lot par ligne, numéroté dans l'ordre du classeur, titré par le poste", () => {
    const lots = (k: number) => scenarios[k].data.lots;
    expect(lots(0).map((l) => l.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14]);
    expect(lots(2).map((l) => l.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(lots(0)[0].titre).toBe("Façades avant+arrière");
    expect(lots(0)[0].lignes[0].designation).toBe("Isolation thermique extérieure (ITE)");
    expect(lots(2).find((l) => l.numero === 8)!.titre).toBe("Pignons gauche et droit");
    // lignes sans poste : le libellé sert de titre
    expect(lots(0).find((l) => l.numero === 13)!.titre).toBe("Ravalement de façade (avant/arrière)");
    // lignes retenues MPR = formule « Total travaux HT retenus »
    const retenus = lots(0).filter((l) => l.lignes.some((x) => x.retenu)).map((l) => l.numero);
    expect(retenus).toEqual([1, 2, 3, 4, 5, 6, 7, 12, 13]);
  });

  it("lit la TVA de chaque ligne dans la formule du TTC, sans ligne d'ajustement", () => {
    const tva20 = scenarios[0].data.lots.filter((l) => l.lignes[0].tvaPct === 20).map((l) => l.numero);
    expect(tva20).toEqual([3, 10, 11, 14]);
    for (let k = 0; k < 3; k++) {
      const lignes = scenarios[k].data.lots.flatMap((l) => l.lignes);
      expect(lignes.some((l) => l.designation === LIBELLE_AJUSTEMENT_TVA)).toBe(false);
      expect(R[k].totalTravauxTtc).toBeCloseTo(CLASSEUR.ttc[k], 2);
    }
    expect(avertissements.some((a) => a.startsWith("TVA non détaillée"))).toBe(false);
  });

  it("lit les taux de MOE saisis en colonne D (« (E38*$D$54)*1.2 », « E38*$D$59 »)", () => {
    const moe = scenarios[0].data.moe;
    const ligne = (d: string) => moe.find((m) => m.designation === d)!;
    expect(ligne("Maîtrise d'œuvre phase travaux").montant).toEqual({ mode: "pctTravauxHt", taux: 8 });
    expect(ligne("Maîtrise d'œuvre phase travaux").tvaPct).toBe(20);
    expect(ligne("Dommage ouvrage").montant).toEqual({ mode: "pctTravauxHt", taux: 1.8 });
    expect(ligne("Dommage ouvrage").tvaPct).toBe(0);
    expect(ligne("Honoraires syndic").montant).toEqual({ mode: "pctTravauxHt", taux: 4 });
    expect(moe.filter((m) => m.eligibleMprEtudes)).toHaveLength(9);
    expect(moe.filter((m) => m.eligibleMprAmo)).toHaveLength(3);
    // « =600 » : montant saisi, pas une formule non reconnue
    expect(avertissements.some((a) => a.includes("=600"))).toBe(false);
  });

  it("recalcule travaux, MOE et total de l'opération au centime du classeur", () => {
    for (let k = 0; k < 3; k++) {
      const r = R[k];
      expect(r.totalTravauxHt).toBeCloseTo(CLASSEUR.totalHt[k], 2);
      expect(r.totalTravauxTtcImprevus).toBeCloseTo(CLASSEUR.ttcImprevus[k], 2);
      expect(r.totalMoeTtc).toBeCloseTo(CLASSEUR.moe[k], 2);
      expect(r.totalOperationTtc).toBeCloseTo(CLASSEUR.operation[k], 2);
      expect(aide(k, "Maprimerénov' partie travaux")).toBeCloseTo(CLASSEUR.mprTravaux[k], 2);
      expect(aide(k, "Maprimerénov' AMO")).toBeCloseTo(CLASSEUR.amo[k], 2);
      expect(aide(k, "Coup de pouce CEE")).toBeCloseTo(CLASSEUR.cee[k], 2);
    }
    const ok = (libelle: string) => controles.filter((c) => c.libelle === libelle).every((c) => c.ok);
    for (const l of ["Total travaux HT", "Total travaux TTC", "Total travaux TTC avec imprévus", "Total MOE et annexes TTC", "Total opération TTC avec imprévus"])
      expect(ok(l)).toBe(true);
  });

  it("relit la MPR travaux « =7500*E5 » en 30 % de l'assiette plafonnée", () => {
    expect(scenarios[0].data.aides.find((a) => a.id === "maprimerenov-partie-travaux")!.calcul).toEqual({
      mode: "pctAssietteTravaux",
      taux: 30,
      coef: 1,
    });
    expect(scenarios[1].data.aides.find((a) => a.id === "maprimerenov-partie-travaux")!.calcul).toMatchObject({ taux: 45 });
    // bonus « sortie de passoire » hors garde-fou MPR travaux (ligne 118 du classeur)
    expect(R[0].gardeFous[1].valeur).toBeCloseTo(7500, 2);
    expect(R[1].gardeFous[1].valeur).toBeCloseTo(11250, 2);
  });

  it("plafonne le bonus MPR et recalcule la MPR études (prorata figé du classeur)", () => {
    for (let k = 0; k < 3; k++) expect(aide(k, "Maprimerénov' bonus")).toBeCloseTo(13500, 2);
    // 30 % × 0,9 × HT des lignes éligibles × assiette plafonnée / travaux HT
    const htEtudes = 10500 + 3590 + 4500 + 900 + 597 + 597 + 3600 + 1360 + 175537 * 0.08;
    expect(aide(0, "Maprimerénov' partie études")).toBeCloseTo(htEtudes * 0.3 * 0.9 * (150000 / 175537), 2);
    expect(scenarios[0].data.aides.find((a) => a.id === "maprimerenov-partie-etudes")!.calcul).toEqual({
      mode: "pctEtudes",
      taux: 30,
      coef: 0.9,
    });
    expect(avertissements.some((a) => a.startsWith("Scénario 1 : Aide « Maprimerénov' partie études » : prorata énergétique saisi en dur"))).toBe(true);
    expect(avertissements.some((a) => a.startsWith("Scénario 1 : Aide « Maprimerénov' bonus » : le classeur la calcule"))).toBe(true);
  });

  it("lit les tantièmes sur 1000, les exemples et le prêt sur 20 ans", () => {
    const p = scenarios[0].data.params;
    expect(p.totalTantiemes).toBe(1000);
    expect(p.tantiemesExemples).toEqual([235, 326, 439]);
    expect(p.imprevusPct).toBe(10);
    expect(p.dureeEcoPtzAns).toBe(20);
    expect(p.coefAssurance).toBe(1.03);
    expect(p.fondsTravaux).toBe(0);
    expect(scenarios[0].data.variantes).toEqual({ collectif: true, collectifSansAvance: false, individuel: false });
    expect(avertissements.some((a) => a.startsWith("Scénario 1 : Mensualités du classeur sans assurance"))).toBe(true);
    // coût au tantième avant aides : total opération / 1000, comme la ligne 88 du classeur
    expect(R[0].coutTantiemeAvant).toBeCloseTo(271.6135815, 6);
  });
});

describe("export du PF estimatif 9 rue de la gare puis réimport", () => {
  const source = importPlanEstimatif(makeClasseurGareEstimatif()).scenarios;
  const buf = write(exportPlanEstimatif(source), { type: "buffer", bookType: "xlsx" });
  const relu = importPlanEstimatif(read(buf, { type: "buffer" }));

  it("redonne les mêmes montants", () => {
    expect(relu.scenarios).toHaveLength(3);
    relu.scenarios.forEach((s, k) => {
      const a = computePlanDefinitif(source[k].data);
      const b = computePlanDefinitif(s.data);
      expect(b.totalTravauxTtc).toBeCloseTo(a.totalTravauxTtc, 2);
      expect(b.totalOperationTtc).toBeCloseTo(a.totalOperationTtc, 2);
      expect(b.totalAides).toBeCloseTo(a.totalAides, 2);
      // frais d'huissier saisis en TTC (400 €) : HT arrondi au centime à l'export
      b.moe.forEach((m, i) => expect(m.montantTtc).toBeCloseTo(a.moe[i].montantTtc, 1));
      expect(s.data.moe.map((m) => [m.designation, m.montant.mode, m.tvaPct])).toEqual(
        source[k].data.moe.map((m) => [m.designation, m.montant.mode, m.tvaPct])
      );
      expect(s.data.params).toEqual(source[k].data.params);
    });
  });
});
