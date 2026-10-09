// Champs de saisie guidée du dossier d'adhésion au prêt (retours de A CHELGHAM et de
// Cyrielle KLEIN, 09/10/2026) : code postal qui propose la ville, dates choisies
// dans un calendrier, IBAN regroupé par blocs de 4 et BIC en majuscules.
// Partagés par le formulaire principal et les cosignataires.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useCommunesDuCodePostal } from "@/api/geo";
import {
  composerDateLieu,
  dateFrVersIso,
  dateIsoVersFr,
  decouperDateLieu,
  formaterBic,
  formaterIban,
  positionCurseur,
  type Diagnostic,
} from "@/lib/saisie";

function Champ({ label, children, span }: { label: string; children: ReactNode; span?: boolean }) {
  return (
    <div className="fld" style={span ? { gridColumn: "1 / -1" } : undefined}>
      <label>{label}</label>
      {children}
    </div>
  );
}

/** Date du jour au format d'un champ date (jour local, pas UTC). */
export function aujourdhuiIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Code postal puis ville : dès que le code postal est complet, la ville est proposée
 *  (une seule commune : remplie ; plusieurs : liste de suggestions). Une ville saisie à
 *  la main n'est jamais écrasée. */
export function CpVilleFields({
  cp,
  ville,
  onChange,
  requis = false,
}: {
  cp: string;
  ville: string;
  onChange: (patch: { cp?: string; ville?: string }) => void;
  requis?: boolean;
}) {
  const idListe = useId();
  const { data: communes } = useCommunesDuCodePostal(cp);
  // ville posée automatiquement : la seule que l'on remplace quand le code postal change
  const auto = useRef<string | null>(null);
  const dernier = useRef({ ville, onChange });
  dernier.current = { ville, onChange };

  useEffect(() => {
    if (!communes?.length) return;
    const { ville: actuelle, onChange: modifier } = dernier.current;
    const libre = !actuelle.trim() || actuelle === auto.current;
    if (!libre) return;
    if (communes.length === 1) {
      if (actuelle !== communes[0]) {
        auto.current = communes[0];
        modifier({ ville: communes[0] });
      }
    } else if (actuelle && !communes.includes(actuelle)) {
      // ancienne ville proposée pour un autre code postal : à choisir de nouveau
      auto.current = null;
      modifier({ ville: "" });
    }
  }, [communes]);

  const plusieurs = (communes?.length ?? 0) > 1;
  return (
    <>
      <Champ label={`Code postal${requis ? " *" : ""}`}>
        <input
          inputMode="numeric"
          autoComplete="postal-code"
          value={cp}
          onChange={(e) => onChange({ cp: e.target.value.replace(/\D/g, "").slice(0, 5) })}
        />
      </Champ>
      <Champ label={`Ville${requis ? " *" : ""}`}>
        <input
          autoComplete="address-level2"
          list={plusieurs ? idListe : undefined}
          value={ville}
          onChange={(e) => onChange({ ville: e.target.value })}
        />
        {plusieurs && (
          <>
            <datalist id={idListe}>
              {communes!.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {!ville.trim() && <span className="hint">Plusieurs communes pour ce code postal : choisissez dans la liste.</span>}
          </>
        )}
      </Champ>
    </>
  );
}

/** Champ date (calendrier du navigateur) ; la valeur reste au format imprimé sur le
 *  bulletin, « 01/09/2015 ». */
export function ChampDate({
  valeur,
  onChange,
  min,
  max,
}: {
  valeur: string;
  onChange: (fr: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <input
      type="date"
      value={dateFrVersIso(valeur)}
      min={min}
      max={max ?? aujourdhuiIso()}
      onChange={(e) => onChange(dateIsoVersFr(e.target.value))}
    />
  );
}

/** Date puis lieu de naissance : deux champs, une seule chaîne dans le dossier
 *  (« 12/05/1980 à Colmar », la case unique du bulletin). */
export function ChampsNaissance({
  valeur,
  onChange,
  requis = false,
}: {
  valeur: string;
  onChange: (v: string) => void;
  requis?: boolean;
}) {
  const { dateIso, lieu } = decouperDateLieu(valeur);
  return (
    <>
      <Champ label={`Date de naissance${requis ? " *" : ""}`}>
        <input
          type="date"
          value={dateIso}
          min="1900-01-01"
          max={aujourdhuiIso()}
          onChange={(e) => onChange(composerDateLieu(e.target.value, lieu))}
        />
      </Champ>
      <Champ label={`Lieu de naissance${requis ? " *" : ""}`}>
        <input
          placeholder="Commune de naissance"
          value={lieu}
          onChange={(e) => onChange(composerDateLieu(dateIso, e.target.value))}
        />
      </Champ>
    </>
  );
}

/** IBAN : majuscules et blocs de 4 séparés par une espace pendant la frappe. */
export function ChampIban({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input
      ref={ref}
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      placeholder="FR76 1234 5678 9012 3456 7890 123"
      value={value}
      onChange={(e) => {
        const saisi = e.target.value;
        const avant = saisi.slice(0, e.target.selectionStart ?? saisi.length).replace(/[^A-Za-z0-9]/g, "").length;
        const formate = formaterIban(saisi);
        onChange(formate);
        // le curseur reste au même caractère malgré les espaces insérés
        requestAnimationFrame(() => {
          const pos = positionCurseur(formate, avant);
          if (ref.current && document.activeElement === ref.current) ref.current.setSelectionRange(pos, pos);
        });
      }}
    />
  );
}

/** BIC : majuscules, sans espace, 11 caractères au plus. */
export function ChampBic({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      placeholder="CEPAFRPP513"
      value={value}
      onChange={(e) => onChange(formaterBic(e.target.value))}
    />
  );
}

/** Message de retour de saisie (null : rien à afficher). */
export function MessageSaisie({ diagnostic }: { diagnostic: Diagnostic | null }) {
  if (!diagnostic) return null;
  return (
    <p
      className="se-small"
      style={{ color: diagnostic.niveau === "erreur" ? "var(--color-error-700)" : "var(--fg-muted)", margin: "6px 0 0" }}
    >
      {diagnostic.message}
    </p>
  );
}
