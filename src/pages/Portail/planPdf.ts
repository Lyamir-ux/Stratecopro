// Téléchargement du plan de financement individuel (PDF) depuis le portail :
// « Mes quotes-parts » et l'Accueil (idée d'Amir du 05/10/2026) partagent la
// même génération. Le générateur pdf-lib n'est chargé qu'au clic.
import type { PlanIndividuelPdfInput } from "@/lib/pdf/planIndividuel";

export function nomFichierPlanIndividuel(input: Pick<PlanIndividuelPdfInput, "membership">): string {
  const { membership } = input;
  return `Plan de financement - ${membership.nom} - ${membership.copro.name}.pdf`.replace(/[\\/:*?"<>|]/g, " ");
}

export async function telechargerPlanIndividuelPdf(input: PlanIndividuelPdfInput): Promise<void> {
  const { genererPlanIndividuelPdf, telechargerPdfBytes } = await import("@/lib/pdf/planIndividuel");
  telechargerPdfBytes(await genererPlanIndividuelPdf(input), nomFichierPlanIndividuel(input));
}
