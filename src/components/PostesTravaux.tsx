// Tableau des postes de travaux envisagés d'une consultation (idée de Louis du
// 13/10/2026) : complété par l'équipe à la publication, en plus du budget
// estimatif, et lu tel quel par les candidats. Le tableau d'édition garde
// toujours une ligne à compléter ; les lignes sans poste ne sont jamais
// enregistrées (postesAEnregistrer).
import {
  POSTES_SUGGERES,
  posteVide,
  totalPostesTravaux,
  type PosteTravaux,
} from "@/api/consultations";
import { fmtEuro } from "@/lib/format";
import { ChampNombre } from "@/components/ChampNombre";
import { Icon } from "@/components/Icon";

export function PostesTravauxEditeur({
  postes,
  onChange,
}: {
  postes: PosteTravaux[];
  onChange: (postes: PosteTravaux[]) => void;
}) {
  const lignes = postes.length > 0 ? postes : [posteVide()];
  const maj = (i: number, patch: Partial<PosteTravaux>) =>
    onChange(lignes.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const retirer = (i: number) => onChange(lignes.filter((_, j) => j !== i));
  const dejaSaisis = new Set(lignes.map((l) => l.poste.trim().toLowerCase()));
  const suggestions = POSTES_SUGGERES.filter((s) => !dejaSaisis.has(s.toLowerCase()));
  // une suggestion remplit la première ligne vide plutôt que d'en ajouter une
  const ajouterSuggestion = (poste: string) => {
    const vide = lignes.findIndex((l) => !l.poste.trim() && l.montant == null && !l.precisions.trim());
    if (vide >= 0) maj(vide, { poste });
    else onChange([...lignes, { ...posteVide(), poste }]);
  };
  const total = totalPostesTravaux(lignes);

  return (
    <div className="cs-postes">
      <div style={{ overflowX: "auto" }}>
        <table className="cs-postes-tab">
          <thead>
            <tr>
              <th>Poste de travaux</th>
              <th style={{ width: 150 }}>Estimation (€ HT)</th>
              <th>Précisions</th>
              <th style={{ width: 34 }}></th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="edit-inp"
                    style={{ maxWidth: "none" }}
                    value={l.poste}
                    placeholder="Ex. isolation des façades"
                    aria-label={`Poste de travaux ${i + 1}`}
                    onChange={(e) => maj(i, { poste: e.target.value })}
                  />
                </td>
                <td>
                  <ChampNombre
                    value={l.montant ?? undefined}
                    placeholder="optionnel"
                    title="Estimation du poste en € HT, si vous l'avez"
                    onChange={(n) => maj(i, { montant: n ?? null })}
                  />
                </td>
                <td>
                  <input
                    className="edit-inp"
                    style={{ maxWidth: "none" }}
                    value={l.precisions}
                    placeholder="Bâtiments concernés, contraintes…"
                    aria-label={`Précisions du poste ${i + 1}`}
                    onChange={(e) => maj(i, { precisions: e.target.value })}
                  />
                </td>
                <td>
                  <button className="icon-btn" title="Retirer ce poste" onClick={() => retirer(i)} style={{ width: 28, height: 28 }}>
                    <Icon name="trash" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {total != null && (
            <tfoot>
              <tr>
                <td style={{ textAlign: "right", fontWeight: 600 }}>Total des postes chiffrés</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{fmtEuro(total)} HT</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 10 }}>
        <button
          className="se-btn se-btn-secondary btn-sm"
          onClick={() => onChange([...lignes, posteVide()])}
        >
          <Icon name="plus" size={14} />
          Ajouter un poste
        </button>
        {suggestions.length > 0 && <span className="se-small" style={{ color: "var(--fg-muted)", marginLeft: 6 }}>ou :</span>}
        {suggestions.map((s) => (
          <button key={s} className="cs-type-opt" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => ajouterSuggestion(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Tableau en lecture seule : fiche de la consultation côté équipe et côté candidat. */
export function PostesTravauxTableau({ postes, ouvert }: { postes: PosteTravaux[]; ouvert?: boolean }) {
  if (postes.length === 0) return null;
  const total = totalPostesTravaux(postes);
  const avecMontant = total != null;
  const avecPrecisions = postes.some((p) => p.precisions);
  return (
    <details className="cs-postes-lecture" open={ouvert}>
      <summary>
        <Icon name="hammer" size={13} />
        Postes de travaux envisagés ({postes.length})
        {avecMontant && <span className="cs-postes-total"> · {fmtEuro(total)} HT chiffrés</span>}
      </summary>
      <div style={{ overflowX: "auto" }}>
        <table className="cs-postes-tab cs-postes-ro">
          <thead>
            <tr>
              <th>Poste</th>
              {avecMontant && <th style={{ textAlign: "right" }}>Estimation HT</th>}
              {avecPrecisions && <th>Précisions</th>}
            </tr>
          </thead>
          <tbody>
            {postes.map((p, i) => (
              <tr key={i}>
                <td>{p.poste}</td>
                {avecMontant && <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{p.montant != null ? fmtEuro(p.montant) : "-"}</td>}
                {avecPrecisions && <td>{p.precisions || "-"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
