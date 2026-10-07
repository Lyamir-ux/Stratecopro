// Vérification RGE des entreprises (07/10/2026, demande d'Amir) : au dépôt d'un
// devis ou d'une DPGF de travaux, le chef de projet voit si l'entreprise est
// RGE, pour quels domaines de travaux, jusqu'à quand, et récupère le
// certificat de l'organisme.
//
// Source : « Liste des entreprises RGE » de l'ADEME (data.gouv.fr), servie par
// l'API data-fair de data.ademe.fr - publique, sans clé, mise à jour chaque
// jour. Une ligne = une qualification d'un établissement (SIRET) : domaine de
// travaux, organisme (Qualibat, Qualit'EnR, Qualifelec…), dates de validité et
// lien vers le certificat. La liste garde quelques qualifications échues : la
// validité se juge toujours sur les dates, jamais sur la seule présence.
//
// Module pur (sans accès réseau) : lecture des lignes, validité, domaines
// attendus d'après l'objet du document. Appels réseau dans src/api/rge.ts.

export const API_RGE = "https://data.ademe.fr/data-fair/api/v1/datasets/liste-des-entreprises-rge-2";

/** Champs demandés à l'API (une ligne par qualification). */
export const CHAMPS_RGE = [
  "siret",
  "nom_entreprise",
  "adresse",
  "code_postal",
  "commune",
  "code_qualification",
  "nom_qualification",
  "url_qualification",
  "nom_certificat",
  "domaine",
  "meta_domaine",
  "organisme",
  "lien_date_debut",
  "lien_date_fin",
].join(",");

export interface LigneRge {
  siret: string;
  nom_entreprise?: string | null;
  adresse?: string | null;
  code_postal?: string | null;
  commune?: string | null;
  code_qualification?: string | null;
  nom_qualification?: string | null;
  url_qualification?: string | null;
  nom_certificat?: string | null;
  domaine?: string | null;
  meta_domaine?: string | null;
  organisme?: string | null;
  lien_date_debut?: string | null;
  lien_date_fin?: string | null;
}

/** valide · bientot (fin dans moins de 60 jours) · expiree · future (pas encore commencée). */
export type EtatValidite = "valide" | "bientot" | "expiree" | "future";

export interface QualificationRge {
  code: string;
  nom: string;
  domaines: string[];
  debut: string | null;
  fin: string | null;
  etat: EtatValidite;
}

/** Un certificat d'organisme (même lien) et les qualifications qu'il porte. */
export interface CertificatRge {
  organisme: string;
  libelle: string;
  url: string | null;
  /** Le lien mène à un PDF que le logiciel sait archiver (sinon : page web à ouvrir). */
  pdf: boolean;
  debut: string | null;
  fin: string | null;
  etat: EtatValidite;
  qualifications: QualificationRge[];
}

export interface ResultatRge {
  siret: string;
  entreprise: string;
  adresse: string;
  /** Au moins une qualification en cours de validité à la date de vérification. */
  rge: boolean;
  /** Domaines couverts par une qualification en cours de validité, sans doublon. */
  domainesValides: string[];
  /** Certificats en cours d'abord, puis échus. */
  certificats: CertificatRge[];
}

/** Établissement trouvé par une recherche (nom ou autre établissement du même SIREN). */
export interface EtablissementRge {
  siret: string;
  nom: string;
  commune: string;
  codePostal: string;
}

export const DELAI_ALERTE_JOURS = 60;

const ORGANISMES: Record<string, string> = {
  qualibat: "Qualibat",
  qualitenr: "Qualit'EnR",
  qualifelec: "Qualifelec",
  opqibi: "OPQIBI",
  cnoa: "Ordre des architectes",
  cerqual: "Cerqual Qualitel",
  certibat: "Certibat",
  afnor: "AFNOR Certification",
  opqtecc: "OPQTECC",
  lne: "LNE",
};

export const nomOrganisme = (code: string | null | undefined): string =>
  ORGANISMES[(code ?? "").trim().toLowerCase()] ?? ((code ?? "").trim() || "Organisme non renseigné");

export const chiffres = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
export const siretValide = (s: string | null | undefined) => chiffres(s).length === 14;

/** « 80419263100013 » -> « 804 192 631 00013 ». */
export function formaterSiret(s: string | null | undefined): string {
  const d = chiffres(s);
  return d.length === 14 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : (s ?? "").trim();
}

const espaces = (s: string) => s.replace(/\s+/g, " ").trim();

/** Minuscules sans accents ni ponctuation superflue (comparaisons de libellés). */
export function normaliserTexte(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Date ISO (AAAA-MM-JJ) du jour, en heure locale. */
export function aujourdhui(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const jour = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

function ajouterJours(date: string, n: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Validité d'une qualification à une date (bornes comprises). */
export function etatValidite(
  debut: string | null | undefined,
  fin: string | null | undefined,
  date: string,
  delaiAlerteJours = DELAI_ALERTE_JOURS
): EtatValidite {
  const d = jour(debut);
  const f = jour(fin);
  if (d && date < d) return "future";
  if (f && date > f) return "expiree";
  if (f && f <= ajouterJours(date, delaiAlerteJours)) return "bientot";
  return "valide";
}

export const enCours = (e: EtatValidite) => e === "valide" || e === "bientot";

/** Domaines d'une ligne : certains organismes en mettent plusieurs, séparés par « ; ». */
const domainesDe = (l: LigneRge) =>
  (l.domaine ?? "")
    .split(";")
    .map(espaces)
    .filter((x) => x && !/^(inconnu|non renseign)/i.test(x));

/** Lien de certificat que la fonction rge-certificat sait rapatrier en PDF.
 *  OPQIBI et AFNOR renvoient une page web : lien à ouvrir seulement. */
export function certificatPdf(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    /\.pdf(?:$|[?#])/i.test(url) ||
    /qualibat\.com\/Views\/GetFichier/i.test(url) ||
    /qualypso\.fr\/download_file/i.test(url) ||
    /architectes\.org\/.*attestation/i.test(url)
  );
}

const ORDRE_ETAT: Record<EtatValidite, number> = { valide: 0, bientot: 0, future: 1, expiree: 2 };

/** Lignes de l'API d'un même établissement -> certificats et qualifications. */
export function analyserLignesRge(lignes: LigneRge[], date: string = aujourdhui()): ResultatRge | null {
  if (!lignes.length) return null;
  const premiere = lignes[0];
  const parCertificat = new Map<string, LigneRge[]>();
  for (const l of lignes) {
    const cle = (l.url_qualification ?? "").trim() || `${l.organisme ?? ""}|${l.nom_certificat ?? ""}`;
    parCertificat.set(cle, [...(parCertificat.get(cle) ?? []), l]);
  }
  const certificats: CertificatRge[] = [];
  for (const groupe of parCertificat.values()) {
    const quals = new Map<string, QualificationRge>();
    for (const l of groupe) {
      const code = (l.code_qualification ?? "").trim();
      const cle = `${code}|${l.lien_date_debut ?? ""}|${l.lien_date_fin ?? ""}`;
      const q = quals.get(cle);
      if (q) {
        for (const dom of domainesDe(l)) if (!q.domaines.includes(dom)) q.domaines.push(dom);
      } else {
        quals.set(cle, {
          code,
          nom: espaces(l.nom_qualification ?? code),
          domaines: domainesDe(l),
          debut: jour(l.lien_date_debut),
          fin: jour(l.lien_date_fin),
          etat: etatValidite(l.lien_date_debut, l.lien_date_fin, date),
        });
      }
    }
    const qualifications = [...quals.values()].sort(
      (a, b) => ORDRE_ETAT[a.etat] - ORDRE_ETAT[b.etat] || a.nom.localeCompare(b.nom, "fr")
    );
    const debuts = qualifications.map((q) => q.debut).filter((x): x is string => !!x);
    const fins = qualifications.map((q) => q.fin).filter((x): x is string => !!x);
    const debut = debuts.length ? debuts.reduce((a, b) => (a < b ? a : b)) : null;
    const fin = fins.length ? fins.reduce((a, b) => (a > b ? a : b)) : null;
    const url = (groupe[0].url_qualification ?? "").trim() || null;
    certificats.push({
      organisme: nomOrganisme(groupe[0].organisme),
      libelle: espaces(groupe[0].nom_certificat ?? "") || nomOrganisme(groupe[0].organisme),
      url,
      pdf: certificatPdf(url),
      debut,
      fin,
      etat: qualifications.some((q) => enCours(q.etat))
        ? qualifications.some((q) => q.etat === "valide")
          ? "valide"
          : "bientot"
        : qualifications.some((q) => q.etat === "future")
          ? "future"
          : "expiree",
      qualifications,
    });
  }
  certificats.sort((a, b) => ORDRE_ETAT[a.etat] - ORDRE_ETAT[b.etat] || a.organisme.localeCompare(b.organisme, "fr"));
  const domainesValides: string[] = [];
  for (const c of certificats)
    for (const q of c.qualifications)
      if (enCours(q.etat)) for (const d of q.domaines) if (!domainesValides.includes(d)) domainesValides.push(d);
  return {
    siret: chiffres(premiere.siret),
    entreprise: espaces(premiere.nom_entreprise ?? ""),
    adresse: espaces([premiere.adresse, [premiere.code_postal, premiere.commune].filter(Boolean).join(" ")].filter(Boolean).join(", ")),
    rge: domainesValides.length > 0 || certificats.some((c) => enCours(c.etat)),
    domainesValides,
    certificats,
  };
}

// ---------- Domaines attendus d'après l'objet du document ----------

/** Libellés des domaines de l'ADEME (tels que publiés, espaces resserrés). */
export const DOMAINES_RGE = {
  ite: "Isolation des murs par l'extérieur",
  iti: "Isolation par l'intérieur des murs ou rampants de toitures ou plafonds",
  combles: "Isolation des combles perdus",
  toiture: "Isolation des toitures terrasses ou des toitures par l'extérieur",
  plancherBas: "Isolation des planchers bas",
  fenetres: "Fenêtres, volets, portes donnant sur l'extérieur",
  fenetresToit: "Fenêtres de toit",
  ventilation: "Ventilation mécanique",
  chaudiere: "Chaudière condensation ou micro-cogénération gaz ou fioul",
  pac: "Pompe à chaleur : chauffage",
  cet: "Chauffe-Eau Thermodynamique",
  chaudiereBois: "Chaudière bois",
  photovoltaique: "Panneaux solaires photovoltaïques",
  solaireThermique: "Chauffage et/ou eau chaude solaire",
  geothermie: "Forage géothermique",
  radiateurs: "Radiateurs électriques, dont régulation.",
  renovationGlobale: "Projet complet de rénovation",
  auditCollectif: "Audit énergétique Logement collectif",
} as const;

/** Mots du lot ou de la prestation -> domaine RGE qui couvre ces travaux. */
const MOTS_DOMAINES: { domaine: string; motifs: RegExp[] }[] = [
  { domaine: DOMAINES_RGE.ite, motifs: [/\bite\b/, /par l'exterieur des murs/, /(isolation|isoler)( thermique)?( des murs| des facades| de facade)? par l'exterieur/, /\bfacades?\b/, /\bbardage/, /\betics\b/] },
  { domaine: DOMAINES_RGE.iti, motifs: [/\biti\b/, /par l'interieur/, /\brampants?\b/] },
  { domaine: DOMAINES_RGE.combles, motifs: [/\bcombles?\b/] },
  { domaine: DOMAINES_RGE.toiture, motifs: [/\btoitures?\b/, /\bterrasses?\b/, /\bcouvertures?\b/, /\bsarking\b/, /\betancheite\b/] },
  { domaine: DOMAINES_RGE.plancherBas, motifs: [/planchers? bas/, /\bsous[- ]sols?\b/, /\bcaves?\b/, /vide[- ]sanitaire/, /\bflocage\b/, /plafonds? (des |de |du )?(parkings?|garages?)/] },
  { domaine: DOMAINES_RGE.fenetres, motifs: [/\bmenuiseries?\b/, /\bfenetres?\b(?! de toit)/, /\bchassis\b(?! de toit)/, /\bvolets?\b/, /\bportes? (d'entree|exterieures?|de hall|palieres?)/, /\bvitrages?\b/] },
  { domaine: DOMAINES_RGE.fenetresToit, motifs: [/fenetres? de toit/, /chassis de toit/, /\bvelux\b/] },
  { domaine: DOMAINES_RGE.ventilation, motifs: [/\bvmc\b/, /\bventilation\b/, /double flux/, /\bhygro/] },
  { domaine: DOMAINES_RGE.chaudiere, motifs: [/\bchaudieres?\b(?! (a |au )?(bois|granules?|plaquettes?))/, /\bchaufferie\b/, /\bcondensation\b/, /cogeneration/] },
  { domaine: DOMAINES_RGE.pac, motifs: [/pompes? a chaleur/, /\bpac\b/] },
  { domaine: DOMAINES_RGE.cet, motifs: [/thermodynamique/] },
  { domaine: DOMAINES_RGE.chaudiereBois, motifs: [/chaudieres? (a |au )?(bois|granules?|plaquettes?)/, /\bbiomasse\b/] },
  { domaine: DOMAINES_RGE.photovoltaique, motifs: [/photovolta/, /\bpv\b/] },
  { domaine: DOMAINES_RGE.solaireThermique, motifs: [/solaire thermique/, /eau chaude solaire/, /\bcesi\b/, /\bssc\b/] },
  { domaine: DOMAINES_RGE.geothermie, motifs: [/geotherm/] },
  { domaine: DOMAINES_RGE.radiateurs, motifs: [/radiateurs? electriques?/] },
  { domaine: DOMAINES_RGE.renovationGlobale, motifs: [/renovation globale/, /offre globale/] },
  { domaine: DOMAINES_RGE.auditCollectif, motifs: [/\baudit/] },
];

/** Domaines RGE attendus d'après l'objet du document (lot ou prestation). */
export function domainesAttendus(objet: string | null | undefined): string[] {
  const t = normaliserTexte(objet ?? "");
  if (!t) return [];
  return MOTS_DOMAINES.filter((m) => m.motifs.some((r) => r.test(t))).map((m) => m.domaine);
}

/** Même domaine malgré les espaces doublés ou les accents de la source. */
export const memeDomaine = (a: string, b: string) => normaliserTexte(a) === normaliserTexte(b);

/** Pour chaque domaine attendu : couvert par une qualification en cours ? */
export function couvertureDomaines(resultat: ResultatRge | null, attendus: string[]): { domaine: string; couvert: boolean }[] {
  return attendus.map((domaine) => ({
    domaine,
    couvert: !!resultat?.domainesValides.some((d) => memeDomaine(d, domaine)),
  }));
}

/** Situation à la date du document (devis) : la qualification en cours couvrait-elle déjà cette date ?
 *  « anterieur » = le document précède le début de la qualification en cours (cycle renouvelé :
 *  demander l'attestation valable à cette date). */
export function situationADate(resultat: ResultatRge | null, date: string | null | undefined): "couvert" | "anterieur" | "posterieur" | null {
  const d = jour(date);
  if (!resultat || !d) return null;
  const quals = resultat.certificats.flatMap((c) => c.qualifications);
  if (quals.some((q) => (!q.debut || q.debut <= d) && (!q.fin || d <= q.fin))) return "couvert";
  if (quals.some((q) => q.debut && d < q.debut)) return "anterieur";
  return "posterieur";
}

/** Établissements distincts d'une liste de lignes (recherche par nom ou par SIREN),
 *  ceux du département de la copropriété d'abord. */
export function etablissements(lignes: LigneRge[], codePostalCopro?: string | null, sauf?: string): EtablissementRge[] {
  const vus = new Map<string, EtablissementRge>();
  for (const l of lignes) {
    const s = chiffres(l.siret);
    if (s.length !== 14 || s === sauf || vus.has(s)) continue;
    vus.set(s, { siret: s, nom: espaces(l.nom_entreprise ?? ""), commune: espaces(l.commune ?? ""), codePostal: (l.code_postal ?? "").trim() });
  }
  const dep = (cp: string) => (cp.startsWith("97") ? cp.slice(0, 3) : cp.slice(0, 2));
  const depCopro = codePostalCopro && /^\d{5}$/.test(codePostalCopro.trim()) ? dep(codePostalCopro.trim()) : null;
  const liste = [...vus.values()];
  if (!depCopro) return liste;
  // tri stable : l'ordre de pertinence de l'API est gardé à l'intérieur de chaque groupe
  return [...liste.filter((e) => dep(e.codePostal) === depCopro), ...liste.filter((e) => dep(e.codePostal) !== depCopro)];
}

/** Date AAAA-MM-JJ -> JJ/MM/AAAA. */
export const dateFr = (s: string | null | undefined) => {
  const d = jour(s);
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "";
};

/** Types de document qui déclenchent la vérification RGE au dépôt (devis et DPGF de travaux). */
export const TYPES_DEVIS_RGE = ["devis", "devis_travaux", "devis_fenetres", "marche_travaux"];
export const verificationRgePour = (type: string | null | undefined) => !!type && TYPES_DEVIS_RGE.includes(type);

/** Lot deviné d'après le nom d'un fichier déposé sans champ « Objet » (« Devis_ITE_Soprema.pdf »
 *  -> « Devis ITE Soprema ») ; vide s'il ne cite aucun travaux connus. */
export function lotDepuisNomFichier(nom: string): string {
  const base = nom
    .replace(/\.[a-zA-Z0-9]{1,8}$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return domainesAttendus(base).length ? base : "";
}
