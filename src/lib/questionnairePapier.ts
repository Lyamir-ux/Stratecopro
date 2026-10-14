// Questionnaire d'enquête en version papier (idée d'Amir du 14/10/2026 : un bouton
// à côté de « Configurer » pour exporter l'enquête sous forme de page, à renvoyer
// par e-mail ou à déposer chez Strat Eco). Fonction pure : à partir de la
// configuration de l'enquête, la liste des questions à imprimer, numérotées, avec
// leur condition d'affichage en clair (le portail les applique en direct ; sur
// papier, c'est le copropriétaire qui lit « à remplir si… »).
//
// Comme au portail, seuls les logements sont enquêtés : la partie « lots » du
// papier se remplit une fois par logement, sans la question d'usage (un lot
// secondaire n'a aucune question) ni le lot parent.
import { SECTIONS, resolveQuestions, type ConfigItem, type ResolvedQuestion, type SectionId } from "@/lib/enqueteCatalogue";

export const ADRESSE_STRAT_ECO = "27 rue du Vieux Marché aux Vins, 67000 Strasbourg";

export interface QuestionPapier {
  /** Numéro affiché devant la question, continu sur tout le questionnaire. */
  numero: number;
  q: ResolvedQuestion;
  /** Condition en clair (« question 8 = « Indivision » ») ; vide = concerne tout le monde. */
  condition: string;
}

export interface SectionPapier {
  id: SectionId | "amo";
  label: string;
  desc: string;
  questions: QuestionPapier[];
}

export interface QuestionnairePapier {
  /** Questions posées au copropriétaire, puis questions personnalisées de l'AMO. */
  copro: SectionPapier[];
  /** Questions posées pour chaque logement. */
  logement: SectionPapier[];
  nbQuestions: number;
}

const SECTIONS_COPRO: SectionId[] = ["identite", "situation", "avis"];
const SECTIONS_LOGEMENT: SectionId[] = ["lot", "technique", "confort"];

/** Réponse pré-remplie au portail d'après le lot importé : inutile sur papier. */
const QUESTION_USAGE = "usage-lot";

const valeur = (v: string) => (/^\d+$/.test(v) ? v : `« ${v} »`);

/**
 * Questions à imprimer d'après la configuration de l'enquête.
 *
 * Une question disparaît quand elle ne peut jamais être posée : désactivée, réservée
 * à un autre usage de lot (commerce, garage…), personnalisée sans texte, ou
 * conditionnée par une question désactivée (sauf si la condition est « remplie tant
 * que la question n'a pas de réponse », comme au portail).
 */
export function questionnairePapier(config: ConfigItem[]): QuestionnairePapier {
  const resolues = resolveQuestions(config);
  const gardees = new Set<string>();
  const numeros = new Map<string, number>();
  let numero = 0;

  // Les conditions ne renvoient qu'à des questions placées avant : une seule passe suffit.
  const retenir = (q: ResolvedQuestion): QuestionPapier | null => {
    if (!q.on || q.id === QUESTION_USAGE) return null;
    if (q.custom && q.q.trim() === "") return null;
    const parts: string[] = [];
    for (const c of q.cond ?? []) {
      if (c.qid === QUESTION_USAGE) {
        if (!c.vals.includes("Habitation")) return null;
        continue;
      }
      if (!gardees.has(c.qid)) {
        if (c.defaut) continue;
        return null;
      }
      parts.push(`question ${numeros.get(c.qid)} = ${c.vals.map(valeur).join(" ou ")}`);
    }
    gardees.add(q.id);
    numeros.set(q.id, ++numero);
    return { numero, q, condition: parts.join(" et ") };
  };

  const sections = (ids: SectionId[]): SectionPapier[] =>
    SECTIONS.filter((s) => ids.includes(s.id))
      .map((s) => ({
        id: s.id,
        label: s.label,
        desc: s.desc,
        questions: resolues.filter((q) => !q.custom && q.section === s.id).map(retenir).filter((x): x is QuestionPapier => !!x),
      }))
      .filter((s) => s.questions.length > 0);

  const copro = sections(SECTIONS_COPRO);
  const amo = resolues.filter((q) => q.custom).map(retenir).filter((x): x is QuestionPapier => !!x);
  if (amo.length) copro.push({ id: "amo", label: "Questions de votre AMO", desc: "Questions propres à votre copropriété.", questions: amo });
  const logement = sections(SECTIONS_LOGEMENT);

  return { copro, logement, nbQuestions: numero };
}
