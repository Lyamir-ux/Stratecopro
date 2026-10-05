import { describe, expect, it } from "vitest";
import { positionDansClasse } from "../echelleDpe";

describe("positionDansClasse", () => {
  it("Armorial après travaux : C annoncé à 94 kWh/m².an = tout en haut de la barre C, près du B", () => {
    const p = positionDansClasse("C", 94);
    expect(p).toEqual({ frac: 0, precis: true, cep: 94 });
  });

  it("Armorial avant travaux : D à 198 kWh/m².an = haut de la barre D, plus près du C que du E", () => {
    const p = positionDansClasse("D", 198);
    expect(p.precis).toBe(true);
    expect(p.frac).toBeCloseTo((198 - 180) / (250 - 180), 5);
    expect(p.frac).toBeLessThan(0.5);
  });

  it("une consommation en bas de classe donne une flèche en bas de barre", () => {
    expect(positionDansClasse("C", 180).frac).toBe(1);
    expect(positionDansClasse("D", 249).frac).toBeGreaterThan(0.9);
  });

  it("la classe A part de 0 et la classe G s'étend au-delà de 420", () => {
    expect(positionDansClasse("A", 35).frac).toBeCloseTo(0.5, 5);
    expect(positionDansClasse("G", 420.1).precis).toBe(true);
    expect(positionDansClasse("G", 900).frac).toBe(1);
  });

  it("sans consommation exploitable, la flèche est centrée et aucune valeur n'est affichée", () => {
    for (const cep of [null, undefined, 0, -5, Number.NaN]) {
      expect(positionDansClasse("C", cep)).toEqual({ frac: 0.5, precis: false, cep: null });
    }
  });

  it("consommation à plus d'une classe de l'étiquette annoncée : valeur écartée, flèche centrée", () => {
    expect(positionDansClasse("C", 300)).toEqual({ frac: 0.5, precis: false, cep: null });
    expect(positionDansClasse("E", 60)).toEqual({ frac: 0.5, precis: false, cep: null });
  });
});
