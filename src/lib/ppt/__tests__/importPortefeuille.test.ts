import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import {
  classerLignes,
  devinerColonnes,
  estPortefeuille,
  lireClasseur,
  lireEntier,
  lireLignes,
  lireOuiNon,
  modeleImport,
  normaliserCle,
  separerAdresse,
  separerCodePostal,
  statutParc,
} from "../importPortefeuille";

describe("devinerColonnes", () => {
  it("reconnaît les six colonnes du brief, dans n'importe quel ordre et libellé", () => {
    expect(devinerColonnes(["Nom de la copropriété", "Adresse", "Commune", "Nombre de logements", "Copropriété de plus de 15 ans ?", "PPPT présenté ?"]))
      .toEqual(["nom", "adresse", "commune", "nb_logements", "plus_de_15_ans", "pppt_presente"]);
    expect(devinerColonnes(["PPPT présenté (oui/non)", "Ville", "Résidence", "Logements", "+15 ans", "Rue"]))
      .toEqual(["pppt_presente", "commune", "nom", "nb_logements", "plus_de_15_ans", "adresse"]);
  });
  it("n'attribue un champ qu'une fois et ignore les colonnes inconnues", () => {
    expect(devinerColonnes(["Nom", "Nom du gestionnaire", "Observations", ""])).toEqual(["nom", "ignorer", "ignorer", "ignorer"]);
  });
  it("estPortefeuille exige le nom et au moins deux autres colonnes", () => {
    expect(estPortefeuille(["Nom", "Adresse", "Commune"])).toBe(true);
    expect(estPortefeuille(["Nom", "Adresse"])).toBe(false);
    expect(estPortefeuille(["Poste", "Année", "Montant HT"])).toBe(false);
  });
});

describe("lecture des cellules", () => {
  it("lit oui / non avec souplesse", () => {
    for (const v of ["oui", "OUI", " Oui ", "x", "vrai", "TRUE", 1, true]) expect(lireOuiNon(v)).toBe(true);
    for (const v of ["non", "N", "faux", "false", 0, false, "-"]) expect(lireOuiNon(v)).toBe(false);
    expect(lireOuiNon(null)).toBeNull();
    expect(lireOuiNon("")).toBeNull();
    expect(lireOuiNon("peut-être")).toBeUndefined();
  });
  it("lit un entier positif", () => {
    expect(lireEntier(48)).toBe(48);
    expect(lireEntier("48")).toBe(48);
    expect(lireEntier(" 1 248 ")).toBe(1248);
    expect(lireEntier("48.0")).toBe(48);
    expect(lireEntier(null)).toBeNull();
    expect(lireEntier("quarante")).toBeUndefined();
    expect(lireEntier(-3)).toBeUndefined();
  });
  it("sépare le code postal de la commune", () => {
    expect(separerCodePostal("67000 Strasbourg")).toEqual({ code_postal: "67000", commune: "Strasbourg" });
    expect(separerCodePostal("Strasbourg (67000)")).toEqual({ code_postal: "67000", commune: "Strasbourg" });
    expect(separerCodePostal("Illkirch-Graffenstaden")).toEqual({ code_postal: null, commune: "Illkirch-Graffenstaden" });
    expect(separerCodePostal("")).toEqual({ code_postal: null, commune: null });
  });
  it("extrait la ville d'une adresse complète", () => {
    expect(separerAdresse("12 rue des Tilleuls, 67000 Strasbourg")).toEqual({ adresse: "12 rue des Tilleuls", code_postal: "67000", commune: "Strasbourg" });
    expect(separerAdresse("11-13-15-17 rue de Dambach")).toEqual({ adresse: "11-13-15-17 rue de Dambach", code_postal: null, commune: null });
  });
});

describe("normaliserCle (miroir de ppt_normaliser)", () => {
  it("ignore accents, casse, ponctuation et le préfixe résidence / copropriété", () => {
    expect(normaliserCle("Résidence Les Tilleuls")).toBe("les tilleuls");
    expect(normaliserCle("  LES-TILLEULS ")).toBe("les tilleuls");
    expect(normaliserCle("Copropriété Le Bayard")).toBe("le bayard");
    expect(normaliserCle("11-13-15-17 rue de Dambach")).toBe("11 13 15 17 rue de dambach");
    expect(normaliserCle(null)).toBe("");
  });
});

describe("lireLignes", () => {
  const corr = devinerColonnes(["Nom", "Adresse", "Commune", "Logements", "Plus de 15 ans", "PPPT présenté"]);
  it("construit les lignes, sépare code postal et commune, écarte les lignes sans nom et les doublons", () => {
    const { lignes, erreurs, doublons } = lireLignes(
      [
        ["Résidence Les Tilleuls", "12 rue des Tilleuls", "67000 Strasbourg", 48, "oui", "non"],
        [null, null, null, null, null, null],
        ["", "3 allée du Parc", "Illkirch", 22, "oui", "oui"],
        ["Le Parc", "3 allée du Parc", "Illkirch", "22", "non", ""],
        ["LES TILLEULS", "ailleurs", "Colmar", 10, "oui", "oui"],
        ["Cité Verte", "1 place Verte, 68000 Colmar", null, "douze", "peut-être", "x"],
      ],
      corr
    );
    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toEqual({ ligne: 1, nom: "Résidence Les Tilleuls", adresse: "12 rue des Tilleuls", code_postal: "67000", commune: "Strasbourg", nb_logements: 48, plus_de_15_ans: true, pppt_presente: false });
    expect(lignes[1]).toMatchObject({ ligne: 4, nom: "Le Parc", commune: "Illkirch", code_postal: null, nb_logements: 22, plus_de_15_ans: false, pppt_presente: null });
    // la ville de l'adresse sert quand la colonne commune est vide ; cellules non comprises vidées et signalées
    expect(lignes[2]).toMatchObject({ ligne: 6, nom: "Cité Verte", adresse: "1 place Verte", code_postal: "68000", commune: "Colmar", nb_logements: null, plus_de_15_ans: null, pppt_presente: true });
    expect(doublons).toEqual(["LES TILLEULS"]);
    expect(erreurs.map((e) => e.ligne)).toEqual([3, 6, 6]);
  });
  it("fonctionne avec le seul nom reconnu", () => {
    const { lignes } = lireLignes([["A"], ["B"]], ["nom"]);
    expect(lignes.map((l) => l.nom)).toEqual(["A", "B"]);
    expect(lignes[0].adresse).toBeNull();
  });
});

describe("lireClasseur", () => {
  it("relit le modèle téléchargeable et saute les lignes de titre", () => {
    const ws = utils.aoa_to_sheet([["Portefeuille de Thomas", null, null, null, null, null], [], ...modeleImport()]);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Parc");
    const buf = write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const lu = lireClasseur(buf);
    expect(lu?.feuille).toBe("Parc");
    expect(devinerColonnes(lu!.entetes)).toEqual(["nom", "adresse", "commune", "nb_logements", "plus_de_15_ans", "pppt_presente"]);
    const { lignes } = lireLignes(lu!.grille, devinerColonnes(lu!.entetes));
    expect(lignes).toHaveLength(2);
    expect(lignes[1]).toMatchObject({ nom: "Le Parc", code_postal: "67400", commune: "Illkirch-Graffenstaden", nb_logements: 22, pppt_presente: true });
  });
  it("lit aussi un CSV à point-virgule", () => {
    const csv = "Nom;Adresse;Commune;Logements;Plus de 15 ans;PPPT présenté\r\nLe Bayard;98 rue de la Ziegelau;67100 Strasbourg;46;oui;non\r\n";
    const lu = lireClasseur(new TextEncoder().encode(csv));
    expect(lu).not.toBeNull();
    const { lignes } = lireLignes(lu!.grille, devinerColonnes(lu!.entetes));
    expect(lignes[0]).toMatchObject({ nom: "Le Bayard", code_postal: "67100", commune: "Strasbourg", nb_logements: 46, plus_de_15_ans: true, pppt_presente: false });
  });
});

describe("classerLignes et statutParc", () => {
  it("distingue les fiches déjà suivies des nouvelles", () => {
    const connues = [{ id: "1", nom: "Les Tilleuls" }];
    const { lignes } = lireLignes([["Résidence Les Tilleuls"], ["Le Parc"]], ["nom"]);
    const r = classerLignes(lignes, connues);
    expect(r.existantes.map((e) => e.copro.id)).toEqual(["1"]);
    expect(r.nouvelles.map((l) => l.nom)).toEqual(["Le Parc"]);
  });
  it("le dossier rapproché prime, puis le PPPT déclaré", () => {
    expect(statutParc({ plus_de_15_ans: true, pppt_presente: false, stats: { reno_phase: "travaux" } })).toBe("en_reno");
    expect(statutParc({ plus_de_15_ans: true, pppt_presente: false, stats: null })).toBe("pppt_a_presenter");
    expect(statutParc({ plus_de_15_ans: false, pppt_presente: false, stats: null })).toBe("inconnu");
    expect(statutParc({ plus_de_15_ans: null, pppt_presente: true, stats: { reno_phase: null } })).toBe("pppt_presente");
  });
});
