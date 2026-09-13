// Pièces partagées entre dispositifs (feedback Amir 13/09/2026) : un type de
// document par pièce, le même type relie la pièce partout où elle est
// attendue (checklists AMO et dossiers de la page Documents à produire), et
// le menu des types du dépôt couvre toutes les pièces de toutes les checklists.
import { describe, expect, it } from "vitest";
import { CHECKLIST_TEMPLATES, labelsChecklistPourType } from "../fichiers";
import { PARCOURS, docsOfEtape } from "../montage";
import { ciblesMontagePourType } from "../propagation";
import { TYPES_DOCUMENT } from "@/lib/nommage";

const typesConnus = new Set(TYPES_DOCUMENT.map((t) => t.id));

describe("pièces partagées entre dispositifs", () => {
  it("donne à chaque pièce de chaque checklist un type de document proposé au dépôt", () => {
    for (const t of CHECKLIST_TEMPLATES)
      for (const i of t.items) expect(typesConnus.has(i.type), `${t.label} : ${i.label} (${i.type})`).toBe(true);
  });

  it("ne réutilise jamais un même type pour deux pièces d'une même checklist (sauf « Autre »)", () => {
    for (const t of CHECKLIST_TEMPLATES) {
      const types = t.items.map((i) => i.type).filter((x) => x !== "autre");
      expect(new Set(types).size, t.label).toBe(types.length);
    }
  });

  it("ne réutilise jamais un même type pour deux documents d'un même dossier de montage, hors répétitions voulues", () => {
    // Attestations du taux d'impayés (éco-PTZ : une par étape), attestations
    // décennales et rapports du contrôleur technique (dommages-ouvrage : initial
    // puis final) sont des répétitions voulues.
    const tolerés = new Set(["attestation_impayes", "attestation_decennale", "rapport_ct", "autre", "courrier"]);
    for (const [id, p] of Object.entries(PARCOURS)) {
      const types = p!.etapes.flatMap(docsOfEtape).map((d) => d.type!).filter((x) => !tolerés.has(x));
      expect(new Set(types).size, id).toBe(types.length);
    }
  });

  it("relie l'attestation de mise à jour du registre à toutes les checklists et à tous les dossiers qui l'attendent", () => {
    expect(labelsChecklistPourType("attestation_registre").sort()).toEqual([
      "Attestation de mise à jour du registre de copropriété",
      "Attestation de mise à jour du registre de copropriété",
    ]);
    // Déposée dans le dossier éco-PTZ : ajoutée aux dossiers ANAH et EMS & Climaxion
    expect(ciblesMontagePourType("attestation_registre", "ecoptz").map((c) => c.montage).sort()).toEqual([
      "anah",
      "climaxion",
    ]);
    // Déposée depuis l'onglet Fichiers : ajoutée aux trois dossiers
    expect(ciblesMontagePourType("attestation_registre").map((c) => c.montage).sort()).toEqual([
      "anah",
      "climaxion",
      "ecoptz",
    ]);
  });

  it("distingue les PV d'AG entre eux : le PV de mandat ne coche pas le PV de travaux", () => {
    expect(labelsChecklistPourType("pv_ag_mandat")).toEqual(["PV d'AG nommant le représentant légal"]);
    expect(ciblesMontagePourType("pv_ag_mandat").map((c) => `${c.montage}/${c.def.key}`).sort()).toEqual([
      "anah/pv_ag_representant",
      "ecoptz/pv_ag_mandat",
    ]);
    const travaux = ciblesMontagePourType("pv_ag_travaux").map((c) => c.montage).sort();
    expect(travaux).toEqual(["anah", "climaxion", "ecoptz"]);
    expect(labelsChecklistPourType("pv_ag_travaux")).toHaveLength(4); // CEE, MPR, EMS & Climaxion, éco-PTZ
  });

  it("partage le plan de financement définitif jusqu'au dossier d'assurance", () => {
    expect(ciblesMontagePourType("pf_definitif").map((c) => c.montage).sort()).toEqual(["anah", "climaxion", "do"]);
  });
});
