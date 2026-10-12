// Mentions de prudence affichées sous les montants simulés du portail
// (quotes-parts, financement) et reprises dans l'export PDF.
import { Icon } from "@/components/Icon";
import type { EtatAidesPortail } from "@/api/portail";

export const MENTIONS_PRUDENCE = [
  "Les montants affichés sont estimatifs : ils sont établis d'après les informations transmises par la banque et les organismes financeurs, et restent susceptibles d'évoluer jusqu'à la validation définitive des dossiers.",
  "Ce document ne constitue ni un accord de crédit ni une offre de prêt : seule la banque peut arrêter les montants et conditions définitifs.",
  "Un crédit vous engage et doit être remboursé. Vérifiez vos capacités de remboursement avant de vous engager.",
];

export const TEXTE_RESTE_APPROXIMATIF = "Reste à charge approximatif tant que les aides ne sont pas notifiées";

export function MentionsPrudence() {
  return (
    <div className="mentions-prudence">
      <p>{MENTIONS_PRUDENCE[0]} {MENTIONS_PRUDENCE[1]}</p>
      <p className="mp-credit">{MENTIONS_PRUDENCE[2]}</p>
    </div>
  );
}

/**
 * En tête des montants, tant que les aides du plan publié ne sont pas toutes
 * notifiées (demande d'Amir du 12/10/2026) : en grand et en gras, le reste à
 * charge affiché repose sur des estimations.
 */
export function BandeauResteApproximatif({ etat }: { etat: EtatAidesPortail | null }) {
  if (!etat?.approximatif) return null;
  return (
    <div className="bandeau-approximatif" role="note">
      <Icon name="alert" size={28} className="ico" />
      <div>
        <div className="ba-titre">{TEXTE_RESTE_APPROXIMATIF}</div>
        <div className="ba-sub">
          Les montants des aides sont pour l'instant des estimations. Votre reste à charge sera recalculé avec les
          montants notifiés par les financeurs (ANAH, collectivités…)
          {etat.notifiees > 0
            ? ` : ${etat.notifiees} aide${etat.notifiees > 1 ? "s" : ""} sur ${etat.attendues} déjà notifiée${etat.notifiees > 1 ? "s" : ""}.`
            : "."}
        </div>
      </div>
    </div>
  );
}
