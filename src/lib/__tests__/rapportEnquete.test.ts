import { describe, expect, it } from "vitest";
import { syntheseEnquete } from "@/lib/rapportEnquete";
import { petitJeu } from "./fixtureRapportEnquete";

describe("syntheseEnquete", () => {
  const s = syntheseEnquete(petitJeu());

  it("compte copropriétaires, logements, tantièmes et participation par bâtiment", () => {
    expect(s.nbCopros).toBe(11);
    expect(s.nbLogements).toBe(12);
    expect(s.totalTantiemes).toBe(1410);
    expect(s.batiments).toEqual(["A", "B"]);
    expect(s.participation.total).toEqual({ copros: 11, reponses: 7, complets: 6 });
    expect(s.participation.parBatiment.A).toEqual({ copros: 6, reponses: 4, complets: 4 });
    expect(s.participation.parBatiment.B).toEqual({ copros: 5, reponses: 3, complets: 2 });
  });

  it("reprend l'occupation de la fiche État : occupants, bailleurs, vacants, inconnus et autres lots", () => {
    const o = s.occupation;
    expect(o.po).toMatchObject({ copros: 6, logements: 6, tantiemes: 610, parBatiment: { A: 3, B: 3 } });
    expect(o.pb).toMatchObject({ copros: 4, loues: 4, vacants: 1, logements: 5, tantiemes: 500, parBatiment: { A: 1, B: 3 } });
    expect(o.inconnue).toMatchObject({ copros: 1, logements: 1, tantiemes: 100 });
    expect(o.autres).toMatchObject({ copros: 1, tantiemes: 200 });
    expect(o.mixtes).toBe(1);
    expect(o.po.tantiemes + o.pb.tantiemes + o.inconnue.tantiemes + o.autres.tantiemes).toBe(s.totalTantiemes);
  });

  it("ventile les profils des occupants (vérifiés, par bâtiment) et liste les occupants par nom de famille", () => {
    const parProfil = Object.fromEntries(s.profils.map((p) => [p.profil ?? "?", p]));
    expect(parProfil.Bleu).toMatchObject({ n: 2, verifies: 1, parBatiment: { A: 1, B: 1 } });
    expect(parProfil.Jaune).toMatchObject({ n: 1, verifies: 1, parBatiment: { B: 1 } });
    expect(parProfil.Violet).toMatchObject({ n: 1, verifies: 0 });
    expect(parProfil.Rose).toMatchObject({ n: 1, verifies: 1 });
    expect(parProfil["?"]).toMatchObject({ n: 1, parBatiment: { B: 1 } });
    expect(s.nbTresModestes).toBe(2);
    expect(s.nbModestes).toBe(1);
    expect(s.occupants.map((o) => o.nom)).toEqual(["Fatima AÏT-BRAHIM", "Jean-Pierre BAUER", "Monique BECKER", "Lucas BRAUN", "Karim HAMDI", "Paul MULLER"]);
    const hamdi = s.occupants.find((o) => o.id === "c7")!;
    expect(hamdi).toMatchObject({ batiment: "A", logements: ["5"], personnes: 4, profil: "Rose", profilStatut: "verifie" });
    const braun = s.occupants.find((o) => o.id === "c4")!;
    expect(braun).toMatchObject({ repondu: false, source: "adresse", profil: null });
  });

  it("résume les ménages occupants ayant répondu", () => {
    expect(s.menages.repondants).toBe(5);
    expect(s.menages.personnes).toBe(11);
    expect(s.menages.reponsesComposition).toBe(5);
    expect(s.menages.composition.map((c) => c.n)).toEqual([2, 1, 1, 1, 0]);
    expect(s.menages.retraites).toBe(2);
  });

  it("liste les points de vigilance des questions posées, à zéro compris", () => {
    expect(s.vigilance.repondants).toBe(7);
    expect(s.vigilance.lignes.map((l) => [l.label, l.n])).toEqual([
      ["Impayés de charges en cours", 1],
      ["Difficultés ponctuelles pour payer les charges", 1],
      ["Handicap ou perte d'autonomie dans le foyer", 0],
      ["Personne isolée", 1],
      ["Famille monoparentale", 1],
      ["Sauvegarde de justice, curatelle ou tutelle", 1],
      ["Projet de vente avant les travaux", 1],
      ["Logement insalubre ou très dégradé", 0],
      ["Logement sur-occupé", 0],
      ["Logement difficile à chauffer", 1],
    ]);
    // question jamais renseignée : pas de ligne
    expect(s.vigilance.lignes.some((l) => l.label.startsWith("Situation sociale"))).toBe(false);
    expect(s.vigilance.lignes.filter((l) => l.alerte).map((l) => l.label)).toEqual([
      "Impayés de charges en cours",
      "Sauvegarde de justice, curatelle ou tutelle",
      "Logement insalubre ou très dégradé",
    ]);
  });

  it("compte l'avis sur les travaux et l'accord pour une visite", () => {
    expect(s.avis).toEqual({
      n: 4,
      options: [
        { label: "Indispensables", n: 1 },
        { label: "Utiles", n: 2 },
        { label: "Peu utiles", n: 1 },
        { label: "Inutiles", n: 0 },
        { label: "Sans avis", n: 0 },
      ],
    });
    expect(s.visite).toEqual({ n: 3, oui: 2, sousConditions: 1 });
  });

  it("n'affiche les colonnes par bâtiment qu'entre 2 et 5 bâtiments", () => {
    const jeu = petitJeu();
    expect(syntheseEnquete({ ...jeu, batiments: ["A"] }).batiments).toEqual([]);
    expect(syntheseEnquete({ ...jeu, batiments: ["A", "B", "C", "D", "E", "F"] }).batiments).toEqual([]);
  });
});
