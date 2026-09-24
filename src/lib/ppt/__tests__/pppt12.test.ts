// Tests d'acceptation de la requête « accepter le format pppt-verif/1.2 »
// (24/09/2026) sur les fichiers réels de La Porte du Soleil (Strasbourg,
// 450 logements) : la version 1.2 validée (20 lignes) et la 1.1 d'origine
// (29 lignes).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cloner, validerJson } from "../import";
import { controlesPlateforme } from "../controles";
import { exporterJson, exporterRemarques, revisionCourante } from "../export";
import { gainCompose, totauxTtcJson } from "../formules";
import { fmtPct, fmtPoints } from "../formats";
import { decider, decisionsDejaAppliquees, lignesAReprendre } from "../propositions";
import type { PpptVerifJson } from "../schema";

const lire = (nom: string): unknown => JSON.parse(readFileSync(`src/lib/ppt/__tests__/fixtures/${nom}`, "utf-8"));
const FICHIER_12 = lire("PPPT_VERIF_LaPorteDuSoleil_20260924_valide.json");
const FICHIER_11 = lire("PPPT_VERIF_LaPorteDuSoleil_20260924.json");
const AUJOURDHUI = new Date("2026-09-24T10:00:00");

const importer = (brut: unknown) => {
  const r = validerJson(brut);
  expect(r.erreurs).toEqual([]);
  return r.json as PpptVerifJson;
};
const J12 = importer(FICHIER_12);
const J11 = importer(FICHIER_11);
const remarques12 = controlesPlateforme(J12, {}, AUJOURDHUI);
const ligne = (j: PpptVerifJson, id: string) => j.travaux_normalises.find((t) => t.id === id)!;

describe("1. import du fichier 1.2", () => {
  it("20 lignes, 30 postes source dont T13 exclu, 13 propositions tranchées (P07 modifiée), dossier VALIDE", () => {
    expect(J12.schema_version).toBe("pppt-verif/1.2");
    expect(J12.travaux_normalises).toHaveLength(20);
    expect(J12.travaux_source).toHaveLength(30);
    expect(J12.travaux_source.filter((s) => s.retenu_dans_ppt === false).map((s) => s.id)).toEqual(["T13"]);
    expect(J12.propositions).toHaveLength(13);
    expect(J12.propositions.every((p) => p.statut_validation === "VALIDEE" || p.statut_validation === "MODIFIEE")).toBe(true);
    expect(J12.propositions.find((p) => p.code === "P07")?.statut_validation).toBe("MODIFIEE");
    expect(J12.synthese.statut_validation_global).toBe("VALIDE");
    expect(J12.revision?.numero).toBe(2);
  });

  it("les décisions déjà répercutées par le skill (P07 modifiée) n'imposent aucune reprise de ligne", () => {
    const deja = decisionsDejaAppliquees(J12, J12);
    expect(deja.size).toBe(13);
    expect(lignesAReprendre(J12, deja).size).toBe(0);
    expect(lignesAReprendre(J12).size).toBeGreaterThan(0); // sans la révision importée, P07 serait à reprendre
    const change = decider(J12, "P07", "VALIDEE", null, AUJOURDHUI);
    expect(decisionsDejaAppliquees(change, J12).has("P07")).toBe(false);
  });

  it("garde les nouveaux champs : regroupements, réévaluation, paramètres", () => {
    expect(ligne(J12, "T20").regroupe_ids).toEqual(["T01a", "T04a", "T10"]);
    expect(ligne(J12, "T20").cout_ht_origine).toBe("regroupement_micro_postes");
    expect(ligne(J12, "T12")).toMatchObject({ cout_ht_source_eur: 600000, reevaluation_prix_coef: 1.071225, cout_ht_base_eur: 642735, annee_origine: "lissee" });
    expect(J12.parametres_ppt).toMatchObject({ annee_prix_source: 2024, reevaluation_prix_coef: 1.071225, moe_sur_energetique: true, inflation_pct: 3.5 });
    expect(J12.echeancier_source.scenario_reference).toBe("Gain maximum");
    expect(J12.propositions.find((p) => p.code === "P04")?.note_application).toContain("T19 → 2036");
  });
});

describe("2. import du fichier 1.1 de la même copropriété", () => {
  it("29 lignes et valeurs par défaut de la 1.2, sans erreur", () => {
    expect(J11.travaux_normalises).toHaveLength(29);
    expect(J11.revision).toBeNull();
    expect(J11.synthese.statut_validation_global).toBe("A_VALIDER");
    expect(J11.travaux_source.every((s) => s.retenu_dans_ppt === true && s.motif_exclusion === null)).toBe(true);
    expect(J11.travaux_normalises.every((t) => t.cout_ht_source_eur === t.cout_ht_base_eur && t.reevaluation_prix_coef === 1 && t.regroupe_ids === null)).toBe(true);
    expect(J11.propositions.every((p) => p.note_application === null && p.date_validation === null)).toBe(true);
    expect(J11.parametres_ppt).toMatchObject({ annee_prix_source: null, reevaluation_prix_coef: 1, moe_sur_energetique: false });
    expect(J11.echeancier_source).toMatchObject({ scenario_reference: null, note_scenario: null });
  });

  it("clés de période normalisées, plan_retenu_pour_normalisation ignoré", () => {
    expect(Object.keys(J11.echeancier_source.totaux_par_annee_annonces)).toEqual(["0 à 1 an", "1 à 5 ans", "5 à 10 ans"]);
    expect("plan_retenu_pour_normalisation" in J11.echeancier_source).toBe(false);
  });
});

describe("3. version non prise en charge", () => {
  it("refuse pppt-verif/2.0 et un fichier sans schema_version", () => {
    const v2 = { ...(cloner(FICHIER_12) as Record<string, unknown>), schema_version: "pppt-verif/2.0" };
    expect(validerJson(v2).erreurs).toEqual(["Version de schéma non prise en charge : pppt-verif/2.0 (versions acceptées : 1.1, 1.2)"]);
    const sans = cloner(FICHIER_12) as Record<string, unknown>;
    delete sans.schema_version;
    expect(validerJson(sans).ok).toBe(false);
    expect(validerJson(sans).erreurs[0]).toBe("Version de schéma non prise en charge : absente (versions acceptées : 1.1, 1.2)");
  });
});

describe("4. affichage des gains en points de pourcentage", () => {
  it("murs 0,5 %, planchers bas 1,0 %, VMC 23,8 %, PAC 36,2 %", () => {
    expect(fmtPoints(ligne(J12, "T14").gain_energetique_pct)).toBe("0,5 %");
    expect(fmtPoints(ligne(J12, "T16").gain_energetique_pct)).toBe("1,0 %");
    expect(fmtPoints(ligne(J12, "T17").gain_energetique_pct)).toBe("23,8 %");
    expect(fmtPoints(ligne(J12, "T19").gain_energetique_pct)).toBe("36,2 %");
  });

  it("gain composé : 27,9 % pour les 4 gestes du plan Optimal, 54,9 % avec les deux options", () => {
    expect(fmtPct(gainCompose([0.5, 4, 1, 23.8]))).toBe("27,9 %");
    const tous = J12.travaux_normalises.filter((t) => t.priorite === "Énergétique").map((t) => t.gain_energetique_pct);
    expect(fmtPct(gainCompose(tous))).toBe("54,9 %");
  });
});

describe("5. contrôles plateforme sur le fichier 1.2", () => {
  const codes = remarques12.filter((c) => c.statut === "NON_CONFORME" || c.statut === "PARTIEL").map((c) => c.code);

  it("C01 (total), C05 (périodes), P04 (traçabilité), P25 (réévaluation) et C12 (gain composé) conformes", () => {
    expect(codes).not.toContain("C01");
    expect(codes).not.toContain("C05");
    expect(codes).not.toContain("P04");
    expect(codes).not.toContain("P25");
    expect(remarques12.some((c) => c.code === "C12" && c.libelle === "Gain énergétique total")).toBe(false);
  });

  it("plus de doublon sur l'ouvrage générique, plus d'ordre de grandeur sur les micro-postes ni sur les balcons", () => {
    expect(codes).not.toContain("C15");
    expect(codes).not.toContain("C04");
  });

  it("C03 portes d'entrée : info « choix validé par l'AMO » (P11), plus d'alerte", () => {
    const c03 = remarques12.filter((c) => c.code === "C03");
    expect(c03).toHaveLength(1);
    expect(c03[0]).toMatchObject({ poste_code: "T06c", severite: "INFO", statut: "CONFORME" });
    expect(c03[0].constat).toContain("Choix validé par l'AMO le 24/09/2026 (P11");
  });

  it("gains par geste tranchés par P10 (controle_lie C12) : infos, pas d'alerte", () => {
    const gestes = remarques12.filter((c) => c.code === "C12");
    expect(gestes.length).toBeGreaterThan(0);
    expect(gestes.every((c) => c.severite === "INFO" && c.statut === "CONFORME" && c.constat?.includes("(P10"))).toBe(true);
  });

  it("C16 / P21 recalculés sur les années lissées : 2036 seule, due à l'option PAC ; plus de concentration à 72 %", () => {
    const c16 = remarques12.filter((c) => c.code === "C16");
    expect(c16.map((c) => c.libelle)).toEqual(["Charge annuelle 2036"]);
    expect(c16[0].constat).toContain("T19, 100 % de l'année");
    expect(codes).not.toContain("P21");
  });

  it("le fichier 1.1 garde ses écarts réels (poste T13 compté, totaux du plan Optimal)", () => {
    const r11 = controlesPlateforme(J11, {}, AUJOURDHUI).map((c) => c.code);
    expect(r11).toContain("C01");
    expect(r11).toContain("P04");
  });
});

describe("6. TTC recalculé (formule du skill)", () => {
  it("total 7 746 442 €, 2029 = 1 840 263 €, 2036 = 3 546 856 € (à 1 € près), sans avertissement à l'import", () => {
    const { total, parAnnee } = totauxTtcJson(J12);
    expect(Math.abs(total - 7746442)).toBeLessThanOrEqual(1);
    expect(Math.abs(parAnnee["2029"] - 1840263)).toBeLessThanOrEqual(1);
    expect(Math.abs(parAnnee["2036"] - 3546856)).toBeLessThanOrEqual(1);
    expect(validerJson(FICHIER_12).avertissements.some((a) => a.includes("TTC"))).toBe(false);
  });

  it("un écart au TTC de la révision est signalé sans bloquer l'import", () => {
    const f = cloner(FICHIER_12) as { revision: { total_ttc_estime_eur: number } };
    f.revision.total_ttc_estime_eur = 7700000;
    const r = validerJson(f);
    expect(r.ok).toBe(true);
    expect(r.avertissements.some((a) => a.startsWith("TTC recalculé"))).toBe(true);
  });
});

describe("7. aller-retour import → export → import", () => {
  const sortie = exporterJson(J12, J12, AUJOURDHUI);

  it("export en 1.2, sans remarques plateforme, révision inchangée", () => {
    expect(sortie.schema_version).toBe("pppt-verif/1.2");
    expect("remarques_plateforme" in sortie).toBe(false);
    expect(sortie.revision?.numero).toBe(2);
    expect(sortie.conventions?.coefficients).toBeDefined();
  });

  it("le second import donne les mêmes données", () => {
    expect(importer(JSON.parse(JSON.stringify(sortie)))).toEqual(J12);
  });

  it("les remarques plateforme partent dans un fichier séparé", () => {
    const f = exporterRemarques(sortie, remarques12, AUJOURDHUI);
    expect(f.format).toBe("strateco-remarques-plateforme/1.0");
    expect(f.remarques).toHaveLength(remarques12.length);
    expect(f.revision).toBe(2);
  });

  it("une décision prise sur la plateforme ouvre la révision 3, datée, avec son changement", () => {
    const travail = decider({ ...J12, remarques_plateforme: remarques12 }, "P05", "REFUSEE", "étanchéité traitée comme réfection simple", AUJOURDHUI);
    const e = exporterJson(travail, J12, AUJOURDHUI);
    expect(e.revision?.numero).toBe(3);
    expect(e.revision?.date).toBe("2026-09-24");
    expect(e.revision?.changements).toContain("P05 refusée sur la plateforme le 2026-09-24");
    expect(e.revision?.propositions_appliquees).not.toContain("P05");
    expect(e.propositions.find((p) => p.code === "P05")).toMatchObject({ statut_validation: "REFUSEE", date_validation: "2026-09-24", commentaire_validateur: "étanchéité traitée comme réfection simple" });
    expect(Math.abs((e.revision?.total_ttc_estime_eur ?? 0) - 7746442)).toBeLessThanOrEqual(1);
    // enregistrée puis relue : la révision reste la 3 (calculée depuis l'import, jamais cumulée)
    const relue = { ...travail, revision: revisionCourante(travail, J12, AUJOURDHUI) };
    expect(revisionCourante(relue, J12, new Date("2026-09-30")).numero).toBe(3);
    expect(revisionCourante(relue, J12, new Date("2026-09-30")).date).toBe("2026-09-24");
  });

  it("un 1.1 non modifié s'exporte en 1.2, révision 1 aux totaux recalculés", () => {
    const e = exporterJson(J11, J11, AUJOURDHUI);
    expect(e.schema_version).toBe("pppt-verif/1.2");
    expect(e.revision).toMatchObject({ numero: 1, date: "2026-09-24", changements: [] });
    expect(e.synthese.statut_validation_global).toBe("A_VALIDER");
  });
});
