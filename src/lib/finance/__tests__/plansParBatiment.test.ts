// Plans de financement par bâtiment (demande d'Amir, 11/10/2026) : chaque PF est
// réparti entre les seuls lots de son périmètre, puis les parts s'additionnent
// par copropriétaire.
import { describe, expect, it } from "vitest";
import { computePlanDefinitif, makeDefaultPlanDefinitif } from "../planDefinitif";
import {
  cumulerPlansIndividuels,
  lotsDuPerimetre,
  perimetresSeChevauchent,
  repartirPfs,
  repartitionParLot,
  type PfARepartir,
} from "../repartitionPf";
import { syntheseEnergetiquePfs } from "../syntheseEnergetiquePf";
import { fusionnerEcoPtzParBatiment, type LogementEcoPtz, type PosteEcoPtz } from "../ecoPtzIndividuel";

function pf(id: string, montantHt: number, batimentIds: string[] | null, fondsTravaux = 0): PfARepartir {
  const data = makeDefaultPlanDefinitif();
  data.params.imprevusPct = 0;
  data.params.fondsTravaux = fondsTravaux;
  data.aides = [];
  data.moe = [];
  data.lots = [{ numero: 1, titre: "ITE", remisePct: 0, lignes: [{ designation: "ITE", retenu: true, montantHt, tvaPct: 0 }] }];
  return { id, nom: id, data, resultat: computePlanDefinitif(data), batimentIds };
}

// x : un logement au A et un garage au B ; y au A ; z au B ; un lot sans bâtiment
const lot = (id: string, bat: string | null, cp: string | null, mun: number) => ({
  id,
  batiment_id: bat,
  coproprietaire_id: cp,
  coproprietaire: cp ? { nom: cp.toUpperCase() } : null,
  tantiemes: { MUN: mun },
});
const lots = [
  lot("A1", "A", "x", 100),
  lot("A2", "A", "y", 300),
  lot("B1", "B", "x", 200),
  lot("B2", "B", "z", 350),
  lot("S1", null, "z", 50),
];
const cles = [{ code: "MUN", is_default: true }];

describe("périmètre d'un PF", () => {
  it("toute la copropriété, ou les seuls lots des bâtiments cochés", () => {
    expect(lotsDuPerimetre(lots, null)).toHaveLength(5);
    expect(lotsDuPerimetre(lots, []).map((l) => l.id)).toHaveLength(5);
    expect(lotsDuPerimetre(lots, ["A"]).map((l) => l.id)).toEqual(["A1", "A2"]);
    // un lot sans bâtiment n'entre dans aucun périmètre restreint
    expect(lotsDuPerimetre(lots, ["A", "B"]).map((l) => l.id)).toEqual(["A1", "A2", "B1", "B2"]);
  });

  it("chevauchement : toute la copropriété chevauche tout, des bâtiments distincts non", () => {
    expect(perimetresSeChevauchent(null, ["A"])).toBe(true);
    expect(perimetresSeChevauchent(["A"], ["B"])).toBe(false);
    expect(perimetresSeChevauchent(["A", "B"], ["B"])).toBe(true);
  });
});

describe("repartirPfs", () => {
  const pfs = [pf("PF A", 10000, ["A"], 1000), pf("PF B", 6000, ["B"])];

  it("répartit chaque PF sur les tantièmes de son bâtiment et cumule par copropriétaire", () => {
    const rep = repartirPfs(pfs, lots, cles);
    expect(rep.complet).toBe(true);
    expect(rep.cleRef).toBe("MUN");
    expect(rep.parPf[0].repartition.totauxCles.MUN).toBe(400);
    expect(rep.parPf[1].repartition.totauxCles.MUN).toBe(550);
    const parCp = new Map(rep.plans.map((p) => [p.coproprietaireId, p]));
    // x : 10 000 × 100/400 au A + 6 000 × 200/550 au B
    expect(parCp.get("x")!.quotePartAvant).toBeCloseTo(2500 + 2181.82, 2);
    expect(parCp.get("y")!.quotePartAvant).toBeCloseTo(7500, 2);
    expect(parCp.get("z")!.quotePartAvant).toBeCloseTo(3818.18, 2);
    // fonds travaux du PF A : au prorata des quotes-parts du A seulement
    expect(parCp.get("x")!.fondsTravaux).toBeCloseTo(250, 2);
    expect(parCp.get("z")!.fondsTravaux).toBe(0);
    // le lot sans bâtiment ne reçoit rien
    expect(rep.plans.reduce((s, p) => s + p.quotePartAvant, 0)).toBeCloseTo(16000, 1);
  });

  it("un seul PF de toute la copropriété : répartition historique sur tous les lots", () => {
    const rep = repartirPfs([pf("PF", 10000, null)], lots, cles);
    expect(rep.parPf[0].lots).toHaveLength(5);
    expect(rep.plans.find((p) => p.coproprietaireId === "x")!.quotePartAvant).toBeCloseTo(3000, 2);
  });

  it("le détail lot par lot redonne le plan de chaque copropriétaire", () => {
    const rep = repartirPfs(pfs, lots, cles);
    const detail = new Map<string, number>();
    for (const { pf: p, lots: l } of rep.parPf)
      for (const [id, part] of repartitionParLot(p.data, p.resultat, l, cles)) detail.set(id, (detail.get(id) ?? 0) + part.quotePartAvant);
    expect(detail.get("A1")).toBeCloseTo(2500, 2);
    expect(detail.get("B1")).toBeCloseTo(2181.82, 2);
    expect(detail.has("S1")).toBe(false);
    const x = rep.plans.find((p) => p.coproprietaireId === "x")!;
    expect(detail.get("A1")! + detail.get("B1")!).toBeCloseTo(x.quotePartAvant, 1);
  });

  it("cumulerPlansIndividuels additionne toutes les colonnes", () => {
    const p = { coproprietaireId: "x", nom: "X", quotePartAvant: 10, aidesEtFonds: 4, primeCee: 1, aidesPubliques: 2, fondsTravaux: 1, reste: 6 };
    const [c] = cumulerPlansIndividuels([[p], [{ ...p, quotePartAvant: 5, reste: 1 }]]);
    expect(c).toMatchObject({ quotePartAvant: 15, aidesEtFonds: 8, primeCee: 2, aidesPubliques: 4, fondsTravaux: 2, reste: 7 });
  });
});

describe("syntheseEnergetiquePfs", () => {
  const avecInfos = (surface: number, cepI: number, cepP: number, etI: string, etP: string) => {
    const p = pf("p", 1000, null);
    Object.assign(p.data.infos, { surfaceHabitable: surface, cepInitial: cepI, cepProjet: cepP, etiquetteInitiale: etI, etiquetteProjet: etP });
    return { data: p.data, resultat: computePlanDefinitif(p.data) };
  };

  it("un seul PF : son gain et ses étiquettes", () => {
    expect(syntheseEnergetiquePfs([avecInfos(1000, 300, 150, "E", "C")])).toEqual({ gainPct: 50, etiquetteAvant: "E", etiquetteApres: "C" });
  });

  it("plusieurs PF : consommations pondérées par la surface, étiquettes les moins bonnes", () => {
    const s = syntheseEnergetiquePfs([avecInfos(1000, 300, 150, "E", "C"), avecInfos(500, 200, 150, "D", "B")]);
    // (150×1000 + 150×500) / (300×1000 + 200×500) = 225 000 / 400 000
    expect(s).toEqual({ gainPct: 43.8, etiquetteAvant: "E", etiquetteApres: "C" });
  });
});

describe("fusionnerEcoPtzParBatiment", () => {
  const poste = (n: number, entreprise: string, montant: number): PosteEcoPtz => ({
    lotNumero: n,
    titre: `Lot ${n}`,
    entreprisePf: entreprise,
    montantTtc: montant,
    parCle: { MUN: montant },
    nbLignes: 1,
    lignesSansCle: 0,
  });
  const logement = (quoteParts: [number, number][]): LogementEcoPtz => ({
    lotId: "A1",
    lotNum: "1",
    batiment: "A",
    coproprietaireId: "x",
    nom: "X",
    annexes: [],
    tantiemes: { MUN: 100 },
    lignes: quoteParts.map(([n, q]) => ({
      lotNumero: n,
      titre: `Lot ${n}`,
      montantCopro: 1000,
      cle: "MUN",
      tantiemes: 100,
      totalCle: 400,
      plusieursCles: false,
      quotePart: q,
    })),
    total: quoteParts.reduce((s, [, q]) => s + q, 0),
    personneMorale: null,
  });

  it("regroupe les postes par numéro, additionne les parts du logement et signale les entreprises différentes", () => {
    const f = fusionnerEcoPtzParBatiment([
      { postes: [poste(1, "Façades SA", 1000), poste(2, "Chauffage", 500)], logements: [logement([[1, 250], [2, 0]])] },
      { postes: [poste(1, "Autre ITE", 800)], logements: [logement([[1, 40]])] },
    ]);
    expect(f.postes.map((p) => [p.lotNumero, p.montantTtc])).toEqual([
      [1, 1800],
      [2, 500],
    ]);
    expect(f.conflits).toEqual([1]);
    expect(f.logements).toHaveLength(1);
    expect(f.logements[0].total).toBe(290);
    expect(f.logements[0].lignes.find((l) => l.lotNumero === 1)!.quotePart).toBe(290);
  });
});
