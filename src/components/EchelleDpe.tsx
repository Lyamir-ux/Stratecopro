// Graduation DPE classique (A → G, barres de plus en plus longues) avec une
// flèche « avant travaux » et une flèche « après travaux » devant les barres
// concernées. Remplace les deux pastilles de lettres sur l'accueil du portail
// (consigne de l'AMO du 05/10/2026, feedback Armorial).
import { Icon } from "./Icon";
import { DPE, DPE_CLASSES, type DpeClass } from "@/lib/referentiels";

export function EchelleDpe({ avant, apres }: { avant?: DpeClass | null; apres?: DpeClass | null }) {
  const description = [
    avant ? `étiquette ${avant} avant travaux` : null,
    apres ? `étiquette ${apres} après travaux` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="echelle-dpe" role="img" aria-label={`Graduation énergie de l'immeuble : ${description}`}>
      {DPE_CLASSES.map((cls, i) => {
        const marques = [
          avant === cls ? { cle: "avant", libelle: "Avant travaux" } : null,
          apres === cls ? { cle: "apres", libelle: "Après travaux" } : null,
        ].filter((m): m is { cle: string; libelle: string } => m !== null);
        const concernee = marques.length > 0;
        return (
          <div key={cls} className={"ed-ligne" + (concernee ? " ed-concernee" : "")}>
            <span
              className={"ed-barre" + (cls === "F" || cls === "G" ? " dark" : "")}
              style={{ background: DPE[cls], width: 70 + i * 16 }}
            >
              {cls}
            </span>
            <div className="ed-marques">
              {marques.map((m) => (
                <span key={m.cle} className={"ed-marque ed-" + m.cle}>
                  <Icon name="arrowLeft" size={16} />
                  {m.libelle}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
