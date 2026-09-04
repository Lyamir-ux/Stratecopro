import { describe, expect, it } from "vitest";
import {
  CATALOGUE,
  SECTIONS,
  condTexts,
  defaultConfig,
  describeType,
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
