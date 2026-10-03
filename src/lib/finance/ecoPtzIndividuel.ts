// Éco-PTZ individuel en copropriété - montants éligibles par logement (02/10/2026).
// Module pur : il alimente le CERFA Annexe 3.1 « Entreprises PEG » et
// l'attestation des montants éligibles remise au copropriétaire.
//
// Règles (Amir, 02/10/2026, reprises des skills ecoptz-individuel-copro et
// cerfa-ecoptz-entreprise) :
//   - travaux éligibles = lignes « Retenu » du PF définitif validé, HT après
//     remise du lot + TVA de ces mêmes lignes ; jamais les imprévus, la MOE,
//     les honoraires, les frais annexes ni l'audit ;
//   - un poste = un lot de travaux du PF (une entreprise) ;
//   - quote-part d'un logement = montant du poste × tantièmes du logement /
//     total des tantièmes de la clé, ligne par ligne (clé de la ligne, comme
//     les plans individuels du PF) ;
//   - tantièmes d'un logement = lot d'habitation + annexes qui lui sont
//     rattachées (caves, parkings) ;
//   - aucun arrondi : les centimes sont conservés jusqu'à l'affichage.
import type { PlanDefinitifData } from "./planDefinitif";
import { tvaLigne } from "./planDefinitif";

/** Poste de travaux éligible (un lot de travaux du PF). */
export interface PosteEcoPtz {
  lotNumero: number;
  /** Titre du lot dans le PF (« Isolation thermique par l'extérieur »). */
  titre: string;
  /** Entreprise saisie dans le PF (repli quand le questionnaire n'est pas rempli). */
  entreprisePf: string | null;
  /** Montant éligible TTC pour toute la copropriété (non arrondi). */
  montantTtc: number;
  /** Même montant ventilé par code de clé de répartition. */
  parCle: Record<string, number>;
  /** Nombre de lignes retenues dans le lot. */
  nbLignes: number;
  /** Lignes retenues sans clé exploitable : la clé de référence leur est appliquée. */
  lignesSansCle: number;
}

export interface CleRef {
  code: string;
  is_default: boolean;
}

/** Clé de référence : clé unique de la copro, sinon clé par défaut, sinon la première. */
export function cleReference(cles: CleRef[]): string | null {
  if (cles.length === 1) return cles[0].code;
  return cles.find((k) => k.is_default)?.code ?? cles[0]?.code ?? null;
}

/**
 * Postes éligibles du PF : un par lot de travaux ayant au moins une ligne
 * retenue de montant non nul. Le TTC d'une ligne suit la convention du
 * classeur (remise sur le HT, TVA sur le montant avant remise).
 */
export function postesEligiblesEcoPtz(data: PlanDefinitifData, cles: CleRef[]): PosteEcoPtz[] {
  const unique = cles.length === 1 ? cles[0].code : null;
  const ref = cleReference(cles);
  const codes = new Set(cles.map((k) => k.code));
  const legacy = data.repartitionCles ?? {};
  const postes: PosteEcoPtz[] = [];
  for (const lot of data.lots) {
    const parCle: Record<string, number> = {};
    let total = 0;
    let nb = 0;
    let sansCle = 0;
    for (const l of lot.lignes) {
      if (!l.retenu) continue;
      if (l.montantHt === 0 && !l.tvaMontant) continue;
      const ttc = l.montantHt * (1 - lot.remisePct / 100) + tvaLigne(l);
      let cle: string | null = unique ?? l.cleRepartition ?? legacy[`lot:${lot.numero}`] ?? null;
      if (!cle || !codes.has(cle)) {
        sansCle += 1;
        cle = ref;
      }
      if (!cle) continue;
      parCle[cle] = (parCle[cle] ?? 0) + ttc;
      total += ttc;
      nb += 1;
    }
    if (nb === 0) continue;
    postes.push({
      lotNumero: lot.numero,
      titre: lot.titre,
      entreprisePf: lot.entreprise?.trim() || null,
      montantTtc: total,
      parCle,
      nbLignes: nb,
      lignesSansCle: sansCle,
    });
  }
  return postes.sort((a, b) => a.lotNumero - b.lotNumero);
}

/** Lot tel que fourni par useDonnees (sous-ensemble utile). */
export interface LotEcoPtz {
  id: string;
  num: string;
  usage: string;
  coproprietaire_id: string | null;
  rattache_a: string | null;
  tantiemes: Record<string, number>;
  batiment?: { code: string } | null;
}

/** Copropriétaire ayant choisi l'éco-PTZ individuel. */
export interface DemandeEcoPtz {
  coproprietaireId: string;
  nom: string;
  /** Lots cochés au portail (peut contenir des annexes ou être vide = tous). */
  lotIds: string[];
}

export interface LigneLogementEcoPtz {
  lotNumero: number;
  titre: string;
  /** Montant éligible du poste pour toute la copropriété. */
  montantCopro: number;
  /** Clé principale du poste (celle qui porte le plus gros montant). */
  cle: string;
  /** Tantièmes du logement et total de la clé principale. */
  tantiemes: number;
  totalCle: number;
  /** Le poste est réparti sur plusieurs clés (tantièmes affichés = clé principale). */
  plusieursCles: boolean;
  /** Quote-part éligible du logement (non arrondie). */
  quotePart: number;
}

export type PersonneMorale = "sci" | "societe" | null;

export interface LogementEcoPtz {
  /** Identifiant stable du logement : lot d'habitation. */
  lotId: string;
  lotNum: string;
  batiment: string | null;
  coproprietaireId: string;
  nom: string;
  annexes: { id: string; num: string; usage: string }[];
  /** Tantièmes du logement (habitation + annexes rattachées) par code de clé. */
  tantiemes: Record<string, number>;
  lignes: LigneLogementEcoPtz[];
  /** Somme des quotes-parts (coût total éligible revenant au logement). */
  total: number;
  personneMorale: PersonneMorale;
}

/** SCI (éligibilité conditionnelle) ou autre personne morale (non éligible en principe). */
export function personneMorale(nom: string): PersonneMorale {
  const n = ` ${nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()} `;
  if (/[\s(]S\.?\s?C\.?\s?I\.?[\s)]/.test(n)) return "sci";
  if (/[\s(](SARL|SAS|SASU|SA|EURL|SNC|SCPI|SDC|SOCIETE|SYNDICAT|IMMOBILIERE|GESTION|HOLDING|OPH|BAILLEUR)[\s).,]/.test(n))
    return "societe";
  return null;
}

/** Total des tantièmes par clé sur tous les lots de la copropriété (toutes typologies). */
export function totauxCles(lots: Pick<LotEcoPtz, "tantiemes">[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const l of lots) for (const [code, v] of Object.entries(l.tantiemes)) t[code] = (t[code] ?? 0) + v;
  return t;
}

const trierNum = (a: { num: string }, b: { num: string }) =>
  a.num.localeCompare(b.num, "fr", { numeric: true });

/**
 * Logements concernés par une demande : lots d'habitation du copropriétaire
 * cochés au portail ; si aucun lot d'habitation n'est coché (demande ancienne,
 * annexes seules), tous ses lots d'habitation.
 */
export function logementsDeLaDemande(d: DemandeEcoPtz, lots: LotEcoPtz[]): LotEcoPtz[] {
  const siens = lots.filter((l) => l.coproprietaire_id === d.coproprietaireId && l.usage === "habitation");
  const coches = siens.filter((l) => d.lotIds.includes(l.id));
  return (coches.length ? coches : siens).sort(trierNum);
}

/** Calcule les montants éligibles de chaque logement demandé. */
export function logementsEcoPtz(input: {
  postes: PosteEcoPtz[];
  lots: LotEcoPtz[];
  demandes: DemandeEcoPtz[];
}): LogementEcoPtz[] {
  const { postes, lots, demandes } = input;
  const totaux = totauxCles(lots);
  const out: LogementEcoPtz[] = [];
  for (const d of demandes) {
    for (const hab of logementsDeLaDemande(d, lots)) {
      const annexes = lots.filter((l) => l.rattache_a === hab.id && l.id !== hab.id).sort(trierNum);
      const tantiemes: Record<string, number> = { ...hab.tantiemes };
      for (const a of annexes)
        for (const [code, v] of Object.entries(a.tantiemes)) tantiemes[code] = (tantiemes[code] ?? 0) + v;

      const lignes: LigneLogementEcoPtz[] = postes.map((p) => {
        let quotePart = 0;
        for (const [cle, montant] of Object.entries(p.parCle)) {
          const total = totaux[cle] ?? 0;
          if (total > 0) quotePart += (montant * (tantiemes[cle] ?? 0)) / total;
        }
        const clesPoste = Object.entries(p.parCle).sort((a, b) => b[1] - a[1]);
        const cle = clesPoste[0]?.[0] ?? "";
        return {
          lotNumero: p.lotNumero,
          titre: p.titre,
          montantCopro: p.montantTtc,
          cle,
          tantiemes: tantiemes[cle] ?? 0,
          totalCle: totaux[cle] ?? 0,
          plusieursCles: clesPoste.length > 1,
          quotePart,
        };
      });
      out.push({
        lotId: hab.id,
        lotNum: hab.num,
        batiment: hab.batiment?.code ?? null,
        coproprietaireId: d.coproprietaireId,
        nom: d.nom,
        annexes: annexes.map((a) => ({ id: a.id, num: a.num, usage: a.usage })),
        tantiemes,
        lignes,
        total: lignes.reduce((s, l) => s + l.quotePart, 0),
        personneMorale: personneMorale(d.nom),
      });
    }
  }
  return out.sort((a, b) => a.nom.localeCompare(b.nom, "fr") || trierNum({ num: a.lotNum }, { num: b.lotNum }));
}

/**
 * Montant au format du CERFA : séparateur de milliers = espace simple (les
 * polices standard des PDF n'ont pas l'espace fine insécable), virgule et
 * toujours deux décimales. L'arrondi au centime n'intervient qu'ici.
 */
export function fmtMontantCerfa(n: number): string {
  const centimes = Math.round(n * 100);
  const signe = centimes < 0 ? "-" : "";
  const abs = Math.abs(centimes);
  const ent = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${signe}${ent},${String(abs % 100).padStart(2, "0")}`;
}

/** « 4 route d'Oberhausbergen » → { num: "4", voie: "route d'Oberhausbergen" }. */
export function decouperAdresse(adresse: string | null | undefined): { num: string; voie: string } {
  const a = (adresse ?? "").trim().replace(/\s+/g, " ");
  const m = /^(\d+(?:\s*[-/à]\s*\d+)?(?:\s*(?:bis|ter|quater|[a-d])\b)?)[,\s]+(.+)$/i.exec(a);
  return m ? { num: m[1].replace(/\s+/g, " "), voie: m[2] } : { num: "", voie: a };
}
