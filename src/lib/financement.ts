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
