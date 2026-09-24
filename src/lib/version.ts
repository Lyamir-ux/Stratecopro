// Détection d'une nouvelle version en ligne (feedback Amir 24/09 : corbeilles
// introuvables sur une page restée ouverte depuis le matin). Une application
// monopage garde le bundle chargé tant que la page n'est pas rechargée ; chaque
// déploiement change le nom haché du script d'entrée dans index.html.

/** Script d'entrée (/assets/index-<hash>.js) déclaré dans un index.html, ou null. */
export function scriptEntree(html: string): string | null {
  const m = html.match(/src="(\/assets\/index-[\w-]+\.js)"/);
  return m ? m[1] : null;
}
