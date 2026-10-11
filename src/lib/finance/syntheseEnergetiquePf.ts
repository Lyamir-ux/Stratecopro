// Gain énergétique et étiquettes du dossier quand plusieurs PF définitifs sont
// validés (un par bâtiment, 11/10/2026). Un seul PF : ses valeurs, comme avant.
import type { PlanDefinitifData, PlanDefinitifResult } from "./planDefinitif";

export interface SyntheseEnergetique {
  /** Gain énergétique du dossier en % (null si aucun PF ne le renseigne). */
  gainPct: number | null;
  /** Étiquettes avant / après travaux (lettre A à G, null si absente). */
  etiquetteAvant: string | null;
  etiquetteApres: string | null;
}

export function lireEtiquette(s: string | null | undefined): string | null {
  const l = (s ?? "").trim().toUpperCase().slice(0, 1);
  return l && "ABCDEFG".includes(l) ? l : null;
}

/** La moins bonne étiquette (G est la moins bonne). */
function pire(lettres: (string | null)[]): string | null {
  const l = lettres.filter((x): x is string => !!x).sort();
  return l.length ? l[l.length - 1] : null;
}

/**
 * Plusieurs PF : consommations pondérées par la surface habitable de chaque
 * bâtiment (à défaut le nombre de logements), comme le gain du Churchill
 * arbitré le 23/09/2026 ; sans consommations, moyenne pondérée des gains.
 * Étiquettes : la moins bonne de chaque côté, pour ne jamais annoncer mieux
 * que le bâtiment le moins performant.
 */
export function syntheseEnergetiquePfs(pfs: { data: PlanDefinitifData; resultat: PlanDefinitifResult }[]): SyntheseEnergetique {
  if (pfs.length === 0) return { gainPct: null, etiquetteAvant: null, etiquetteApres: null };
  if (pfs.length === 1) {
    const { data, resultat } = pfs[0];
    return {
      gainPct: resultat.performancePct ? Math.round(resultat.performancePct * 10) / 10 : null,
      etiquetteAvant: lireEtiquette(data.infos.etiquetteInitiale),
      etiquetteApres: lireEtiquette(data.infos.etiquetteProjet),
    };
  }
  const poids = (d: PlanDefinitifData) => d.infos.surfaceHabitable || d.infos.nbLogements || 1;
  let gain: number | null = null;
  if (pfs.every((p) => p.data.infos.cepInitial > 0)) {
    const avant = pfs.reduce((s, p) => s + poids(p.data) * p.data.infos.cepInitial, 0);
    const apres = pfs.reduce((s, p) => s + poids(p.data) * p.data.infos.cepProjet, 0);
    gain = 100 - (100 * apres) / avant;
  } else {
    const avecGain = pfs.filter((p) => p.resultat.performancePct);
    const total = avecGain.reduce((s, p) => s + poids(p.data), 0);
    if (total > 0) gain = avecGain.reduce((s, p) => s + poids(p.data) * p.resultat.performancePct, 0) / total;
  }
  return {
    gainPct: gain ? Math.round(gain * 10) / 10 : null,
    etiquetteAvant: pire(pfs.map((p) => lireEtiquette(p.data.infos.etiquetteInitiale))),
    etiquetteApres: pire(pfs.map((p) => lireEtiquette(p.data.infos.etiquetteProjet))),
  };
}
