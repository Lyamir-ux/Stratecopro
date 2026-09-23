// Fiche État ANAH (23/09/2026) : les chiffres de la fiche sont calculés depuis
// la base - lots, tantièmes, occupation (enquête, sinon adresse postale),
// étiquettes par bâtiment. Cas de référence : RUE DE LA ZORN (30 lots dont 29
// logements, 10 000 tantièmes, 96,67 %), où le modèle rempli à la main avait
// laissé le total des lots vide.
import { describe, expect, it } from "vitest";
import {
  agregerEtiquettes,
  analyserAdresse,
  calculerInfosGenerales,
  calculerOccupation,
  champsManquants,
  fmtDecimal,
  fmtEntier,
  fmtPct,
  lignesEtiquettes,
  instantaneOccupation,
  lireNombre,
  lotsNonPrincipaux,
  occupationPresumee,
  resoudre,
  tauxImpayes8,
  valeursBase,
  valeursBrutes,
  valeursParDefaut,
  type CoproFiche,
  type DonneesFiche,
  type LotFiche,
  type ReponseFiche,
} from "@/lib/ficheEtat";

const COPRO: CoproFiche = {
  name: "RUE DE LA ZORN",
  adresse: "12-14-16 Rue de la Zorn",
  code_postal: "67300",
  city: "SCHILTIGHEIM",
  syndic_name: "LAFORÊT STRASBOURG",
  gestionnaire_nom: "BAYSSELIER Clément",
  gestionnaire_email: "syndic.strasbourg@laforet.com",
  energy_before: "E",
  gain_pct: 52,
};

function lot(id: string, cp: string | null, usage = "habitation", t = 0, bat = "01", rattache: string | null = null): LotFiche {
  return { id, num: id, usage, coproprietaire_id: cp, rattache_a: rattache, batiment: { code: bat }, tantiemes: { CCG: t } };
}

/** 29 logements de 343 tantièmes + 1 local de 53 = 10 000 (arrondi du modèle ZORN : 99,50 % en habitation). */
function zorn(): DonneesFiche {
  const lots: LotFiche[] = [];
  for (let i = 1; i <= 29; i++) lots.push(lot(`L${i}`, `C${i}`, "habitation", i === 29 ? 9947 - 28 * 343 : 343));
  lots.push(lot("L30", "C30", "commerces", 53));
  return {
    batiments: [{ code: "01", adresse: null }],
    lots,
    coproprietaires: lots.map((l) => ({ id: l.coproprietaire_id!, nom: `Copro ${l.coproprietaire_id}`, adresse: null })),
    cles: [{ code: "CCG", is_default: true }],
  };
}

const rep = (cp: string, extra: Partial<ReponseFiche> = {}): ReponseFiche => ({
  coproprietaire_id: cp,
  statut_occupation: null,
  profil_mpr: null,
  reponses: null,
  ...extra,
});

describe("formatage", () => {
  it("espaces simples, virgule décimale", () => {
    expect(fmtEntier(10000)).toBe("10 000");
    expect(fmtDecimal(12345.5)).toBe("12 345,5");
    expect(fmtPct(96.6666)).toBe("96,67 %");
    expect(lireNombre("12 345,50 €")).toBe(12345.5);
    expect(lireNombre("8 %")).toBe(8);
    expect(lireNombre("abc")).toBeNull();
  });
});

describe("informations générales", () => {
  it("cas ZORN : 30 lots, 29 logements, 96,67 % et 99,47 % des tantièmes", () => {
    const g = calculerInfosGenerales(zorn());
    expect(g.nbBatiments).toBe(1);
    expect(g.nbLots).toBe(30);
    expect(g.tantiemesCcg).toBe(10000);
    expect(g.nbLotsHab).toBe(29);
    expect(fmtPct(g.pctLotsHab)).toBe("96,67 %");
    expect(g.tantiemesHab).toBe(9947);
    expect(fmtPct(g.pctTantiemesHab)).toBe("99,47 %");
  });

  it("résidence secondaire et logement vacant sortent de l'habitation principale", () => {
    const d = zorn();
    const exclus = lotsNonPrincipaux(d, [
      rep("C1", { reponses: { lots: { L1: { "type-residence": "Résidence secondaire" } } } }),
      rep("C2", { reponses: { lots: { L2: { "type-occupation": "Logement vacant" } } } }),
    ]);
    expect(exclus).toEqual(["L1", "L2"]);
    const g = calculerInfosGenerales(d, exclus);
    expect(g.nbLotsHab).toBe(27);
    expect(g.tantiemesHab).toBe(9947 - 2 * 343);
  });

  it("les annexes rattachées comptent dans les tantièmes d'habitation", () => {
    const d: DonneesFiche = {
      batiments: [{ code: "01", adresse: null }],
      lots: [lot("A", "C1", "habitation", 600), lot("CAVE", "C1", "caves", 50, "01", "A"), lot("G", "C2", "garage", 350)],
      coproprietaires: [
        { id: "C1", nom: "Un", adresse: null },
        { id: "C2", nom: "Deux", adresse: null },
      ],
      cles: [{ code: "CCG", is_default: true }],
    };
    const g = calculerInfosGenerales(d);
    expect(g.nbLotsHab).toBe(1);
    expect(g.tantiemesHab).toBe(650);
    expect(g.pctTantiemesHab).toBeCloseTo(65, 5);
  });
});

describe("adresses", () => {
  it("analyse numéros en liste, en plage, abréviations et code postal", () => {
    expect(analyserAdresse("12-14-16 Rue de la Zorn")).toMatchObject({ voie: ["rue", "zorn"], numeros: [12, 14, 16] });
    expect(analyserAdresse("12 à 16 r. de la Zorn 67300 Schiltigheim")).toMatchObject({ numeros: [12, 14, 16], cp: "67300" });
    expect(analyserAdresse("3 bis av. Jean Jaurès")?.voie).toEqual(["avenue", "jean", "jaures"]);
  });

  const lieux = [{ adresse: "12-14-16 Rue de la Zorn", cp: "67300" }];
  it("même voie et même numéro : occupant", () => {
    expect(occupationPresumee("14 rue de la Zorn 67300 SCHILTIGHEIM", lieux)).toBe("occupant");
    expect(occupationPresumee("Appt 5, 16 R. DE LA ZORN", lieux)).toBe("occupant");
  });
  it("autre numéro, autre code postal ou autre voie : bailleur", () => {
    expect(occupationPresumee("18 rue de la Zorn 67300 Schiltigheim", lieux)).toBe("bailleur");
    expect(occupationPresumee("14 rue de la Zorn 67000 Strasbourg", lieux)).toBe("bailleur");
    expect(occupationPresumee("5 place Kléber 67000 Strasbourg", lieux)).toBe("bailleur");
  });
  it("adresse absente : inconnu", () => {
    expect(occupationPresumee(null, lieux)).toBeNull();
    expect(occupationPresumee("  ", lieux)).toBeNull();
  });
});

describe("occupation", () => {
  function petite(): DonneesFiche {
    return {
      batiments: [{ code: "01", adresse: null }],
      lots: [
        lot("L1", "C1", "habitation", 300),
        lot("L1c", "C1", "caves", 20, "01", "L1"),
        lot("L2", "C2", "habitation", 250),
        lot("L3", "C3", "habitation", 200),
        lot("L4", "C4", "habitation", 150),
        lot("L5", "C4", "habitation", 50),
        lot("L6", "C5", "habitation", 30),
        lot("COM", "C6", "commerces", 0),
      ],
      coproprietaires: [
        { id: "C1", nom: "Albert", adresse: "14 rue de la Zorn 67300 Schiltigheim" },
        { id: "C2", nom: "Berthe", adresse: "2 rue du Dôme 67000 Strasbourg" },
        { id: "C3", nom: "Claude", adresse: null },
        { id: "C4", nom: "Denise", adresse: null },
        { id: "C5", nom: "Émile", adresse: null },
        { id: "C6", nom: "Commerce SARL", adresse: null },
      ],
      cles: [{ code: "CCG", is_default: true }],
    };
  }

  it("enquête par lot, colonne d'occupation, adresse, inconnu - propriétaire mixte compté deux fois", () => {
    const o = calculerOccupation(COPRO, petite(), [
      rep("C3", { statut_occupation: "occupant", profil_mpr: "Bleu" }),
      rep("C4", {
        profil_mpr: "Jaune",
        reponses: { lots: { L4: { "type-occupation": "Propriétaire occupant" }, L5: { "type-occupation": "Propriétaire bailleur (logement loué)" } } },
      }),
    ]);
    // C1 adresse (PO, cave rattachée), C2 adresse (PB), C3 colonne (PO), C4 enquête (mixte), C5 inconnu ; C6 sans logement
    expect(o.nbProprietaires).toBe(5);
    expect(o.nbPO).toBe(3);
    expect(o.nbPB).toBe(2);
    expect(o.tantiemesPO).toBe(300 + 20 + 200 + 150);
    expect(o.tantiemesPB).toBe(250 + 50);
    expect(o.mixtes).toEqual(["Denise"]);
    expect(o.inconnus).toEqual(["Émile"]);
    expect(o.sources).toEqual({ enquete: 2, adresse: 2, inconnu: 1 });
    expect(o.nbTresModestes).toBe(1);
    expect(o.nbModestes).toBe(1);
    expect(o.parLot.L1c).toEqual({ statut: "PO", source: "adresse" });
  });

  it("la réponse de l'enquête prime sur l'adresse ; logement vacant côté bailleurs", () => {
    const o = calculerOccupation(COPRO, petite(), [
      rep("C1", { reponses: { lots: { L1: { "type-occupation": "Logement vacant" } } } }),
    ]);
    const albert = o.detail.find((x) => x.nom === "Albert")!;
    expect(albert.statut).toBe("PB");
    expect(albert.source).toBe("enquete");
    expect(albert.tantiemesPB).toBe(320);
  });

  it("l'instantané du rapport porte les chiffres et les logements exclus", () => {
    const o = calculerOccupation(COPRO, petite(), []);
    const i = instantaneOccupation(o, ["L6"], "Amir", "2026-09-23T08:00:00Z");
    expect(i).toMatchObject({ nbPO: o.nbPO, lotsNonPrincipaux: ["L6"], genereParNom: "Amir" });
    expect(i.signature).not.toBe(instantaneOccupation(o, [], null).signature);
    const base = valeursBase(COPRO, petite(), i, null);
    expect(base.nb_lots_hab).toBe("5");
    expect(base.nb_po).toBe(String(o.nbPO));
  });

  it("un profil modeste de bailleur ne compte pas", () => {
    const o = calculerOccupation(COPRO, petite(), [rep("C2", { profil_mpr: "Jaune" })]);
    expect(o.nbModestes).toBe(0);
  });
});

describe("étiquettes", () => {
  it("par défaut, étiquette et gain de la copro pour chaque bâtiment", () => {
    const d = zorn();
    const lignes = lignesEtiquettes(COPRO, d, null);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ etiquette: "E", gain35: true, logements: 29 });
    const agg = agregerEtiquettes(lignes);
    expect(agg.etiq_bat_E).toBe("1");
    expect(agg.etiq_log_E).toBe("29");
    expect(agg.etiq_bat_F).toBe("");
    expect(agg.nb_bat_gain35).toBe("1");
    expect(agg.nb_log_gain35).toBe("29");
  });

  it("saisie AMO par bâtiment, lots sans bâtiment à part", () => {
    const d: DonneesFiche = {
      batiments: [
        { code: "A", adresse: null },
        { code: "B", adresse: null },
      ],
      lots: [lot("1", "C1", "habitation", 1, "A"), lot("2", "C1", "habitation", 1, "A"), lot("3", "C2", "habitation", 1, "B"), { ...lot("4", "C3"), batiment: null }],
      coproprietaires: [],
      cles: [],
    };
    const lignes = lignesEtiquettes(COPRO, d, { A: { etiquette: "F", gain35: true }, B: { etiquette: "D", gain35: false } });
    const agg = agregerEtiquettes(lignes);
    expect(agg.etiq_bat_F).toBe("1");
    expect(agg.etiq_log_F).toBe("2");
    expect(agg.etiq_bat_D).toBe("1");
    expect(agg.etiq_log_D).toBe("1");
    // groupe « - » : logements comptés, pas un bâtiment (défaut copro : E)
    expect(agg.etiq_bat_E).toBe("");
    expect(agg.etiq_log_E).toBe("1");
    expect(agg.nb_bat_gain35).toBe("1");
    expect(agg.nb_log_gain35).toBe("3");
  });
});

describe("assemblage", () => {
  it("les champs base ne se saisissent pas, le taux d'impayés se calcule, les obligatoires sont listés", () => {
    const base = valeursBase(COPRO, zorn(), null, null);
    const defauts = valeursParDefaut(COPRO, [{ type: "demande_pret", data: { sdc_immatriculation: "AB1234567", imm_date_construction: "1965-01-01" } }]);
    expect(defauts.immatriculation).toBe("AB1234567");
    expect(defauts.periode_construction).toBe("1965");
    expect(defauts.syndic_nom).toBe("LAFORÊT STRASBOURG");
    const brutes = valeursBrutes(base, { nb_lots: "999", budget_n2: "100 000", impayes_n2: "9 000" }, defauts);
    expect(brutes.nb_lots).toBe("30");
    expect(brutes.taux_impayes_8).toBe("OUI");
    expect(tauxImpayes8({ budget_n2: "100000", impayes_n2: "5000" })).toBe(false);
    const r = resoudre(brutes);
    expect(r.budget_n2).toBe("100 000 €");
    expect(r.arrete_peril).toBe("Non");
    const manquants = champsManquants(brutes).map((c) => c.key);
    expect(manquants).toContain("pcs_nom");
    // occupation absente tant que le rapport d'enquête n'a pas été généré
    expect(manquants).toContain("nb_po");
    expect(manquants).not.toContain("chauffage_combustible");
    expect(champsManquants({ ...brutes, chaufferie_collective: "OUI" }).map((c) => c.key)).toContain("chauffage_combustible");
  });
});
