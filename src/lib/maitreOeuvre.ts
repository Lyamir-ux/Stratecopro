// Correspondance entre le champ « Maître d'œuvre » d'un dossier (texte libre,
// coproprietes.maitre_oeuvre) et les fiches de la Base prestataires - même
// règle que les fonctions SQL nom_moe_normalise / moe_cite (0120) qui ouvrent
// « Mes projets » au maître d'œuvre : la raison sociale doit figurer en mots
// entiers dans le champ, casse et ponctuation ignorées (« AMC sous-traitant
// Ingedair » cite AMC et Ingedair).
// Bug d'Amir du 01/10/2026 : un nouveau maître d'œuvre doit toujours avoir sa
// fiche, pour qu'on y saisisse ses e-mails.
import { normaliserNomOrganisation } from "@/lib/organisations";

/** Comme nom_moe_normalise : minuscules, tout ce qui n'est ni lettre ni chiffre devient un espace. */
export function nomMoeNormalise(nom: string | null | undefined): string {
  return (nom ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Comme moe_cite : la raison sociale figure en mots entiers dans le champ. */
export function moeCite(champ: string | null | undefined, raisonSociale: string): boolean {
  const r = nomMoeNormalise(raisonSociale);
  return !!r && ` ${nomMoeNormalise(champ)} `.includes(` ${r} `);
}

export interface FicheNommee {
  raison_sociale: string;
}

/**
 * Ce que devient un maître d'œuvre saisi : la fiche du même nom (casse et
 * accents ignorés, sa graphie est reprise), sinon une fiche à créer sous le
 * nom saisi. Pour un champ en texte libre (onglet Données), un nom qui cite
 * déjà une ou plusieurs fiches (« AMC sous-traitant Ingedair ») ne crée rien :
 * le dossier est déjà relié à ces fiches. Le choix explicite « Nouveau maître
 * d'œuvre » de la création passe `citationSuffit: false`.
 */
export function resoudreMaitreOeuvre<T extends FicheNommee>(
  saisie: string,
  fiches: readonly T[],
  { citationSuffit = true }: { citationSuffit?: boolean } = {}
): { nom: string; fiche: T | null; ficheACreer: boolean } {
  const nom = saisie.trim().replace(/\s+/g, " ");
  if (!nom) return { nom: "", fiche: null, ficheACreer: false };
  const cible = normaliserNomOrganisation(nom);
  const meme = fiches.find((f) => normaliserNomOrganisation(f.raison_sociale) === cible);
  if (meme) return { nom: meme.raison_sociale, fiche: meme, ficheACreer: false };
  const citee = citationSuffit ? (fiches.find((f) => moeCite(nom, f.raison_sociale)) ?? null) : null;
  return { nom, fiche: citee, ficheACreer: !citee };
}
