import { describe, expect, it } from "vitest";
import { decalagesEffectifs, plageAnnees, posteDeplacable } from "../echeancier";

const postes = [
  { id: "a", annee_prevue: 2027, annee_prochaine_presentation: null, statut: "programme" },
  { id: "b", annee_prevue: 2026, annee_prochaine_presentation: 2028, statut: "reporte" },
  { id: "c", annee_prevue: 2029, annee_prochaine_presentation: null, statut: "vote" },
  { id: "d", annee_prevue: null, annee_prochaine_presentation: null, statut: "programme" },
];

describe("plageAnnees", () => {
  it("couvre l'année courante + 10 sans trou et s'étend aux postes hors plage", () => {
    const plage = plageAnnees(postes, 2026);
    expect(plage[0]).toBe(2026);
    expect(plage[plage.length - 1]).toBe(2036);
    expect(plage).toHaveLength(11);
    const large = plageAnnees([{ annee_prevue: 2024, annee_prochaine_presentation: null, statut: "programme" }, { annee_prevue: 2040, annee_prochaine_presentation: null, statut: "programme" }], 2026);
    expect(large[0]).toBe(2024);
    // toujours une colonne libre après le poste le plus lointain
    expect(large[large.length - 1]).toBe(2041);
  });
  it("tient compte du brouillon et garde une colonne libre après le dernier poste", () => {
    const plage = plageAnnees(postes, 2026, { a: 2038 }, postes.map((p) => p.id));
    expect(plage[plage.length - 1]).toBe(2039);
    // un poste posé sur la dernière colonne (2036) ouvre 2037
    const bord = plageAnnees(postes, 2026, { a: 2036 }, postes.map((p) => p.id));
    expect(bord[bord.length - 1]).toBe(2037);
  });
});

describe("posteDeplacable", () => {
  it("fige les postes votés, réalisés ou abandonnés", () => {
    expect(posteDeplacable({ annee_prevue: 2027, statut: "programme" })).toBe(true);
    expect(posteDeplacable({ annee_prevue: 2027, statut: "reporte" })).toBe(true);
    expect(posteDeplacable({ annee_prevue: 2027, statut: "vote" })).toBe(false);
    expect(posteDeplacable({ annee_prevue: 2027, statut: "realise" })).toBe(false);
    expect(posteDeplacable({ annee_prevue: 2027, statut: "abandonne" })).toBe(false);
  });
});

describe("decalagesEffectifs", () => {
  it("n'envoie que les changements d'année effective, jamais sur un poste figé", () => {
    const d = decalagesEffectifs(postes, { a: 2027, b: 2030, c: 2031, d: 2029 });
    expect(d).toEqual([
      { poste_id: "b", annee: 2030 },
      { poste_id: "d", annee: 2029 },
    ]);
  });
  it("envoie le retour sur l'année prévue au plan (la RPC efface le décalage)", () => {
    expect(decalagesEffectifs(postes, { b: 2026 })).toEqual([{ poste_id: "b", annee: 2026 }]);
  });
});
