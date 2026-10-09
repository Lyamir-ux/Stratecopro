// Adresse e-mail d'un copropriétaire modifiable en un clic (bug d'Amir du 08/10/2026,
// « comme le nom de copropriétaire »), colonne « Mail » de l'onglet Données (AMO).
// Même geste que NomCoproprietaire : un clic sur l'adresse la transforme en champ ; Entrée
// ou la coche enregistre, Échap ou la croix annule, quitter le champ après une modification
// enregistre aussi. Champ vide = adresse effacée (refusé par le serveur si l'espace est
// ouvert). Quand la fiche n'a pas d'adresse, « Ajouter » ouvre le même champ. Le clic ne
// remonte pas à la ligne (qui ouvre le changement de propriétaire du lot).
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { messageErreur } from "@/lib/erreurs";
import {
  LONGUEUR_EMAIL_COPROPRIETAIRE,
  noteApresChangement,
  verdictEmail,
  type EtatCompteEmail,
} from "@/lib/emailCoproprietaire";

export interface BilanEmail {
  compte: EtatCompteEmail;
  autres_fiches: number;
  compte_nom?: string | null;
}

/** Durée d'affichage de la note qui suit un changement (le sort du compte du portail). */
const DUREE_NOTE_MS = 12000;

export function EmailCoproprietaire({
  email,
  onModifier,
}: {
  email: string | null;
  onModifier: (nouveau: string | null) => Promise<BilanEmail>;
}) {
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState(email ?? "");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // évite un second enregistrement (Entrée puis sortie du champ) et celui d'un champ annulé
  const clos = useRef(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    []
  );

  const ouvrir = () => {
    clos.current = false;
    setValeur(email ?? "");
    setErreur(null);
    setNote(null);
    setEdition(true);
  };

  const fermer = () => {
    clos.current = true;
    setErreur(null);
    setEdition(false);
  };

  const valider = async () => {
    if (clos.current || envoi) return;
    const verdict = verdictEmail(valeur, email);
    if (verdict.etat === "inchange") return fermer();
    if (verdict.etat === "invalide") {
      setErreur("Adresse e-mail invalide (exemple : nom@exemple.fr).");
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const bilan = await onModifier(verdict.email);
      fermer();
      const phrase = noteApresChangement(bilan.compte, bilan.autres_fiches, bilan.compte_nom);
      setNote(phrase);
      if (minuteur.current) clearTimeout(minuteur.current);
      if (phrase) minuteur.current = setTimeout(() => setNote(null), DUREE_NOTE_MS);
    } catch (e) {
      setErreur(messageErreur(e, "L'adresse n'a pas pu être modifiée. Réessayez."));
    } finally {
      setEnvoi(false);
    }
  };

  if (!edition) {
    return (
      <span className="nom-edition">
        <button
          type="button"
          className="nom-editable email-editable"
          title={email ? "Corriger cette adresse e-mail" : "Ajouter une adresse e-mail"}
          onClick={(e) => {
            e.stopPropagation();
            ouvrir();
          }}
        >
          {email ? <span className="ee-texte">{email}</span> : <span className="ee-vide">Ajouter</span>}
          <Icon name="edit" size={12} />
        </button>
        {note && (
          <span className="ne-info" onClick={(e) => e.stopPropagation()}>
            {note}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="nom-edition email-edition" onClick={(e) => e.stopPropagation()}>
      <span className="ne-champ">
        <input
          className="edit-inp"
          type="text"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          value={valeur}
          autoFocus
          maxLength={LONGUEUR_EMAIL_COPROPRIETAIRE}
          placeholder="nom@exemple.fr"
          aria-label="Adresse e-mail du copropriétaire"
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
          title="Enregistrer l'adresse"
          aria-label="Enregistrer l'adresse"
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
