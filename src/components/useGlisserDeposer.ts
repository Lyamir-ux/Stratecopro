// Glisser-déposer un fichier sur une zone de dépôt (retour de A CHELGHAM,
// 09/10/2026 : « on ne peut pas glisser-déposer les documents »). Les props se
// posent sur l'élément qui reçoit le fichier ; `survol` sert à le surligner.
// Un fichier lâché à côté d'une zone inactive n'est jamais ouvert par le
// navigateur à la place du portail : le comportement par défaut est toujours
// annulé.
import { useState, type DragEvent } from "react";

const porteDesFichiers = (e: DragEvent) => Array.from(e.dataTransfer.types ?? []).includes("Files");

export function useGlisserDeposer(onFichier: (f: File) => boolean | void, actif = true) {
  const [survol, setSurvol] = useState(false);
  const props = {
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!porteDesFichiers(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = actif ? "copy" : "none";
      if (actif && !survol) setSurvol(true);
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      // le survol d'un enfant de la zone déclenche aussi « dragleave »
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSurvol(false);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (!porteDesFichiers(e)) return;
      e.preventDefault();
      setSurvol(false);
      const fichier = e.dataTransfer.files?.[0];
      if (!actif || !fichier) return;
      const champ = e.currentTarget.querySelector<HTMLInputElement>('input[type="file"]');
      // false = fichier refusé (format) : le champ natif n'en affiche pas le nom
      if (onFichier(fichier) === false || !champ) return;
      try {
        champ.files = e.dataTransfer.files;
      } catch {
        /* navigateur ancien : seul l'état de la page porte le fichier */
      }
    },
  };
  return { survol, props };
}
