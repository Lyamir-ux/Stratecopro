// Contrôles déterministes de la plateforme (étape [4] du brief), rejoués sur le
// JSON pppt-verif/1.0 à l'import et à chaque enregistrement de la revue.
// Les codes R/C recalculés reprennent la numérotation du skill ; les codes P
// sont propres à la plateforme (données de la fiche, cycle de vie).
// Chaque règle produit une remarque de famille « plateforme » : ce sont elles
// qui, matérialisées à la validation, remontent au syndic les trous du rapport
// qu'il a payé (argument commercial du brief). Fonctions pures, testées.

import type { Controle, PpptVerifJson, SeveriteControle, StatutControle, TravailNormalise, TravailSource } from "./schema";
import { codePriorite } from "./schema";
import {
  CHARGE_ANNUELLE_MAX_PAR_LOGEMENT,
  ENCHAINEMENTS,
  FONDS_TRAVAUX,
  FOURCHETTES_COUT,
  FOURCHETTES_GAIN,
  MOTS_TVA_10,
  MOTS_TVA_5_5,
  ORDRE_ETIQUETTES,
  PLAFOND_GAIN,
  SURFACE_PAR_LOGEMENT,
  TAUX_TVA_ADMIS,
  TOTAL_PAR_LOGEMENT,
  contientUn,
  normaliser,
  tolerance,
} from "./referentiels";
import { etiquetteDepuisCep, gainCompose } from "./formules";

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
  const params = json.parametres_ppt;
  const anneeBase = params?.annee_base ?? json.echeancier_source?.annee_base ?? anneeCourante;
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
  const totalSourceBrut = sources.reduce((s, x) => s + (x.cout_source_eur ?? 0), 0);
  const totalAnnonce = json.echeancier_source?.total_annonce_eur ?? null;
  if (totalAnnonce != null && sources.some((s) => s.cout_source_eur != null)) {
    const ecart = Math.abs(totalSourceBrut - totalAnnonce);
    if (ecart > tolerance(totalAnnonce))
      out.push(
        rem("C01", "Total général du plan", "BLOQUANT", `La somme des postes (${fmt(totalSourceBrut)}) ne retombe pas sur le total annoncé (${fmt(totalAnnonce)}).`, {
          attendu: fmt(totalSourceBrut),
          observe: fmt(totalAnnonce),
          ecart: fmt(totalSourceBrut - totalAnnonce),
          action: "Retrouver le poste manquant ou l'erreur d'addition dans le rapport ; corriger avant validation.",
        })
      );
  }

  const totauxAnnonces = json.echeancier_source?.totaux_par_annee_annonces ?? {};
  for (const [annee, annonce] of Object.entries(totauxAnnonces)) {
    if (annonce == null) continue;
    const somme = sources.filter((s) => String(s.annee_source) === annee).reduce((a, s) => a + (s.cout_source_eur ?? 0), 0);
    if (Math.abs(somme - annonce) > tolerance(annonce))
      out.push(rem("C05", `Total de l'année ${annee}`, "MAJEUR", `Postes de ${annee} : ${fmt(somme)} ; total annuel annoncé : ${fmt(annonce)}.`, { attendu: fmt(somme), observe: fmt(annonce), ecart: fmt(somme - annonce), action: "Vérifier l'affectation des postes à l'année." }));
  }

  const sommeNormHt = normalises.reduce((s, t) => s + (t.cout_ht_base_eur ?? 0), 0);
  const sommeSourceHt = sources.reduce((s, x) => s + (coutSourceHt(x, tvaDefaut) ?? 0), 0);
  if (sommeSourceHt > 0 && normalises.length && ecartRelatif(sommeNormHt, sommeSourceHt) > 0.02 && Math.abs(sommeNormHt - sommeSourceHt) > 500)
    out.push(rem("P04", "Traçabilité de la normalisation", "MAJEUR", `Somme des postes normalisés (${fmt(sommeNormHt)} HT) éloignée de la somme des postes source ramenés en HT (${fmt(sommeSourceHt)}).`, { attendu: fmt(sommeSourceHt), observe: fmt(sommeNormHt), action: "Contrôler les conversions TTC → HT et les postes ajoutés ou fusionnés." }));

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
      out.push(rem("P06", "Coûts identiques répétés", "INFO", `${liste.length} postes distincts au même montant (${fmt(cout)}) : ${liste.map((t) => t.libelle).join(", ")}.`, { action: "S'assurer qu'il ne s'agit pas d'un copier-coller du rédacteur." }));

  if (nbLogements && nbLogements > 0) {
    const parAnnee = new Map<number, number>();
    for (const t of normalises) if (t.annee_prevue != null && t.cout_ht_base_eur != null) parAnnee.set(t.annee_prevue, (parAnnee.get(t.annee_prevue) ?? 0) + t.cout_ht_base_eur);
    for (const [annee, total] of parAnnee)
      if (total / nbLogements > CHARGE_ANNUELLE_MAX_PAR_LOGEMENT)
        out.push(rem("C16", `Charge annuelle ${annee}`, "INFO", `${fmt(total)} HT en ${annee}, soit ${fmt(total / nbLogements)} par logement, sans phasage ni aide mentionnés.`, { action: "Prévoir un phasage, le fonds travaux ou un prêt collectif." }));
    if (sommeNormHt > 0) {
      const parLogt = sommeNormHt / nbLogements;
      if (parLogt < TOTAL_PAR_LOGEMENT.min || parLogt > TOTAL_PAR_LOGEMENT.max)
        out.push(rem("P07", "Montant du plan par logement", "MAJEUR", `${fmt(sommeNormHt)} HT sur 10 ans pour ${nbLogements} logements, soit ${fmt(parLogt)} par logement.`, { attendu: `entre ${fmt(TOTAL_PAR_LOGEMENT.min)} et ${fmt(TOTAL_PAR_LOGEMENT.max)} par logement`, observe: fmt(parLogt), action: "Vérifier le nombre de logements et l'exhaustivité du chiffrage." }));
    }
    const maxAnnee = [...parAnnee.values()].reduce((a, b) => Math.max(a, b), 0);
    if (sommeNormHt > 0 && parAnnee.size > 1 && maxAnnee / sommeNormHt > 0.6)
      out.push(rem("P21", "Concentration du plan sur une année", "INFO", `${pct(maxAnnee / sommeNormHt)} du montant total sur une seule année.`, { action: "Vérifier que ce phasage est voulu (opération groupée) et finançable." }));
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

  for (const s of sources) {
    const p = normaliser(s.priorite_source);
    const t = normalises.find((x) => x.id === s.id);
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

  const gainsGestes = normalises.filter((t) => codePriorite(t.priorite) === "energetique").map((t) => t.gain_energetique_pct);
  const gainCompo = gainCompose(gainsGestes);
  if (perf?.gain_total_annonce_pct != null && gainsGestes.some((g) => g != null)) {
    const annonce = perf.gain_total_annonce_pct > 1 ? perf.gain_total_annonce_pct / 100 : perf.gain_total_annonce_pct;
    const brut = gainsGestes.reduce((s: number, g) => s + (g == null ? 0 : g > 1 ? g / 100 : g), 0);
    if (Math.abs(annonce - gainCompo) > 0.05)
      out.push(rem("C12", "Gain énergétique total", "MAJEUR", `Gain annoncé ${pct(annonce)} ; gains par geste composés (1 - Π(1 - g)) : ${pct(gainCompo)}${Math.abs(annonce - brut) < 0.02 ? " - le rapport additionne les gains bruts" : ""}.`, { attendu: pct(gainCompo), observe: pct(annonce), action: "Retenir le gain composé ; demander la méthode d'estimation au rédacteur." }));
    if (annonce > PLAFOND_GAIN) out.push(rem("C12", "Gain énergétique total", "MAJEUR", `Gain annoncé ${pct(annonce)} au-delà du plafond de vraisemblance (${pct(PLAFOND_GAIN)}).`));
  }
  for (const t of normalises) {
    const p = codePriorite(t.priorite);
    if (p === "energetique" && t.gain_energetique_pct == null)
      out.push(rem("P17", "Poste énergétique sans gain", "MINEUR", `« ${t.libelle} » est classé énergétique sans gain estimé.`, { poste_code: t.id, action: "Renseigner un gain indicatif ou reclasser le poste." }));
    if (p !== "energetique" && t.gain_energetique_pct)
      out.push(rem("P17", "Gain sur un poste non énergétique", "MINEUR", `« ${t.libelle} » (${t.priorite}) porte un gain de ${pct(t.gain_energetique_pct > 1 ? t.gain_energetique_pct / 100 : t.gain_energetique_pct)}.`, { poste_code: t.id }));
    if (p === "energetique" && t.gain_energetique_pct != null) {
      const g = t.gain_energetique_pct > 1 ? t.gain_energetique_pct / 100 : t.gain_energetique_pct;
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
  for (const t of normalises) {
    if (!t.cout_ht_base_eur) continue;
    const f = FOURCHETTES_COUT.find((x) => contientUn(texte(t), x.mots));
    if (!f) continue;
    const denominateur = f.unite === "appareil" ? 1 : nbLogements;
    const unite = f.unite === "appareil" ? "par appareil" : "par logement";
    if (!denominateur) continue;
    const ratio = t.cout_ht_base_eur / denominateur;
    const facteur = ratio < f.min ? f.min / ratio : ratio > f.max ? ratio / f.max : 1;
    if (facteur >= 2)
      out.push(rem("C04", `Ordre de grandeur - ${f.libelle}`, facteur >= 4 ? "BLOQUANT" : "MAJEUR", `« ${t.libelle} » : ${fmt(ratio)} ${unite}, fourchette usuelle ${fmt(f.min)} à ${fmt(f.max)}.`, { poste_code: t.id, attendu: `${fmt(f.min)} à ${fmt(f.max)} ${unite}`, observe: fmt(ratio), action: "Montant à confirmer par devis ; vérifier l'unité et le périmètre du poste." }));
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

  const cles = new Map<string, TravailNormalise[]>();
  for (const t of normalises) {
    const k = `${normaliser(t.ouvrage)}|${normaliser(t.batiment)}|${t.annee_prevue ?? ""}`;
    cles.set(k, [...(cles.get(k) ?? []), t]);
  }
  for (const liste of cles.values())
    if (liste.length > 1 && liste[0].ouvrage)
      out.push(rem("C15", "Doublon possible", "MAJEUR", `${liste.length} postes « ${liste[0].ouvrage} »${liste[0].batiment ? ` (${liste[0].batiment})` : ""} la même année ${liste[0].annee_prevue ?? ""} : ${liste.map((t) => t.libelle).join(" / ")}.`, { poste_code: liste[0].id, action: "Fusionner ou justifier." }));

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

  return out;
}

/** Bloquants non conformes restant (grille du skill + plateforme), hors codes levés. */
export function bloquantsRestants(json: PpptVerifJson, leves: string[] = []): Controle[] {
  return [...(json.controles ?? []), ...(json.remarques_plateforme ?? [])].filter(
    (c) => c.severite === "BLOQUANT" && c.statut === "NON_CONFORME" && !leves.includes(c.code)
  );
}

/** Compteurs par sévérité des remarques effectives (non conformes ou partielles). */
export function compterSeverites(controles: Controle[]): Record<SeveriteControle, number> {
  const n: Record<SeveriteControle, number> = { BLOQUANT: 0, MAJEUR: 0, MINEUR: 0, INFO: 0 };
  for (const c of controles) if (c.statut === "NON_CONFORME" || c.statut === "PARTIEL") n[c.severite]++;
  return n;
}
