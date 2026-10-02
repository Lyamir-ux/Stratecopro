// Image fictive de bâtiment des dossiers sans photo (idée d'Amir du
// 02/10/2026) : une quarantaine d'images différentes, toujours la même pour un
// même dossier.
import { describe, expect, it } from "vitest";
import { NB_BATIMENTS_FICTIFS, encoderSvg, indexBatimentFictif, svgBatimentFictif, urlBatimentFictif } from "../batimentFictif";

describe("images fictives de bâtiment", () => {
  it("dessine quarante illustrations toutes différentes, sans valeur manquante", () => {
    const svgs = Array.from({ length: NB_BATIMENTS_FICTIFS }, (_, i) => svgBatimentFictif(i));
    expect(NB_BATIMENTS_FICTIFS).toBe(40);
    expect(new Set(svgs).size).toBe(40);
    for (const svg of svgs) {
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 240"')).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("redessine la même image pour un même rang", () => {
    expect(svgBatimentFictif(7)).toBe(svgBatimentFictif(7));
    expect(svgBatimentFictif(47)).toBe(svgBatimentFictif(7));
  });

  it("attribue toujours la même image à un dossier, et des images variées d'un dossier à l'autre", () => {
    const id = "32cc32b6-3997-4fe6-892d-32b311a6377d";
    expect(indexBatimentFictif(id)).toBe(indexBatimentFictif(id));
    expect(urlBatimentFictif(id)).toBe(urlBatimentFictif(id));
    const ids = Array.from({ length: 200 }, (_, k) => `${k.toString(16).padStart(8, "0")}-3997-4fe6-892d-32b311a6377d`);
    const rangs = ids.map(indexBatimentFictif);
    expect(rangs.every((r) => Number.isInteger(r) && r >= 0 && r < NB_BATIMENTS_FICTIFS)).toBe(true);
    expect(new Set(rangs).size).toBeGreaterThan(30);
  });

  it("encode le SVG pour une URL data: sans caractère réservé", () => {
    const url = urlBatimentFictif("dossier");
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,%3Csvg ")).toBe(true);
    expect(url).not.toMatch(/[<>#"]/);
    expect(encoderSvg('<rect fill="#FFF"/>')).toBe("%3Crect fill='%23FFF'/%3E");
  });
});
