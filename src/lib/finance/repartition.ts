// Répartition individuelle par tantièmes - généralisation de Step7 (design-reference/project/ingenierie.jsx).
// Règles (identiques au prototype, plafond éco-PTZ par logement en plus) :
//   quote-part      = coutTotal × (tantièmes / totalClé)
//   CEE             = cee × frac ; subv. collective = (MPR Copro + fonds) × frac
//   MPR individuelle = prime forfaitaire du profil (0 si profil inconnu / enquête non répondue)
//   éco-PTZ         = min(reste avant prêt × pct, plafond × nb logements du copropriétaire)
//   reste à charge  = reste avant prêt − éco-PTZ ; mensualité = éco-PTZ / (durée × 12)
import type { Bareme, FinanceParams, FinanceResult, OwnerInput, PlanIndividuel, PlansResult } from "./types";
import { round2, roundAllocate } from "./round";

export function computePlansIndividuels(
  p: FinanceParams,
  d: FinanceResult,
  owners: OwnerInput[],
  bareme: Bareme,
  /** Total de la clé de répartition (1000 ‰ par convention MUN). */
  totalCle = 1000
): PlansResult {
  if (totalCle <= 0) throw new Error("totalCle doit être strictement positif");

  const fracs = owners.map((o) => o.lots.reduce((a, l) => a + l.tantiemes, 0) / totalCle);
  const subvCollBase = d.mprCopro + p.fonds;

  // Colonnes linéaires réparties au centime près (somme préservée).
  const quoteParts = roundAllocate(fracs.map((f) => d.coutTotal * f));
  const cees = roundAllocate(fracs.map((f) => p.cee * f));
  const subvColls = roundAllocate(fracs.map((f) => subvCollBase * f));

  const plans: PlanIndividuel[] = owners.map((o, i) => {
    const lotsHab = o.lots.filter((l) => l.usage === "habitation").length;
    const mprIndiv = o.profil ? (p.primeIndiv[o.profil] ?? 0) : 0;
    const resteAvant = Math.max(0, round2(quoteParts[i] - mprIndiv - cees[i] - subvColls[i]));
    const plafond = bareme.ecoPtz.plafondParLogement * lotsHab;
    const ecoPtz = p.ecoPtz ? round2(Math.min(resteAvant * (p.ecoPtzPct / 100), plafond)) : 0;
    const resteACharge = round2(resteAvant - ecoPtz);
    const mensualite = p.ecoPtz && p.ecoPtzDuree > 0 ? round2(ecoPtz / (p.ecoPtzDuree * 12)) : 0;
    return {
      ownerId: o.id,
      nom: o.nom,
      profil: o.profil,
      lotNums: o.lots.map((l) => l.num),
      lotsHab,
      tantiemes: o.lots.reduce((a, l) => a + l.tantiemes, 0),
      quotePart: quoteParts[i],
      mprIndiv,
      cee: cees[i],
      subvColl: subvColls[i],
      ecoPtz,
      resteACharge,
      mensualite,
    };
  });

  const sum = (k: keyof PlanIndividuel) => round2(plans.reduce((a, r) => a + (r[k] as number), 0));
  return {
    plans,
    totals: {
      tantiemes: plans.reduce((a, r) => a + r.tantiemes, 0),
      quotePart: sum("quotePart"),
      mprIndiv: sum("mprIndiv"),
      cee: sum("cee"),
      subvColl: sum("subvColl"),
      ecoPtz: sum("ecoPtz"),
      resteACharge: sum("resteACharge"),
      mensualite: sum("mensualite"),
    },
  };
}
