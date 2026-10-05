import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { computePlanDefinitif, repartirPfDepuisLots, tableauDepuisRepartition, type LotPourRepartition } from "@/lib/finance";
import { makeViolettes } from "@/lib/finance/__tests__/fixtureViolettes";
import {
  colonnesTableau,
  genererTableauCoproprietairesPdf,
  nomFichierTableauCoproprietaires,
  notesTableau,
} from "../tableauCoproprietaires";

const data = makeViolettes();
const pv = computePlanDefinitif(data);
const cles = [{ code: "MUN", is_default: true }];

const lotsDe = (n: number): LotPourRepartition[] =>
  Array.from({ length: n }, (_, i) => ({
    coproprietaire_id: `cp${i}`,
    coproprietaire: { nom: `Prénom${i} NOM${String(i).padStart(3, "0")} d'Œuvre` },
    tantiemes: { MUN: 1000 / n },
  }));

const tableau = (variante: "collectif" | "individuel", n = 3, d = data) =>
  tableauDepuisRepartition(variante, d, repartirPfDepuisLots(d, pv, lotsDe(n), cles));

describe("colonnesTableau", () => {
  it("collectif : les 8 colonnes demandées, dans l'ordre", () => {
    const cols = colonnesTableau(tableau("collectif"));
    expect(cols.map((c) => c.titre)).toEqual([
      "Nom du copropriétaire",
      "Tantièmes",
      "Quote-part avant aides",
      "Reste à financer",
      "Mensualité sur 20 ans",
      "Coût du prêt avance de subvention",
      "Prime C2E",
      "Prix de revient",
    ]);
    expect(cols.reduce((s, c) => s + c.w, 0)).toBeCloseTo(841.89 - 80, 1);
  });

  it("collectif sans avance : la colonne du coût d'avance disparaît", () => {
    const sans = { ...data, variantes: { collectif: false, collectifSansAvance: true, individuel: false } };
    const titres = colonnesTableau(tableau("collectif", 3, sans)).map((c) => c.titre);
    expect(titres).not.toContain("Coût du prêt avance de subvention");
    expect(titres).toHaveLength(7);
  });

  it("individuel : appels de fonds, remboursement de fin de chantier", () => {
    const titres = colonnesTableau(tableau("individuel")).map((c) => c.titre);
    expect(titres).toContain("Reste à financer (appels de fonds)");
    expect(titres).toContain("Remboursé en fin de chantier");
    expect(titres).not.toContain("Coût du prêt avance de subvention");
  });

  it("formate les montants au centime, tirets simples", () => {
    const t = tableau("collectif");
    const cols = colonnesTableau(t);
    const total = cols[2].valeur(t.totaux);
    expect(total).toMatch(/^\d[\d ]*,\d{2} €$/);
    expect(notesTableau(t).join(" ")).not.toMatch(/[—–]/);
  });
});

describe("genererTableauCoproprietairesPdf", () => {
  it("produit un PDF paysage titré pour chaque variante", async () => {
    for (const variante of ["collectif", "individuel"] as const) {
      const bytes = await genererTableauCoproprietairesPdf({
        coproNom: "LA VIOLETTE",
        planNom: "PF définitif validé",
        tableau: tableau(variante),
        genereLe: "5 octobre 2026",
      });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
      const { width, height } = doc.getPage(0).getSize();
      expect(width).toBeGreaterThan(height);
      expect(doc.getTitle()).toContain("LA VIOLETTE");
    }
  });

  it("tient sur plusieurs pages avec beaucoup de copropriétaires", async () => {
    const bytes = await genererTableauCoproprietairesPdf({
      coproNom: "MEINAU",
      tableau: tableau("collectif", 130),
      genereLe: "5 octobre 2026",
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });

  it("supporte un tableau vide", async () => {
    const vide = tableauDepuisRepartition("collectif", data, repartirPfDepuisLots(data, pv, [], cles));
    const bytes = await genererTableauCoproprietairesPdf({ coproNom: "VIDE", tableau: vide, genereLe: "5 octobre 2026" });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

describe("nomFichierTableauCoproprietaires", () => {
  it("nomme le fichier d'après la copropriété, la variante et la date", () => {
    expect(nomFichierTableauCoproprietaires("LA VIOLETTE", "collectif", new Date("2026-10-05T10:00:00Z"))).toBe(
      "LA VIOLETTE - Tableau de financement - prêt collectif - 2026-10-05.pdf"
    );
    expect(nomFichierTableauCoproprietaires("A/B", "individuel", new Date("2026-10-05T10:00:00Z"))).toBe(
      "A B - Tableau de financement - éco-PTZ individuel - 2026-10-05.pdf"
    );
  });
});
