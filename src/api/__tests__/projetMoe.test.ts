// Fiche projet de la MOE (14/10/2026) : un dépôt de la maîtrise d'œuvre sur une
// pièce des Documents à produire complète aussi les pièces du même type des
// autres dossiers, jamais une pièce confidentielle.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { ciblesDepotMoe } from "../projetMoe";
import { PARCOURS, docDef, docsOfEtape, type MontageId } from "../montage";

describe("ciblesDepotMoe", () => {
  it("la pièce choisie vient en premier, suivie des pièces du même type des autres dossiers", () => {
    const cibles = ciblesDepotMoe("anah", "devis_travaux", "devis_travaux");
    expect(cibles[0]).toEqual({ montage: "anah", doc_key: "devis_travaux" });
    expect(cibles.length).toBeGreaterThan(1);
    for (const c of cibles.slice(1)) {
      expect(c.montage).not.toBe("anah");
      expect(docDef(c.montage as MontageId, c.doc_key)?.type).toBe("devis_travaux");
    }
  });

  it("un type générique ne se propage pas", () => {
    expect(ciblesDepotMoe("anah", "devis_travaux", "autre")).toEqual([{ montage: "anah", doc_key: "devis_travaux" }]);
    expect(ciblesDepotMoe("anah", "devis_travaux", null)).toEqual([{ montage: "anah", doc_key: "devis_travaux" }]);
  });

  it("aucune pièce confidentielle parmi les pièces complétées par propagation", () => {
    const types = new Set(
      (Object.keys(PARCOURS) as MontageId[]).flatMap((m) => PARCOURS[m]!.etapes.flatMap(docsOfEtape).map((d) => d.type).filter(Boolean))
    );
    for (const type of types) {
      for (const c of ciblesDepotMoe("ecoptz", "cle_inexistante", type).slice(1)) {
        expect(docDef(c.montage as MontageId, c.doc_key)?.confidentiel ?? false, `${type} -> ${c.montage}/${c.doc_key}`).toBe(false);
      }
    }
  });
});
