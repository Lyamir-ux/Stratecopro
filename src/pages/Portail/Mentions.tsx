// Mentions de prudence affichées sous les montants simulés du portail
// (quotes-parts, financement) et reprises dans l'export PDF.
export const MENTIONS_PRUDENCE = [
  "Les montants affichés sont estimatifs : ils sont établis d'après les informations transmises par la banque et les organismes financeurs, et restent susceptibles d'évoluer jusqu'à la validation définitive des dossiers.",
  "Ce document ne constitue ni un accord de crédit ni une offre de prêt : seule la banque peut arrêter les montants et conditions définitifs.",
  "Un crédit vous engage et doit être remboursé. Vérifiez vos capacités de remboursement avant de vous engager.",
];

export function MentionsPrudence() {
  return (
    <div className="mentions-prudence">
      <p>{MENTIONS_PRUDENCE[0]} {MENTIONS_PRUDENCE[1]}</p>
      <p className="mp-credit">{MENTIONS_PRUDENCE[2]}</p>
    </div>
  );
}
