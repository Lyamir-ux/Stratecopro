// Contrôles déterministes de la plateforme (étape [4] du brief), rejoués sur le
// JSON pppt-verif (forme 1.2, import.ts) à l'import et à chaque enregistrement
// de la revue. Les codes R/C recalculés reprennent la numérotation du skill ;
// les codes P sont propres à la plateforme (données de la fiche, cycle de vie).
// Chaque règle produit une remarque de famille « plateforme » : ce sont elles
// qui, matérialisées à la validation, remontent au syndic les trous du rapport
// qu'il a payé (argument commercial du brief). Une proposition du skill
// acceptée ou modifiée par l'AMO n'est jamais contredite : l'alerte qu'elle
// tranche devient une info « choix validé » (propositionsValidees).
// Fonctions pures, testées.

import type { Controle, PpptVerifJson, Proposition, SeveriteControle, StatutControle, TravailNormalise, TravailSource } from "./schema";
import { cleControle, codePriorite, coutHtSource, estRetenu, posteRacine } from "./schema";
import {
  CHARGE_ANNUELLE_MAX_PAR_LOGEMENT,
  ENCHAINEMENTS,
  FONDS_TRAVAUX,
  FOURCHETTES_COUT,
  FOURCHETTES_GAIN,
  MOTS_TVA_10,
  MOTS_TVA_5_5,
  MOTS_VIDES,
  ORDRE_ETIQUETTES,
  PLAFOND_GAIN,
  SEUIL_ORDRE_DE_GRANDEUR_HT,
  SURFACE_PAR_LOGEMENT,
  TAUX_TVA_ADMIS,
  TOTAL_PAR_LOGEMENT,
  contientUn,
  normaliser,
  tolerance,
} from "./referentiels";
import { etiquetteDepuisCep, gainCompose, montantTtcPoste, parametresDepuisJson } from "./formules";
import { normaliserPeriode } from "./import";

/** Données de la fiche plateforme confrontées au document. */
export interface FicheCopro {
  nom?: string | null;
  adresse?: string | null;
  commune?: string | null;
  nb_lots?: number | null;
  nb_logements?: number | null;
  surface_m2?: number | null;
  annee_construction?: number | null;
  etiquette_energie?: string | null;
  cep_kwhep_m2_an?: number | null;
  date_dpe?: string | null;
  fonds_travaux_solde?: number | null;
  fonds_travaux_cotisation_annuelle?: number | null;
  budget_previsionnel_annuel?: number | null;
}

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
const pct = (f: number) => (f * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %";

function rem(
  code: string,
  libelle: string,
  severite: SeveriteControle,
  constat: string,
  extra: Partial<Controle> = {},
  statut: StatutControle = "NON_CONFORME"
): Controle {
  return {
    code,
    famille: "plateforme",
    libelle,
    reference: null,
    statut,
    severite,
    constat,
    attendu: null,
    observe: null,
    ecart: null,
    action: null,
    page: null,
    ...extra,
  };
}

const texte = (t: TravailNormalise | TravailSource) =>
  "libelle" in t ? `${t.libelle} ${t.ouvrage ?? ""}` : `${t.libelle_source} ${t.ouvrage ?? ""}`;

const ecartRelatif = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : 1) : Math.abs(a - b) / Math.abs(b));

/** Coût source ramené en HT (null si inconnu). */
function coutSourceHt(s: TravailSource, tvaDefaut: number): number | null {
  if (s.cout_source_eur == null) return null;
  if (s.cout_source_base === "TTC") return s.cout_source_eur / (1 + (s.tva_source_pct ?? tvaDefaut) / 100);
  return s.cout_source_eur;
}

/** Coût source dans la base d'un total annoncé (HT par défaut). */
function coutSourceDansBase(s: TravailSource, base: "HT" | "TTC" | null | undefined, tvaDefaut: number): number | null {
  const ht = coutSourceHt(s, tvaDefaut);
  if (ht == null || base !== "TTC") return ht;
  return s.cout_source_base === "TTC" ? s.cout_source_eur : ht * (1 + (s.tva_source_pct ?? tvaDefaut) / 100);
}

/** Ligne proposée en option par le skill (P01 « lignes marquées option ») : hors du plan de base. */
export const estOption = (t: Pick<TravailNormalise, "libelle" | "commentaire">): boolean => contientUn(`${t.libelle} ${t.commentaire ?? ""}`, ["option"]);

/** Mots significatifs d'un libellé, pour rapprocher deux postes (C15). */
function motsLibelle(s: string): Set<string> {
  return new Set(
    normaliser(s)
      .split(/[^a-z0-9]+/)
      .filter((m) => m.length >= 3 && !MOTS_VIDES.includes(m) && !/^t\d+[a-z]?$/.test(m))
  );
}

/** Deux libellés proches : la moitié de leurs mots en commun, ou l'un contenu dans l'autre. */
export function libellesProches(a: string, b: string): boolean {
  const ma = motsLibelle(a);
  const mb = motsLibelle(b);
  if (!ma.size || !mb.size) return normaliser(a).trim() === normaliser(b).trim();
  const communs = [...ma].filter((m) => mb.has(m)).length;
  const union = new Set([...ma, ...mb]).size;
  return communs / union >= 0.5 || (communs >= 2 && communs === Math.min(ma.size, mb.size));
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

/**
 * Une proposition acceptée ou modifiée par l'AMO porte-t-elle sur cette ligne
 * et ce contrôle ? Ligne : citée dans `lignes_concernees`, directement, par son
 * poste d'origine (T06a cité → T06c couvert : même poste éclaté par période) ou
 * par un poste qu'elle regroupe. Contrôle : lien explicite `controle_lie`, ou
 * décision de TVA pour C03.
 */
function propositionQuiTranche(c: Controle, propositions: Proposition[], ligne: TravailNormalise | undefined): Proposition | undefined {
  if (!c.poste_code) return undefined;
  const ids = new Set([c.poste_code, ...(ligne?.regroupe_ids ?? [])]);
  const racines = new Set([...ids].map(posteRacine));
  return propositions.find((p) => {
    if (p.statut_validation !== "VALIDEE" && p.statut_validation !== "MODIFIEE") return false;
    const couvre = p.lignes_concernees.some((l) => ids.has(l) || racines.has(posteRacine(l)));
    const surCeControle = p.controle_lie === c.code || (c.code === "C03" && contientUn(`${p.theme} ${p.decision} ${p.valeur_proposee}`, ["tva"]));
    return couvre && surCeControle;
  });
}

/** Les alertes de ligne tranchées par une proposition validée deviennent une info « choix validé par l'AMO ». */
function propositionsValidees(remarques: Controle[], json: PpptVerifJson): Controle[] {
  const propositions = json.propositions ?? [];
  if (!propositions.length) return remarques;
  const lignes = new Map((json.travaux_normalises ?? []).map((t) => [t.id, t]));
  return remarques.map((c) => {
    const p = propositionQuiTranche(c, propositions, c.poste_code ? lignes.get(c.poste_code) : undefined);
    if (!p) return c;
    const quand = p.date_validation ? ` le ${fmtDate(p.date_validation)}` : "";
    return {
      ...c,
      severite: "INFO",
      statut: "CONFORME",
      constat: `Choix validé par l'AMO${quand} (${p.code}${p.valeur_proposee ? ` : ${p.valeur_proposee}` : ""}). Alerte de la plateforme non retenue : ${c.constat ?? ""}`.trim(),
      action: null,
    };
  });
}

/**
 * Tous les contrôles déterministes applicables à un JSON et à la fiche de la
 * copropriété. `aujourdHui` est injectable pour les tests.
 */
export function controlesPlateforme(json: PpptVerifJson, fiche: FicheCopro = {}, aujourdHui: Date = new Date()): Controle[] {
  const out: Controle[] = [];
  const anneeCourante = aujourdHui.getFullYear();
  const copro = json.copropriete ?? ({} as PpptVerifJson["copropriete"]);
  const normalises = json.travaux_normalises ?? [];
  const sources = json.travaux_source ?? [];
  // un poste source exclu du PPT (1.2, retenu_dans_ppt: false) ne compte dans aucun total
  const sourcesRetenues = sources.filter(estRetenu);
  const params = json.parametres_ppt;
  const anneeBase = params?.annee_base ?? json.echeancier_source?.annee_base ?? anneeCourante;
  const calcul = parametresDepuisJson(params);
  const ttcLigne = (t: TravailNormalise) =>
    montantTtcPoste({ cout_ht_base: t.cout_ht_base_eur, tva_pct: t.tva_pct, avec_moe: t.avec_moe, annee_prevue: t.annee_prevue, gain_energetique_pct: t.gain_energetique_pct, priorite: codePriorite(t.priorite) }, calcul);
  /** Ligne du tableau qui reprend un poste source : même identifiant ou regroupement. */
  const ligneDeSource = (id: string) => normalises.find((t) => t.id === id) ?? normalises.find((t) => t.regroupe_ids?.includes(id));
  const dpe = json.diagnostics_sources?.dpe_collectif;
  const nbLogements = copro.nb_logements ?? fiche.nb_logements ?? null;
  const nbLots = copro.nb_lots_total ?? fiche.nb_lots ?? null;
  const surface = copro.surface_m2 ?? fiche.surface_m2 ?? null;
  const tvaDefaut = json.hypotheses_financieres_source?.tva_par_defaut_pct ?? 10;

  // ---------- A. Intégrité ----------
  const manquants: string[] = [];
  if (!copro.nom) manquants.push("nom");
  if (copro.nb_lots_total == null && copro.nb_logements == null) manquants.push("nombre de lots ou de logements");
  if (copro.annee_construction == null) manquants.push("année de construction");
  if (manquants.length)
    out.push(rem("P02", "Identification de la copropriété incomplète", "MAJEUR", `Champs absents du document : ${manquants.join(", ")}.`, { action: "Compléter la fiche depuis les documents du syndic." }));

  for (const t of normalises) {
    if (t.cout_ht_base_eur == null)
      out.push(rem("P03", "Poste non chiffré", "MAJEUR", `« ${t.libelle} » n'a aucun coût dans le PPPT.`, { poste_code: t.id, action: "À chiffrer par devis ou estimation explicite (jamais silencieuse)." }));
    else if (t.cout_ht_base_eur === 0)
      out.push(rem("P19", "Coût nul", "MAJEUR", `« ${t.libelle} » est chiffré à 0 €.`, { poste_code: t.id, action: "Vérifier s'il s'agit d'un oubli ou d'un poste sans objet." }));
  }

  // ---------- B. Arithmétique ----------
  // Totaux annoncés : comparés aux seuls postes source retenus, dans la base du
  // total (HT par défaut) ; le total général est celui du plan de référence.
  const baseAnnonce = json.echeancier_source?.total_annonce_base ?? "HT";
  const exclus = sources.filter((s) => !estRetenu(s));
  const totalSourceRetenu = sourcesRetenues.reduce((s, x) => s + (coutSourceDansBase(x, baseAnnonce, tvaDefaut) ?? 0), 0);
  const totalAnnonce = json.echeancier_source?.total_annonce_eur ?? null;
  const plan = json.echeancier_source?.scenario_reference ? ` du plan « ${json.echeancier_source.scenario_reference} »` : "";
  const horsExclus = exclus.length ? ` hors poste${exclus.length > 1 ? "s" : ""} exclu${exclus.length > 1 ? "s" : ""} du PPT (${exclus.map((s) => s.id).join(", ")})` : "";
  if (totalAnnonce != null && sourcesRetenues.some((s) => s.cout_source_eur != null)) {
    const ecart = Math.abs(totalSourceRetenu - totalAnnonce);
    if (ecart > tolerance(totalAnnonce))
      out.push(
        rem("C01", "Total général du plan", "BLOQUANT", `La somme des postes retenus${horsExclus} (${fmt(totalSourceRetenu)} ${baseAnnonce}) ne retombe pas sur le total annoncé${plan} (${fmt(totalAnnonce)}).`, {
          attendu: fmt(totalSourceRetenu),
          observe: fmt(totalAnnonce),
          ecart: fmt(totalSourceRetenu - totalAnnonce),
          action: "Retrouver le poste manquant ou l'erreur d'addition dans le rapport, ou vérifier le plan de référence (scenario_reference) ; corriger avant validation.",
        })
      );
  }

  // totaux par période : jointure sur le libellé de `periode_source` (« 0 à 1 an »),
  // ou sur l'année quand la clé est un millésime
  const totauxAnnonces = json.echeancier_source?.totaux_par_annee_annonces ?? {};
  for (const [cle, annonce] of Object.entries(totauxAnnonces)) {
    if (annonce == null) continue;
    const k = normaliserPeriode(cle);
    const millesime = /^\d{4}$/.test(k);
    const concernes = sourcesRetenues.filter((s) => normaliserPeriode(s.periode_source) === k || (millesime && String(s.annee_source) === k));
    const somme = concernes.reduce((a, s) => a + (coutSourceDansBase(s, baseAnnonce, tvaDefaut) ?? 0), 0);
    const quoi = millesime ? `l'année ${k}` : `la période « ${k} »`;
    if (Math.abs(somme - annonce) > tolerance(annonce))
      out.push(
        rem("C05", millesime ? `Total de l'année ${k}` : `Total de la période « ${k} »`, "MAJEUR", concernes.length ? `Postes retenus de ${quoi} : ${fmt(somme)} ; total annoncé : ${fmt(annonce)}.` : `Aucun poste source rattaché à ${quoi} (total annoncé ${fmt(annonce)}).`, {
          attendu: fmt(somme),
          observe: fmt(annonce),
          ecart: fmt(somme - annonce),
          action: "Vérifier l'affectation des postes à la période.",
        })
      );
  }

  // traçabilité : montants source des lignes (avant réévaluation) ↔ postes source retenus
  const sommeNormHt = normalises.reduce((s, t) => s + (t.cout_ht_base_eur ?? 0), 0);
  const sommeNormSource = normalises.reduce((s, t) => s + (coutHtSource(t) ?? 0), 0);
  const sommeSourceHt = sourcesRetenues.reduce((s, x) => s + (coutSourceHt(x, tvaDefaut) ?? 0), 0);
  if (sommeSourceHt > 0 && normalises.length && ecartRelatif(sommeNormSource, sommeSourceHt) > 0.02 && Math.abs(sommeNormSource - sommeSourceHt) > 500) {
    const nonRepris = sourcesRetenues.filter((s) => !ligneDeSource(s.id)).map((s) => s.id);
    out.push(
      rem("P04", "Traçabilité de la normalisation", "MAJEUR", `Somme des lignes en montant source (${fmt(sommeNormSource)} HT, avant réévaluation) éloignée de la somme des postes source retenus ramenés en HT (${fmt(sommeSourceHt)})${nonRepris.length ? ` ; postes source retenus sans ligne : ${nonRepris.join(", ")}` : ""}.`, {
        attendu: fmt(sommeSourceHt),
        observe: fmt(sommeNormSource),
        action: "Contrôler les conversions TTC → HT, les postes ajoutés, fusionnés ou à exclure (retenu_dans_ppt: false).",
      })
    );
  }

  // réévaluation des prix (1.2) : HT de base = HT source × coefficient, à 1 € près
  for (const t of normalises) {
    const source = t.cout_ht_source_eur;
    if (source == null || t.cout_ht_base_eur == null || t.cout_ht_origine === "estime_strateco") continue;
    const coef = t.reevaluation_prix_coef ?? 1;
    const attendu = source * coef;
    if (Math.abs(attendu - t.cout_ht_base_eur) > 1)
      out.push(rem("P25", "Réévaluation des prix", "MINEUR", `« ${t.libelle} » : ${fmt(source)} HT source × ${coef.toLocaleString("fr-FR", { maximumFractionDigits: 6 })} = ${fmt(attendu)}, la ligne porte ${fmt(t.cout_ht_base_eur)} HT.`, { poste_code: t.id, attendu: fmt(attendu), observe: fmt(t.cout_ht_base_eur), action: "Recalculer le HT de base ou corriger le coefficient de la ligne." }));
  }

  for (const t of normalises) {
    if (t.cout_ht_origine !== "converti_depuis_TTC" || t.cout_ht_base_eur == null) continue;
    const s = sources.find((x) => x.id === t.id);
    if (!s || s.cout_source_eur == null) continue;
    const attendu = s.cout_source_eur / (1 + t.tva_pct / 100);
    if (Math.abs(attendu - t.cout_ht_base_eur) > Math.max(50, attendu * 0.005))
      out.push(rem("P05", "Conversion TTC → HT", "MINEUR", `« ${t.libelle} » : ${fmt(s.cout_source_eur)} TTC / (1 + ${t.tva_pct} %) = ${fmt(attendu)} HT, le JSON porte ${fmt(t.cout_ht_base_eur)}.`, { poste_code: t.id, attendu: fmt(attendu), observe: fmt(t.cout_ht_base_eur) }));
  }

  const parCout = new Map<number, TravailNormalise[]>();
  for (const t of normalises) if (t.cout_ht_base_eur) parCout.set(t.cout_ht_base_eur, [...(parCout.get(t.cout_ht_base_eur) ?? []), t]);
  for (const [cout, liste] of parCout)
    if (liste.length >= 3)
      out.push(rem("P06", `Coûts identiques répétés - ${fmt(cout)}`, "INFO", `${liste.length} postes distincts au même montant (${fmt(cout)}) : ${liste.map((t) => t.libelle).join(", ")}.`, { action: "S'assurer qu'il ne s'agit pas d'un copier-coller du rédacteur." }));

  if (nbLogements && nbLogements > 0) {
    // charge et concentration : TTC actualisé des lignes, sur leurs années du tableau (lissage compris)
    const parAnnee = new Map<number, { total: number; options: number; idsOptions: string[] }>();
    for (const t of normalises) {
      const ttc = t.annee_prevue != null ? ttcLigne(t) : null;
      if (ttc == null || t.annee_prevue == null) continue;
      const a = parAnnee.get(t.annee_prevue) ?? { total: 0, options: 0, idsOptions: [] };
      a.total += ttc;
      if (estOption(t)) {
        a.options += ttc;
        a.idsOptions.push(t.id);
      }
      parAnnee.set(t.annee_prevue, a);
    }
    const totalTtc = [...parAnnee.values()].reduce((s, a) => s + a.total, 0);
    const dontOptions = (a: { total: number; options: number; idsOptions: string[] }) =>
      a.options > 0 ? `, dont ${fmt(a.options)} d'option${a.idsOptions.length > 1 ? "s" : ""} (${a.idsOptions.join(", ")}, ${pct(a.options / a.total)} de l'année)` : "";
    for (const [annee, a] of [...parAnnee].sort((x, y) => x[0] - y[0]))
      if (a.total / nbLogements > CHARGE_ANNUELLE_MAX_PAR_LOGEMENT)
        out.push(rem("C16", `Charge annuelle ${annee}`, "INFO", `${fmt(a.total)} TTC en ${annee}, soit ${fmt(a.total / nbLogements)} par logement${dontOptions(a)}.`, { action: "Prévoir un phasage, le fonds travaux ou un prêt collectif." }));
    if (sommeNormHt > 0) {
      const parLogt = sommeNormHt / nbLogements;
      if (parLogt < TOTAL_PAR_LOGEMENT.min || parLogt > TOTAL_PAR_LOGEMENT.max)
        out.push(rem("P07", "Montant du plan par logement", "MAJEUR", `${fmt(sommeNormHt)} HT sur 10 ans pour ${nbLogements} logements, soit ${fmt(parLogt)} par logement.`, { attendu: `entre ${fmt(TOTAL_PAR_LOGEMENT.min)} et ${fmt(TOTAL_PAR_LOGEMENT.max)} par logement`, observe: fmt(parLogt), action: "Vérifier le nombre de logements et l'exhaustivité du chiffrage." }));
    }
    const pic = [...parAnnee].reduce<[number, { total: number; options: number; idsOptions: string[] }] | null>((m, x) => (!m || x[1].total > m[1].total ? x : m), null);
    if (pic && totalTtc > 0 && parAnnee.size > 1 && pic[1].total / totalTtc > 0.6)
      out.push(rem("P21", "Concentration du plan sur une année", "INFO", `${pct(pic[1].total / totalTtc)} du montant total TTC en ${pic[0]}${dontOptions(pic[1])}.`, { action: "Vérifier que ce phasage est voulu (opération groupée) et finançable." }));
  }

  // ---------- C. Temporalité ----------
  const premiere = json.echeancier_source?.premiere_annee ?? null;
  const derniere = json.echeancier_source?.derniere_annee ?? null;
  const horsHorizon = normalises.filter((t) => t.annee_prevue != null && (t.annee_prevue < anneeBase + 1 || t.annee_prevue > anneeBase + 10));
  if ((premiere != null && premiere > anneeBase + 1) || (derniere != null && premiere != null && derniere > premiere + 9) || horsHorizon.length)
    out.push(rem("C06", "Horizon de 10 ans", "MAJEUR", `Année de base ${anneeBase} : première année ${premiere ?? "-"}, dernière ${derniere ?? "-"} ; ${horsHorizon.length} poste(s) hors de la fenêtre ${anneeBase + 1}-${anneeBase + 10}.`, { attendu: `${anneeBase + 1} à ${anneeBase + 10}`, action: "Ramener les postes dans l'horizon ou fixer l'année d'adoption en AG." }));

  for (const t of normalises)
    if (t.annee_prevue != null && t.annee_prevue < anneeCourante)
      out.push(rem("P08", "Poste dans le passé", "MAJEUR", `« ${t.libelle} » est prévu en ${t.annee_prevue}, avant l'année courante.`, { poste_code: t.id, action: "Requalifier : réalisé, reporté ou abandonné." }));

  for (const s of sourcesRetenues) {
    const p = normaliser(s.priorite_source);
    const t = ligneDeSource(s.id);
    const annee = t?.annee_prevue ?? s.annee_source;
    if (annee == null) continue;
    if ((p.includes("urgent") || p.includes("immediat")) && annee > anneeBase + 2)
      out.push(rem("C10", "Priorité ↔ année", "MINEUR", `« ${s.libelle_source} » est « ${s.priorite_source} » mais programmé en ${annee}.`, { poste_code: s.id, attendu: `${anneeBase + 1} ou ${anneeBase + 2}` }));
    if (p.includes("long terme") && annee < anneeBase + 5)
      out.push(rem("C10", "Priorité ↔ année", "MINEUR", `« ${s.libelle_source} » est « long terme » mais programmé dès ${annee}.`, { poste_code: s.id, attendu: `à partir de ${anneeBase + 5}` }));
  }

  const dateDoc = json.document_source?.date_document ? new Date(json.document_source.date_document) : null;
  if (!dateDoc || Number.isNaN(dateDoc.getTime()))
    out.push(rem("P09", "Date du document", "MINEUR", "Le PPPT n'est pas daté (ou la date n'a pas été lue).", { action: "Demander la version datée au rédacteur." }));
  else if (dateDoc > aujourdHui) out.push(rem("P09", "Date du document", "MINEUR", `Date du document dans le futur : ${json.document_source.date_document}.`));
  else if (anneeCourante - dateDoc.getFullYear() > 10)
    out.push(rem("P09", "PPPT de plus de 10 ans", "MAJEUR", `Document daté de ${dateDoc.getFullYear()} : le plan doit être actualisé (art. 14-2, révision décennale).`, { action: "Engager l'actualisation du PPPT." }));

  if (!dpe || !dpe.present) out.push(rem("P10", "DPE collectif absent", "MAJEUR", "Aucun DPE collectif n'accompagne le PPPT.", { action: "Récupérer le DPE collectif (obligatoire selon la taille de la copropriété) ; il conditionne l'étiquette et le Cep de référence." }));
  else {
    const d = dpe.date ? new Date(dpe.date) : null;
    if (d && !Number.isNaN(d.getTime())) {
      if (anneeCourante - d.getFullYear() > 10) out.push(rem("P10", "DPE collectif périmé", "MAJEUR", `DPE daté de ${d.getFullYear()} : plus de 10 ans.`, { action: "Refaire le DPE collectif." }));
      if (d >= new Date("2021-07-01") && dpe.methode && !normaliser(dpe.methode).includes("3cl"))
        out.push(rem("P10", "Méthode du DPE", "MAJEUR", `DPE postérieur au 01/07/2021 en méthode « ${dpe.methode} » : la méthode 3CL-2021 est attendue.`, { action: "Vérifier l'opposabilité du DPE." }));
    }
  }

  if (copro.annee_construction != null && dateDoc && dateDoc.getFullYear() - copro.annee_construction < 15)
    out.push(rem("R03", "Immeuble de moins de 15 ans", "INFO", `Construit en ${copro.annee_construction} : le PPPT n'est pas encore obligatoire (art. 14-2), il reste un outil de gestion.`, {}, "PARTIEL"));

  // ---------- D. Cohérence de la copropriété ----------
  if (copro.nb_lots_total != null && dpe?.nb_lots != null && copro.nb_lots_total !== dpe.nb_lots)
    out.push(rem("P11", "Nombre de lots PPPT ↔ DPE", "MAJEUR", `${copro.nb_lots_total} lots dans le PPPT, ${dpe.nb_lots} dans le DPE collectif.`, { attendu: String(dpe.nb_lots), observe: String(copro.nb_lots_total), action: "Trancher avec le règlement de copropriété ou l'état descriptif de division." }));
  if (copro.nb_lots_total != null && fiche.nb_lots != null && copro.nb_lots_total !== fiche.nb_lots)
    out.push(rem("P11", "Nombre de lots PPPT ↔ fiche", "MAJEUR", `${copro.nb_lots_total} lots dans le PPPT, ${fiche.nb_lots} sur la fiche de la plateforme.`, { attendu: String(fiche.nb_lots), observe: String(copro.nb_lots_total), action: "Arbitrer en revue : la fiche fait foi une fois corrigée." }));
  if (copro.nb_logements != null && fiche.nb_logements != null && copro.nb_logements !== fiche.nb_logements)
    out.push(rem("P11", "Nombre de logements PPPT ↔ fiche", "MAJEUR", `${copro.nb_logements} logements dans le PPPT, ${fiche.nb_logements} sur la fiche.`, { attendu: String(fiche.nb_logements), observe: String(copro.nb_logements) }));
  if (nbLogements != null && nbLots != null && nbLogements > nbLots)
    out.push(rem("P12", "Plus de logements que de lots", "BLOQUANT", `${nbLogements} logements pour ${nbLots} lots.`, { action: "Corriger l'un des deux nombres avant validation." }));
  if (surface != null && nbLogements && nbLogements > 0) {
    const parLogt = surface / nbLogements;
    if (parLogt < SURFACE_PAR_LOGEMENT.min || parLogt > SURFACE_PAR_LOGEMENT.max)
      out.push(rem("P13", "Surface par logement invraisemblable", "MAJEUR", `${surface.toLocaleString("fr-FR")} m² pour ${nbLogements} logements, soit ${Math.round(parLogt)} m² par logement.`, { attendu: `${SURFACE_PAR_LOGEMENT.min} à ${SURFACE_PAR_LOGEMENT.max} m²`, action: "Vérifier le type de surface (SHAB, SHON, SDP) et le nombre de logements." }));
  }
  if (copro.annee_construction != null && (copro.annee_construction < 1800 || copro.annee_construction > anneeCourante))
    out.push(rem("P14", "Année de construction", "MAJEUR", `Année de construction lue : ${copro.annee_construction}.`));
  if (fiche.commune && copro.commune && normaliser(fiche.commune) !== normaliser(copro.commune))
    out.push(rem("P15", "Commune du document ↔ fiche", "INFO", `Document : ${copro.commune} ; fiche : ${fiche.commune}.`, { action: "Vérifier qu'il s'agit bien de la même copropriété." }));
  else if (fiche.adresse && copro.adresse && !normaliser(copro.adresse).includes(normaliser(fiche.adresse).split(" ")[0]))
    out.push(rem("P15", "Adresse du document ↔ fiche", "INFO", `Document : ${copro.adresse} ; fiche : ${fiche.adresse}.`));

  // ---------- E. Énergie ----------
  const etiqInit = dpe?.etiquette_energie ?? (fiche.etiquette_energie as PpptVerifJson["performance_energetique"]["etiquette_visee"]) ?? null;
  const cepInit = dpe?.cep_kwhep_m2_an ?? fiche.cep_kwhep_m2_an ?? null;
  if (etiqInit && cepInit != null) {
    const attendu = etiquetteDepuisCep(cepInit);
    if (attendu && attendu !== etiqInit)
      out.push(rem("C13", "Étiquette ↔ Cep (état initial)", "MAJEUR", `Cep ${cepInit} kWhep/m².an correspond à la classe ${attendu}, le document annonce ${etiqInit}.`, { attendu, observe: etiqInit, action: "Vérifier le DPE (seuils 2021)." }));
  }
  const perf = json.performance_energetique;
  if (perf?.etiquette_visee && perf.cep_apres_kwhep_m2_an != null) {
    const attendu = etiquetteDepuisCep(perf.cep_apres_kwhep_m2_an);
    if (attendu && attendu !== perf.etiquette_visee)
      out.push(rem("C13", "Étiquette visée ↔ Cep après travaux", "MAJEUR", `Cep après ${perf.cep_apres_kwhep_m2_an} kWhep/m².an correspond à ${attendu}, le document vise ${perf.etiquette_visee}.`, { attendu, observe: perf.etiquette_visee }));
  }
  if (perf?.etiquette_visee && etiqInit && ORDRE_ETIQUETTES.indexOf(perf.etiquette_visee) > ORDRE_ETIQUETTES.indexOf(etiqInit))
    out.push(rem("P16", "Étiquette visée moins bonne que l'actuelle", "BLOQUANT", `Actuelle ${etiqInit}, visée ${perf.etiquette_visee}.`, { action: "Erreur de lecture ou de rapport : corriger avant validation." }));

  // gains : `gain_*_pct` en points de pourcentage (0.5 = 0,5 %), divisés par 100
  // pour calculer, sans heuristique sur la valeur. Le gain annoncé se compare au
  // gain composé de tous les gestes et, quand le skill a ajouté des gestes en
  // option (P01), au gain composé du plan de base : l'un des deux doit coller.
  const gestes = normalises.filter((t) => codePriorite(t.priorite) === "energetique");
  if (perf?.gain_total_annonce_pct != null && gestes.some((t) => t.gain_energetique_pct != null)) {
    const annonce = perf.gain_total_annonce_pct / 100;
    const horsOptions = gestes.filter((t) => !estOption(t));
    const perimetres = [{ libelle: "tous les gestes", gain: gainCompose(gestes.map((t) => t.gain_energetique_pct)) }];
    if (horsOptions.length && horsOptions.length < gestes.length) perimetres.push({ libelle: "hors options", gain: gainCompose(horsOptions.map((t) => t.gain_energetique_pct)) });
    const brut = gestes.reduce((s, t) => s + (t.gain_energetique_pct ?? 0), 0) / 100;
    const detail = perimetres.map((p) => `${pct(p.gain)} (${p.libelle})`).join(", ");
    if (!perimetres.some((p) => Math.abs(annonce - p.gain) <= 0.05))
      out.push(rem("C12", "Gain énergétique total", "MAJEUR", `Gain annoncé ${pct(annonce)} ; gains par geste composés (1 - Π(1 - g)) : ${detail}${Math.abs(annonce - brut) < 0.02 ? " - le rapport additionne les gains bruts" : ""}.`, { attendu: perimetres.map((p) => pct(p.gain)).join(" / "), observe: pct(annonce), action: "Retenir le gain composé ; demander la méthode d'estimation au rédacteur." }));
    if (annonce > PLAFOND_GAIN) out.push(rem("C12", "Gain énergétique total", "MAJEUR", `Gain annoncé ${pct(annonce)} au-delà du plafond de vraisemblance (${pct(PLAFOND_GAIN)}).`));
  }
  for (const t of normalises) {
    const p = codePriorite(t.priorite);
    if (p === "energetique" && t.gain_energetique_pct == null)
      out.push(rem("P17", "Poste énergétique sans gain", "MINEUR", `« ${t.libelle} » est classé énergétique sans gain estimé.`, { poste_code: t.id, action: "Renseigner un gain indicatif ou reclasser le poste." }));
    if (p !== "energetique" && t.gain_energetique_pct)
      out.push(rem("P17", "Gain sur un poste non énergétique", "MINEUR", `« ${t.libelle} » (${t.priorite}) porte un gain de ${pct(t.gain_energetique_pct / 100)}.`, { poste_code: t.id }));
    if (p === "energetique" && t.gain_energetique_pct != null) {
      const g = t.gain_energetique_pct / 100;
      const f = FOURCHETTES_GAIN.find((x) => contientUn(texte(t), x.mots));
      if (f && (g < f.min / 2 || g > f.max * 1.5))
        out.push(rem("C12", `Gain du geste « ${f.libelle} »`, "MAJEUR", `« ${t.libelle} » : gain ${pct(g)} hors de la fourchette usuelle ${pct(f.min)} à ${pct(f.max)}.`, { poste_code: t.id, attendu: `${pct(f.min)} à ${pct(f.max)}`, observe: pct(g) }));
    }
  }
  const energie = normaliser(copro.energie_chauffage);
  if (dpe?.etiquette_ges) {
    const fossile = /fioul|gaz|charbon/.test(energie);
    const vertueux = /electri|reseau|bois|pac|pompe/.test(energie);
    if (fossile && ["A", "B"].includes(dpe.etiquette_ges)) out.push(rem("P18", "Énergie ↔ étiquette GES", "INFO", `Chauffage ${copro.energie_chauffage} avec une étiquette GES ${dpe.etiquette_ges} : peu plausible.`));
    if (vertueux && ["F", "G"].includes(dpe.etiquette_ges)) out.push(rem("P18", "Énergie ↔ étiquette GES", "INFO", `Chauffage ${copro.energie_chauffage} avec une étiquette GES ${dpe.etiquette_ges} : peu plausible.`));
  }

  // ---------- F. Ordres de grandeur ----------
  // Rapprochement d'une fourchette indicative d'opération complète : c'est une
  // alerte de vraisemblance, jamais un manquement réglementaire, donc jamais
  // BLOQUANT. Les micro-postes (sous le seuil, ou regroupés) n'ont rien d'une
  // opération complète : pas de comparaison. Quand l'ouvrage de la ligne est
  // connu, seules ses familles sont candidates et le libellé les confirme ;
  // sinon, reconnaissance par mots-clés sur le libellé et l'ouvrage.
  for (const t of normalises) {
    if (!t.cout_ht_base_eur || t.cout_ht_base_eur < SEUIL_ORDRE_DE_GRANDEUR_HT || t.cout_ht_origine === "regroupement_micro_postes") continue;
    const familles = t.ouvrage ? FOURCHETTES_COUT.filter((x) => contientUn(t.ouvrage ?? "", x.ouvrages)) : [];
    const f = familles.length
      ? familles.find((x) => contientUn(t.libelle, x.mots, { horsNegation: true }))
      : FOURCHETTES_COUT.find((x) => contientUn(texte(t), x.mots, { horsNegation: true }));
    if (!f) continue;
    const denominateur = f.unite === "appareil" ? 1 : nbLogements;
    const unite = f.unite === "appareil" ? "par appareil" : "par logement";
    if (!denominateur) continue;
    const ratio = t.cout_ht_base_eur / denominateur;
    const sousFourchette = ratio < f.min;
    const facteur = sousFourchette ? f.min / ratio : ratio > f.max ? ratio / f.max : 1;
    if (facteur < 2) continue;
    out.push(
      rem("C04", `Ordre de grandeur - ${f.libelle}`, facteur >= 4 ? "MAJEUR" : "MINEUR", `« ${t.libelle} » : ${fmt(ratio)} ${unite}, fourchette indicative d'une opération complète ${fmt(f.min)} à ${fmt(f.max)} (écart × ${Math.round(facteur * 10) / 10}).`, {
        poste_code: t.id,
        attendu: `${fmt(f.min)} à ${fmt(f.max)} ${unite} (indicatif)`,
        observe: fmt(ratio),
        action: sousFourchette
          ? "Vérifier le périmètre : tranche, reprise ponctuelle ou poste partiel plutôt qu'une opération complète ; sinon confirmer par devis."
          : "Montant à confirmer par devis ; vérifier l'unité et le périmètre du poste.",
      })
    );
  }

  // ---------- G. TVA et base ----------
  const bases = new Set(sources.map((s) => s.cout_source_base).filter(Boolean));
  if (bases.size > 1) out.push(rem("C02", "Base HT / TTC hétérogène", "MAJEUR", "Le rapport mélange des montants HT et TTC.", { action: "Homogénéiser en HT (le JSON normalisé l'a fait : contrôler chaque conversion)." }));
  if (sources.length && sources.every((s) => s.cout_source_base == null && s.cout_source_eur != null))
    out.push(rem("C02", "Base HT / TTC non précisée", "MAJEUR", "Le rapport ne dit pas si ses montants sont HT ou TTC.", { action: "Demander la base au rédacteur ; le JSON a supposé HT." }));
  for (const t of normalises) {
    if (!TAUX_TVA_ADMIS.includes(t.tva_pct)) out.push(rem("P20", "Taux de TVA inconnu", "BLOQUANT", `« ${t.libelle} » : TVA ${t.tva_pct} %.`, { poste_code: t.id, attendu: "5,5 %, 10 % ou 20 %" }));
    const txt = texte(t);
    const energetique = codePriorite(t.priorite) === "energetique" || contientUn(txt, MOTS_TVA_5_5);
    if (t.tva_pct === 20)
      out.push(rem("C03", "TVA à 20 %", "MAJEUR", `« ${t.libelle} » à 20 % : seuls les travaux neufs ou hors champ le justifient.`, { poste_code: t.id, attendu: energetique ? "5,5 %" : "10 %" }));
    else if (energetique && t.tva_pct === 10 && !contientUn(txt, ["ravalement"]))
      out.push(rem("C03", "TVA ↔ nature du poste", "MAJEUR", `« ${t.libelle} » relève de la performance énergétique (5,5 %) mais porte 10 %.`, { poste_code: t.id, attendu: "5,5 %", observe: "10 %" }));
    else if (!energetique && t.tva_pct === 5.5 && contientUn(txt, MOTS_TVA_10))
      out.push(rem("C03", "TVA ↔ nature du poste", "MAJEUR", `« ${t.libelle} » est un poste d'entretien du bâti (10 %) mais porte 5,5 %.`, { poste_code: t.id, attendu: "10 %", observe: "5,5 %" }));
  }

  // ---------- H. Contenu du plan ----------
  if (normalises.length && !normalises.some((t) => codePriorite(t.priorite) === "preservation"))
    out.push(rem("R06", "Aucun poste de sauvegarde de l'immeuble", "BLOQUANT", "Le plan ne contient aucun travail de préservation du bâti (structure, façades, toitures, réseaux).", { action: "Vérifier l'état des lieux : un immeuble de plus de 15 ans sans poste de sauvegarde est exceptionnel." }));
  if (normalises.length && !normalises.some((t) => codePriorite(t.priorite) === "energetique"))
    out.push(rem("R08", "Aucun poste d'économie d'énergie", "BLOQUANT", "Le plan ne contient aucun poste énergétique ni justification de son absence.", { action: "Demander au rédacteur le volet énergie (décret 2022-663)." }));

  // doublon : même ouvrage, même bâtiment, même année ET libellés proches (un
  // ouvrage générique ne suffit pas). Deux regroupements de micro-postes ne se
  // doublonnent pas : leurs postes source (regroupe_ids) sont distincts.
  const cles = new Map<string, TravailNormalise[]>();
  for (const t of normalises) {
    if (!t.ouvrage) continue;
    const k = `${normaliser(t.ouvrage)}|${normaliser(t.batiment)}|${t.annee_prevue ?? ""}`;
    cles.set(k, [...(cles.get(k) ?? []), t]);
  }
  const regroupement = (t: TravailNormalise) => t.cout_ht_origine === "regroupement_micro_postes" || !!t.regroupe_ids?.length;
  for (const liste of cles.values()) {
    const vus = new Set<string>();
    for (const t of liste) {
      if (vus.has(t.id)) continue;
      const groupe = [t, ...liste.filter((u) => u !== t && !vus.has(u.id) && !(regroupement(t) && regroupement(u)) && libellesProches(t.libelle, u.libelle))];
      if (groupe.length < 2) continue;
      groupe.forEach((u) => vus.add(u.id));
      out.push(rem("C15", "Doublon possible", "MAJEUR", `${groupe.length} postes « ${t.ouvrage} »${t.batiment ? ` (${t.batiment})` : ""} aux libellés proches la même année ${t.annee_prevue ?? ""} : ${groupe.map((u) => u.libelle).join(" / ")}.`, { poste_code: t.id, action: "Fusionner ou justifier." }));
    }
  }

  for (const e of json.etat_des_lieux ?? []) {
    const lie = normalises.filter((t) => contientUn(texte(t), [e.ouvrage]) || (t.ouvrage && normaliser(t.ouvrage) === normaliser(e.ouvrage)));
    if (e.etat === "Mauvais") {
      if (!lie.length) out.push(rem("C15", "Ouvrage dégradé sans travaux", "MAJEUR", `« ${e.ouvrage} » est en mauvais état${e.pathologies ? ` (${e.pathologies})` : ""} et aucun poste ne le traite.`, { page: e.page, action: "Ajouter le poste ou justifier l'absence." }));
      else if (!lie.some((t) => t.annee_prevue != null && t.annee_prevue <= anneeBase + 3))
        out.push(rem("C09", "Priorité ↔ état constaté", "MAJEUR", `« ${e.ouvrage} » est en mauvais état mais n'est traité qu'à partir de ${Math.min(...lie.map((t) => t.annee_prevue ?? 9999))}.`, { poste_code: lie[0].id, page: e.page, action: "Avancer le poste ou expliquer le délai." }));
    }
    if (e.etat === "Bon" && lie.some((t) => t.annee_prevue != null && t.annee_prevue <= anneeBase + 2 && codePriorite(t.priorite) === "preservation"))
      out.push(rem("C09", "Priorité ↔ état constaté", "MAJEUR", `« ${e.ouvrage} » est en bon état mais un poste de préservation est programmé dès ${anneeBase + 1}-${anneeBase + 2}.`, { poste_code: lie[0].id, page: e.page }));
  }

  for (const ench of ENCHAINEMENTS) {
    const avant = normalises.filter((t) => contientUn(texte(t), ench.avant) && t.annee_prevue != null);
    const apres = normalises.filter((t) => contientUn(texte(t), ench.apres) && t.annee_prevue != null && !avant.includes(t));
    for (const b of apres)
      for (const a of avant)
        if ((a.annee_prevue ?? 0) > (b.annee_prevue ?? 0))
          out.push(rem("C11", "Enchaînement technique", "MAJEUR", `${ench.libelle} : « ${a.libelle} » (${a.annee_prevue}) vient après « ${b.libelle} » (${b.annee_prevue}).`, { poste_code: b.id, action: "Réordonner les postes." }));
  }
  const ite = normalises.filter((t) => contientUn(texte(t), ["ite", "isolation thermique par l'exterieur"]) && t.annee_prevue != null);
  const raval = normalises.filter((t) => contientUn(texte(t), ["ravalement"]) && !ite.includes(t) && t.annee_prevue != null);
  for (const r of raval) for (const i of ite) if ((r.annee_prevue ?? 0) < (i.annee_prevue ?? 0))
    out.push(rem("C11", "Ravalement avant ITE", "MAJEUR", `« ${r.libelle} » (${r.annee_prevue}) précède « ${i.libelle} » (${i.annee_prevue}) : le ravalement serait à refaire.`, { poste_code: r.id, action: "Grouper ravalement et isolation, ou supprimer le ravalement seul." }));
  if (raval.length && !ite.length && !normalises.some((t) => contientUn(texte(t), ["isolation"])))
    out.push(rem("R17", "Isolation embarquée", "MAJEUR", "Un ravalement est prévu sans isolation ni mention du décret 2017-919 (isolation obligatoire lors d'un ravalement important, sauf dérogation motivée).", { poste_code: raval[0].id, action: "Demander l'étude d'isolation embarquée ou la dérogation." }));

  // ---------- I. Fonds travaux (données de la fiche) ----------
  const cotisation = fiche.fonds_travaux_cotisation_annuelle ?? null;
  const solde = fiche.fonds_travaux_solde ?? null;
  if (cotisation == null && solde == null) out.push(rem("P24", "Fonds travaux non renseigné", "MINEUR", "Solde et cotisation du fonds travaux inconnus : les alertes de financement ne peuvent pas être calculées.", { action: "Renseigner l'onglet Fonds travaux (dernier arrêté de comptes)." }, "NON_VERIFIABLE"));
  else {
    if (cotisation != null && sommeNormHt > 0) {
      const minPlan = (sommeNormHt * FONDS_TRAVAUX.cotisationMinPctPlan) / 100;
      const minBudget = fiche.budget_previsionnel_annuel ? (fiche.budget_previsionnel_annuel * FONDS_TRAVAUX.cotisationMinPctBudget) / 100 : 0;
      const min = Math.max(minPlan, minBudget);
      if (cotisation < min)
        out.push(rem("P22", "Cotisation au fonds travaux insuffisante", "MAJEUR", `Cotisation annuelle ${fmt(cotisation)} ; minimum légal ${fmt(min)} (${FONDS_TRAVAUX.cotisationMinPctPlan} % du plan${minBudget ? ` ou ${FONDS_TRAVAUX.cotisationMinPctBudget} % du budget` : ""}).`, { attendu: fmt(min), observe: fmt(cotisation), action: "Inscrire la révision de la cotisation à l'ordre du jour de la prochaine AG (art. 14-2-1)." }));
    }
    if (solde != null) {
      const premiereAnnee = Math.min(...normalises.filter((t) => t.annee_prevue != null && t.cout_ht_base_eur).map((t) => t.annee_prevue as number));
      const montantPremiere = Number.isFinite(premiereAnnee) ? normalises.filter((t) => t.annee_prevue === premiereAnnee).reduce((s, t) => s + (t.cout_ht_base_eur ?? 0), 0) : 0;
      if (montantPremiere > 0 && solde < montantPremiere * FONDS_TRAVAUX.couvertureMinPremiereAnnee)
        out.push(rem("P23", "Fonds travaux ↔ première année", "INFO", `Solde ${fmt(solde)} pour ${fmt(montantPremiere)} HT programmés en ${premiereAnnee} : appel de fonds ou prêt collectif à prévoir.`, { action: "Anticiper le financement (éco-PTZ collectif, aides) dès la présentation en AG." }));
    }
  }

  return propositionsValidees(out, json);
}

/**
 * Bloquants non conformes restant (grille du skill + plateforme), hors remarques
 * levées. Une levée est une clé `cleControle` : un même code (C04, P20) peut
 * porter sur plusieurs postes et chacun se lève séparément. Les levées reçues
 * sous forme de code nu (anciens enregistrements) restent honorées.
 */
export function bloquantsRestants(json: PpptVerifJson, leves: string[] = []): Controle[] {
  return [...(json.controles ?? []), ...(json.remarques_plateforme ?? [])].filter(
    (c) => c.severite === "BLOQUANT" && c.statut === "NON_CONFORME" && !leves.includes(cleControle(c)) && !leves.includes(c.code)
  );
}

/** Compteurs par sévérité des remarques effectives (non conformes ou partielles). */
export function compterSeverites(controles: Controle[]): Record<SeveriteControle, number> {
  const n: Record<SeveriteControle, number> = { BLOQUANT: 0, MAJEUR: 0, MINEUR: 0, INFO: 0 };
  for (const c of controles) if (c.statut === "NON_CONFORME" || c.statut === "PARTIEL") n[c.severite]++;
  return n;
}
