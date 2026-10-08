// Bascule entre la vue AMO et la vue syndic d'un même dossier (idée d'Amir du
// 03/10/2026) : l'onglet ouvert garde son équivalent de l'autre côté, à défaut
// l'onglet Projet. La vue syndic d'un compte AMO est l'aperçu de l'espace
// syndic (RequireRole laisse passer l'AMO).

/** Onglets AMO qui ont leur pendant dans l'espace syndic. */
const AMO_VERS_SYNDIC: Record<string, string> = {
  projet: "projet",
  donnees: "donnees",
  financement: "financement",
  enquete: "enquete",
  fichiers: "fichiers",
};

/** Onglets syndic vers l'AMO : le montage bancaire et le suivi financier
 *  n'ont pas d'onglet AMO, les plans de financement en sont le plus proche. */
const SYNDIC_VERS_AMO: Record<string, string> = {
  projet: "projet",
  donnees: "donnees",
  financement: "financement",
  enquete: "enquete",
  fichiers: "fichiers",
  banque: "financement",
  suivi: "financement",
};

/** Page du dossier dans l'espace syndic, sur l'onglet équivalent. */
export function lienVueSyndic(coproId: string, ongletAmo?: string): string {
  return `/syndic/copros/${coproId}/${(ongletAmo && AMO_VERS_SYNDIC[ongletAmo]) || "projet"}`;
}

/** Portail copropriétaire en aperçu AMO, ouvert sur la liste des copropriétaires
 *  du dossier (idée d'Amir du 08/10/2026) : le portail est propre à chaque
 *  copropriétaire, il faut donc en choisir un (le seul s'il est unique). */
export function lienVueCopropriete(coproId: string): string {
  return `/portail?copro=${encodeURIComponent(coproId)}`;
}

/** Page du dossier dans l'espace AMO, sur l'onglet équivalent. */
export function lienVueAmo(coproId: string, ongletSyndic?: string): string {
  return `/copros/${coproId}/${(ongletSyndic && SYNDIC_VERS_AMO[ongletSyndic]) || "projet"}`;
}
