// Menu « Gestionnaire » d'une copropriété PPT : désigne le gestionnaire parmi
// les comptes de l'enseigne (feedback Amir 23/09, /ppt puis fiche). Écrit le
// nom et l'e-mail de la fiche ; le trigger ppt_sync_affectation transfère
// l'accès et journalise le changement (onglet Historique de la copropriété).
import { useState } from "react";
import { useMajPptCopro, type PptCopro } from "@/api/ppt";
import { NON_ATTRIBUE, messageTransfert, optionsGestionnaire, patchGestionnaire, valeurActuelle, type GestionnaireActuel, type MembreEnseigne } from "@/lib/ppt/gestionnaires";
import { messageErreur } from "@/lib/erreurs";

type CoproGestion = Pick<PptCopro, "id" | "nom" | "gestionnaire_nom" | "gestionnaire_email">;

/** Menu contrôlé : renvoie les champs à poser, ou rien si le choix ne change rien. */
export function SelectGestionnaire({
  membres,
  actuel,
  onChoisir,
  disabled,
  style,
}: {
  membres: MembreEnseigne[];
  actuel: GestionnaireActuel;
  onChoisir: (patch: GestionnaireActuel) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <select
      className="edit-inp"
      style={{ maxWidth: "none", ...style }}
      title="Gestionnaire en charge : il ouvre le dossier, avec la direction de l'enseigne"
      value={valeurActuelle(actuel)}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        const patch = patchGestionnaire(membres, actuel, e.target.value);
        if (patch) onChoisir(patch);
      }}
    >
      <option value={NON_ATTRIBUE}>Non attribué</option>
      {optionsGestionnaire(membres, actuel).map((o) => (
        <option key={o.valeur} value={o.valeur}>{o.libelle}</option>
      ))}
    </select>
  );
}

/** Menu à enregistrement immédiat, avec confirmation du transfert (file de revue /ppt). */
export function ChoixGestionnaire({ copro, membres, petit, style }: { copro: CoproGestion; membres: MembreEnseigne[]; petit?: boolean; style?: React.CSSProperties }) {
  const maj = useMajPptCopro();
  const [erreur, setErreur] = useState<string | null>(null);

  const choisir = (patch: GestionnaireActuel) => {
    if (!window.confirm(messageTransfert(copro, patch))) return;
    setErreur(null);
    maj.mutate({ id: copro.id, ...patch }, { onError: (e) => setErreur(messageErreur(e, "Enregistrement impossible")) });
  };

  return (
    <>
      <SelectGestionnaire
        membres={membres}
        actuel={copro}
        onChoisir={choisir}
        disabled={maj.isPending}
        style={petit ? { width: 190, maxWidth: 190, fontSize: 12, padding: "4px 8px", ...style } : style}
      />
      {erreur && <span style={{ display: "block", fontSize: 11.5, color: "var(--color-error-700)" }}>{erreur}</span>}
    </>
  );
}
