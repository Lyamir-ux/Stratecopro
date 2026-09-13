// Dossier EMS & Climaxion (feedback Amir 13/09/2026) : checklist commune
// Eurométropole / Climaxion, 25 pièces, mêmes pièces côté AMO (checklist) et
// côté syndic (parcours), déposants fixés pièce par pièce, deux pièces
// confidentielles. Vérifie aussi que chaque document de tous les parcours a un
// type de dépôt connu.
import { describe, expect, it } from "vitest";
import { CLIMAXION_ETAPES, MONTAGES, PARCOURS, docsOfEtape, docDef } from "../montage";
import { CHECKLIST_TEMPLATES, DISPOSITIFS_RECAP } from "../fichiers";
import { TYPES_DOCUMENT } from "@/lib/nommage";

const docs = CLIMAXION_ETAPES.flatMap(docsOfEtape);

describe("dossier EMS & Climaxion", () => {
  it("fusionne Climaxion et Eurométropole en un seul dispositif « climaxion »", () => {
    expect(CHECKLIST_TEMPLATES.some((t) => t.dispositif === "eurometropole")).toBe(false);
    expect(DISPOSITIFS_RECAP.some((d) => d.id === "eurometropole")).toBe(false);
    expect(CHECKLIST_TEMPLATES.find((t) => t.dispositif === "climaxion")?.label).toBe("EMS & Climaxion");
    expect(DISPOSITIFS_RECAP.find((d) => d.id === "climaxion")?.label).toBe("EMS & Climaxion");
    expect(MONTAGES.find((m) => m.id === "climaxion")).toMatchObject({ label: "EMS & Climaxion", dispo: true });
    expect(PARCOURS.climaxion?.etapes).toBe(CLIMAXION_ETAPES);
  });

  it("aligne les 25 pièces du parcours syndic sur la checklist AMO", () => {
    const checklist = CHECKLIST_TEMPLATES.find((t) => t.dispositif === "climaxion")!;
    expect(checklist.items).toHaveLength(25);
    expect(docs).toHaveLength(25);
    expect(new Set(docs.map((d) => d.key)).size).toBe(25);
  });

  it("fixe les déposants décidés le 13/09/2026", () => {
    const f = (k: string) => docDef("climaxion", k)?.fournisseur;
    for (const k of [
      "fiche_synthetique", "attestation_registre", "attestation_composition", "reglement_copropriete",
      "attestation_logement_decent", "pv_age_lancement_amo", "rib_compte_travaux", "convention_amo",
      "mandat_delegation_depot", "pv_ag_moe", "pv_age_travaux",
    ])
      expect(f(k), k).toBe("syndic");
    for (const k of ["audit_reglementaire_sources", "tests_etancheite", "cctp_dpgf_energetiques", "devis_fenetres"])
      expect(f(k), k).toBe("amo_moe");
    for (const k of ["offre_moe", "pf_definitif", "avis_imposition", "tableau_primes_individuelles", "liste_beneficiaires"])
      expect(f(k), k).toBe("amo");
    for (const k of [
      "memoire_technique", "plans_coupes_photos", "attestation_conformite_offres",
      "rapport_conformite_offres", "planning_previsionnel",
    ])
      expect(f(k), k).toBe("moe");
  });

  it("rend confidentiels les avis d'imposition et le tableau des primes, mais pas la liste des bénéficiaires", () => {
    expect(docs.filter((d) => d.confidentiel).map((d) => d.key).sort()).toEqual([
      "avis_imposition",
      "tableau_primes_individuelles",
    ]);
    expect(docDef("climaxion", "liste_beneficiaires")?.confidentiel).toBeFalsy();
  });
});

describe("catalogues des montages", () => {
  it("donnent à chaque document un type de dépôt existant", () => {
    const ids = new Set(TYPES_DOCUMENT.map((t) => t.id));
    for (const p of Object.values(PARCOURS))
      for (const d of p!.etapes.flatMap(docsOfEtape)) expect(ids.has(d.type ?? ""), `${d.key} : ${d.type}`).toBe(true);
    for (const r of DISPOSITIFS_RECAP) for (const t of r.types) expect(ids.has(t), `${r.id} : ${t}`).toBe(true);
  });
});
