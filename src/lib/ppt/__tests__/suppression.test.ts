import { describe, expect, it } from "vitest";
import { consequencesSuppression, consequencesSuppressionAnalyse, impactSuppression, posteTravaille, type PosteSuppression, type RapportSuppression } from "../suppression";

const rapport = (id: string, patch: Partial<RapportSuppression> = {}): RapportSuppression => ({ id, type: "pppt", statut: "valide", valide_le: "2026-09-22T10:00:00Z", name: `${id}.pdf`, ...patch });
const poste = (id: string, rapport_id: string | null, patch: Partial<PosteSuppression> = {}): PosteSuppression => ({
  id, rapport_id, statut: "programme", montant_vote: null, montant_syndic: null, commentaire_syndic: null, annee_prochaine_presentation: null, retire_le: null, ...patch,
});

describe("posteTravaille", () => {
  it("reconnaît un poste retouché par le cabinet", () => {
    expect(posteTravaille(poste("a", "r"))).toBe(false);
    expect(posteTravaille(poste("a", "r", { montant_syndic: 12000 }))).toBe(true);
    expect(posteTravaille(poste("a", "r", { annee_prochaine_presentation: 2028 }))).toBe(true);
    expect(posteTravaille(poste("a", "r", { statut: "vote" }))).toBe(true);
    expect(posteTravaille(poste("a", "r", { retire_le: "2026-09-23" }))).toBe(true);
  });
});

describe("impactSuppression", () => {
  it("rapport validé en vigueur, retouché, sans version précédente (cas Porte du Soleil)", () => {
    const r = rapport("r1");
    const i = impactSuppression(r, {
      rapports: [r, rapport("t1", { type: "tableau_ppt", statut: "depose", valide_le: null })],
      postes: [poste("p1", "r1"), poste("p2", "r1", { montant_syndic: 5000 }), poste("s1", null)],
      remarques: [{ rapport_id: "r1" }, { rapport_id: "r1" }],
      nbAg: 0,
    });
    expect(i).toMatchObject({ valide: true, postes: 2, travailles: 1, votes: 0, remarques: 2, enVigueur: true, versionRestauree: null, coproVidee: false });
    const c = consequencesSuppression(i);
    expect(c.part[0]).toBe("2 postes du plan, dont 1 retouché par le cabinet.");
    expect(c.reste[0]).toMatch(/plus de plan validé/);
  });

  it("la version validée précédente du même type redevient le plan en vigueur", () => {
    const v1 = rapport("v1", { valide_le: "2026-01-10T00:00:00Z" });
    const v2 = rapport("v2", { valide_le: "2026-09-10T00:00:00Z" });
    const adopte = rapport("a1", { type: "ppt_adopte", valide_le: "2026-09-20T00:00:00Z" });
    const i = impactSuppression(v2, { rapports: [v1, v2, adopte], postes: [poste("p", "v2", { statut: "vote" })], remarques: [], nbAg: 1 });
    expect(i.enVigueur).toBe(true);
    expect(i.versionRestauree?.id).toBe("v1");
    expect(i.votes).toBe(1);
    expect(consequencesSuppression(i).reste[0]).toBe("La version validée précédente (« v1.pdf ») redevient le plan en vigueur.");
  });

  it("une version archivée ne restaure rien", () => {
    const v1 = rapport("v1", { valide_le: "2026-01-10T00:00:00Z" });
    const v2 = rapport("v2", { valide_le: "2026-09-10T00:00:00Z" });
    const i = impactSuppression(v1, { rapports: [v1, v2], postes: [poste("p", "v1")], remarques: [], nbAg: 0 });
    expect(i).toMatchObject({ enVigueur: false, versionRestauree: null, postes: 1 });
    expect(consequencesSuppression(i).part[0]).toBe("1 poste du plan (version archivée).");
  });

  it("document non validé : seul le fichier part, copro vidée si c'était tout", () => {
    const d = rapport("d1", { statut: "depose", valide_le: null, type: "autre" });
    const i = impactSuppression(d, { rapports: [d], postes: [], remarques: [], nbAg: 0 });
    expect(i).toMatchObject({ valide: false, postes: 0, enVigueur: false, coproVidee: true });
    expect(consequencesSuppression(i).part).toEqual(["Le document et son fichier sont retirés définitivement."]);
  });

  it("une ligne ajoutée par le cabinet ou une AG garde la copropriété", () => {
    const d = rapport("d1", { statut: "depose", valide_le: null });
    expect(impactSuppression(d, { rapports: [d], postes: [poste("s", null)], remarques: [], nbAg: 0 }).coproVidee).toBe(false);
    expect(impactSuppression(d, { rapports: [d], postes: [], remarques: [], nbAg: 1 }).coproVidee).toBe(false);
  });
});

describe("consequencesSuppressionAnalyse", () => {
  it("le plan et le JSON partent, le PDF reste et repasse « Déposé »", () => {
    const r = rapport("r1");
    const i = impactSuppression(r, { rapports: [r], postes: [poste("p1", "r1", { annee_prochaine_presentation: 2029 }), poste("p2", "r1")], remarques: [{ rapport_id: "r1" }], nbAg: 0 });
    const c = consequencesSuppressionAnalyse(i, 4);
    expect(c.part).toEqual(["2 postes du plan, dont 1 retouché par le cabinet.", "1 remarque du rapport.", "Le JSON importé et 4 corrections journalisées de la revue."]);
    expect(c.reste[0]).toMatch(/repasse « Déposé »/);
    expect(c.reste[1]).toBe("En attendant, le cabinet ne voit plus de plan pour cette copropriété.");
  });

  it("JSON importé mais pas encore validé : seul le JSON part", () => {
    const r = rapport("r1", { statut: "a_relire", valide_le: null });
    const c = consequencesSuppressionAnalyse(impactSuppression(r, { rapports: [r], postes: [], remarques: [], nbAg: 0 }), 0);
    expect(c.part).toEqual(["Le JSON importé."]);
    expect(c.reste).toHaveLength(3);
  });
});
