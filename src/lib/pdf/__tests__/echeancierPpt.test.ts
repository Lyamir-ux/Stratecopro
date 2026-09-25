import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import {
  blocsAnnees,
  genererEcheancierPdf,
  genererEcheancierPortefeuillePdf,
  genererPortefeuillePptPdf,
  marqueurMontant,
  montantRetenu,
  regrouperGestionnairesPpt,
  type LignePortefeuillePptPdf,
  type PosteEcheancierPdf,
} from "../echeancierPpt";
import { parametresDepuisOrg, PARAMETRES_ORG_DEFAUT } from "@/lib/ppt/formules";

const params = parametresDepuisOrg(PARAMETRES_ORG_DEFAUT, 2026, 245);

const poste = (o: Partial<PosteEcheancierPdf> & { id: string; libelle: string }): PosteEcheancierPdf => ({
  cout_ht_base: 100000,
  tva_pct: null,
  avec_moe: true,
  annee_prevue: 2027,
  annee_prochaine_presentation: null,
  gain_energetique_pct: null,
  priorite: "preservation",
  statut: "programme",
  montant_vote: null,
  montant_syndic: null,
  commentaire_syndic: null,
  origine: "rapport",
  position: 0,
  ...o,
});

const postes: PosteEcheancierPdf[] = [
  poste({ id: "a", libelle: "Façade / Ravalement + ITE", cout_ht_base: 172000, priorite: "energetique", gain_energetique_pct: 22, annee_prevue: 2027, position: 1 }),
  poste({ id: "b", libelle: "Ventilation / VMC hygro B", cout_ht_base: 38000, priorite: "energetique", gain_energetique_pct: 6, annee_prevue: 2027, annee_prochaine_presentation: 2028, montant_syndic: 48000, commentaire_syndic: "Devis Aéraulix reçu le 12/09, périmètre élargi aux caves", position: 2 }),
  poste({ id: "c", libelle: "Réseaux / Colonnes EU", cout_ht_base: 26000, statut: "vote", montant_vote: 31200, position: 3 }),
  poste({ id: "d", libelle: "Toiture / Réfection complète de la couverture et des ouvrages de zinguerie", cout_ht_base: 95000, annee_prevue: 2028, annee_prochaine_presentation: 2029, statut: "reporte", position: 4 }),
  poste({ id: "e", libelle: "Chauffage / Chaudière THPE", cout_ht_base: 61000, priorite: "energetique", gain_energetique_pct: 12, annee_prevue: 2029, position: 5 }),
  poste({ id: "f", libelle: "Menuiseries / Remplacement", cout_ht_base: 88000, priorite: "energetique", gain_energetique_pct: 9, annee_prevue: 2030, position: 6 }),
  poste({ id: "g", libelle: "Ascenseur / Mise aux normes", cout_ht_base: null, annee_prevue: 2032, origine: "syndic", montant_syndic: 35000, commentaire_syndic: "Rapport de contrôle quinquennal", position: 7 }),
  poste({ id: "h", libelle: "Parties communes / Peintures", cout_ht_base: 12000, annee_prevue: null, position: 8 }),
  poste({ id: "i", libelle: "Étanchéité terrasse", cout_ht_base: 40000, annee_prevue: 2039, position: 9 }),
];

describe("montantRetenu / marqueurMontant", () => {
  it("voté > saisi > calculé", () => {
    expect(montantRetenu(postes[2], params)).toBe(31200);
    expect(marqueurMontant(postes[2])).toBe(" (v)");
    expect(montantRetenu(postes[1], params)).toBe(48000);
    expect(marqueurMontant(postes[1])).toBe(" (s)");
    expect(montantRetenu(postes[0], params)).toBeGreaterThan(172000);
    expect(marqueurMontant(postes[0])).toBe("");
    expect(montantRetenu(postes[7], params)).toBeNull();
  });
});

describe("blocsAnnees", () => {
  it("découpe en blocs équilibrés de 12 au plus", () => {
    const annees = Array.from({ length: 15 }, (_, i) => 2026 + i);
    expect(blocsAnnees(annees).map((b) => b.length)).toEqual([8, 7]);
    expect(blocsAnnees(annees.slice(0, 11)).map((b) => b.length)).toEqual([11]);
    expect(blocsAnnees(Array.from({ length: 25 }, (_, i) => 2026 + i)).map((b) => b.length)).toEqual([9, 9, 7]);
    expect(blocsAnnees([])).toEqual([]);
  });
});

describe("genererEcheancierPdf", () => {
  it("produit un PDF paysage lisible, sur plusieurs pages si besoin", async () => {
    const bytes = await genererEcheancierPdf({
      copro: { nom: "Résidence Les Tilleuls (démo PPT)", adresse: "4 rue des Tilleuls", code_postal: "67000", commune: "Strasbourg", nb_logements: 11, nb_lots: 13, etiquette_energie: "E", cep_kwhep_m2_an: 245, gestionnaire_nom: "Thomas Keller" },
      nomEnseigne: "Syndic Horizon Grand Est",
      postes,
      params,
      annee: 2026,
      genereLe: "20 septembre 2026",
      logoPng: readFileSync("public/logo-strateco-pro-white.png"),
    });
    expect(bytes.byteLength).toBeGreaterThan(5000);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
    expect(doc.getTitle()).toContain("Tilleuls");
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);
  });

  it("supporte un plan vide", async () => {
    const bytes = await genererEcheancierPdf({ copro: { nom: "Vide" }, postes: [], params, annee: 2026, genereLe: "20 septembre 2026" });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

describe("genererEcheancierPortefeuillePdf", () => {
  it("produit la grille copro × année avec totaux", async () => {
    const annees = Array.from({ length: 11 }, (_, i) => 2026 + i);
    const lignes = [
      { nom: "Résidence Les Tilleuls (démo PPT)", gestionnaire_nom: "Thomas Keller", commune: "Strasbourg", nb_logements: 11, parAnnee: new Map([[2027, 235000], [2028, 48000], [2029, 203000]]), total: 486000 },
      { nom: "Le Bayard", gestionnaire_nom: "Hélène Marchal", commune: "Strasbourg", nb_logements: 46, parAnnee: new Map([[2026, 120000], [2030, 410000], [2036, 90000]]), total: 620000 },
      { nom: "Parc des Cigognes", gestionnaire_nom: "Thomas Keller", nb_logements: 24, parAnnee: new Map([[2031, 75000]]), total: 75000 },
    ];
    const bytes = await genererEcheancierPortefeuillePdf({ nomEnseigne: "Syndic Horizon Grand Est", lignes, annees, params, annee: 2026, genereLe: "20 septembre 2026", logoPng: readFileSync("public/logo-strateco-pro-white.png") });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toContain("portefeuille");
    if (process.env.PDF_OUT_PF) writeFileSync(process.env.PDF_OUT_PF, bytes);
  });
  it("supporte un portefeuille vide", async () => {
    const bytes = await genererEcheancierPortefeuillePdf({ lignes: [], annees: [2026, 2027], params, annee: 2026, genereLe: "20 septembre 2026" });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

describe("genererPortefeuillePptPdf (portefeuille complet, feedback 24/09/2026)", () => {
  const annees = Array.from({ length: 11 }, (_, i) => 2026 + i);
  const ligne = (o: Partial<LignePortefeuillePptPdf> & { nom: string }): LignePortefeuillePptPdf => ({
    commune: "Strasbourg",
    gestionnaire: "Thomas Keller",
    etat: "a_presenter",
    etatLibelle: "PPPT à présenter",
    dpe: "D",
    logements: 20,
    postes: 0,
    montantTtc: 0,
    honorairesPotentiels: 0,
    honorairesAcquis: 0,
    prochaineAnnee: null,
    montantProchaineAnnee: 0,
    alertes: 0,
    alerteHaute: false,
    parAnnee: new Map(),
    totalEcheancier: 0,
    ...o,
  });
  const lignes = [
    ligne({ nom: "Résidence Les Tilleuls (démo PPT)", etat: "vote", etatLibelle: "Travaux votés", logements: 11, postes: 6, montantTtc: 486000, honorairesPotentiels: 9800, honorairesAcquis: 4600, prochaineAnnee: 2028, montantProchaineAnnee: 48000, alertes: 2, alerteHaute: true, parAnnee: new Map([[2027, 235000], [2028, 48000], [2029, 203000]]), totalEcheancier: 486000 }),
    ligne({ nom: "Le Bayard", gestionnaire: "Hélène Marchal", etat: "presente", etatLibelle: "Présenté en AG", logements: 46, postes: 9, montantTtc: 620000, honorairesPotentiels: 18600, prochaineAnnee: 2026, montantProchaineAnnee: 120000, alertes: 1, parAnnee: new Map([[2026, 120000], [2030, 410000], [2036, 90000]]), totalEcheancier: 620000 }),
    ligne({ nom: "Parc des Cigognes", etat: "reno", etatLibelle: "En rénovation · Études", logements: 24 }),
    ligne({ nom: "Les Érables", gestionnaire: null, etat: "inconnu", etatLibelle: "À qualifier", dpe: null, logements: null }),
  ];

  it("regroupe par gestionnaire, non attribués en dernier", () => {
    const g = regrouperGestionnairesPpt(lignes);
    expect(g.map((x) => x.nom)).toEqual(["Hélène Marchal", "Thomas Keller", "Non attribué"]);
    expect(g[1]).toMatchObject({ copros: 2, logements: 35, montantTtc: 486000, honoraires: 14400 });
    expect(g[1].parEtat).toMatchObject({ vote: 1, reno: 1 });
  });

  it("produit le PDF direction : synthèse, gestionnaires, copropriétés, échéancier, honoraires, alertes", async () => {
    const bytes = await genererPortefeuillePptPdf({
      nomEnseigne: "SYNDIC 3000 GRAND EST",
      direction: true,
      lignes,
      honoraires: annees.map((a) => ({ annee: a, nbPostes: a === 2027 ? 3 : 0, montantTtc: a === 2027 ? 235000 : 0, acquis: a === 2027 ? 4600 : 0, potentiel: a === 2027 ? 2400 : 0 })),
      tauxHonorairesPct: 3,
      alertes: [
        { copro: "Résidence Les Tilleuls (démo PPT)", libelle: "Poste voté sans date de réalisation", niveau: "haute" },
        { copro: "Le Bayard", libelle: "Aucune AG programmée cette année", niveau: "moyenne" },
      ],
      annees,
      params,
      annee: 2026,
      genereLe: "25 septembre 2026",
      logoPng: readFileSync("public/logo-strateco-pro-white.png"),
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe("Portefeuille PPT - SYNDIC 3000 GRAND EST");
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    if (process.env.PDF_OUT_PPT) writeFileSync(process.env.PDF_OUT_PPT, bytes);
  });

  it("produit le PDF d'un gestionnaire, avec ce qu'il doit préparer, et un portefeuille vide", async () => {
    const gest = await genererPortefeuillePptPdf({
      direction: false,
      filtre: "recherche « tilleuls »",
      lignes: lignes.slice(0, 1),
      aPreparer: [{ copro: "Résidence Les Tilleuls (démo PPT)", prochaineAg: "2026-11-18", postes: ["Ventilation / VMC · 2027 · 38 000 € HT · art. 24 suggéré"], aRepresenter: ["Toiture (reporté, nouvelle présentation 2027)"] }],
      alertes: [],
      annees,
      params,
      annee: 2026,
      genereLe: "25 septembre 2026",
    });
    expect((await PDFDocument.load(gest)).getPageCount()).toBeGreaterThanOrEqual(1);
    const vide = await genererPortefeuillePptPdf({ direction: true, lignes: [], alertes: [], annees, params, annee: 2026, genereLe: "25 septembre 2026" });
    expect((await PDFDocument.load(vide)).getPageCount()).toBe(1);
  });
});
