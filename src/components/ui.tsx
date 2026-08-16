// Briques d'UI partagées — portées depuis design-reference/project/components.jsx
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { DPE, TEAM_FALLBACK, type DpeClass, type PhaseId } from "@/lib/referentiels";

export const THUMB_BG =
  "repeating-linear-gradient(135deg, rgba(122,181,44,0.14) 0 14px, rgba(122,181,44,0.05) 14px 28px), #E8F1D7";

// Étiquette énergétique (A→G)
export function DpeChip({ cls, size }: { cls?: DpeClass | null; size?: number }) {
  if (!cls)
    return (
      <span className="dpe" style={{ background: "var(--color-neutral-200)", color: "var(--fg-muted)" }}>
        ?
      </span>
    );
  const dark = cls === "F" || cls === "G";
  return (
    <span className={"dpe" + (dark ? " dark" : "")} style={{ background: DPE[cls], fontSize: size }}>
      {cls}
    </span>
  );
}

export function DpePair({ before, after }: { before?: DpeClass | null; after?: DpeClass | null }) {
  return (
    <span className="dpe-pair">
      <DpeChip cls={before} />
      {after && (
        <>
          <Icon name="arrowRight" size={14} className="arr" />
          <DpeChip cls={after} />
        </>
      )}
    </span>
  );
}

// Avatar à initiales
const AV_TONE: Record<string, string> = { CB: "", TM: "blue", LR: "slate", YK: "" };

export function Avatar({ who, sm, name }: { who: string; sm?: boolean; name?: string }) {
  const m = TEAM_FALLBACK[who];
  return (
    <span
      className={"avatar" + (sm ? " sm" : "") + (AV_TONE[who] ? " " + AV_TONE[who] : "")}
      title={name ?? m?.name ?? who}
    >
      {m?.initials ?? who}
    </span>
  );
}

export function AvatarStack({ team }: { team: string[] }) {
  return (
    <span className="avatar-stack">
      {team.map((w) => (
        <Avatar key={w} who={w} sm />
      ))}
    </span>
  );
}

export function Progress({ value, blue }: { value: number; blue?: boolean }) {
  // Largeur plancher de 2 % pour rester visible aux petites valeurs,
  // mais rien du tout à zéro (sinon une barre fantôme apparaît).
  return (
    <div className={"prog" + (blue ? " blue" : "")}>
      <i style={{ width: (value > 0 ? Math.max(2, value) : 0) + "%" }}></i>
    </div>
  );
}

export type BadgeKind = "primary" | "blue" | "neutral" | "warn" | "success";

export function Badge({ kind, children, dot }: { kind: BadgeKind; children: ReactNode; dot?: boolean }) {
  return (
    <span className={"badge b-" + kind}>
      {dot && <span className="dot"></span>}
      {children}
    </span>
  );
}

// Miniature photo — placeholder de marque en attendant l'upload (M3, Supabase Storage)
export function ThumbSlot({ photoUrl, placeholder }: { photoUrl?: string | null; placeholder?: string }) {
  return (
    <div className="cc-thumb">
      {photoUrl ? (
        <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: THUMB_BG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-primary-700)",
            fontSize: "var(--fs-xs, 12px)",
            gap: 6,
          }}
        >
          <Icon name="image" size={16} />
          {placeholder || "Photo de la copropriété"}
        </div>
      )}
    </div>
  );
}

export function PhaseBadge({ phase }: { phase: PhaseId }) {
  const map: Record<PhaseId, { kind: BadgeKind; label: string }> = {
    diagnostic: { kind: "neutral", label: "Diagnostic" },
    etudes: { kind: "blue", label: "Études" },
    travaux: { kind: "primary", label: "Travaux" },
  };
  const p = map[phase];
  return (
    <Badge kind={p.kind} dot>
      {p.label}
    </Badge>
  );
}
