// « Mes projets » d'une maîtrise d'œuvre : recherche et filtre de la liste.
// Idée d'Amir du 14/10/2026 : une MOE a souvent des dizaines de projets, elle
// retrouve le sien par le nom de la copropriété ou par la rue.
import { normaliserRecherche } from "@/lib/format";
import type { PhaseId } from "@/lib/referentiels";

type ProjetCherchable = {
  copro: {
    name: string;
    adresse: string | null;
    city: string | null;
    code_postal: string | null;
    phase: string | null;
  };
};

/** Projets dont le nom, l'adresse, la ville ou le code postal contiennent la
 *  recherche (accents, majuscules et espaces multiples ignorés), dans la phase
 *  demandée (null : toutes). Recherche vide : tous les projets de la phase. */
export function filtrerProjetsMoe<T extends ProjetCherchable>(
  projets: T[],
  recherche: string,
  phase: PhaseId | null = null
): T[] {
  const mots = normaliserRecherche(recherche.trim()).split(/\s+/).filter(Boolean);
  return projets.filter((p) => {
    if (phase && p.copro.phase !== phase) return false;
    if (mots.length === 0) return true;
    const texte = normaliserRecherche(
      [p.copro.name, p.copro.adresse ?? "", p.copro.code_postal ?? "", p.copro.city ?? ""].join(" ")
    );
    return mots.every((m) => texte.includes(m));
  });
}
