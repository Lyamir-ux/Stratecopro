import { describe, expect, it } from "vitest";
import {
  analyserImport,
  decoderCsv,
  lireCsv,
  lireDate,
  lireMontant,
  reconnaitreColonnes,
  type ContexteImport,
} from "../importCopros";

const slug = (nom: string) =>
  nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const ctx: ContexteImport = {
  slugsPris: new Set(["le-foch"]),
  slug,
  prestataires: ["Ingedair", "CNB.archi"],
  organisations: [{ id: "org-citya", nom: "Citya Immo 4" }],
};

describe("lecture du CSV", () => {
  it("lit le « ; » d'Excel, les guillemets et les retours à la ligne entre guillemets", () => {
    const t = '﻿Copropriété;Adresse\r\n"Les Lilas";"2 rue ""Haute""\r\nBât. A"\r\n;\r\nLe Muguet;3 rue Basse\r\n';
    expect(lireCsv(t)).toEqual([
      ["Copropriété", "Adresse"],
      ["Les Lilas", '2 rue "Haute"\r\nBât. A'],
      ["Le Muguet", "3 rue Basse"],
    ]);
  });

  it("devine la virgule quand la première ligne en compte plus", () => {
    expect(lireCsv("Nom,Ville\nA,Colmar")).toEqual([
      ["Nom", "Ville"],
      ["A", "Colmar"],
    ]);
  });

  it("décode un fichier Windows-1252 enregistré par Excel", () => {
    // « Copropriété » en Windows-1252 : é = 0xE9
    const octets = new Uint8Array([0x43, 0x6f, 0x70, 0x72, 0x6f, 0x70, 0x72, 0x69, 0xe9, 0x74, 0xe9]);
    expect(decoderCsv(octets)).toBe("Copropriété");
    expect(decoderCsv(new TextEncoder().encode("Maître d'œuvre"))).toBe("Maître d'œuvre");
  });
});

describe("valeurs", () => {
  it("lit les montants à la française", () => {
    expect(lireMontant("12 345,67 €")).toBe(12345.67);
    expect(lireMontant("1.234,56")).toBe(1234.56);
    expect(lireMontant("9000")).toBe(9000);
    expect(lireMontant("")).toBeNull();
    expect(lireMontant("neuf mille")).toBeNaN();
  });

  it("lit les dates JJ/MM/AAAA et ISO et refuse les dates impossibles", () => {
    expect(lireDate("01/10/2026")).toBe("2026-10-01");
    expect(lireDate("1/3/26")).toBe("2026-03-01");
    expect(lireDate("2026-10-01")).toBe("2026-10-01");
    expect(lireDate("15.04.2027")).toBe("2027-04-15");
    expect(lireDate("31/02/2026")).toBe("invalide");
    expect(lireDate("octobre")).toBe("invalide");
    expect(lireDate(" ")).toBeNull();
  });
});

describe("analyse de l'import", () => {
  it("reconnaît les colonnes de l'export du tableau de bord et ignore les autres", () => {
    expect(
      reconnaitreColonnes(["Copropriété", "Phase", "DPE avant", "Montant TTC", "Maître d'œuvre", "Date d'AG", "Honoraires P1 HT", "P2"])
    ).toEqual(["name", "phase", "energy_before", null, "maitre_oeuvre", "date_ag", "honoraires_p1_ht", "honoraires_p2_ht"]);
  });

  it("prépare les dossiers et signale chaque erreur à sa ligne", () => {
    const a = analyserImport(
      [
        ["Copropriété", "Ville", "Phase", "DPE avant", "Fragile", "Maître d'œuvre", "Date d'AG", "Honoraires P1 HT", "Honoraires P2 HT", "Organisation", "Lots"],
        ["Les Lilas", "Colmar", "Études", "e", "Oui", "ingedair", "01/10/2026", "9 000", "12 000,50", "citya immo 4", "12"],
        ["Le Foch", "", "", "", "", "", "", "", "", "", ""],
        ["", "Sélestat", "", "", "", "", "", "", "", "", ""],
        ["Les Pins", "", "Chantier", "H", "peut-être", "", "30/02/2026", "beaucoup", "", "", ""],
        ["Les Érables", "", "", "", "", "Atelier Neuf", "", "", "", "Syndic bénévole", ""],
        ["Les erables", "", "", "", "", "", "", "", "", "", ""],
        ["Le Cèdre", "", "travaux", "", "", "atelier neuf", "", "", "", "Foncia Nouvelle", ""],
      ],
      ctx
    );
    expect(a.ignorees).toEqual(["Lots"]);
    const [lilas, foch, sansNom, pins, erables, erables2, cedre] = a.lignes;

    expect(lilas.erreurs).toEqual([]);
    expect(lilas.input).toMatchObject({
      name: "Les Lilas",
      city: "Colmar",
      phase: "etudes",
      energy_before: "E",
      fragile: true,
      nb_batiments: 1,
      maitre_oeuvre: { mode: "existant", nom: "Ingedair" },
      date_ag: "2026-10-01",
      honoraires_p1_ht: 9000,
      honoraires_p2_ht: 12000.5,
      organisation: { mode: "existante", id: "org-citya" },
    });
    expect(lilas.moeNouveau).toBeNull();

    expect(foch.input).toBeNull();
    expect(foch.erreurs).toEqual(["un dossier porte déjà ce nom (corbeille comprise)"]);
    expect(sansNom.ligne).toBe(4);
    expect(sansNom.erreurs).toEqual(["nom de la copropriété manquant"]);
    expect(pins.erreurs).toHaveLength(5);

    // nouveau maître d'œuvre : une seule fiche pour deux lignes du même nom
    expect(erables.input).toMatchObject({
      phase: "diagnostic",
      maitre_oeuvre: { mode: "nouveau", nom: "Atelier Neuf" },
      organisation: { mode: "benevole" },
    });
    expect(erables.moeNouveau).toBe("Atelier Neuf");
    expect(erables.organisationNouvelle).toBe("Syndic Bénévole LES ÉRABLES");
    expect(erables2.erreurs).toEqual(["même nom qu'à la ligne 6"]);
    expect(cedre.input?.maitre_oeuvre).toEqual({ mode: "nouveau", nom: "atelier neuf" });
    expect(cedre.moeNouveau).toBeNull();
    expect(cedre.organisationNouvelle).toBe("Foncia Nouvelle");
  });

  it("lit « Pas de MOE » comme un dossier sans maître d'œuvre", () => {
    const a = analyserImport([["Nom", "MOE"], ["A", "Pas de MOE"], ["B", "-"]], ctx);
    expect(a.lignes.map((l) => l.input?.maitre_oeuvre)).toEqual([null, null]);
  });
});
