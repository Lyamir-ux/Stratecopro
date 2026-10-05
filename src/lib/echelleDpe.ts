// Position d'une consommation (kWhep/m².an) à l'intérieur de la barre de son
// étiquette sur la graduation DPE du portail (demande d'Amir du 05/10/2026 :
// 94 kWh/m².an pour un C est tout en haut de la classe, près du B, pas au milieu).
//
// L'étiquette affichée est celle du DPE (la moins bonne de l'énergie et des
// émissions de GES) : la consommation peut donc tomber dans la classe voisine de
// l'étiquette annoncée (Armorial : C annoncé, 94 kWh/m².an = fourchette du B).
// On place alors la flèche au bord de la classe annoncée qui touche cette
// consommation. Au-delà d'une classe d'écart, la valeur n'est pas fiable pour
// situer la flèche : on la centre dans la barre, sans valeur affichée.
import { DPE_CLASSES, type DpeClass } from "@/lib/referentiels";
import { etiquetteDepuisCep } from "@/lib/ppt/formules";
import { SEUILS_CEP } from "@/lib/ppt/referentiels";

/** Largeur retenue pour la dernière classe, ouverte vers le haut (G > 420). */
const LARGEUR_CLASSE_G = 180;

export interface PositionDpe {
  /** 0 = haut de la barre (meilleure consommation de la classe), 1 = bas de la barre. */
  frac: number;
  /** true = la consommation situe la flèche ; false = flèche centrée sur la barre. */
  precis: boolean;
  /** Consommation à afficher à côté de la flèche, seulement si elle situe la flèche. */
  cep: number | null;
}

export function positionDansClasse(classe: DpeClass, cep: number | null | undefined): PositionDpe {
  const centre: PositionDpe = { frac: 0.5, precis: false, cep: null };
  if (cep == null || !Number.isFinite(cep) || cep <= 0) return centre;

  const rang = DPE_CLASSES.indexOf(classe);
  const classeCep = etiquetteDepuisCep(cep);
  if (rang < 0 || !classeCep || Math.abs(DPE_CLASSES.indexOf(classeCep) - rang) > 1) return centre;

  const bas = rang === 0 ? 0 : SEUILS_CEP[rang - 1].max;
  const haut = rang === DPE_CLASSES.length - 1 ? bas + LARGEUR_CLASSE_G : SEUILS_CEP[rang].max;
  const frac = Math.min(1, Math.max(0, (cep - bas) / (haut - bas)));
  return { frac, precis: true, cep };
}
