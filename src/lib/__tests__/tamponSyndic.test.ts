import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { genBulletin, type AdherentSupplementaire, type AdhesionForm } from "../pdf/adhesion";
import { BULLETIN_COORDS } from "../pdf/coords";
import { ajusterDansCadre, erreurFichierTampon, octetsDuTampon, TAMPON_TAILLE_MAX_FICHIER } from "../tamponSyndic";

/** PNG RGBA uni de `l` x `h` pixels, fabriqué à la main (aucun encodeur dans l'environnement de test). */
function pngUni(l: number, h: number): string {
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.alloc(l * 4, 0x30)]);
  const brut = Buffer.concat(Array.from({ length: h }, () => ligne));
  const bloc = (type: string, data: Buffer) => {
    const t = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(l, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc("IHDR", ihdr),
    bloc("IDAT", deflateSync(brut)),
    bloc("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

describe("fichier du tampon", () => {
  it("PNG et JPG acceptés, même sans type renseigné (extension)", () => {
    expect(erreurFichierTampon({ name: "tampon.png", type: "image/png", size: 40_000 })).toBeNull();
    expect(erreurFichierTampon({ name: "tampon.JPG", type: "image/jpeg", size: 40_000 })).toBeNull();
    expect(erreurFichierTampon({ name: "tampon.jpeg", type: "", size: 40_000 })).toBeNull();
  });

  it("un PDF, un Word ou un SVG sont refusés avec le nom du fichier", () => {
    for (const [name, type] of [["tampon.pdf", "application/pdf"], ["tampon.docx", ""], ["tampon.svg", "image/svg+xml"]]) {
      expect(erreurFichierTampon({ name, type, size: 1000 })).toContain(`« ${name} »`);
    }
  });

  it("une image de plus de 15 Mo est refusée", () => {
    expect(erreurFichierTampon({ name: "t.png", type: "image/png", size: TAMPON_TAILLE_MAX_FICHIER })).toBeNull();
    expect(erreurFichierTampon({ name: "t.png", type: "image/png", size: TAMPON_TAILLE_MAX_FICHIER + 1 })).toContain("trop lourde");
  });
});

describe("data URL du tampon", () => {
  it("décode un PNG et un JPEG, avec leur format", () => {
    const png = octetsDuTampon(pngUni(4, 2));
    expect(png?.format).toBe("png");
    expect([...(png?.octets.slice(1, 4) ?? [])]).toEqual([0x50, 0x4e, 0x47]);
    expect(octetsDuTampon("data:image/jpeg;base64,/9j/4AAQ")?.format).toBe("jpg");
  });

  it("refuse tout ce qui n'est pas un PNG ou un JPEG en base 64", () => {
    for (const v of ["", "data:text/html;base64,AAAA", "data:image/svg+xml;base64,AAAA", "data:image/png;base64,é", "https://exemple.fr/t.png"]) {
      expect(octetsDuTampon(v)).toBeNull();
    }
  });
});

describe("placement dans le cadre", () => {
  const cadre = { x: 34, y: 696, w: 206, h: 43 };

  it("tampon large : limité par la largeur, centré en hauteur", () => {
    expect(ajusterDansCadre(412, 43, cadre)).toEqual({ x: 34, y: 696 + (43 - 21.5) / 2, width: 206, height: 21.5 });
  });

  it("tampon carré ou haut : limité par la hauteur, centré en largeur, proportions gardées", () => {
    const r = ajusterDansCadre(100, 100, cadre);
    expect(r).toEqual({ x: 34 + (206 - 43) / 2, y: 696, width: 43, height: 43 });
    expect(ajusterDansCadre(100, 200, cadre).width / ajusterDansCadre(100, 200, cadre).height).toBeCloseTo(0.5);
  });
});

describe("genBulletin : tampon du syndic", () => {
  const gabarit = readFileSync(resolve(__dirname, "../../../public/modeles/bulletin-adhesion-cegee.pdf"));
  vi.stubGlobal("fetch", async () => new Response(gabarit));

  const DOSSIER: AdhesionForm = {
    adherent1: {
      nomPrenom: "SCHMITT Paul",
      nomNaissance: "",
      dateLieuNaissance: "17/10/1972 à Colmar",
      profession: "Gérant",
      professionDepuis: "",
      situation: "mariee",
      situationDepuis: "",
    },
    adherent2: null,
    adresse: "1 rue de la Lauch",
    cp: "68000",
    ville: "Colmar",
    telDomicile: "",
    telBureau: "",
    portable: "06 12 34 56 78",
    email: "paul@exemple.fr",
    montantType: "100",
    montantAutre: "",
    lieuSignature: "Colmar",
  };
  const ANNA = {
    civilite: "Madame",
    nom: "SCHMITT",
    prenom: "Anna",
    email: "anna@exemple.fr",
    telephone: "+33 6 00 00 00 00",
    adresse_ligne1: "3 rue des Fleurs",
    code_postal: "68000",
    ville: "Colmar",
    date_naissance: "1975-03-02",
    lieu_naissance: "Mulhouse",
    nomNaissance: "",
    profession: "Architecte",
    professionDepuis: "",
    situation: "mariee",
    situationDepuis: "",
    telDomicile: "",
    telBureau: "",
  } as AdherentSupplementaire;
  const ctx = { adresseImmeuble: "1 rue de la Lauch, Colmar", nomSyndic: "Syndic", interlocuteur: "Gestionnaire", lotNum: "12", tantiemes: "48" };
  const date = new Date(2026, 10, 14);

  /** Images peintes sur la page n (rectangle x, y, largeur, hauteur en points), lues avec pdf.js. */
  async function imagesDeLaPage(octets: Uint8Array, n: number) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: octets.slice(), verbosity: 0 }).promise;
    const { fnArray, argsArray } = await (await doc.getPage(n)).getOperatorList();
    const { OPS } = pdfjs;
    type M = number[];
    const mul = (a: M, b: M): M => [
      a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
    ];
    let ctm: M = [1, 0, 0, 1, 0, 0];
    const pile: M[] = [];
    const images: { x: number; y: number; w: number; h: number }[] = [];
    fnArray.forEach((fn: number, i: number) => {
      if (fn === OPS.save) pile.push(ctm);
      else if (fn === OPS.restore) ctm = pile.pop() ?? ctm;
      else if (fn === OPS.transform) ctm = mul(ctm, argsArray[i] as M);
      else if (fn === OPS.paintImageXObject) images.push({ x: ctm[4], y: ctm[5], w: ctm[0], h: ctm[3] });
    });
    return images;
  }

  /** Images ajoutées sur la page n par le tampon : celles du bulletin avec tampon que le même bulletin sans tampon n'a pas
   *  (le gabarit porte déjà ses propres images). */
  async function imagesDuTampon(form: AdhesionForm, n: number) {
    const sans = await imagesDeLaPage(await genBulletin(form, ctx, date), n);
    const avec = await imagesDeLaPage(await genBulletin(form, { ...ctx, tamponSyndic: pngUni(40, 20) }, date), n);
    const reste = [...sans];
    return avec.filter((a) => {
      const i = reste.findIndex((b) => [b.x - a.x, b.y - a.y, b.w - a.w, b.h - a.h].every((d) => Math.abs(d) < 0.01));
      if (i < 0) return true;
      reste.splice(i, 1);
      return false;
    });
  }

  it("sans tampon : le bulletin est inchangé, le cadre reste vide comme avant", async () => {
    const [sans, nul, vide] = await Promise.all([
      genBulletin(DOSSIER, ctx, date),
      genBulletin(DOSSIER, { ...ctx, tamponSyndic: null }, date),
      genBulletin(DOSSIER, { ...ctx, tamponSyndic: "" }, date),
    ]);
    expect(await imagesDeLaPage(nul, 1)).toEqual(await imagesDeLaPage(sans, 1));
    expect(await imagesDeLaPage(vide, 1)).toEqual(await imagesDeLaPage(sans, 1));
  });

  it("avec tampon : l'image est dans le cadre « cachet du Syndic », sous son libellé", async () => {
    const [img, ...autres] = await imagesDuTampon(DOSSIER, 1);
    expect(autres).toEqual([]);
    const attendu = ajusterDansCadre(40, 20, BULLETIN_COORDS.tampon);
    expect(img.x).toBeCloseTo(attendu.x, 1);
    expect(img.y).toBeCloseTo(attendu.y, 1);
    expect(img.w).toBeCloseTo(attendu.width, 1);
    expect(img.h).toBeCloseTo(attendu.height, 1);
    // rectangle du gabarit : x 30 à 243,9 ; y 693,1 à 752,7 ; libellé « (cachet du Syndic) » à y 743,1
    expect(img.x).toBeGreaterThanOrEqual(30);
    expect(img.x + img.w).toBeLessThanOrEqual(243.9);
    expect(img.y).toBeGreaterThanOrEqual(693.1);
    expect(img.y + img.h).toBeLessThan(743.1);
  });

  it("une page formulaire par adhérent supplémentaire : le tampon est sur chacune, pas sur les conditions", async () => {
    const form = { ...DOSSIER, adherentsSupplementaires: [ANNA] };
    const octets = await genBulletin(form, { ...ctx, tamponSyndic: pngUni(40, 20) }, date);
    expect(await PDFDocument.load(octets).then((d) => d.getPageCount())).toBe(4);
    expect(await imagesDuTampon(form, 1)).toHaveLength(1);
    expect(await imagesDuTampon(form, 2)).toHaveLength(1);
    expect(await imagesDuTampon(form, 3)).toEqual([]);
  });

  it("un tampon illisible arrête la génération au lieu de partir sans tampon", async () => {
    await expect(genBulletin(DOSSIER, { ...ctx, tamponSyndic: "data:image/png;base64,AAAA" }, date)).rejects.toThrow(/illisible/);
    await expect(genBulletin(DOSSIER, { ...ctx, tamponSyndic: "n'importe quoi" }, date)).rejects.toThrow(/illisible/);
  });
});
