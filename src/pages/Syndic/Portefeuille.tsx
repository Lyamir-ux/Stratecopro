// Portefeuille du syndic — tableau de bord « bulles » animé
// (port de design-reference/project/syndic.jsx, branché sur les vraies copros).
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PhaseBadge } from "@/components/ui";
import { PHASES } from "@/lib/referentiels";
import type { SyndicCopro } from "@/api/syndic";

const BUBBLE_COLOR = "#7AB52C";

interface BubbleState {
  id: string;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function Portefeuille({ copros }: { copros: SyndicCopro[] }) {
  const navigate = useNavigate();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const bubbles = useMemo(
    () =>
      copros.map((c) => ({
        id: c.id,
        name: c.name,
        lots: c.stats?.lots ?? 0,
        phase: c.phase,
        fragile: c.fragile,
        radius: 54 + Math.min(22, (c.stats?.lots ?? 0) / 10),
      })),
    [copros]
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bounds = () => ({ W: wrap.clientWidth, H: wrap.clientHeight });
    let { W, H } = bounds();
    const st: BubbleState[] = bubbles.map((b) => ({
      id: b.id,
      r: b.radius,
      x: b.radius + Math.random() * Math.max(1, W - 2 * b.radius),
      y: b.radius + Math.random() * Math.max(1, H - 2 * b.radius),
      vx: (Math.random() * 2 - 1) * 12,
      vy: (Math.random() * 2 - 1) * 12,
    }));
    const place = () =>
      st.forEach((b) => {
        const n = nodeRefs.current[b.id];
        if (n) n.style.transform = "translate(" + (b.x - b.r) + "px," + (b.y - b.r) + "px)";
      });
    place();
    if (reduce) return;

    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ({ W, H } = bounds());
      for (const b of st) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
        if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy); }
      }
      for (let i = 0; i < st.length; i++) {
        for (let j = i + 1; j < st.length; j++) {
          const a = st[i], c = st[j];
          const dx = c.x - a.x, dy = c.y - a.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const min = a.r + c.r + 8;
          if (d < min) {
            const push = (min - d) / 2, ux = dx / d, uy = dy / d;
            a.x -= ux * push; a.y -= uy * push;
            c.x += ux * push; c.y += uy * push;
            a.vx -= ux * 1.5; a.vy -= uy * 1.5;
            c.vx += ux * 1.5; c.vy += uy * 1.5;
          }
        }
      }
      for (const b of st) {
        const sp = Math.hypot(b.vx, b.vy), max = 20;
        if (sp > max) { b.vx = (b.vx / sp) * max; b.vy = (b.vy / sp) * max; }
        const n = nodeRefs.current[b.id];
        if (n) n.style.transform = "translate(" + (b.x - b.r) + "px," + (b.y - b.r) + "px)";
      }
    };
    const timer = setInterval(step, 1000 / 30);
    return () => clearInterval(timer);
  }, [bubbles]);

  const phaseCounts = PHASES.map((ph) => ({ ph, n: copros.filter((c) => c.phase === ph.id).length }));

  return (
    <div className="page syndic-dash fade" style={{ padding: 0 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Votre portefeuille</h1>
          <p className="page-sub">
            {copros.length} copropriété{copros.length > 1 ? "s" : ""} en rénovation énergétique suivie
            {copros.length > 1 ? "s" : ""} avec Strat Eco
          </p>
        </div>
      </div>

      <div className="syndic-bubble-wrap" ref={wrapRef}>
        {bubbles.map((b) => {
          const ph = PHASES.find((x) => x.id === b.phase);
          return (
            <div
              key={b.id}
              ref={(el) => { nodeRefs.current[b.id] = el; }}
              className={"bubble own clickable" + (hoverId === b.id ? " hover" : "")}
              style={{
                width: b.radius * 2,
                height: b.radius * 2,
                background: BUBBLE_COLOR,
                borderColor: BUBBLE_COLOR,
                color: "#fff",
              }}
              title={b.name + (ph ? " · " + ph.label : "")}
              onMouseEnter={() => setHoverId(b.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => navigate(`/syndic/copros/${b.id}`)}
            >
              <span className="b-name">{b.name}</span>
              <span className="b-sub">{b.lots} lots{ph ? " · " + ph.short : ""}</span>
              {b.fragile && <span className="b-flag" title="Copropriété fragile">!</span>}
            </div>
          );
        })}
      </div>

      <div className="syndic-legend">
        <div className="leg-phases">
          {phaseCounts.map(({ ph, n }) => (
            <span key={ph.id} className="leg-ph">
              <PhaseBadge phase={ph.id} />
              <b>{n}</b>
            </span>
          ))}
        </div>
      </div>
      <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12 }}>
        Cliquez une bulle pour ouvrir le dossier de la copropriété.
      </p>
    </div>
  );
}
