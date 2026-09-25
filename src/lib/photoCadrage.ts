// Cadrage de la photo d'un dossier (feedback Amir 24/09/2026 : « lorsque l'on
// importe une photo, il faut la recadrer correctement »). La photo d'origine
// est conservée telle quelle ; on enregistre seulement le point à garder
// visible (x, y en % de l'image, comme object-position) et un zoom (≥ 1),
// appliqués à l'affichage (bandeau du dossier, cartes du tableau de bord,
// espace syndic). On peut donc recadrer à nouveau à tout moment sans
// réimporter.
import type { CSSProperties } from "react";

export interface Cadrage {
  /** Point gardé visible, en % de la largeur de l'image (0 = bord gauche). */
  x: number;
  /** Point gardé visible, en % de la hauteur de l'image (0 = haut). */
  y: number;
  /** Agrandissement autour de ce point (1 = image entière recadrée au plus juste). */
  zoom: number;
}

export const CADRAGE_DEFAUT: Cadrage = { x: 50, y: 50, zoom: 1 };
export const ZOOM_MAX = 3;

const borne = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const arrondi = (v: number) => Math.round(v * 10) / 10;

/** Cadrage lu en base (jsonb libre) : valeurs bornées, défaut centré sans zoom. */
export function lireCadrage(v: unknown): Cadrage {
  if (!v || typeof v !== "object") return CADRAGE_DEFAUT;
  const o = v as Record<string, unknown>;
  const num = (k: string, d: number) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : d);
  return {
    x: borne(num("x", 50), 0, 100),
    y: borne(num("y", 50), 0, 100),
    zoom: borne(num("zoom", 1), 1, ZOOM_MAX),
  };
}

/** Cadrage prêt à enregistrer (arrondi au dixième). */
export function normaliserCadrage(c: Cadrage): Cadrage {
  return { x: arrondi(borne(c.x, 0, 100)), y: arrondi(borne(c.y, 0, 100)), zoom: Math.round(borne(c.zoom, 1, ZOOM_MAX) * 100) / 100 };
}

/** Style de l'image dans un cadre en `overflow: hidden` (object-fit cover + zoom autour du point gardé). */
export function stylePhoto(c: Cadrage): CSSProperties {
  const origine = `${c.x}% ${c.y}%`;
  return {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: origine,
    transform: c.zoom > 1 ? `scale(${c.zoom})` : undefined,
    transformOrigin: origine,
    display: "block",
  };
}

/**
 * Glisser la photo de (dx, dy) pixels à l'écran dans un cadre de cw × ch
 * pixels : le point gardé visible se déplace en sens inverse. En object-fit
 * cover, l'image affichée déborde de ox × oy pixels ; avec le zoom z autour
 * du point (x, y), un écart de Δx % décale l'image de Δx/100 · (ox·z + cw·(z-1))
 * pixels à l'écran (même chose en hauteur). Sans débordement ni zoom, l'axe
 * ne bouge pas.
 */
export function deplacerCadrage(
  c: Cadrage,
  dx: number,
  dy: number,
  dims: { cw: number; ch: number; nw: number; nh: number }
): Cadrage {
  const { cw, ch, nw, nh } = dims;
  if (cw <= 0 || ch <= 0 || nw <= 0 || nh <= 0) return c;
  const s = Math.max(cw / nw, ch / nh);
  const ox = nw * s - cw;
  const oy = nh * s - ch;
  const courseX = ox * c.zoom + cw * (c.zoom - 1);
  const courseY = oy * c.zoom + ch * (c.zoom - 1);
  return {
    ...c,
    x: courseX > 0.5 ? borne(c.x - (dx / courseX) * 100, 0, 100) : c.x,
    y: courseY > 0.5 ? borne(c.y - (dy / courseY) * 100, 0, 100) : c.y,
  };
}
