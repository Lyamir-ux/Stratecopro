// Tri des copropriétaires par NOM de famille - feedback de Pierrot LEFOU
// (syndic) du 25/09/2026 : « classer les copropriétaires par ordre
// alphabétique des NOMS et pas des prénoms ».
//
// Le champ `coproprietaires.nom` est libre et les imports ne suivent pas tous
// la même convention : « NOM Prénom » (la plupart des listes de syndic),
// « Prénom NOM » (Résidence Stanislas), « Prénom Nom » sans capitales,
// personnes morales (« SCI … »), civilités entre parenthèses.
// Règle : le premier bloc de mots en capitales est le nom de famille. Sans
// capitales, la convention majoritaire de la liste tranche ; à défaut, le
// dernier mot (« Philippe Bauer »).

export type ConventionNoms = "nom-prenom" | "prenom-nom";

// civilités et qualités placées devant le nom (« Indivision HENRIOT », « M. et Mme DURAND »)
const PREFIXES = new Set([
  "m", "m.", "mm", "mm.", "mr", "mme", "mmes", "mlle", "melle", "monsieur", "madame", "mademoiselle",
  "messieurs", "mesdames", "epoux", "époux", "consort", "consorts", "indivision", "succession", "hoirie",
  "famille", "dr", "docteur", "me", "maitre", "maître", "et", "&",
]);

// personnes morales : triées sur leur dénomination complète (« SCI DU RIED » à S)
const FORMES_SOCIALES = new Set([
  "sci", "s.c.i", "s.c.i.", "sarl", "sas", "sasu", "eurl", "snc", "scp", "sccv", "scpi", "sa", "sem", "selarl",
  "gie", "oph", "opac", "association", "commune", "ville", "syndicat", "societe", "société", "ste", "sté",
  "cabinet", "fondation", "mutuelle", "banque", "office",
]);

// mots de liaison jamais pris pour un nom, même écrits en capitales
const LIAISONS = new Set(["ET", "&", "/", "-", "OU"]);

/** Mot écrit en capitales (au moins deux lettres qui se suivent, aucune minuscule). */
function enCapitales(mot: string): boolean {
  return !LIAISONS.has(mot) && /\p{Lu}{2,}/u.test(mot) && !/\p{Ll}/u.test(mot);
}

/** Mots du nom sans civilité entre parenthèses ni préfixe (« Indivision », « M. et Mme »). */
function mots(nom: string): { mots: string[]; prefixes: string[] } {
  const tous = nom.replace(/\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean);
  const prefixes: string[] = [];
  while (tous.length > 1 && PREFIXES.has(tous[0].toLowerCase())) prefixes.push(tous.shift()!);
  return { mots: tous, prefixes };
}

/** Position du premier bloc en capitales (-1 : aucun). */
function debutCapitales(ms: string[]): number {
  return ms.findIndex(enCapitales);
}

/**
 * Convention majoritaire d'une liste : « NOM Prénom » quand le nom en
 * capitales ouvre le libellé, « Prénom NOM » quand il le ferme. Les libellés
 * tout en capitales ou sans capitales ne départagent pas ; sans indice, la
 * liste est lue « Prénom Nom ».
 */
export function conventionNoms(noms: string[]): ConventionNoms {
  let nomPrenom = 0;
  let prenomNom = 0;
  for (const nom of noms) {
    const { mots: ms } = mots(nom);
    if (ms.length < 2 || FORMES_SOCIALES.has(ms[0].toLowerCase())) continue;
    const i = debutCapitales(ms);
    if (i < 0 || ms.every((m) => enCapitales(m) || LIAISONS.has(m))) continue;
    if (i === 0) nomPrenom++;
    else prenomNom++;
  }
  return nomPrenom > prenomNom ? "nom-prenom" : "prenom-nom";
}

/**
 * Clé de tri d'un copropriétaire : son nom de famille d'abord, puis le reste
 * (prénoms, préfixes) pour départager les homonymes.
 *   « Bernard et Josiane LECLERC » → « LECLERC Bernard et Josiane »
 *   « SCHNEIDER Delphine »         → « SCHNEIDER Delphine »
 *   « Philippe Bauer »             → « Bauer Philippe » (convention prénom-nom)
 */
export function cleNomFamille(nom: string, convention: ConventionNoms = "prenom-nom"): string {
  const { mots: ms, prefixes } = mots(nom);
  if (ms.length === 0) return nom.trim();
  const fin = prefixes.length ? [...prefixes] : [];
  if (ms.length === 1 || FORMES_SOCIALES.has(ms[0].toLowerCase())) return [...ms, ...fin].join(" ");
  const i = debutCapitales(ms);
  if (i > 0) {
    // « Prénom(s) NOM » : le bloc en capitales passe devant
    let j = i;
    while (j < ms.length && (enCapitales(ms[j]) || (LIAISONS.has(ms[j]) && j + 1 < ms.length && enCapitales(ms[j + 1])))) j++;
    return [...ms.slice(i, j), ...ms.slice(0, i), ...ms.slice(j), ...fin].join(" ");
  }
  if (i === 0 || convention === "nom-prenom") return [...ms, ...fin].join(" ");
  // « Prénom Nom » sans capitales : le dernier mot est le nom
  return [ms[ms.length - 1], ...ms.slice(0, -1), ...fin].join(" ");
}

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** Copie de la liste triée par nom de famille (convention déduite de la liste elle-même). */
export function trierParNomFamille<T>(items: readonly T[], nomDe: (t: T) => string): T[] {
  const convention = conventionNoms(items.map(nomDe));
  const cles = new Map(items.map((t) => [t, cleNomFamille(nomDe(t), convention)] as const));
  return [...items].sort((a, b) => collator.compare(cles.get(a)!, cles.get(b)!) || collator.compare(nomDe(a), nomDe(b)));
}
