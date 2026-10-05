// Graduation DPE classique (A → G, barres de plus en plus longues) avec une
// flèche « avant travaux » et une flèche « après travaux » placées à la hauteur
// exacte de la consommation (kWhep/m².an) dans la barre de leur étiquette :
// 94 kWh/m².an pour un C est tout en haut de la barre, près du B (consigne de
// l'AMO du 05/10/2026, feedback Armorial, puis précision d'Amir). Sans
// consommation exploitable, la flèche est centrée sur la barre.
import { Icon } from "./Icon";
import { DPE, DPE_CLASSES, type DpeClass } from "@/lib/referentiels";
import { positionDansClasse } from "@/lib/echelleDpe";

// Géométrie en pixels : hauteur de barre, espace entre barres, retrait intérieur
// (la flèche reste dans la barre même aux deux bornes de la classe)
const H = 30;
const ECART = 3;
const RETRAIT = 4;
const PAS = H + ECART;
const HAUTEUR_MARQUE = 34;
const largeurBarre = (rang: number) => 86 + rang * 14;

interface Marque {
  cle: "avant" | "apres";
  libelle: string;
  rang: number;
  y: number;
  cep: number | null;
}

function marque(cle: Marque["cle"], libelle: string, cls: DpeClass | null | undefined, cep: number | null | undefined): Marque | null {
  if (!cls) return null;
  const rang = DPE_CLASSES.indexOf(cls);
  const pos = positionDansClasse(cls, cep);
  return { cle, libelle, rang, y: rang * PAS + RETRAIT + pos.frac * (H - 2 * RETRAIT), cep: pos.cep };
}

export function EchelleDpe({
  avant,
  apres,
  cepAvant,
  cepApres,
}: {
  avant?: DpeClass | null;
  apres?: DpeClass | null;
  cepAvant?: number | null;
  cepApres?: number | null;
}) {
  const marques = [marque("avant", "Avant travaux", avant, cepAvant), marque("apres", "Après travaux", apres, cepApres)]
    .filter((m): m is Marque => m !== null)
    .sort((a, b) => a.y - b.y);
  // Deux libellés proches ne se chevauchent pas : le second est repoussé vers le bas
  // (l'aiguille sur la barre garde la position exacte)
  const hautLibelle: number[] = [];
  marques.forEach((m, i) => {
    const y = i === 0 ? m.y : Math.max(m.y, hautLibelle[i - 1] + HAUTEUR_MARQUE + 2);
    hautLibelle.push(y);
  });

  const fmt = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
  const description = marques
    .map((m) => `étiquette ${DPE_CLASSES[m.rang]} ${m.libelle.toLowerCase()}${m.cep != null ? ` (${fmt(m.cep)} kWh/m².an)` : ""}`)
    .join(", ");
  const concernees = new Set(marques.map((m) => m.rang));

  return (
    <div
      className="echelle-dpe"
      role="img"
      aria-label={`Graduation énergie de l'immeuble : ${description}`}
      style={{ height: DPE_CLASSES.length * PAS - ECART, width: largeurBarre(DPE_CLASSES.length - 1) + 8 + 118 }}
    >
      {DPE_CLASSES.map((cls, i) => (
        <span
          key={cls}
          className={"ed-barre" + (cls === "F" || cls === "G" ? " dark" : "") + (concernees.has(i) ? " ed-concernee" : "")}
          style={{ background: DPE[cls], width: largeurBarre(i), height: H, top: i * PAS }}
        >
          {cls}
        </span>
      ))}
      {marques.map((m, i) => (
        <span key={m.cle}>
          {m.cep != null && <span className="ed-aiguille" style={{ top: m.y - 1, width: largeurBarre(m.rang) - 32 }} />}
          <span className={"ed-marque ed-" + m.cle} style={{ top: hautLibelle[i] - HAUTEUR_MARQUE / 2 + 1, left: largeurBarre(m.rang) + 8, height: HAUTEUR_MARQUE }}>
            <Icon name="arrowLeft" size={16} />
            <span className="ed-texte">
              <span className="ed-libelle">{m.libelle}</span>
              {m.cep != null && <span className="ed-cep">{fmt(m.cep)} kWh/m².an</span>}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}
