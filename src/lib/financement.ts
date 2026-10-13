// Modes de financement ouverts à un copropriétaire (bug d'Amir du 05/10/2026,
// page /portail/plan-indiv) : l'éco-PTZ, collectif comme individuel, finance des
// logements. Un copropriétaire qui n'a que des garages, caves, parkings ou
// locaux d'activité ne peut pas s'y rattacher - un lot annexe ne se rattache
// qu'à un lot d'habitation du même copropriétaire (rattacher_lot, 0038) - et n'a
// donc qu'un seul choix : les fonds propres.

/** Vrai si le copropriétaire possède au moins un lot d'habitation (éco-PTZ ouvert). */
export function ecoPtzPossible(lots: readonly { usage: string }[]): boolean {
  return lots.some((l) => l.usage === "habitation");
}

/** Explication affichée à un copropriétaire sans lot d'habitation. */
export const MOTIF_SANS_ECO_PTZ =
  "Vos lots (garage, cave, parking, local d'activité…) ne sont pas des logements : l'éco-PTZ, collectif comme " +
  "individuel, ne les finance pas, et un lot annexe ne peut être rattaché qu'à un lot d'habitation vous appartenant. " +
  "Le financement sur fonds propres est donc votre seul choix.";

/** SCI soumise à l'impôt sur les sociétés (type répondu à l'enquête) : exclue de l'éco-PTZ, réservé aux
 *  personnes physiques et aux « SCI patrimoniales, non soumises à l'IS » (bulletin CEGEE ; règle d'Amir
 *  du 12/10/2026). Sans réponse à l'enquête, rien n'est fermé : le nom ne dit pas le régime fiscal. */
export function sciSoumiseIs(typeCoproprietaire: unknown): boolean {
  return typeof typeCoproprietaire === "string" && /^SCI\b.*soci[ée]t[ée]s/i.test(typeCoproprietaire.trim());
}

export const MOTIF_SCI_IS =
  "Votre SCI est soumise à l'impôt sur les sociétés : l'éco-PTZ, collectif comme individuel, est réservé aux " +
  "personnes physiques et aux SCI non soumises à l'impôt sur les sociétés. Le financement sur fonds propres est " +
  "donc votre seul choix.";

/** Pourquoi l'éco-PTZ (collectif comme individuel) est fermé à ce copropriétaire ; null s'il est ouvert. */
export function motifSansEcoPtz(lots: readonly { usage: string }[], typeCoproprietaire: unknown): string | null {
  if (!ecoPtzPossible(lots)) return MOTIF_SANS_ECO_PTZ;
  if (sciSoumiseIs(typeCoproprietaire)) return MOTIF_SCI_IS;
  return null;
}

// Enquête sociale (retour de Marius MAZZANTE, 09/10/2026) : elle sert à établir le
// profil d'aides individuelles d'un ménage, donc elle ne concerne que les
// propriétaires d'un logement. Un copropriétaire qui n'a que des garages, caves,
// parkings ou locaux d'activité n'y répond pas. Une fiche sans aucun lot connu
// (lots jamais importés) reste concernée : rien ne dit qu'elle n'a pas de logement.

/** Vrai si le copropriétaire peut répondre à l'enquête sociale. */
export function peutRepondreEnquete(lots: readonly { usage: string }[]): boolean {
  return lots.length === 0 || lots.some((l) => l.usage === "habitation");
}

/** Identifiants des copropriétaires de la liste que l'enquête ne concerne pas (lots connus, aucun d'habitation). */
export function idsNonConcernesParEnquete(
  lots: readonly { coproprietaire_id: string | null; usage: string }[],
): Set<string> {
  const parProprietaire = new Map<string, { usage: string }[]>();
  for (const l of lots) {
    if (!l.coproprietaire_id) continue;
    const liste = parProprietaire.get(l.coproprietaire_id) ?? [];
    liste.push(l);
    parProprietaire.set(l.coproprietaire_id, liste);
  }
  return new Set([...parProprietaire].filter(([, ls]) => !peutRepondreEnquete(ls)).map(([id]) => id));
}

// « Mon financement » ne s'ouvre qu'une fois l'enquête sociale et technique transmise (règle
// d'Amir du 11/10/2026) : le plan d'aides individuel et le choix de financement en dépendent.

export type AccesFinancement = "ouvert" | "chargement" | "verrouille";

/**
 * Accès à l'étape « Mon financement ». Verrouillée tant que l'enquête, qui existe et concerne
 * ce copropriétaire, n'est pas transmise complète. Restent ouverts : un copropriétaire que
 * l'enquête ne concerne pas, une copropriété sans enquête (rien à transmettre) et un dossier
 * d'adhésion déjà engagé (bulletins signés ou en signature), dont les documents doivent rester
 * accessibles. `chargement` : les données qui décident ne sont pas encore là.
 */
export function accesFinancement(e: {
  enqueteConcerne: boolean;
  enqueteExiste: boolean;
  enqueteTransmise: boolean;
  dossierEngage: boolean;
  chargement: boolean;
}): AccesFinancement {
  if (!e.enqueteConcerne) return "ouvert";
  if (e.chargement) return "chargement";
  if (!e.enqueteExiste || e.enqueteTransmise || e.dossierEngage) return "ouvert";
  return "verrouille";
}

/** Message de l'encadré affiché à la place de « Mon financement » tant que l'enquête n'est pas transmise. */
export const MOTIF_FINANCEMENT_VERROUILLE =
  "Vous ne pourrez passer cette étape que lorsque vous aurez complété l'enquête sociale et technique.";

/** Explication affichée à un copropriétaire que l'enquête ne concerne pas. */
export const MOTIF_SANS_ENQUETE =
  "L'enquête sociale ne concerne que les propriétaires d'un lot d'habitation : elle sert à déterminer l'aide " +
  "individuelle d'un ménage. Vos lots (garage, cave, parking, local d'activité…) ne sont pas des logements, " +
  "aucune réponse n'est attendue de votre part.";

// ========== Date limite d'adhésion au prêt collectif (idée d'Amir du 11/10/2026) ==========
// Pas de date limite propre à l'éco-PTZ individuel ni aux fonds propres (date_limite_choix reste le
// dernier jour pour choisir ou modifier son financement). Le dépôt d'un dossier d'adhésion au prêt
// collectif, lui, a une date limite fixée à l'ouverture des adhésions ; une dernière relance peut
// proposer une deuxième date, qui fait alors foi. Passé ce jour, qui n'a pas déposé son dossier ne
// peut plus en ouvrir un ; qui l'a déposé (bulletin et mandat SEPA) peut encore ajouter des pièces
// pendant l'instruction.

/**
 * Durée du prêt collectif indiquée par un plan de financement (bug d'Amir du 13/10/2026 : le PF disait
 * 20 ans, l'onglet Financement restait à 15). Entière et dans les bornes de la colonne
 * copro_financement_config.duree_annees (3 à 20 ans) ; null si le plan n'en donne pas d'exploitable.
 */
export function dureePretDuPf(ans: unknown): number | null {
  if (typeof ans !== "number" || !Number.isFinite(ans)) return null;
  const d = Math.round(ans);
  return d >= 3 && d <= 20 ? d : null;
}

/** Date du jour à Paris, au format AAAA-MM-JJ (comparable à une colonne date). */
export function aujourdhuiParis(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

/** Date limite en vigueur : la deuxième quand la dernière relance en a fixé une, sinon la première. */
export function limiteAdhesion(
  config: { date_limite_adhesion?: string | null; date_limite_adhesion_2?: string | null } | null | undefined
): string | null {
  return config?.date_limite_adhesion_2 || config?.date_limite_adhesion || null;
}

/** La date limite est passée : le jour même est encore ouvert. */
export function adhesionDepassee(limite: string | null, aujourdhui: string = aujourdhuiParis()): boolean {
  return !!limite && aujourdhui > limite;
}

/**
 * Dossier d'adhésion déposé : au moins un bulletin sorti de la préparation (signé par le principal, en
 * signature ou scellé), ou un ancien dossier signé avant la signature électronique. Il reste ouvert à son
 * titulaire après la date limite : signatures des autres adhérents, pièces du prêt pendant l'instruction.
 */
export function dossierAdhesionDepose(
  bulletins: readonly { statut: string }[] | null | undefined,
  ancienDossierSigne = false
): boolean {
  return ancienDossierSigne || (bulletins ?? []).some((b) => b.statut !== "annule" && b.statut !== "brouillon");
}

/**
 * Dossier d'adhésion qu'un copropriétaire peut encore ouvrir ou terminer : campagne ouverte et date
 * limite pas dépassée. Un dossier déjà déposé est toujours accessible (suivi, signatures, pièces).
 */
export function adhesionPossible(e: {
  campagneOuverte: boolean;
  limite: string | null;
  aujourdhui?: string;
}): boolean {
  return e.campagneOuverte && !adhesionDepassee(e.limite, e.aujourdhui);
}
