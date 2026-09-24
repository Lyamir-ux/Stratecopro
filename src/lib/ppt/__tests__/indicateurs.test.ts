import { describe, expect, it } from "vitest";
import { PARAMETRES_ORG_DEFAUT } from "../formules";
import {
  aPreparer,
  alertes,
  cleGestionnaire,
  controlerResolutions,
  echeancier,
  etatCopro,
  fichesCopros,
  groupesGestionnaires,
  honorairesParAnnee,
  initiales,
  statsParGestionnaire,
  totauxPortefeuille,
  type AgLite,
  type CoproLite,
  type PosteLite,
  type RapportLite,
} from "../indicateurs";

const AUJOURDHUI = new Date("2026-09-20");
const ORG = "org-1";

const copros: CoproLite[] = [
  { id: "c1", nom: "Les Tilleuls", organisation_id: ORG, gestionnaire_nom: "Eric LEROUX", gestionnaire_email: "eric@exemple.fr", nb_logements: 11, etiquette_energie: "E", date_dpe: "2025-10-20", fonds_travaux_solde: 15000, fonds_travaux_cotisation_annuelle: 2000, created_at: "2026-01-01" },
  { id: "c2", nom: "Le Bayard", organisation_id: ORG, gestionnaire_nom: "Isabelle GEBEL", gestionnaire_email: "isabelle@exemple.fr", nb_logements: 46, etiquette_energie: "D", date_dpe: "2012-03-01", fonds_travaux_solde: null, fonds_travaux_cotisation_annuelle: null, created_at: "2026-02-01" },
  { id: "c3", nom: "Sans gestionnaire", organisation_id: ORG, gestionnaire_nom: null, gestionnaire_email: null, nb_logements: 8, etiquette_energie: null, date_dpe: null, fonds_travaux_solde: null, fonds_travaux_cotisation_annuelle: null, created_at: "2026-03-01" },
];

const poste = (p: Partial<PosteLite> & Pick<PosteLite, "id" | "ppt_copro_id" | "libelle">): PosteLite => ({
  cout_ht_base: 100000,
  tva_pct: 10,
  avec_moe: true,
  annee_prevue: 2027,
  annee_prochaine_presentation: null,
  gain_energetique_pct: null,
  priorite: "preservation",
  statut: "programme",
  montant_vote: null,
  actif: true,
  ...p,
});

const postes: PosteLite[] = [
  poste({ id: "p1", ppt_copro_id: "c1", libelle: "Ravalement + ITE", priorite: "energetique", tva_pct: 5.5, avec_moe: false, cout_ht_base: 186000, gain_energetique_pct: 25 }),
  poste({ id: "p2", ppt_copro_id: "c1", libelle: "Toiture", annee_prevue: 2026, statut: "rejete", annee_prochaine_presentation: 2027, cout_ht_base: 48000 }),
  poste({ id: "p3", ppt_copro_id: "c1", libelle: "Colonnes EU", statut: "vote", montant_vote: 40000, cout_ht_base: 31000 }),
  poste({ id: "p4", ppt_copro_id: "c2", libelle: "Chaufferie", priorite: "energetique", tva_pct: 5.5, avec_moe: false, annee_prevue: 2029, cout_ht_base: 120000 }),
  poste({ id: "p5", ppt_copro_id: "c2", libelle: "Ancien poste archivé", actif: false }),
  poste({ id: "p6", ppt_copro_id: "c2", libelle: "Reporté sans année", statut: "reporte", annee_prevue: 2026 }),
];

const ags: AgLite[] = [{ id: "a1", ppt_copro_id: "c1", date_ag: "2026-04-10" }];
const rapports: RapportLite[] = [
  { id: "r1", ppt_copro_id: "c1", type: "pppt", statut: "valide", valide_le: "2026-03-01", date_document: "2026-01-15", depose_le: "2026-02-20" },
  { id: "r2", ppt_copro_id: "c2", type: "pppt", statut: "valide", valide_le: "2025-06-01", date_document: "2014-05-01", depose_le: "2025-05-20" },
  { id: "r3", ppt_copro_id: "c3", type: "pppt", statut: "depose", valide_le: null, date_document: null, depose_le: "2026-09-18" },
];

describe("indicateurs des tableaux de bord PPT", () => {
  it("regroupe par e-mail du gestionnaire, à défaut par nom", () => {
    expect(cleGestionnaire(copros[0])).toBe("eric@exemple.fr");
    expect(cleGestionnaire({ gestionnaire_email: null, gestionnaire_nom: "Paul" })).toBe("Paul");
    expect(cleGestionnaire(copros[2])).toBe("__sans__");
  });

  it("honoraires par année : potentiel (non votés) et acquis (votés au montant voté)", () => {
    const h = honorairesParAnnee(postes, PARAMETRES_ORG_DEFAUT, 2026);
    expect(h[0].annee).toBe(2026);
    expect(h).toHaveLength(11);
    const a2027 = h.find((l) => l.annee === 2027)!;
    // p1 : 186 000 × 1,035 × 1,085 × 3 % ; p2 (rejeté → 2027) : 48 000 × 1,035 × 1,19 × 3 % ; p3 voté : 40 000 × 3 %
    expect(a2027.potentiel).toBeCloseTo(186000 * 1.035 * 1.085 * 0.03 + 48000 * 1.035 * 1.19 * 0.03, 1);
    expect(a2027.acquis).toBeCloseTo(1200, 2);
    expect(a2027.nbPostes).toBe(3);
    // le poste archivé et les années sans poste ne comptent pas
    expect(h.find((l) => l.annee === 2028)!.nbPostes).toBe(0);
    // un poste reporté sans année de représentation ressort à son année prévue, ramenée dans l'horizon
    expect(h.find((l) => l.annee === 2026)!.nbPostes).toBe(1);
  });

  it("comparatif par gestionnaire : volumes, taux de passage, non attribué en dernier", () => {
    const s = statsParGestionnaire(copros, postes, PARAMETRES_ORG_DEFAUT, 2026);
    expect(s.map((g) => g.nom)).toEqual(["Eric LEROUX", "Isabelle GEBEL", "Non attribué"]);
    const eric = s[0];
    expect(eric.copros).toBe(1);
    expect(eric.postes).toBe(3);
    expect(eric.presentes).toBe(2); // rejeté + voté
    expect(eric.votes).toBe(1);
    expect(eric.tauxPassage).toBe(50);
    expect(eric.honorairesAcquis).toBeCloseTo(1200, 2);
    const isabelle = s[1];
    expect(isabelle.postes).toBe(2); // le poste archivé est exclu
    expect(isabelle.tauxPassage).toBe(0); // reporté = présenté, jamais voté
    expect(s[2].postes).toBe(0);
    expect(s[2].tauxPassage).toBeNull();
  });

  it("alertes de cycle de vie : PPT jamais présenté, reporté sans année, DPE et PPPT périmés, documents en attente", () => {
    const a = alertes(copros, postes, ags, rapports, AUJOURDHUI);
    const parCopro = (id: string) => a.filter((x) => x.ppt_copro_id === id).map((x) => x.code);
    expect(parCopro("c2")).toContain("P30"); // validé en juin 2025, aucune AG
    expect(parCopro("c2")).toContain("P32"); // p6 reporté sans année
    expect(parCopro("c2")).toContain("P36"); // DPE 2012 et PPPT 2014
    expect(parCopro("c1")).not.toContain("P30"); // une AG a eu lieu
    expect(parCopro("c1")).toContain("P31"); // p1 et p2 attendus en 2027 sans AG à venir
    expect(parCopro("c1")).toContain("P22"); // cotisation 2 000 € < 2,5 % de 265 000 €
    expect(parCopro("c3")).toContain("ATTENTE");
    // les alertes hautes viennent en premier
    expect(a[0].niveau).toBe("haute");
  });

  it("résolutions : article incohérent et écart de montant", () => {
    const r = controlerResolutions(
      [
        { ag_id: "a1", poste_id: "p1", issue: "adopte", article: "24", montant_vote: 190000 },
        { ag_id: "a1", poste_id: "p3", issue: "adopte", article: "24", montant_vote: 45000 },
      ],
      postes
    );
    expect(r.some((x) => x.code === "P33" && x.poste_id === "p1")).toBe(true); // énergétique à l'article 24
    expect(r.some((x) => x.code === "P34" && x.poste_id === "p3")).toBe(true); // 45 000 contre 31 000 HT
    expect(r.some((x) => x.poste_id === "p3" && x.code === "P33")).toBe(false);
  });

  it("à préparer : postes attendus d'ici N+1 et rejetés à représenter, triés par prochaine AG", () => {
    const l = aPreparer(copros, postes, [...ags, { id: "a2", ppt_copro_id: "c2", date_ag: "2027-03-12" }], AUJOURDHUI);
    expect(l.map((x) => x.copro.id)).toEqual(["c2", "c1"]); // c2 a une AG datée, c1 non
    const c1 = l.find((x) => x.copro.id === "c1")!;
    expect(c1.postes.map((p) => p.id)).toEqual(["p1"]);
    expect(c1.aRepresenter.map((p) => p.id)).toEqual(["p2"]);
    expect(c1.prochaineAg).toBeNull();
  });

  it("échéancier : montants TTC par copro et par année, votés au montant voté", () => {
    const e = echeancier(copros, postes, PARAMETRES_ORG_DEFAUT, 2026);
    const c1 = e.find((x) => x.copro.id === "c1")!;
    expect(c1.parAnnee.get(2027)).toBeCloseTo(186000 * 1.035 * 1.085 + 48000 * 1.035 * 1.19 + 40000, 1);
    const c2 = e.find((x) => x.copro.id === "c2")!;
    expect(c2.parAnnee.get(2029)).toBeCloseTo(120000 * Math.pow(1.035, 3) * 1.085, 1);
  });

  it("totaux du portefeuille", () => {
    const t = totauxPortefeuille(copros, postes, rapports, PARAMETRES_ORG_DEFAUT, 2026);
    expect(t.copros).toBe(3);
    expect(t.validees).toBe(2);
    expect(t.enAttente).toBe(1);
    expect(t.logements).toBe(65);
    expect(t.postes).toBe(5);
    expect(t.honorairesAcquis).toBeCloseTo(1200, 2);
    expect(t.honorairesPotentiels).toBeGreaterThan(0);
  });
});

describe("portefeuille PPT : état de suivi, fiches, groupes par gestionnaire", () => {
  it("état de suivi : postes votés > présentés > déclaré présenté > PPT validé à présenter > en analyse > + 15 ans sans PPPT > à qualifier", () => {
    expect(etatCopro(copros[0], postes, rapports)).toBe("vote"); // c1 : un poste voté
    expect(etatCopro(copros[1], postes, rapports)).toBe("presente"); // c2 : un poste reporté
    expect(etatCopro(copros[2], postes, rapports)).toBe("analyse"); // c3 : rapport déposé
    expect(etatCopro({ ...copros[0], reno_phase: "etudes" }, postes, rapports)).toBe("reno"); // la rénovation globale l'emporte
    // PPT validé dont tous les postes sont encore programmés : à présenter
    expect(etatCopro({ ...copros[1], id: "c8" }, [poste({ id: "p9", ppt_copro_id: "c8", libelle: "Toiture" })], [{ ...rapports[1], id: "r8", ppt_copro_id: "c8" }])).toBe("a_presenter");
    // portefeuille importé sans document (0077)
    expect(etatCopro({ ...copros[2], id: "c9", pppt_presente: true }, [], [])).toBe("presente");
    expect(etatCopro({ ...copros[2], id: "c9", plus_de_15_ans: true, pppt_presente: false }, [], [])).toBe("a_presenter");
    expect(etatCopro({ ...copros[2], id: "c9", plus_de_15_ans: false, pppt_presente: false }, [], [])).toBe("inconnu");
    expect(etatCopro({ ...copros[2], id: "c9" }, [], [])).toBe("inconnu");
  });

  it("fiches : montant TTC à venir, honoraires, prochain jalon, alertes", () => {
    const al = alertes(copros, postes, ags, rapports, AUJOURDHUI);
    const fiches = fichesCopros(copros, postes, rapports, al, PARAMETRES_ORG_DEFAUT, 2026);
    const c1 = fiches.find((f) => f.copro.id === "c1")!;
    expect(c1.etat).toBe("vote");
    expect(c1.nbPostes).toBe(3);
    expect(c1.montantTtc).toBeCloseTo(186000 * 1.035 * 1.085 + 48000 * 1.035 * 1.19 + 40000, 1);
    expect(c1.honorairesAcquis).toBeCloseTo(1200, 2);
    expect(c1.honorairesPotentiels).toBeGreaterThan(0);
    expect(c1.prochaineAnnee).toBe(2027);
    // montant du prochain jalon : seuls les postes à voter en 2027 (p1 programmé, p2 rejeté représenté en 2027), pas le poste déjà voté
    expect(c1.montantProchaineAnnee).toBeCloseTo(186000 * 1.035 * 1.085 + 48000 * 1.035 * 1.19, 1);
    expect(c1.montantProchaineAnnee).toBeLessThan(c1.montantTtc);
    const c2 = fiches.find((f) => f.copro.id === "c2")!;
    // c2 : jalon 2026 = le seul poste reporté (p6) ; la chaufferie 2029 n'y figure pas
    expect(c2.montantProchaineAnnee).toBeGreaterThan(0);
    expect(c2.montantProchaineAnnee).toBeLessThan(c2.montantTtc);
    expect(c2.nbPostes).toBe(2); // le poste inactif ne compte pas
    expect(c2.prochaineAnnee).toBe(2026); // poste reporté sans nouvelle année : année prévue
    expect(c2.nbAlertes).toBeGreaterThanOrEqual(3); // P30 validé depuis plus de 12 mois jamais présenté, P32 reporté sans année, P36 PPPT de 2014
    expect(c2.alerteHaute).toBe(true); // P30 est de niveau haut
    const c1b = fiches.find((f) => f.copro.id === "c1")!;
    expect(c1b.alerteHaute).toBe(false);
    const c3 = fiches.find((f) => f.copro.id === "c3")!;
    expect(c3.montantTtc).toBe(0);
    expect(c3.prochaineAnnee).toBeNull();
    expect(c3.montantProchaineAnnee).toBe(0);
  });

  it("groupes par gestionnaire : plus gros parc d'abord, non attribués en dernier, jauge par état", () => {
    const fiches = fichesCopros(copros, postes, rapports, [], PARAMETRES_ORG_DEFAUT, 2026);
    const g = groupesGestionnaires(fiches);
    expect(g.map((x) => x.nom)).toEqual(["Isabelle GEBEL", "Eric LEROUX", "Non attribué"]);
    expect(g.map((x) => x.initiales)).toEqual(["IG", "EL", "-"]);
    expect(g[0].logements).toBe(46);
    expect(g[1].parEtat.vote).toBe(1);
    expect(g[2].parEtat.analyse).toBe(1);
    expect(g[1].honoraires).toBeCloseTo(fiches.find((f) => f.copro.id === "c1")!.honorairesPotentiels + 1200, 2);
    expect(initiales("STOSSWIHR")).toBe("ST");
    expect(initiales("Jean-François ROUSSET")).toBe("JR");
  });
});
