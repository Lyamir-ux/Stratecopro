// Menu « Gestionnaire » d'une copropriété PPT : désigne le gestionnaire parmi
// les comptes de l'enseigne (feedback Amir 23/09, /ppt). Écrit le nom et
// l'e-mail de la fiche ; le trigger ppt_sync_affectation transfère l'accès et
// journalise le changement (onglet Historique de la copropriété).
import { useState } from "react";
import { useMajPptCopro, type PptCopro } from "@/api/ppt";
import { NON_ATTRIBUE, optionsGestionnaire, patchGestionnaire, valeurActuelle, type MembreEnseigne } from "@/lib/ppt/gestionnaires";

type CoproGestion = Pick<PptCopro, "id" | "nom" | "gestionnaire_nom" | "gestionnaire_email">;

export function ChoixGestionnaire({ copro, membres, petit, style }: { copro: CoproGestion; membres: MembreEnseigne[]; petit?: boolean; style?: React.CSSProperties }) {
  const maj = useMajPptCopro();
  const [erreur, setErreur] = useState<string | null>(null);
  const options = optionsGestionnaire(membres, copro);

  const choisir = (valeur: string) => {
    const patch = patchGestionnaire(membres, copro, valeur);
    if (!patch) return;
    const ancien = copro.gestionnaire_nom?.trim() || copro.gestionnaire_email;
    const message = patch.gestionnaire_nom
      ? `Confier « ${copro.nom} » à ${patch.gestionnaire_nom} ?${ancien ? ` ${ancien} n'y aura plus accès.` : ""} L'historique est conservé.`
      : `Retirer ${ancien ?? "le gestionnaire"} de « ${copro.nom} » ? Seule la direction de l'enseigne y aura accès.`;
    if (!window.confirm(message)) return;
    setErreur(null);
    maj.mutate({ id: copro.id, ...patch }, { onError: (e) => setErreur(e instanceof Error ? e.message : "Enregistrement impossible") });
  };

  return (
    <>
      <select
        className="edit-inp"
        style={petit ? { width: 190, maxWidth: 190, fontSize: 12, padding: "4px 8px", ...style } : { maxWidth: "none", ...style }}
        title="Gestionnaire en charge : il ouvre le dossier, avec la direction de l'enseigne"
        value={valeurActuelle(copro)}
        disabled={maj.isPending}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          choisir(e.target.value);
        }}
      >
        <option value={NON_ATTRIBUE}>Non attribué</option>
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>{o.libelle}</option>
        ))}
      </select>
      {erreur && <span style={{ display: "block", fontSize: 11.5, color: "var(--color-error-700)" }}>{erreur}</span>}
    </>
  );
}
