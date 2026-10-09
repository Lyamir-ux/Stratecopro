// Adresse postale d'un copropriétaire découpée en rue / code postal / ville, pour
// pré-remplir les coordonnées du dossier d'adhésion (idée de A CHELGHAM,
// 09/10/2026 : « proposez l'adresse postale qui est dans l'enquête ou dans
// l'import »). Les deux sources sont du texte libre : « 9 rue Fabert, 57000 Metz »
// (import), « N°, rue, code postal, ville » (réponse de l'enquête).

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
  reponseEnquete: unknown,
  adresseFiche: string | null | undefined,
): { texte: string; source: SourceAdresse } | null {
  if (typeof reponseEnquete === "string" && reponseEnquete.trim()) {
    return { texte: reponseEnquete.trim(), source: "enquete" };
  }
  if (adresseFiche && adresseFiche.trim()) return { texte: adresseFiche.trim(), source: "import" };
  return null;
}
