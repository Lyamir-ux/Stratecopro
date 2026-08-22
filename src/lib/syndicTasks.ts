// Tâches du syndic - générées côté client depuis la phase du dossier
// (port de makeSyndicTasks, design-reference/project/data.js).
// Ce sont des repères d'accompagnement (assemblées, comptes d'aides,
// validations, registre, PV, DO…) - pas les tâches internes de l'AMO.
import type { PhaseId } from "./referentiels";

export type SyndicTaskStatus = "todo" | "doing" | "done";

export interface SyndicTask {
  title: string;
  status: SyndicTaskStatus;
  tag?: string;
  due?: string;
}

export function makeSyndicTasks(phase: PhaseId): Record<PhaseId, SyndicTask[]> {
  const inE = phase === "etudes";
  const inT = phase === "travaux";
  return {
    diagnostic: [
      { title: "Mise à jour du registre de copropriété", status: "done" },
      { title: "Ouverture des comptes sur les plateformes d'aides", status: phase === "diagnostic" ? "doing" : "done", tag: "Aides" },
      { title: "Inscription du projet à l'ordre du jour de l'AG", status: phase === "diagnostic" ? "todo" : "done" },
    ],
    etudes: [
      { title: "Tenue de l'assemblée générale - vote des travaux", status: phase === "diagnostic" ? "todo" : inE ? "doing" : "done", tag: "AG" },
      { title: "Dressage du PV d'assemblée générale", status: inT ? "done" : inE ? "doing" : "todo" },
      { title: "Signature de la fiche État", status: inT ? "done" : "todo" },
      { title: "Ouverture du compte bancaire travaux", status: inT ? "done" : "todo" },
      { title: "Constitution de l'assurance dommages-ouvrage", status: inT ? "done" : "todo", tag: "DO" },
    ],
    travaux: [
      { title: "Validation des dossiers d'aides", status: inT ? "done" : "todo", tag: "Aides" },
      { title: "Suivi du chantier", status: inT ? "doing" : "todo", due: "En cours" },
      { title: "Validation des demandes d'acompte", status: inT ? "doing" : "todo" },
      { title: "Validation du solde & versement des aides", status: "todo" },
      { title: "Tenue de l'AG de clôture & quitus", status: "todo", tag: "AG" },
    ],
  };
}

/** Tâches actionnables de la phase courante (pour « Vos tâches » et les badges). */
export function openSyndicTasks(phase: PhaseId): SyndicTask[] {
  return (makeSyndicTasks(phase)[phase] ?? []).filter((t) => t.status !== "done");
}
