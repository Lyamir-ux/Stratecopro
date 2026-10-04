// Gestionnaires de copropriété déjà saisis sur les dossiers (idée d'Amir du
// 04/10/2026) : à la création d'un dossier, un gestionnaire connu propose
// directement l'adresse e-mail enregistrée. Les comptes syndic n'exposent pas
// leur e-mail à l'application : la source est la fiche des dossiers.
import { normaliserNomOrganisation } from "./organisations";

export interface EmailGestionnaire {
  email: string;
  /** Syndic du dossier le plus récent portant ce couple nom / e-mail. */
  syndic: string | null;
  /** Nombre de dossiers où ce couple est saisi. */
  dossiers: number;
}

export interface GestionnaireConnu {
  /** Graphie la plus fréquente du nom. */
  nom: string;
  /** Adresses enregistrées pour ce nom, la plus fréquente d'abord. */
  emails: EmailGestionnaire[];
}

type DossierGestionnaire = {
  gestionnaire_nom: string | null;
  gestionnaire_email: string | null;
  syndic_name: string | null;
};

/** Gestionnaires qui ont un e-mail sur au moins un dossier, un par nom (casse, accents et espaces ignorés), par ordre alphabétique. */
export function gestionnairesConnus(dossiers: readonly DossierGestionnaire[]): GestionnaireConnu[] {
  const parNom = new Map<string, { graphies: Map<string, number>; emails: Map<string, EmailGestionnaire> }>();
  for (const d of dossiers) {
    const nom = d.gestionnaire_nom?.trim().replace(/\s+/g, " ");
    const email = d.gestionnaire_email?.trim().toLowerCase();
    if (!nom || !email) continue;
    const cle = normaliserNomOrganisation(nom);
    const g = parNom.get(cle) ?? { graphies: new Map(), emails: new Map() };
    g.graphies.set(nom, (g.graphies.get(nom) ?? 0) + 1);
    const e = g.emails.get(email) ?? { email, syndic: null, dossiers: 0 };
    e.dossiers++;
    e.syndic = e.syndic ?? (d.syndic_name?.trim() || null);
    g.emails.set(email, e);
    parNom.set(cle, g);
  }
  return [...parNom.values()]
    .map((g) => ({
      nom: [...g.graphies.entries()].sort((a, b) => b[1] - a[1])[0][0],
      emails: [...g.emails.values()].sort((a, b) => b.dossiers - a.dossiers || a.email.localeCompare(b.email)),
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
}

/**
 * Adresses enregistrées pour le nom saisi (casse, accents et espaces ignorés),
 * celles du syndic saisi d'abord, puis la plus fréquente ; vide si le nom est inconnu.
 */
export function emailsDuGestionnaire(connus: readonly GestionnaireConnu[], nom: string, syndic?: string | null): EmailGestionnaire[] {
  const cle = normaliserNomOrganisation(nom);
  if (!cle) return [];
  const g = connus.find((x) => normaliserNomOrganisation(x.nom) === cle);
  if (!g) return [];
  const s = normaliserNomOrganisation(syndic ?? "");
  const memeSyndic = (e: EmailGestionnaire) => !!s && normaliserNomOrganisation(e.syndic ?? "") === s;
  return [...g.emails].sort((a, b) => Number(memeSyndic(b)) - Number(memeSyndic(a)));
}
