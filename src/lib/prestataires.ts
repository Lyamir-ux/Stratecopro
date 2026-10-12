import { normaliserRecherche } from "@/lib/format";

type EntrepriseCherchable = {
  raison_sociale: string;
  ville: string | null;
  contact_nom: string | null;
};

/** Entreprises dont le nom, les métiers, la ville ou le contact contiennent la
 *  recherche, sans tenir compte des accents ni des majuscules. Recherche vide :
 *  toutes. Sert au choix de l'entreprise dans l'aperçu AMO de l'espace prestataire. */
export function filtrerEntreprises<T extends EntrepriseCherchable>(
  liste: T[],
  recherche: string,
  metiers: (p: T) => string
): T[] {
  const q = normaliserRecherche(recherche.trim());
  if (!q) return liste;
  return liste.filter((p) =>
    normaliserRecherche([p.raison_sociale, metiers(p), p.ville ?? "", p.contact_nom ?? ""].join(" ")).includes(q)
  );
}

/** Une adresse de l'entreprise à laquelle on peut envoyer une consultation. */
export interface AdresseEntreprise {
  email: string;
  origine: "principale" | "copie" | "contact";
  /** Nom (et fonction) du contact, pour les adresses de contact. */
  libelle: string | null;
  /** Reçoit l'alerte si l'équipe ne choisit rien : l'adresse principale et celles en copie (0106). */
  parDefaut: boolean;
}

/**
 * Adresses d'une entreprise proposées pour l'envoi d'une consultation (idée de
 * Louis du 05/10/2026) : la principale, celles en copie, puis les adresses de
 * ses contacts. Casse et espaces ignorés, doublons retirés (la première
 * occurrence garde son rang). Même périmètre que notifier-consultation, qui
 * recoupe le choix enregistré avec la fiche au moment de l'envoi.
 */
export function adressesEntreprise(
  p: { email: string | null; emails_secondaires: readonly string[] | null },
  contacts: readonly { nom: string; role: string | null; email: string | null }[]
): AdresseEntreprise[] {
  const vues = new Set<string>();
  const liste: AdresseEntreprise[] = [];
  const ajouter = (brut: string | null | undefined, origine: AdresseEntreprise["origine"], libelle: string | null) => {
    const email = (brut ?? "").trim().toLowerCase();
    if (!email || vues.has(email)) return;
    vues.add(email);
    liste.push({ email, origine, libelle, parDefaut: origine !== "contact" });
  };
  ajouter(p.email, "principale", null);
  for (const e of p.emails_secondaires ?? []) ajouter(e, "copie", null);
  for (const c of contacts) ajouter(c.email, "contact", [c.nom, c.role].filter((v) => v?.trim()).join(", ") || null);
  return liste;
}

/** Les adresses qui reçoivent l'alerte sans choix de l'équipe. */
export function adressesParDefaut(adresses: readonly AdresseEntreprise[]): string[] {
  return adresses.filter((a) => a.parDefaut).map((a) => a.email);
}

/** Le choix de l'équipe est-il celui d'office (principale + copies) ? Alors rien n'est à enregistrer. */
export function estChoixParDefaut(choisies: ReadonlySet<string> | readonly string[], adresses: readonly AdresseEntreprise[]): boolean {
  const choix = new Set(choisies);
  const defaut = adressesParDefaut(adresses);
  return choix.size === defaut.length && defaut.every((e) => choix.has(e));
}

/** Pourquoi une entreprise du métier ne peut pas recevoir l'alerte d'une
 *  consultation (null : elle peut la recevoir). Même règle que
 *  notifier-consultation : fiche active, avec un e-mail, sans « Ne pas consulter ». */
export function motifNonAlertable(p: { actif: boolean; email: string | null; ne_pas_consulter: boolean }): string | null {
  if (!p.actif) return "Fiche suspendue";
  if (!p.email?.trim()) return "Sans e-mail";
  if (p.ne_pas_consulter) return "Ne souhaite pas être consultée";
  return null;
}

/** Adresses de la fiche (principale puis autres), en minuscules, sans doublon. */
export function adressesFiche(email: string | null | undefined, secondaires: readonly string[] | null | undefined): string[] {
  return [...new Set([email ?? "", ...(secondaires ?? [])].map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

/**
 * Adresses dont la personne perdrait son accès à l'enregistrement (0162 :
 * retirer une adresse de la fiche retire l'accès). `avecAcces` : adresses qui
 * ont un compte relié à la fiche.
 */
export function accesPerdus(
  avecAcces: readonly string[],
  email: string | null | undefined,
  secondaires: readonly string[] | null | undefined
): string[] {
  const gardees = new Set(adressesFiche(email, secondaires));
  return [...new Set(avecAcces.map((e) => e.trim().toLowerCase()))].filter((e) => e && !gardees.has(e));
}

/** Décompte des accès d'une entreprise, adresse par adresse (0162). */
export interface ResumeAcces {
  total: number;
  actifs: number;
  invites: number;
  aCreer: number;
  pris: number;
}

export function resumeAcces(adresses: readonly { etat: string }[]): ResumeAcces {
  const n = (etat: string) => adresses.filter((a) => a.etat === etat).length;
  return { total: adresses.length, actifs: n("actif"), invites: n("invite"), aCreer: n("a_creer"), pris: n("email_pris") };
}

/** Dernier envoi d'une consultation à une adresse. */
export interface EnvoiAdresse {
  email: string;
  statut: string;
  sentAt: string;
}

/** Entreprise alertée pour une consultation, et ses adresses servies. */
export interface EnvoisEntreprise {
  prestataireId: string | null;
  raisonSociale: string;
  adresses: EnvoiAdresse[];
}

/**
 * Journal d'une consultation regroupé par entreprise, adresse par adresse : le
 * dernier envoi de chaque adresse l'emporte (une erreur retentée puis envoyée
 * s'affiche « Envoyé »). Depuis notifier-consultation v18 le journal a une
 * ligne par adresse ; les lignes plus anciennes regroupent les adresses d'une
 * entreprise, séparées par « , ». Entreprises et adresses dans l'ordre du
 * premier envoi.
 */
export function envoisParEntreprise(
  lignes: readonly {
    prestataire_id: string | null;
    email: string;
    statut: string;
    sent_at: string;
    prestataire?: { raison_sociale: string } | null;
  }[]
): EnvoisEntreprise[] {
  const ordonnees = [...lignes].sort((a, b) => (a.sent_at < b.sent_at ? -1 : a.sent_at > b.sent_at ? 1 : 0));
  const parEntreprise = new Map<string, { raisonSociale: string; prestataireId: string | null; adresses: Map<string, EnvoiAdresse> }>();
  for (const l of ordonnees) {
    const cle = l.prestataire_id ?? `sans-fiche:${l.email}`;
    const e = parEntreprise.get(cle) ?? {
      raisonSociale: l.prestataire?.raison_sociale ?? l.email,
      prestataireId: l.prestataire_id,
      adresses: new Map<string, EnvoiAdresse>(),
    };
    for (const brut of l.email.split(",")) {
      const email = brut.trim().toLowerCase();
      if (email) e.adresses.set(email, { email, statut: l.statut, sentAt: l.sent_at });
    }
    parEntreprise.set(cle, e);
  }
  return [...parEntreprise.values()].map((e) => ({
    prestataireId: e.prestataireId,
    raisonSociale: e.raisonSociale,
    adresses: [...e.adresses.values()],
  }));
}
