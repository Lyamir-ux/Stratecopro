// Contrat d'import du JSON pppt-verif : versions 1.1 et 1.2 acceptées, toute
// autre refusée ; validation stricte (refus explicite avec la liste des écarts,
// jamais de réparation silencieuse), migration vers la forme 1.2 que manipule
// la plateforme (valeurs par défaut des ajouts de la 1.2, clés de période
// normalisées) et journal des corrections (diff entre deux états du JSON de
// travail).

import type { Controle, ParametresPpt, PpptVerifJson, Proposition, Revision, TravailNormalise, TravailSource } from "./schema";
import { ANNEE_ORIGINES, COUT_ORIGINES, SCHEMAS_ACCEPTES, STATUTS_VALIDATION, cleControle, estRetenu } from "./schema";
import { arrondi, totauxTtcJson } from "./formules";

export interface ResultatValidation {
  ok: boolean;
  json: PpptVerifJson | null;
  erreurs: string[];
  avertissements: string[];
}

const PRIORITES = ["préservation", "energetique", "énergétique", "amélioration", "amelioration", "preservation"];
const STATUTS = ["CONFORME", "NON_CONFORME", "PARTIEL", "NON_VERIFIABLE", "SANS_OBJET"];
const SEVERITES = ["BLOQUANT", "MAJEUR", "MINEUR", "INFO"];

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const estNombreOuNull = (v: unknown) => v == null || (typeof v === "number" && Number.isFinite(v));
const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";

/** Message de refus d'une version non prise en charge (test d'acceptation 3). */
export function messageVersion(version: unknown): string {
  const lue = typeof version === "string" && version ? version : "absente";
  return `Version de schéma non prise en charge : ${lue} (versions acceptées : ${SCHEMAS_ACCEPTES.map((v) => v.replace("pppt-verif/", "")).join(", ")})`;
}

/**
 * Libellé canonique d'une période de l'échéancier source : « 0-1 an » et
 * « 0 à 1 an » désignent la même période (le 1.1 mélangeait les deux écritures
 * entre `totaux_par_annee_annonces` et `periode_source`). Un millésime ou un
 * libellé libre est rendu tel quel.
 */
export function normaliserPeriode(p: string | null | undefined): string {
  const s = (p ?? "").trim();
  const m = /^(\d+)\s*(?:-|–|à|a)\s*(\d+)\s*(ans?)$/i.exec(s);
  return m ? `${m[1]} à ${m[2]} ${m[3].toLowerCase()}` : s;
}

/** Valide la structure d'un JSON téléversé (règle P01) et le migre en 1.2. */
export function validerJson(brut: unknown): ResultatValidation {
  const erreurs: string[] = [];
  const avertissements: string[] = [];
  if (!estObjet(brut)) return { ok: false, json: null, erreurs: ["Le fichier n'est pas un objet JSON."], avertissements };

  const version = brut.schema_version;
  if (typeof version !== "string" || !SCHEMAS_ACCEPTES.includes(version)) return { ok: false, json: null, erreurs: [messageVersion(version)], avertissements };

  for (const cle of ["document_source", "copropriete", "synthese", "parametres_ppt"]) if (!estObjet(brut[cle])) erreurs.push(`Bloc « ${cle} » absent ou invalide.`);
  for (const cle of ["travaux_source", "travaux_normalises", "controles"]) if (!Array.isArray(brut[cle])) erreurs.push(`Tableau « ${cle} » absent.`);
  if (brut.revision != null && !estObjet(brut.revision)) erreurs.push("Bloc « revision » invalide.");

  const sources = Array.isArray(brut.travaux_source) ? (brut.travaux_source as unknown[]) : [];
  const normalises = Array.isArray(brut.travaux_normalises) ? (brut.travaux_normalises as unknown[]) : [];
  const controles = Array.isArray(brut.controles) ? (brut.controles as unknown[]) : [];

  const idsSource = new Set<string>();
  const exclus = new Set<string>();
  sources.forEach((s, i) => {
    if (!estObjet(s) || typeof s.id !== "string") return erreurs.push(`travaux_source[${i}] sans identifiant.`);
    if (idsSource.has(s.id)) erreurs.push(`travaux_source : identifiant « ${s.id} » en double.`);
    idsSource.add(s.id);
    if (!estNombreOuNull(s.cout_source_eur)) erreurs.push(`travaux_source ${s.id} : coût non numérique.`);
    if (s.retenu_dans_ppt != null && typeof s.retenu_dans_ppt !== "boolean") erreurs.push(`travaux_source ${s.id} : retenu_dans_ppt doit être true ou false.`);
    if (s.retenu_dans_ppt === false) exclus.add(s.id);
  });

  // un poste normalisé descend d'un poste source de même identifiant, ou de
  // plusieurs micro-postes regroupés (1.2 : regroupe_ids, nouvel identifiant)
  const idsNorm = new Set<string>();
  const traces = new Map<string, string[]>(); // id source -> lignes qui le reprennent
  const tracer = (idSource: string, ligne: string) => traces.set(idSource, [...(traces.get(idSource) ?? []), ligne]);
  normalises.forEach((t, i) => {
    if (!estObjet(t) || typeof t.id !== "string") return erreurs.push(`travaux_normalises[${i}] sans identifiant.`);
    if (idsNorm.has(t.id)) erreurs.push(`travaux_normalises : identifiant « ${t.id} » en double.`);
    idsNorm.add(t.id);
    if (t.regroupe_ids != null && !Array.isArray(t.regroupe_ids)) erreurs.push(`travaux_normalises ${t.id} : regroupe_ids doit être un tableau.`);
    const regroupe = Array.isArray(t.regroupe_ids) ? (t.regroupe_ids as unknown[]) : [];
    if (regroupe.length) {
      const inconnus = regroupe.filter((r) => typeof r !== "string" || !idsSource.has(r));
      if (inconnus.length) erreurs.push(`travaux_normalises ${t.id} : poste${inconnus.length > 1 ? "s" : ""} regroupé${inconnus.length > 1 ? "s" : ""} ${inconnus.map(String).join(", ")} absent${inconnus.length > 1 ? "s" : ""} de travaux_source.`);
      regroupe.forEach((r) => typeof r === "string" && tracer(r, t.id as string));
    } else if (!idsSource.has(t.id)) erreurs.push(`travaux_normalises ${t.id} : aucun travail source de cet identifiant.`);
    else tracer(t.id, t.id);
    if (typeof t.libelle !== "string" || !t.libelle) erreurs.push(`travaux_normalises ${t.id} : libellé absent.`);
    if (typeof t.priorite !== "string" || !PRIORITES.includes(t.priorite.toLowerCase())) erreurs.push(`travaux_normalises ${t.id} : priorité « ${String(t.priorite)} » inconnue.`);
    for (const k of ["cout_ht_base_eur", "cout_ht_source_eur", "gain_energetique_pct"]) if (!estNombreOuNull(t[k])) erreurs.push(`travaux_normalises ${t.id} : ${k} non numérique.`);
    if (t.reevaluation_prix_coef != null && (typeof t.reevaluation_prix_coef !== "number" || t.reevaluation_prix_coef <= 0)) erreurs.push(`travaux_normalises ${t.id} : reevaluation_prix_coef « ${String(t.reevaluation_prix_coef)} » invalide.`);
    if (typeof t.tva_pct !== "number") erreurs.push(`travaux_normalises ${t.id} : TVA absente.`);
    if (t.annee_prevue != null && (typeof t.annee_prevue !== "number" || t.annee_prevue < 2000 || t.annee_prevue > 2100)) erreurs.push(`travaux_normalises ${t.id} : année prévue « ${String(t.annee_prevue)} » invalide.`);
    if (t.cout_ht_origine != null && !COUT_ORIGINES.includes(t.cout_ht_origine as never)) erreurs.push(`travaux_normalises ${t.id} : cout_ht_origine « ${String(t.cout_ht_origine)} » inconnue.`);
    if (t.annee_origine != null && !ANNEE_ORIGINES.includes(t.annee_origine as never)) erreurs.push(`travaux_normalises ${t.id} : annee_origine « ${String(t.annee_origine)} » inconnue.`);
  });
  if (sources.length && !normalises.length) avertissements.push("Aucun travail normalisé : le plan sera vide après validation.");

  // relation source → normalisé : même id, présent dans regroupe_ids, ou exclu
  const doubles = [...traces].filter(([, lignes]) => lignes.length > 1).map(([id, lignes]) => `${id} (${lignes.join(", ")})`);
  if (doubles.length) avertissements.push(`Poste${doubles.length > 1 ? "s" : ""} source repris plusieurs fois : ${doubles.join(", ")}.`);
  const exclusRepris = [...exclus].filter((id) => traces.has(id));
  if (exclusRepris.length) avertissements.push(`Poste${exclusRepris.length > 1 ? "s" : ""} exclu${exclusRepris.length > 1 ? "s" : ""} du PPT (retenu_dans_ppt: false) mais repris dans le tableau : ${exclusRepris.join(", ")}.`);
  const nonTraces = [...idsSource].filter((id) => !exclus.has(id) && !traces.has(id));
  if (normalises.length && nonTraces.length) avertissements.push(`Poste${nonTraces.length > 1 ? "s" : ""} source retenu${nonTraces.length > 1 ? "s" : ""} sans ligne dans le PPT (ni même identifiant, ni regroupé, ni exclu) : ${nonTraces.join(", ")}.`);

  controles.forEach((c, i) => {
    if (!estObjet(c) || typeof c.code !== "string") return erreurs.push(`controles[${i}] sans code.`);
    if (typeof c.statut !== "string" || !STATUTS.includes(c.statut)) erreurs.push(`contrôle ${c.code} : statut « ${String(c.statut)} » inconnu.`);
    if (typeof c.severite !== "string" || !SEVERITES.includes(c.severite)) erreurs.push(`contrôle ${c.code} : sévérité « ${String(c.severite)} » inconnue.`);
  });

  if (estObjet(brut.parametres_ppt)) {
    const p = brut.parametres_ppt;
    if (typeof p.annee_base !== "number") erreurs.push("parametres_ppt.annee_base absent.");
    for (const k of ["inflation_pct", "tva_facades_toitures_pct", "tva_energetique_pct", "honoraires_moe_pct", "honoraires_syndic_pct", "reevaluation_prix_coef", "annee_prix_source"])
      if (!estNombreOuNull(p[k])) erreurs.push(`parametres_ppt.${k} non numérique.`);
    if (p.moe_sur_energetique != null && typeof p.moe_sur_energetique !== "boolean") erreurs.push("parametres_ppt.moe_sur_energetique doit être true ou false.");
  }
  if (estObjet(brut.synthese)) {
    if (typeof brut.synthese.verdict !== "string") erreurs.push("synthese.verdict absent.");
    const g = brut.synthese.statut_validation_global;
    if (g != null && g !== "A_VALIDER" && g !== "VALIDE") erreurs.push(`synthese.statut_validation_global « ${String(g)} » inconnu (A_VALIDER ou VALIDE).`);
  }

  // propositions : une décision = un code unique ; les statuts de validation
  // sont ceux du skill (une valeur absente naît « à valider »)
  if (brut.propositions !== undefined && !Array.isArray(brut.propositions)) erreurs.push("Tableau « propositions » invalide.");
  else if (brut.propositions === undefined) avertissements.push("Aucun bloc « propositions » : les décisions du skill ne seront pas soumises à validation.");
  const propositions = Array.isArray(brut.propositions) ? (brut.propositions as unknown[]) : [];
  const codesProp = new Set<string>();
  const idsConnus = new Set([...idsSource, ...idsNorm]);
  propositions.forEach((p, i) => {
    if (!estObjet(p) || typeof p.code !== "string" || !p.code) return erreurs.push(`propositions[${i}] sans code.`);
    if (codesProp.has(p.code)) erreurs.push(`propositions : code « ${p.code} » en double.`);
    codesProp.add(p.code);
    if (typeof p.decision !== "string" || !p.decision) erreurs.push(`proposition ${p.code} : décision absente.`);
    if (p.statut_validation != null && (typeof p.statut_validation !== "string" || !STATUTS_VALIDATION.includes(p.statut_validation as never))) erreurs.push(`proposition ${p.code} : statut de validation « ${String(p.statut_validation)} » inconnu.`);
    if (p.lignes_concernees != null && !Array.isArray(p.lignes_concernees)) erreurs.push(`proposition ${p.code} : lignes_concernees doit être un tableau.`);
    const inconnues = (Array.isArray(p.lignes_concernees) ? p.lignes_concernees : []).filter((l) => typeof l !== "string" || !idsConnus.has(l));
    if (inconnues.length) avertissements.push(`Proposition ${p.code} : ligne${inconnues.length > 1 ? "s" : ""} ${inconnues.map(String).join(", ")} inconnue${inconnues.length > 1 ? "s" : ""} des travaux.`);
  });

  if (brut.remarques_plateforme !== undefined) avertissements.push("Bloc « remarques_plateforme » ignoré : c'est une sortie de la plateforme, les remarques sont recalculées.");

  if (erreurs.length) return { ok: false, json: null, erreurs, avertissements };

  const { remarques_plateforme: _ignorees, ...sansRemarques } = brut;
  const json = migrerJson(sansRemarques as unknown as PpptVerifJson);

  if (json.synthese.statut_validation_global === "VALIDE" && json.propositions.some((p) => p.statut_validation === "A_VALIDER"))
    avertissements.push("Statut global « VALIDE » alors que des propositions restent à valider : elles devront être tranchées sur la revue.");

  // cohérence du TTC recalculé avec celui du skill (section 5) : avertissement, jamais bloquant
  const rev = json.revision;
  if (rev && (rev.total_ttc_estime_eur != null || rev.totaux_ttc_estimes_eur)) {
    const { total, parAnnee } = totauxTtcJson(json);
    if (rev.total_ttc_estime_eur != null && Math.abs(total - rev.total_ttc_estime_eur) > 1)
      avertissements.push(`TTC recalculé ${fmt(total)} ≠ total TTC du skill ${fmt(rev.total_ttc_estime_eur)} (écart ${fmt(total - rev.total_ttc_estime_eur)}) : vérifier les hypothèses (inflation, honoraires, avec_moe).`);
    const ecarts = Object.entries(rev.totaux_ttc_estimes_eur ?? {}).filter(([a, v]) => Math.abs((parAnnee[a] ?? 0) - v) > 1);
    if (ecarts.length) avertissements.push(`TTC par année différent du skill : ${ecarts.map(([a, v]) => `${a} ${fmt(parAnnee[a] ?? 0)} au lieu de ${fmt(v)}`).join(", ")}.`);
  }

  return { ok: true, json, erreurs, avertissements };
}

/** Anciennes clés en fraction des analyses 1.0 → clés en points de pourcentage. */
const CLES_FRACTION: [string, keyof ParametresPpt][] = [
  ["inflation", "inflation_pct"],
  ["tva_facades_toitures", "tva_facades_toitures_pct"],
  ["tva_energetique", "tva_energetique_pct"],
  ["honoraires_moe", "honoraires_moe_pct"],
  ["honoraires_syndic", "honoraires_syndic_pct"],
];

/**
 * Migre un JSON validé vers la forme 1.2 que manipule la plateforme sans en
 * changer la version déclarée : valeurs par défaut des champs ajoutés en 1.2
 * (section 2 de la requête), clés de période normalisées, champ retiré
 * `plan_retenu_pour_normalisation` ignoré, proposition sans statut « à
 * valider ». Les paramètres en fraction des analyses 1.0 passent en points
 * d'après leur clé (`inflation` est une fraction par définition du schéma 1.0),
 * jamais d'après leur valeur. Idempotent : appliqué aussi au JSON de travail
 * relu en base.
 */
export function migrerJson(j: PpptVerifJson): PpptVerifJson {
  const brutParams = { ...((j.parametres_ppt ?? {}) as unknown as Record<string, unknown>) };
  for (const [ancienne, nouvelle] of CLES_FRACTION) {
    if (typeof brutParams[nouvelle] !== "number" && typeof brutParams[ancienne] === "number") brutParams[nouvelle] = arrondi((brutParams[ancienne] as number) * 100, 6);
    delete brutParams[ancienne];
  }
  const parametres_ppt = {
    ...brutParams,
    annee_prix_source: (brutParams.annee_prix_source as number | null | undefined) ?? null,
    reevaluation_prix_coef: (brutParams.reevaluation_prix_coef as number | undefined) ?? 1,
    moe_sur_energetique: (brutParams.moe_sur_energetique as boolean | undefined) ?? false,
  } as ParametresPpt;

  const { plan_retenu_pour_normalisation: _retire, ...echeancier } = (j.echeancier_source ?? {}) as PpptVerifJson["echeancier_source"] & { plan_retenu_pour_normalisation?: unknown };
  const totaux: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(echeancier.totaux_par_annee_annonces ?? {})) totaux[normaliserPeriode(k)] = v;
  const echeancier_source = { ...echeancier, totaux_par_annee_annonces: totaux, scenario_reference: echeancier.scenario_reference ?? null, note_scenario: echeancier.note_scenario ?? null };

  const travaux_source: TravailSource[] = (j.travaux_source ?? []).map((s) => ({ ...s, retenu_dans_ppt: estRetenu(s), motif_exclusion: s.motif_exclusion ?? null }));
  const travaux_normalises: TravailNormalise[] = (j.travaux_normalises ?? []).map((t) => ({
    ...t,
    cout_ht_source_eur: t.cout_ht_source_eur !== undefined ? t.cout_ht_source_eur : t.cout_ht_base_eur,
    reevaluation_prix_coef: t.reevaluation_prix_coef ?? 1,
    regroupe_ids: Array.isArray(t.regroupe_ids) && t.regroupe_ids.length ? t.regroupe_ids.map(String) : null,
  }));

  const propositions: Proposition[] = (Array.isArray(j.propositions) ? j.propositions : []).map((p) => ({
    ...p,
    code: p.code,
    theme: p.theme ?? "",
    decision: p.decision,
    valeur_source: p.valeur_source ?? null,
    valeur_proposee: p.valeur_proposee ?? "",
    impact: p.impact ?? "",
    alternative: p.alternative ?? null,
    appliquee_dans_ppt: p.appliquee_dans_ppt !== false,
    lignes_concernees: Array.isArray(p.lignes_concernees) ? p.lignes_concernees.map(String) : [],
    controle_lie: p.controle_lie ?? null,
    statut_validation: STATUTS_VALIDATION.includes(p.statut_validation) ? p.statut_validation : "A_VALIDER",
    commentaire_validateur: p.commentaire_validateur ?? null,
    note_application: p.note_application ?? null,
    date_validation: p.date_validation ?? null,
  }));

  const synthese = { ...j.synthese, statut_validation_global: j.synthese?.statut_validation_global ?? "A_VALIDER" };

  const r = j.revision;
  const revision: Revision | null = r
    ? {
        ...r,
        numero: r.numero ?? 1,
        date: r.date ?? j.genere_le,
        base: r.base ?? null,
        propositions_appliquees: Array.isArray(r.propositions_appliquees) ? r.propositions_appliquees : [],
        changements: Array.isArray(r.changements) ? r.changements : [],
        totaux_ttc_estimes_eur: r.totaux_ttc_estimes_eur ?? null,
        total_ttc_estime_eur: r.total_ttc_estime_eur ?? null,
        total_ht_base_eur: r.total_ht_base_eur ?? null,
        total_ht_source_retenu_eur: r.total_ht_source_retenu_eur ?? null,
      }
    : null;

  return { ...j, revision, synthese, echeancier_source, travaux_source, travaux_normalises, parametres_ppt, propositions };
}

export interface CorrectionJson {
  chemin_json: string;
  poste_code: string | null;
  valeur_avant: unknown;
  valeur_apres: unknown;
  motif: string | null;
}

const CHAMPS_POSTE: (keyof TravailNormalise)[] = ["libelle", "priorite", "critere", "batiment", "ouvrage", "cout_ht_base_eur", "cout_ht_origine", "cout_ht_source_eur", "reevaluation_prix_coef", "regroupe_ids", "tva_pct", "avec_moe", "annee_prevue", "annee_origine", "gain_energetique_pct", "commentaire"];
const CHAMPS_COPRO = ["nom", "adresse", "code_postal", "commune", "annee_construction", "nb_batiments", "nb_lots_total", "nb_logements", "surface_m2", "surface_type", "chauffage", "energie_chauffage"] as const;
const CHAMPS_PARAMS = ["annee_base", "inflation_pct", "tva_facades_toitures_pct", "tva_energetique_pct", "honoraires_moe_pct", "honoraires_syndic_pct", "cep_base_kwhep_m2_an", "annee_prix_source", "reevaluation_prix_coef", "moe_sur_energetique"] as const;

const egal = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Corrections manuelles entre deux états du JSON de travail : postes (par id),
 * fiche copropriété, paramètres, statut / visibilité des contrôles et décision
 * prise sur chaque proposition du skill. C'est la matière première des futures
 * règles (objectif de convergence du brief) et du journal de révision exporté.
 */
export function diffJson(avant: PpptVerifJson, apres: PpptVerifJson, motif: string | null = null): CorrectionJson[] {
  const out: CorrectionJson[] = [];
  const push = (chemin: string, poste: string | null, a: unknown, b: unknown) => {
    if (!egal(a, b)) out.push({ chemin_json: chemin, poste_code: poste, valeur_avant: a ?? null, valeur_apres: b ?? null, motif });
  };

  const avantParId = new Map(avant.travaux_normalises.map((t) => [t.id, t]));
  const apresParId = new Map(apres.travaux_normalises.map((t) => [t.id, t]));
  for (const [id, t] of apresParId) {
    const a = avantParId.get(id);
    if (!a) {
      out.push({ chemin_json: `travaux_normalises[${id}]`, poste_code: id, valeur_avant: null, valeur_apres: t, motif });
      continue;
    }
    for (const k of CHAMPS_POSTE) push(`travaux_normalises[${id}].${k}`, id, a[k], t[k]);
  }
  for (const [id, a] of avantParId) if (!apresParId.has(id)) out.push({ chemin_json: `travaux_normalises[${id}]`, poste_code: id, valeur_avant: a, valeur_apres: null, motif });

  for (const k of CHAMPS_COPRO) push(`copropriete.${k}`, null, avant.copropriete?.[k], apres.copropriete?.[k]);
  for (const k of CHAMPS_PARAMS) push(`parametres_ppt.${k}`, null, avant.parametres_ppt?.[k], apres.parametres_ppt?.[k]);

  const ctlAvant = new Map((avant.controles ?? []).map((c) => [c.code, c]));
  for (const c of apres.controles ?? []) {
    const a = ctlAvant.get(c.code);
    if (!a) continue;
    push(`controles[${c.code}].statut`, c.poste_code ?? null, a.statut, c.statut);
    push(`controles[${c.code}].severite`, c.poste_code ?? null, a.severite, c.severite);
    push(`controles[${c.code}].visible_syndic`, c.poste_code ?? null, a.visible_syndic ?? true, c.visible_syndic ?? true);
  }
  const propAvant = new Map((avant.propositions ?? []).map((p) => [p.code, p]));
  for (const p of apres.propositions ?? []) {
    const a = propAvant.get(p.code);
    if (!a) continue;
    push(`propositions[${p.code}].statut_validation`, null, a.statut_validation, p.statut_validation);
    push(`propositions[${p.code}].commentaire_validateur`, null, a.commentaire_validateur, p.commentaire_validateur);
  }
  const remAvant = new Map((avant.remarques_plateforme ?? []).map((c) => [cleRemarque(c), c]));
  for (const c of apres.remarques_plateforme ?? []) {
    const a = remAvant.get(cleRemarque(c));
    if (!a) continue;
    push(`remarques_plateforme[${cleRemarque(c)}].visible_syndic`, c.poste_code ?? null, a.visible_syndic ?? true, c.visible_syndic ?? true);
  }
  return out;
}

/** Une remarque plateforme n'a pas d'identifiant unique : code + poste + libellé. */
export function cleRemarque(c: Controle): string {
  return cleControle(c);
}

/** Copie profonde d'un JSON de travail (édition immuable côté revue). */
export function cloner<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
