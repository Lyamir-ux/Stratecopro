import { describe, expect, it } from "vitest";
import { comparerOffres, etapeConsultation, joursRestants, libelleDemandeConsultation, libellePrestation, syntheseOffres, type OffreLite } from "../analyseOffres";

const offre = (id: string, montant: number | null, received_at: string, extra: Partial<OffreLite> = {}): OffreLite => ({
  id,
  org_name: `Bureau ${id}`,
  montant,
  message: null,
  fichier_path: `u/${id}.pdf`,
  fichier_name: `${id}.pdf`,
  received_at,
  retrait_at: null,
  ...extra,
});

describe("analyse des offres PPPT + DPE collectif (0109)", () => {
  it("comparatif : du moins cher au plus cher, sans montant en dernier, offres retirées exclues", () => {
    const c = comparerOffres(
      [
        offre("a", 6000, "2026-09-28T10:00:00Z"),
        offre("b", 4800, "2026-09-29T10:00:00Z"),
        offre("c", null, "2026-09-27T10:00:00Z"),
        offre("d", 4000, "2026-09-30T10:00:00Z", { retrait_at: "2026-10-01T10:00:00Z" }),
        offre("e", 4800, "2026-09-30T10:00:00Z"),
      ],
      "a"
    );
    expect(c.map((o) => o.id)).toEqual(["b", "e", "a", "c"]);
    expect(c.map((o) => o.rang)).toEqual([1, 1, 3, null]);
    expect(c[0]).toMatchObject({ montantHt: 4800, montantTtc: 5760, ecart: 0, moinsDisante: true, recommandee: false });
    expect(c[1].moinsDisante).toBe(true);
    expect(c[2]).toMatchObject({ ecart: 0.25, recommandee: true, moinsDisante: false });
    expect(c[3]).toMatchObject({ montantHt: null, montantTtc: null, ecart: null, fichier: { path: "u/c.pdf", name: "c.pdf" } });
  });

  it("synthèse : bornes, moyenne des offres chiffrées, offre recommandée", () => {
    const s = syntheseOffres(comparerOffres([offre("a", 6000, "2026-09-28"), offre("b", 4500, "2026-09-29"), offre("c", null, "2026-09-30")], "b"));
    expect(s).toMatchObject({ nb: 3, chiffrees: 2, minHt: 4500, maxHt: 6000, moyenneHt: 5250 });
    expect(s.recommandee?.id).toBe("b");
    expect(syntheseOffres([])).toMatchObject({ nb: 0, minHt: null, moyenneHt: null, recommandee: null });
  });

  it("prix et délais séparés PPPT / DPE collectif (0110)", () => {
    const c = comparerOffres(
      [
        offre("a", 6200, "2026-10-02", { tarif_pppt: 4000, tarif_dpe: 2200, delai_pppt_semaines: 10, delai_dpe_semaines: 6 }),
        offre("b", 5400, "2026-10-05", { tarif_pppt: 3200, tarif_dpe: 2200, delai_pppt_semaines: 8, delai_dpe_semaines: null }),
        offre("c", 3000, "2026-10-06"),
      ],
      null
    );
    expect(c.map((o) => o.id)).toEqual(["c", "b", "a"]);
    const b = c.find((o) => o.id === "b")!;
    expect(b.pppt).toEqual({ ht: 3200, delaiSemaines: 8 });
    expect(b.dpe).toEqual({ ht: 2200, delaiSemaines: null });
    expect(b.delaiMaxSemaines).toBe(8);
    expect(c.find((o) => o.id === "a")!.delaiMaxSemaines).toBe(10);
    // offre sans détail (antérieure à 0110) : rien d'inventé
    expect(c[0]).toMatchObject({ pppt: { ht: null, delaiSemaines: null }, dpe: { ht: null, delaiSemaines: null }, delaiMaxSemaines: null });
    const s = syntheseOffres(c);
    expect(s.detaillees).toBe(2);
    expect(s.delaiMinSemaines).toBe(8);
    const euro = (n: number) => `${n} €`;
    expect(libellePrestation(b.pppt, euro)).toEqual({ prix: "3200 €", delai: "8 sem." });
    expect(libellePrestation(b.dpe, euro)).toEqual({ prix: "2200 €", delai: null });
  });

  it("étape : en cours tant qu'en ligne, clôturée en attente d'analyse, puis analyse publiée", () => {
    expect(etapeConsultation({ statut: "en_ligne", analyse_publiee_le: null })).toBe("en_cours");
    expect(etapeConsultation({ statut: "cloturee", analyse_publiee_le: null })).toBe("cloturee");
    expect(etapeConsultation({ statut: "cloturee", analyse_publiee_le: "2026-10-20T10:00:00Z" })).toBe("analyse");
  });

  it("jours restants avant la date limite", () => {
    const le27 = new Date("2026-09-27T12:00:00");
    expect(joursRestants("2026-10-18", le27)).toBe(21);
    expect(joursRestants("2026-09-27", le27)).toBe(0);
    expect(joursRestants("2026-09-26", le27)).toBe(-1);
    expect(joursRestants(null, le27)).toBeNull();
  });

  it("libellé de la carte du tableau de bord selon la demande", () => {
    expect(libelleDemandeConsultation({ statut: "nouvelle", consultation_id: "x" }).court).toBe("Consultation en cours");
    expect(libelleDemandeConsultation({ statut: "nouvelle", consultation_id: null }).court).toBe("Consultation demandée");
    expect(libelleDemandeConsultation({ statut: "traitee", consultation_id: "x" })).toEqual({ court: "Analyse des offres disponible", kind: "success" });
  });
});
