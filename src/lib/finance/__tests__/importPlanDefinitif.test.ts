// Aller-retour export → import : le classeur généré à la nomenclature de référence
// doit être reconnu par l'importeur et donner exactement le même recalcul.
import { describe, expect, it } from "vitest";
import { read, write } from "xlsx";
import { computePlanDefinitif } from "../planDefinitif";
import { exportPlanDefinitif } from "../exportPlanDefinitif";
import { importPlanDefinitif } from "../importPlanDefinitif";
import { makeViolettes } from "./fixtureViolettes";

describe("export puis import du plan définitif (nomenclature Strat Eco)", () => {
  const source = makeViolettes();
  const attendu = computePlanDefinitif(source);
  // écriture réelle en xlsx puis relecture (mêmes conditions qu'un fichier téléversé)
  const buf = write(exportPlanDefinitif(source), { type: "buffer", bookType: "xlsx" });
  const { data, avertissements, controles } = importPlanDefinitif(read(buf, { type: "buffer" }));
  const relu = computePlanDefinitif(data);

  it("reconnaît les onglets, les lots et leurs lignes « retenu »", () => {
    expect(data.lots).toHaveLength(9);
    const lot3 = data.lots.find((l) => l.numero === 3)!;
    expect(lot3.remisePct).toBe(2);
    expect(lot3.entreprise).toBe("ERDAL");
    expect(lot3.lignes.filter((l) => l.retenu)).toHaveLength(4);
    expect(data.moe).toHaveLength(15);
    expect(data.aides).toHaveLength(11);
  });

  it("relit les infos générales et les paramètres", () => {
    expect(data.infos.nomCopro).toBe("La Violette");
    expect(data.infos.nbLogements).toBe(24);
    expect(data.infos.nbLogementsEquiv).toBe(29);
    expect(data.infos.surfaceHabitable).toBeCloseTo(1460.4, 4);
    expect(data.infos.etiquetteInitiale).toBe("E");
    expect(data.infos.etiquetteProjet).toBe("C");
    expect(data.params.fondsTravaux).toBeCloseTo(5641.66, 2);
    expect(data.params.tantiemesExemples).toEqual([310, 348, 386]);
    expect(data.params.totalTantiemes).toBe(10000);
    expect(data.params.dureeEcoPtzAns).toBe(20);
    expect(data.params.pctAvanceAides).toBe(70);
  });

  it("recalcule exactement les mêmes agrégats", () => {
    expect(relu.totalTravauxHt).toBeCloseTo(attendu.totalTravauxHt, 2);
    expect(relu.travauxRetenusHt).toBeCloseTo(attendu.travauxRetenusHt, 2);
    expect(relu.assietteMprTravaux).toBeCloseTo(attendu.assietteMprTravaux, 2);
    expect(relu.totalTravauxTtc).toBeCloseTo(attendu.totalTravauxTtc, 2);
    expect(relu.totalMoeTtc).toBeCloseTo(attendu.totalMoeTtc, 2);
    expect(relu.totalPhaseTravauxTtc).toBeCloseTo(attendu.totalPhaseTravauxTtc, 2);
    expect(relu.totalAides).toBeCloseTo(attendu.totalAides, 2);
    expect(relu.totalAidesPubliques).toBeCloseTo(attendu.totalAidesPubliques, 2);
    expect(relu.resteACharge).toBeCloseTo(attendu.resteACharge, 2);
    expect(relu.collectif.resteAFinancer).toBeCloseTo(attendu.collectif.resteAFinancer, 2);
    expect(relu.individuel.appelsFonds).toBeCloseTo(attendu.individuel.appelsFonds, 2);
    expect(relu.collectif.exemples[0].prixRevient).toBeCloseTo(attendu.collectif.exemples[0].prixRevient, 2);
    expect(relu.individuel.exemples[2].mensualiteEcoPtz).toBeCloseTo(attendu.individuel.exemples[2].mensualiteEcoPtz, 4);
  });

  it("passe tous les contrôles fichier ↔ recalcul, sans avertissement", () => {
    expect(controles.length).toBeGreaterThan(20);
    for (const c of controles) {
      expect(c.ok, `${c.libelle}: fichier=${c.fichier} recalc=${c.recalcule}`).toBe(true);
    }
    expect(avertissements).toEqual([]);
  });
});
