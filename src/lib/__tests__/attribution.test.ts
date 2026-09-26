import { describe, expect, it } from "vitest";
import { coprosAAttribuer, gestionnairesAttribuables, libelleMotif, type MembreAttribution } from "../attribution";

const ORG = "org-1";
const equipe: MembreAttribution[] = [
  { user_id: "u-dir", full_name: "Pierrot LEFOU", email: "direction@syndic.fr", org_role: "directeur", active: true },
  { user_id: "u-tk", full_name: "Thomas Keller", email: "thomas@syndic.fr", org_role: "gestionnaire", active: true },
  { user_id: "u-nb", full_name: "Nadia Benali", email: "nadia@syndic.fr", org_role: "gestionnaire", active: false },
  { user_id: "u-adm", full_name: "Anne Admin", email: "anne@syndic.fr", org_role: "administratif", active: true },
];
const copro = (id: string, email: string | null, cree: string, extra: Partial<{ organisation_id: string | null; gestionnaire_nom: string | null; attribution_gardee_le: string | null }> = {}) => ({
  id,
  organisation_id: ORG,
  gestionnaire_nom: null,
  gestionnaire_email: email,
  created_at: cree,
  ...extra,
});

describe("coprosAAttribuer", () => {
  it("retient les dossiers de la direction (sauf gardés), sans gestionnaire ou sans compte gestionnaire actif", () => {
    const liste = coprosAAttribuer(
      [
        copro("suivi", "Thomas@Syndic.fr ", "2026-09-01"),
        copro("direction", "direction@syndic.fr", "2026-09-25"),
        copro("gardee", "direction@syndic.fr", "2026-09-24", { attribution_gardee_le: "2026-09-26T10:00:00Z" }),
        copro("vide", null, "2026-09-10"),
        copro("inconnu", "ancien@autre.fr", "2026-09-05", { gestionnaire_nom: "Paul Ancien" }),
        copro("admin", "anne@syndic.fr", "2026-09-03"),
        copro("desactive", "nadia@syndic.fr", "2026-09-02"),
        copro("autre-enseigne", null, "2026-09-26", { organisation_id: "org-2" }),
      ],
      ORG,
      equipe
    );
    expect(liste.map((a) => [a.copro.id, a.motif])).toEqual([
      ["direction", "direction"],
      ["vide", "aucun"],
      ["inconnu", "sans_compte"],
      ["admin", "autre_role"],
      ["desactive", "desactive"],
    ]);
  });

  it("décrit la situation en clair", () => {
    const [dir, inconnu] = coprosAAttribuer(
      [copro("d", "direction@syndic.fr", "2026-09-25"), copro("i", "ancien@autre.fr", "2026-09-05", { gestionnaire_nom: "Paul Ancien" })],
      ORG,
      equipe
    );
    expect(libelleMotif(dir)).toBe("Arrivée sur le compte de la direction (Pierrot LEFOU)");
    expect(libelleMotif(inconnu)).toBe("Paul Ancien indiqué, sans compte dans l'enseigne");
    expect(libelleMotif({ copro: copro("v", null, "2026-09-01"), motif: "aucun", membre: null })).toBe("Aucun gestionnaire désigné");
  });
});

describe("gestionnairesAttribuables", () => {
  it("propose les seuls gestionnaires actifs, par ordre alphabétique", () => {
    const autres: MembreAttribution = { user_id: "u-cv", full_name: "Claire Vasseur", email: "claire@syndic.fr", org_role: "gestionnaire", active: true };
    expect(gestionnairesAttribuables([...equipe, autres]).map((m) => m.full_name)).toEqual(["Claire Vasseur", "Thomas Keller"]);
  });
});
