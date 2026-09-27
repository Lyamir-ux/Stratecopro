// Adresses en copie d'une entreprise (0106) : autant de lignes que voulu,
// chacune supprimable, « Ajouter un e-mail » en dessous. Partagé entre la Base
// prestataires (AMO) et la fiche Mon entreprise (prestataire).
import { Icon } from "@/components/Icon";
import { emailValide } from "@/api/prestataires";

export function EmailsSecondaires({
  valeurs,
  onChange,
}: {
  valeurs: string[];
  onChange: (v: string[]) => void;
}) {
  const maj = (i: number, v: string) => onChange(valeurs.map((x, j) => (j === i ? v : x)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {valeurs.map((v, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            className="edit-inp"
            style={{
              maxWidth: "none",
              flex: 1,
              borderColor: v.trim() && !emailValide(v) ? "var(--color-error-500)" : undefined,
            }}
            type="email"
            value={v}
            placeholder="secretariat@entreprise.fr"
            // nouvelle ligne : le curseur y va directement
            autoFocus={i === valeurs.length - 1 && !v}
            onChange={(e) => maj(i, e.target.value)}
          />
          <button
            type="button"
            className="icon-btn"
            style={{ width: 30, height: 30, flex: "none" }}
            title="Retirer cette adresse"
            onClick={() => onChange(valeurs.filter((_, j) => j !== i))}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="se-btn se-btn-ghost btn-sm"
        style={{ alignSelf: "flex-start" }}
        onClick={() => onChange([...valeurs, ""])}
      >
        <Icon name="plus" size={14} />
        Ajouter un e-mail
      </button>
    </div>
  );
}
