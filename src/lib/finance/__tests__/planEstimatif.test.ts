// PF estimatif à plusieurs scénarios (classeur Le Rodin du 23/09/2026) : import
// au centime du fichier réel, puis aller-retour export → import sans perte.
import { describe, expect, it } from "vitest";
import { read, write } from "xlsx";
import { computePlanDefinitif, type PlanDefinitifResult } from "../planDefinitif";
import { estClasseurEstimatif, exportPlanEstimatif, importPlanEstimatif, LIBELLE_AJUSTEMENT_TVA } from "../planEstimatif";
import { itemsARepartirPf } from "../repartitionPf";
import { exportPlanDefinitif } from "../exportPlanDefinitif";
import { makeClasseurRodin } from "./fixtureRodinEstimatif";
import { makeViolettes } from "./fixtureViolettes";

// Valeurs affichées par le classeur (colonnes D, E, F)
const CLASSEUR = {
  totalHt: [1335163, 1380343, 1521858.14],
  retenu: [1155628.5, 1200808.5, 1192323.64],
  ttc: [1399004.17, 1446669.07, 1595967.54],
  moe: [230237.2431, 232721.6913, 240503.6088],
  operation: [1769141.83, 1824057.668, 1996067.903],
  aides: [1154795.519, 1250716.367, 1242009.085],
  mprEtudes: [37472.84646, 37663.39497, 33919.75538],
  climaxion: [104500, 167500, 167500],
  resteACharge: [470371.2711, 429366.2608, 610083.778],
  tauxCouverture: [0.6527433241, 0.6856780842, 0.6222278726],
  // exemples 80 / 142 / 291 tantièmes (scénario 1)
  resteExemples: [3762.970169, 6679.27205, 13687.80399],
  mensualites: [16.14941364, 28.66520921, 58.74349212],
  coutAvance: [503.4908463, 893.6962521, 1831.447953],
};

describe("import du PF estimatif Le Rodin (3 scénarios)", () => {
  const wb = makeClasseurRodin();
  const { scenarios, controles, avertissements } = importPlanEstimatif(wb);
  const R: PlanDefinitifResult[] = scenarios.map((s) => computePlanDefinitif(s.data));

  it("reconnaît un classeur estimatif, pas un PF définitif", () => {
    expect(estClasseurEstimatif(wb)).toBe(true);
    expect(estClasseurEstimatif(exportPlanDefinitif(makeViolettes()))).toBe(false);
  });

  it("lit les trois scénarios et leurs descriptions", () => {
    expect(scenarios.map((s) => s.ordre)).toEqual([1, 2, 3]);
    expect(scenarios[0].libelle).toBe("Tourelles de ventilation, sans isolation du plancher bas");
    expect(scenarios[2].libelle).toBe("Caissons de ventilation en combles, avec isolation du plancher bas");
    const d = scenarios[0].data;
    expect(d.infos.nomCopro).toBe("Le Rodin");
    expect(d.infos.nbLogements).toBe(63);
    expect(d.infos.surfaceHabitable).toBe(2946);
    expect(d.infos.etiquetteInitiale).toBe("E");
    expect(d.infos.etiquetteProjet).toBe("B");
    expect(scenarios.map((s) => s.data.infos.cepProjet)).toEqual([107, 105, 105]);
  });

  it("retrouve les lignes retenues MPR depuis la formule « Total travaux HT retenu »", () => {
    const retenus = scenarios[0].data.lots.filter((l) => l.lignes.some((x) => x.retenu)).map((l) => l.numero);
    expect(retenus).toEqual([3, 4, 5, 6, 7, 10, 12]);
    // provisions sans numéro de lot regroupées ; la charpente n'existe qu'au scénario 3
    const provisions = (k: number) => scenarios[k].data.lots.find((l) => l.titre === "Provisions")!;
    expect(provisions(0).lignes.filter((l) => l.montantHt > 0)).toHaveLength(2);
    expect(provisions(2).lignes.filter((l) => l.montantHt > 0)).toHaveLength(3);
  });

  it("lit la MOE en HT × TVA et ses éligibilités MPR depuis les formules", () => {
    const moe = scenarios[0].data.moe;
    expect(moe).toHaveLength(17);
    const etudes = moe.find((m) => m.designation.startsWith("Maîtrise d'œuvre phase études"))!;
    expect(etudes.montant).toEqual({ mode: "forfait", montantHt: 32000 });
    expect(etudes.tvaPct).toBe(20);
    const moeTravaux = moe.find((m) => m.designation === "Maîtrise d'œuvre phase travaux")!;
    expect(moeTravaux.tvaPct).toBe(5.5);
    expect(moe.find((m) => m.designation === "Dommage ouvrage")!.montant).toEqual({ mode: "pctTravauxTtc", taux: 1.8 });
    expect(moe.find((m) => m.designation === "Honoraires syndic")!.montant).toEqual({ mode: "pctTravauxHt", taux: 3 });
    expect(moe.filter((m) => m.eligibleMprEtudes)).toHaveLength(7);
    expect(moe.filter((m) => m.eligibleMprAmo)).toHaveLength(3);
  });

  it("conserve le TTC saisi du classeur par une ligne d'ajustement de TVA", () => {
    for (let k = 0; k < 3; k++) {
      const ajust = scenarios[k].data.lots.flatMap((l) => l.lignes).filter((l) => l.designation === LIBELLE_AJUSTEMENT_TVA);
      expect(ajust).toHaveLength(1);
      expect(ajust[0].tvaMontant).toBeCloseTo(-9592.8, 1);
      expect(R[k].totalTravauxTtc).toBeCloseTo(CLASSEUR.ttc[k], 2);
    }
    // l'ajustement est réparti comme les autres lignes (plans individuels)
    const items = itemsARepartirPf(scenarios[0].data, R[0]);
    expect(items.reduce((s, it) => s + it.montantTtc, 0)).toBeCloseTo(R[0].totalOperationTtc, 2);
  });

  it("recalcule chaque scénario au centime du classeur", () => {
    for (let k = 0; k < 3; k++) {
      const r = R[k];
      expect(r.totalTravauxHt).toBeCloseTo(CLASSEUR.totalHt[k], 2);
      expect(r.assietteMprTravaux).toBeCloseTo(CLASSEUR.retenu[k], 2);
      expect(r.totalMoeTtc).toBeCloseTo(CLASSEUR.moe[k], 2);
      expect(r.totalOperationTtc).toBeCloseTo(CLASSEUR.operation[k], 2);
      expect(r.totalAides).toBeCloseTo(CLASSEUR.aides[k], 2);
      expect(r.aides.find((a) => a.libelle === "Maprimerénov' partie études")!.montant!).toBeCloseTo(CLASSEUR.mprEtudes[k], 2);
      expect(r.aides.find((a) => a.libelle === "Climaxion Travaux")!.montant!).toBeCloseTo(CLASSEUR.climaxion[k], 2);
      expect(r.resteACharge).toBeCloseTo(CLASSEUR.resteACharge[k], 2);
      expect(r.tauxCouverture).toBeCloseTo(CLASSEUR.tauxCouverture[k], 8);
      expect(r.primeCee).toBe(0);
    }
    const ex = R[0].collectif.exemples;
    expect(ex.map((e) => e.tantiemes)).toEqual([80, 142, 291]);
    ex.forEach((e, i) => {
      expect(e.resteAFinancer).toBeCloseTo(CLASSEUR.resteExemples[i], 4);
      expect(e.mensualiteEcoPtz).toBeCloseTo(CLASSEUR.mensualites[i], 4);
      expect(e.coutPretAvance).toBeCloseTo(CLASSEUR.coutAvance[i], 4);
    });
  });

  it("cumule le montant déjà appelé au fonds travaux et garde la variante collective seule", () => {
    const p = scenarios[0].data.params;
    expect(p.fondsTravaux).toBeCloseTo(43059.4 + 100915.64, 2);
    expect(p.commentaireFondsTravaux).toContain("montant déjà appelé");
    expect(p.imprevusPct).toBe(10);
    expect(p.totalTantiemes).toBe(10000);
    expect(p.coefAssurance).toBe(1.03);
    expect(p.tauxPretAvancePct).toBe(5.45);
    expect(scenarios[0].data.variantes).toEqual({ collectif: true, collectifSansAvance: false, individuel: false });
  });

  it("passe tous les contrôles fichier ↔ recalcul", () => {
    expect(controles.length).toBe(24);
    expect(controles.filter((c) => !c.ok)).toEqual([]);
    expect(avertissements.some((a) => a.startsWith("Scénario 1 : TTC travaux du classeur"))).toBe(true);
  });

  it("n'inclut pas le bonus copro fragile dans le garde-fou MPR travaux (ligne 122 du classeur)", () => {
    expect(R[0].gardeFous[1].valeur).toBeCloseTo(7429.040357, 4);
  });
});

describe("export du PF estimatif puis réimport", () => {
  const source = importPlanEstimatif(makeClasseurRodin()).scenarios;
  const buf = write(exportPlanEstimatif(source), { type: "buffer", bookType: "xlsx" });
  const relu = importPlanEstimatif(read(buf, { type: "buffer" }));

  it("redonne exactement les mêmes scénarios", () => {
    expect(relu.scenarios).toEqual(source);
    expect(relu.controles.filter((c) => !c.ok)).toEqual([]);
  });
});
