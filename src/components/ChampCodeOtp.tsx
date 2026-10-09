// Champ du code de signature (6 chiffres), commun aux parcours de signature :
// portail (bulletin et mandat SEPA), liens des cosignataires, documents éco-PTZ,
// fiche État ANAH. Pas de maxLength (voir lib/codeOtp.ts) ; tant que le code est
// incomplet, le nombre de chiffres manquants est affiché : le bouton de signature
// reste désactivé jusque-là.
import { extraireCodeOtp, LONGUEUR_CODE_OTP } from "@/lib/codeOtp";

export function ChampCodeOtp({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (code: string) => void;
  /** Petit champ dans une ligne de boutons (fiche État ANAH). */
  compact?: boolean;
}) {
  const manque = LONGUEUR_CODE_OTP - value.length;
  const reste =
    value.length > 0 && manque > 0
      ? `Encore ${manque} chiffre${manque > 1 ? "s" : ""} : le code en compte ${LONGUEUR_CODE_OTP}.`
      : null;
  return (
    <>
      <input
        className={compact ? "edit-inp" : undefined}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Code de signature à 6 chiffres"
        placeholder={compact ? "6 chiffres" : "______"}
        value={value}
        onChange={(e) => onChange(extraireCodeOtp(e.target.value))}
        style={
          compact
            ? { width: 120, letterSpacing: 4 }
            : {
                width: "100%",
                fontSize: 30,
                letterSpacing: 14,
                textAlign: "center",
                padding: "10px 0",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
              }
        }
      />
      {reste &&
        (compact ? (
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>{reste}</span>
        ) : (
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: "6px 0 0" }}>{reste}</p>
        ))}
    </>
  );
}
