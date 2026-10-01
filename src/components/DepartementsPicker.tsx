// Choix des départements où une entreprise peut être consultée (0122) :
// « Toute la France » (liste vide en base) ou une liste de départements, avec
// un raccourci pour tout le Grand Est. Partagé entre la fiche Mon entreprise
// (prestataire) et la Base prestataires (AMO).
// `valeur` vaut null pour « Toute la France » ; [] = « Certains départements »
// sans encore de choix (à compléter avant d'enregistrer).
import { Icon } from "@/components/Icon";
import { DEPARTEMENTS, GRAND_EST, nomDepartement, trierDepartements } from "@/lib/departements";

/** Valeur du sélecteur depuis la colonne `departements`. */
export const departementsVersChoix = (departements: readonly string[]): string[] | null =>
  departements.length === 0 ? null : trierDepartements(departements);

/** Colonne `departements` depuis la valeur du sélecteur (null si incomplet). */
export const choixVersDepartements = (choix: string[] | null): string[] | null =>
  choix === null ? [] : choix.length === 0 ? null : trierDepartements(choix);

export function DepartementsPicker({
  valeur,
  onChange,
}: {
  valeur: string[] | null;
  onChange: (v: string[] | null) => void;
}) {
  const partout = valeur === null;
  const choisis = valeur ?? [];
  const restants = DEPARTEMENTS.filter((d) => !choisis.includes(d.code));
  const grandEstManquant = GRAND_EST.some((c) => !choisis.includes(c));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="cs-type-pick">
        <button type="button" className={"cs-type-opt" + (partout ? " on" : "")} onClick={() => onChange(null)}>
          <Icon name="mapPin" size={15} />
          Toute la France
        </button>
        <button
          type="button"
          className={"cs-type-opt" + (!partout ? " on" : "")}
          onClick={() => {
            if (partout) onChange([]);
          }}
        >
          <Icon name="mapPin" size={15} />
          Certains départements
        </button>
      </div>

      {!partout && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {choisis.map((code) => (
              <span key={code} className="cs-type" style={{ paddingRight: 5 }}>
                {code} {nomDepartement(code)}
                <button
                  type="button"
                  title={"Retirer " + nomDepartement(code)}
                  onClick={() => onChange(choisis.filter((c) => c !== code))}
                  style={{ border: "none", background: "none", padding: 2, cursor: "pointer", color: "inherit", display: "inline-flex" }}
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
            {choisis.length === 0 && (
              <span className="se-small" style={{ color: "var(--color-warning-700, #8a5a00)" }}>
                Choisissez au moins un département.
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              className="edit-sel"
              value=""
              aria-label="Ajouter un département"
              onChange={(e) => {
                if (e.target.value) onChange(trierDepartements([...choisis, e.target.value]));
              }}
            >
              <option value="">Ajouter un département…</option>
              {restants.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} - {d.nom}
                </option>
              ))}
            </select>
            {grandEstManquant && (
              <button
                type="button"
                className="se-btn se-btn-ghost btn-sm"
                onClick={() => onChange(trierDepartements([...choisis, ...GRAND_EST]))}
              >
                <Icon name="plus" size={14} />
                Tout le Grand Est
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
