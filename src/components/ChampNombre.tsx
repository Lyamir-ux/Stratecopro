// Champ de saisie d'un nombre qui accepte la virgule comme le point (bug d'Amir du
// 13/10/2026 : un champ type="number" refuse le point en navigateur français).
// Le texte tapé est conservé tel quel pendant la frappe (« 12, » reste « 12, ») ;
// il est remis en forme à la sortie du champ.
import { useState, type CSSProperties } from "react";
import { formaterNombreSaisi, lireNombreSaisi, nettoyerSaisieNombre } from "@/lib/nombre";

export function ChampNombre({
  value,
  onChange,
  width,
  placeholder,
  title,
  align = "right",
}: {
  /** undefined = champ vide. */
  value: number | undefined;
  /** undefined quand le champ est vidé ; jamais appelé pour une saisie incomplète (« - »). */
  onChange: (n: number | undefined) => void;
  /** Largeur en px ; par défaut, remplit la colonne. */
  width?: number;
  placeholder?: string;
  title?: string;
  align?: CSSProperties["textAlign"];
}) {
  const [texte, setTexte] = useState(() => formaterNombreSaisi(value));
  const [enSaisie, setEnSaisie] = useState(false);
  const [valeurVue, setValeurVue] = useState(value);

  // Valeur modifiée ailleurs (import, recalcul) : le champ la suit tout de suite, sauf pendant la frappe.
  if (value !== valeurVue) {
    setValeurVue(value);
    if (!enSaisie) setTexte(formaterNombreSaisi(value));
  }

  return (
    <input
      className="edit-inp"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      title={title}
      style={{ width: width ?? "100%", textAlign: align }}
      value={texte}
      onFocus={() => setEnSaisie(true)}
      onBlur={() => {
        setEnSaisie(false);
        setTexte(formaterNombreSaisi(value));
      }}
      onChange={(e) => {
        const t = nettoyerSaisieNombre(e.target.value);
        setTexte(t);
        if (t.trim() === "") return onChange(undefined);
        const n = lireNombreSaisi(t);
        if (n != null) onChange(n);
      }}
    />
  );
}
