// Regroupement des lignes « MOE et frais annexes » du PF définitif par mission :
// une seule ligne par mission en additionnant les montants (AMO, MOE, contrôle
// technique, CSPS, tests d'étanchéité avant + après travaux) — les autres frais
// restent ligne à ligne. La détection se fait sur la désignation saisie au PF.
// Utilisé par le suivi financier ET le panneau PF de l'onglet Financement (syndic).
import type { MoeLigneResult } from "./planDefinitif";

export const MISSIONS_ANNEXES: { id: string; label: string; match: RegExp }[] = [
  { id: "amo", label: "Assistance à maîtrise d'ouvrage", match: /assistance\s+ma[iî]trise|\bAMO\b/i },
  { id: "moe", label: "Maîtrise d'œuvre", match: /ma[iî]trise\s+d.?(œ|oe)uvre|\bMOE\b/i },
  { id: "ct", label: "Contrôle technique", match: /contr[oô]le\s+technique|\bCT\b/i },
  { id: "csps", label: "CSPS", match: /\bC?SPS\b/i },
  { id: "etancheite", label: "Tests d'étanchéité à l'air", match: /[ée]tanch[ée]it[ée]/i },
];

export interface LigneAnnexe {
  /** « mission:<id> » (regroupée) ou « moe:<index> » (ligne restée seule). */
  key: string;
  libelle: string;
  /** Entreprises distinctes des lignes regroupées, jointes par « , » (null si aucune). */
  entreprise: string | null;
  montantTtc: number;
}

/** Une ligne par mission (montants additionnés), puis les frais restants ligne à ligne. */
export function regrouperAnnexes(moe: MoeLigneResult[]): LigneAnnexe[] {
  const parMission = new Map<string, { montantTtc: number; entreprises: string[] }>();
  const restants: LigneAnnexe[] = [];
  moe.forEach((m, i) => {
    if (m.montantTtc === 0) return;
    const mission = MISSIONS_ANNEXES.find((ms) => ms.match.test(m.designation));
    if (mission) {
      const acc = parMission.get(mission.id) ?? { montantTtc: 0, entreprises: [] };
      acc.montantTtc += m.montantTtc;
      if (m.entreprise && !acc.entreprises.includes(m.entreprise)) acc.entreprises.push(m.entreprise);
      parMission.set(mission.id, acc);
    } else {
      restants.push({
        key: `moe:${i}`,
        libelle: m.designation || `Ligne MOE ${i + 1}`,
        entreprise: m.entreprise ?? null,
        montantTtc: m.montantTtc,
      });
    }
  });
  return [
    ...MISSIONS_ANNEXES.filter((ms) => parMission.has(ms.id)).map((ms) => {
      const acc = parMission.get(ms.id)!;
      return {
        key: `mission:${ms.id}`,
        libelle: ms.label,
        entreprise: acc.entreprises.length ? acc.entreprises.join(", ") : null,
        montantTtc: acc.montantTtc,
      };
    }),
    ...restants,
  ];
}
