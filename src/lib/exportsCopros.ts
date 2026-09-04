// Trois exports Excel générés depuis la même base individuelle par
// copropriétaire (api/dossiersCopros) - feedback Théa 03/09/2026 : la liste des
// primes, le rapport d'enquête sociale et la fiche état étaient produits à la
// main et divergeaient. Ici : une source, trois classeurs, mêmes montants au
// centime, chaque classeur ventilé par bâtiment (un onglet par bâtiment).
import * as XLSX from "xlsx";
import type { DossierCoproprietaire, DossiersCopro, EtatItem } from "@/api/dossiersCopros";
import { PROFILS_MPR, libellesBatiments } from "@/lib/referentiels";
import { CATALOGUE } from "@/lib/enqueteCatalogue";

type Cell = string | number | null;

const FMT_EURO = '#,##0.00 "€"';
const OUI = "Oui";
const NON = "Non";

export interface ContexteExport {
  coproNom: string;
  denominationBatiments: string | null | undefined;
  /** Codes des bâtiments du dossier, dans l'ordre. */
  batiments: string[];
  cleRef: string | null;
  scenarioNom: string | null;
  publieLe: string | null;
}

function dateFr(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR") : "";
}

function aujourdHui(): string {
  return new Date().toISOString().slice(0, 10);
}

function etatTexte(e: EtatItem): string {
  return e === "ok" ? OUI : e === "en_cours" ? "En cours" : e === "manquant" ? "Manquant" : "Sans objet";
}

export function profilAnah(p: string | null): string {
  return p ? PROFILS_MPR[p]?.desc ?? p : "À déterminer";
}

function statutProfil(d: DossierCoproprietaire): string {
  if (!d.enquete.profil) return "Non renseigné";
  return d.enquete.profilStatut === "verifie" ? `Vérifié le ${dateFr(d.enquete.profilVerifieLe)}` : `Déclaratif (enquête du ${dateFr(d.enquete.date)})`;
}

/** Nom d'onglet Excel valide (≤ 31 caractères, sans \ / ? * [ ] :). */
function nomOnglet(base: string, used: Set<string>): string {
  let name = base.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Feuille";
  let i = 2;
  while (used.has(name)) name = `${name.slice(0, 28)} ${i++}`;
  used.add(name);
  return name;
}

/** Feuille tabulaire : titre, en-têtes, lignes, colonnes € formatées, largeurs auto. */
function feuille(
  wb: XLSX.WorkBook,
  used: Set<string>,
  nom: string,
  titre: string[],
  head: string[],
  rows: Cell[][],
  euroCols: number[],
  total?: Cell[]
) {
  const aoa: Cell[][] = [...titre.map((t) => [t]), [], head, ...rows];
  if (total) aoa.push(total);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const debut = titre.length + 2; // index de la première ligne de données (0-based)
  for (let r = debut; r < aoa.length; r++) {
    for (const c of euroCols) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref];
      if (cell && typeof cell.v === "number") cell.z = FMT_EURO;
    }
  }
  ws["!cols"] = head.map((h, i) => {
    const largeur = Math.max(h.length, ...rows.map((row) => String(row[i] ?? "").length), 8);
    return { wch: Math.min(48, largeur + 2) };
  });
  XLSX.utils.book_append_sheet(wb, ws, nomOnglet(nom, used));
}

function sommes(rows: Cell[][], cols: number[], libelle: string, largeur: number): Cell[] {
  const total: Cell[] = Array.from({ length: largeur }, () => null);
  total[0] = libelle;
  for (const c of cols) {
    total[c] = Math.round(rows.reduce((s, r) => s + (typeof r[c] === "number" ? (r[c] as number) : 0), 0) * 100) / 100;
  }
  return total;
}

function parBatiment(dossiers: DossierCoproprietaire[], ctx: ContexteExport): { code: string; label: string; dossiers: DossierCoproprietaire[] }[] {
  const lb = libellesBatiments(ctx.denominationBatiments);
  const codes = ctx.batiments.length ? ctx.batiments : [...new Set(dossiers.flatMap((d) => d.batiments))].sort();
  const groupes = codes.map((code) => ({
    code,
    label: `${lb.singulier} ${code}`,
    dossiers: dossiers.filter((d) => d.batiments.includes(code)),
  }));
  const sans = dossiers.filter((d) => d.batiments.length === 0);
  if (sans.length && codes.length) groupes.push({ code: "-", label: lb.sans, dossiers: sans });
  return groupes.filter((g) => g.dossiers.length > 0);
}

function entete(ctx: ContexteExport, titre: string, sousTitre?: string): string[] {
  return [
    `${ctx.coproNom} - ${titre}`,
    ...(sousTitre ? [sousTitre] : []),
    `Export du ${new Date().toLocaleDateString("fr-FR")} - Strat Eco Pro${ctx.scenarioNom ? ` - plan « ${ctx.scenarioNom} »${ctx.publieLe ? ` publié le ${dateFr(ctx.publieLe)}` : ""}` : ""}`,
  ];
}

function tantiemesRef(d: DossierCoproprietaire, ctx: ContexteExport): number {
  return ctx.cleRef ? d.tantiemes[ctx.cleRef] ?? 0 : Object.values(d.tantiemes)[0] ?? 0;
}

function nomFichier(ctx: ContexteExport, quoi: string): string {
  return `${ctx.coproNom} - ${quoi} - ${aujourdHui()}.xlsx`.replace(/[\\/:*?"<>|]/g, " ");
}

// ============================================================
// 1. Liste des primes
// ============================================================

const HEAD_PRIMES = [
  "Copropriétaire",
  "Bâtiment(s)",
  "Lots",
  "Lots d'habitation",
  "Tantièmes (clé de référence)",
  "Personnes du ménage",
  "RFR avis N-1 (€)",
  "Profil Anah",
  "Statut du profil",
  "Occupation",
  "Quote-part opération TTC (€)",
  "Aides collectives affectées (€)",
  "Prime CEE (fin de chantier) (€)",
  "Prime MaPrimeRénov' individuelle (€)",
  "Source de la prime",
  "À financer avant travaux, hors CEE (€)",
  "Reste à charge final, CEE déduits (€)",
  "Source du plan",
];
const EURO_PRIMES = [6, 10, 11, 12, 13, 15, 16];
const SOMMES_PRIMES = [10, 11, 12, 13, 15, 16];

function lignePrime(d: DossierCoproprietaire, ctx: ContexteExport): Cell[] {
  const p = d.plan;
  return [
    d.nom,
    d.batiments.join(", "),
    d.lots.map((l) => l.num).join(", "),
    d.nbLotsHab,
    tantiemesRef(d, ctx),
    d.enquete.nbPersonnes,
    d.enquete.rfr,
    profilAnah(d.enquete.profil),
    statutProfil(d),
    d.enquete.occupation ?? "",
    p ? p.quotePart : null,
    p ? p.aidesColl : null,
    p ? p.primeCee : null,
    p && p.mprSource !== "indetermine" ? p.mprIndiv : null,
    !p ? "" : p.mprSource === "indetermine" ? "À déterminer (profil manquant)" : p.mprSource === "plan" ? "Plan individuel" : "Barème selon profil (à confirmer à l'instruction)",
    p ? p.resteAvantTravaux : null,
    p ? p.reste : null,
    !p ? "Aucun plan" : p.source === "pf" ? "PF définitif validé" : "Scénario partagé",
  ];
}

export function exporterListePrimes(data: DossiersCopro, ctx: ContexteExport) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const tous = data.dossiers.map((d) => lignePrime(d, ctx));
  feuille(wb, used, "Liste des primes", entete(ctx, "Liste des primes", "Aides collectives affectées et primes individuelles par copropriétaire"), HEAD_PRIMES, tous, EURO_PRIMES, sommes(tous, SOMMES_PRIMES, "TOTAL", HEAD_PRIMES.length));
  for (const g of parBatiment(data.dossiers, ctx)) {
    const rows = g.dossiers.map((d) => lignePrime(d, ctx));
    feuille(wb, used, g.label, entete(ctx, `Liste des primes - ${g.label}`), HEAD_PRIMES, rows, EURO_PRIMES, sommes(rows, SOMMES_PRIMES, `TOTAL ${g.label}`, HEAD_PRIMES.length));
  }
  // Synthèse par bâtiment : mêmes totaux que les onglets, au centime.
  const headSyn = ["Bâtiment", "Copropriétaires", "Profils renseignés", "Quote-part TTC (€)", "Aides collectives (€)", "Prime CEE (€)", "Primes individuelles (€)", "À financer avant travaux (€)", "Reste à charge final (€)"];
  const syn: Cell[][] = parBatiment(data.dossiers, ctx).map((g) => {
    const rows = g.dossiers.map((d) => lignePrime(d, ctx));
    const t = sommes(rows, SOMMES_PRIMES, g.label, HEAD_PRIMES.length);
    return [g.label, g.dossiers.length, g.dossiers.filter((d) => d.enquete.profil).length, t[10], t[11], t[12], t[13], t[15], t[16]];
  });
  const tot = sommes(tous, SOMMES_PRIMES, "TOTAL", HEAD_PRIMES.length);
  syn.push(["TOTAL", data.dossiers.length, data.dossiers.filter((d) => d.enquete.profil).length, tot[10], tot[11], tot[12], tot[13], tot[15], tot[16]]);
  feuille(wb, used, "Synthèse par bâtiment", entete(ctx, "Liste des primes - synthèse par bâtiment"), headSyn, syn, [3, 4, 5, 6, 7, 8]);
  XLSX.writeFile(wb, nomFichier(ctx, "Liste des primes"));
}

// ============================================================
// 2. Rapport d'enquête sociale
// ============================================================

/** Valeur lisible d'une réponse du questionnaire (jsonb). */
function reponseTexte(d: DossierCoproprietaire, qid: string, lotId?: string): string {
  const src = lotId ? d.enquete.reponses?.lots?.[lotId] : d.enquete.reponses?.copro;
  const v = src?.[qid];
  if (v == null || v === "") return "";
  const p = src?.[qid + "__p"];
  const base = Array.isArray(v) ? v.join(" ; ") : String(v);
  return typeof p === "string" && p ? `${base} - ${p}` : base;
}

const Q_COPRO = ["type-coproprietaire", "composition-menage", "nb-personnes-charge", "rfr-zero-motif", "accord-visite", "curatelle-tutelle", "situation-sociale", "importance-travaux"];
const Q_LOT = ["usage-lot", "type-occupation", "nb-habitants", "type-residence", "projet-vente", "demembrement"];

function tagDe(qid: string): string {
  return CATALOGUE.find((q) => q.id === qid)?.tag ?? qid;
}

const HEAD_ENQUETE = [
  "Copropriétaire",
  "Bâtiment(s)",
  "Lots",
  "A répondu",
  "Questionnaire transmis complet",
  "Dernière mise à jour",
  "Personnes du ménage",
  "RFR avis N-1 (€)",
  "RFR N-2 (€)",
  "Profil Anah",
  "Statut du profil",
  "Occupation",
  ...Q_COPRO.map(tagDe),
];
const EURO_ENQUETE = [7, 8];

function ligneEnquete(d: DossierCoproprietaire): Cell[] {
  return [
    d.nom,
    d.batiments.join(", "),
    d.lots.map((l) => l.num).join(", "),
    d.enquete.repondu ? OUI : NON,
    d.enquete.complet ? OUI : NON,
    d.enquete.repondu ? dateFr(d.enquete.date) : "",
    d.enquete.nbPersonnes,
    d.enquete.rfr,
    d.enquete.rfrN2,
    profilAnah(d.enquete.profil),
    statutProfil(d),
    d.enquete.occupation ?? "",
    ...Q_COPRO.map((q) => reponseTexte(d, q)),
  ];
}

function syntheseEnquete(dossiers: DossierCoproprietaire[], libelle: string): Cell[] {
  const n = dossiers.length;
  const rep = dossiers.filter((d) => d.enquete.repondu).length;
  const complets = dossiers.filter((d) => d.enquete.complet).length;
  const profils = dossiers.filter((d) => d.enquete.profil).length;
  const cnt = (p: string) => dossiers.filter((d) => d.enquete.profil === p).length;
  const occ = (o: string) => dossiers.filter((d) => d.enquete.occupation === o).length;
  return [
    libelle,
    n,
    rep,
    n ? Math.round((rep / n) * 100) / 100 : 0,
    complets,
    profils,
    dossiers.filter((d) => d.enquete.profilStatut === "verifie").length,
    cnt("Bleu"),
    cnt("Jaune"),
    cnt("Violet"),
    cnt("Rose"),
    n - profils,
    occ("Occupant"),
    occ("Bailleur"),
    dossiers.filter((d) => reponseTexte(d, "situation-sociale").startsWith("Oui")).length,
    dossiers.filter((d) => { const v = reponseTexte(d, "curatelle-tutelle"); return v !== "" && v !== "Non"; }).length,
    dossiers.filter((d) => reponseTexte(d, "accord-visite").startsWith("Oui")).length,
  ];
}

const HEAD_SYNTHESE_ENQUETE = [
  "Périmètre",
  "Copropriétaires",
  "Réponses",
  "Taux de réponse",
  "Questionnaires complets",
  "Profils renseignés",
  "Profils vérifiés",
  "Très modestes",
  "Modestes",
  "Intermédiaires",
  "Supérieurs",
  "Profil à déterminer",
  "Occupants",
  "Bailleurs",
  "Situation sociale particulière",
  "Protection juridique (curatelle, tutelle…)",
  "Accord pour la visite",
];

export function exporterRapportEnquete(data: DossiersCopro, ctx: ContexteExport) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const groupes = parBatiment(data.dossiers, ctx);
  const syn: Cell[][] = [syntheseEnquete(data.dossiers, "Toute la copropriété"), ...groupes.map((g) => syntheseEnquete(g.dossiers, g.label))];
  const wsSyn = XLSX.utils.aoa_to_sheet([
    ...entete(ctx, "Rapport d'enquête sociale", "Synthèse des réponses, profils Anah et occupation").map((t) => [t]),
    [],
    HEAD_SYNTHESE_ENQUETE,
    ...syn,
  ]);
  for (let r = 0; r < syn.length; r++) {
    const ref = XLSX.utils.encode_cell({ r: r + 5, c: 3 });
    if (wsSyn[ref]) wsSyn[ref].z = "0 %";
  }
  wsSyn["!cols"] = HEAD_SYNTHESE_ENQUETE.map((h) => ({ wch: Math.min(34, Math.max(12, h.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, wsSyn, nomOnglet("Synthèse", used));

  const tous = data.dossiers.map(ligneEnquete);
  feuille(wb, used, "Détail copropriétaires", entete(ctx, "Rapport d'enquête sociale - détail par copropriétaire"), HEAD_ENQUETE, tous, EURO_ENQUETE);
  for (const g of groupes) {
    feuille(wb, used, g.label, entete(ctx, `Rapport d'enquête sociale - ${g.label}`), HEAD_ENQUETE, g.dossiers.map(ligneEnquete), EURO_ENQUETE);
  }
  // Volet lots (occupation, résidence, projet de vente…) : une ligne par lot.
  const headLots = ["Copropriétaire", "Bâtiment", "Lot", "Usage (import)", ...Q_LOT.map(tagDe)];
  const lots: Cell[][] = data.dossiers.flatMap((d) =>
    d.lots.map((l) => [d.nom, l.batiment?.code ?? "", l.num, l.usage, ...Q_LOT.map((q) => reponseTexte(d, q, l.id))])
  );
  feuille(wb, used, "Détail par lot", entete(ctx, "Rapport d'enquête sociale - réponses par lot"), headLots, lots, []);
  XLSX.writeFile(wb, nomFichier(ctx, "Rapport d'enquête sociale"));
}

// ============================================================
// 3. Fiche état
// ============================================================

const HEAD_ETAT = [
  "Copropriétaire",
  "Bâtiment(s)",
  "Lots",
  "Tantièmes (clé de référence)",
  "Profil Anah",
  "Statut du profil",
  "Prime individuelle (€)",
  "Choix de financement",
  "Durée (ans)",
  "Choix transmis le",
  "Bulletin d'adhésion",
  "Mandat SEPA",
  "RIB",
  "Pièce d'identité",
  "Avis d'imposition",
  "Pièces manquantes",
  "Statut du dossier",
];
const EURO_ETAT = [6];

export function libelleFinancement(d: DossierCoproprietaire): string {
  const f = d.financement;
  if (!f) return d.plan?.partage ? "À choisir" : "";
  const base = f.type === "collectif" ? "Prêt collectif" : f.type === "individuel" ? "Éco-PTZ individuel" : "Fonds propres";
  return f.saisi_par === "syndic" ? `${base} (saisi par le syndic)` : f.saisi_par === "amo" ? `${base} (saisi par Strat Eco)` : base;
}

export function libelleStatutDossier(s: DossierCoproprietaire["etat"]["statut"]): string {
  return s === "complet" ? "Complet" : s === "incomplet" ? "Incomplet" : "Non commencé";
}

function ligneEtat(d: DossierCoproprietaire, ctx: ContexteExport): Cell[] {
  return [
    d.nom,
    d.batiments.join(", "),
    d.lots.map((l) => l.num).join(", "),
    tantiemesRef(d, ctx),
    profilAnah(d.enquete.profil),
    statutProfil(d),
    d.plan && d.plan.mprSource !== "indetermine" ? d.plan.mprIndiv : null,
    libelleFinancement(d),
    d.financement?.duree_annees ?? null,
    d.financement ? dateFr(d.financement.transmitted_at) : "",
    etatTexte(d.etat.bulletin),
    etatTexte(d.etat.sepa),
    etatTexte(d.etat.rib),
    etatTexte(d.etat.cni),
    etatTexte(d.etat.avis),
    d.etat.manquants.join(" ; "),
    libelleStatutDossier(d.etat.statut),
  ];
}

function syntheseEtat(dossiers: DossierCoproprietaire[], libelle: string): Cell[] {
  const n = (f: (d: DossierCoproprietaire) => boolean) => dossiers.filter(f).length;
  return [
    libelle,
    dossiers.length,
    n((d) => d.etat.statut === "complet"),
    n((d) => d.etat.statut === "incomplet"),
    n((d) => d.etat.statut === "non_commence"),
    n((d) => d.etat.profil === "ok"),
    n((d) => d.etat.financement === "ok"),
    n((d) => d.etat.bulletin === "ok"),
    n((d) => d.etat.sepa === "ok"),
    n((d) => d.etat.rib === "ok"),
    n((d) => d.etat.cni === "ok"),
    n((d) => d.etat.avis === "ok"),
  ];
}

const HEAD_SYNTHESE_ETAT = ["Périmètre", "Copropriétaires", "Dossiers complets", "Incomplets", "Non commencés", "Profils", "Choix de financement", "Bulletins signés", "Mandats SEPA", "RIB", "Pièces d'identité", "Avis d'imposition"];

export function exporterFicheEtat(data: DossiersCopro, ctx: ContexteExport) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const groupes = parBatiment(data.dossiers, ctx);
  const tous = data.dossiers.map((d) => ligneEtat(d, ctx));
  feuille(wb, used, "Fiche état", entete(ctx, "Fiche état", "État du dossier de chaque copropriétaire : profil, prime, financement, bulletin, SEPA, pièces"), HEAD_ETAT, tous, EURO_ETAT, sommes(tous, [6], "TOTAL", HEAD_ETAT.length));
  for (const g of groupes) {
    const rows = g.dossiers.map((d) => ligneEtat(d, ctx));
    feuille(wb, used, g.label, entete(ctx, `Fiche état - ${g.label}`), HEAD_ETAT, rows, EURO_ETAT, sommes(rows, [6], `TOTAL ${g.label}`, HEAD_ETAT.length));
  }
  feuille(wb, used, "Synthèse", entete(ctx, "Fiche état - synthèse"), HEAD_SYNTHESE_ETAT, [syntheseEtat(data.dossiers, "Toute la copropriété"), ...groupes.map((g) => syntheseEtat(g.dossiers, g.label))], []);
  XLSX.writeFile(wb, nomFichier(ctx, "Fiche état"));
}
