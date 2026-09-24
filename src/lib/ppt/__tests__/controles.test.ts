import { describe, expect, it } from "vitest";
import { EXEMPLE } from "./exemple";
import { bloquantsRestants, compterSeverites, controlesPlateforme } from "../controles";
import { cloner } from "../import";
import { cleControle } from "../schema";
import type { PpptVerifJson } from "../schema";

const AUJOURDHUI = new Date("2026-09-20");
const codes = (json: PpptVerifJson, fiche = {}) => controlesPlateforme(json, fiche, AUJOURDHUI).map((c) => c.code);

describe("contrôles déterministes de la plateforme", () => {
  const remarques = controlesPlateforme(EXEMPLE, {}, AUJOURDHUI);

  it("C01 : total annoncé 412 000 € contre 423 000 € de postes → bloquant", () => {
    const c01 = remarques.find((c) => c.code === "C01");
    expect(c01?.severite).toBe("BLOQUANT");
    expect(c01?.attendu).toContain("423");
    expect(c01?.observe).toContain("412");
  });

  it("P03 : la VMC non chiffrée est signalée sur son poste", () => {
    const p03 = remarques.filter((c) => c.code === "P03");
    expect(p03).toHaveLength(1);
    expect(p03[0].poste_code).toBe("T03");
  });

  it("C12 : gain annoncé additionné brut (59 %) contre gain composé", () => {
    const c12 = remarques.find((c) => c.code === "C12" && c.libelle === "Gain énergétique total");
    expect(c12).toBeDefined();
    expect(c12?.constat).toContain("additionne");
  });

  it("P24 : fonds travaux non renseigné quand la fiche est vide, P22 quand la cotisation est trop faible", () => {
    expect(remarques.some((c) => c.code === "P24")).toBe(true);
    const avecFonds = codes(EXEMPLE, { fonds_travaux_cotisation_annuelle: 2000, fonds_travaux_solde: 15000 });
    expect(avecFonds).not.toContain("P24");
    expect(avecFonds).toContain("P22"); // 2,5 % de 423 000 = 10 575 € > 2 000 €
    expect(avecFonds).toContain("P23"); // 15 000 € pour 217 000 € en 2027
  });

  it("ne lève ni P11, ni P12, ni C06, ni R06 / R08 sur un dossier cohérent", () => {
    const c = codes(EXEMPLE, { nb_lots: 13, nb_logements: 11 });
    expect(c).not.toContain("P11");
    expect(c).not.toContain("P12");
    expect(c).not.toContain("C06");
    expect(c).not.toContain("R06");
    expect(c).not.toContain("R08");
  });

  it("P11 : lots du PPPT différents de la fiche ou du DPE", () => {
    expect(codes(EXEMPLE, { nb_lots: 15 })).toContain("P11");
    const j = cloner(EXEMPLE);
    j.diagnostics_sources.dpe_collectif.nb_lots = 12;
    expect(codes(j)).toContain("P11");
  });

  it("P12 bloquant : plus de logements que de lots", () => {
    const j = cloner(EXEMPLE);
    j.copropriete.nb_logements = 14;
    const r = controlesPlateforme(j, {}, AUJOURDHUI).find((c) => c.code === "P12");
    expect(r?.severite).toBe("BLOQUANT");
  });

  it("C06 : poste hors de la fenêtre de 10 ans", () => {
    const j = cloner(EXEMPLE);
    j.travaux_normalises[7].annee_prevue = 2040;
    expect(codes(j)).toContain("C06");
  });

  it("P08 : poste programmé dans le passé", () => {
    const j = cloner(EXEMPLE);
    j.travaux_normalises[3].annee_prevue = 2025;
    expect(codes(j)).toContain("P08");
  });

  it("C13 : étiquette incohérente avec le Cep (initial et visé)", () => {
    const j = cloner(EXEMPLE);
    j.diagnostics_sources.dpe_collectif.etiquette_energie = "C"; // Cep 289 = E
    j.performance_energetique.cep_apres_kwhep_m2_an = 300; // visé C mais Cep 300 = E
    const r = controlesPlateforme(j, {}, AUJOURDHUI).filter((c) => c.code === "C13");
    expect(r).toHaveLength(2);
  });

  it("P16 bloquant : étiquette visée pire que l'actuelle", () => {
    const j = cloner(EXEMPLE);
    j.performance_energetique.etiquette_visee = "F";
    j.performance_energetique.cep_apres_kwhep_m2_an = 400;
    const r = controlesPlateforme(j, {}, AUJOURDHUI).find((c) => c.code === "P16");
    expect(r?.severite).toBe("BLOQUANT");
  });

  it("C03 / P20 : TVA incompatible avec la nature du poste, taux inconnu", () => {
    const j = cloner(EXEMPLE);
    j.travaux_normalises[5].tva_pct = 10; // menuiseries à 10 % → 5,5 % attendu
    j.travaux_normalises[6].tva_pct = 7; // taux inexistant
    const r = controlesPlateforme(j, {}, AUJOURDHUI);
    expect(r.some((c) => c.code === "C03" && c.poste_code === "T06")).toBe(true);
    expect(r.some((c) => c.code === "P20" && c.poste_code === "T07" && c.severite === "BLOQUANT")).toBe(true);
  });

  it("C11 : ravalement seul programmé avant l'ITE, isolation après le générateur", () => {
    const j = cloner(EXEMPLE);
    j.travaux_source.push({ ...j.travaux_source[6], id: "T09", libelle_source: "Ravalement simple bât. B", ouvrage: "Façades", annee_source: 2027, cout_source_eur: 30000 });
    j.travaux_normalises.push({ ...j.travaux_normalises[6], id: "T09", libelle: "Façade / Ravalement simple bât. B", ouvrage: "Façades", priorite: "Préservation", annee_prevue: 2027, cout_ht_base_eur: 30000, avec_moe: true });
    j.travaux_normalises[0].annee_prevue = 2029; // ITE repoussée après le ravalement
    j.travaux_normalises[4].annee_prevue = 2027; // chaudière avant l'isolation
    const r = controlesPlateforme(j, {}, AUJOURDHUI).filter((c) => c.code === "C11");
    expect(r.some((c) => c.libelle === "Ravalement avant ITE")).toBe(true);
    expect(r.some((c) => c.constat?.includes("Isolation avant le changement de générateur"))).toBe(true);
  });

  it("C15 / C09 : ouvrage en mauvais état sans poste ou traité trop tard", () => {
    const j = cloner(EXEMPLE);
    j.etat_des_lieux.push({ ouvrage: "Garde-corps", detail: null, etat: "Mauvais", pathologies: "corrosion", page: 17 });
    j.travaux_normalises[3].annee_prevue = 2031; // colonnes EU en mauvais état repoussées
    const r = controlesPlateforme(j, {}, AUJOURDHUI);
    expect(r.some((c) => c.code === "C15" && c.constat?.includes("Garde-corps"))).toBe(true);
    expect(r.some((c) => c.code === "C09" && c.poste_code === "T04")).toBe(true);
  });

  it("C04 : ordre de grandeur - ascenseur à 300 k€ → majeur (× 5), jamais bloquant", () => {
    const j = cloner(EXEMPLE);
    j.travaux_source.push({ ...j.travaux_source[6], id: "T10", libelle_source: "Remplacement ascenseur", ouvrage: "Ascenseur", cout_source_eur: 300000 });
    j.travaux_normalises.push({ ...j.travaux_normalises[6], id: "T10", libelle: "Ascenseur / Remplacement", ouvrage: "Ascenseur", priorite: "Préservation", cout_ht_base_eur: 300000, avec_moe: true });
    const r = controlesPlateforme(j, {}, AUJOURDHUI).find((c) => c.code === "C04" && c.poste_code === "T10");
    expect(r?.severite).toBe("MAJEUR"); // vraisemblance, pas manquement : ne bloque pas la validation
    expect(r?.constat).toContain("× 5");
  });

  it("C04 : « hors ITE » ne rapproche pas le poste de la fourchette ITE", () => {
    const j = cloner(EXEMPLE);
    j.travaux_source.push({ ...j.travaux_source[0], id: "T11", libelle_source: "Reprises en façades hors ITE", ouvrage: "Façades", cout_source_eur: 12000 });
    j.travaux_normalises.push({ ...j.travaux_normalises[0], id: "T11", libelle: "Façades / Reprises ponctuelles hors ITE", ouvrage: "Façades", cout_ht_base_eur: 12000 });
    expect(controlesPlateforme(j, {}, AUJOURDHUI).some((c) => c.code === "C04" && c.poste_code === "T11")).toBe(false);
  });

  it("R06 / R08 : plan sans préservation ou sans énergie", () => {
    const j = cloner(EXEMPLE);
    j.travaux_normalises = j.travaux_normalises.filter((t) => t.priorite === "Énergétique");
    expect(codes(j)).toContain("R06");
    const k = cloner(EXEMPLE);
    k.travaux_normalises = k.travaux_normalises.filter((t) => t.priorite !== "Énergétique");
    expect(codes(k)).toContain("R08");
  });

  it("P10 : DPE absent ou périmé", () => {
    const j = cloner(EXEMPLE);
    j.diagnostics_sources.dpe_collectif.present = false;
    expect(codes(j)).toContain("P10");
    const k = cloner(EXEMPLE);
    k.diagnostics_sources.dpe_collectif.date = "2012-05-01";
    expect(controlesPlateforme(k, {}, AUJOURDHUI).some((c) => c.code === "P10" && c.libelle.includes("périmé"))).toBe(true);
  });

  it("bloquants restants : C01 (plateforme) + R10 (skill), levables par code", () => {
    const json = { ...EXEMPLE, remarques_plateforme: remarques };
    expect(bloquantsRestants(json).map((c) => c.code).sort()).toEqual(["C01", "R10"]);
    expect(bloquantsRestants(json, ["C01", "R10"])).toHaveLength(0);
  });

  it("deux bloquants de même code se lèvent un par un", () => {
    const jumeau = (poste: string) => ({ ...remarques.find((c) => c.code === "C01")!, poste_code: poste, libelle: "Ordre de grandeur - ITE", code: "C04" });
    const json = { ...EXEMPLE, controles: [], remarques_plateforme: [jumeau("T01"), jumeau("T02")] };
    expect(bloquantsRestants(json)).toHaveLength(2);
    expect(bloquantsRestants(json, [cleControle(jumeau("T01"))]).map((c) => c.poste_code)).toEqual(["T02"]);
    expect(bloquantsRestants(json, [cleControle(jumeau("T01")), cleControle(jumeau("T02"))])).toHaveLength(0);
  });

  it("compte les sévérités des seuls contrôles non conformes ou partiels", () => {
    const n = compterSeverites(EXEMPLE.controles);
    expect(n.BLOQUANT).toBe(1);
    expect(n.MINEUR).toBe(1);
    expect(n.MAJEUR).toBe(0);
  });

  it("C15 : doublon = même ouvrage, bâtiment et année ET libellés proches", () => {
    const j = cloner(EXEMPLE);
    j.travaux_source.push({ ...j.travaux_source[1], id: "T09", libelle_source: "Réfection complète de la couverture" });
    j.travaux_normalises.push({ ...j.travaux_normalises[1], id: "T09", libelle: "Toiture / Réfection complète de la couverture" });
    j.travaux_source.push({ ...j.travaux_source[1], id: "T10", libelle_source: "Démoussage" });
    j.travaux_normalises.push({ ...j.travaux_normalises[1], id: "T10", libelle: "Toiture / Démoussage des tuiles" });
    const c15 = controlesPlateforme(j, {}, AUJOURDHUI).filter((c) => c.code === "C15" && c.libelle === "Doublon possible");
    expect(c15).toHaveLength(1);
    expect(c15[0].constat).toContain("Réfection complète");
    expect(c15[0].constat).not.toContain("Démoussage");
  });

  it("C04 : pas de comparaison sous 5 000 € HT ni sur un regroupement ; l'ouvrage choisit la famille", () => {
    const j = cloner(EXEMPLE);
    j.travaux_source.push({ ...j.travaux_source[6], id: "T10", libelle_source: "Reprise main courante ascenseur", ouvrage: "Ascenseur", cout_source_eur: 900 });
    j.travaux_normalises.push({ ...j.travaux_normalises[6], id: "T10", libelle: "Reprise main courante ascenseur", ouvrage: "Ascenseur", priorite: "Préservation", cout_ht_base_eur: 900 });
    // balcons classés Façades : l'étanchéité ne les rapproche pas d'une toiture
    j.travaux_source.push({ ...j.travaux_source[0], id: "T11", libelle_source: "Étanchéité des balcons", ouvrage: "Façades", cout_source_eur: 300000 });
    j.travaux_normalises.push({ ...j.travaux_normalises[1], id: "T11", libelle: "Reprise de l'étanchéité des balcons", ouvrage: "Façades", cout_ht_base_eur: 300000 });
    const c04 = controlesPlateforme(j, {}, AUJOURDHUI).filter((c) => c.code === "C04");
    expect(c04.some((c) => c.poste_code === "T10")).toBe(false);
    expect(c04.some((c) => c.poste_code === "T11")).toBe(false);
  });

  it("C01 / C05 : un poste exclu ne compte pas, les périodes se joignent sur periode_source", () => {
    const j = cloner(EXEMPLE);
    j.travaux_source[1].retenu_dans_ppt = false; // couverture 48 000 € exclue
    j.echeancier_source.total_annonce_eur = 375000; // 423 000 - 48 000
    j.echeancier_source.totaux_par_annee_annonces = { "2027": 217000, "0 à 1 an": 96000 };
    j.travaux_source[5].periode_source = "0-1 an"; // menuiseries 96 000 €
    const codes = controlesPlateforme(j, {}, AUJOURDHUI).map((c) => c.code);
    expect(codes).not.toContain("C01");
    expect(codes).not.toContain("C05");
  });

  it("une proposition acceptée sur la ligne et le contrôle lié (controle_lie) transforme l'alerte en info", () => {
    const j = cloner(EXEMPLE);
    j.travaux_normalises[5].tva_pct = 10; // menuiseries à 10 % → C03
    j.propositions.push({ code: "P09", theme: "TVA menuiseries", decision: "Garder 10 %", valeur_source: null, valeur_proposee: "TVA 10 %", impact: "", alternative: null, appliquee_dans_ppt: true, lignes_concernees: ["T06"], controle_lie: "C03", statut_validation: "VALIDEE", commentaire_validateur: null, date_validation: "2026-09-20" });
    const c03 = controlesPlateforme(j, {}, AUJOURDHUI).find((c) => c.code === "C03" && c.poste_code === "T06");
    expect(c03).toMatchObject({ severite: "INFO", statut: "CONFORME" });
    expect(c03?.constat).toContain("Choix validé par l'AMO le 20/09/2026 (P09");
    j.propositions[3].statut_validation = "A_VALIDER";
    expect(controlesPlateforme(j, {}, AUJOURDHUI).find((c) => c.code === "C03" && c.poste_code === "T06")?.severite).toBe("MAJEUR");
  });
});
