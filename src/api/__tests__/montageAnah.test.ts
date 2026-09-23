// Dossier ANAH - MaPrimeRénov' Copro (feedback Amir 13/09/2026) : le parcours
// reprend les 15 pièces de la checklist MaPrimeRénov' du dossier, chaque pièce
// a un déposant, et les pièces confidentielles sortent du décompte du syndic.
import { describe, expect, it } from "vitest";
import { ANAH_ETAPES, PARCOURS, docsOfEtape, docDef, etapeProgress } from "../montage";
import { CHECKLIST_TEMPLATES } from "../fichiers";
import type { MontageDoc, MontageFormulaire } from "../montage";

const docsAnah = ANAH_ETAPES.flatMap(docsOfEtape);

describe("dossier ANAH - MaPrimeRénov' Copro", () => {
  it("compte les 15 pièces de la checklist MaPrimeRénov', sans doublon de clé", () => {
    const checklist = CHECKLIST_TEMPLATES.find((t) => t.dispositif === "mpr_copro_2024")!;
    expect(docsAnah).toHaveLength(checklist.items.length);
    expect(new Set(docsAnah.map((d) => d.key)).size).toBe(docsAnah.length);
    // Chaque libellé du parcours reprend l'intitulé de la checklist (mot-clé)
    for (const item of checklist.items) {
      const mot = item.label.replace(/\(.*\)/, "").split(" ").filter((m) => m.length > 4)[0];
      expect(docsAnah.some((d) => d.name.includes(mot)), item.label).toBe(true);
      // même type de document côté checklist et côté dossier syndic : un dépôt coche les deux
      expect(docsAnah.some((d) => d.type === item.type), item.label + " / " + item.type).toBe(true);
    }
  });

  it("est enregistré dans le registre des parcours et disponible", () => {
    expect(PARCOURS.anah?.etapes).toBe(ANAH_ETAPES);
    expect(PARCOURS.anah?.titre).toContain("MaPrimeRénov'");
  });

  it("fixe les déposants décidés le 13/09/2026", () => {
    const f = (k: string) => docDef("anah", k)?.fournisseur;
    expect(f("pv_ag_travaux")).toBe("syndic");
    expect(f("pv_ag_representant")).toBe("syndic");
    expect(f("rib_compte_travaux")).toBe("syndic");
    expect(f("devis_dpgf")).toBe("amo_moe");
    expect(f("devis_honoraires_moe")).toBe("amo");
    expect(f("contrat_moe")).toBe("amo");
    expect(f("convention_amo")).toBe("syndic");
    expect(f("audit_reglementaire")).toBe("amo_moe");
    expect(f("urbanisme")).toBe("moe");
    expect(f("fiche_etat")).toBe("syndic");
    expect(docDef("anah", "fiche_etat")?.hint).toContain("président du conseil syndical");
    expect(f("rapport_enquete_sociale")).toBe("amo");
    expect(f("avis_imposition")).toBe("amo");
    expect(f("liste_primes_individuelles")).toBe("amo");
    expect(f("attestation_registre")).toBe("syndic");
    expect(f("pf_definitif")).toBe("amo");
  });

  it("marque confidentiels les avis d'imposition et la liste des primes individuelles, et rien d'autre", () => {
    expect(docsAnah.filter((d) => d.confidentiel).map((d) => d.key).sort()).toEqual([
      "avis_imposition",
      "liste_primes_individuelles",
    ]);
    for (const d of docsAnah.filter((d) => d.confidentiel)) expect(d.fournisseur).toBe("amo");
  });

  it("ne compte pas les pièces confidentielles dans l'avancement vu du syndic", () => {
    const etape = ANAH_ETAPES.find((e) => e.id === "social_financement")!;
    const row = (doc_key: string): MontageDoc =>
      ({ doc_key, statut: "depose", files: [{ name: "x.pdf", path: "p" }] }) as unknown as MontageDoc;
    const docs = new Map([["avis_imposition", row("avis_imposition")]]);
    expect(etapeProgress(etape, docs, new Map(), true)).toEqual({ done: 1, total: 4 });
    expect(etapeProgress(etape, docs, new Map(), false)).toEqual({ done: 0, total: 2 });
  });

  it("ouvre l'étape 1 sur la fiche État en ligne, comptée faite une fois transmise ou validée (23/09/2026)", () => {
    const etape = ANAH_ETAPES.find((e) => e.id === "copropriete")!;
    expect(etape.formulaires?.map((f) => f.type)).toEqual(["fiche_etat_anah"]);
    expect(docDef("anah", "fiche_etat")?.type).toBe("fiche_etat_anah");
    const forme = (statut: string) => new Map([["fiche_etat_anah" as const, { statut } as unknown as MontageFormulaire]]);
    const total = docsOfEtape(etape).length + 1;
    expect(etapeProgress(etape, new Map(), forme("brouillon"))).toEqual({ done: 0, total });
    expect(etapeProgress(etape, new Map(), forme("transmis"))).toEqual({ done: 1, total });
    expect(etapeProgress(etape, new Map(), forme("valide"))).toEqual({ done: 1, total });
  });
});
