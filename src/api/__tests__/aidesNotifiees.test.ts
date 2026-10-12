import { describe, expect, it } from "vitest";
import { etatAidesPortail, type PlanDefinitifPartage, type PortalLot } from "../portail";
import { montantsPont, montantsPontAJour } from "../planDefinitif";
import { computePlanDefinitif, type PlanDefinitifData } from "@/lib/finance";
import { makeViolettes } from "@/lib/finance/__tests__/fixtureViolettes";

// Aides notifiées (demande d'Amir du 12/10/2026) : le montant notifié remplace
// l'estimation ; tant que toutes les aides ne le sont pas, le portail annonce
// un reste à charge approximatif, et un partage aux montants d'avant la
// notification est signalé périmé.
const notifier = (data: PlanDefinitifData, ids: string[] | "toutes") => {
  const r = computePlanDefinitif(data);
  data.aides.forEach((a, i) => {
    if ((ids === "toutes" || ids.includes(a.id)) && r.aides[i].montant != null) a.montantNotifie = Math.round(r.aides[i].montant!);
  });
  return data;
};

const pf = (id: string, data: PlanDefinitifData, batimentIds: string[] | null = null): PlanDefinitifPartage => ({
  id,
  nom: id,
  data,
  resultat: computePlanDefinitif(data),
  batimentIds,
});

const lot = (batimentId: string | null): PortalLot => ({
  id: `l-${batimentId}`,
  num: "1",
  usage: "habitation",
  batiment: null,
  batimentId,
  rattacheA: null,
  tantiemes: { MUN: 100 },
});

describe("portail - reste à charge approximatif", () => {
  it("tant qu'une aide n'est pas notifiée", () => {
    expect(etatAidesPortail([pf("a", makeViolettes())], [lot(null)])).toEqual({ notifiees: 0, attendues: 9, approximatif: true });
    const partiel = etatAidesPortail([pf("a", notifier(makeViolettes(), ["mpr-travaux", "mpr-amo"]))], [lot(null)]);
    expect(partiel).toEqual({ notifiees: 2, attendues: 9, approximatif: true });
  });

  it("plus du tout quand toutes les aides sont notifiées", () => {
    expect(etatAidesPortail([pf("a", notifier(makeViolettes(), "toutes"))], [lot(null)]).approximatif).toBe(false);
  });

  it("sans PF publié, le scénario est une estimation", () => {
    expect(etatAidesPortail([], [lot(null)]).approximatif).toBe(true);
  });

  it("PF par bâtiment : seuls comptent ceux qui couvrent les lots du copropriétaire", () => {
    const pfs = [pf("A", notifier(makeViolettes(), "toutes"), ["A"]), pf("B", makeViolettes(), ["B"])];
    expect(etatAidesPortail(pfs, [lot("A")]).approximatif).toBe(false);
    expect(etatAidesPortail(pfs, [lot("B")]).approximatif).toBe(true);
    expect(etatAidesPortail(pfs, [lot("A"), lot("B")])).toMatchObject({ notifiees: 9, attendues: 18, approximatif: true });
  });
});

describe("partage au portail - montants à jour", () => {
  const avant = [pf("a", makeViolettes())];

  it("reconnaît un partage aux montants des PF", () => {
    expect(montantsPontAJour({ params: { ...montantsPont(avant), cle: "MUN" } }, avant)).toBe(true);
  });

  it("signale un partage antérieur à la notification d'une aide", () => {
    const d = makeViolettes();
    d.aides.find((a) => a.id === "mpr-travaux")!.montantNotifie = 243100; // estimation : 243 000
    expect(montantsPontAJour({ params: montantsPont(avant) }, [pf("a", d)])).toBe(false);
  });

  it("compare aussi les partages publiés avant le 12/10/2026 (sans le montant des aides au centime)", () => {
    const { aidesPubliquesPf: _ignore, ...ancien } = montantsPont(avant);
    expect(montantsPontAJour({ params: ancien }, avant)).toBe(true);
    const d = makeViolettes();
    d.aides.find((a) => a.id === "mpr-travaux")!.montantNotifie = 250000;
    expect(montantsPontAJour({ params: ancien }, [pf("a", d)])).toBe(false);
  });
});
