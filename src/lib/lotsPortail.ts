// Libellé des lots d'un copropriétaire sur l'écran de choix du portail (retour d'Amir
// du 09/10/2026 : un propriétaire de plusieurs logements, ou de lots dans plusieurs
// copropriétés, doit voir de quel lot il s'agit en se connectant). Deux fiches d'une
// même copropriété, parfois du même nom, ne se distinguaient que par « 2 lots » :
// on liste désormais les numéros, les logements d'abord, puis leurs annexes.
import { libellesBatiments } from "./referentiels";

export interface LotAffichable {
  num: string;
  usage: string;
  batiment: string | null;
}

/** Nom du lot dans une phrase : « Lot n°11 » pour un logement, « garage n°53 » pour une annexe. */
const NOM_ANNEXE: Record<string, string> = {
  garage: "garage",
  caves: "cave",
  commerces: "commerce",
  bureaux: "bureau",
  autres: "lot annexe",
};

const comparer = (a: LotAffichable, b: LotAffichable) =>
  a.num.localeCompare(b.num, "fr", { numeric: true });

/**
 * « Lot n°11 (Bât. 01) + garage n°53 ». Les logements d'abord (par numéro), puis les
 * annexes. Au-delà de `max` lots, la fin est résumée (« + 3 autres lots »).
 */
export function libelleLotsPortail(
  lots: LotAffichable[],
  denominationBatiments?: string | null,
  max = 4,
): string {
  if (lots.length === 0) return "";
  const bat = libellesBatiments(denominationBatiments).court;
  const logements = lots.filter((l) => l.usage === "habitation").sort(comparer);
  const batimentsLogements = new Set(logements.map((l) => l.batiment).filter(Boolean));
  const decrit = (l: LotAffichable) => {
    const nom = l.usage === "habitation" ? "Lot" : (NOM_ANNEXE[l.usage] ?? "lot");
    // une annexe dans le même bâtiment que le logement n'a pas à le répéter
    const montre = l.batiment && (l.usage === "habitation" || !batimentsLogements.has(l.batiment));
    return `${nom} n°${l.num}${montre ? ` (${bat} ${l.batiment})` : ""}`;
  };
  const annexes = lots.filter((l) => l.usage !== "habitation").sort(comparer);
  const ordre = [...logements, ...annexes];
  const gardes = ordre.slice(0, max);
  const reste = ordre.length - gardes.length;
  const enLogements = gardes.filter((l) => l.usage === "habitation").map(decrit);
  const enAnnexes = gardes.filter((l) => l.usage !== "habitation").map(decrit);
  let texte = enLogements.join(", ");
  if (enAnnexes.length) texte += (texte ? " + " : "") + enAnnexes.join(", ");
  if (reste > 0) texte += ` + ${reste} autre${reste > 1 ? "s" : ""} lot${reste > 1 ? "s" : ""}`;
  return texte;
}
