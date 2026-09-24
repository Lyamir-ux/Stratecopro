// Export du JSON de travail vers le skill pppt-verif, toujours en 1.2 (section 6
// de la requête du 24/09/2026). Les remarques de la plateforme n'y figurent
// jamais : elles partent dans un fichier séparé (exporterRemarques).
//
// Révision : tant que le JSON de travail ne diffère pas du JSON importé
// (ppt_analyses.json_verif), la révision du fichier est conservée telle quelle,
// numéro compris - un aller-retour import → export → import rend les mêmes
// données. Dès qu'une décision ou une correction est prise sur la plateforme,
// la révision exportée est celle de l'import + 1, datée du jour, avec les
// changements tirés du journal des corrections et des totaux recalculés.
// Fonctions pures, testées (export.test.ts, pppt12.test.ts).

import type { Controle, PpptVerifJson, Revision } from "./schema";
import { CONVENTIONS_1_2, SCHEMA_VERSION, coutHtSource } from "./schema";
import { cloner, diffJson, migrerJson, type CorrectionJson } from "./import";
import { arrondi, totauxTtcJson } from "./formules";
import { STATUT_VALIDATION_LABEL, codesRetenus, dateIso, statutGlobal } from "./propositions";

const court = (v: unknown) => {
  if (v == null) return "vide";
  if (typeof v === "string") return v.length > 60 ? `${v.slice(0, 57)}…` : v;
  return JSON.stringify(v);
};

/** Une correction du journal en une ligne lisible pour `revision.changements`. */
export function libelleChangement(c: CorrectionJson, apres: PpptVerifJson): string {
  const prop = /^propositions\[(.+)\]\.(statut_validation|commentaire_validateur)$/.exec(c.chemin_json);
  if (prop) {
    if (prop[2] === "commentaire_validateur") return `${prop[1]} : commentaire du validateur « ${court(c.valeur_apres)} »`;
    const p = apres.propositions.find((x) => x.code === prop[1]);
    const statut = STATUT_VALIDATION_LABEL[c.valeur_apres as keyof typeof STATUT_VALIDATION_LABEL] ?? String(c.valeur_apres);
    return `${prop[1]} ${statut.toLowerCase()} sur la plateforme${p?.date_validation ? ` le ${p.date_validation}` : ""}`;
  }
  const poste = /^travaux_normalises\[(.+?)\](?:\.(.+))?$/.exec(c.chemin_json);
  if (poste && !poste[2]) return c.valeur_avant == null ? `${poste[1]} ajouté sur la plateforme` : `${poste[1]} retiré sur la plateforme`;
  if (poste) return `${poste[1]} : ${poste[2]} ${court(c.valeur_avant)} → ${court(c.valeur_apres)}`;
  return `${c.chemin_json} : ${court(c.valeur_avant)} → ${court(c.valeur_apres)}`;
}

/** Totaux de la révision recalculés depuis les lignes (arrondis à l'euro pour le TTC, comme le skill). */
export function totauxRevision(json: PpptVerifJson): Pick<Revision, "totaux_ttc_estimes_eur" | "total_ttc_estime_eur" | "total_ht_base_eur" | "total_ht_source_retenu_eur"> {
  const { total, parAnnee } = totauxTtcJson(json);
  const totaux: Record<string, number> = {};
  for (const [a, v] of Object.entries(parAnnee)) totaux[a] = Math.round(v);
  return {
    totaux_ttc_estimes_eur: totaux,
    total_ttc_estime_eur: Math.round(total),
    total_ht_base_eur: arrondi(json.travaux_normalises.reduce((s, t) => s + (t.cout_ht_base_eur ?? 0), 0)),
    total_ht_source_retenu_eur: arrondi(json.travaux_normalises.reduce((s, t) => s + (coutHtSource(t) ?? 0), 0)),
  };
}

/** Corrections qui comptent pour la révision : pas la visibilité syndic des remarques (hors JSON du skill). */
function changementsDepuis(importe: PpptVerifJson, travail: PpptVerifJson): CorrectionJson[] {
  const sans = (j: PpptVerifJson) => ({ ...j, remarques_plateforme: [] });
  return diffJson(sans(importe), sans(travail));
}

/**
 * Révision courante du JSON de travail. Sans changement depuis l'import : celle
 * du fichier (ou une révision 1 aux totaux recalculés pour un 1.1 qui n'en a
 * pas). Avec changements : numéro importé + 1, changements lisibles, totaux
 * recalculés ; la date est conservée d'un enregistrement à l'autre tant que le
 * journal ne bouge pas.
 */
export function revisionCourante(travail: PpptVerifJson, importe: PpptVerifJson | null, aujourdHui: Date = new Date()): Revision {
  const t = migrerJson(travail);
  const i = importe ? migrerJson(importe) : null;
  const corrections = i ? changementsDepuis(i, t) : [];
  const revImportee = i?.revision ?? null;
  if (i && !corrections.length) {
    if (revImportee) return revImportee;
    return { numero: 1, date: i.genere_le, base: null, propositions_appliquees: codesRetenus(i), changements: [], ...totauxRevision(i) };
  }
  const numero = (revImportee?.numero ?? 1) + 1;
  const changements = corrections.map((c) => libelleChangement(c, t));
  const dejaEnregistree = t.revision && t.revision.numero === numero && JSON.stringify(t.revision.changements) === JSON.stringify(changements);
  return {
    numero,
    date: dejaEnregistree && t.revision ? t.revision.date : dateIso(aujourdHui),
    base: i ? `révision ${revImportee?.numero ?? 1} du skill pppt-verif (${i.genere_le}), importée sur Strat Eco Pro` : null,
    propositions_appliquees: codesRetenus(t),
    changements,
    ...totauxRevision(t),
  };
}

/**
 * JSON pppt-verif/1.2 à renvoyer au skill : forme migrée, conventions 1.2,
 * révision courante, statut global et compteur de propositions recalculés,
 * sans `remarques_plateforme`.
 */
export function exporterJson(travail: PpptVerifJson, importe: PpptVerifJson | null, aujourdHui: Date = new Date()): PpptVerifJson {
  const { remarques_plateforme: _horsSchema, ...j } = migrerJson(cloner(travail));
  return {
    ...j,
    schema_version: SCHEMA_VERSION,
    conventions: { ...(j.conventions ?? {}), ...CONVENTIONS_1_2 },
    revision: revisionCourante(j, importe, aujourdHui),
    synthese: { ...j.synthese, nb_propositions: j.propositions.length, statut_validation_global: statutGlobal(j) },
  };
}

/** Fichier séparé des remarques de la plateforme (jamais dans le JSON du skill). */
export interface ExportRemarques {
  format: "strateco-remarques-plateforme/1.0";
  genere_le: string;
  copropriete: string;
  schema_source: string;
  revision: number | null;
  remarques: Controle[];
}

export function exporterRemarques(travail: PpptVerifJson, remarques: Controle[], aujourdHui: Date = new Date()): ExportRemarques {
  return {
    format: "strateco-remarques-plateforme/1.0",
    genere_le: dateIso(aujourdHui),
    copropriete: travail.copropriete?.nom ?? "",
    schema_source: travail.schema_version,
    revision: travail.revision?.numero ?? null,
    remarques,
  };
}

/** Nom du fichier exporté, calqué sur celui du skill : PPPT_VERIF_<Copro>_<AAAAMMJJ>[_valide].json. */
export function nomFichierExport(nomCopro: string, json: PpptVerifJson, suffixe = ""): string {
  const copro = nomCopro.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "") || "copro";
  const date = (json.revision?.date ?? json.genere_le ?? "").replace(/-/g, "");
  const valide = json.synthese?.statut_validation_global === "VALIDE" ? "_valide" : "";
  return `PPPT_VERIF_${copro}_${date}${suffixe || valide}.json`;
}
