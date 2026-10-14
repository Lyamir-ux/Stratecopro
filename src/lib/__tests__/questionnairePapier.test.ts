import { describe, expect, it } from "vitest";
import { CATALOGUE, defaultConfig, type ConfigItem } from "@/lib/enqueteCatalogue";
import { questionnairePapier, type QuestionnairePapier } from "@/lib/questionnairePapier";

const ids = (qn: QuestionnairePapier) => [...qn.copro, ...qn.logement].flatMap((s) => s.questions.map((x) => x.q.id));
const question = (qn: QuestionnairePapier, id: string) =>
  [...qn.copro, ...qn.logement].flatMap((s) => s.questions).find((x) => x.q.id === id);
const sans = (config: ConfigItem[], ...retirees: string[]) => config.map((it) => (retirees.includes(it.id) ? { ...it, on: false } : it));

describe("questionnairePapier", () => {
  const defaut = questionnairePapier(defaultConfig());

  it("numérote les questions à la suite, copropriétaire puis logement", () => {
    const numeros = [...defaut.copro, ...defaut.logement].flatMap((s) => s.questions.map((x) => x.numero));
    expect(numeros).toEqual(numeros.map((_, i) => i + 1));
    expect(defaut.nbQuestions).toBe(numeros.length);
    expect(defaut.copro.map((s) => s.id)).toEqual(["identite", "situation"]);
    expect(defaut.logement.map((s) => s.id)).toEqual(["lot", "technique", "confort"]);
  });

  it("ne reprend que les questions activées (les questions socle restent)", () => {
    const retenues = ids(defaut);
    for (const q of CATALOGUE) {
      if (q.locked && q.id !== "usage-lot" && q.id !== "lot-parent") expect(retenues).toContain(q.id);
      if (!q.defaultOn) expect(retenues).not.toContain(q.id);
    }
  });

  it("n'imprime ni l'usage du lot ni le lot parent : seuls les logements sont enquêtés", () => {
    const retenues = ids(defaut);
    expect(retenues).not.toContain("usage-lot");
    expect(retenues).not.toContain("lot-parent");
    // question réservée aux commerces : jamais posée sur un logement
    expect(retenues).not.toContain("associes-exploitants");
    // la condition « usage = Habitation » est implicite : elle n'est pas affichée
    expect(question(defaut, "type-occupation")?.condition).toBe("");
  });

  it("écrit la condition d'affichage avec le numéro de la question référencée", () => {
    const type = question(defaut, "type-coproprietaire")!;
    const indivisaires = question(defaut, "nb-indivisaires")!;
    expect(indivisaires.condition).toBe(`question ${type.numero} = « Indivision »`);

    // plusieurs conditions : « et » ; une valeur numérique n'est pas entre guillemets
    const rfr = question(defaut, "rfr-foyer")!;
    expect(question(defaut, "rfr-zero-motif")?.condition).toContain(`question ${rfr.numero} = 0`);
    const occupation = question(defaut, "type-occupation")!;
    const location = question(defaut, "mode-location")!;
    expect(question(defaut, "locataire-nom")?.condition).toBe(
      `question ${occupation.numero} = « Propriétaire bailleur (logement loué) » et question ${location.numero} = « Loué à l'année (résidence principale du locataire) »`
    );
  });

  it("une question conditionnée par une question désactivée disparaît, sauf condition « remplie par défaut »", () => {
    const config = sans(defaultConfig(), "curatelle-tutelle", "emetteurs-chauffage");
    const qn = questionnairePapier(config);
    // condition stricte : jamais posée au portail, donc pas imprimée
    expect(ids(qn)).not.toContain("curatelle-tutelle");
    expect(ids(qn)).not.toContain("coordonnees-representant");
    // condition remplie tant que la référence n'a pas de réponse : la question reste, sans condition affichée
    expect(question(qn, "nb-radiateurs")?.condition).toBe("");
  });

  it("ajoute les questions de l'AMO en fin de partie copropriétaire, et ignore celles sans texte ou désactivées", () => {
    const config: ConfigItem[] = [
      ...defaultConfig(),
      { id: "custom-1", on: true, custom: true, q: "Avez-vous un véhicule électrique ?" },
      { id: "custom-2", on: true, custom: true, q: "   " },
      { id: "custom-3", on: false, custom: true, q: "Question éteinte" },
    ];
    const qn = questionnairePapier(config);
    const derniere = qn.copro[qn.copro.length - 1];
    expect(derniere.id).toBe("amo");
    expect(derniere.questions.map((x) => x.q.q)).toEqual(["Avez-vous un véhicule électrique ?"]);
    // la numérotation du logement continue après les questions de l'AMO
    expect(qn.logement[0].questions[0].numero).toBe(derniere.questions[0].numero + 1);
  });

  it("une question de l'AMO en Oui / Non s'imprime en choix unique, sans lignes de texte", () => {
    const qn = questionnairePapier([
      ...defaultConfig(),
      { id: "custom-1", on: true, custom: true, q: "Souhaitez-vous remplacer vos fenêtres ?", format: "oui-non" },
    ]);
    const q = question(qn, "custom-1")!.q;
    expect(q.type).toBe("choix");
    expect(q.options).toEqual(["Oui", "Non"]);
  });

  it("une section dont toutes les questions sont désactivées n'est pas imprimée", () => {
    const qn = questionnairePapier(sans(defaultConfig(), ...CATALOGUE.filter((q) => q.section === "technique").map((q) => q.id)));
    expect(qn.logement.map((s) => s.id)).not.toContain("technique");
  });
});
