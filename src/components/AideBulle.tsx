// Bulle d'aide d'une question de l'enquête (retour de Marius MAZZANTE, 09/10/2026 :
// « le pop-up d'aide s'affiche mal, il met du temps à charger, voire n'apparaît pas »).
// L'ancienne aide était l'infobulle native du navigateur (attribut title) : retardée d'une
// seconde, tronquée, et absente sur téléphone. Ici : s'affiche tout de suite au survol de la
// souris, au clic ou au toucher, se ferme par un second clic, un clic ailleurs ou Échap.
// La bulle se place sous le libellé de la question (le parent doit être en position relative).
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";

export function AideBulle({ texte, label = "Aide pour répondre à cette question" }: { texte: string; label?: string }) {
  const [survol, setSurvol] = useState(false);
  const [epinglee, setEpinglee] = useState(false);
  const racine = useRef<HTMLSpanElement>(null);
  const id = useId();
  const ouverte = survol || epinglee;

  useEffect(() => {
    if (!ouverte) return;
    const clicAilleurs = (e: PointerEvent) => {
      if (racine.current?.contains(e.target as Node)) return;
      setEpinglee(false);
      setSurvol(false);
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setEpinglee(false);
      setSurvol(false);
    };
    document.addEventListener("pointerdown", clicAilleurs);
    document.addEventListener("keydown", touche);
    return () => {
      document.removeEventListener("pointerdown", clicAilleurs);
      document.removeEventListener("keydown", touche);
    };
  }, [ouverte]);

  return (
    <span
      ref={racine}
      className="aide-bulle"
      // le survol ne vaut que pour une souris : au toucher, c'est le clic qui ouvre
      onPointerEnter={(e) => e.pointerType === "mouse" && setSurvol(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setSurvol(false)}
    >
      <button
        type="button"
        className="aide-bulle-btn"
        aria-label={label}
        aria-expanded={ouverte}
        aria-controls={ouverte ? id : undefined}
        onClick={() => setEpinglee((v) => !v)}
      >
        <Icon name="help" size={14} />
      </button>
      {ouverte && (
        <span role="tooltip" id={id} className="aide-bulle-txt">
          {texte}
        </span>
      )}
    </span>
  );
}
