// Saisie de la pièce d'identité d'un signataire : type de pièce, puis recto et
// verso dans deux champs distincts (le passeport n'a qu'une page à fournir).
// Partagé par le dossier d'adhésion du portail et la page publique du
// cosignataire ; l'assemblage en un seul fichier est dans lib/pdf/pieceIdentite.
import { Icon } from "./Icon";
import { useGlisserDeposer } from "./useGlisserDeposer";
import { libellesFaces, TYPES_PIECE_IDENTITE, versoRequis } from "@/lib/pdf/pieceIdentite";

const ACCEPT = "image/jpeg,image/png,application/pdf";

function Face({
  label,
  fichier,
  onChange,
}: {
  label: string;
  fichier: File | null;
  onChange: (f: File | null) => void;
}) {
  // le fichier peut aussi être glissé sur le champ (retour du 09/10/2026)
  const { survol, props } = useGlisserDeposer(onChange);
  return (
    <div className={"fld champ-depot" + (survol ? " survol" : "")} {...props}>
      <label>{label} *</label>
      <input type="file" accept={ACCEPT} onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      {fichier && (
        <span className="hint" style={{ display: "flex", alignItems: "center", gap: 6, wordBreak: "break-all" }}>
          <Icon name="checkCircle" size={14} style={{ color: "var(--color-success-500)", flex: "none" }} />
          {fichier.name}
        </span>
      )}
    </div>
  );
}

export function PieceIdentiteChamps({
  type,
  onType,
  recto,
  verso,
  onRecto,
  onVerso,
}: {
  type: string;
  onType: (t: string) => void;
  recto: File | null;
  verso: File | null;
  onRecto: (f: File | null) => void;
  onVerso: (f: File | null) => void;
}) {
  const faces = libellesFaces(type);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="fld">
        <label>Type de pièce</label>
        <select value={type} onChange={(e) => onType(e.target.value)}>
          {TYPES_PIECE_IDENTITE.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>
      <Face label={faces.recto} fichier={recto} onChange={onRecto} />
      {versoRequis(type) && faces.verso && <Face label={faces.verso} fichier={verso} onChange={onVerso} />}
      <span className="hint" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
        JPG, PNG ou PDF, 10 Mo maximum par fichier. Vous pouvez aussi glisser le fichier sur le champ.
      </span>
    </div>
  );
}
