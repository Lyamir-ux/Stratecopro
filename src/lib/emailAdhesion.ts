// E-mails de la campagne d'adhésion au prêt collectif (retours d'Amir du 11/10/2026) : l'e-mail
// d'ouverture, envoyé aux copropriétaires quand la cheffe de projet ouvre les adhésions sur le
// portail, et la dernière relance, qui propose une deuxième date limite. Objet et message sont
// proposés puis modifiables avant l'envoi ; la formule d'appel, le bouton d'accès, la phrase de
// contact et la signature sont ajoutés par l'edge function creer-espace-coproprietaire (mode
// financement). Même principe que src/lib/emailEnquete.ts.
import { dateEnLettres } from "./emailEnquete";

export const sujetOuvertureParDefaut = (copro: string) => `Choisissez votre mode de financement - ${copro}`;

export function messageOuvertureParDefaut(
  copro: string,
  limiteAdhesion: string | null,
  limiteChoix: string | null
): string {
  const adhesion = dateEnLettres(limiteAdhesion);
  const choix = dateEnLettres(limiteChoix);
  return (
    `Le financement des travaux de votre copropriété ${copro} est ouvert : vous pouvez dès maintenant choisir ` +
    "votre mode de financement depuis votre espace copropriétaire, rubrique « Mon financement » : prêt collectif, " +
    "éco-PTZ individuel ou fonds propres.\n\n" +
    "Le choix du financement s'ouvre une fois l'enquête sociale et technique transmise : si vous ne l'avez pas " +
    "encore complétée, commencez par là.\n\n" +
    "Si vous choisissez le prêt collectif, vous remplirez ensuite votre bulletin d'adhésion et votre mandat de " +
    "prélèvement SEPA, signés électroniquement depuis votre espace : rien à imprimer ni à envoyer par courrier. " +
    (adhesion
      ? `La date limite pour déposer votre adhésion au prêt collectif est le ${adhesion}. `
      : "") +
    "L'éco-PTZ individuel et le financement sur fonds propres ne sont pas soumis à cette date limite" +
    (choix ? `, mais votre choix reste modifiable jusqu'au ${choix}.` : ".")
  );
}

export const sujetRelanceParDefaut = (copro: string) => `Dernier rappel : adhésion au prêt collectif - ${copro}`;

export function messageRelanceParDefaut(copro: string, nouvelleLimite: string | null): string {
  const date = dateEnLettres(nouvelleLimite) ?? "[nouvelle date limite]";
  return (
    `Vous n'avez pas encore déposé votre adhésion au prêt collectif pour votre copropriété ${copro}.\n\n` +
    `La date limite est repoussée une dernière fois au ${date} : votre bulletin d'adhésion et votre mandat de ` +
    "prélèvement SEPA, à signer en ligne depuis votre espace copropriétaire, doivent être déposés avant cette " +
    "date. Passé ce jour, il ne sera plus possible d'ouvrir un dossier d'adhésion.\n\n" +
    "Si vous avez choisi l'éco-PTZ individuel ou les fonds propres, vous n'êtes pas concerné par cette date limite."
  );
}

/** Fiche de l'écran AMO, avec ce qu'il faut pour décider qui relancer. */
export interface FicheRelance {
  id: string;
  nom: string;
  email: string | null;
  sortant_le: string | null;
}

/**
 * Fiches à relancer pour l'adhésion au prêt collectif : ni celles dont le dossier est déjà déposé, ni
 * celles qui ont choisi l'éco-PTZ individuel ou les fonds propres (pas concernées par la date limite).
 * Restent celles qui ont choisi le prêt collectif sans avoir déposé leur dossier, et celles qui n'ont
 * encore rien choisi.
 */
export function fichesARelancer<T extends { id: string; sortant_le: string | null }>(
  fiches: readonly T[],
  choixParFiche: ReadonlyMap<string, string>,
  deposees: ReadonlySet<string>
): T[] {
  return fiches.filter((f) => {
    if (f.sortant_le || deposees.has(f.id)) return false;
    const choix = choixParFiche.get(f.id);
    return choix === undefined || choix === "collectif";
  });
}
