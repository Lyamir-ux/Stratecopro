import { describe, expect, it } from "vitest";
import { ECOPTZ_ETAPES, PARCOURS, docsOfEtape } from "@/api/montage";
import { TYPES_DOCUMENT, TYPES_DOCUMENT_TRIES } from "@/lib/nommage";

// Feedbacks d'Amir du 10/09/2026 (page Documents à produire, espace syndic).
describe("catalogue du montage bancaire", () => {
  it("demande une attestation du taux d'impayés distincte à chacune des 3 étapes éco-PTZ", () => {
    // Le taux évolue : plusieurs mois peuvent séparer deux étapes, la banque
    // veut l'attestation « à l'instant » - une clé par étape, jamais partagée.
    const parEtape = ECOPTZ_ETAPES.map((e) =>
      docsOfEtape(e).filter((d) => /taux d'impay/i.test(d.name)).map((d) => d.key)
    );
    expect(parEtape).toHaveLength(3);
    for (const cles of parEtape) expect(cles).toHaveLength(1);
    const toutes = parEtape.flat();
    expect(new Set(toutes).size).toBe(3);
    // la clé historique reste celle de l'étape 1 (dépôts existants conservés)
    expect(parEtape[0]).toEqual(["attestation_impayes"]);
  });

  it("n'a aucune clé de document partagée entre deux étapes d'un même parcours", () => {
    for (const parcours of Object.values(PARCOURS)) {
      const vues = new Map<string, string>();
      for (const etape of parcours!.etapes) {
        for (const d of docsOfEtape(etape)) {
          expect(vues.has(d.key), `${d.key} déjà à l'étape ${vues.get(d.key)}`).toBe(false);
          vues.set(d.key, etape.id);
        }
      }
    }
  });

  it("présélectionne un type de document connu pour chaque pièce (menu du dialogue de dépôt)", () => {
    const ids = new Set(TYPES_DOCUMENT.map((t) => t.id));
    for (const parcours of Object.values(PARCOURS)) {
      for (const d of parcours!.etapes.flatMap(docsOfEtape)) {
        expect(d.type, `${d.key} sans type`).toBeTruthy();
        expect(ids.has(d.type!), `${d.key} : type ${d.type} inconnu`).toBe(true);
      }
    }
    // la fiche de renseignements de l'étape 1 a son propre type
    expect(ids.has("fiche_renseignements")).toBe(true);
  });
});

describe("types de documents du menu déroulant", () => {
  it("sont classés par ordre alphabétique, « Autre document » en dernier", () => {
    const labels = TYPES_DOCUMENT_TRIES.map((t) => t.label);
    expect(labels[labels.length - 1]).toBe("Autre document");
    const sansAutre = labels.slice(0, -1);
    const tries = [...sansAutre].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    expect(sansAutre).toEqual(tries);
    expect(TYPES_DOCUMENT_TRIES).toHaveLength(TYPES_DOCUMENT.length);
  });

  it("ont des identifiants et des libellés uniques", () => {
    expect(new Set(TYPES_DOCUMENT.map((t) => t.id)).size).toBe(TYPES_DOCUMENT.length);
    expect(new Set(TYPES_DOCUMENT.map((t) => t.label)).size).toBe(TYPES_DOCUMENT.length);
  });
});
