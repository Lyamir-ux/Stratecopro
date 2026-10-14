import { describe, expect, it } from "vitest";
import {
  CATALOGUE,
  SECTIONS,
  condTexts,
  defaultConfig,
  describeType,
  estVisible,
  normalizeConfig,
  resolveQuestions,
} from "../enqueteCatalogue";

describe("catalogue", () => {
  it("a des ids uniques", () => {
    const ids = CATALOGUE.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("chaque question appartient à une section déclarée", () => {
    const sections = new Set(SECTIONS.map((s) => s.id));
    for (const q of CATALOGUE) expect(sections.has(q.section)).toBe(true);
  });

  it("les QCM ont des options et les conditions référencent des questions existantes", () => {
    const ids = new Set(CATALOGUE.map((q) => q.id));
    for (const q of CATALOGUE) {
      if (q.type === "choix" || q.type === "multi") {
        expect(q.options ?? [], q.id).not.toHaveLength(0);
      }
      for (const c of q.cond ?? []) {
        expect(ids.has(c.qid), `${q.id} → ${c.qid}`).toBe(true);
        const ref = CATALOGUE.find((r) => r.id === c.qid)!;
        for (const v of c.vals) {
          // question de référence numérique (montant, nombre) : la valeur est un nombre en texte
          if (ref.type === "montant" || ref.type === "nombre") expect(v, `${q.id} : valeur « ${v} »`).toMatch(/^\d+$/);
          else expect(ref.options, `${q.id} : valeur « ${v} »`).toContain(v);
        }
      }
    }
  });

  it("les options qui ouvrent une précision existent dans les options", () => {
    for (const q of CATALOGUE) {
      for (const p of q.precision ?? []) expect(q.options, q.id).toContain(p);
    }
  });

  it("les questions essentielles (ménage + RFR) ouvrent l'enquête sociale, actives par défaut", () => {
    const ids = CATALOGUE.map((q) => q.id);
    const menage = CATALOGUE.find((q) => q.id === "nb-personnes-foyer")!;
    const rfr = CATALOGUE.find((q) => q.id === "rfr-foyer")!;
    expect(menage.defaultOn).toBe(true);
    expect(rfr.defaultOn).toBe(true);
    // juste après les coordonnées : premières questions de la section « situation »
    // (ménage, composition, personnes à charge, RFR N-1 - feedback Théa 03/09/2026)
    const firstSituation = ids.findIndex((id) => CATALOGUE.find((q) => q.id === id)!.section === "situation");
    expect(ids[firstSituation]).toBe("nb-personnes-foyer");
    expect(ids.slice(firstSituation, firstSituation + 4)).toContain("rfr-foyer");
    expect(ids.slice(firstSituation, firstSituation + 4)).toContain("composition-menage");
    expect(ids.slice(firstSituation, firstSituation + 4)).toContain("nb-personnes-charge");
  });

  it("libellés Anah des ressources et justification d'un RFR nul (feedback Théa 03/09/2026)", () => {
    const rfr = CATALOGUE.find((q) => q.id === "rfr-foyer")!;
    expect(rfr.tag).toBe("Revenu fiscal de référence (RFR) de l'avis d'imposition N-1");
    const n2 = CATALOGUE.find((q) => q.id === "rfr-n2")!;
    expect(n2.tag).toBe("Revenu fiscal de référence N-2");
    const motif = CATALOGUE.find((q) => q.id === "rfr-zero-motif")!;
    expect(motif.cond).toContainEqual({ qid: "rfr-foyer", vals: ["0"] });
    expect(motif.locked).toBe(true);
  });

  it("pas de question déclarative de profil (calcul automatique) ni de couleurs MPR dans les libellés", () => {
    expect(CATALOGUE.find((x) => x.id === "profil-mpr")).toBeUndefined();
    for (const q of CATALOGUE) {
      for (const o of q.options ?? []) expect(o, q.id).not.toMatch(/Bleu|Jaune|Violet|Rose/);
    }
  });
});

describe("normalizeConfig", () => {
  it("retombe sur les défauts pour l'ancien format (ids numériques du POC)", () => {
    const legacy = [{ id: 1, q: "Statut d'occupation du logement", type: "Choix", on: true, req: true }];
    expect(normalizeConfig(legacy)).toEqual(defaultConfig());
  });

  it("retombe sur les défauts pour null / vide", () => {
    expect(normalizeConfig(null)).toEqual(defaultConfig());
    expect(normalizeConfig([])).toEqual(defaultConfig());
  });

  it("conserve les choix stockés, force les questions socle et complète les manquantes", () => {
    const stored = [
      { id: "inconforts", on: false },
      { id: "usage-lot", on: false }, // socle : doit être forcée à true
      { id: "custom-1", on: true, custom: true, q: "Question libre ?" },
    ];
    const config = normalizeConfig(stored);
    const byId = new Map(config.map((it) => [it.id, it]));
    expect(byId.get("inconforts")?.on).toBe(false);
    expect(byId.get("usage-lot")?.on).toBe(true);
    expect(byId.get("custom-1")).toMatchObject({ custom: true, q: "Question libre ?" });
    // toutes les questions du catalogue sont présentes
    for (const q of CATALOGUE) expect(byId.has(q.id), q.id).toBe(true);
  });
});

describe("resolveQuestions", () => {
  it("suit l'ordre du catalogue et place les personnalisées à la fin", () => {
    const resolved = resolveQuestions(normalizeConfig([{ id: "custom-a", on: true, custom: true, q: "Libre" }]));
    expect(resolved.map((q) => q.id).slice(0, CATALOGUE.length)).toEqual(CATALOGUE.map((q) => q.id));
    expect(resolved.at(-1)).toMatchObject({ id: "custom-a", custom: true, q: "Libre" });
  });

  it("applique l'état on/off de la config", () => {
    const config = defaultConfig().map((it) => (it.id === "inconforts" ? { ...it, on: false } : it));
    const resolved = resolveQuestions(config);
    expect(resolved.find((q) => q.id === "inconforts")?.on).toBe(false);
  });
});

describe("affichage", () => {
  it("describeType résume type et options", () => {
    expect(describeType({ type: "nombre" })).toBe("Nombre");
    expect(describeType({ type: "choix", options: ["Oui", "Non"] })).toBe("Choix unique - Oui · Non");
  });

  it("condTexts rend les conditions lisibles", () => {
    const chaudiere = CATALOGUE.find((q) => q.id === "date-chaudiere")!;
    expect(condTexts(chaudiere)).toEqual([
      "Usage du lot = Habitation ou Commerce",
      "Type de chauffage = Individuel",
      "Énergie de chauffage = Gaz",
    ]);
  });
});

describe("émetteurs de chauffage (feedback 30/09/2026)", () => {
  it("propose plancher chauffant et plafond rayonnant", () => {
    const q = CATALOGUE.find((x) => x.id === "emetteurs-chauffage")!;
    expect(q.type).toBe("multi");
    expect(q.options).toEqual(expect.arrayContaining(["Plancher chauffant", "Plafond rayonnant"]));
    // posée avant les questions sur les radiateurs
    const ids = CATALOGUE.map((x) => x.id);
    expect(ids.indexOf("emetteurs-chauffage")).toBeLessThan(ids.indexOf("nb-radiateurs"));
  });

  it("les questions sur les radiateurs ne se posent qu'en présence de radiateurs, et restent posées sans réponse", () => {
    for (const id of ["nb-radiateurs", "regulation-radiateurs"]) {
      const c = CATALOGUE.find((x) => x.id === id)!.cond!.find((k) => k.qid === "emetteurs-chauffage")!;
      expect(c.defaut).toBe(true);
      expect(c.vals).not.toContain("Plancher chauffant");
      expect(c.vals).toContain("Radiateurs à eau chaude");
    }
  });
});

describe("bailleur : locataire à la place des occupants (feedback d'Amir du 11/10/2026)", () => {
  const BAILLEUR = "Propriétaire bailleur (logement loué)";
  const A_L_ANNEE = "Loué à l'année (résidence principale du locataire)";
  const resolved = resolveQuestions(defaultConfig());
  const visibles = (reponses: Record<string, string | number | string[]>) =>
    new Set(resolved.filter((q) => q.section !== "identite" && q.section !== "situation" && q.section !== "avis")
      .filter((q) => estVisible(q, (id) => reponses[id])).map((q) => q.id));
  const lot = { "usage-lot": "Habitation" };
  const CONFORT = CATALOGUE.filter((q) => q.section === "confort").map((q) => q.id);
  const LOCATAIRE = ["locataire-nom", "locataire-prenom", "locataire-nb-personnes", "locataire-telephone", "locataire-email"];

  it("un bailleur n'a ni questions de confort et d'occupation, ni nombre d'habitants", () => {
    const v = visibles({ ...lot, "type-occupation": BAILLEUR });
    expect(CONFORT.length).toBeGreaterThan(5);
    for (const id of [...CONFORT, "nb-habitants"]) expect(v.has(id), id).toBe(false);
  });

  it("un bailleur garde les autres questions (mode de location, technique, vente, démembrement…)", () => {
    const v = visibles({ ...lot, "type-occupation": BAILLEUR });
    for (const id of ["mode-location", "nb-fenetres", "type-chauffage", "pathologies", "projet-vente", "demembrement", "commodat"]) {
      expect(v.has(id), id).toBe(true);
    }
  });

  it("un propriétaire occupant, un logement vacant ou une question sans réponse gardent confort et habitants", () => {
    const cas: Record<string, string>[] = [{ "type-occupation": "Propriétaire occupant" }, { "type-occupation": "Logement vacant" }, {}];
    for (const occ of cas) {
      const v = visibles({ ...lot, ...occ });
      for (const id of ["nb-habitants", "difficultes-logement", "inconforts"]) expect(v.has(id), `${id} ${JSON.stringify(occ)}`).toBe(true);
      for (const id of LOCATAIRE) expect(v.has(id), id).toBe(false);
    }
  });

  it("logement loué à l'année : coordonnées du locataire (nom, prénom, personnes, téléphone, e-mail)", () => {
    const v = visibles({ ...lot, "type-occupation": BAILLEUR, "mode-location": A_L_ANNEE });
    for (const id of LOCATAIRE) expect(v.has(id), id).toBe(true);
    // posées dès que le bailleur a répondu, tant que le mode de location n'est pas choisi
    const avant = visibles({ ...lot, "type-occupation": BAILLEUR });
    for (const id of LOCATAIRE) expect(avant.has(id), id).toBe(true);
  });

  it("pas de locataire à contacter pour une location saisonnière ou un logement entre deux locations", () => {
    for (const mode of ["Location saisonnière ou meublé de tourisme", "Vacant (entre deux locations)"]) {
      const v = visibles({ ...lot, "type-occupation": BAILLEUR, "mode-location": mode });
      for (const id of LOCATAIRE) expect(v.has(id), `${id} ${mode}`).toBe(false);
    }
  });

  it("nom, prénom et nombre de personnes du locataire obligatoires ; téléphone et e-mail facultatifs", () => {
    const q = (id: string) => CATALOGUE.find((x) => x.id === id)!;
    for (const id of ["locataire-nom", "locataire-prenom", "locataire-nb-personnes"]) expect(q(id).facultatif, id).toBeUndefined();
    for (const id of ["locataire-telephone", "locataire-email"]) expect(q(id).facultatif, id).toBe(true);
    expect(q("locataire-telephone").type).toBe("tel");
    expect(q("locataire-email").type).toBe("email");
    for (const id of LOCATAIRE) expect(q(id).locked, id).toBe(true);
  });

  it("une enquête déjà configurée reçoit les nouvelles questions", () => {
    const ids = normalizeConfig([{ id: "inconforts", on: true }]).map((it) => it.id);
    for (const id of [...LOCATAIRE, "prenom"]) expect(ids, id).toContain(id);
  });
});

describe("nom et prénom de l'enquête (retour de A CHELGHAM du 11/10/2026)", () => {
  it("deux questions séparées, sans raison sociale", () => {
    const nom = CATALOGUE.find((q) => q.id === "nom")!;
    const prenom = CATALOGUE.find((q) => q.id === "prenom")!;
    expect(nom.q).toBe("Quel est votre nom de famille ?");
    expect(prenom.q).toBe("Quel est votre prénom ?");
    for (const q of [nom, prenom]) {
      expect(q.q + q.tag).not.toMatch(/raison sociale/i);
      expect(q.locked).toBe(true);
      expect(q.section).toBe("identite");
    }
    const ids = CATALOGUE.map((q) => q.id);
    expect(ids.indexOf("prenom")).toBe(ids.indexOf("nom") + 1);
  });
});

describe("associés de la SCI : personne morale (demande d'Amir du 14/10/2026)", () => {
  it("demande s'il y a une personne morale parmi les associés, sous une nouvelle clé", () => {
    const q = CATALOGUE.find((x) => x.id === "personne-morale-sci");
    expect(q?.q).toBe("Y a-t-il une personne morale parmi les associés de la SCI ?");
    expect(q?.locked).toBe(true);
    // l'ancienne clé portait la question inverse : ses réponses ne doivent plus être relues
    expect(CATALOGUE.some((x) => x.id === "personne-physique-sci")).toBe(false);
  });

  it("une enquête configurée avant le changement reçoit la nouvelle question et ignore l'ancienne", () => {
    const stockee = [...defaultConfig().filter((it) => it.id !== "personne-morale-sci"), { id: "personne-physique-sci", on: true }];
    const ids = normalizeConfig(stockee).map((it) => it.id);
    expect(ids).toContain("personne-morale-sci");
    expect(ids).not.toContain("personne-physique-sci");
  });
});

describe("questions personnalisées : texte libre ou Oui / Non (14/10/2026)", () => {
  const config = [
    ...defaultConfig(),
    { id: "custom-a", on: true, custom: true, q: "Question libre ?" },
    { id: "custom-b", on: true, custom: true, q: "Souhaitez-vous remplacer vos fenêtres ?", format: "oui-non" as const },
  ];
  const perso = (id: string) => resolveQuestions(config).find((x) => x.id === id)!;

  it("texte libre par défaut, Oui / Non en choix unique à la demande", () => {
    expect(perso("custom-a").type).toBe("texte");
    expect(perso("custom-a").options).toBeUndefined();
    expect(perso("custom-b").type).toBe("choix");
    expect(perso("custom-b").options).toEqual(["Oui", "Non"]);
  });

  it("le format est gardé par la normalisation de la config stockée", () => {
    const b = normalizeConfig(config).find((it) => it.id === "custom-b");
    expect(b?.format).toBe("oui-non");
  });
});
