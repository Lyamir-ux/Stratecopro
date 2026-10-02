// Image fictive de bâtiment pour un dossier sans photo (idée d'Amir du
// 02/10/2026 : « quand il n'y a pas de photo, mettre une image fictive de
// bâtiment ; pas toujours la même, une quarantaine d'images »). Quarante
// illustrations de rue dessinées en SVG, sans fichier ni appel réseau : cinq
// architectures (barre des années 60-70, immeuble haussmannien, petit
// collectif à toit de tuiles, tour, résidence récente) déclinées en huit
// variantes de façade, de ciel, de saison et de voisinage. Un dossier reçoit
// toujours la même, tirée de son identifiant.
//
// Format 1600 × 240 pour le bandeau du dossier (≈ 7:1 sur ordinateur) : le
// bâtiment principal est centré pour rester entier sur téléphone, où le
// bandeau ne montre que le milieu de la rue.

export const NB_BATIMENTS_FICTIFS = 40;

const L = 1600;
const H = 240;
const SOL = 214;

type Style = "barre" | "haussmann" | "tuiles" | "tour" | "moderne" | "simple";
const STYLES_PRINCIPAUX: Style[] = ["barre", "haussmann", "tuiles", "tour", "moderne"];

interface Palette {
  facade: string;
  ombre: string;
  accent: string;
  menuiserie: string;
  pierre: string;
}

const PALETTES: Palette[] = [
  { facade: "#EFE6D2", ombre: "#D6C9AE", accent: "#4A7A1F", menuiserie: "#F8F5EE", pierre: "#EADFC8" },
  { facade: "#E3D3B4", ombre: "#C8B591", accent: "#B5523B", menuiserie: "#F5F0E5", pierre: "#E4D6BC" },
  { facade: "#D9DCDD", ombre: "#B9BFC2", accent: "#2F6F8F", menuiserie: "#F3F5F6", pierre: "#DCD3C3" },
  { facade: "#F1E2A6", ombre: "#D8C47C", accent: "#5F7F4F", menuiserie: "#FBF7E6", pierre: "#EEE3C6" },
  { facade: "#E8B9A3", ombre: "#CD9A82", accent: "#3F4A5A", menuiserie: "#F9F0EA", pierre: "#E6D2BF" },
  { facade: "#F3F1EC", ombre: "#D6D2C8", accent: "#D99A2B", menuiserie: "#FFFFFF", pierre: "#F0EADB" },
  { facade: "#CFE0D2", ombre: "#AEC5B2", accent: "#8A5A44", menuiserie: "#F2F7F3", pierre: "#DED8C8" },
  { facade: "#C98B62", ombre: "#AC6F48", accent: "#2E5E4E", menuiserie: "#F4EADF", pierre: "#E2CDB0" },
];

interface Ciel {
  haut: string;
  bas: string;
  nuages: boolean;
  /** Position du soleil (x de 0 à 1, à l'écart des boutons du coin haut droit du bandeau), absent = pas de soleil visible. */
  soleil?: { x: number; y: number; couleur: string };
  /** Fin de journée : quelques fenêtres allumées. */
  soir: boolean;
}

const CIELS: Ciel[] = [
  { haut: "#9CCBEA", bas: "#E6F2F9", nuages: true, soir: false },
  { haut: "#BCD7EA", bas: "#F6EAD8", nuages: true, soleil: { x: 0.16, y: 58, couleur: "#FFF4DA" }, soir: false },
  { haut: "#8FA6CC", bas: "#F5C796", nuages: false, soleil: { x: 0.82, y: 150, couleur: "#FFE0A3" }, soir: true },
  { haut: "#C2CDD5", bas: "#E9EDEF", nuages: true, soir: false },
  { haut: "#7DB6E2", bas: "#D4EAF7", nuages: false, soleil: { x: 0.7, y: 42, couleur: "#FFFBEA" }, soir: false },
];

// ---------- Couleurs ----------

const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const hex = (v: number[]) => "#" + v.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("");
/** Mélange de a vers b (t = 0 : a, t = 1 : b). */
function melange(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return hex(x.map((v, i) => v + (y[i] - v) * t));
}

// ---------- Tirage pseudo-aléatoire reproductible ----------

type Rng = () => number;
function mulberry32(graine: number): Rng {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const entre = (r: Rng, min: number, max: number) => min + r() * (max - min);
const entier = (r: Rng, min: number, max: number) => Math.floor(entre(r, min, max + 1));
const parmi = <T,>(r: Rng, l: readonly T[]): T => l[Math.floor(r() * l.length)];

// ---------- Primitives SVG ----------

const n = (v: number) => String(Math.round(v * 10) / 10);
const rect = (x: number, y: number, w: number, h: number, fill: string, extra = "") =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra}/>`;
const poly = (pts: [number, number][], fill: string, extra = "") =>
  `<polygon points="${pts.map(([x, y]) => n(x) + "," + n(y)).join(" ")}" fill="${fill}"${extra}/>`;
const cercle = (x: number, y: number, r: number, fill: string, extra = "") =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill}"${extra}/>`;
const ellipse = (x: number, y: number, rx: number, ry: number, fill: string, extra = "") =>
  `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"${extra}/>`;

/** Contexte de dessin : `v` estompe les couleurs des plans éloignés vers l'horizon. */
interface Ctx {
  out: string[];
  rng: Rng;
  ciel: Ciel;
  v: (c: string) => string;
}

function fenetre(o: Ctx, x: number, y: number, w: number, h: number, cadre: string, meneau = false) {
  const r = o.rng();
  let verre = "#9DB6C6";
  let reflet = "#C7D9E4";
  if (r < 0.12) [verre, reflet] = ["#6E8493", "#8398A6"];
  else if (r < 0.2) [verre, reflet] = ["#E5DCC8", "#EEE8D9"];
  else if (o.ciel.soir && r < 0.32) [verre, reflet] = ["#F2CB76", "#F7DDA2"];
  o.out.push(rect(x, y, w, h, o.v(cadre)), rect(x + 1, y + 1, w - 2, h - 2, o.v(verre)), rect(x + 1, y + 1, w - 2, (h - 2) * 0.4, o.v(reflet)));
  if (meneau) o.out.push(rect(x + w / 2 - 0.5, y + 1, 1, h - 2, o.v(cadre)));
}

/** Travées régulières d'une façade : nombre et marge latérale. */
function travees(w: number, pas: number, bord: number) {
  const nb = Math.max(1, Math.floor((w - 2 * bord) / pas));
  return { nb, marge: (w - nb * pas) / 2 };
}

// ---------- Architectures ----------

/** Barre des années 60-70 : toit plat, bandeaux de loggias, allèges colorées, cages vitrées. */
function barre(o: Ctx, x: number, w: number, etages: number, p: Palette) {
  const fh = 15;
  const rdc = 18;
  const haut = SOL - rdc - etages * fh;
  const pas = 24;
  const { nb, marge } = travees(w, pas, 6);
  const loggias = o.rng() < 0.55;
  const alleges = o.rng() < 0.65;
  const cages = nb >= 9 ? [Math.floor(nb / 3), Math.floor((2 * nb) / 3)] : [Math.floor(nb / 2)];
  o.out.push(rect(x, haut, w, SOL - haut, o.v(p.facade)), rect(x - 2, haut - 4, w + 4, 5, o.v(p.ombre)));
  for (let e = 0; e < etages; e++) {
    const y0 = SOL - rdc - (e + 1) * fh;
    if (loggias) o.out.push(rect(x, y0 + fh - 2, w, 2, o.v(p.ombre)));
    for (let b = 0; b < nb; b++) {
      const bx = x + marge + b * pas;
      if (cages.includes(b)) {
        o.out.push(rect(bx + 8, y0 + 2, 8, fh - 3, o.v("#8EA7B7")), rect(bx + 8, y0 + 2, 8, 3, o.v("#B5C9D5")));
        continue;
      }
      fenetre(o, bx + 4, y0 + 3, 16, 8, p.menuiserie);
      if (alleges && b % 2 === 0) o.out.push(rect(bx + 4, y0 + 11, 16, 2.5, o.v(p.accent)));
    }
  }
  o.out.push(rect(x, SOL - rdc, w, rdc, o.v(p.ombre)));
  for (let b = 0; b < nb; b++) {
    const bx = x + marge + b * pas;
    if (cages.includes(b)) o.out.push(rect(bx + 2, SOL - 15, 20, 15, o.v("#4E6170")), rect(bx - 1, SOL - 17.5, 26, 2.5, o.v(p.accent)));
    else fenetre(o, bx + 5, SOL - 13, 14, 7, p.menuiserie);
  }
}

/** Immeuble haussmannien : pierre, combles mansardés en zinc, lucarnes, balcons filants, commerces. */
function haussmann(o: Ctx, x: number, w: number, etages: number, p: Palette) {
  const fh = 17;
  const rdc = 22;
  const combles = 22;
  const haut = SOL - rdc - etages * fh;
  const pas = 28;
  const { nb, marge } = travees(w, pas, 5);
  const fer = "#3A3F46";
  // cheminées derrière le brisis
  for (let k = 0; k < 2 + Math.floor(o.rng() * 2); k++) o.out.push(rect(x + entre(o.rng, 16, w - 26), haut - combles - 9, 7, 10, o.v("#B8735A")));
  o.out.push(
    poly([[x - 3, haut], [x + w + 3, haut], [x + w - 10, haut - combles], [x + 10, haut - combles]], o.v("#7E8C96")),
    rect(x + 10, haut - combles - 1.5, w - 20, 2, o.v("#68757E")),
    rect(x, haut, w, SOL - haut, o.v(p.pierre))
  );
  for (let b = 0; b < nb; b++) {
    const lx = x + marge + b * pas + 8;
    o.out.push(rect(lx - 1, haut - combles + 6, 14, 15, o.v(p.pierre)), poly([[lx - 2, haut - combles + 6], [lx + 14, haut - combles + 6], [lx + 6, haut - combles + 1]], o.v(p.pierre)));
    fenetre(o, lx + 2, haut - combles + 9, 8, 10, p.menuiserie);
  }
  o.out.push(rect(x - 4, haut - 1, w + 8, 4, o.v(p.ombre)));
  for (let e = 0; e < etages; e++) {
    const y0 = SOL - rdc - (e + 1) * fh;
    o.out.push(rect(x, y0 + fh - 1.5, w, 1.5, o.v(p.ombre)));
    const filant = e === 1 || e === etages - 1;
    for (let b = 0; b < nb; b++) {
      const bx = x + marge + b * pas;
      fenetre(o, bx + 8, y0 + 3, 12, 12, p.menuiserie, true);
      if (!filant) o.out.push(rect(bx + 7, y0 + 12, 14, 2, o.v(fer)));
    }
    if (filant) o.out.push(rect(x + 3, y0 + fh - 5, w - 6, 3, o.v(fer)), rect(x + 3, y0 + fh - 9, w - 6, 0.8, o.v(fer)));
  }
  o.out.push(rect(x, SOL - rdc, w, rdc, o.v(p.ombre)));
  const porte = Math.floor(nb / 2);
  for (let b = 0; b < nb; b++) {
    const bx = x + marge + b * pas;
    if (b === porte) {
      o.out.push(rect(bx + 6, SOL - 18, 16, 18, o.v("#5A3E2E")), rect(bx + 13.5, SOL - 18, 1, 18, o.v("#47301F")));
    } else {
      o.out.push(rect(bx + 3, SOL - 15, 22, 15, o.v("#56697A")), rect(bx + 4, SOL - 14, 20, 4, o.v("#7F93A2")));
      if (b % 2 === 0) o.out.push(poly([[bx + 1, SOL - 19], [bx + 27, SOL - 19], [bx + 29, SOL - 14], [bx - 1, SOL - 14]], o.v(p.accent)));
    }
  }
}

/** Petit collectif à toit de tuiles : façade enduite de couleur, volets, lucarnes. */
function tuiles(o: Ctx, x: number, w: number, etages: number, p: Palette) {
  const fh = 17;
  const rdc = 19;
  const toit = entre(o.rng, 30, 42);
  const haut = SOL - rdc - etages * fh;
  const pas = 30;
  const { nb, marge } = travees(w, pas, 4);
  const tuile = parmi(o.rng, ["#B4583A", "#A9503A", "#9C4A34", "#B86848"]);
  const volet = parmi(o.rng, [p.accent, "#5F7F4F", "#2F6F8F", "#8A5A44", "#F3F1EC"]);
  const [gx, dx] = [x + w * 0.27, x + w * 0.73];
  o.out.push(rect(dx - 18, haut - toit - 4, 8, toit, o.v("#B8735A")));
  o.out.push(poly([[x - 7, haut + 1], [x + w + 7, haut + 1], [dx, haut - toit], [gx, haut - toit]], o.v(tuile)));
  for (let k = 1; k * 6 < toit; k++) {
    const t = (k * 6) / toit;
    const xa = x - 7 + (gx - (x - 7)) * t;
    const xb = x + w + 7 + (dx - (x + w + 7)) * t;
    o.out.push(rect(xa, haut + 1 - k * 6, xb - xa, 0.8, o.v(melange(tuile, "#000000", 0.18))));
  }
  for (const lx of nb >= 4 ? [x + w * 0.33, x + w * 0.62] : [x + w * 0.46]) {
    const ly = haut - toit * 0.55;
    o.out.push(rect(lx, ly, 14, 13, o.v(p.facade)), poly([[lx - 3, ly], [lx + 17, ly], [lx + 7, ly - 7]], o.v(tuile)));
    fenetre(o, lx + 3, ly + 3, 8, 9, p.menuiserie);
  }
  o.out.push(rect(x, haut, w, SOL - haut, o.v(p.facade)), rect(x - 7, haut, w + 14, 2, o.v(melange(tuile, "#000000", 0.3))));
  for (let e = 0; e < etages; e++) {
    const y0 = SOL - rdc - (e + 1) * fh;
    for (let b = 0; b < nb; b++) {
      const bx = x + marge + b * pas + 9.5;
      o.out.push(rect(bx - 5, y0 + 3, 4.5, 12, o.v(volet)), rect(bx + 11.5, y0 + 3, 4.5, 12, o.v(volet)));
      fenetre(o, bx, y0 + 3, 11, 12, p.menuiserie, true);
    }
  }
  o.out.push(rect(x, SOL - 6, w, 6, o.v(p.ombre)));
  const porte = Math.floor(nb / 2);
  for (let b = 0; b < nb; b++) {
    const bx = x + marge + b * pas + 9.5;
    if (b === porte) o.out.push(rect(bx - 1, SOL - 16, 13, 16, o.v(melange(volet, "#000000", 0.25))), rect(bx - 4, SOL - 18, 19, 2, o.v(tuile)));
    else fenetre(o, bx, SOL - 15, 11, 9, p.menuiserie);
  }
}

/** Tour : nombreux étages, bandes verticales colorées, local technique en toiture. */
function tour(o: Ctx, x: number, w: number, etages: number, p: Palette) {
  const fh = 12;
  const rdc = 16;
  const haut = SOL - rdc - etages * fh;
  const pas = 19;
  const { nb, marge } = travees(w, pas, 5);
  o.out.push(
    rect(x + w * 0.5, haut - 24, 1.2, 14, o.v("#59616A")),
    rect(x + w * 0.3, haut - 11, w * 0.4, 11, o.v(p.ombre)),
    rect(x, haut, w, SOL - haut, o.v(p.facade)),
    rect(x - 2, haut - 3, w + 4, 4, o.v(p.ombre))
  );
  const bande = melange(p.accent, p.facade, 0.5);
  const horizontales = o.rng() < 0.5;
  if (!horizontales)
    for (let b = 0; b < nb; b++) if (b % 4 === 1) o.out.push(rect(x + marge + b * pas, haut + 3, pas, SOL - rdc - haut - 3, o.v(bande)));
  for (let e = 0; e < etages; e++) {
    const y0 = SOL - rdc - (e + 1) * fh;
    if (horizontales) o.out.push(rect(x, y0 + 9.5, w, 2.5, o.v(bande)));
    for (let b = 0; b < nb; b++) fenetre(o, x + marge + b * pas + 4, y0 + 2.5, 11, 7, p.menuiserie);
  }
  o.out.push(rect(x, SOL - rdc, w, rdc, o.v(p.ombre)), rect(x + 6, SOL - 13, w - 12, 13, o.v("#55697A")));
  for (let k = x + 6; k < x + w - 6; k += 16) o.out.push(rect(k, SOL - 13, 1.5, 13, o.v(p.ombre)));
}

/** Résidence récente ou rénovée : enduit clair, bardage bois, balcons vitrés, panneaux solaires. */
function moderne(o: Ctx, x: number, w: number, etages: number, p: Palette) {
  const fh = 18;
  const rdc = 20;
  const haut = SOL - rdc - etages * fh;
  const pas = 30;
  const { nb, marge } = travees(w, pas, 6);
  const enduit = melange(p.facade, "#FFFFFF", 0.55);
  const bois = parmi(o.rng, ["#B88A5C", "#A97D52", "#C29A6B"]);
  const vegetal = o.rng() < 0.35;
  o.out.push(rect(x, haut, w, SOL - haut, o.v(enduit)), rect(x - 2, haut - 4, w + 4, 5, o.v(melange(enduit, "#000000", 0.12))));
  if (vegetal) {
    for (let k = x + 4; k < x + w - 8; k += 9) o.out.push(ellipse(k + 4, haut - 5, 6, 3.5, o.v(parmi(o.rng, ["#6E9B4A", "#5E8C3A", "#7FA857"]))));
  } else {
    for (let k = x + 10; k + 18 < x + w - 8; k += 22)
      o.out.push(poly([[k, haut - 4], [k + 17, haut - 4], [k + 14, haut - 10], [k - 3, haut - 10]], o.v("#2F4A66")), rect(k - 1, haut - 8, 15, 0.8, o.v("#5F7D9B")));
  }
  const debutBois = entier(o.rng, 0, Math.max(0, nb - 2));
  o.out.push(rect(x + marge + debutBois * pas, haut + 4, pas * 2, SOL - rdc - haut - 4, o.v(bois)));
  for (let k = x + marge + debutBois * pas + 2; k < x + marge + (debutBois + 2) * pas; k += 3)
    o.out.push(rect(k, haut + 4, 0.7, SOL - rdc - haut - 4, o.v(melange(bois, "#000000", 0.15))));
  for (let e = 0; e < etages; e++) {
    const y0 = SOL - rdc - (e + 1) * fh;
    for (let b = 0; b < nb; b++) fenetre(o, x + marge + b * pas + 5, y0 + 3, 20, 12, "#3E4650");
    for (let b = e % 2; b < nb; b += 2) {
      const bx = x + marge + b * pas;
      o.out.push(
        rect(bx + 1, y0 + fh - 3, pas - 2, 3, o.v("#D3D3CF")),
        rect(bx + 2, y0 + fh - 9, pas - 4, 6, o.v("#BFDCE6"), ' fill-opacity="0.6"'),
        rect(bx + 2, y0 + fh - 9.5, pas - 4, 1, o.v("#8C9BA3"))
      );
    }
  }
  o.out.push(rect(x, SOL - rdc, w, rdc, o.v(melange(enduit, "#000000", 0.08))));
  const porte = Math.floor(nb / 2);
  for (let b = 0; b < nb; b++) {
    const bx = x + marge + b * pas;
    if (b === porte) o.out.push(rect(bx + 2, SOL - 17, pas - 4, 17, o.v(p.accent)), rect(bx + 5, SOL - 15, pas - 10, 15, o.v("#55697A")));
    else fenetre(o, bx + 5, SOL - 15, 20, 10, "#3E4650");
  }
}

/** Immeuble ordinaire de voisinage : façade enduite, fenêtres en grille, corniche. */
function simple(o: Ctx, x: number, w: number, etages: number, p: Palette) {
  const fh = 16;
  const rdc = 18;
  const haut = SOL - rdc - etages * fh;
  const pas = 26;
  const { nb, marge } = travees(w, pas, 5);
  const volets = o.rng() < 0.4;
  o.out.push(rect(x, haut, w, SOL - haut, o.v(p.facade)), rect(x - 3, haut - 3, w + 6, 4, o.v(p.ombre)));
  for (let e = 0; e < etages; e++) {
    const y0 = SOL - rdc - (e + 1) * fh;
    for (let b = 0; b < nb; b++) {
      const bx = x + marge + b * pas + 7;
      if (volets) o.out.push(rect(bx - 4, y0 + 3, 3.5, 11, o.v(p.accent)), rect(bx + 12.5, y0 + 3, 3.5, 11, o.v(p.accent)));
      fenetre(o, bx, y0 + 3, 12, 11, p.menuiserie, true);
    }
  }
  o.out.push(rect(x, SOL - rdc, w, rdc, o.v(p.ombre)));
  for (let b = 0; b < nb; b++) {
    const bx = x + marge + b * pas + 7;
    if (b === Math.floor(nb / 2)) o.out.push(rect(bx, SOL - 15, 12, 15, o.v("#5A4636")));
    else fenetre(o, bx, SOL - 13, 12, 8, p.menuiserie);
  }
}

const DESSINS: Record<Style, (o: Ctx, x: number, w: number, etages: number, p: Palette) => void> = {
  barre,
  haussmann,
  tuiles,
  tour,
  moderne,
  simple,
};

/** Largeur et nombre d'étages par architecture : [largeur min, max, étages min, max]. */
const GABARITS: Record<Style, { principal: [number, number, number, number]; voisin: [number, number, number, number] }> = {
  barre: { principal: [580, 700, 7, 9], voisin: [260, 360, 5, 7] },
  haussmann: { principal: [320, 390, 5, 6], voisin: [190, 270, 4, 5] },
  tuiles: { principal: [270, 330, 3, 4], voisin: [150, 220, 2, 3] },
  tour: { principal: [210, 240, 13, 14], voisin: [150, 180, 9, 11] },
  moderne: { principal: [400, 480, 5, 6], voisin: [200, 290, 3, 5] },
  simple: { principal: [240, 300, 4, 6], voisin: [130, 230, 3, 6] },
};

const STYLES_VOISINS: Style[] = ["simple", "simple", "haussmann", "tuiles", "moderne", "barre", "simple"];

// ---------- Décor ----------

function arbre(o: Ctx, x: number, h: number, feuillages: string[]) {
  const tronc = h * 0.38;
  o.out.push(rect(x - 2, SOL + 4 - tronc, 4, tronc, "#6B5442"));
  const cy = SOL + 4 - tronc - h * 0.28;
  const r = h * 0.3;
  if (o.rng() < 0.3) {
    o.out.push(ellipse(x, cy - r * 0.3, r * 0.75, r * 1.45, feuillages[1]), ellipse(x - r * 0.2, cy - r * 0.5, r * 0.4, r * 0.9, feuillages[2], ' fill-opacity="0.7"'));
    return;
  }
  o.out.push(
    cercle(x - r * 0.55, cy + r * 0.15, r * 0.75, feuillages[0]),
    cercle(x + r * 0.55, cy + r * 0.1, r * 0.8, feuillages[1]),
    cercle(x, cy - r * 0.35, r * 0.9, feuillages[1]),
    cercle(x - r * 0.25, cy - r * 0.55, r * 0.45, feuillages[2], ' fill-opacity="0.75"')
  );
}

function lampadaire(o: Ctx, x: number) {
  o.out.push(rect(x - 0.8, SOL - 30, 1.6, 34, "#4A5058"), rect(x - 0.8, SOL - 30, 9, 1.4, "#4A5058"), rect(x + 5, SOL - 29, 6, 2.5, "#3A3F46"));
}

function nuage(o: Ctx, x: number, y: number, s: number) {
  const blanc = ' fill-opacity="0.8"';
  o.out.push(ellipse(x, y, 34 * s, 9 * s, "#FFFFFF", blanc), ellipse(x - 12 * s, y - 5 * s, 16 * s, 9 * s, "#FFFFFF", blanc), ellipse(x + 10 * s, y - 7 * s, 20 * s, 11 * s, "#FFFFFF", blanc));
}

// ---------- Composition ----------

/** Variante de 0 à 39 : architecture = index modulo 5, couleurs et ciel selon le rang. */
export function svgBatimentFictif(index: number): string {
  const i = ((Math.floor(index) % NB_BATIMENTS_FICTIFS) + NB_BATIMENTS_FICTIFS) % NB_BATIMENTS_FICTIFS;
  const style = STYLES_PRINCIPAUX[i % STYLES_PRINCIPAUX.length];
  const variante = Math.floor(i / STYLES_PRINCIPAUX.length);
  const pal = PALETTES[variante % PALETTES.length];
  const ciel = CIELS[(variante + (i % STYLES_PRINCIPAUX.length) * 2) % CIELS.length];
  const rng = mulberry32(i * 9973 + 1789);
  const automne = variante % 4 === 3;
  const feuillages = automne ? ["#C98A3A", "#D9A441", "#B5652F"] : ["#5E8C3A", "#6F9E45", "#86AE5C"];
  const out: string[] = [];
  const net: Ctx = { out, rng, ciel, v: (c) => c };
  const voisinage: Ctx = { out, rng, ciel, v: (c) => melange(c, ciel.bas, 0.24) };
  const lointain = melange(ciel.bas, "#7F8C98", 0.28);

  // ciel, soleil, nuages
  out.push(rect(0, 0, L, H, "url(#ciel)"));
  if (ciel.soleil) {
    const sx = ciel.soleil.x * L;
    out.push(cercle(sx, ciel.soleil.y, 70, ciel.soleil.couleur, ' fill-opacity="0.35"'), cercle(sx, ciel.soleil.y, 24, ciel.soleil.couleur));
  }
  if (ciel.nuages) for (let k = 0; k < 4; k++) nuage(net, entre(rng, 40, L - 40), entre(rng, 22, 70), entre(rng, 0.7, 1.3));

  // silhouettes lointaines
  for (let x = -20; x < L; ) {
    const w = entre(rng, 50, 140);
    const h = entre(rng, 60, 140);
    out.push(rect(x, SOL - h, w + 1, h, lointain));
    x += w;
  }

  // bâtiment principal centré, voisins de part et d'autre
  const [wmin, wmax, emin, emax] = GABARITS[style].principal;
  const wp = Math.round(entre(rng, wmin, wmax));
  const xp = Math.round(L / 2 - wp / 2 + entre(rng, -30, 30));
  const etagesPrincipal = entier(rng, emin, emax);
  const plafondVoisin = style === "tuiles" ? 4 : style === "tour" ? 7 : 9;
  const arbres: number[] = [];
  const voisin = (bordInterieur: number, versLaGauche: boolean): number => {
    const s = parmi(rng, STYLES_VOISINS);
    const [vmin, vmax, vemin, vemax] = GABARITS[s].voisin;
    const w = Math.round(entre(rng, vmin, vmax));
    const espace = rng() < 0.3 ? Math.round(entre(rng, 34, 70)) : 0;
    if (espace) arbres.push(versLaGauche ? bordInterieur - espace / 2 : bordInterieur + espace / 2);
    const x = versLaGauche ? bordInterieur - espace - w : bordInterieur + espace;
    const p = PALETTES[(variante + 1 + Math.floor(rng() * (PALETTES.length - 1))) % PALETTES.length];
    DESSINS[s](voisinage, x, w, Math.min(plafondVoisin, entier(rng, vemin, vemax)), p);
    return versLaGauche ? x : x + w;
  };
  for (let bord = xp; bord > 0; ) bord = voisin(bord, true);
  for (let bord = xp + wp; bord < L; ) bord = voisin(bord, false);
  if (style === "barre" && rng() < 0.5) {
    // barre en deux volumes de hauteurs différentes
    const wg = Math.round(wp * entre(rng, 0.45, 0.6));
    const ecart = entier(rng, 2, 3) * (rng() < 0.5 ? -1 : 1);
    barre(net, xp, wg, etagesPrincipal, pal);
    barre(net, xp + wg, wp - wg, etagesPrincipal + ecart, pal);
  } else DESSINS[style](net, xp, wp, etagesPrincipal, pal);

  // trottoir, chaussée
  out.push(rect(0, SOL, L, 12, "#D9D5CC"), rect(0, SOL + 12, L, 2, "#B7B2A8"), rect(0, SOL + 14, L, H - SOL - 14, "#7F858C"));
  for (let x = 20; x < L; x += 70) out.push(rect(x, SOL + 20, 30, 1.6, "#E6E6E6"));

  // arbres et lampadaires, en laissant dégagé le cœur du bâtiment principal
  const coeur: [number, number] = [xp + wp * 0.22, xp + wp * 0.78];
  for (let k = 0; k < 5; k++) {
    const x = entre(rng, 30, L - 30);
    if (x > coeur[0] - 30 && x < coeur[1] + 30) continue;
    arbres.push(x);
  }
  if (rng() < 0.6) arbres.push(xp + (rng() < 0.5 ? 10 : wp - 10));
  for (let x = entre(rng, 60, 160); x < L; x += entre(rng, 220, 320)) {
    if (x > coeur[0] && x < coeur[1]) continue;
    if (arbres.some((a) => Math.abs(a - x) < 30)) continue;
    lampadaire(net, x);
  }
  for (const x of arbres) arbre(net, x, entre(rng, 44, 72), feuillages);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${H}" width="${L}" height="${H}">` +
    `<defs><linearGradient id="ciel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ciel.haut}"/><stop offset="0.85" stop-color="${ciel.bas}"/></linearGradient></defs>` +
    out.join("") +
    `</svg>`
  );
}

/** Variante attribuée à un dossier : toujours la même pour un même identifiant (FNV-1a). */
export function indexBatimentFictif(graine: string): number {
  let h = 0x811c9dc5;
  for (let k = 0; k < graine.length; k++) {
    h ^= graine.charCodeAt(k);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % NB_BATIMENTS_FICTIFS;
}

/** Encodage minimal d'un SVG pour une URL data: (guillemets simples, seuls
 *  les caractères réservés sont échappés) : bien plus court que
 *  encodeURIComponent. */
export function encoderSvg(svg: string): string {
  return svg.replace(/"/g, "'").replace(/[%#<>{}]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

const cache = new Map<number, string>();

/** Image fictive d'un dossier, en URL data: prête pour un <img>. */
export function urlBatimentFictif(graine: string): string {
  const i = indexBatimentFictif(graine);
  let url = cache.get(i);
  if (!url) {
    url = "data:image/svg+xml;charset=utf-8," + encoderSvg(svgBatimentFictif(i));
    cache.set(i, url);
  }
  return url;
}
