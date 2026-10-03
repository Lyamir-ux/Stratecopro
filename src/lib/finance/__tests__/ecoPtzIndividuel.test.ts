import { describe, expect, it } from "vitest";
import { makeDefaultPlanDefinitif, type PlanDefinitifData } from "../planDefinitif";
import {
  decouperAdresse,
  fmtMontantCerfa,
  logementsEcoPtz,
  personneMorale,
  postesEligiblesEcoPtz,
  type LotEcoPtz,
} from "../ecoPtzIndividuel";

function plan(): PlanDefinitifData {
  const p = makeDefaultPlanDefinitif();
  p.params.imprevusPct = 7; // jamais repris dans l'éco-PTZ
  p.lots = [
    {
      numero: 2,
      titre: "Isolation thermique par l'extérieur",
      entreprise: "DECOPEINT",
      remisePct: 10,
      lignes: [
        { designation: "ITE", retenu: true, montantHt: 100000, tvaPct: 5.5 },
        { designation: "Peinture", retenu: false, montantHt: 20000, tvaPct: 10 },
      ],
    },
    {
      numero: 3,
      titre: "Ventilation",
      entreprise: "SCHUCH",
      remisePct: 0,
      lignes: [{ designation: "VMC", retenu: true, montantHt: 30000, tvaPct: 5.5, cleRepartition: "BATA" }],
    },
    {
      numero: 4,
      titre: "Embellissement",
      remisePct: 0,
      lignes: [{ designation: "Hall", retenu: false, montantHt: 15000, tvaPct: 10 }],
    },
  ];
  return p;
}

const cles = [
  { code: "GEN", is_default: true },
  { code: "BATA", is_default: false },
];

const lots: LotEcoPtz[] = [
  { id: "h1", num: "12", usage: "habitation", coproprietaire_id: "a", rattache_a: null, tantiemes: { GEN: 200, BATA: 100 } },
  { id: "c1", num: "45", usage: "caves", coproprietaire_id: "a", rattache_a: "h1", tantiemes: { GEN: 10, BATA: 5 } },
  { id: "p1", num: "60", usage: "garage", coproprietaire_id: "a", rattache_a: null, tantiemes: { GEN: 30 } },
  { id: "h2", num: "13", usage: "habitation", coproprietaire_id: "b", rattache_a: null, tantiemes: { GEN: 760, BATA: 895 } },
];

describe("postesEligiblesEcoPtz", () => {
  it("retient les lignes « Retenu » : HT après remise + TVA (avant remise), sans imprévus", () => {
    const postes = postesEligiblesEcoPtz(plan(), cles);
    expect(postes.map((p) => p.lotNumero)).toEqual([2, 3]);
    // 100 000 × 0,9 + 5 500 = 95 500
    expect(postes[0].montantTtc).toBeCloseTo(95500, 6);
    expect(postes[0].parCle).toEqual({ GEN: 95500 });
    expect(postes[0].entreprisePf).toBe("DECOPEINT");
    // 30 000 + 1 650, sur la clé du bâtiment A
    expect(postes[1].parCle).toEqual({ BATA: 31650 });
  });

  it("applique la clé de référence aux lignes sans clé et le signale", () => {
    const p = plan();
    p.lots[1].lignes[0].cleRepartition = "INCONNUE";
    const postes = postesEligiblesEcoPtz(p, cles);
    expect(postes[1].parCle).toEqual({ GEN: 31650 });
    expect(postes[1].lignesSansCle).toBe(1);
  });

  it("force la clé unique de la copropriété", () => {
    const postes = postesEligiblesEcoPtz(plan(), [{ code: "MUN", is_default: true }]);
    expect(postes[1].parCle).toEqual({ MUN: 31650 });
  });
});

describe("logementsEcoPtz", () => {
  const postes = postesEligiblesEcoPtz(plan(), cles);

  it("additionne les annexes rattachées, jamais les annexes libres, et ne arrondit pas", () => {
    const [log] = logementsEcoPtz({ postes, lots, demandes: [{ coproprietaireId: "a", nom: "BINDER Etienne", lotIds: [] }] });
    expect(log.lotNum).toBe("12");
    expect(log.annexes.map((a) => a.num)).toEqual(["45"]);
    expect(log.tantiemes).toEqual({ GEN: 210, BATA: 105 });
    // totaux : GEN = 1000, BATA = 1000
    expect(log.lignes[0].quotePart).toBeCloseTo((95500 * 210) / 1000, 9);
    expect(log.lignes[1].quotePart).toBeCloseTo((31650 * 105) / 1000, 9);
    expect(log.lignes[1]).toMatchObject({ cle: "BATA", tantiemes: 105, totalCle: 1000 });
    expect(log.total).toBeCloseTo(20055 + 3323.25, 9);
  });

  it("un logement par lot d'habitation coché ; annexes seules cochées = tous les logements", () => {
    const lots2: LotEcoPtz[] = [
      ...lots,
      { id: "h3", num: "14", usage: "habitation", coproprietaire_id: "a", rattache_a: null, tantiemes: { GEN: 0 } },
    ];
    const coche = logementsEcoPtz({ postes, lots: lots2, demandes: [{ coproprietaireId: "a", nom: "A", lotIds: ["h3"] }] });
    expect(coche.map((l) => l.lotNum)).toEqual(["14"]);
    const annexe = logementsEcoPtz({ postes, lots: lots2, demandes: [{ coproprietaireId: "a", nom: "A", lotIds: ["p1"] }] });
    expect(annexe.map((l) => l.lotNum)).toEqual(["12", "14"]);
  });

  it("calcule l'exemple du skill au centime près, sans arrondi intermédiaire", () => {
    const p = makeDefaultPlanDefinitif();
    p.lots = [
      { numero: 1, titre: "Façade", remisePct: 0, lignes: [{ designation: "x", retenu: true, montantHt: 320000, tvaPct: 0 }] },
      { numero: 2, titre: "Combles", remisePct: 0, lignes: [{ designation: "x", retenu: true, montantHt: 95000, tvaPct: 0 }] },
      { numero: 3, titre: "VMC", remisePct: 0, lignes: [{ designation: "x", retenu: true, montantHt: 52000, tvaPct: 0 }] },
    ];
    const mun = [{ code: "MUN", is_default: true }];
    const lotsAcacias: LotEcoPtz[] = [
      { id: "x", num: "1", usage: "habitation", coproprietaire_id: "x", rattache_a: null, tantiemes: { MUN: 200 } },
      { id: "y", num: "2", usage: "habitation", coproprietaire_id: "y", rattache_a: null, tantiemes: { MUN: 7000 } },
    ];
    const [log] = logementsEcoPtz({
      postes: postesEligiblesEcoPtz(p, mun),
      lots: lotsAcacias,
      demandes: [{ coproprietaireId: "x", nom: "X", lotIds: [] }],
    });
    expect(fmtMontantCerfa(log.total)).toBe("12 972,22");
  });
});

describe("utilitaires", () => {
  it("formate comme le CERFA (espace simple, deux décimales)", () => {
    expect(fmtMontantCerfa(36100.484)).toBe("36 100,48");
    expect(fmtMontantCerfa(5)).toBe("5,00");
    expect(fmtMontantCerfa(1234567.006)).toBe("1 234 567,01");
    expect(fmtMontantCerfa(-12.5)).toBe("-12,50");
  });

  it("repère les SCI et les sociétés", () => {
    expect(personneMorale("SCI LEBLANC")).toBe("sci");
    expect(personneMorale("S.C.I. du Parc")).toBe("sci");
    expect(personneMorale("Société Immobilière de l'Est")).toBe("societe");
    expect(personneMorale("SDC IMMIUM")).toBe("societe");
    expect(personneMorale("SCHIMPF Marie")).toBeNull();
    expect(personneMorale("SALAS Ana")).toBeNull();
  });

  it("découpe l'adresse en numéro et voie", () => {
    expect(decouperAdresse("4 route d'Oberhausbergen")).toEqual({ num: "4", voie: "route d'Oberhausbergen" });
    expect(decouperAdresse("9-11 rue des Alpes")).toEqual({ num: "9-11", voie: "rue des Alpes" });
    expect(decouperAdresse("12 bis, avenue de Colmar")).toEqual({ num: "12 bis", voie: "avenue de Colmar" });
    expect(decouperAdresse("Place Kléber")).toEqual({ num: "", voie: "Place Kléber" });
  });
});
