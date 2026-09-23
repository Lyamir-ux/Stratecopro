// Fiche État ANAH : le PDF se génère depuis le gabarit Word exporté (3 pages),
// avec ou sans signatures, sans perdre de page ni échouer sur un caractère
// hors police standard.
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { ficheSignee, genFicheEtat, nomFichierFicheEtat } from "../ficheEtat";
import { CASES_FICHE } from "../ficheEtatCoords";
import { CHAMPS_FICHE, CLES_ETIQUETTES } from "@/lib/ficheEtat";

const gabarit = readFileSync("public/modeles/fiche-etat-anah.pdf");

const resolu: Record<string, string> = {
  copro_nom: "RUE DE LA ZORN",
  copro_voie: "12-14-16 Rue de la Zorn",
  copro_cp: "67300",
  copro_commune: "SCHILTIGHEIM",
  epci: "EUROMETROPOLE DE STRASBOURG",
  region: "GRAND EST",
  assurance_mri: "Oui",
  immatriculation: "AB1-234-567",
  npnru: "Non",
  pcs_nom: "Łukasz ŻUREK",
  pcs_adresse: "14 rue de la Zorn, 67300 Schiltigheim",
  pcs_tel: "06 12 34 56 78",
  pcs_email: "president@example.org",
  syndic_nom: "LAFORÊT STRASBOURG",
  syndic_gestionnaire: "BAYSSELIER Clément",
  syndic_adresse: "41 Rue Finkwiller, 67000 Strasbourg",
  syndic_tel: "03 90 22 12 00",
  syndic_email: "syndic.strasbourg@laforet.com",
  nb_batiments: "1",
  nb_lots: "30",
  tantiemes_ccg: "10 000",
  nb_lots_hab: "29",
  pct_lots_hab: "96,67 %",
  tantiemes_hab: "9 947",
  pct_tantiemes_hab: "99,47 %",
  nb_proprietaires: "27",
  nb_po: "15",
  tantiemes_po: "5 145",
  nb_pb: "13",
  tantiemes_pb: "4 802",
  nb_po_modestes: "4",
  nb_po_tres_modestes: "3",
  rc_publie: "Oui",
  type_syndic: "Professionnel",
  nb_membres_cs: "3",
  date_derniere_ag: "12/06/2026",
  pct_presents_ag: "64,5 %",
  structure_chauffage: "Non",
  periode_construction: "1965",
  chaufferie_collective: "Oui",
  chauffage_combustible: "Gaz naturel",
  ecs_collective: "Oui",
  ecs_combustible: "Gaz naturel",
  arrete_insalubrite: "Non",
  arrete_peril: "Non",
  arrete_equipements: "Non",
  injonction_plomb: "Non",
  etiq_bat_E: "1",
  etiq_log_E: "29",
  nb_bat_gain35: "1",
  nb_log_gain35: "29",
  pct_charges_chauffage: "32 %",
  budget_n1: "98 500 €",
  impayes_n1: "4 210,35 €",
  budget_n2: "95 000 €",
  impayes_n2: "5 100 €",
  taux_impayes_8: "Non",
  budget_n3: "92 300 €",
  impayes_n3: "3 980 €",
  dette_fournisseur_n1: "1 250 €",
};

describe("PDF fiche État", () => {
  it("chaque champ de la fiche a sa case dans le gabarit", () => {
    for (const c of CHAMPS_FICHE) expect(CASES_FICHE[c.key], c.key).toBeDefined();
    for (const k of CLES_ETIQUETTES) expect(CASES_FICHE[k], k).toBeDefined();
  });

  it("génère le projet non signé puis la version signée, 3 pages", async () => {
    const projet = await genFicheEtat({ resolu, gabarit, genereLe: "2026-09-23T08:00:00Z" });
    expect((await PDFDocument.load(projet)).getPageCount()).toBe(3);
    const signatures = [
      { role: "president_cs" as const, nom: "Łukasz ŻUREK", signeLe: "2026-09-23T08:30:00Z", empreinte: "a".repeat(64) },
      { role: "syndic" as const, nom: "BAYSSELIER Clément", signeLe: "2026-09-23T09:10:00Z", empreinte: "b".repeat(64) },
    ];
    expect(ficheSignee(signatures)).toBe(true);
    expect(ficheSignee(signatures.slice(0, 1))).toBe(false);
    const signe = await genFicheEtat({ resolu, gabarit, signatures, genereLe: "2026-09-23T09:15:00Z" });
    expect((await PDFDocument.load(signe)).getPageCount()).toBe(3);
    if (process.env.FICHE_ETAT_PDF_OUT) {
      writeFileSync(`${process.env.FICHE_ETAT_PDF_OUT}/fiche-projet.pdf`, projet);
      writeFileSync(`${process.env.FICHE_ETAT_PDF_OUT}/fiche-signee.pdf`, signe);
    }
  });

  it("nom de fichier sans caractère interdit", () => {
    expect(nomFichierFicheEtat("RUE / ZORN", true)).toBe("Fiche Etat ANAH - RUE   ZORN - signee.pdf");
  });
});
