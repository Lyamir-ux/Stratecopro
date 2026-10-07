// Le champ e-mail d'une fiche de copropriétaire peut porter plusieurs adresses
// (« a@x.fr / b@y.fr », « a@x.fr ; b@y.fr »). Retour d'Amir du 07/10/2026 :
// seule la première sert à ouvrir l'espace et à envoyer l'e-mail. Même règle que
// premiereAdresse() de l'edge function creer-espace-coproprietaire et que
// premiere_adresse() en base (migration 0145) : à garder alignées.
const ADRESSE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:[.][A-Za-z0-9-]+)+/;

/** Première adresse du champ, en minuscules ; null si le champ n'en contient aucune. */
export function premiereAdresse(texte: string | null | undefined): string | null {
  const m = ADRESSE.exec(texte ?? "");
  return m ? m[0].toLowerCase() : null;
}
