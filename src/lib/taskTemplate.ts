// Gabarit de tâches AMO — porté de makeTasks (design-reference/project/data.js).
// À la création d'un dossier, on génère le plan de tâches complet ; les statuts
// initiaux dépendent de la phase de départ du dossier.
import type { PhaseId } from "./referentiels";

type Status = "todo" | "doing" | "done";

interface TemplateTask {
  phase: PhaseId;
  title: string;
  status: Status;
  tag?: string;
  jalon?: string;
  due_label?: string;
  position: number;
}

const PHASE_RANK: Record<PhaseId, number> = { diagnostic: 0, etudes: 1, travaux: 2 };

export function buildTaskTemplate(phase: PhaseId): TemplateTask[] {
  const r = PHASE_RANK[phase];
  // Statut selon la position de la phase de la tâche vs la phase du dossier :
  // phase passée → done ; phase courante → mix doing/todo ; phase future → todo.
  const st = (taskPhase: PhaseId, currentDefault: Status): Status => {
    const tr = PHASE_RANK[taskPhase];
    if (tr < r) return "done";
    if (tr > r) return "todo";
    return currentDefault;
  };

  const rows: Omit<TemplateTask, "position">[] = [
    { phase: "diagnostic", title: "Recensement des copropriétaires & lots", status: st("diagnostic", "doing"), jalon: "P1a" },
    { phase: "diagnostic", title: "Saisie des tantièmes par bâtiment", status: st("diagnostic", "todo") },
    { phase: "diagnostic", title: "Consultations diverses", status: st("diagnostic", "todo") },
    { phase: "diagnostic", title: "Vérif. audit énergétique", status: st("diagnostic", "todo"), tag: "Audit réglementaire" },
    { phase: "diagnostic", title: "Enquête sociale — profils MaPrimeRénov' · Fiche État", status: st("diagnostic", "todo"), tag: "MPR", jalon: "P1b" },
    { phase: "etudes", title: "Scénarios de travaux & chiffrage", status: st("etudes", "doing") },
    { phase: "etudes", title: "Ingénierie financière (7 étapes)", status: st("etudes", "doing"), tag: "Finance" },
    { phase: "etudes", title: "Récupération des données essentielles — CEE / MPR Copro", status: st("etudes", "todo"), tag: "CEE" },
    { phase: "etudes", title: "Récupération des données des entreprises", status: st("etudes", "todo") },
    { phase: "etudes", title: "Plans de financement généraux et individuels", status: st("etudes", "todo") },
    { phase: "etudes", title: "Liasse documentaire pour AG", status: st("etudes", "todo"), jalon: "P1c" },
    { phase: "travaux", title: "Dépôt des dossiers des aides", status: st("travaux", "doing"), tag: "CEE", jalon: "P2a" },
    { phase: "travaux", title: "Mobilisation des prêts", status: st("travaux", "doing"), tag: "Éco-PTZ", jalon: "P2b" },
    { phase: "travaux", title: "Suivi de chantier", status: st("travaux", "doing"), due_label: "En cours" },
    { phase: "travaux", title: "Demandes d'acompte", status: st("travaux", "todo") },
    { phase: "travaux", title: "Réception des travaux & levée des réserves", status: "todo" },
    { phase: "travaux", title: "Versement des aides & solde", status: "todo", jalon: "P2c" },
  ];

  return rows.map((row, i) => ({ ...row, position: i }));
}
