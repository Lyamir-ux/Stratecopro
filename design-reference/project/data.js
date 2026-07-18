/* ==========================================================================
   Strat Eco — Progiciel AMO  ·  Données de démonstration
   Dossiers inspirés du document AMOA Pro (Nouvelle Cité, Renaissance)
   Données personnelles anonymisées.
   ========================================================================== */

// Couleurs des étiquettes énergétiques (DPE France)
window.DPE = {
  A: "#319834", B: "#52b153", C: "#a8c63a",
  D: "#f4d000", E: "#f2a30d", F: "#eb6909", G: "#e30613",
};

// Phases du cycle AMO
window.PHASES = [
  { id: "diagnostic", label: "Diagnostic", short: "Diag." },
  { id: "etudes",     label: "Études",     short: "Études" },
  { id: "travaux",    label: "Travaux",    short: "Travaux" },
];

// Référents AMO (équipe Strat Eco)
window.TEAM = {
  CB: { initials: "CB", name: "Claire Becker",   role: "Cheffe de projet AMO" },
  TM: { initials: "TM", name: "Thomas Muller",   role: "Ingénieur financier" },
  LR: { initials: "LR", name: "Léa Roth",        role: "Chargée d'enquête sociale" },
  YK: { initials: "YK", name: "Yanis Kessler",   role: "Suivi de chantier" },
};

// Helpers d'affichage
window.fmtEuro = (n) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
window.fmtEuroFull = (n) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/* --------------------------------------------------------------------------
   Copropriétés — 6 dossiers répartis sur les 3 phases
   -------------------------------------------------------------------------- */
window.COPROS = [
  {
    id: "nouvelle-cite",
    name: "Nouvelle Cité",
    city: "Strasbourg",
    quartier: "Hautepierre",
    adresse: "12 rue de Lisbonne, 67200 Strasbourg",
    phase: "travaux",
    fragile: true,
    energyBefore: "F", energyAfter: "C",
    gainPct: 48, aidesPct: 61, progress: 72,
    lots: 351, lotsHab: 284, coproprietaires: 158, batiments: 9,
    syndic: "Cabinet Niederhoffer",
    scenario: "Colonnes",
    montantTTC: 1653782.56,
    resteACharge: 612400,
    team: ["CB", "YK", "TM"],
    updated: "Il y a 2 h",
    nextTask: "Réception — façades nord, bât. A",
    tone: "#E8F1D7",
    tag: "Grande copropriété",
  },
  {
    id: "renaissance",
    name: "Renaissance",
    city: "Colmar",
    quartier: "Centre",
    adresse: "8 rue des Clefs, 68000 Colmar",
    phase: "etudes",
    fragile: false,
    energyBefore: "E", energyAfter: "C",
    gainPct: 41, aidesPct: 54, progress: 38,
    lots: 40, lotsHab: 14, coproprietaires: 14, batiments: 1,
    syndic: "Foncia Colmar",
    scenario: "Rénovation > 35 %",
    montantTTC: 454101.48,
    resteACharge: 141295,
    team: ["CB", "TM"],
    updated: "Hier",
    nextTask: "Validation du plan de financement",
    tone: "#EAF2FA",
    tag: "Petite copropriété",
  },
  {
    id: "les-tilleuls",
    name: "Les Tilleuls",
    city: "Mulhouse",
    quartier: "Rebberg",
    adresse: "24 avenue du Rebberg, 68100 Mulhouse",
    phase: "diagnostic",
    fragile: true,
    energyBefore: "G", energyAfter: null,
    gainPct: null, aidesPct: null, progress: 14,
    lots: 62, lotsHab: 48, coproprietaires: 44, batiments: 2,
    syndic: "Citya Mulhouse",
    scenario: null,
    montantTTC: null,
    resteACharge: null,
    team: ["LR", "CB"],
    updated: "Il y a 3 j",
    nextTask: "Visite technique du bâti",
    tone: "#F1F2EE",
    tag: "Copropriété fragile",
  },
  {
    id: "cours-vauban",
    name: "Cours Vauban",
    city: "Metz",
    quartier: "Nouvelle Ville",
    adresse: "5 cours Vauban, 57000 Metz",
    phase: "etudes",
    fragile: false,
    energyBefore: "D", energyAfter: "B",
    gainPct: 52, aidesPct: 58, progress: 46,
    lots: 88, lotsHab: 71, coproprietaires: 71, batiments: 3,
    syndic: "Square Habitat Metz",
    scenario: "Enveloppe + ENR",
    montantTTC: 1207540.00,
    resteACharge: 421000,
    team: ["CB", "TM", "LR"],
    updated: "Il y a 1 j",
    nextTask: "Consultation des entreprises",
    tone: "#E8F1D7",
    tag: "Gain > 35 %",
  },
  {
    id: "le-belvedere",
    name: "Le Belvédère",
    city: "Nancy",
    quartier: "Haussonville",
    adresse: "17 boulevard d'Haussonville, 54000 Nancy",
    phase: "diagnostic",
    fragile: false,
    energyBefore: "E", energyAfter: null,
    gainPct: null, aidesPct: null, progress: 8,
    lots: 120, lotsHab: 96, coproprietaires: 96, batiments: 4,
    syndic: "Nexity Nancy",
    scenario: null,
    montantTTC: null,
    resteACharge: null,
    team: ["LR"],
    updated: "Il y a 5 j",
    nextTask: "Recensement des lots et tantièmes",
    tone: "#EAF2FA",
    tag: "Nouveau dossier",
  },
  {
    id: "parc-des-cedres",
    name: "Parc des Cèdres",
    city: "Strasbourg",
    quartier: "Meinau",
    adresse: "3 allée des Cèdres, 67100 Strasbourg",
    phase: "travaux",
    fragile: false,
    energyBefore: "F", energyAfter: "D",
    gainPct: 44, aidesPct: 60, progress: 58,
    lots: 210, lotsHab: 168, coproprietaires: 140, batiments: 5,
    syndic: "Loca Gestion",
    scenario: "Isolation + chaufferie collective",
    montantTTC: 2040990.00,
    resteACharge: 798300,
    team: ["YK", "CB"],
    updated: "Il y a 6 h",
    nextTask: "Pose de l'ITE — bât. C",
    tone: "#E8F1D7",
    tag: "Grande copropriété",
  },
];

/* --------------------------------------------------------------------------
   Tâches de projet — colonnes = phases (Kanban du dossier, façon AMOA Pro)
   chaque tâche : titre, statut (done|doing|todo), assigné, échéance, étiquette
   -------------------------------------------------------------------------- */
function makeTasks(copro) {
  const t = copro.team;
  const a = (i) => t[i % t.length];
  return {
    diagnostic: [
      { title: "Recensement des copropriétaires & lots ", status: "done",  who: a(0), jalon: "P1a" },
      { title: "Saisie des tantièmes par bâtiment",        status: "done",  who: a(1) },
      { title: "Consultation diverses",       status: copro.phase === "diagnostic" ? "doing" : "done", who: a(0), due: "20 juin" },
      { title: "Verif Audit énergétique",        status: copro.phase === "diagnostic" ? "todo" : "done",  who: a(1), tag: "DPE" },
      { title: "Enquête sociale  profils MaPrimeRénov' - Fiche Etat",  status: copro.phase === "diagnostic" ? "todo" : "done",  who: "LR", tag: "MPR", jalon: "P1b" },
    ],
    etudes: [
      { title: "Scénarios de travaux & chiffrage",          status: copro.phase === "diagnostic" ? "todo" : (copro.phase === "etudes" ? "doing" : "done"), who: a(0) },
      { title: "Ingénierie financière (7 étapes)",          status: copro.phase === "travaux" ? "done" : (copro.phase === "etudes" ? "doing" : "todo"), who: "TM", tag: "Finance" },
      { title: "Récupération des données essentielles — CEE / MPR Copro",    status: copro.phase === "travaux" ? "done" : "todo", who: "TM", tag: "CEE" },
      { title: "Consultation & sélection des entreprises",  status: copro.phase === "travaux" ? "done" : "todo", who: a(0) },
      { title: "Plans de financement généraux et individuels",          status: copro.phase === "travaux" ? "done" : "todo", who: "TM" },
      { title: "Liasse documentaire pour AG",            status: copro.phase === "travaux" ? "done" : "todo", who: a(0), jalon: "P1c" },
    ],
    travaux: [
      { title: "Dépot des dossiers des aides",             status: copro.phase === "travaux" ? "done" : "todo", who: "TM", tag: "CEE", jalon: "P2a" },
      { title: "Mobilisation des prêts ",status: copro.phase === "travaux" ? "doing" : "todo", who: "TM", tag: "Éco-PTZ", jalon: "P2b" },
      { title: "Suivi de chantier",                          status: copro.phase === "travaux" ? "doing" : "todo", who: "YK", due: "En cours" },
      { title: "Demandes d'acompte",                         status: copro.phase === "travaux" ? "doing" : "todo", who: "TM" },
      { title: "Réception des travaux & levée des réserves", status: "todo", who: "YK" },
      { title: "Versement des aides & solde",                status: "todo", who: "TM", jalon: "P2c" },
    ],
  };
}
window.makeTasks = makeTasks;

/* --------------------------------------------------------------------------
   Tâches transverses de l'AMO (écran « Vos tâches »)
   -------------------------------------------------------------------------- */
window.MY_TASKS = [
  { copro: "nouvelle-cite", title: "Préparer la réception des façades nord", due: "Aujourd'hui", who: "YK", priority: "haute" },
  { copro: "cours-vauban",  title: "Lancer la consultation des entreprises", due: "Demain", who: "CB", priority: "haute" },
  { copro: "renaissance",   title: "Finaliser le plan de financement",       due: "16 juin", who: "TM", priority: "moyenne" },
  { copro: "les-tilleuls",  title: "Planifier la visite technique du bâti",  due: "18 juin", who: "CB", priority: "moyenne" },
  { copro: "le-belvedere",  title: "Récupérer le carnet d'entretien",        due: "20 juin", who: "LR", priority: "basse" },
  { copro: "parc-des-cedres", title: "Valider le métré ITE bât. C",          due: "23 juin", who: "YK", priority: "moyenne" },
];

/* Nombre de tâches actionnables (phase courante, non terminées) tous dossiers */
window.countMyTasks = function (copros) {
  return (copros || window.COPROS).reduce((n, c) => {
    const tasks = window.makeTasks(c)[c.phase] || [];
    return n + tasks.filter((t) => t.status !== "done").length;
  }, 0);
};

/* --------------------------------------------------------------------------
   Maîtrise d'œuvre — missions loi MOP (éléments de mission de MOE)
   Réhabilitation : DIAG · APS · APD · PRO · DCE/ACT · VISA · DET · OPC · AOR
   -------------------------------------------------------------------------- */
function makeMoeTasks(copro) {
  const inEtudes = copro.phase === "etudes";
  const inTravaux = copro.phase === "travaux";
  return {
    diagnostic: [
      { title: "Relevés & état des lieux du bâti",            status: "done", who: "PM", code: "DIAG" },
      { title: "Diagnostic technique & pathologies",          status: "done", who: "PM", code: "DIAG" },
      { title: "Repérage amiante / plomb avant travaux",      status: copro.phase === "diagnostic" ? "doing" : "done", who: "SD", code: "DIAG" },
      { title: "Programme & synthèse des besoins",            status: copro.phase === "diagnostic" ? "todo" : "done", who: "PM" },
    ],
    etudes: [
      { title: "Avant-projet sommaire — scénarios de travaux", status: copro.phase === "diagnostic" ? "todo" : (inEtudes ? "doing" : "done"), who: "PM", code: "APS" },
      { title: "Avant-projet définitif",                       status: inTravaux ? "done" : (inEtudes ? "doing" : "todo"), who: "PM", code: "APD" },
      { title: "Études de projet — CCTP & plans d'exécution",  status: inTravaux ? "done" : "todo", who: "SD", code: "PRO" },
      { title: "Dossier de consultation des entreprises",      status: inTravaux ? "done" : "todo", who: "PM", code: "DCE" },
      { title: "Analyse des offres & contrats de travaux",     status: inTravaux ? "done" : "todo", who: "PM", code: "ACT" },
    ],
    travaux: [
      { title: "Visa des études d'exécution",                  status: inTravaux ? "done" : "todo", who: "SD", code: "VISA" },
      { title: "Ordonnancement, pilotage & coordination",      status: inTravaux ? "doing" : "todo", who: "PM", code: "OPC" },
      { title: "Direction de l'exécution des travaux",         status: inTravaux ? "doing" : "todo", who: "PM", code: "DET", due: "En cours" },
      { title: "Assistance aux opérations de réception",       status: "todo", who: "SD", code: "AOR" },
      { title: "Dossier des ouvrages exécutés (DOE)",          status: "todo", who: "SD", code: "DOE" },
    ],
  };
}
window.makeMoeTasks = makeMoeTasks;
window.countMoeTasks = function (copros) {
  return (copros || window.COPROS).reduce((n, c) => {
    const tasks = makeMoeTasks(c)[c.phase] || [];
    return n + tasks.filter((t) => t.status !== "done").length;
  }, 0);
};

/* Scénarios de travaux préconisés par la MOE (plan de financement général) */
window.makeMoeScenarios = function (copro) {
  return [
    { id: "perf", name: "Bouquet performant (BBC)", reco: true,
      scope: "ITE complète, menuiseries, ventilation double flux, chaufferie collective gaz THPE.",
      mult: 1.0, gain: Math.max(55, copro.gainPct || 55), label: "B",
      postes: [
        { l: "Isolation thermique par l'extérieur (façades & pignons)", w: 0.36 },
        { l: "Isolation de la toiture & des combles", w: 0.14 },
        { l: "Remplacement des menuiseries extérieures", w: 0.18 },
        { l: "Ventilation mécanique double flux", w: 0.12 },
        { l: "Chaufferie collective gaz THPE & production ECS", w: 0.14 },
        { l: "Travaux induits & reprises parties communes", w: 0.06 },
      ] },
    { id: "inter", name: "Scénario intermédiaire", reco: false,
      scope: "ITE façades + toiture, menuiseries, VMC hygro B, optimisation chaufferie existante.",
      mult: 0.78, gain: 42, label: "C",
      postes: [
        { l: "Isolation thermique par l'extérieur (façades & toiture)", w: 0.40 },
        { l: "Remplacement des menuiseries extérieures", w: 0.22 },
        { l: "Ventilation mécanique hygroréglable type B", w: 0.10 },
        { l: "Optimisation de la chaufferie existante", w: 0.16 },
        { l: "Travaux induits & reprises parties communes", w: 0.12 },
      ] },
    { id: "essentiel", name: "Scénario essentiel", reco: false,
      scope: "Isolation toiture & combles, calorifugeage, remplacement menuiseries prioritaires.",
      mult: 0.55, gain: 30, label: "D",
      postes: [
        { l: "Isolation de la toiture & des combles perdus", w: 0.34 },
        { l: "Calorifugeage réseaux & robinets thermostatiques", w: 0.18 },
        { l: "Remplacement des menuiseries prioritaires", w: 0.36 },
        { l: "Travaux induits & reprises parties communes", w: 0.12 },
      ] },
  ];
};

/* --------------------------------------------------------------------------
   Consultations d'intervenants (marketplace AMO ↔ MOE/diagnostiqueur/…)
   -------------------------------------------------------------------------- */
window.CONSULT_TYPES = [
  { id: "moe",  label: "Maîtrise d'œuvre",      icon: "hammer" },
  { id: "diag", label: "Diagnostiqueur",         icon: "fileCheck" },
  { id: "ct",   label: "Contrôleur technique",   icon: "clipboard" },
  { id: "sps",  label: "Coordonnateur SPS",      icon: "users" },
  { id: "autre", label: "Autre intervenant",     icon: "briefcase" },
];
window.MOE_ORG = "Atelier Vernet";
window.CONSULTATIONS = [
  { id: "cs-1", type: "moe", coproId: "les-tilleuls", mission: "Mission de maîtrise d'œuvre complète (loi MOP) pour la rénovation énergétique : ITE, menuiseries, ventilation et chaufferie collective.", dateLimite: "2026-07-04", budget: 145000, statut: "en ligne", publishedAt: "10 juin 2026",
    candidatures: [{ org: "Atelier Vernet", date: "12 juin 2026", statut: "reçue" }, { org: "BET Rhin Énergie", date: "11 juin 2026", statut: "reçue" }] },
  { id: "cs-2", type: "moe", coproId: "le-belvedere", mission: "Maîtrise d'œuvre conception + suivi de travaux d'isolation et reprise des parties communes. Copropriété fragile, accompagnement renforcé attendu.", dateLimite: "2026-07-18", budget: 98000, statut: "en ligne", publishedAt: "12 juin 2026",
    candidatures: [] },
  { id: "cs-3", type: "diag", coproId: "parc-des-cedres", mission: "Repérage amiante et plomb avant travaux sur l'ensemble des bâtiments, parties communes et privatives échantillonnées.", dateLimite: "2026-06-28", budget: 22000, statut: "en ligne", publishedAt: "9 juin 2026",
    candidatures: [{ org: "Diag'Est Contrôles", date: "13 juin 2026", statut: "reçue" }] },
  { id: "cs-4", type: "sps", coproId: "nouvelle-cite", mission: "Coordination sécurité et protection de la santé (niveau 2) pour la phase chantier — ITE et interventions en site occupé.", dateLimite: "2026-06-20", budget: 16500, statut: "clôturée", publishedAt: "2 juin 2026",
    candidatures: [{ org: "Préventis SPS", date: "8 juin 2026", statut: "retenue" }, { org: "Coordo Grand Est", date: "6 juin 2026", statut: "non retenue" }] },
];

/* --------------------------------------------------------------------------
   Syndic — tâches (assemblées, comptes d'aides, validations, registre, PV…)
   -------------------------------------------------------------------------- */
function makeSyndicTasks(copro) {
  const inE = copro.phase === "etudes", inT = copro.phase === "travaux";
  return {
    diagnostic: [
      { title: "Mise à jour du registre de copropriété", status: "done", who: "CA" },
      { title: "Ouverture des comptes sur les plateformes d'aides", status: copro.phase === "diagnostic" ? "doing" : "done", who: "CA", tag: "Aides" },
      { title: "Inscription du projet à l'ordre du jour de l'AG", status: copro.phase === "diagnostic" ? "todo" : "done", who: "CA" },
    ],
    etudes: [
      { title: "Tenue de l'assemblée générale — vote des travaux", status: copro.phase === "diagnostic" ? "todo" : (inE ? "doing" : "done"), who: "CA", tag: "AG" },
      { title: "Dressage du PV d'assemblée générale", status: inT ? "done" : (inE ? "doing" : "todo"), who: "CA" },
      { title: "Signature de la fiche État", status: inT ? "done" : "todo", who: "CA" },
      { title: "Ouverture du compte bancaire travaux", status: inT ? "done" : "todo", who: "CA" },
      { title: "Constitution de l'assurance dommages-ouvrage", status: inT ? "done" : "todo", who: "CA", tag: "DO" },
    ],
    travaux: [
      { title: "Validation des dossiers d'aides", status: inT ? "done" : "todo", who: "CA", tag: "Aides" },
      { title: "Suivi du chantier", status: inT ? "doing" : "todo", who: "CA", due: "En cours" },
      { title: "Validation des demandes d'acompte", status: inT ? "doing" : "todo", who: "CA" },
      { title: "Validation du solde & versement des aides", status: "todo", who: "CA" },
      { title: "Tenue de l'AG de clôture & quitus", status: "todo", who: "CA", tag: "AG" },
    ],
  };
}
window.makeSyndicTasks = makeSyndicTasks;
window.countSyndicTasks = function (copros) {
  return (copros || window.COPROS).reduce((n, c) => n + (makeSyndicTasks(c)[c.phase] || []).filter((t) => t.status !== "done").length, 0);
};

/* Organisation du cabinet : plusieurs gestionnaires, portefeuille de copros */
window.SYNDIC_ORG = {
  cabinet: "Cabinet Niederhoffer",
  meId: "g1",
  gestionnaires: [
    { id: "g1", name: "Camille Aubry", initials: "CA", color: "#7AB52C" },
    { id: "g2", name: "Olivier Klein", initials: "OK", color: "#2E6FA8" },
    { id: "g3", name: "Sophie Hartmann", initials: "SH", color: "#7A5AE0" },
    { id: "g4", name: "Marc Lefèvre", initials: "ML", color: "#E08A2E" },
  ],
};
window.makeSyndicPortfolio = function () {
  const map = { "nouvelle-cite": "g1", "renaissance": "g1", "cours-vauban": "g1", "les-tilleuls": "g2", "le-belvedere": "g3", "parc-des-cedres": "g4" };
  const real = window.COPROS.map((c) => {
    const gestId = map[c.id] || "g2";
    const own = gestId === "g1";
    return { id: c.id, name: c.name, lots: c.lots, phase: c.phase, fragile: c.fragile, gestId, own, real: true,
      radius: (own ? 54 : 42) + Math.min(20, c.lots / 14) };
  });
  const extras = [
    ["Résidence du Parc", "g2", 58, "etudes"], ["Le Clos Fleuri", "g3", 34, "diagnostic"],
    ["Villa Mozart", "g4", 22, "travaux"], ["Cœur de Ville", "g2", 120, "etudes"],
    ["Les Jardins d'Alsace", "g3", 46, "diagnostic"], ["Carré Kléber", "g4", 78, "travaux"],
    ["Domaine des Vignes", "g2", 30, "diagnostic"], ["Le Patio", "g3", 52, "etudes"],
    ["Résidence Stanislas", "g4", 64, "travaux"], ["Les Terrasses", "g2", 40, "diagnostic"],
    ["Clairefontaine", "g4", 90, "travaux"], ["Le Square Vauban", "g3", 28, "etudes"],
  ].map((e, i) => ({ id: "x" + i, name: e[0], gestId: e[1], lots: e[2], phase: e[3], own: false, real: false,
    radius: 24 + Math.min(18, e[2] / 16) }));
  return [...real, ...extras];
};

/* --------------------------------------------------------------------------
   Rôles (écran de connexion)
   -------------------------------------------------------------------------- */
window.ROLES = [
  { id: "amo",    label: "AMO",            sub: "Pilotage complet des dossiers", icon: "gauge",        active: true },
  { id: "syndic", label: "Syndic",         sub: "Vos copropriétés gérées",        icon: "building",     active: false },
  { id: "moe",    label: "Maîtrise d'œuvre",sub: "Vos chantiers en cours",        icon: "hammer",       active: false },
  { id: "copro",  label: "Copropriétaire", sub: "Votre projet de rénovation",     icon: "user",         active: false },
];

/* ==========================================================================
   ESPACE COPROPRIÉTAIRE
   ========================================================================== */

// Le copropriétaire connecté. Rattaché à un (ou plusieurs) lot(s) d'une copro.
window.COPRO_USER = {
  name: "Camille Aubry",
  initials: "CA",
  email: "c.aubry@email.fr",
  coproIds: ["renaissance"],          // « généralement un choix »
  lots: [
    { num: "12", batiment: "A", pieces: 3, surface: 68, usage: "Habitation", tantiemes: 47 },
    { num: "27", batiment: "B", pieces: 2, surface: 44, usage: "Habitation", tantiemes: 31 },
  ],
  get lot() { return this.lots[0]; },
  profilMPR: null,                    // déterminé par l'enquête sociale
};

// Scénarios de travaux votables (le copropriétaire peut en comparer plusieurs)
window.COPRO_SCENARIOS = [
  { id: "perf", name: "Performant (BBC)", mult: 1.0, label: "B" },
  { id: "inter", name: "Intermédiaire", mult: 0.80, label: "C" },
];

// Plan de financement individuel (estimations d'affichage)
window.INDIV_PLAN = {
  quotePart: 21343.00,                // quote-part de travaux (tantièmes 47/1000)
  aidesIndiv: 8214.00,                // MaPrimeRénov' individuelle (profil Jaune)
  cee: 1086.00,                       // CEE — part individuelle
  aidesCollAffectees: 2430.00,        // subvention collective affectée au lot
  get resteACharge() { return this.quotePart - this.aidesIndiv - this.cee - this.aidesCollAffectees; },
};

// Plans de financement collectifs (chiffres réels du document pour Renaissance)
window.PLANS = {
  renaissance: {
    travaux: 327944.81, honoraires: 92156.67, aleas: 34000.00,
    totalTTC: 454101.48,
    aides: [
      { l: "Subventions préfinançables (MPR Copro)", v: 125078.40, k: "primary" },
      { l: "Fonds (Alur, provisions)",                v: 41283.00,  k: "blue" },
      { l: "CEE (Certificats d'Économie d'Énergie)",  v: 21366.00,  k: "blue" },
    ],
    deductions: 187727.40,
    resteCollectif: 266374.08,        // 454 101,48 − 187 727,40
    aidesIndivCumulees: 78420.00,     // MPR individuelles cumulées (estim.)
    gainPct: 41, seuil35: true,
  },
};

// Documents partagés par l'AMO (consultables)
window.PROJECT_DOCS = [
  { name: "DPE collectif & audit énergétique", type: "PDF", size: "4,2 Mo", date: "12 mai 2026" },
  { name: "Scénario de travaux — Rénovation > 35 %", type: "PDF", size: "1,8 Mo", date: "28 mai 2026" },
  { name: "Plan de financement collectif", type: "PDF", size: "920 Ko", date: "3 juin 2026" },
  { name: "Convocation — Assemblée générale", type: "PDF", size: "640 Ko", date: "6 juin 2026" },
  { name: "Notice d'information MaPrimeRénov'", type: "PDF", size: "1,1 Mo", date: "2 mai 2026" },
];

// Documents à récupérer pour l'adhésion au prêt collectif
window.PRET_COLLECTIF_DOCS = [
  { id: "bulletin", name: "Bulletin d'adhésion au prêt collectif", type: "PDF", size: "310 Ko", hint: "À compléter et signer" },
  { id: "sepa", name: "Mandat de prélèvement SEPA", type: "PDF", size: "180 Ko", hint: "Pour les mensualités du prêt" },
];
window.PRET_COLLECTIF_AFOURNIR = [
  "Avis d'imposition (N-1)",
  "Pièce d'identité en cours de validité",
  "RIB correspondant au mandat SEPA",
  "Justificatif de propriété du ou des lots",
];

// Pièces à téléverser par le copropriétaire (checklist)
window.MY_DOCS = [
  { id: "avis", name: "Avis d'imposition (N-1)", required: true, hint: "Pour déterminer votre profil MaPrimeRénov'" },
  { id: "id", name: "Pièce d'identité", required: true, hint: "Recto-verso" },
  { id: "rib", name: "RIB", required: true, hint: "Pour le versement des aides" },
  { id: "domicile", name: "Justificatif de domicile", required: false, hint: "De moins de 3 mois" },
  { id: "taxe", name: "Taxe foncière", required: false, hint: "Facultatif" },
];

// Barème MaPrimeRénov' — hors Île-de-France (Grand Est), millésime 2024
// seuils de revenu fiscal de référence : [Bleu max, Jaune max, Violet max]
window.MPR_BAREME = {
  1: [17173, 22015, 30844],
  2: [25115, 32197, 45340],
  3: [30206, 38719, 54592],
  4: [35285, 45234, 63844],
  5: [40388, 51775, 73098],
  parPers: [5094, 6525, 9254],
};
window.PROFILS_MPR = {
  Bleu:   { color: "#2E6FA8", label: "Bleu",   desc: "Revenus très modestes",  taux: "jusqu'à 50 %" },
  Jaune:  { color: "#f2a30d", label: "Jaune",  desc: "Revenus modestes",        taux: "jusqu'à 35 %" },
  Violet: { color: "#7A5AE0", label: "Violet", desc: "Revenus intermédiaires",  taux: "jusqu'à 25 %" },
  Rose:   { color: "#DC6FA8", label: "Rose",   desc: "Revenus supérieurs",      taux: "jusqu'à 15 %" },
};
window.determineProfil = function (persons, rfr) {
  const n = Math.max(1, persons | 0);
  let s = window.MPR_BAREME[Math.min(n, 5)];
  if (n > 5) {
    const base = window.MPR_BAREME[5], add = window.MPR_BAREME.parPers, extra = n - 5;
    s = [base[0] + add[0] * extra, base[1] + add[1] * extra, base[2] + add[2] * extra];
  }
  if (rfr <= s[0]) return "Bleu";
  if (rfr <= s[1]) return "Jaune";
  if (rfr <= s[2]) return "Violet";
  return "Rose";
};
