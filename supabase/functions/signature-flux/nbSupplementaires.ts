// Adhérents supplémentaires d'un bulletin à sceller (retour de SCI SCHMITT PATRIMOINE du 13/10/2026 :
// « seules la première page affiche des signatures, la signature de l'adhérent 3 n'apparaît jamais »).
// Fichier sans import : testé par vitest (src/lib/__tests__/signatureSupplementaires.test.ts).

/** Pages du gabarit CEGEE : une page formulaire (adhérents 1 et 2) puis deux pages de conditions.
 *  Identique à la taille du gabarit lu par genBulletin (src/lib/pdf/adhesion.ts). */
export const PAGES_GABARIT_BULLETIN = 3;

/**
 * Nombre d'adhérents supplémentaires du bulletin, c'est-à-dire de pages formulaire insérées après la
 * première (une par adhérent, dans l'ordre de déclaration).
 *
 * Les pages du document à sceller font foi : le brouillon du formulaire (`adhesions_pret.form`) a pu
 * perdre `adherentsSupplementaires` - le portail le réécrivait sans cette clé à l'étape RIB avant le
 * 14/10/2026 - et le scellement prenait alors un dossier à trois signataires pour un dossier
 * d'avant le 12/10/2026 : mention de deux personnes sur la première page, rien sur les autres pages.
 *  - plus de pages que le gabarit : l'excédent ;
 *  - sinon, la clé du formulaire dit « nouveau format sans adhérent supplémentaire » (0) ;
 *    absente, c'est un dossier d'avant le 12/10/2026 (null : le premier cosignataire signe la case
 *    « Adhérent 2 », faute de page dédiée).
 */
export function nbAdherentsSupplementaires(pagesBulletin: number, formSupplementaires: unknown): number | null {
  if (pagesBulletin > PAGES_GABARIT_BULLETIN) return pagesBulletin - PAGES_GABARIT_BULLETIN;
  return Array.isArray(formSupplementaires) ? 0 : null;
}
