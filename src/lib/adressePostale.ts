// Adresse postale d'un copropriétaire découpée en rue / code postal / ville, pour
// pré-remplir les coordonnées du dossier d'adhésion (idée de A CHELGHAM,
// 09/10/2026 : « proposez l'adresse postale qui est dans l'enquête ou dans
// l'import »). L'import est du texte libre (« 9 rue Fabert, 57000 Metz ») ; l'enquête pose
// rue, code postal et ville en trois questions depuis le 11/10/2026 (un seul champ avant).

export interface AdresseDecoupee {
  adresse: string;
  cp: string;
  ville: string;
}

/** Le dernier groupe de 5 chiffres est le code postal (un numéro de rue en a rarement
 *  autant) ; ce qui le précède est la rue, ce qui le suit la commune. Sans code
 *  postal, tout est rangé dans la rue. */
export function decouperAdressePostale(brut: string | null | undefined): AdresseDecoupee {
  const t = (brut ?? "").replace(/\s+/g, " ").trim();
  if (!t) return { adresse: "", cp: "", ville: "" };
  let dernier: RegExpExecArray | null = null;
  const re = /\b(\d{5})\b/g;
  for (let m = re.exec(t); m; m = re.exec(t)) dernier = m;
  if (!dernier) return { adresse: t, cp: "", ville: "" };
  const avant = t.slice(0, dernier.index).replace(/[\s,;-]+$/, "");
  const apres = t.slice(dernier.index + 5).replace(/^[\s,;-]+/, "");
  // code postal en tête (« 57000 Metz, 9 rue Fabert ») : la suite est la rue
  if (!avant) return { adresse: apres, cp: dernier[1], ville: "" };
  return { adresse: avant, cp: dernier[1], ville: apres };
}

export type SourceAdresse = "enquete" | "import";

/** L'adresse que le copropriétaire a donnée dans l'enquête l'emporte (adresse de
 *  contact, qui peut différer du lot) ; à défaut celle de la fiche importée. */
export function adresseConnue(
  adresseEnquete: AdresseDecoupee | null,
  adresseFiche: string | null | undefined,
): (AdresseDecoupee & { source: SourceAdresse }) | null {
  if (adresseEnquete) return { ...adresseEnquete, source: "enquete" };
  if (adresseFiche && adresseFiche.trim()) return { ...decouperAdressePostale(adresseFiche), source: "import" };
  return null;
}

/** Adresse postale donnée dans l'enquête : rue, code postal et ville sont trois questions
 *  depuis le 11/10/2026 (retour de A CHELGHAM) ; une réponse plus ancienne tient en un seul
 *  champ « N°, rue, code postal, ville », découpé ici. Null sans aucune réponse. */
export function adresseDeLEnquete(reponses: unknown): AdresseDecoupee | null {
  const rue = reponseIdentiteEnquete(reponses, "adresse");
  const cp = reponseIdentiteEnquete(reponses, "code-postal");
  const ville = reponseIdentiteEnquete(reponses, "ville");
  if (!rue && !cp && !ville) return null;
  const d = decouperAdressePostale(rue);
  return { adresse: d.adresse, cp: cp ?? d.cp, ville: ville ?? d.ville };
}

/** Ancienne réponse « N°, rue, code postal, ville » rangée dans les trois questions de
 *  l'enquête, sans rien écraser : seulement si ni le code postal ni la ville ne sont répondus
 *  et que l'adresse se découpe en entier. Seules les clés à changer sont renvoyées. */
export function adresseEnqueteSeparee(
  copro: Record<string, unknown>,
): { adresse?: string; "code-postal"?: string; ville?: string } {
  const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (texte(copro["code-postal"]) || texte(copro.ville)) return {};
  const d = decouperAdressePostale(texte(copro.adresse));
  if (!d.adresse || !d.cp || !d.ville) return {};
  return { adresse: d.adresse, "code-postal": d.cp, ville: d.ville };
}

/** Réponse à une question d'identité de l'enquête (« adresse », « telephone »…) : le
 *  questionnaire range ses réponses sous `reponses.copro` (celles du copropriétaire) et
 *  `reponses.lots` (une par lot) - jamais à la racine. Texte non vide, sinon null. */
export function reponseIdentiteEnquete(reponses: unknown, id: string): string | null {
  const copro = (reponses as { copro?: Record<string, unknown> } | null | undefined)?.copro;
  const v = copro?.[id];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

