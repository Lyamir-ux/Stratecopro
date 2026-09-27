import { describe, expect, it } from "vitest";
import {
  OBJET_CONSULTATION_PPPT,
  adresseComplete,
  chauffageEnClair,
  demandeDepuisCopro,
  demandeEnCours,
  preremplissageConsultation,
  type DemandeConsultationLite,
} from "../consultationPppt";

const demande = (id: string, statut: string, created_at: string, ppt_copro_id = "c1"): DemandeConsultationLite => ({
  id,
  ppt_copro_id,
  statut,
  created_at,
  demandeur_nom: "Thomas Keller",
  commentaire_amo: null,
  traite_le: null,
});

describe("consultation PPPT + DPE collectif (feedback Amir 27/09/2026)", () => {
  it("la demande reprend la fiche PPT : nom, adresse complète, lots (à défaut logements), chauffage", () => {
    const d = demandeDepuisCopro({
      id: "c1",
      nom: " Les Tilleuls ",
      adresse: "12 rue des Vosges",
      code_postal: "67000",
      commune: "Strasbourg",
      nb_lots: null,
      nb_logements: 24,
      chauffage: "collectif",
      energie_chauffage: "gaz",
    });
    expect(d).toEqual({
      objet: OBJET_CONSULTATION_PPPT,
      ppt_copro_id: "c1",
      copro_nom: "Les Tilleuls",
      adresse: "12 rue des Vosges, 67000 Strasbourg",
      nb_lots: 24,
      chauffage: "Collectif gaz",
      vmc: null,
    });
  });

  it("adresse et chauffage incomplets", () => {
    expect(adresseComplete({ adresse: null, code_postal: null, commune: "Colmar" })).toBe("Colmar");
    expect(adresseComplete({ adresse: "3 place Kléber", code_postal: null, commune: null })).toBe("3 place Kléber");
    expect(adresseComplete({ adresse: null, code_postal: null, commune: null })).toBe("");
    expect(chauffageEnClair({ chauffage: null, energie_chauffage: null })).toBeNull();
    expect(chauffageEnClair({ chauffage: "individuel", energie_chauffage: null })).toBe("Individuel");
  });

  it("demande en cours : la plus récente de la copropriété, sauf si elle a été classée sans suite", () => {
    const liste = [
      demande("a", "classee", "2026-09-01T10:00:00Z"),
      demande("b", "nouvelle", "2026-09-20T10:00:00Z"),
      demande("x", "nouvelle", "2026-09-25T10:00:00Z", "c2"),
    ];
    expect(demandeEnCours(liste, "c1")?.id).toBe("b");
    expect(demandeEnCours(liste, "c2")?.id).toBe("x");
    expect(demandeEnCours(liste, "c3")).toBeNull();
    // prise en charge : toujours affichée à la place de la question
    expect(demandeEnCours([demande("t", "traitee", "2026-09-26T10:00:00Z")], "c1")?.id).toBe("t");
    // classée après une première demande : le syndic peut en refaire une
    expect(demandeEnCours([demande("b", "nouvelle", "2026-09-20T10:00:00Z"), demande("c", "classee", "2026-09-27T10:00:00Z")], "c1")).toBeNull();
  });

  it("pré-remplissage de la consultation : hors plateforme, métier PPPT + DPE collectif, ville séparée de la rue", () => {
    const p = preremplissageConsultation({ id: "d1", copro_nom: "Les Tilleuls", adresse: "12 rue des Vosges, 67000 Strasbourg", nb_lots: 24, chauffage: "Collectif gaz" });
    expect(p).toMatchObject({ demandeId: "d1", type: "pppt_dpe", cible: "externe", ext_nom: "Les Tilleuls", ext_adresse: "12 rue des Vosges", ext_ville: "67000 Strasbourg", ext_lots: "24" });
    expect(p.mission).toContain("PPPT");
    expect(p.mission).toContain("DPE) collectif");
    expect(p.mission).toContain("24 lots, chauffage : collectif gaz");
    expect(p.mission).not.toContain("—");
    const sansVille = preremplissageConsultation({ id: "d2", copro_nom: "X", adresse: "Colmar", nb_lots: null, chauffage: null });
    expect(sansVille).toMatchObject({ ext_adresse: "Colmar", ext_ville: "", ext_lots: "" });
    expect(sansVille.mission).not.toContain("()");
  });
});
