// Fenêtre de génération du rapport d'enquête sociale (PDF), ouverte depuis
// l'onglet Enquête et l'onglet Copropriétaires : observations du chef de
// projet (facultatives, gardées d'une génération à l'autre), PDF, et accès au
// classeur Excel du détail des réponses.
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { MAX_OBSERVATIONS_RAPPORT, type GenerationRapportEnquete } from "@/api/rapportEnquete";

export function RapportEnqueteDialog({ rapport, onClose }: { rapport: GenerationRapportEnquete; onClose: () => void }) {
  const [observations, setObservations] = useState(rapport.observations);
  const modifie = observations !== rapport.observations;
  const fermer = rapport.enCours ? () => {} : onClose;

  const generer = async () => {
    if (await rapport.generer(observations)) onClose();
  };

  return (
    <Modal title="Rapport d'enquête sociale" onClose={fermer} width={640} closeOnBackdrop={!modifie && !rapport.enCours}>
      <p className="se-body" style={{ marginTop: 0 }}>Le PDF reprend, avec le logo Strat Eco :</p>
      <ul className="se-small" style={{ marginTop: 0, paddingLeft: 18, color: "var(--fg2)" }}>
        <li>une page de synthèse : chiffres clés, propriétaires occupants et leur profil de ressources Anah, occupation des logements, ménages, points de vigilance et avis sur les travaux ;</li>
        <li>le détail chiffré en tableaux, par bâtiment ;</li>
        <li>vos observations ci-dessous, si vous en saisissez ;</li>
        <li>en annexe, la liste nominative des propriétaires occupants.</li>
      </ul>
      <div className="mail-champ">
        <label htmlFor="rapport-observations">Observations de l'assistant à maîtrise d'ouvrage (facultatif)</label>
        <textarea
          id="rapport-observations"
          rows={6}
          value={observations}
          maxLength={MAX_OBSERVATIONS_RAPPORT}
          placeholder="Par exemple : ménages à accompagner en priorité, situations à traiter avec le syndic avant l'assemblée générale…"
          onChange={(e) => setObservations(e.target.value)}
        />
        <span className="hint">
          Laissez une ligne vide entre deux paragraphes. {observations.length} / {MAX_OBSERVATIONS_RAPPORT} caractères, gardés pour la prochaine génération.
        </span>
      </div>
      <p className="se-small" style={{ color: "var(--fg-muted)" }}>
        La génération met aussi à jour l'occupation reportée dans la fiche « État de la copropriété » du dossier ANAH.
      </p>
      {rapport.erreur && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{rapport.erreur}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        <button
          className="se-btn se-btn-ghost btn-sm"
          onClick={rapport.exporterDetail}
          disabled={!rapport.pret || rapport.enCours}
          title="Classeur Excel : réponses détaillées par copropriétaire et par lot"
        >
          <Icon name="table" size={14} />
          Détail des réponses (Excel)
        </button>
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-ghost btn-sm" onClick={fermer} disabled={rapport.enCours}>
          Annuler
        </button>
        <button className="se-btn se-btn-primary btn-sm" onClick={() => void generer()} disabled={!rapport.pret || rapport.enCours}>
          <Icon name="download" size={14} />
          {rapport.enCours ? "Génération…" : "Générer le PDF"}
        </button>
      </div>
    </Modal>
  );
}
