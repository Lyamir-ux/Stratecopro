// Indicateurs des tableaux de bord PPT (vue Dirigeant, vue Gestionnaire) et
// alertes de cycle de vie (règles P30-P36). Fonctions pures sur des lignes
// « légères » (sous-ensembles des tables ppt_*), testées dans indicateurs.test.ts.
// Les montants sont actualisés depuis l'année courante (année de base = N) :
// c'est ce que vaudra chaque poste l'année où il sera voté.

import { anneeEffective, honorairesPoste, montantTtcPoste, parametresDepuisOrg, type ParametresOrg, type PosteCalcul } from "./formules";

export interface PosteLite extends PosteCalcul {
  id: string;
  ppt_copro_id: string;
  libelle: string;
  statut: string;
  montant_vote: number | null;
  actif: boolean;
}

export interface CoproLite {
  id: string;
  nom: string;
  organisation_id: string;
  gestionnaire_nom: string | null;
  gestionnaire_email: string | null;
  nb_logements: number | null;
  etiquette_energie: string | null;
  date_dpe: string | null;
  fonds_travaux_solde: number | null;
  fonds_travaux_cotisation_annuelle: number | null;
  created_at: string;
}

export interface AgLite {
  id: string;
  ppt_copro_id: string;
  date_ag: string;
}

export interface ResolutionLite {
  ag_id: string;
  poste_id: string | null;
  issue: string;
  article: string | null;
  montant_vote: number | null;
}

export interface RapportLite {
  id: string;
  ppt_copro_id: string;
  type: string;
  statut: string;
  valide_le: string | null;
  date_document: string | null;
  depose_le: string;
}

export const SANS_GESTIONNAIRE = "__sans__";

/** Clé de regroupement d'un gestionnaire (e-mail, à défaut le nom) - même règle que le portefeuille. */
export function cleGestionnaire(c: Pick<CoproLite, "gestionnaire_email" | "gestionnaire_nom">): string {
  return c.gestionnaire_email?.toLowerCase().trim() || c.gestionnaire_nom?.trim() || SANS_GESTIONNAIRE;
}

/** Postes encore « à faire voter » : programmés, présentés, rejetés ou reportés (vivants). */
export const STATUTS_OUVERTS = ["programme", "presente", "rejete", "reporte"];

export interface HonorairesAnnee {
  annee: number;
  /** postes vivants non encore votés */
  potentiel: number;
  /** postes votés (statut vote) */
  acquis: number;
  montantTtc: number;
  nbPostes: number;
}

/** Honoraires de suivi de travaux projetés par année, de N à N+horizon. */
export function honorairesParAnnee(postes: PosteLite[], org: ParametresOrg, anneeDebut: number, horizon = 10): HonorairesAnnee[] {
  const params = parametresDepuisOrg(org, anneeDebut);
  const lignes: HonorairesAnnee[] = [];
  for (let a = anneeDebut; a <= anneeDebut + horizon; a++) lignes.push({ annee: a, potentiel: 0, acquis: 0, montantTtc: 0, nbPostes: 0 });
  for (const p of postes) {
    if (!p.actif || p.statut === "abandonne" || p.statut === "realise") continue;
    const annee = anneeEffective(p);
    if (annee == null) continue;
    const idx = Math.min(Math.max(annee, anneeDebut), anneeDebut + horizon) - anneeDebut;
    const ligne = lignes[idx];
    const h = p.statut === "vote" && p.montant_vote != null ? Math.round(p.montant_vote * (org.taux_honoraires_pct / 100) * 100) / 100 : honorairesPoste(p, params, org);
    const ttc = p.statut === "vote" && p.montant_vote != null ? p.montant_vote : montantTtcPoste(p, params);
    if (h == null) continue;
    if (p.statut === "vote") ligne.acquis += h;
    else ligne.potentiel += h;
    ligne.montantTtc += ttc ?? 0;
    ligne.nbPostes++;
  }
  return lignes.map((l) => ({ ...l, potentiel: arr(l.potentiel), acquis: arr(l.acquis), montantTtc: arr(l.montantTtc) }));
}

const arr = (n: number) => Math.round(n * 100) / 100;

export interface StatsGestionnaire {
  key: string;
  nom: string;
  copros: number;
  logements: number;
  postes: number;
  /** postes ayant fait l'objet d'au moins une résolution (présentés, votés, rejetés, reportés) */
  presentes: number;
  votes: number;
  /** votés / présentés, null si rien n'a été présenté */
  tauxPassage: number | null;
  montantHt: number;
  honorairesPotentiels: number;
  honorairesAcquis: number;
  jamaisPresentes: number;
}

/** Comparatif par gestionnaire (vue Dirigeant). Les gestionnaires sans copro PPT n'y figurent pas :
 *  le tableau de bord les ajoute depuis la liste des membres (« non équipé »). */
export function statsParGestionnaire(copros: CoproLite[], postes: PosteLite[], org: ParametresOrg, anneeDebut: number): StatsGestionnaire[] {
  const params = parametresDepuisOrg(org, anneeDebut);
  const parCopro = new Map<string, PosteLite[]>();
  for (const p of postes) if (p.actif) parCopro.set(p.ppt_copro_id, [...(parCopro.get(p.ppt_copro_id) ?? []), p]);
  const groupes = new Map<string, StatsGestionnaire>();
  for (const c of copros) {
    const key = cleGestionnaire(c);
    const g = groupes.get(key) ?? { key, nom: c.gestionnaire_nom?.trim() || "Non attribué", copros: 0, logements: 0, postes: 0, presentes: 0, votes: 0, tauxPassage: null, montantHt: 0, honorairesPotentiels: 0, honorairesAcquis: 0, jamaisPresentes: 0 };
    g.copros++;
    g.logements += c.nb_logements ?? 0;
    const ps = parCopro.get(c.id) ?? [];
    let presenteCopro = false;
    for (const p of ps) {
      g.postes++;
      g.montantHt += p.cout_ht_base ?? 0;
      if (p.statut !== "programme") presenteCopro = true;
      if (["presente", "vote", "rejete", "reporte", "realise"].includes(p.statut)) g.presentes++;
      if (p.statut === "vote" || p.statut === "realise") {
        g.votes++;
        g.honorairesAcquis += p.montant_vote != null ? p.montant_vote * (org.taux_honoraires_pct / 100) : (honorairesPoste(p, params, org) ?? 0);
      } else if (STATUTS_OUVERTS.includes(p.statut)) g.honorairesPotentiels += honorairesPoste(p, params, org) ?? 0;
    }
    if (ps.length && !presenteCopro) g.jamaisPresentes++;
    groupes.set(key, g);
  }
  return [...groupes.values()]
    .map((g) => ({ ...g, tauxPassage: g.presentes ? Math.round((g.votes / g.presentes) * 100) : null, montantHt: arr(g.montantHt), honorairesPotentiels: arr(g.honorairesPotentiels), honorairesAcquis: arr(g.honorairesAcquis) }))
    .sort((a, b) => (a.key === SANS_GESTIONNAIRE ? 1 : b.key === SANS_GESTIONNAIRE ? -1 : a.nom.localeCompare(b.nom, "fr")));
}

export type NiveauAlerte = "haute" | "moyenne" | "basse";

export interface Alerte {
  code: string;
  niveau: NiveauAlerte;
  ppt_copro_id: string;
  copro: string;
  libelle: string;
  /** poste concerné, le cas échéant */
  poste_id?: string;
}

const moisEntre = (a: Date, b: Date) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

/** Alertes de cycle de vie (P30-P36), recalculées à chaque affichage. */
export function alertes(copros: CoproLite[], postes: PosteLite[], ags: AgLite[], rapports: RapportLite[], aujourdHui: Date = new Date()): Alerte[] {
  const out: Alerte[] = [];
  const annee = aujourdHui.getFullYear();
  const agsParCopro = new Map<string, AgLite[]>();
  for (const a of ags) agsParCopro.set(a.ppt_copro_id, [...(agsParCopro.get(a.ppt_copro_id) ?? []), a]);
  for (const c of copros) {
    const ps = postes.filter((p) => p.ppt_copro_id === c.id && p.actif);
    const agsC = agsParCopro.get(c.id) ?? [];
    const valide = rapports.filter((r) => r.ppt_copro_id === c.id && r.type === "pppt" && r.statut === "valide").sort((a, b) => (b.valide_le ?? "").localeCompare(a.valide_le ?? ""))[0];
    const agAVenir = agsC.some((a) => new Date(a.date_ag) >= aujourdHui);

    // P30 : PPT validé depuis plus de 12 mois, jamais présenté
    if (valide?.valide_le && agsC.length === 0 && moisEntre(new Date(valide.valide_le), aujourdHui) >= 12)
      out.push({ code: "P30", niveau: "haute", ppt_copro_id: c.id, copro: c.nom, libelle: "PPT validé depuis plus de 12 mois et jamais présenté en AG" });

    // P31 : postes de N ou N+1 non présentés, sans AG à venir saisie
    const aPreparer = ps.filter((p) => STATUTS_OUVERTS.includes(p.statut) && (anneeEffective(p) ?? 9999) <= annee + 1 && p.statut !== "presente");
    if (aPreparer.length && !agAVenir)
      out.push({ code: "P31", niveau: "moyenne", ppt_copro_id: c.id, copro: c.nom, libelle: `${aPreparer.length} poste${aPreparer.length > 1 ? "s" : ""} à présenter d'ici ${annee + 1} sans AG programmée` });

    // P32 : rejeté sans nouvelle présentation
    for (const p of ps) if ((p.statut === "rejete" || p.statut === "reporte") && p.annee_prochaine_presentation == null)
      out.push({ code: "P32", niveau: "moyenne", ppt_copro_id: c.id, copro: c.nom, libelle: `« ${p.libelle} » rejeté sans année de nouvelle présentation`, poste_id: p.id });

    // P36 : DPE ou PPPT de plus de 10 ans
    if (c.date_dpe && annee - new Date(c.date_dpe).getFullYear() > 10)
      out.push({ code: "P36", niveau: "basse", ppt_copro_id: c.id, copro: c.nom, libelle: `DPE collectif de ${new Date(c.date_dpe).getFullYear()} : à renouveler` });
    if (valide?.date_document && annee - new Date(valide.date_document).getFullYear() > 10)
      out.push({ code: "P36", niveau: "moyenne", ppt_copro_id: c.id, copro: c.nom, libelle: `PPPT daté de ${new Date(valide.date_document).getFullYear()} : actualisation décennale à engager` });

    // P22 (fiche) : cotisation sous le minimum légal
    const montantPlan = ps.reduce((s, p) => s + (p.cout_ht_base ?? 0), 0);
    if (c.fonds_travaux_cotisation_annuelle != null && montantPlan > 0 && c.fonds_travaux_cotisation_annuelle < montantPlan * 0.025)
      out.push({ code: "P22", niveau: "basse", ppt_copro_id: c.id, copro: c.nom, libelle: "Cotisation au fonds travaux sous le minimum de 2,5 % du plan" });

    // rapports en attente d'analyse
    const enAttente = rapports.filter((r) => r.ppt_copro_id === c.id && ["depose", "en_analyse", "a_relire"].includes(r.statut)).length;
    if (enAttente) out.push({ code: "ATTENTE", niveau: "basse", ppt_copro_id: c.id, copro: c.nom, libelle: `${enAttente} document${enAttente > 1 ? "s" : ""} en cours d'analyse chez Strat Eco` });
  }
  const rang: Record<NiveauAlerte, number> = { haute: 0, moyenne: 1, basse: 2 };
  return out.sort((a, b) => rang[a.niveau] - rang[b.niveau] || a.copro.localeCompare(b.copro, "fr"));
}

/** Incohérences d'articles et d'écarts de montant sur les résolutions saisies (P33 / P34). */
export function controlerResolutions(resolutions: ResolutionLite[], postes: PosteLite[]): { poste_id: string; code: "P33" | "P34"; libelle: string }[] {
  const out: { poste_id: string; code: "P33" | "P34"; libelle: string }[] = [];
  const parId = new Map(postes.map((p) => [p.id, p]));
  for (const r of resolutions) {
    const p = r.poste_id ? parId.get(r.poste_id) : null;
    if (!p) continue;
    if (r.issue === "adopte" && r.article === "24" && p.priorite !== "preservation")
      out.push({ poste_id: p.id, code: "P33", libelle: `« ${p.libelle} » (${p.priorite}) adopté à l'article 24 : l'article 25 est attendu pour un poste d'amélioration ou énergétique.` });
    if (r.issue === "adopte" && r.article === "26" && p.priorite === "preservation")
      out.push({ poste_id: p.id, code: "P33", libelle: `« ${p.libelle} » adopté à l'article 26 : un poste d'entretien relève de l'article 24.` });
    if (r.montant_vote != null && p.cout_ht_base && Math.abs(r.montant_vote - p.cout_ht_base) / p.cout_ht_base > 0.3)
      out.push({ poste_id: p.id, code: "P34", libelle: `« ${p.libelle} » : montant voté ${Math.round(r.montant_vote).toLocaleString("fr-FR")} € contre ${Math.round(p.cout_ht_base).toLocaleString("fr-FR")} € HT estimés (écart supérieur à 30 %).` });
  }
  return out;
}

export interface LigneAPreparer {
  copro: CoproLite;
  prochaineAg: string | null;
  postes: PosteLite[];
  aRepresenter: PosteLite[];
}

/** « Ce que je dois préparer » (vue Gestionnaire) : postes attendus d'ici N+1 et postes rejetés à représenter. */
export function aPreparer(copros: CoproLite[], postes: PosteLite[], ags: AgLite[], aujourdHui: Date = new Date()): LigneAPreparer[] {
  const annee = aujourdHui.getFullYear();
  return copros
    .map((c) => {
      const ps = postes.filter((p) => p.ppt_copro_id === c.id && p.actif);
      const aVenir = ags.filter((a) => a.ppt_copro_id === c.id && new Date(a.date_ag) >= aujourdHui).sort((a, b) => a.date_ag.localeCompare(b.date_ag))[0];
      return {
        copro: c,
        prochaineAg: aVenir?.date_ag ?? null,
        postes: ps.filter((p) => ["programme", "presente"].includes(p.statut) && (anneeEffective(p) ?? 9999) <= annee + 1),
        aRepresenter: ps.filter((p) => (p.statut === "rejete" || p.statut === "reporte") && (p.annee_prochaine_presentation ?? annee + 1) <= annee + 1),
      };
    })
    .filter((l) => l.postes.length || l.aRepresenter.length)
    .sort((a, b) => (a.prochaineAg ?? "9999").localeCompare(b.prochaineAg ?? "9999") || a.copro.nom.localeCompare(b.copro.nom, "fr"));
}

/** Matrice copro × année des montants TTC (échéancier). */
export function echeancier(copros: CoproLite[], postes: PosteLite[], org: ParametresOrg, anneeDebut: number, horizon = 10): { copro: CoproLite; parAnnee: Map<number, number>; total: number }[] {
  const params = parametresDepuisOrg(org, anneeDebut);
  return copros.map((c) => {
    const parAnnee = new Map<number, number>();
    let total = 0;
    for (const p of postes) {
      if (p.ppt_copro_id !== c.id || !p.actif || p.statut === "abandonne" || p.statut === "realise") continue;
      const a = anneeEffective(p);
      const v = p.statut === "vote" && p.montant_vote != null ? p.montant_vote : montantTtcPoste(p, params);
      if (a == null || v == null) continue;
      const cle = Math.min(Math.max(a, anneeDebut), anneeDebut + horizon);
      parAnnee.set(cle, arr((parAnnee.get(cle) ?? 0) + v));
      total += v;
    }
    return { copro: c, parAnnee, total: arr(total) };
  });
}

/** Totaux globaux d'un portefeuille (tuiles). */
export function totauxPortefeuille(copros: CoproLite[], postes: PosteLite[], rapports: RapportLite[], org: ParametresOrg, anneeDebut: number) {
  const params = parametresDepuisOrg(org, anneeDebut);
  const actifs = postes.filter((p) => p.actif && p.statut !== "abandonne");
  let ttc = 0, potentiel = 0, acquis = 0;
  for (const p of actifs) {
    const v = p.statut === "vote" && p.montant_vote != null ? p.montant_vote : montantTtcPoste(p, params);
    ttc += v ?? 0;
    if (p.statut === "vote" || p.statut === "realise") acquis += p.montant_vote != null ? p.montant_vote * (org.taux_honoraires_pct / 100) : (honorairesPoste(p, params, org) ?? 0);
    else if (STATUTS_OUVERTS.includes(p.statut)) potentiel += honorairesPoste(p, params, org) ?? 0;
  }
  const valides = new Set(rapports.filter((r) => r.type === "pppt" && r.statut === "valide").map((r) => r.ppt_copro_id));
  return {
    copros: copros.length,
    validees: copros.filter((c) => valides.has(c.id)).length,
    enAttente: rapports.filter((r) => ["depose", "en_analyse", "a_relire"].includes(r.statut)).length,
    logements: copros.reduce((s, c) => s + (c.nb_logements ?? 0), 0),
    postes: actifs.length,
    montantTtc: arr(ttc),
    honorairesPotentiels: arr(potentiel),
    honorairesAcquis: arr(acquis),
  };
}
