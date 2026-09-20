import { describe, expect, it } from "vitest";
import { EXEMPLE } from "./exemple";
import { cloner, diffJson, validerJson } from "../import";

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

  it("refuse une version de schéma inconnue", () => {
    const j = cloner(EXEMPLE) as unknown as Record<string, unknown>;
    j.schema_version = "audit-verif/2.0";
    const r = validerJson(j);
    expect(r.ok).toBe(false);
    expect(r.erreurs[0]).toContain("schema_version");
  });

  it("accepte une 1.1 avec avertissement", () => {
    const j = cloner(EXEMPLE) as unknown as Record<string, unknown>;
    j.schema_version = "pppt-verif/1.1";
    const r = validerJson(j);
    expect(r.ok).toBe(true);
    expect(r.avertissements.some((a) => a.includes("1.1"))).toBe(true);
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

  it("signale des paramètres exprimés en pourcentage plutôt qu'en fraction", () => {
    const j = cloner(EXEMPLE);
    j.parametres_ppt.inflation = 3.5;
    const r = validerJson(j);
    expect(r.ok).toBe(true);
    expect(r.avertissements.some((a) => a.includes("inflation"))).toBe(true);
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
