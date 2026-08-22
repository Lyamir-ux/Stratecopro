// Catalogue des questions d'enquête (sociale + technique) proposées à l'AMO.
// Le catalogue est la source de vérité : la base ne stocke que la configuration
// ({ id, on } par question + questions personnalisées) - les libellés, options
// et conditions d'affichage vivent ici et peuvent évoluer sans migration.

export type SectionId = "identite" | "situation" | "avis" | "lot" | "technique" | "confort";
export type Scope = "coproprietaire" | "lot";

export type QuestionType =
  | "texte" // saisie libre
  | "tel"
  | "email"
  | "adresse"
  | "nombre"
  | "montant" // €
  | "choix" // QCM à choix unique
  | "multi" // QCM à choix multiples
  | "lotParent"; // sélection d'un lot principal du copropriétaire

/** Condition d'affichage : la question ne se pose que si `qid` a l'une des valeurs `vals` (ET entre conditions). */
export interface Condition {
  qid: string;
  vals: string[];
  /** true = tant que la question référencée n'a pas de réponse, la condition est
   *  considérée remplie (la question reste visible au lieu d'attendre). */
  defaut?: boolean;
}

export interface CatalogueQuestion {
  id: string;
  section: SectionId;
  /** Libellé court affiché en étiquette (chip). */
  tag: string;
  /** Texte de la question tel que vu par le copropriétaire. */
  q: string;
  type: QuestionType;
  options?: string[];
  /** Options qui ouvrent un champ libre de précision. */
  precision?: string[];
  cond?: Condition[];
  /** Texte d'aide (infobulle ?). */
  aide?: string;
  /** Question socle : toujours posée, non désactivable. */
  locked?: boolean;
  /** Activée par défaut dans une nouvelle enquête. */
  defaultOn: boolean;
}

export const SECTIONS: { id: SectionId; label: string; desc: string; scope: Scope }[] = [
  { id: "identite", label: "Identité & coordonnées", desc: "Questions posées à chaque copropriétaire - socle du recensement.", scope: "coproprietaire" },
  { id: "situation", label: "Situation & aides", desc: "Profil MaPrimeRénov', situation juridique et sociale.", scope: "coproprietaire" },
  { id: "avis", label: "Avis sur la copropriété", desc: "Perception des travaux et des parties communes.", scope: "coproprietaire" },
  { id: "lot", label: "Les lots", desc: "Questions posées pour chacun des lots du copropriétaire.", scope: "lot" },
  { id: "technique", label: "Enquête technique", desc: "État du logement : menuiseries, chauffage, eau chaude, pathologies.", scope: "lot" },
  { id: "confort", label: "Confort & occupation", desc: "Ressentis, inconforts et occupation du logement.", scope: "lot" },
];

// Valeurs partagées (références des conditions)
export const TYPES_COPRO = [
  "Personne physique",
  "Indivision",
  "SCI soumise à l'impôt sur le revenu",
  "SCI soumise à l'impôt sur les sociétés",
  "Entreprise commerciale",
  "Association",
  "Autre personne morale",
];
export const USAGES_LOT = ["Habitation", "Commerce", "Stationnement", "Garage", "Cave", "Box", "Autre"];

const SCI = ["SCI soumise à l'impôt sur le revenu", "SCI soumise à l'impôt sur les sociétés"];
const HAB = { qid: "usage-lot", vals: ["Habitation"] };
const HAB_COM = { qid: "usage-lot", vals: ["Habitation", "Commerce"] };

export const CATALOGUE: CatalogueQuestion[] = [
  // ========== Identité & coordonnées ==========
  { id: "nom", section: "identite", tag: "Nom ou raison sociale", q: "Quel est votre nom complet (ou raison sociale) ?", type: "texte", locked: true, defaultOn: true },
  { id: "telephone", section: "identite", tag: "Numéro de téléphone", q: "Quel est votre numéro de téléphone ?", type: "tel", locked: true, defaultOn: true },
  { id: "adresse", section: "identite", tag: "Adresse postale", q: "À quelle adresse postale êtes-vous joignable ?", type: "adresse", aide: "Adresse de contact, qui peut différer de celle du lot (propriétaires bailleurs).", locked: true, defaultOn: true },
  { id: "email", section: "identite", tag: "Email", q: "Quelle est votre adresse email ?", type: "email", locked: true, defaultOn: true },
  { id: "type-coproprietaire", section: "identite", tag: "Type de copropriétaire", q: "Quel type de copropriétaire êtes-vous ?", type: "choix", options: TYPES_COPRO, locked: true, defaultOn: true },
  { id: "nb-indivisaires", section: "identite", tag: "Nombre d'indivisaires", q: "Combien y a-t-il d'indivisaires ?", type: "nombre", cond: [{ qid: "type-coproprietaire", vals: ["Indivision"] }], locked: true, defaultOn: true },
  { id: "nb-associes-sci", section: "identite", tag: "Nombre d'associés dans la SCI", q: "Combien y a-t-il d'associés dans la SCI ?", type: "nombre", cond: [{ qid: "type-coproprietaire", vals: SCI }], locked: true, defaultOn: true },
  { id: "personne-physique-sci", section: "identite", tag: "Personne physique dans la SCI", q: "Y a-t-il une personne physique parmi les associés de la SCI ?", type: "choix", options: ["Oui", "Non", "Je ne sais pas"], cond: [{ qid: "type-coproprietaire", vals: SCI }], locked: true, defaultOn: true },

  // ========== Situation & aides ==========
  {
    id: "nb-personnes-foyer", section: "situation", tag: "Personnes composant le ménage", q: "Combien de personnes composent votre ménage ?", type: "nombre",
    cond: [{ qid: "type-coproprietaire", vals: ["Personne physique", "Indivision"], defaut: true }],
    aide: "Toutes les personnes figurant sur le ou les avis d'imposition du ménage. Avec le revenu fiscal de référence, cette réponse détermine votre profil d'aides (plafonds Anah).",
    locked: true, defaultOn: true,
  },
  {
    id: "rfr-foyer", section: "situation", tag: "Revenu fiscal de référence du ménage", q: "Quel est le revenu fiscal de référence de votre ménage ?", type: "montant",
    cond: [{ qid: "type-coproprietaire", vals: ["Personne physique", "Indivision"], defaut: true }],
    aide: "Ligne « Revenu fiscal de référence » de l'avis d'imposition (total du ménage si plusieurs avis). Donnée confidentielle, visible uniquement par l'AMO - elle détermine automatiquement votre catégorie d'aides (plafonds Anah).",
    locked: true, defaultOn: true,
  },
  {
    id: "accord-visite", section: "situation", tag: "Accord pour la visite", q: "Seriez-vous d'accord pour qu'un de vos lots fasse l'objet d'une visite dans le cadre du projet de rénovation ?", type: "choix",
    options: ["Oui", "Non", "Oui, sous conditions (précisez)"], precision: ["Oui, sous conditions (précisez)"],
    defaultOn: true,
  },
  {
    id: "curatelle-tutelle", section: "situation", tag: "Curatelle ou tutelle", q: "L'un des copropriétaires est-il en sauvegarde de justice, sous curatelle ou sous tutelle ?", type: "choix",
    options: ["Non", "Sauvegarde de justice", "Curatelle", "Tutelle"],
    aide: "Information nécessaire pour les signatures (contrats, prêts) : un représentant légal peut devoir intervenir.",
    defaultOn: true,
  },
  {
    id: "situation-sociale", section: "situation", tag: "Situation sociale particulière", q: "Y a-t-il une situation sociale particulière à nous communiquer ?", type: "choix",
    options: ["Non", "Oui (précisez)"], precision: ["Oui (précisez)"],
    aide: "Difficultés financières, santé, mobilité réduite… Ces informations restent confidentielles et aident l'AMO à adapter l'accompagnement.",
    defaultOn: true,
  },

  // ========== Avis sur la copropriété ==========
  {
    id: "importance-travaux", section: "avis", tag: "Importance des travaux", q: "Selon vous, quelle est l'importance des travaux envisagés par la copropriété ?", type: "choix",
    options: ["Indispensables", "Utiles", "Peu utiles", "Inutiles", "Sans avis"],
    aide: "Mesure l'adhésion des copropriétaires au projet avant l'assemblée générale.",
    defaultOn: false,
  },
  { id: "etat-parties-communes", section: "avis", tag: "État général des parties communes", q: "Comment jugez-vous l'état général des parties communes de la résidence ?", type: "choix", options: ["Très bon", "Bon", "Moyen", "Dégradé", "Très dégradé"], defaultOn: false },
  { id: "securite-parties-communes", section: "avis", tag: "Sécurité des parties communes", q: "Comment jugez-vous le niveau de sécurité des parties communes ?", type: "choix", options: ["Très satisfaisant", "Satisfaisant", "Insuffisant", "Très insuffisant"], defaultOn: false },

  // ========== Les lots ==========
  { id: "usage-lot", section: "lot", tag: "Usage du lot", q: "Quel est l'usage de ce lot ?", type: "choix", options: USAGES_LOT, locked: true, defaultOn: true },
  { id: "lot-parent", section: "lot", tag: "Lot parent", q: "À quel lot principal est lié ce lot secondaire ?", type: "lotParent", cond: [{ qid: "usage-lot", vals: ["Stationnement", "Garage", "Cave", "Box", "Autre"] }], locked: true, defaultOn: true },
  { id: "type-occupation", section: "lot", tag: "Type d'occupation", q: "Êtes-vous propriétaire bailleur ou propriétaire occupant de ce lot ?", type: "choix", options: ["Propriétaire occupant", "Propriétaire bailleur (logement loué)", "Logement vacant"], cond: [HAB], locked: true, defaultOn: true },
  { id: "nb-habitants", section: "lot", tag: "Nombre d'habitants", q: "Combien de personnes habitent dans ce logement ?", type: "nombre", cond: [HAB], locked: true, defaultOn: true },
  { id: "type-residence", section: "lot", tag: "Type de résidence", q: "Le logement est-il occupé (votre locataire ou vous) à titre de résidence principale ou secondaire ?", type: "choix", options: ["Résidence principale", "Résidence secondaire"], cond: [HAB], locked: true, defaultOn: true },
  { id: "commodat", section: "lot", tag: "Mise à disposition du logement", q: "Le logement est-il mis à disposition gratuitement (modèle du commodat) ?", type: "choix", options: ["Oui", "Non"], cond: [HAB], defaultOn: true },
  { id: "associes-occupants", section: "lot", tag: "Associés occupants le logement", q: "Combien y a-t-il d'associés de la SCI occupants le logement ?", type: "nombre", cond: [HAB, { qid: "type-coproprietaire", vals: SCI }], aide: "L'occupation par un associé conditionne certaines aides individuelles.", defaultOn: true },
  { id: "indivisaires-occupants", section: "lot", tag: "Indivisaires occupants le logement", q: "Combien y a-t-il d'indivisaires occupants le logement ?", type: "nombre", cond: [HAB, { qid: "type-coproprietaire", vals: ["Indivision"] }], aide: "L'occupation par un indivisaire conditionne certaines aides individuelles.", defaultOn: true },
  {
    id: "projet-vente", section: "lot", tag: "Projet de vente", q: "Avez-vous pour projet de vendre ce logement prochainement (avant les travaux ou après) ?", type: "choix",
    options: ["Non", "Oui, avant les travaux", "Oui, après les travaux", "Je ne sais pas encore"], cond: [HAB], defaultOn: true,
  },
  { id: "associes-exploitants", section: "lot", tag: "Associés exploitant le commerce", q: "Les associés de la SCI sont-ils les exploitants de ce commerce ?", type: "choix", options: ["Oui", "Non", "En partie"], cond: [{ qid: "usage-lot", vals: ["Commerce"] }, { qid: "type-coproprietaire", vals: SCI }], defaultOn: true },
  {
    id: "demembrement", section: "lot", tag: "Démembrement", q: "Êtes-vous en situation de démembrement ?", type: "choix",
    options: ["Non", "Oui, je suis usufruitier", "Oui, je suis nu-propriétaire"], cond: [HAB],
    defaultOn: true,
  },

  // ========== Enquête technique ==========
  { id: "nb-fenetres", section: "technique", tag: "Fenêtres et portes-fenêtres", q: "Combien de fenêtres et portes-fenêtres avez-vous ?", type: "nombre", cond: [HAB_COM], defaultOn: true },
  { id: "nb-simple-vitrage", section: "technique", tag: "Simple vitrage", q: "Combien sont en simple vitrage (vitrage d'origine) ?", type: "nombre", cond: [HAB_COM], defaultOn: true },
  { id: "nb-occultations", section: "technique", tag: "Occultations", q: "Combien d'occultations (volets/persiennes) avez-vous ?", type: "nombre", cond: [HAB_COM], defaultOn: true },
  { id: "nb-occultations-origine", section: "technique", tag: "Occultations d'origine", q: "Combien sont d'origine ?", type: "nombre", cond: [HAB_COM], defaultOn: true },
  { id: "nb-stores", section: "technique", tag: "Stores", q: "Combien avez-vous de stores ?", type: "nombre", cond: [HAB_COM], defaultOn: true },
  {
    id: "changement-menuiseries", section: "technique", tag: "Changement fenêtres et occultations", q: "Avez-vous changé récemment vos fenêtres, occultations ou stores ?", type: "multi",
    options: ["Oui, les fenêtres", "Oui, les occultations (volets, persiennes)", "Oui, les stores", "Non, aucun changement récent"], cond: [HAB_COM], defaultOn: true,
  },
  { id: "type-chauffage", section: "technique", tag: "Type de chauffage", q: "Votre chauffage est-il collectif ou individuel ?", type: "choix", options: ["Collectif", "Individuel", "Mixte (collectif + appoint individuel)"], cond: [HAB_COM], defaultOn: true },
  {
    id: "energie-chauffage", section: "technique", tag: "Énergie de chauffage", q: "Quelle énergie de chauffage utilisez-vous ?", type: "choix",
    options: ["Gaz", "Électricité", "Fioul", "Bois", "Pompe à chaleur", "Réseau de chaleur urbain", "Autre (précisez)", "Je ne sais pas"], precision: ["Autre (précisez)"],
    cond: [HAB_COM], defaultOn: true,
  },
  {
    id: "date-chaudiere", section: "technique", tag: "Date de la chaudière", q: "Savez-vous de quand date approximativement votre chaudière ?", type: "choix",
    options: ["Moins de 5 ans", "5 à 10 ans", "10 à 15 ans", "Plus de 15 ans", "Je ne sais pas"],
    cond: [HAB_COM, { qid: "type-chauffage", vals: ["Individuel"] }, { qid: "energie-chauffage", vals: ["Gaz"] }],
    defaultOn: true,
  },
  { id: "type-ecs", section: "technique", tag: "Type d'eau chaude", q: "Votre système de chauffage de l'eau chaude (ECS) est-il collectif ou individuel ?", type: "choix", options: ["Collectif", "Individuel"], cond: [HAB_COM], defaultOn: true },
  {
    id: "energie-ecs", section: "technique", tag: "Énergie de l'eau chaude", q: "Quelle énergie utilisez-vous pour l'eau chaude ?", type: "choix",
    options: ["Gaz", "Électricité (ballon / cumulus)", "Fioul", "Solaire", "Même système que le chauffage", "Autre (précisez)", "Je ne sais pas"], precision: ["Autre (précisez)"],
    cond: [HAB_COM], defaultOn: true,
  },
  { id: "nb-radiateurs", section: "technique", tag: "Radiateurs", q: "Combien y a-t-il de radiateurs ?", type: "nombre", cond: [HAB_COM], defaultOn: true },
  {
    id: "regulation-radiateurs", section: "technique", tag: "Régulation des radiateurs", q: "Sont-ils équipés de robinets thermostatiques ou de systèmes de régulation ?", type: "choix",
    options: ["Oui, sur tous les radiateurs", "Oui, sur une partie seulement", "Non", "Je ne sais pas"], cond: [HAB_COM], defaultOn: true,
  },
  {
    id: "pathologies", section: "technique", tag: "Pathologies à signaler", q: "Avez-vous des pathologies à signaler ?", type: "multi",
    options: ["Humidité / condensation", "Moisissures", "Infiltrations d'eau", "Fissures", "Peintures écaillées / salpêtre", "Nuisibles (rongeurs, insectes…)", "Autre (précisez)", "Aucune pathologie"], precision: ["Autre (précisez)"],
    aide: "Désordres constatés dans le logement - utiles pour orienter la visite technique.",
    cond: [HAB_COM], defaultOn: true,
  },

  // ========== Confort & occupation ==========
  {
    id: "inconforts", section: "confort", tag: "Inconforts", q: "Ressentez-vous un inconfort particulier ?", type: "multi",
    options: ["Froid en hiver", "Chaleur excessive en été", "Courants d'air", "Parois ou sols froids", "Humidité", "Bruits (voisinage, extérieur)", "Odeurs / qualité de l'air", "Aucun inconfort particulier"],
    aide: "Plusieurs réponses possibles - ces ressentis alimentent le diagnostic.",
    cond: [HAB_COM], defaultOn: true,
  },
  {
    id: "duree-occupation", section: "confort", tag: "Durée occupation du logement", q: "Depuis combien de temps ce logement est-il habité par ses occupants ?", type: "choix",
    options: ["Moins de 2 ans", "2 à 5 ans", "5 à 10 ans", "10 à 20 ans", "Plus de 20 ans"],
    aide: "L'ancienneté d'occupation éclaire la fiabilité des ressentis exprimés.",
    cond: [HAB], defaultOn: false,
  },
  {
    id: "tranches-age", section: "confort", tag: "Tranche d'âge des occupants", q: "Quelle est la tranche d'âge des personnes vivant dans le logement ?", type: "multi",
    options: ["Moins de 18 ans", "18 à 30 ans", "31 à 45 ans", "46 à 60 ans", "61 à 75 ans", "Plus de 75 ans"],
    aide: "Plusieurs réponses possibles - utile pour identifier les publics sensibles (enfants, personnes âgées).",
    cond: [HAB], defaultOn: false,
  },
  {
    id: "csp", section: "confort", tag: "CSP des personnes occupantes", q: "Quelle est la catégorie socio-professionnelle principale des personnes occupantes ?", type: "choix",
    options: ["Agriculteur", "Artisan, commerçant, chef d'entreprise", "Cadre, profession intellectuelle supérieure", "Profession intermédiaire", "Employé", "Ouvrier", "Retraité", "Étudiant", "Sans activité professionnelle"],
    aide: "Nomenclature INSEE simplifiée - donnée statistique pour le volet social.",
    cond: [HAB], defaultOn: false,
  },
  {
    id: "ressenti-ete", section: "confort", tag: "Ressenti dans le logement en été", q: "Quel est votre ressenti dans le logement en été ?", type: "choix",
    options: ["Très chaud, difficilement supportable", "Chaud mais supportable", "Confortable", "Frais"],
    cond: [HAB], defaultOn: false,
  },
  {
    id: "ressenti-hiver", section: "confort", tag: "Ressenti dans le logement en hiver", q: "Quel est votre ressenti dans le logement en hiver ?", type: "choix",
    options: ["Très froid malgré le chauffage", "Froid par moments (matin, grand froid…)", "Confortable", "Trop chauffé"],
    cond: [HAB], defaultOn: false,
  },
  {
    id: "confort-phonique", section: "confort", tag: "Confort phonique", q: "Quel est votre ressenti au niveau du confort phonique dans votre logement ?", type: "choix",
    options: ["Très satisfaisant", "Satisfaisant", "Moyen", "Mauvais", "Très mauvais"],
    cond: [HAB], defaultOn: false,
  },
  {
    id: "detecteurs", section: "confort", tag: "Détecteur de fumée", q: "Votre logement est-il équipé d'un détecteur de fumée et d'un détecteur de monoxyde de carbone ?", type: "choix",
    options: ["Oui, les deux (fumée + CO)", "Détecteur de fumée uniquement", "Détecteur de CO uniquement", "Aucun"],
    cond: [HAB], defaultOn: false,
  },
  {
    id: "projet-travaux", section: "confort", tag: "Projet de travaux", q: "Avez-vous un projet de travaux dans ce logement ?", type: "multi",
    options: ["Isolation (murs, plafonds, sols)", "Remplacement des fenêtres", "Chauffage / eau chaude", "Ventilation", "Salle de bain / cuisine", "Rafraîchissement (peinture, sols…)", "Autre (précisez)", "Aucun projet"], precision: ["Autre (précisez)"],
    aide: "Permet de proposer un accompagnement sur les travaux privatifs en complément des travaux collectifs.",
    cond: [HAB], defaultOn: false,
  },
];

const BY_ID = new Map(CATALOGUE.map((q) => [q.id, q]));

// ========== Configuration stockée (enquetes.questions, jsonb) ==========

/** Entrée de configuration : question du catalogue (id + on) ou question personnalisée. */
export interface ConfigItem {
  id: string;
  on: boolean;
  /** Question personnalisée ajoutée par l'AMO (texte libre). */
  custom?: boolean;
  q?: string;
}

/** Question résolue pour l'affichage : définition du catalogue + état de configuration. */
export interface ResolvedQuestion extends CatalogueQuestion {
  on: boolean;
  custom?: boolean;
}

export function defaultConfig(): ConfigItem[] {
  return CATALOGUE.map((q) => ({ id: q.id, on: q.defaultOn }));
}

/**
 * Normalise la config stockée : ancien format (questions numérotées du POC) → défauts ;
 * complète les questions du catalogue absentes (ajoutées depuis) ; force les questions socle.
 */
export function normalizeConfig(raw: unknown): ConfigItem[] {
  const arr = Array.isArray(raw) ? (raw as ConfigItem[]) : [];
  const known = arr.filter((it) => it && typeof it.id === "string" && (BY_ID.has(it.id) || it.custom));
  if (known.length === 0) return defaultConfig();
  const byId = new Map(known.map((it) => [it.id, it]));
  const catalogue = CATALOGUE.map((q) => {
    const stored = byId.get(q.id);
    return { id: q.id, on: q.locked ? true : (stored?.on ?? q.defaultOn) };
  });
  const customs = known.filter((it) => it.custom);
  return [...catalogue, ...customs];
}

/** Fusionne catalogue + config pour l'affichage (ordre du catalogue, customs à la fin). */
export function resolveQuestions(config: ConfigItem[]): ResolvedQuestion[] {
  const byId = new Map(config.map((it) => [it.id, it]));
  const catalogue: ResolvedQuestion[] = CATALOGUE.map((q) => ({
    ...q,
    on: q.locked ? true : (byId.get(q.id)?.on ?? q.defaultOn),
  }));
  const customs: ResolvedQuestion[] = config
    .filter((it) => it.custom)
    .map((it) => ({
      id: it.id,
      section: "confort" as SectionId,
      tag: "Question personnalisée",
      q: it.q ?? "",
      type: "texte" as QuestionType,
      on: it.on,
      custom: true,
      defaultOn: true,
    }));
  return [...catalogue, ...customs];
}

// ========== Aides à l'affichage ==========

export const TYPE_LABELS: Record<QuestionType, string> = {
  texte: "Texte libre",
  tel: "Téléphone",
  email: "Email",
  adresse: "Adresse",
  nombre: "Nombre",
  montant: "Montant (€)",
  choix: "Choix unique",
  multi: "Choix multiples",
  lotParent: "Sélection parmi les lots principaux",
};

/** Résumé du type + options pour une ligne de configuration. */
export function describeType(q: Pick<CatalogueQuestion, "type" | "options">): string {
  const label = TYPE_LABELS[q.type];
  if (!q.options?.length) return label;
  return `${label} - ${q.options.join(" · ")}`;
}

/** Textes des conditions d'affichage ("Usage du lot = Habitation ou Commerce"). */
export function condTexts(q: Pick<CatalogueQuestion, "cond">): string[] {
  return (q.cond ?? []).map((c) => {
    const ref = BY_ID.get(c.qid);
    return `${ref?.tag ?? c.qid} = ${c.vals.join(" ou ")}`;
  });
}
