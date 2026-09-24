import { describe, expect, it } from "vitest";
import { EXEMPLE } from "./exemple";
import { cloner, diffJson, migrerJson, normaliserPeriode, validerJson } from "../import";
import type { PpptVerifJson } from "../schema";

describe("import du JSON pppt-verif", () => {
  it("accepte le jeu d'essai", () => {
    const r = validerJson(EXEMPLE);
    expect(r.ok).toBe(true);
    expect(r.erreurs).toEqual([]);
    expect(r.json?.copropriete.nom).toBe("Résidence Les Tilleuls");
  });

  it("refuse un fichier qui n'est pas un objet", () => {
    expect(validerJson("texte").ok).toBe(false);
    expect(validerJson(null).ok).toBe(false);
  });

  it("refuse une version de schéma non prise en charge, ou absente, avec le message du contrat", () => {
    for (const v of ["pppt-verif/2.0", "pppt-verif/1.0", "audit-verif/2.0"]) {
      const j = cloner(EXEMPLE) as unknown as Record<string, unknown>;
      j.schema_version = v;
      const r = validerJson(j);
      expect(r.ok).toBe(false);
      expect(r.erreurs).toEqual([`Version de schéma non prise en charge : ${v} (versions acceptées : 1.1, 1.2)`]);
    }
    const sans = cloner(EXEMPLE) as unknown as Record<string, unknown>;
    delete sans.schema_version;
    expect(validerJson(sans).erreurs).toEqual(["Version de schéma non prise en charge : absente (versions acceptées : 1.1, 1.2)"]);
  });

  it("accepte une 1.2 sans avertissement de version", () => {
    const j = cloner(EXEMPLE) as unknown as Record<string, unknown>;
    j.schema_version = "pppt-verif/1.2";
    const r = validerJson(j);
    expect(r.ok).toBe(true);
    expect(r.avertissements.some((a) => a.includes("1.2"))).toBe(false);
  });

  it("une 1.1 sans bloc propositions passe avec avertissement", () => {
    const j = cloner(EXEMPLE) as unknown as Record<string, unknown>;
    delete j.propositions;
    const r = validerJson(j);
    expect(r.ok).toBe(true);
    expect(r.avertissements.some((a) => a.includes("propositions"))).toBe(true);
  });

  it("refuse une proposition sans code, en double, sans décision ou à statut inconnu", () => {
    const j = cloner(EXEMPLE) as unknown as { propositions: Record<string, unknown>[] };
    j.propositions[1].code = "P01";
    j.propositions[2].decision = "";
    j.propositions[2].statut_validation = "PEUT_ETRE";
    j.propositions.push({ theme: "x" });
    const r = validerJson(j);
    expect(r.ok).toBe(false);
    expect(r.erreurs.some((e) => e.includes("en double"))).toBe(true);
    expect(r.erreurs.some((e) => e.includes("décision absente"))).toBe(true);
    expect(r.erreurs.some((e) => e.includes("PEUT_ETRE"))).toBe(true);
    expect(r.erreurs.some((e) => e.includes("sans code"))).toBe(true);
  });

  it("une proposition sans statut naît « à valider » ; une ligne inconnue n'est qu'un avertissement", () => {
    const j = cloner(EXEMPLE) as unknown as { propositions: Record<string, unknown>[] };
    delete j.propositions[0].statut_validation;
    j.propositions[0].lignes_concernees = ["T01", "T42"];
    const r = validerJson(j);
    expect(r.ok).toBe(true);
    expect(r.json?.propositions[0].statut_validation).toBe("A_VALIDER");
    expect(r.avertissements.some((a) => a.includes("T42"))).toBe(true);
  });

  it("journalise la décision prise sur une proposition et son commentaire", () => {
    const apres = cloner(EXEMPLE);
    apres.propositions[0].statut_validation = "VALIDEE";
    apres.propositions[2].statut_validation = "REFUSEE";
    apres.propositions[2].commentaire_validateur = "le syndic préfère appeler le fonds";
    const d = diffJson(EXEMPLE, apres);
    expect(d).toHaveLength(3);
    expect(d.find((c) => c.chemin_json === "propositions[P01].statut_validation")).toMatchObject({ valeur_avant: "A_VALIDER", valeur_apres: "VALIDEE", poste_code: null });
    expect(d.find((c) => c.chemin_json === "propositions[P03].commentaire_validateur")).toMatchObject({ valeur_apres: "le syndic préfère appeler le fonds" });
  });

  it("refuse les identifiants en double et les postes normalisés orphelins", () => {
    const j = cloner(EXEMPLE);
    j.travaux_normalises[1].id = "T01";
    j.travaux_normalises.push({ ...j.travaux_normalises[2], id: "T99" });
    const r = validerJson(j);
    expect(r.ok).toBe(false);
    expect(r.erreurs.some((e) => e.includes("en double"))).toBe(true);
    expect(r.erreurs.some((e) => e.includes("T99"))).toBe(true);
  });

  it("refuse une priorité ou une sévérité inconnue", () => {
    const j = cloner(EXEMPLE) as unknown as { travaux_normalises: { priorite: string }[]; controles: { severite: string }[] };
    j.travaux_normalises[0].priorite = "Urgent";
    j.controles[0].severite = "CRITIQUE";
    const r = validerJson(j);
    expect(r.erreurs.some((e) => e.includes("priorité"))).toBe(true);
    expect(r.erreurs.some((e) => e.includes("sévérité"))).toBe(true);
  });

  it("les paramètres en fraction d'une analyse 1.0 relue en base passent en points d'après leur clé", () => {
    const j = cloner(EXEMPLE) as unknown as { parametres_ppt: Record<string, unknown> };
    j.parametres_ppt = { annee_base: 2026, premiere_annee: 2027, horizon: 10, inflation: 0.035, tva_facades_toitures: 0.1, tva_energetique: 0.055, honoraires_moe: 0.06, honoraires_syndic: 0.03, cep_base_kwhep_m2_an: 289 };
    const m = migrerJson(j as unknown as PpptVerifJson);
    expect(m.parametres_ppt).toMatchObject({ inflation_pct: 3.5, tva_facades_toitures_pct: 10, tva_energetique_pct: 5.5, honoraires_moe_pct: 6, honoraires_syndic_pct: 3, reevaluation_prix_coef: 1, moe_sur_energetique: false, annee_prix_source: null });
    expect("inflation" in m.parametres_ppt).toBe(false);
    expect(migrerJson(m)).toEqual(m); // idempotent
  });

  it("un _pct inférieur à 1 n'est jamais multiplié par 100", () => {
    const j = cloner(EXEMPLE);
    j.travaux_normalises[0].gain_energetique_pct = 0.5;
    const r = validerJson(j);
    expect(r.json?.travaux_normalises[0].gain_energetique_pct).toBe(0.5);
  });

  it("normalise les libellés de période de l'échéancier source", () => {
    expect(normaliserPeriode("0-1 an")).toBe("0 à 1 an");
    expect(normaliserPeriode("1-5 ans")).toBe("1 à 5 ans");
    expect(normaliserPeriode("5 - 10 ans")).toBe("5 à 10 ans");
    expect(normaliserPeriode("0 à 1 an")).toBe("0 à 1 an");
    expect(normaliserPeriode("2027")).toBe("2027");
    expect(normaliserPeriode("Court terme")).toBe("Court terme");
  });

  it("une ligne regroupée est acceptée si tous ses postes source existent", () => {
    const j = cloner(EXEMPLE);
    j.travaux_normalises.push({ ...j.travaux_normalises[6], id: "T20", regroupe_ids: ["T07", "T08"], cout_ht_origine: "regroupement_micro_postes" });
    j.travaux_normalises = j.travaux_normalises.filter((t) => t.id !== "T07" && t.id !== "T08");
    expect(validerJson(j).ok).toBe(true);
    j.travaux_normalises[j.travaux_normalises.length - 1].regroupe_ids = ["T07", "T42"];
    const r = validerJson(j);
    expect(r.ok).toBe(false);
    expect(r.erreurs.some((e) => e.includes("T42"))).toBe(true);
  });

  it("ignore les remarques plateforme présentes dans le fichier", () => {
    const j = { ...cloner(EXEMPLE), remarques_plateforme: [cloner(EXEMPLE.controles[1])] };
    const r = validerJson(j);
    expect(r.ok).toBe(true);
    expect(r.json?.remarques_plateforme).toBeUndefined();
    expect(r.avertissements.some((a) => a.includes("remarques_plateforme"))).toBe(true);
  });

  it("journalise chaque correction manuelle avec son chemin, avant / après", () => {
    const apres = cloner(EXEMPLE);
    apres.travaux_normalises[2].cout_ht_base_eur = 13200;
    apres.travaux_normalises[0].annee_prevue = 2028;
    apres.copropriete.nb_lots_total = 14;
    apres.controles[1].statut = "PARTIEL";
    const d = diffJson(EXEMPLE, apres, "chiffrage devis");
    expect(d).toHaveLength(4);
    expect(d.find((c) => c.chemin_json === "travaux_normalises[T03].cout_ht_base_eur")).toMatchObject({ poste_code: "T03", valeur_avant: null, valeur_apres: 13200, motif: "chiffrage devis" });
    expect(d.find((c) => c.chemin_json === "copropriete.nb_lots_total")).toMatchObject({ valeur_avant: 13, valeur_apres: 14 });
    expect(d.find((c) => c.chemin_json === "controles[R10].statut")).toMatchObject({ valeur_avant: "NON_CONFORME", valeur_apres: "PARTIEL" });
  });

  it("un poste ajouté ou retiré est journalisé en bloc", () => {
    const apres = cloner(EXEMPLE);
    apres.travaux_normalises = apres.travaux_normalises.filter((t) => t.id !== "T07");
    const d = diffJson(EXEMPLE, apres);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ chemin_json: "travaux_normalises[T07]", valeur_apres: null });
  });

  it("sans changement, aucune correction", () => {
    expect(diffJson(EXEMPLE, cloner(EXEMPLE))).toEqual([]);
  });
});
