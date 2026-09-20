import { describe, expect, it } from "vitest";
import { aRevoir, correspond, dansLaVue, filtrerRevue, requalifiable, type LigneRevue } from "../fileRevue";
import { typeDevine } from "../depot";

const ligne = (p: Partial<LigneRevue>): LigneRevue => ({
  type: "pppt",
  statut: "depose",
  name: "PPPT.pdf",
  enseigne: "Citya Ruhl Segesca",
  copro: { nom: "Porte du Soleil", commune: "Strasbourg", gestionnaire_nom: null },
  ...p,
});

// Cas du feedback du 20/09/2026 : classeur déposé sous le nom « PPT_LaPorteDuSoleil_2026.xlsx »,
// deviné « tableau_ppt » à cause de l'extension, donc hors file d'analyse.
const tableau = ligne({ type: typeDevine("PPT_LaPorteDuSoleil_2026.xlsx"), name: "PPT_LaPorteDuSoleil_2026.xlsx" });

describe("file de revue", () => {
  it("ne met à l'analyse que le PPPT et le PPT adopté", () => {
    expect(aRevoir({ type: "pppt" })).toBe(true);
    expect(aRevoir({ type: "ppt_adopte" })).toBe(true);
    for (const t of ["tableau_ppt", "dpe_collectif", "pv_ag", "autre"] as const) expect(aRevoir({ type: t })).toBe(false);
  });

  it("range le tableau PPT dans « Autres documents » et non dans « À traiter »", () => {
    expect(tableau.type).toBe("tableau_ppt");
    expect(dansLaVue(tableau, "a_traiter")).toBe(false);
    expect(dansLaVue(tableau, "autres")).toBe(true);
    expect(dansLaVue(tableau, "tous")).toBe(true);
  });

  it("garde « À traiter » sur les seuls rapports en attente", () => {
    expect(dansLaVue(ligne({ statut: "depose" }), "a_traiter")).toBe(true);
    expect(dansLaVue(ligne({ statut: "a_relire" }), "a_traiter")).toBe(true);
    expect(dansLaVue(ligne({ statut: "valide" }), "a_traiter")).toBe(false);
    expect(dansLaVue(ligne({ statut: "valide" }), "valide")).toBe(true);
    // un document hors analyse ne pollue jamais les vues par statut
    expect(dansLaVue(ligne({ type: "pv_ag", statut: "valide" }), "valide")).toBe(false);
  });

  it("retrouve un document hors analyse par la recherche, quelle que soit la vue", () => {
    const tout = [ligne({ statut: "valide", name: "PPPT_Les_Tilleuls.pdf", copro: { nom: "Les Tilleuls", commune: "Colmar", gestionnaire_nom: null } }), tableau];
    // sans recherche, la vue par défaut ne montre rien de ces deux-là
    expect(filtrerRevue(tout, "a_traiter", "toutes", "")).toHaveLength(0);
    // avec recherche, le filtre de statut est ignoré
    expect(filtrerRevue(tout, "a_traiter", "toutes", "porte du soleil")).toEqual([tableau]);
    expect(filtrerRevue(tout, "valide", "toutes", "laportedusoleil")).toEqual([tableau]);
  });

  it("cherche sans accents ni casse sur la copro, le fichier, l'enseigne et le type", () => {
    expect(correspond(tableau, "PORTE")).toBe(true);
    expect(correspond(tableau, "strasbourg")).toBe(true);
    expect(correspond(tableau, "ruhl")).toBe(true);
    expect(correspond(tableau, "tableau ppt")).toBe(true);
    expect(correspond(tableau, "xlsx")).toBe(true);
    expect(correspond(tableau, "tilleuls")).toBe(false);
  });

  it("respecte le filtre d'enseigne, y compris en recherche", () => {
    const autre = ligne({ enseigne: "Citya Immo 4", copro: { nom: "Porte du Soleil bis", commune: null, gestionnaire_nom: null } });
    const tout = [tableau, autre];
    expect(filtrerRevue(tout, "tous", "Citya Immo 4", "")).toEqual([autre]);
    expect(filtrerRevue(tout, "tous", "Citya Immo 4", "porte")).toEqual([autre]);
  });

  it("n'ouvre la requalification qu'au dirigeant et avant validation", () => {
    expect(requalifiable({ statut: "depose" }, true)).toBe(true);
    expect(requalifiable({ statut: "rejete" }, true)).toBe(true);
    expect(requalifiable({ statut: "depose" }, false)).toBe(false);
    expect(requalifiable({ statut: "valide" }, true)).toBe(false);
    expect(requalifiable({ statut: "a_relire" }, true)).toBe(false);
  });

  it("ramène le document dans la file une fois requalifié en PPPT", () => {
    const corrige = { ...tableau, type: "pppt" as const };
    expect(dansLaVue(corrige, "a_traiter")).toBe(true);
    expect(dansLaVue(corrige, "autres")).toBe(false);
  });
});
