// Facturation directe (0115) - demande d'Amir du 28/09/2026.
//
// Le logiciel remplace l'outil de facturation : les factures et avoirs sont
// émis depuis un jalon d'honoraires (P1a … FCEE 2), au format des modèles
// FAC00000765 (honoraires AMO, client « SDC <nom> p/a <syndic> ») et
// FAC00000758 (honoraires CEE, client Hellio). Le contenu (client, lignes,
// totaux) est construit et figé côté serveur ; ce module ne fait que le
// mettre en forme : montants, dates, montant en toutes lettres, nom du PDF,
// statut affiché. Calculs purs, partagés par le PDF et les écrans.
import { libelleJalon, type CodeJalon } from "@/lib/facturation";
import { nomFichierSansAccents } from "@/lib/nommage";

export type TypePiece = "facture" | "avoir";
export type NaturePiece = "amo" | "cee";
export type StatutPiece = "brouillon" | "emise";
export type EnvoiStatut = "envoye" | "erreur" | "simule" | "sans_email";
export type DextStatut = "envoye" | "simule" | "erreur";
export type TypeReferenceClient = "reference" | "ordre_service";

export interface LigneFacture {
  code: string;
  libelle: string;
  /** Seconde ligne du libellé (factures CEE : « -250 AIF Copropriété … Gwhc »). */
  detail: string | null;
  quantite: number;
  pu_ht: number;
  montant_ht: number;
  /** En pourcentage : 20 = 20 %. */
  taux_tva: number;
}

/** Ligne de la table factures (0115). */
export interface PieceFacture {
  id: string;
  type: TypePiece;
  statut: StatutPiece;
  test: boolean;
  copro_id: string;
  jalon: CodeJalon;
  nature: NaturePiece;
  facture_origine_id: string | null;
  numero: string | null;
  date_emission: string | null;
  date_echeance: string | null;
  client_numero: string | null;
  client_nom: string;
  client_pa: string | null;
  client_adresse: string | null;
  destinataire_email: string | null;
  destinataire_nom: string | null;
  reference: string;
  sous_reference: string | null;
  /** Numéro de référence ou d'ordre de service donné par le client (0135). */
  reference_client: string | null;
  reference_client_type: TypeReferenceClient;
  /** Texte libre imprimé sous les articles de vente (0135). */
  texte_libre: string | null;
  lignes: LigneFacture[];
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  pdf_path: string | null;
  fichier_id: string | null;
  envoi_statut: EnvoiStatut | null;
  envoi_le: string | null;
  envoi_detail: string | null;
  /** Dépôt dans Dext par e-mail (0144) ; null = jamais tenté (pièce de test ou antérieure). */
  dext_statut: DextStatut | null;
  dext_le: string | null;
  dext_detail: string | null;
  payee_le: string | null;
  payee_par: string | null;
  cree_par: string | null;
  cree_le: string;
  valide_par: string | null;
  valide_le: string | null;
}

// ---------- émetteur (modèles FAC00000765 et FAC00000758) ----------

export const EMETTEUR = {
  titre: "SAS STRAT ECO",
  adresse: ["27 Rue du Vieux Marché Aux Vins", "67000 - STRASBOURG", "FRANCE"],
  siret: "88752735600026",
  tel: "06.60.36.34.34",
  email: "amir@strateco.fr",
  banque: { nom: "CCM BISCHEIM", iban: "FR7610278010110002084670197", bic: "CMCIFR2A" },
  piedDePage:
    "STRAT ECO - Code NAF (APE) 7112B - SAS au capital social de 10000 € - Siret : 88752735600026 - N° TVA FR77887527356",
};

export const MENTION_TYPE_VENTE = "Type de vente : Prestation de services";

export const MENTIONS_RETARD = [
  "Tout retard de paiement entraîne de plein droit, sans rappel, l’exigibilité de pénalités de retard à compter du jour suivant la date d’échéance. Ces pénalités sont déterminées sur la base du taux convenu selon le contrat, les conditions générales ou le devis accepté, sans pouvoir être inférieur à 3 fois le taux d’intérêt légal. A défaut de toute référence contractuelle, le taux applicable est celui prévu par l’article L.441-10 du Code de commerce, correspondant au taux de refinancement de la Banque centrale européenne majoré de dix points.",
  "En outre, une indemnité forfaitaire de 40 € par facture est due de plein droit en cas de retard de paiement, conformément à l’article D.441-5 du Code de commerce.",
];

// ---------- formats ----------

const INSECABLE = " ";

/** Chiffres groupés par trois (espace insécable, comme le modèle) et virgule décimale. */
function nombreFr(v: number, min: number, max: number): string {
  const neg = v < 0;
  const [ent, dec] = Math.abs(v).toFixed(max).split(".");
  let d = dec ?? "";
  while (d.length > min && d.endsWith("0")) d = d.slice(0, -1);
  const groupes = ent.replace(/\B(?=(\d{3})+(?!\d))/g, INSECABLE);
  return (neg ? "-" : "") + groupes + (d ? "," + d : "");
}

/** « 1 199,97 € » */
export const euros = (v: number): string => `${nombreFr(v, 2, 2)} €`;

/** « 20,00% » */
export const tauxTva = (taux: number): string => `${nombreFr(taux, 2, 2)}%`;

/** « 1,00 » ; un volume CEE garde ses trois décimales (« 5,544 »). */
export const quantite = (q: number): string => nombreFr(q, 2, 3);

/** AAAA-MM-JJ → JJ/MM/AAAA */
export const dateFr = (iso: string | null): string =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";

// ---------- montant en toutes lettres ----------

const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

function moinsDeCent(n: number, pluriel: boolean): string {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7) return u === 1 ? "soixante et onze" : `soixante-${UNITES[10 + u]}`;
  if (d === 9) return `quatre-vingt-${UNITES[10 + u]}`;
  if (d === 8) return u === 0 ? (pluriel ? "quatre-vingts" : "quatre-vingt") : `quatre-vingt-${UNITES[u]}`;
  if (u === 0) return DIZAINES[d];
  if (u === 1) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

/** 0 à 999 ; « pluriel » = accord de « cents » et « quatre-vingts » en fin de nombre. */
function moinsDeMille(n: number, pluriel: boolean): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c === 0) return moinsDeCent(r, pluriel);
  const cent = c === 1 ? "cent" : `${UNITES[c]} cent${r === 0 && pluriel ? "s" : ""}`;
  return r === 0 ? cent : `${cent} ${moinsDeCent(r, pluriel)}`;
}

/** Entier positif en lettres, orthographe traditionnelle (« quatre-vingt-seize », « vingt et un »). */
export function nombreEnLettres(n: number): string {
  const v = Math.floor(Math.abs(n));
  if (v === 0) return "zéro";
  const parts: string[] = [];
  const milliards = Math.floor(v / 1e9);
  const millions = Math.floor(v / 1e6) % 1000;
  const milliers = Math.floor(v / 1000) % 1000;
  const reste = v % 1000;
  if (milliards) parts.push(`${moinsDeMille(milliards, true)} milliard${milliards > 1 ? "s" : ""}`);
  if (millions) parts.push(`${moinsDeMille(millions, true)} million${millions > 1 ? "s" : ""}`);
  // « mille » est invariable et ne se précède pas de « un » ; « deux cent mille » sans s
  if (milliers) parts.push(milliers === 1 ? "mille" : `${moinsDeMille(milliers, false)} mille`);
  if (reste) parts.push(moinsDeMille(reste, true));
  return parts.join(" ");
}

/** « mille quatre cent trente-neuf euros et quatre-vingt-seize centimes » (valeur absolue). */
export function montantEnLettres(v: number): string {
  const centimesTotal = Math.round(Math.abs(v) * 100);
  const e = Math.floor(centimesTotal / 100);
  const c = centimesTotal % 100;
  const unite = e <= 1 ? "euro" : e >= 1e6 && e % 1e6 === 0 ? "d'euros" : "euros";
  const partEuros = `${nombreEnLettres(e)} ${unite}`;
  if (c === 0) return partEuros;
  return `${partEuros} et ${nombreEnLettres(c)} centime${c > 1 ? "s" : ""}`;
}

// ---------- pièces ----------

export const libelleType = (t: TypePiece): string => (t === "avoir" ? "Avoir" : "Facture");

/** Nom du PDF classé dans les fichiers : « Facture FAC00000766 - 3 rue Mariano - P1b.pdf ». */
export function nomFichierPiece(p: Pick<PieceFacture, "type" | "numero" | "jalon">, nomCopro: string): string {
  return nomFichierSansAccents(`${libelleType(p.type)} ${p.numero ?? "brouillon"} - ${nomCopro} - ${libelleJalon(p.jalon)}.pdf`);
}

/** Nom de l'archive de l'export groupé : « factures-strat-eco-2026-10-06.zip » (date locale AAAA-MM-JJ). */
export const nomArchiveFactures = (aujourdhui: string): string => `factures-strat-eco-${aujourdhui}.zip`;

/**
 * Noms de fichiers distincts pour une même archive : un nom déjà pris reçoit « (2) », « (3) »…
 * avant l'extension (deux pièces ne partagent jamais un numéro, mais un nom de dossier peut se répéter).
 */
export function nomsUniques(noms: string[]): string[] {
  const vus = new Map<string, number>();
  return noms.map((nom) => {
    const cle = nom.toLowerCase();
    const n = (vus.get(cle) ?? 0) + 1;
    vus.set(cle, n);
    if (n === 1) return nom;
    const point = nom.lastIndexOf(".");
    return point > 0 ? `${nom.slice(0, point)} (${n})${nom.slice(point)}` : `${nom} (${n})`;
  });
}

/** Pièces dont le PDF s'exporte : les factures et avoirs émis (un brouillon n'a ni numéro ni PDF définitif). */
export const piecesExportables = (pieces: PieceFacture[]): PieceFacture[] => pieces.filter((p) => p.statut === "emise" && !!p.numero);

/** Avoir émis qui annule cette facture, s'il y en a un. */
export const avoirDe = (f: PieceFacture, pieces: PieceFacture[]): PieceFacture | null =>
  pieces.find((a) => a.type === "avoir" && a.statut === "emise" && a.facture_origine_id === f.id) ?? null;

export type EtatPiece = "brouillon" | "a_envoyer" | "envoi_erreur" | "envoyee" | "payee" | "annulee";

export function etatPiece(p: PieceFacture, pieces: PieceFacture[]): EtatPiece {
  if (p.statut === "brouillon") return "brouillon";
  if (p.type === "facture" && avoirDe(p, pieces)) return "annulee";
  if (p.type === "facture" && p.payee_le) return "payee";
  if (!p.pdf_path || !p.envoi_statut) return "a_envoyer";
  if (p.envoi_statut === "erreur" || p.envoi_statut === "sans_email") return "envoi_erreur";
  return "envoyee";
}

export const LIBELLE_ETAT_PIECE: Record<EtatPiece, string> = {
  brouillon: "Brouillon à valider",
  a_envoyer: "Émise, envoi à terminer",
  envoi_erreur: "Envoi en erreur",
  envoyee: "Envoyée",
  payee: "Payée",
  annulee: "Annulée par avoir",
};

/** Pièces d'un jalon : son brouillon de facture et sa facture émise encore active (non annulée). */
export function piecesDuJalon(pieces: PieceFacture[], coproId: string, jalon: string) {
  const duJalon = pieces.filter((p) => p.copro_id === coproId && p.jalon === jalon);
  const brouillon = duJalon.find((p) => p.type === "facture" && p.statut === "brouillon") ?? null;
  const facture =
    duJalon
      .filter((p) => p.type === "facture" && p.statut === "emise" && !avoirDe(p, pieces))
      .sort((a, b) => (b.valide_le ?? "").localeCompare(a.valide_le ?? ""))[0] ?? null;
  const avoirBrouillon = facture
    ? (duJalon.find((p) => p.type === "avoir" && p.statut === "brouillon" && p.facture_origine_id === facture.id) ?? null)
    : null;
  return { brouillon, facture, avoirBrouillon };
}

// ---------- numéro du client et texte libre (0135) ----------

export const LIBELLE_REFERENCE_CLIENT: Record<TypeReferenceClient, string> = {
  reference: "N° de référence",
  ordre_service: "N° d'ordre de service",
};

export const LONGUEUR_REFERENCE_CLIENT = 80;
export const LONGUEUR_TEXTE_LIBRE = 600;

/** « N° d'ordre de service : OS-2026-045 », imprimé sous la référence ; null sans numéro. */
export function ligneReferenceClient(p: Pick<PieceFacture, "reference_client" | "reference_client_type">): string | null {
  const ref = p.reference_client?.trim();
  return ref ? `${LIBELLE_REFERENCE_CLIENT[p.reference_client_type] ?? LIBELLE_REFERENCE_CLIENT.reference} : ${ref}` : null;
}

/** Lignes du cartouche client : « P/A <SYNDIC> », l'adresse, le pays. */
export function lignesClient(p: Pick<PieceFacture, "client_pa" | "client_adresse">): { lignes: string[]; adresseManquante: boolean } {
  const adresse = (p.client_adresse ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const lignes = [...(p.client_pa ? [`P/A ${p.client_pa.toUpperCase()}`] : []), ...adresse, "FRANCE"];
  return { lignes, adresseManquante: adresse.length === 0 };
}
