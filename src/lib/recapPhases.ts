// Récapitulatif des étapes sur l'accueil du portail (idée d'Amir du 02/10/2026,
// 11:08, complétée le 05/10/2026 à 11:52 : afficher aussi les tâches en cours) :
// sous une étape terminée, ce qui a été réalisé ; sous l'étape courante, ce qui
// est en cours puis ce qui reste à réaliser ; sous les étapes à venir, ce qui
// reste à réaliser. Rédigé pour les copropriétaires, pas avec les libellés
// internes du plan de tâches AMO.
//
// Une phase terminée l'est entièrement (phase calculée depuis les tâches, 0065) :
// son récapitulatif se déduit de la phase. L'étape courante lit ses tâches
// (RPC portail_taches, 0138).
import { fmtDate } from "./format";
import type { PhaseId } from "./referentiels";

export interface RecapPhase {
  /** « realise » : ce qui a été fait ; « reste » : ce qui reste à faire ; « encours » : ce qui est en cours */
  mode: "realise" | "reste" | "encours";
  items: string[];
  /** après les éléments « en cours » : ce qui reste à réaliser ensuite */
  suite?: string[];
}

export interface TachePortail {
  phase?: string;
  titre: string;
  fait: boolean;
  /** tâche en cours (statut « doing » du plan de tâches AMO) */
  en_cours?: boolean;
}

const RANG: Record<PhaseId, number> = { diagnostic: 0, etudes: 1, travaux: 2 };

type Groupe = { libelle: string; taches: string[] };

/** Tâches Diagnostic du gabarit (buildTaskTemplate) regroupées, en langage copropriétaire. */
export const GROUPES_DIAGNOSTIC: Groupe[] = [
  { libelle: "Recensement des copropriétaires et des lots", taches: ["Recensement des copropriétaires & lots", "Saisie des tantièmes par bâtiment"] },
  { libelle: "Consultations préalables", taches: ["Consultations diverses"] },
  { libelle: "Vérification de l'audit énergétique", taches: ["Vérif. audit énergétique"] },
  { libelle: "Enquête sociale auprès des copropriétaires", taches: ["Enquête sociale - profils MaPrimeRénov' · Fiche État"] },
];

/** Tâches Études du gabarit regroupées. */
export const GROUPES_ETUDES: Groupe[] = [
  { libelle: "Scénarios de travaux et chiffrage", taches: ["Scénarios de travaux & chiffrage"] },
  { libelle: "Consultation des entreprises", taches: ["Récupération des données des entreprises"] },
  {
    libelle: "Plans de financement et aides",
    taches: [
      "Ingénierie financière (7 étapes)",
      "Récupération des données essentielles - CEE / MPR Copro",
      "Plans de financement généraux et individuels",
    ],
  },
  { libelle: "Préparation du dossier d'assemblée générale", taches: ["Liasse documentaire pour AG"] },
];

/** Tâches Travaux du gabarit regroupées : au plus 4 lignes. */
export const GROUPES_TRAVAUX: Groupe[] = [
  { libelle: "Demandes d'aides et prêts", taches: ["Dépôt des dossiers des aides", "Mobilisation des prêts"] },
  { libelle: "Réalisation du chantier", taches: ["Suivi de chantier", "Demandes d'acompte"] },
  { libelle: "Réception des travaux", taches: ["Réception des travaux & levée des réserves"] },
  { libelle: "Versement du solde des aides", taches: ["Versement des aides & solde"] },
];

const GROUPES: Record<PhaseId, Groupe[]> = {
  diagnostic: GROUPES_DIAGNOSTIC,
  etudes: GROUPES_ETUDES,
  travaux: GROUPES_TRAVAUX,
};

const TOUT_FAIT: Record<PhaseId, string> = {
  diagnostic: "Toutes les étapes du diagnostic sont réalisées",
  etudes: "Toutes les étapes des études sont réalisées",
  travaux: "Toutes les étapes des travaux sont réalisées",
};

/**
 * Récapitulatif d'une phase d'après ses tâches : les groupes avec une tâche en
 * cours d'abord, puis ceux qui restent à faire. Sans aucune tâche en cours, on
 * retrouve la simple liste « reste à réaliser ».
 */
function recapDepuisTaches(phase: PhaseId, taches: TachePortail[]): RecapPhase {
  const dePhase = taches.filter((t) => !t.phase || t.phase === phase);
  // Aucune tâche connue : tout reste à faire
  if (!dePhase.length) return { mode: "reste", items: GROUPES[phase].map((g) => g.libelle) };
  const encours: string[] = [];
  const reste: string[] = [];
  for (const g of GROUPES[phase]) {
    const concernees = dePhase.filter((t) => g.taches.includes(t.titre));
    if (concernees.some((t) => !t.fait && t.en_cours)) encours.push(g.libelle);
    else if (concernees.some((t) => !t.fait)) reste.push(g.libelle);
  }
  if (encours.length) return { mode: "encours", items: encours, ...(reste.length ? { suite: reste } : {}) };
  return reste.length ? { mode: "reste", items: reste } : { mode: "realise", items: [TOUT_FAIT[phase]] };
}

/**
 * Récapitulatif par phase : les phases terminées (« realise »), l'étape
 * courante (« encours » puis « reste ») et les phases à venir (« reste »).
 * Rien pour l'étape courante tant que ses tâches ne sont pas chargées.
 */
export function recapPhases(args: {
  phase: PhaseId;
  energyBefore: string | null;
  dateAg: string | null;
  /** tâches du dossier ; undefined = pas encore chargées */
  taches: TachePortail[] | undefined;
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

  // Étape courante : ce qui est en cours, puis ce qui reste (tâches chargées)
  if (args.taches) recap[args.phase] = recapDepuisTaches(args.phase, args.taches);

  // Phase Travaux à venir : tout reste à réaliser
  if (rang < RANG.travaux) recap.travaux = { mode: "reste", items: GROUPES_TRAVAUX.map((g) => g.libelle) };

  return recap;
}
