// Bandeau « nouvelle version en ligne » (feedback Amir 24/09 : corbeilles
// introuvables sur une page restée ouverte depuis le matin). Toutes les
// 5 minutes et au retour sur l'onglet, le script d'entrée de /index.html est
// comparé à celui de la page ; s'il a changé, un bandeau propose de recharger.
// Jamais de rechargement automatique : une saisie en cours serait perdue.
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { scriptEntree } from "@/lib/version";

export function NouvelleVersion() {
  const [dispo, setDispo] = useState(false);
  const [masque, setMasque] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const actuel = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.getAttribute("src") ?? null;
    if (!actuel) return;
    let fini = false;
    const verifier = async () => {
      if (fini || document.hidden) return;
      try {
        const r = await fetch(`/index.html?v=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const enLigne = scriptEntree(await r.text());
        if (enLigne && enLigne !== actuel) setDispo(true);
      } catch {
        // hors ligne : nouvel essai au prochain passage
      }
    };
    const minuterie = window.setInterval(() => void verifier(), 5 * 60_000);
    const auRetour = () => {
      if (!document.hidden) void verifier();
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      fini = true;
      window.clearInterval(minuterie);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, []);

  if (!dispo || masque) return null;
  return (
    <div role="status" className="nouvelle-version">
      <Icon name="refresh" size={16} />
      <span>Une nouvelle version de Strat Eco pro est en ligne.</span>
      <button type="button" className="nv-recharger" onClick={() => window.location.reload()}>Recharger</button>
      <button type="button" className="nv-fermer" title="Plus tard" aria-label="Plus tard" onClick={() => setMasque(true)}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
