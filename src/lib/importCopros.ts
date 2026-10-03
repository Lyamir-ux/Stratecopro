// Import CSV de copropriétés depuis le tableau de bord - idée d'Amir du
// 01/10/2026 (« un bouton d'importation CSV »). Logique pure, testée
// unitairement : lecture du fichier (Excel français : « ; » et Windows-1252,
// ou UTF-8), reconnaissance des colonnes par leur en-tête (celles de
// l'export « Exporter la liste » sont reconnues), contrôle ligne à ligne.
// La création elle-même passe par creerCopro, comme la fenêtre « Nouvelle
// copropriété ».
import type { ChoixMaitreOeuvre, NewCoproInput } from "@/api/copros";
import type { ChoixOrganisation } from "@/api/organisations";
import { nomSyndicBenevole, normaliserNomOrganisation, type OrganisationNommee } from "@/lib/organisations";
import { PHASES, type PhaseId } from "@/lib/referentiels";
import { CODES_PHASE, type CodeJalonContrat } from "@/lib/facturation";

// ---------- lecture du fichier ----------

/** Texte du fichier : UTF-8 s'il est valide, sinon Windows-1252 (CSV enregistré par Excel). */
export function decoderCsv(octets: ArrayBuffer | Uint8Array): string {
  const u8 = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(u8);
  } catch {
    return new TextDecoder("windows-1252").decode(u8);
  }
}

/** Séparateur de la première ligne : « ; » (Excel français), « , » ou tabulation. */
function separateur(premiereLigne: string): string {
  const compte = (c: string) => premiereLigne.split(c).length - 1;
  return [";", "\t", ","].reduce((best, c) => (compte(c) > compte(best) ? c : best), ";");
}

/**
 * Lignes et cellules d'un CSV : guillemets doublés, retours à la ligne entre
 * guillemets, BOM et lignes entièrement vides ignorés.
 */
export function lireCsv(texte: string): string[][] {
  const t = texte.replace(/^﻿/, "");
  const sep = separateur(t.split(/\r?\n/, 1)[0] ?? "");
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let cellule = "";
  let entreGuillemets = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreGuillemets) {
      if (c === '"' && t[i + 1] === '"') {
        cellule += '"';
        i++;
      } else if (c === '"') entreGuillemets = false;
      else cellule += c;
    } else if (c === '"') entreGuillemets = true;
    else if (c === sep) {
      ligne.push(cellule);
      cellule = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      ligne.push(cellule);
      lignes.push(ligne);
      ligne = [];
      cellule = "";
    } else cellule += c;
  }
  if (cellule !== "" || ligne.length > 0) {
    ligne.push(cellule);
    lignes.push(ligne);
  }
  return lignes.filter((l) => l.some((v) => v.trim() !== ""));
}

// ---------- colonnes ----------

export type CleImport =
  | "name"
  | "adresse"
  | "code_postal"
  | "city"
  | "nb_batiments"
  | "nb_logements"
  | "syndic_name"
  | "organisation"
  | "gestionnaire_nom"
  | "gestionnaire_email"
  | "chef_projet"
  | "phase"
  | "energy_before"
  | "fragile"
  | "maitre_oeuvre"
  | "date_ag"
  | "honoraires_p1_ht"
  | "honoraires_p2_ht"
  // ancienne formule (demande d'Amir du 03/10/2026) : jalons saisis à la main
  | "jalon_P1a"
  | "jalon_P1b"
  | "jalon_P1c"
  | "jalon_P2a"
  | "jalon_P2b"
  | "jalon_P2c";

/** En-tête comparable : casse, accents, ligatures, espaces et ponctuation ignorés. */
export function cleEntete(entete: string): string {
  return entete
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Colonnes du modèle, dans l'ordre du fichier à télécharger. Les synonymes
 * couvrent l'export du tableau de bord et les intitulés courants des extractions.
 */
export const COLONNES_IMPORT: { cle: CleImport; entete: string; aide: string; synonymes: string[] }[] = [
  { cle: "name", entete: "Copropriété", aide: "obligatoire - nom du dossier, unique", synonymes: ["nom", "nomdelacopropriete", "nomcopropriete", "residence", "dossier"] },
  { cle: "adresse", entete: "Adresse", aide: "", synonymes: ["adressedelacopropriete"] },
  { cle: "code_postal", entete: "Code postal", aide: "", synonymes: ["cp"] },
  { cle: "city", entete: "Ville", aide: "", synonymes: ["commune"] },
  { cle: "nb_batiments", entete: "Bâtiments", aide: "nombre, 1 par défaut", synonymes: ["nombredebatiments", "nbbatiments", "nbdebatiments"] },
  { cle: "nb_logements", entete: "Logements", aide: "nombre, avant l'import des lots", synonymes: ["nombredelogements", "nblogements", "nbdelogements"] },
  { cle: "syndic_name", entete: "Syndic", aide: "un nom d'organisation connu y rattache le dossier", synonymes: ["nomdusyndic", "cabinet"] },
  { cle: "organisation", entete: "Organisation", aide: "facultatif - existante, nouvelle (créée) ou « Syndic bénévole »", synonymes: ["enseigne"] },
  { cle: "gestionnaire_nom", entete: "Gestionnaire", aide: "", synonymes: ["nomdugestionnaire", "gestionnairenom"] },
  { cle: "gestionnaire_email", entete: "E-mail gestionnaire", aide: "", synonymes: ["mailgestionnaire", "emaildugestionnaire", "adressemaildugestionnaire", "adressemail", "courrielgestionnaire", "email", "mail"] },
  { cle: "chef_projet", entete: "Chef de projet", aide: "", synonymes: ["cheffedeprojet", "chefprojet"] },
  { cle: "phase", entete: "Phase", aide: "Diagnostic (par défaut), Études ou Travaux", synonymes: ["phasededepart"] },
  { cle: "energy_before", entete: "DPE avant", aide: "lettre de A à G", synonymes: ["dpe", "etiquette", "etiquetteenergetique", "etiquetteenergetiqueactuelle", "classeenergetique"] },
  { cle: "fragile", entete: "Fragile", aide: "Oui ou vide", synonymes: ["coproprietefragile"] },
  { cle: "maitre_oeuvre", entete: "Maître d'œuvre", aide: "nom de la Base prestataires, sinon une fiche est créée", synonymes: ["moe", "maitreoeuvre"] },
  { cle: "date_ag", entete: "Date d'AG", aide: "JJ/MM/AAAA", synonymes: ["dateag", "datedelag", "dateassembleegenerale", "datedassembleegenerale"] },
  { cle: "honoraires_p1_ht", entete: "Honoraires P1 HT", aide: "€ HT - 50 % P1a, 25 % P1b, 25 % P1c", synonymes: ["honorairesp1", "p1", "p1ht", "honorairesphase1", "honorairesetudes"] },
  { cle: "honoraires_p2_ht", entete: "Honoraires P2 HT", aide: "€ HT - 50 % P2a, 30 % P2b, 20 % P2c", synonymes: ["honorairesp2", "p2", "p2ht", "honorairesphase2", "honorairestravaux"] },
  ...(["P1a", "P1b", "P1c", "P2a", "P2b", "P2c"] as const).map((code) => ({
    cle: `jalon_${code}` as CleImport,
    entete: `${code} HT`,
    aide: `ancienne formule - € HT saisi à la main, à la place de « Honoraires ${code.slice(0, 2)} HT »`,
    synonymes: [code.toLowerCase(), `honoraires${code.toLowerCase()}`, `honoraires${code.toLowerCase()}ht`],
  })),
];

const PAR_ENTETE = new Map<string, CleImport>(
  COLONNES_IMPORT.flatMap((c) => [cleEntete(c.entete), ...c.synonymes].map((s) => [s, c.cle] as [string, CleImport]))
);

/** Colonne reconnue pour chaque en-tête du fichier (null = ignorée) ; un champ n'est pris qu'une fois, à sa première colonne. */
export function reconnaitreColonnes(entetes: string[]): (CleImport | null)[] {
  const vues = new Set<CleImport>();
  return entetes.map((e) => {
    const cle = PAR_ENTETE.get(cleEntete(e)) ?? null;
    if (!cle || vues.has(cle)) return null;
    vues.add(cle);
    return cle;
  });
}

// ---------- valeurs ----------

/** « 12 345,67 € », « 12345.67 », « 1.234,56 » → nombre ; vide → null ; illisible → NaN. */
export function lireMontant(v: string): number | null {
  let s = v.replace(/[\s  €]/g, "").replace(/(EUR|HT|TTC)$/i, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** « 01/10/2026 », « 1/10/26 », « 2026-10-01 », « 01.10.2026 » → AAAA-MM-JJ ; vide → null ; illisible → "invalide". */
export function lireDate(v: string): string | null | "invalide" {
  const s = v.trim();
  if (!s) return null;
  let a: number, m: number, j: number;
  let x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (x) [a, m, j] = [Number(x[1]), Number(x[2]), Number(x[3])];
  else {
    x = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if (!x) return "invalide";
    [j, m, a] = [Number(x[1]), Number(x[2]), Number(x[3])];
    if (a < 100) a += 2000;
  }
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return "invalide";
  return `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
}

const OUI = new Set(["oui", "o", "x", "1", "vrai", "true", "yes", "y"]);
const NON = new Set(["", "non", "n", "0", "faux", "false", "no"]);
/** Valeurs qui veulent dire « pas de maître d'œuvre » (extractions Notion). */
const SANS_MOE = new Set(["", "aucun", "aucune", "pasdemoe", "sansmoe", "nonrenseigne", "nr", "na", "adesigner", "nondesigne"]);

function lirePhase(v: string): PhaseId | null | "invalide" {
  const k = cleEntete(v);
  if (!k) return null;
  if (k === "diag") return "diagnostic";
  if (k === "etude") return "etudes";
  return PHASES.find((p) => cleEntete(p.id) === k || cleEntete(p.label) === k)?.id ?? "invalide";
}

// ---------- contrôle des lignes ----------

export interface ContexteImport {
  /** Clés techniques des dossiers existants, corbeille comprise (slugCopro). */
  slugsPris: ReadonlySet<string>;
  slug: (nom: string) => string;
  /** Raisons sociales des fiches de la Base prestataires. */
  prestataires: readonly string[];
  organisations: readonly OrganisationNommee[];
}

export interface LigneImport {
  /** Ligne du fichier (en-tête = 1). */
  ligne: number;
  nom: string;
  /** Dossier prêt à créer ; null si la ligne a une erreur. */
  input: NewCoproInput | null;
  erreurs: string[];
  /** Fiche de maître d'œuvre créée avec le dossier. */
  moeNouveau: string | null;
  /** Organisation créée avec le dossier. */
  organisationNouvelle: string | null;
}

export interface AnalyseImport {
  entetes: string[];
  colonnes: (CleImport | null)[];
  ignorees: string[];
  lignes: LigneImport[];
}

const emailValide = (e: string) => /^\S+@\S+\.\S+$/.test(e);

export function analyserImport(cellules: string[][], ctx: ContexteImport): AnalyseImport {
  const [entetes = [], ...donnees] = cellules;
  const colonnes = reconnaitreColonnes(entetes);
  const ignorees = entetes.filter((e, i) => colonnes[i] == null && e.trim() !== "");
  const nomsVus = new Map<string, number>();
  const moes = new Map(ctx.prestataires.map((p) => [normaliserNomOrganisation(p), p]));
  const moesCrees = new Set<string>();
  const orgsCreees = new Set<string>();

  const lignes = donnees.map((cells, k): LigneImport => {
    const val = (cle: CleImport) => {
      const i = colonnes.indexOf(cle);
      return i < 0 ? "" : (cells[i] ?? "").trim().replace(/\s+/g, " ");
    };
    const erreurs: string[] = [];
    const ligne = k + 2;
    const nom = val("name");

    if (!nom) erreurs.push("nom de la copropriété manquant");
    else {
      const slug = ctx.slug(nom);
      const deja = nomsVus.get(slug);
      if (!slug) erreurs.push("nom de la copropriété illisible");
      else if (ctx.slugsPris.has(slug)) erreurs.push("un dossier porte déjà ce nom (corbeille comprise)");
      else if (deja) erreurs.push(`même nom qu'à la ligne ${deja}`);
      else nomsVus.set(slug, ligne);
    }

    const entier = (cle: CleImport, libelle: string, min: number): number | null => {
      const v = val(cle).replace(/[\s  ]/g, "");
      if (!v) return null;
      if (!/^\d+$/.test(v) || Number(v) < min) {
        erreurs.push(`${libelle} : « ${val(cle)} » n'est pas un nombre entier${min > 0 ? ` d'au moins ${min}` : ""}`);
        return null;
      }
      return Number(v);
    };
    const nbBatiments = entier("nb_batiments", "bâtiments", 1) ?? 1;
    const nbLogements = entier("nb_logements", "logements", 0);

    const phase = lirePhase(val("phase"));
    if (phase === "invalide") erreurs.push(`phase « ${val("phase")} » inconnue (Diagnostic, Études ou Travaux)`);

    const dpe = val("energy_before").toUpperCase();
    if (dpe && !/^[A-G]$/.test(dpe)) erreurs.push(`DPE « ${val("energy_before")} » : une lettre de A à G attendue`);

    const fragileBrut = cleEntete(val("fragile"));
    if (!OUI.has(fragileBrut) && !NON.has(fragileBrut)) erreurs.push(`fragile « ${val("fragile")} » : Oui ou vide attendu`);

    const email = val("gestionnaire_email").toLowerCase();
    if (email && !emailValide(email)) erreurs.push(`e-mail du gestionnaire « ${email} » invalide`);

    const date = lireDate(val("date_ag"));
    if (date === "invalide") erreurs.push(`date d'AG « ${val("date_ag")} » illisible (JJ/MM/AAAA)`);

    const montant = (cle: CleImport, libelle: string): number | null => {
      const m = lireMontant(val(cle));
      if (m != null && Number.isNaN(m)) {
        erreurs.push(`${libelle} : « ${val(cle)} » n'est pas un montant`);
        return null;
      }
      return m != null && m > 0 ? Math.round(m * 100) / 100 : null;
    };
    const p1 = montant("honoraires_p1_ht", "honoraires P1");
    const p2 = montant("honoraires_p2_ht", "honoraires P2");
    // Ancienne formule : jalons à la main, jamais avec le montant réparti de la même phase
    const jalons: Partial<Record<CodeJalonContrat, number>> = {};
    for (const [phase, total] of [["p1", p1], ["p2", p2]] as const) {
      const saisis = CODES_PHASE[phase].filter((code) => val(`jalon_${code}`) !== "");
      for (const code of saisis) {
        const m = montant(`jalon_${code}`, code);
        if (m != null) jalons[code] = m;
      }
      if (saisis.length > 0 && total != null) {
        const libelle = phase.toUpperCase();
        erreurs.push(`honoraires ${libelle} : choisissez « Honoraires ${libelle} HT » (nouvelle formule) ou ${saisis.join(", ")} (ancienne formule), pas les deux`);
      }
    }
    const ok = erreurs.length === 0;

    // Maître d'œuvre : la fiche existante (casse et accents ignorés), sinon une fiche créée
    let maitreOeuvre: ChoixMaitreOeuvre | null = null;
    let moeNouveau: string | null = null;
    const moeSaisi = val("maitre_oeuvre");
    if (!SANS_MOE.has(cleEntete(moeSaisi))) {
      const cle = normaliserNomOrganisation(moeSaisi);
      const fiche = moes.get(cle);
      if (fiche) maitreOeuvre = { mode: "existant", nom: fiche };
      else {
        maitreOeuvre = { mode: "nouveau", nom: moeSaisi };
        // une seule fiche créée pour plusieurs lignes du même nouveau nom
        if (ok && !moesCrees.has(cle)) {
          moeNouveau = moeSaisi;
          moesCrees.add(cle);
        }
      }
    }

    // Organisation : facultative ; sans elle, le nom du syndic fait foi
    let organisation: ChoixOrganisation | null = null;
    let organisationNouvelle: string | null = null;
    const orgSaisie = val("organisation");
    if (orgSaisie) {
      const cle = normaliserNomOrganisation(orgSaisie);
      const existante = ctx.organisations.find((o) => normaliserNomOrganisation(o.nom) === cle);
      if (existante) organisation = { mode: "existante", id: existante.id };
      else if (cle === "syndic benevole" || cle === "benevole") {
        organisation = { mode: "benevole" };
        if (ok) organisationNouvelle = nomSyndicBenevole(nom);
      } else {
        organisation = { mode: "nouvelle", nom: orgSaisie };
        if (ok && !orgsCreees.has(cle)) {
          organisationNouvelle = orgSaisie;
          orgsCreees.add(cle);
        }
      }
    }

    return {
      ligne,
      nom,
      erreurs,
      moeNouveau,
      organisationNouvelle,
      input: ok
        ? {
            name: nom,
            adresse: val("adresse"),
            code_postal: val("code_postal"),
            city: val("city"),
            nb_batiments: nbBatiments,
            batiment_adresses: [],
            nb_logements: nbLogements,
            syndic_name: val("syndic_name"),
            organisation,
            gestionnaire_nom: val("gestionnaire_nom"),
            gestionnaire_email: email,
            chef_projet: val("chef_projet"),
            phase: (phase as PhaseId | null) ?? "diagnostic",
            energy_before: dpe || null,
            fragile: OUI.has(fragileBrut),
            maitre_oeuvre: maitreOeuvre,
            date_ag: date as string | null,
            honoraires_p1_ht: p1,
            honoraires_p2_ht: p2,
            honoraires_jalons_ht: Object.keys(jalons).length ? jalons : null,
          }
        : null,
    };
  });

  return { entetes, colonnes, ignorees, lignes };
}
