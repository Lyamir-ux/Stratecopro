import { describe, expect, it } from "vitest";
import { computeIndiv, type PlanIndiv, type Scenario } from "../portail";
import { BAREME_2026_HORS_IDF } from "@/lib/finance";

// Plans par bâtiment (11/10/2026) : le portail lit la part exacte d'un lot dans
// le détail publié au partage, même quand les lots du copropriétaire relèvent
// de PF différents (logement au A, garage au B).
const scenario = (params: Record<string, unknown> = {}): Scenario =>
  ({
    id: "s",
    copro_id: "c",
    name: "PF définitifs par bâtiment",
    statut: "partage",
    locked: true,
    bareme_millesime: 2026,
    params: { travaux: 16000, honoraires: 0, aleas: 0, cle: "MUN", totalCle: 1000, mprCoproPct: 0, cee: 0, fonds: 1000, ...params },
    resultat: null,
    plan_definitif_id: "pfA",
    pf_ids: ["pfA", "pfB"],
    validated_at: null,
    created_at: "",
    updated_at: "",
  }) as unknown as Scenario;

const plan = {
  scenario_id: "s",
  coproprietaire_id: "x",
  tantiemes: 300,
  quote_part: 4681.82,
  cee_part: 0,
  subv_coll_part: 250,
  mpr_indiv: 0,
  reste: 4431.82,
  detail: {
    source: "pf",
    parLot: {
      A1: { quotePart: 2500, cee: 0, subvColl: 250 },
      B1: { quotePart: 2181.82, cee: 0, subvColl: 0 },
    },
  },
} as unknown as PlanIndiv;

describe("computeIndiv avec le détail lot par lot", () => {
  it("un lot : sa part publiée, pas une mise à l'échelle par les tantièmes", () => {
    const garage = computeIndiv(scenario(), BAREME_2026_HORS_IDF, plan, 200, null, ["B1"]);
    expect(garage.quotePart).toBeCloseTo(2181.82, 2);
    expect(garage.subvColl).toBe(0);
    expect(garage.exact).toBe(true);
  });

  it("tous les lots : le plan cumulé tel quel", () => {
    const tout = computeIndiv(scenario(), BAREME_2026_HORS_IDF, plan, 300, null, ["A1", "B1"]);
    expect(tout.quotePart).toBeCloseTo(4681.82, 2);
    expect(tout.resteAvantTravaux).toBeCloseTo(4431.82, 2);
  });

  it("PF par bâtiment sans ligne pour le copropriétaire : aucune quote-part estimée", () => {
    const rien = computeIndiv(scenario({ parBatiment: true }), BAREME_2026_HORS_IDF, null, 100, null, ["C1"]);
    expect(rien.quotePart).toBe(0);
    expect(rien.resteAvantTravaux).toBe(0);
  });

  it("sans détail publié : mise à l'échelle historique par les tantièmes", () => {
    const ancien = { ...plan, detail: { source: "pf" } } as unknown as PlanIndiv;
    expect(computeIndiv(scenario(), BAREME_2026_HORS_IDF, ancien, 150, null, ["A1"]).quotePart).toBeCloseTo(4681.82 / 2, 2);
  });
});
