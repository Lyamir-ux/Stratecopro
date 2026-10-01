// Correspondance entre le nom de syndic saisi sur un dossier (texte libre) et
// les enseignes de Paramètres → Organisations. Feedback Amir du 17/09/2026 :
// remplacer « Citya Ruhl Segesca » par « Citya Immo 4 » sur la fiche des
// Anémones laissait le dossier chez Ruhl Segesca dans l'espace syndic, car le
// rattachement (organisation_id) et le nom (syndic_name) sont deux champs.

export interface OrganisationNommee {
  id: string;
  nom: string;
}

/** Nom d'enseigne normalisé pour la comparaison : casse, accents et espaces ignorés. */
export function normaliserNomOrganisation(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * L'enseigne dont le nom correspond au syndic saisi, sinon null.
 * Un nom qui ne correspond à aucune enseigne ne détache rien : l'appelant
 * conserve alors le rattachement existant (cas d'un syndic hors plateforme
 * ou d'un libellé différent de l'enseigne, ex. « Foncia Colmar » chez GT Immo).
 */
export function trouverOrganisationParNom<T extends OrganisationNommee>(
  organisations: readonly T[],
  syndicName: string | null | undefined
): T | null {
  const cible = normaliserNomOrganisation(syndicName ?? "");
  if (!cible) return null;
  return organisations.find((o) => normaliserNomOrganisation(o.nom) === cible) ?? null;
}

/**
 * Nom de l'organisation créée pour le syndic bénévole d'un dossier, sur le
 * modèle des enseignes déjà en base (« Syndic Bénévole HERMITE », « Syndic
 * Bénévole TROIS FIGUIERS ») : une organisation par copropriété, le nom du
 * dossier en capitales, sans le préfixe « Copropriété des / du / de la ».
 * Feedback d'Amir du 01/10/2026.
 */
export function nomSyndicBenevole(nomCopro: string): string {
  const nom = nomCopro
    .trim()
    .replace(/^copropri[ée]t[ée]s?\s+(?:(?:des|du|de\s+la|de\s+l['’]|de|d['’])\s*)?/i, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
  return nom ? `Syndic Bénévole ${nom}` : "Syndic Bénévole";
}

/**
 * `base` si aucune enseigne ne porte déjà ce nom (casse et accents ignorés),
 * sinon `base (2)`, `base (3)`… - deux syndics bénévoles homonymes restent
 * deux organisations distinctes.
 */
export function nomOrganisationDisponible(base: string, organisations: readonly OrganisationNommee[]): string {
  const pris = new Set(organisations.map((o) => normaliserNomOrganisation(o.nom)));
  if (!pris.has(normaliserNomOrganisation(base))) return base;
  for (let i = 2; ; i++) {
    const nom = `${base} (${i})`;
    if (!pris.has(normaliserNomOrganisation(nom))) return nom;
  }
}
