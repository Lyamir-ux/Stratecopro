import { describe, expect, it } from "vitest";
import { EXEMPLE } from "./exemple";
import {
  PARAMETRES_ORG_DEFAUT,
  cepApres,
  etiquetteDepuisCep,
  gainCompose,
  gainCumule,
  honorairesPoste,
  montantTtcPoste,
  parametresDepuisJson,
  postesDepuisJson,
  totauxParAnnee,
} from "../formules";

const params = parametresDepuisJson(EXEMPLE.parametres_ppt);
const postes = postesDepuisJson(EXEMPLE);

describe("formules du tableau PPT Strat Eco", () => {
  it("reprend les hypothèses du JSON (année de base, taux)", () => {
    expect(params.anneeBase).toBe(2026);
    expect(params.inflation).toBeCloseTo(0.035);
    expect(params.moe).toBeCloseTo(0.06);
    expect(params.cepBase).toBe(289);
  });

  it("poste énergétique en AN+1 : HT × 1,035 × (1 + 5,5 % + 3 %) - sans MOE", () => {
    // 186 000 × 1,035 × 1,085 = 208 873,35 (formule du classeur, colonne 2027)
    expect(montantTtcPoste(postes[0], params)).toBeCloseTo(208873.35, 2);
    // montant saisi par le syndic : prime sur le calcul, quelle que soit l'année demandée
    expect(montantTtcPoste({ ...postes[0], montant_syndic: 150000 }, params)).toBe(150000);
    expect(montantTtcPoste({ ...postes[0], montant_syndic: 150000 }, params, 2035)).toBe(150000);
    expect(montantTtcPoste({ ...postes[0], montant_syndic: null }, params)).toBeCloseTo(208873.35, 2);
  });

  it("poste de préservation en AN+2 : HT × 1,035² × (1 + 10 % + 6 % + 3 %) - avec MOE", () => {
    // 48 000 × 1,071225 × 1,19 = 61 188,37
    expect(montantTtcPoste(postes[1], params)).toBeCloseTo(61188.37, 2);
  });

  it("poste sans coût → null, jamais 0", () => {
    expect(montantTtcPoste(postes[2], params)).toBeNull();
    expect(honorairesPoste(postes[2], params, PARAMETRES_ORG_DEFAUT)).toBeNull();
  });

  it("honoraires de suivi = assiette × taux (TTC par défaut, HT sur option)", () => {
    expect(honorairesPoste(postes[0], params, PARAMETRES_ORG_DEFAUT)).toBeCloseTo(208873.35 * 0.03, 1);
    // assiette HT actualisée : 186 000 × 1,035 = 192 510
    expect(honorairesPoste(postes[0], params, { ...PARAMETRES_ORG_DEFAUT, base_honoraires: "ht", taux_honoraires_pct: 2 })).toBeCloseTo(192510 * 0.02, 2);
  });

  it("gain cumulé multiplicatif : 1 - Π(1 - g)", () => {
    // 2027 : ITE 25 % + VMC 4 % → 1 - 0,75 × 0,96 = 28 %
    expect(gainCumule(postes, 2027)).toBeCloseTo(0.28, 6);
    // 2030 : + chaudière 20 % + menuiseries 10 % → 1 - 0,75 × 0,96 × 0,8 × 0,9 = 48,16 %
    expect(gainCumule(postes, 2030)).toBeCloseTo(0.4816, 6);
    expect(gainCumule(postes, 2026)).toBe(0);
    // les pourcentages (> 1) sont acceptés
    expect(gainCompose([25, 4])).toBeCloseTo(0.28, 6);
  });

  it("Cep après travaux et étiquette DPE 2021", () => {
    expect(cepApres(289, 0.4816)).toBeCloseTo(149.8, 1);
    expect(etiquetteDepuisCep(149.8)).toBe("C");
    expect(etiquetteDepuisCep(70)).toBe("A");
    expect(etiquetteDepuisCep(71)).toBe("B");
    expect(etiquetteDepuisCep(289)).toBe("E");
    expect(etiquetteDepuisCep(500)).toBe("G");
    expect(etiquetteDepuisCep(null)).toBeNull();
  });

  it("totaux par année : somme des TTC des postes chiffrés", () => {
    const t = totauxParAnnee(postes, params);
    // 2027 : T01 (208 873,35) + T04 (31 000 × 1,035 × 1,19 = 38 181,15) ; la VMC non chiffrée n'entre pas
    expect(t.get(2027)).toBeCloseTo(208873.35 + 38181.15, 1);
    expect(t.get(2028)).toBeCloseTo(61188.37, 2);
  });

  it("poste rejeté : l'année effective devient la nouvelle présentation", () => {
    const p = { ...postes[1], annee_prochaine_presentation: 2029 };
    // 48 000 × 1,035³ × 1,19
    expect(montantTtcPoste(p, params)).toBeCloseTo(48000 * Math.pow(1.035, 3) * 1.19, 2);
  });
});
