// Enveloppe d'un tableau dont la ligne d'en-tête reste figée quand on déroule
// la page (feedback Amir 26/09, récap et suivi de l'échéancier PPT).
// Un conteneur à défilement horizontal (overflow-x: auto) empêche les en-têtes
// collés de suivre la page : tant que le tableau tient dans la largeur, le
// conteneur passe en overflow: clip et les en-têtes se collent sous l'en-tête
// et les onglets du portail ; s'il déborde (écran étroit), il garde son
// défilement horizontal, borné en hauteur à l'écran, et l'en-tête se colle en
// haut du tableau.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function TableauFige({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [deborde, setDeborde] = useState(false);

  useLayoutEffect(() => {
    const wrap = ref.current;
    const table = wrap?.querySelector("table");
    if (!wrap || !table) return;
    const mesurer = () => {
      // largeur hors ascenseur : la barre verticale du mode « déborde » ne doit pas le retenir
      const cs = getComputedStyle(wrap);
      const dispo = wrap.offsetWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setDeborde(table.offsetWidth > dispo + 1);
      // bas des bandeaux collés du portail (en-tête + onglets), 0 hors portail
      const nav = document.querySelector(".portal-nav");
      wrap.style.setProperty("--fige-haut", `${nav ? Math.max(0, Math.round(nav.getBoundingClientRect().bottom)) : 0}px`);
    };
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(wrap);
    ro.observe(table);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${className} fige ${deborde ? "fige-interne" : "fige-page"}`}>
      {children}
    </div>
  );
}
