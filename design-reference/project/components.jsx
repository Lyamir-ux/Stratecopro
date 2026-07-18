// components.jsx — briques d'UI partagées (Strat Eco AMO)

const THUMB_BG =
  "repeating-linear-gradient(135deg, rgba(122,181,44,0.14) 0 14px, rgba(122,181,44,0.05) 14px 28px), #E8F1D7";

// Étiquette énergétique (A→G)
function DpeChip({ cls, size }) {
  if (!cls) return <span className="dpe" style={{ background: "var(--color-neutral-200)", color: "var(--fg-muted)" }}>?</span>;
  const dark = ["F", "G"].includes(cls);
  return (
    <span className={"dpe" + (dark ? " dark" : "")}
      style={{ background: window.DPE[cls], fontSize: size }}>{cls}</span>
  );
}

function DpePair({ before, after }) {
  return (
    <span className="dpe-pair">
      <DpeChip cls={before} />
      {after && <><Icon name="arrowRight" size={14} className="arr" /><DpeChip cls={after} /></>}
    </span>
  );
}

// Avatar à initiales
const AV_TONE = { CB: "", TM: "blue", LR: "slate", YK: "" };
function Avatar({ who, sm }) {
  const m = window.TEAM[who] || { initials: who };
  return (
    <span className={"avatar" + (sm ? " sm" : "") + (AV_TONE[who] ? " " + AV_TONE[who] : "")}
      title={m.name}>{m.initials}</span>
  );
}
function AvatarStack({ team }) {
  return (
    <span className="avatar-stack">
      {team.map((w) => <Avatar key={w} who={w} sm />)}
    </span>
  );
}

function Progress({ value, blue }) {
  return (
    <div className={"prog" + (blue ? " blue" : "")}>
      <i style={{ width: Math.max(2, value) + "%" }}></i>
    </div>
  );
}

function Badge({ kind, children, dot }) {
  return <span className={"badge b-" + kind}>{dot && <span className="dot"></span>}{children}</span>;
}

// Miniature photo (image-slot fillable + placeholder de marque)
function ThumbSlot({ id, placeholder, dpe }) {
  return (
    <div className="cc-thumb">
      <image-slot
        id={"thumb-" + id}
        shape="rect"
        placeholder={placeholder || "Photo de la copropriété"}
        style={{ background: THUMB_BG }}
      ></image-slot>
    </div>
  );
}

// petite barre de statut de phase
function PhaseBadge({ phase }) {
  const map = {
    diagnostic: { kind: "neutral", label: "Diagnostic" },
    etudes: { kind: "blue", label: "Études" },
    travaux: { kind: "primary", label: "Travaux" },
  };
  const p = map[phase];
  return <Badge kind={p.kind} dot>{p.label}</Badge>;
}

Object.assign(window, { DpeChip, DpePair, Avatar, AvatarStack, Progress, Badge, ThumbSlot, PhaseBadge, THUMB_BG });
