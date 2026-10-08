// Vue individuelle par copropriétaire : une base, trois exports concordants
// (feedback Théa 03/09/2026). On vérifie que l'assemblage reprend les montants
// de la répartition du PF au centime, que la ventilation par bâtiment retombe
// sur le total, et que « qui me manque quoi » suit les règles annoncées.
import { describe, expect, it } from "vitest";
import { assemblerDossiers, type ChoixRow } from "@/api/dossiersCopros";
import type { DonneesCopro, LotFull } from "@/api/donnees";
import type { Reponse } from "@/api/enquete";
import type { PlanDefinitif } from "@/api/planDefinitif";
import { computePlanDefinitif, readPlanDefinitif, repartirPfDepuisLots, round2 } from "@/lib/finance";
import { makeViolettes } from "@/lib/finance/__tests__/fixtureViolettes";
const fixtureViolettes = makeViolettes();

const COPRO = "c0000000-0000-0000-0000-000000000001";
const CP = (i: number) => `a000000${i}-0000-0000-0000-000000000000`;

function lot(num: string, cp: number, bat: string, mun: number, usage = "habitation"): LotFull {
  return {
    id: `lot-${num}`,
    num,
    copro_id: COPRO,
    usage: usage as LotFull["usage"],
    batiment_id: null,
    coproprietaire_id: CP(cp),
    rattache_a: null,
    created_at: "",
    batiment: { code: bat },
    coproprietaire: { nom: `Copro ${cp}`, email: null, telephone: null },
    tantiemes: { MUN: mun },
  } as unknown as LotFull;
}

const donnees: DonneesCopro = {
  batiments: [
    { id: "b1", copro_id: COPRO, code: "01", adresse: null, position: 0, declare_creation: true },
    { id: "b2", copro_id: COPRO, code: "02", adresse: null, position: 1, declare_creation: true },
  ] as DonneesCopro["batiments"],
  coproprietaires: [1, 2, 3].map((i) => ({
    id: CP(i),
    copro_id: COPRO,
    nom: `Copro ${i}`,
    email: null,
    telephone: null,
    adresse: null,
    type: null,
    user_id: null,
    created_at: "",
  })) as DonneesCopro["coproprietaires"],
  lots: [lot("1", 1, "01", 400), lot("2", 2, "01", 350), lot("3", 3, "02", 250)],
  cles: [{ id: "k", copro_id: COPRO, code: "MUN", label: "Millièmes", is_default: true }] as DonneesCopro["cles"],
};

const planValide = {
  id: "pf1",
  copro_id: COPRO,
  nom: "PF test",
  statut: "valide",
  data: fixtureViolettes as unknown,
  resultat: null,
  updated_at: "2026-09-01T10:00:00Z",
  created_at: "2026-09-01T10:00:00Z",
} as unknown as PlanDefinitif;

const reponse = (cp: number, profil: string | null, extra: Partial<Reponse> = {}): Reponse =>
  ({
    id: `r${cp}`,
    enquete_id: "e1",
    coproprietaire_id: CP(cp),
    nb_personnes: 2,
    statut_occupation: "occupant",
    rfr: 20000,
    rfr_n2: null,
    reponses: { copro: {}, lots: {}, complet: true },
    profil_mpr: profil,
    profil_statut: "declaratif",
    profil_verifie_le: null,
    profil_verifie_par: null,
    updated_at: "2026-09-02T10:00:00Z",
    coproprietaire: { nom: `Copro ${cp}` },
    ...extra,
  }) as Reponse;

const base = {
  donnees,
  reponses: [] as Reponse[],
  scenario: null,
  plansIndiv: [],
  choix: [] as ChoixRow[],
  planValide,
  adhesions: [],
  bulletins: [],
  pieces: [],
  bareme: null,
};

describe("assemblerDossiers", () => {
  it("reprend les quotes-parts du PF définitif au centime et somme par bâtiment = total", () => {
    const { dossiers } = assemblerDossiers(base);
    const data = readPlanDefinitif(fixtureViolettes as unknown);
    const rep = repartirPfDepuisLots(data, computePlanDefinitif(data), donnees.lots, donnees.cles);
    expect(rep.manquants).toHaveLength(0);
    for (const d of dossiers) {
      const p = rep.plans.find((x) => x.coproprietaireId === d.id)!;
      expect(d.plan?.quotePart).toBe(round2(p.quotePartAvant));
      expect(d.plan?.primeCee).toBe(round2(p.primeCee));
      expect(round2((d.plan?.aidesColl ?? 0) + (d.plan?.primeCee ?? 0))).toBe(round2(p.aidesEtFonds));
    }
    const total = round2(dossiers.reduce((s, d) => s + (d.plan?.quotePart ?? 0), 0));
    const bat01 = round2(dossiers.filter((d) => d.batiments.includes("01")).reduce((s, d) => s + (d.plan?.quotePart ?? 0), 0));
    const bat02 = round2(dossiers.filter((d) => d.batiments.includes("02")).reduce((s, d) => s + (d.plan?.quotePart ?? 0), 0));
    expect(round2(bat01 + bat02)).toBe(total);
    // 1000 millièmes répartis : la somme des quotes-parts = total de l'opération TTC
    expect(Math.abs(total - computePlanDefinitif(data).totalOperationTtc)).toBeLessThan(0.05);
  });

  it("occupation : l'enquête d'abord, sinon l'adresse postale (règle d'Amir du 04/10/2026)", () => {
    const adresses = ["4 rue Léo Lagrange, 10600 La Chapelle Saint-Luc", "2 rue de Champagne, 10120 Saint-Germain", "2 rue Léo Lagrange"];
    const d2 = {
      ...donnees,
      coproprietaires: donnees.coproprietaires.map((cp, i) => ({ ...cp, adresse: adresses[i] })),
    };
    const lieux = [{ adresse: "2-4 rue Léo LAGRANGE", cp: "10000" }];
    const { dossiers } = assemblerDossiers({
      ...base,
      donnees: d2,
      reponses: [reponse(3, "Rose", { statut_occupation: "bailleur" })],
      lieux,
    });
    expect(dossiers.map((d) => [d.enquete.occupation, d.enquete.occupationSource])).toEqual([
      ["Occupant", "adresse"],
      ["Bailleur", "adresse"],
      // la réponse de l'enquête l'emporte sur l'adresse
      ["Bailleur", "enquete"],
    ]);
    // sans adresses de la copropriété : rien n'est déduit
    const sans = assemblerDossiers({ ...base, donnees: d2 }).dossiers;
    expect(sans.map((d) => d.enquete.occupation)).toEqual([null, null, null]);
  });

  it("sans profil : prime « à déterminer », aucune prime déduite, dossier non commencé", () => {
    const { dossiers } = assemblerDossiers(base);
    const d = dossiers[0];
    expect(d.enquete.profil).toBeNull();
    expect(d.plan?.mprSource).toBe("indetermine");
    expect(d.plan?.mprIndiv).toBe(0);
    expect(d.plan?.resteAvantTravaux).toBe(round2((d.plan?.quotePart ?? 0) - (d.plan?.aidesColl ?? 0)));
    expect(d.etat.profil).toBe("manquant");
    expect(d.etat.statut).toBe("non_commence");
    expect(d.etat.manquants).toContain("profil de ressources (enquête sociale)");
    // plan non partagé : pas de choix de financement attendu, bulletin / SEPA sans objet
    expect(d.etat.financement).toBe("na");
    expect(d.etat.bulletin).toBe("na");
  });

  it("profil déclaratif puis vérifié : statut et date suivis", () => {
    const { dossiers } = assemblerDossiers({
      ...base,
      reponses: [
        reponse(1, "Jaune"),
        reponse(2, "Bleu", { profil_statut: "verifie", profil_verifie_le: "2026-09-03T09:00:00Z" }),
      ],
    });
    const d1 = dossiers.find((d) => d.id === CP(1))!;
    const d2 = dossiers.find((d) => d.id === CP(2))!;
    expect(d1.enquete.profilStatut).toBe("declaratif");
    expect(d2.enquete.profilStatut).toBe("verifie");
    expect(d2.enquete.profilVerifieLe).toBe("2026-09-03T09:00:00Z");
    expect(d1.etat.profil).toBe("ok");
    expect(d1.etat.statut).toBe("incomplet"); // pièces manquantes
  });

  it("prêt collectif choisi : bulletin et SEPA deviennent exigibles", () => {
    const scenario = {
      id: "s1",
      copro_id: COPRO,
      name: "PF définitif - test",
      statut: "partage",
      updated_at: "2026-09-02T00:00:00Z",
      params: {},
      // scénario pont issu du PF validé : le plan est bien « publié »
      plan_definitif_id: "pf1",
    } as unknown as NonNullable<typeof base.scenario>;
    const choix = [
      {
        id: "ch1",
        scenario_id: "s1",
        coproprietaire_id: CP(1),
        type: "collectif",
        duree_annees: 15,
        lot_ids: [],
        transmitted_at: "2026-09-02T00:00:00Z",
        saisi_par: "copro",
        coproprietaires: { nom: "Copro 1" },
      },
    ] as unknown as ChoixRow[];
    const { dossiers } = assemblerDossiers({ ...base, scenario, choix });
    const d1 = dossiers.find((d) => d.id === CP(1))!;
    const d2 = dossiers.find((d) => d.id === CP(2))!;
    expect(d1.etat.financement).toBe("ok");
    expect(d1.etat.bulletin).toBe("manquant");
    expect(d1.etat.sepa).toBe("manquant");
    expect(d1.etat.manquants).toContain("bulletin d'adhésion");
    expect(d2.etat.financement).toBe("manquant");
    expect(d2.etat.bulletin).toBe("na");
    expect(d1.plan?.partage).toBe(true);
    expect(d1.plan?.publieLe).toBe("2026-09-02T00:00:00Z");

    // Souscription en ligne chez la banque : le bulletin et le mandat SEPA ne
    // passent plus par Strat Eco, ils ne peuvent donc plus manquer (22/09/2026).
    const enLigne = assemblerDossiers({ ...base, scenario, choix, souscriptionEnLigne: true });
    const b1 = enLigne.dossiers.find((d) => d.id === CP(1))!;
    expect(b1.etat.bulletin).toBe("na");
    expect(b1.etat.sepa).toBe("na");
    expect(b1.etat.manquants).not.toContain("bulletin d'adhésion");
    expect(b1.etat.manquants).not.toContain("mandat SEPA");

    // Dossier du portail (0148) : le mandat SEPA est signé avec le bulletin, par
    // le seul principal - « en cours » pendant la préparation, puis fourni dès
    // sa signature, même si les cosignataires n'ont pas encore signé le bulletin.
    const bulletin = (patch: Record<string, unknown>) =>
      ({
        id: "b1",
        coproprietaire_id: CP(1),
        copro_id: COPRO,
        statut: "en_signature",
        mandat_path: "b1/mandat-sepa.pdf",
        mandat_signe_le: null,
        signataires: [],
        ...patch,
      }) as unknown as (typeof base.bulletins)[number];
    const adhesionBrouillon = { id: "a1", coproprietaire_id: CP(1), copro_id: COPRO, statut: "brouillon", sepa_path: null };
    const prepa = assemblerDossiers({
      ...base,
      scenario,
      choix,
      adhesions: [adhesionBrouillon] as unknown as typeof base.adhesions,
      bulletins: [bulletin({ statut: "brouillon" })],
    });
    const p1 = prepa.dossiers.find((d) => d.id === CP(1))!;
    expect(p1.etat.bulletin).toBe("en_cours");
    expect(p1.etat.sepa).toBe("en_cours");
    expect(p1.etat.manquants).toContain("mandat SEPA (en cours)");
    const signe = assemblerDossiers({
      ...base,
      scenario,
      choix,
      bulletins: [bulletin({ mandat_signe_le: "2026-10-08T10:00:00Z" })],
    });
    const s1 = signe.dossiers.find((d) => d.id === CP(1))!;
    expect(s1.etat.sepa).toBe("ok");
    expect(s1.etat.bulletin).toBe("en_cours");
  });

  it("un PF revalidé après le partage n'est pas considéré comme publié", () => {
    const scenario = {
      id: "s1",
      copro_id: COPRO,
      name: "PF définitif - test",
      statut: "partage",
      updated_at: "2026-09-02T00:00:00Z",
      params: {},
      plan_definitif_id: "ancien-pf",
    } as unknown as NonNullable<typeof base.scenario>;
    const { dossiers } = assemblerDossiers({ ...base, scenario });
    expect(dossiers[0].plan?.source).toBe("pf");
    expect(dossiers[0].plan?.partage).toBe(false);
    expect(dossiers[0].plan?.publieLe).toBeNull();
  });
});
