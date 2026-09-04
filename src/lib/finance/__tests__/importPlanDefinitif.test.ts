// Aller-retour export → import : le classeur généré à la nomenclature de référence
// doit être reconnu par l'importeur et donner exactement le même recalcul.
import { describe, expect, it } from "vitest";
import { read, write } from "xlsx";
import { computePlanDefinitif } from "../planDefinitif";
import { exportPlanDefinitif } from "../exportPlanDefinitif";
import { importPlanDefinitif, norm } from "../importPlanDefinitif";
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

// Classeurs qui s'écartent de la nomenclature de référence (feedback Amir 04/09/2026,
// PF Boudhors) : imprévus différents de 7 %, MOE à 20 % de TVA, CEE saisi, MPR sans
// coefficient de prudence, assiette MPR non plafonnée dans le classeur.
describe("import d'un classeur s'écartant de la nomenclature de référence", () => {
  const source = makeViolettes();
  source.params.imprevusPct = 5;
  const etudes = source.moe.find((l) => l.designation.startsWith("Maîtrise d'œuvre phase études"))!;
  etudes.tvaPct = 20;
  etudes.montant = { mode: "forfait", montantHt: 4500 };
  const conception = source.moe.find((l) => l.designation.startsWith("Maîtrise d'oeuvre phase conception"))!;
  conception.tvaPct = 20;
  conception.montant = { mode: "forfait", montantHt: 30000 };
  source.aides.find((a) => a.id === "cee")!.calcul = { mode: "manuel", montant: 18000 };
  source.aides.find((a) => a.id === "mpr-travaux")!.calcul = { mode: "pctAssietteTravaux", taux: 45, coef: 1 };
  const attendu = computePlanDefinitif(source);
  const buf = write(exportPlanDefinitif(source), { type: "buffer", bookType: "xlsx" });
  const { data, avertissements, controles } = importPlanDefinitif(read(buf, { type: "buffer" }));
  const relu = computePlanDefinitif(data);

  it("relit le taux d'imprévus du libellé « y compris imprévus N% »", () => {
    expect(data.params.imprevusPct).toBe(5);
    expect(relu.totalTravauxTtcImprevus).toBeCloseTo(attendu.totalTravauxTtcImprevus, 2);
    expect(relu.totalPhaseTravauxTtc).toBeCloseTo(attendu.totalPhaseTravauxTtc, 2);
  });

  it("retient la TVA qui redonne un HT rond sur la maîtrise d'œuvre", () => {
    const e = data.moe.find((l) => l.designation.startsWith("Maîtrise d'œuvre phase études"))!;
    expect(e.tvaPct).toBe(20);
    expect(e.montant.mode === "forfait" && e.montant.montantHt).toBeCloseTo(4500, 6);
    const c = data.moe.find((l) => l.designation.startsWith("Maîtrise d'oeuvre phase conception"))!;
    expect(c.tvaPct).toBe(20);
    expect(c.montant.mode === "forfait" && c.montant.montantHt).toBeCloseTo(30000, 6);
    // les lignes à 10 % de la référence restent à 10 %
    const ref = importPlanDefinitif(read(write(exportPlanDefinitif(makeViolettes()), { type: "buffer", bookType: "xlsx" }), { type: "buffer" }));
    expect(ref.data.moe.find((l) => l.designation.startsWith("Maîtrise d'œuvre phase études"))!.tvaPct).toBe(10);
  });

  it("calibre les aides sur les montants du classeur (CEE saisi, MPR sans coefficient 0,9)", () => {
    const cee = data.aides.find((a) => norm(a.libelle).includes("cee"))!;
    expect(cee.calcul).toEqual({ mode: "manuel", montant: 18000 });
    const mpr = data.aides.find((a) => norm(a.libelle).includes("travaux") && norm(a.libelle).includes("maprimerenov"))!;
    expect(mpr.calcul).toEqual({ mode: "pctAssietteTravaux", taux: 45, coef: 1 });
    expect(relu.totalAides).toBeCloseTo(attendu.totalAides, 2);
    expect(relu.resteACharge).toBeCloseTo(attendu.resteACharge, 2);
    expect(relu.tauxCouverture).toBeCloseTo(attendu.tauxCouverture, 8);
    for (const c of controles) expect(c.ok, `${c.libelle}: fichier=${c.fichier} recalc=${c.recalcule}`).toBe(true);
    expect(avertissements.some((a) => a.includes("coefficient de prudence 1"))).toBe(true);
    expect(avertissements.some((a) => a.includes("montant repris tel quel"))).toBe(true);
  });

  it("conserve le plafond de l'assiette MPR quand le classeur ne l'applique pas, avec avertissement", () => {
    const sansPlafond = makeViolettes();
    sansPlafond.params.plafondTravauxParLogement = 1_000_000; // le classeur calcule sur tout le retenu (614 208 €)
    sansPlafond.aides.find((a) => a.id === "mpr-travaux")!.calcul = { mode: "pctAssietteTravaux", taux: 45, coef: 1 };
    const wb = read(write(exportPlanDefinitif(sansPlafond), { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
    const res = importPlanDefinitif(wb);
    const mpr = res.data.aides.find((a) => norm(a.libelle).includes("travaux") && norm(a.libelle).includes("maprimerenov"))!;
    expect(mpr.calcul).toEqual({ mode: "pctAssietteTravaux", taux: 45, coef: 1 });
    expect(res.data.params.plafondTravauxParLogement).toBe(25000);
    const r = computePlanDefinitif(res.data);
    expect(r.assietteMprTravaux).toBeCloseTo(600000, 2);
    expect(r.aides.find((a) => a.id === mpr.id)!.montant).toBeCloseTo(270000, 2);
    expect(res.avertissements.some((a) => a.includes("sans plafonner l'assiette"))).toBe(true);
  });
});
