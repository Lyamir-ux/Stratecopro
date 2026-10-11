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

// qualités qui désignent plusieurs personnes : pas de prénom / nom à en tirer
const COLLECTIFS = new Set([
  "et", "&", "mm", "mmes", "messieurs", "mesdames", "epoux", "époux", "consort", "consorts",
  "indivision", "succession", "hoirie", "famille",
]);

/**
 * Sépare le libellé d'UNE personne en prénom et nom de famille, pour préremplir le signataire
 * d'un bulletin (retour de Pierre MAXTAFF, 09/10/2026 : « Pierre MAXTAFF » arrivait en entier
 * dans le champ Nom, le prénom restait vide). Même règle que le tri : le bloc de mots en
 * capitales est le nom, le reste est le prénom. Prudent : null quand on ne peut pas trancher
 * (couple, indivision, société, tout en capitales, plus de deux mots sans capitales) - les
 * champs restent alors vides plutôt que faux.
 *   « Pierre MAXTAFF »      → { prenom: « Pierre », nom: « MAXTAFF » }
 *   « SCHNEIDER Delphine »  → { prenom: « Delphine », nom: « SCHNEIDER » }
 *   « Jean DE LA FONTAINE » → { prenom: « Jean », nom: « DE LA FONTAINE » }
 */
export function decouperNomPrenom(nom: string): { prenom: string; nom: string } | null {
  const { mots: ms, prefixes } = mots(nom);
  if (ms.length === 0) return null;
  if (prefixes.some((p) => COLLECTIFS.has(p.toLowerCase()))) return null;
  if (FORMES_SOCIALES.has(ms[0].toLowerCase()) || ms.some((m) => LIAISONS.has(m.toUpperCase()))) return null;
  if (ms.length === 1) return { prenom: "", nom: ms[0] };
  const i = debutCapitales(ms);
  if (i < 0) return ms.length === 2 ? { prenom: ms[0], nom: ms[1] } : null;
  if (ms.every(enCapitales)) return null;
  let j = i;
  while (j < ms.length && enCapitales(ms[j])) j++;
  return { prenom: [...ms.slice(0, i), ...ms.slice(j)].join(" "), nom: ms.slice(i, j).join(" ") };
}

/**
 * Nom et prénom proposés dans l'enquête sociale, qui pose deux questions séparées et plus de
 * raison sociale (retour de A CHELGHAM du 11/10/2026 : « pour la base de données et pour éviter
 * les erreurs futures »). Une réponse déjà enregistrée est gardée ; un ancien « nom complet »
 * sans prénom est séparé quand on peut le trancher ; sans réponse, on part du libellé de la
 * fiche, mais seulement s'il s'agit d'une personne (ni couple, ni indivision, ni société : la
 * personne qui répond saisit alors elle-même ses nom et prénom). Une initiale tirée d'un libellé
 * (« A CHELGHAM ») n'est pas un prénom : seul le nom est proposé. Seules les clés connues sont
 * renvoyées, pour ne pas écraser une réponse par du vide.
 *   (rien, « Pierre MAXTAFF »)               → { nom: « MAXTAFF », prenom: « Pierre » }
 *   ({ nom: « Pierre MAXTAFF » }, …)         → { nom: « MAXTAFF », prenom: « Pierre » }
 *   (rien, « A CHELGHAM »)                   → { nom: « CHELGHAM » }
 *   (rien, « SCI DU PLATEAU DE HAYE »)       → {}
 */
export function nomPrenomEnquete(
  stocke: { nom?: unknown; prenom?: unknown },
  libelleFiche: string
): { nom?: string; prenom?: string } {
  const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const nom = texte(stocke.nom);
  const prenom = texte(stocke.prenom);
  const resultat = (n: string | undefined, p: string | undefined) => ({
    ...(n ? { nom: n } : {}),
    ...(p ? { prenom: p } : {}),
  });
  if (prenom) return resultat(nom, prenom);
  const d = decouperNomPrenom(nom || libelleFiche);
  const prenomTire = d?.prenom && !initialesSeules(d.prenom) ? d.prenom : undefined;
  if (nom) return prenomTire ? resultat(d!.nom, prenomTire) : resultat(nom, undefined);
  return d ? resultat(d.nom, prenomTire) : {};
}

/** « A », « A. », « J.-P. » : des initiales, pas un prénom. */
function initialesSeules(prenom: string): boolean {
  return /^\p{L}\.?(?:[\s-]+\p{L}\.?)*$/u.test(prenom.trim());
}

/**
 * Nom et prénom que le copropriétaire a donnés dans l'enquête sociale (réponses rangées sous
 * `reponses.copro`), pour préremplir son dossier d'adhésion au prêt collectif (retour de
 * A CHELGHAM du 11/10/2026 : « nom et prénom n'ont pas été repris de l'enquête sociale »).
 * Vide sans réponse : le libellé de la fiche reste alors la seule source.
 */
export function identiteEnquete(reponses: unknown): { nom?: string; prenom?: string } {
  const copro = (reponses as { copro?: { nom?: unknown; prenom?: unknown } } | null | undefined)?.copro;
  return copro ? nomPrenomEnquete(copro, "") : {};
}

/**
 * « Nom et prénom » d'un adhérent vers son nom et son prénom, sur la convention du formulaire
 * d'adhésion : le nom d'abord (« DUPONT Marie »). Le bloc en capitales est le nom quand il y en a
 * un ; sinon le premier mot est le nom et le reste le prénom. Sert à créer le signataire de
 * l'adhérent 2 d'après ce qui est saisi dans le formulaire (retour de A CHELGHAM du 11/10/2026 :
 * « il n'y a plus qu'à demander l'adresse mail »).
 *   « CHELGHAM Hassina » → { nom: « CHELGHAM », prenom: « Hassina » }
 *   « Chelgham Hassina » → { nom: « Chelgham », prenom: « Hassina » }
 *   « Hassina CHELGHAM » → { nom: « CHELGHAM », prenom: « Hassina » }
 */
export function separerNomPrenom(nomPrenom: string): { nom: string; prenom: string } {
  const brut = nomPrenom.trim().replace(/\s+/g, " ");
  const { mots: ms } = mots(brut);
  if (ms.length === 0) return { nom: brut, prenom: "" };
  if (ms.some(enCapitales)) {
    const d = decouperNomPrenom(brut);
    if (d?.nom && d.prenom) return d;
  }
  return { nom: ms[0], prenom: ms.slice(1).join(" ") };
}

/** Le nom ET le prénom sont renseignés (au moins deux mots). */
export function nomEtPrenomRenseignes(nomPrenom: string): boolean {
  return mots(nomPrenom.trim()).mots.length >= 2;
}
