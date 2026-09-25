import { describe, expect, it } from "vitest";
import { CADRAGE_DEFAUT, deplacerCadrage, lireCadrage, normaliserCadrage, stylePhoto } from "../photoCadrage";

describe("lireCadrage", () => {
  it("rend le cadrage centré sans zoom quand rien n'est enregistré", () => {
    expect(lireCadrage(null)).toEqual(CADRAGE_DEFAUT);
    expect(lireCadrage("n'importe quoi")).toEqual(CADRAGE_DEFAUT);
  });
  it("borne les valeurs enregistrées", () => {
    expect(lireCadrage({ x: -5, y: 140, zoom: 9 })).toEqual({ x: 0, y: 100, zoom: 3 });
    expect(lireCadrage({ x: 20, y: "30", zoom: 0.4 })).toEqual({ x: 20, y: 50, zoom: 1 });
  });
});

describe("deplacerCadrage", () => {
  // photo verticale 1000 × 1500 dans un bandeau 1200 × 168 : l'image couvre la
  // largeur (1200 × 1800), il ne reste que la hauteur à choisir
  const bandeau = { cw: 1200, ch: 168, nw: 1000, nh: 1500 };

  it("remonte le point gardé quand on tire la photo vers le bas", () => {
    const c = deplacerCadrage(CADRAGE_DEFAUT, 0, 163.2, bandeau);
    // débordement vertical : 1800 - 168 = 1632 px, 163,2 px = 10 %
    expect(c.y).toBeCloseTo(40, 5);
    expect(c.x).toBe(50); // la largeur est déjà entière : rien à décaler
  });

  it("ne sort jamais de l'image", () => {
    expect(deplacerCadrage(CADRAGE_DEFAUT, 0, 99999, bandeau).y).toBe(0);
    expect(deplacerCadrage(CADRAGE_DEFAUT, 0, -99999, bandeau).y).toBe(100);
  });

  it("permet de décaler en largeur une fois zoomé", () => {
    const c = deplacerCadrage({ x: 50, y: 50, zoom: 2 }, -120, 0, bandeau);
    // course horizontale : 0 × 2 + 1200 × (2 - 1) = 1200 px, 120 px = 10 %
    expect(c.x).toBeCloseTo(60, 5);
  });
});

describe("normaliserCadrage et stylePhoto", () => {
  it("arrondit avant enregistrement", () => {
    expect(normaliserCadrage({ x: 33.333, y: 66.666, zoom: 1.2345 })).toEqual({ x: 33.3, y: 66.7, zoom: 1.23 });
  });
  it("zoome autour du point gardé", () => {
    const st = stylePhoto({ x: 20, y: 30, zoom: 1.5 });
    expect(st.objectPosition).toBe("20% 30%");
    expect(st.transformOrigin).toBe("20% 30%");
    expect(st.transform).toBe("scale(1.5)");
    expect(stylePhoto(CADRAGE_DEFAUT).transform).toBeUndefined();
  });
});
