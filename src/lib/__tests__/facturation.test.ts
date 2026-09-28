import { describe, expect, it } from "vitest";
import {
  cocheSansMontant,
  enSommeil,
  graduations,
  honorairesCee,
  jalonsEnAttente,
  jalonsOrdonnes,
  joursDepuis,
  libelleAnciennete,
  pasAxeEuros,
  prochainJalon,
  repartitionP2,
  sommesDossier,
  sommesPortefeuille,
  trancheAnciennete,
  type DossierHonoraires,
} from "../facturation";

// LE TASSIGNY, extraction Notion du 28/09/2026
const tassigny: DossierHonoraires = {
  coproId: "tassigny",
  derniereFacture: "2026-09-16",
  source: "notion",
  jalons: jalonsOrdonnes([
    { jalon: "P1a", montant_ht: 6580, etat: "encaisse" },
    { jalon: "P1b", montant_ht: 9870, etat: "encaisse" },
    { jalon: "P1c", montant_ht: 9870, etat: "encaisse" },
    { jalon: "P2a", montant_ht: 7500, etat: "encaisse" },
    { jalon: "P2b", montant_ht: 4500, etat: "facture" },
    { jalon: "P2c", montant_ht: 3000, etat: "a_facturer" },
    { jalon: "FCEE1", montant_ht: 3201.92, etat: "facture" },
    { jalon: "FCEE2", montant_ht: 3201.92, etat: "a_facturer" },
  ]),
};

// Baldner : P2b et P2c cochés dans Notion sans montant au contrat
const baldner: DossierHonoraires = {
  coproId: "baldner",
  derniereFacture: "2026-09-16",
  source: "notion",
  jalons: jalonsOrdonnes([
    { jalon: "P1a", montant_ht: 2310, etat: "encaisse" },
    { jalon: "P2b", montant_ht: null, etat: "encaisse" },
    { jalon: "FCEE1", montant_ht: 2055.75, etat: "facture" },
  ]),
};

describe("facturation des jalons", () => {
  it("présente toujours les 8 jalons dans l'ordre du contrat", () => {
    expect(baldner.jalons.map((j) => j.code)).toEqual(["P1a", "P1b", "P1c", "P2a", "P2b", "P2c", "FCEE1", "FCEE2"]);
    expect(baldner.jalons[1]).toEqual({ code: "P1b", montant: null, etat: "a_facturer" });
  });

  it("répartit le contrat entre encaissé, en attente et reste à facturer", () => {
    const s = sommesDossier(tassigny);
    expect(s.contrat).toBeCloseTo(47723.84, 2);
    expect(s.encaisse).toBe(33820);
    expect(s.enAttente).toBeCloseTo(7701.92, 2);
    expect(s.resteAFacturer).toBeCloseTo(6201.92, 2);
    expect(s.encaisse + s.enAttente + s.resteAFacturer).toBeCloseTo(s.contrat, 6);
  });

  it("ne compte pas les jalons cochés sans montant", () => {
    const s = sommesDossier(baldner);
    expect(s.contrat).toBeCloseTo(4365.75, 2);
    expect(cocheSansMontant(baldner.jalons[4])).toBe(true);
    expect(cocheSansMontant(baldner.jalons[5])).toBe(false);
  });

  it("additionne le portefeuille", () => {
    const s = sommesPortefeuille([tassigny, baldner]);
    expect(s.enAttente).toBeCloseTo(7701.92 + 2055.75, 2);
  });

  it("repère les jalons en attente et le prochain à facturer", () => {
    expect(jalonsEnAttente(tassigny).map((j) => j.code)).toEqual(["P2b", "FCEE1"]);
    expect(prochainJalon(tassigny)?.code).toBe("P2c");
    expect(prochainJalon(baldner)).toBeNull();
  });

  it("mesure l'ancienneté en jours et la classe par tranche", () => {
    const auj = new Date(2026, 8, 28);
    expect(joursDepuis("2026-09-16", auj)).toBe(12);
    expect(joursDepuis(null, auj)).toBeNull();
    expect(trancheAnciennete(12).id).toBe("moins30");
    expect(trancheAnciennete(30).id).toBe("de30a90");
    expect(trancheAnciennete(164).id).toBe("de90a180");
    expect(trancheAnciennete(1028).id).toBe("plus180");
    expect(trancheAnciennete(null).id).toBe("plus180");
    expect(libelleAnciennete(12)).toBe("il y a 12 j");
    expect(libelleAnciennete(164)).toBe("il y a 5 mois");
  });

  it("dit en sommeil un dossier sans facture depuis plus d'un an avec du reste à facturer", () => {
    const auj = new Date(2026, 8, 28);
    expect(enSommeil(tassigny, auj)).toBe(false);
    expect(enSommeil({ ...tassigny, derniereFacture: "2024-12-06" }, auj)).toBe(true);
    expect(enSommeil({ ...tassigny, derniereFacture: null }, auj)).toBe(false);
  });

  it("répartit la P2 à 50 / 30 / 20 sans perdre de centime", () => {
    expect(repartitionP2(15000)).toEqual({ P2a: 7500, P2b: 4500, P2c: 3000 });
    // mêmes montants que la fonction SQL honoraires_revaloriser_p2 (testée le 28/09/2026)
    expect(repartitionP2(12345.67)).toEqual({ P2a: 6172.84, P2b: 3703.7, P2c: 2469.13 });
    const r = repartitionP2(1000.01);
    expect(r.P2a + r.P2b + r.P2c).toBeCloseTo(1000.01, 6);
  });

  it("calcule FCEE 1 et FCEE 2 à 250 € HT par GWh cumac", () => {
    expect(honorairesCee(20_061_000)).toBe(5015.25);
    expect(honorairesCee(1_314_000)).toBe(328.5);
    expect(honorairesCee(0)).toBe(0);
  });

  it("gradue les axes en euros", () => {
    expect(pasAxeEuros(422_779)).toBe(100_000);
    expect(graduations(422_779, 100_000)).toEqual({ max: 500_000, ticks: [0, 100_000, 200_000, 300_000, 400_000, 500_000] });
  });
});
