// Contrat d'import du JSON pppt-verif/1.x : validation stricte (refus explicite
// avec la liste des écarts, jamais de réparation silencieuse), migration d'une
// version antérieure connue (1.0 → 1.1 : propositions vides) et journal des
// corrections (diff entre deux états du JSON de travail).

import type { Controle, PpptVerifJson, Proposition, TravailNormalise } from "./schema";
import { SCHEMAS_CONNUS, SCHEMA_VERSION, STATUTS_VALIDATION, cleControle } from "./schema";

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

/** Valide la structure d'un JSON téléversé (règle P01). */
export function validerJson(brut: unknown): ResultatValidation {
  const erreurs: string[] = [];
  const avertissements: string[] = [];
  if (!estObjet(brut)) return { ok: false, json: null, erreurs: ["Le fichier n'est pas un objet JSON."], avertissements };

  const version = brut.schema_version;
  if (typeof version !== "string" || !version.startsWith("pppt-verif/1.")) erreurs.push(`schema_version « ${String(version ?? "absent")} » : pppt-verif/1.x attendu.`);
  else if (version === "pppt-verif/1.0") avertissements.push("JSON pppt-verif/1.0 (skill antérieur) : aucune proposition à valider, les décisions du skill n'ont pas été tracées.");
  else if (!SCHEMAS_CONNUS.includes(version)) avertissements.push(`Version ${version} : la plateforme connaît la ${SCHEMA_VERSION.replace("pppt-verif/", "")}, les champs inconnus sont ignorés.`);

  for (const cle of ["document_source", "copropriete", "synthese", "parametres_ppt"]) if (!estObjet(brut[cle])) erreurs.push(`Bloc « ${cle} » absent ou invalide.`);
  for (const cle of ["travaux_source", "travaux_normalises", "controles"]) if (!Array.isArray(brut[cle])) erreurs.push(`Tableau « ${cle} » absent.`);

  const sources = Array.isArray(brut.travaux_source) ? (brut.travaux_source as unknown[]) : [];
  const normalises = Array.isArray(brut.travaux_normalises) ? (brut.travaux_normalises as unknown[]) : [];
  const controles = Array.isArray(brut.controles) ? (brut.controles as unknown[]) : [];

  const idsSource = new Set<string>();
  sources.forEach((s, i) => {
    if (!estObjet(s) || typeof s.id !== "string") return erreurs.push(`travaux_source[${i}] sans identifiant.`);
    if (idsSource.has(s.id)) erreurs.push(`travaux_source : identifiant « ${s.id} » en double.`);
    idsSource.add(s.id);
    if (s.cout_source_eur != null && typeof s.cout_source_eur !== "number") erreurs.push(`travaux_source ${s.id} : coût non numérique.`);
  });

  const idsNorm = new Set<string>();
  normalises.forEach((t, i) => {
    if (!estObjet(t) || typeof t.id !== "string") return erreurs.push(`travaux_normalises[${i}] sans identifiant.`);
    if (idsNorm.has(t.id)) erreurs.push(`travaux_normalises : identifiant « ${t.id} » en double.`);
    idsNorm.add(t.id);
    if (!idsSource.has(t.id)) erreurs.push(`travaux_normalises ${t.id} : aucun travail source de cet identifiant.`);
    if (typeof t.libelle !== "string" || !t.libelle) erreurs.push(`travaux_normalises ${t.id} : libellé absent.`);
    if (typeof t.priorite !== "string" || !PRIORITES.includes(t.priorite.toLowerCase())) erreurs.push(`travaux_normalises ${t.id} : priorité « ${String(t.priorite)} » inconnue.`);
    if (t.cout_ht_base_eur != null && typeof t.cout_ht_base_eur !== "number") erreurs.push(`travaux_normalises ${t.id} : coût HT non numérique.`);
    if (typeof t.tva_pct !== "number") erreurs.push(`travaux_normalises ${t.id} : TVA absente.`);
    if (t.annee_prevue != null && (typeof t.annee_prevue !== "number" || t.annee_prevue < 2000 || t.annee_prevue > 2100)) erreurs.push(`travaux_normalises ${t.id} : année prévue « ${String(t.annee_prevue)} » invalide.`);
  });
  if (sources.length && !normalises.length) avertissements.push("Aucun travail normalisé : le plan sera vide après validation.");

  controles.forEach((c, i) => {
    if (!estObjet(c) || typeof c.code !== "string") return erreurs.push(`controles[${i}] sans code.`);
    if (typeof c.statut !== "string" || !STATUTS.includes(c.statut)) erreurs.push(`contrôle ${c.code} : statut « ${String(c.statut)} » inconnu.`);
    if (typeof c.severite !== "string" || !SEVERITES.includes(c.severite)) erreurs.push(`contrôle ${c.code} : sévérité « ${String(c.severite)} » inconnue.`);
  });

  if (estObjet(brut.parametres_ppt)) {
    const p = brut.parametres_ppt;
    if (typeof p.annee_base !== "number") erreurs.push("parametres_ppt.annee_base absent.");
    for (const k of ["inflation", "tva_facades_toitures", "tva_energetique", "honoraires_moe", "honoraires_syndic"])
      if (typeof p[k] === "number" && (p[k] as number) > 1) avertissements.push(`parametres_ppt.${k} = ${String(p[k])} : une fraction (0,035) est attendue, pas un pourcentage.`);
  }
  if (estObjet(brut.synthese) && typeof brut.synthese.verdict !== "string") erreurs.push("synthese.verdict absent.");

  // propositions (1.1) : une décision = un code unique ; les statuts de validation
  // sont ceux du skill (une valeur absente naît « à valider »)
  if (brut.propositions !== undefined && !Array.isArray(brut.propositions)) erreurs.push("Tableau « propositions » invalide.");
  else if (brut.propositions === undefined && typeof version === "string" && version !== "pppt-verif/1.0") avertissements.push("Aucun bloc « propositions » : les décisions du skill ne seront pas soumises à validation.");
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

  return { ok: erreurs.length === 0, json: erreurs.length === 0 ? migrerJson(brut as unknown as PpptVerifJson) : null, erreurs, avertissements };
}

/**
 * Migre un JSON validé vers la forme que la plateforme manipule (1.1) sans en
 * changer la version déclarée : un 1.0 reçoit un bloc de propositions vide, une
 * proposition sans statut naît « à valider ». Idempotent : appliqué aussi au
 * JSON de travail relu en base (analyses importées avant la 1.1).
 */
export function migrerJson(j: PpptVerifJson): PpptVerifJson {
  const propositions: Proposition[] = (Array.isArray(j.propositions) ? j.propositions : []).map((p) => ({
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
  }));
  return { ...j, propositions };
}

export interface CorrectionJson {
  chemin_json: string;
  poste_code: string | null;
  valeur_avant: unknown;
  valeur_apres: unknown;
  motif: string | null;
}

const CHAMPS_POSTE: (keyof TravailNormalise)[] = ["libelle", "priorite", "critere", "batiment", "ouvrage", "cout_ht_base_eur", "cout_ht_origine", "tva_pct", "avec_moe", "annee_prevue", "annee_origine", "gain_energetique_pct", "commentaire"];
const CHAMPS_COPRO = ["nom", "adresse", "code_postal", "commune", "annee_construction", "nb_batiments", "nb_lots_total", "nb_logements", "surface_m2", "surface_type", "chauffage", "energie_chauffage"] as const;
const CHAMPS_PARAMS = ["annee_base", "inflation", "tva_facades_toitures", "tva_energetique", "honoraires_moe", "honoraires_syndic", "cep_base_kwhep_m2_an"] as const;

const egal = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Corrections manuelles entre deux états du JSON de travail : postes (par id),
 * fiche copropriété, paramètres, statut / visibilité des contrôles et décision
 * prise sur chaque proposition du skill. C'est la matière première des futures
 * règles (objectif de convergence du brief).
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
