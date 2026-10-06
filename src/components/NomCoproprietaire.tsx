// Nom d'un copropriétaire corrigeable en un clic (idée d'Amir du 06/10/2026,
// puis « côté syndic aussi ») : un clic sur le nom, dans le tableau des lots de
// l'onglet Données (AMO et syndic), le transforme en champ de saisie. Entrée ou la coche enregistre,
// Échap ou la croix annule ; quitter le champ après une modification
// l'enregistre aussi. Le clic sur le reste de la ligne garde son rôle (vente
// ou succession : changer le propriétaire du lot).
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { messageErreur } from "@/lib/erreurs";
import { LONGUEUR_NOM_COPROPRIETAIRE, verdictNom } from "@/lib/nomCoproprietaire";

export function NomCoproprietaire({ nom, onRenommer }: { nom: string; onRenommer: (nouveau: string) => Promise<unknown> }) {
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState(nom);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // évite un second enregistrement (Entrée puis sortie du champ) et celui d'un champ annulé
  const clos = useRef(false);

  const ouvrir = () => {
    clos.current = false;
    setValeur(nom);
    setErreur(null);
    setEdition(true);
  };

  const fermer = () => {
    clos.current = true;
    setErreur(null);
    setEdition(false);
  };

  const valider = async () => {
    if (clos.current || envoi) return;
    const verdict = verdictNom(valeur, nom);
    if (verdict.etat === "inchange") return fermer();
    if (verdict.etat === "vide") {
      setErreur("Le nom ne peut pas être vide.");
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      await onRenommer(verdict.nom);
      fermer();
    } catch (e) {
      setErreur(messageErreur(e, "Le nom n'a pas pu être modifié. Réessayez."));
    } finally {
      setEnvoi(false);
    }
  };

  if (!edition) {
    return (
      <button
        type="button"
        className="nom-editable"
        title="Corriger l'orthographe de ce nom"
        onClick={(e) => {
          e.stopPropagation();
          ouvrir();
        }}
      >
        {nom}
        <Icon name="edit" size={12} />
      </button>
    );
  }

  return (
    <span className="nom-edition" onClick={(e) => e.stopPropagation()}>
      <span className="ne-champ">
        <input
          className="edit-inp"
          value={valeur}
          autoFocus
          maxLength={LONGUEUR_NOM_COPROPRIETAIRE}
          aria-label="Nom du copropriétaire"
          disabled={envoi}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setValeur(e.target.value);
            setErreur(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void valider();
            } else if (e.key === "Escape") {
              e.preventDefault();
              fermer();
            }
          }}
          onBlur={() => void valider()}
        />
        {/* onMouseDown : le champ garde le focus, la sortie du champ n'enregistre pas avant le clic */}
        <button
          type="button"
          className="icon-btn"
          title="Enregistrer le nom"
          aria-label="Enregistrer le nom"
          disabled={envoi}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void valider()}
        >
          <Icon name="check" size={14} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Annuler"
          aria-label="Annuler la correction"
          disabled={envoi}
          onMouseDown={(e) => e.preventDefault()}
          onClick={fermer}
        >
          <Icon name="x" size={14} />
        </button>
      </span>
      {erreur && <span className="ne-erreur">{erreur}</span>}
    </span>
  );
}
