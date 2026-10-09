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

/** Explication affichée à un copropriétaire que l'enquête ne concerne pas. */
export const MOTIF_SANS_ENQUETE =
  "L'enquête sociale ne concerne que les propriétaires d'un lot d'habitation : elle sert à déterminer l'aide " +
  "individuelle d'un ménage. Vos lots (garage, cave, parking, local d'activité…) ne sont pas des logements, " +
  "aucune réponse n'est attendue de votre part.";
