// Récapitulatif des étapes sur l'accueil du portail (idée d'Amir du 02/10/2026,
// 11:08) : sous une étape terminée, ce qui a été réalisé ; sous Travaux, ce qui
// reste à réaliser, en très synthétique. Rédigé pour les copropriétaires, pas
// avec les libellés internes du plan de tâches AMO.
//
// Une phase terminée l'est entièrement (phase calculée depuis les tâches, 0065) :
// son récapitulatif se déduit de la phase. Seule la phase Travaux en cours lit
// ses tâches (RPC portail_travaux, 0129).
import { fmtDate } from "./format";
import type { PhaseId } from "./referentiels";

export interface RecapPhase {
  /** « realise » : ce qui a été fait ; « reste » : ce qui reste à faire */
  mode: "realise" | "reste";
  items: string[];
}

export interface TacheTravaux {
  titre: string;
  fait: boolean;
}

const RANG: Record<PhaseId, number> = { diagnostic: 0, etudes: 1, travaux: 2 };

/** Tâches Travaux du gabarit (buildTaskTemplate) regroupées : au plus 4 lignes. */
export const GROUPES_TRAVAUX: { libelle: string; taches: string[] }[] = [
  { libelle: "Demandes d'aides et prêts", taches: ["Dépôt des dossiers des aides", "Mobilisation des prêts"] },
  { libelle: "Réalisation du chantier", taches: ["Suivi de chantier", "Demandes d'acompte"] },
  { libelle: "Réception des travaux", taches: ["Réception des travaux & levée des réserves"] },
  { libelle: "Versement du solde des aides", taches: ["Versement des aides & solde"] },
];

function resteTravaux(travaux: TacheTravaux[]): RecapPhase {
  // Aucune tâche connue : tout reste à faire
  if (!travaux.length) return { mode: "reste", items: GROUPES_TRAVAUX.map((g) => g.libelle) };
  const items = GROUPES_TRAVAUX.filter((g) => travaux.some((t) => !t.fait && g.taches.includes(t.titre))).map(
    (g) => g.libelle
  );
  return items.length
    ? { mode: "reste", items }
    : { mode: "realise", items: ["Toutes les étapes des travaux sont réalisées"] };
}

/**
 * Récapitulatif par phase : les phases terminées (« realise ») et Travaux
 * (« reste »). Rien pour la phase en cours avant Travaux, ni pour Travaux en
 * cours tant que ses tâches ne sont pas chargées.
 */
export function recapPhases(args: {
  phase: PhaseId;
  energyBefore: string | null;
  dateAg: string | null;
  /** tâches de la phase Travaux du dossier ; undefined = pas encore chargées */
  travaux: TacheTravaux[] | undefined;
}): Partial<Record<PhaseId, RecapPhase>> {
  const rang = RANG[args.phase] ?? 0;
  const recap: Partial<Record<PhaseId, RecapPhase>> = {};

  if (rang > RANG.diagnostic) {
    recap.diagnostic = {
      mode: "realise",
      items: [
        "Copropriétaires et lots recensés",
        args.energyBefore ? `Audit énergétique vérifié (étiquette ${args.energyBefore})` : "Audit énergétique vérifié",
        "Enquête sociale lancée auprès des copropriétaires",
      ],
    };
  }

  if (rang > RANG.etudes) {
    recap.etudes = {
      mode: "realise",
      items: [
        "Scénarios de travaux étudiés et chiffrés",
        "Entreprises consultées",
        "Aides et plans de financement établis",
        args.dateAg ? `Dossier préparé pour l'AG du ${fmtDate(args.dateAg)}` : "Dossier préparé pour l'assemblée générale",
      ],
    };
  }

  if (rang < RANG.travaux) recap.travaux = { mode: "reste", items: GROUPES_TRAVAUX.map((g) => g.libelle) };
  else if (args.travaux) recap.travaux = resteTravaux(args.travaux);

  return recap;
}
