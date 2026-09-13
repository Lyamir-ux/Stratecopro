// Dossier CEE en trois étapes (feedback Amir 13/09/2026) : demande de cotation
// (formulaire de coordonnées + pièces techniques), validation des aides,
// demande de solde. Pièces à signer déposées par Strat Eco puis téléversées
// signées par le syndic ; avis d'imposition confidentiels.
import { describe, expect, it } from "vitest";
import { CEE_ETAPES, MONTAGES, PARCOURS, docsOfEtape, docDef } from "../montage";

describe("dossier CEE", () => {
  it("est disponible, en trois étapes, avec le récapitulatif des coordonnées en étape 1", () => {
    expect(MONTAGES.find((m) => m.id === "cee")?.dispo).toBe(true);
    expect(PARCOURS.cee?.etapes).toBe(CEE_ETAPES);
    expect(CEE_ETAPES.map((e) => e.id)).toEqual(["cotation", "validation_aides", "solde"]);
    expect(CEE_ETAPES[0].formulaires?.map((f) => f.type)).toEqual(["coordonnees_cee"]);
  });

  it("fixe les déposants décidés le 13/09/2026", () => {
    const f = (k: string) => docDef("cee", k)?.fournisseur;
    for (const k of ["cctp_dpgf", "audit_reglementaire_sources", "attestations_rge", "rapport_cofrac_1", "pv_reception", "rapport_cofrac_2"])
      expect(f(k), k).toBe("amo_moe");
    for (const k of ["pv_ag_travaux", "aif_signee", "ah_signee"]) expect(f(k), k).toBe("syndic");
    for (const k of ["aif_a_signer", "avis_imposition", "ah_a_signer"]) expect(f(k), k).toBe("amo");
  });

  it("rend confidentiels les seuls avis d'imposition", () => {
    expect(CEE_ETAPES.flatMap(docsOfEtape).filter((d) => d.confidentiel).map((d) => d.key)).toEqual(["avis_imposition"]);
  });

  it("distingue la pièce à signer (Strat Eco) de la pièce signée (syndic) par le type", () => {
    expect(docDef("cee", "aif_a_signer")?.type).not.toBe(docDef("cee", "aif_signee")?.type);
    expect(docDef("cee", "ah_a_signer")?.type).not.toBe(docDef("cee", "ah_signee")?.type);
    // l'attestation signée coche la pièce « partie B signée » de la checklist CEE
    expect(docDef("cee", "ah_signee")?.type).toBe("ah_cee_b");
  });
});
