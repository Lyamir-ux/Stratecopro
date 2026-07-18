// syndic.jsx — Espace Syndic
//  · Tableau de bord « bulles » animé (portefeuille du cabinet, par gestionnaire)
//  · Mêmes données que l'AMO (sans le plan de financement) + accès vue copropriétaire
//  · Tâches : assemblées, comptes d'aides, validations, registre, PV, DO, fiche État, chantier

function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return "rgba(" + r + "," + g + "," + b + "," + a + ")";
}

/* ---------- Tableau de bord animé en bulles ---------- */
function SyndicDashboard({ onOpen }) {
  const org = window.SYNDIC_ORG;
  const portfolio = React.useMemo(() => window.makeSyndicPortfolio(), []);
  const gestById = React.useMemo(() => Object.fromEntries(org.gestionnaires.map((g) => [g.id, g])), [org]);
  const [scope, setScope] = React.useState("all"); // all | mine
  const [hoverId, setHoverId] = React.useState(null);
  const wrapRef = React.useRef(null);
  const nodeRefs = React.useRef({});
  const timerRef = React.useRef(0);

  const shown = portfolio.filter((p) => scope === "all" || p.own);
  const mineCount = portfolio.filter((p) => p.own).length;

  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bounds = () => ({ W: wrap.clientWidth, H: wrap.clientHeight });
    let { W, H } = bounds();
    const st = shown.map((p) => {
      const r = p.radius;
      return { id: p.id, r,
        x: r + Math.random() * Math.max(1, W - 2 * r),
        y: r + Math.random() * Math.max(1, H - 2 * r),
        vx: (Math.random() * 2 - 1) * 12, vy: (Math.random() * 2 - 1) * 12 };
    });
    const place = () => st.forEach((b) => { const n = nodeRefs.current[b.id]; if (n) n.style.transform = "translate(" + (b.x - b.r) + "px," + (b.y - b.r) + "px)"; });
    place();
    if (reduce) return;

    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      ({ W, H } = bounds());
      for (const b of st) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
        if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy); }
      }
      for (let i = 0; i < st.length; i++) {
        for (let j = i + 1; j < st.length; j++) {
          const a = st[i], c = st[j];
          let dx = c.x - a.x, dy = c.y - a.y; let d = Math.hypot(dx, dy) || 0.01;
          const min = a.r + c.r + 8;
          if (d < min) {
            const push = (min - d) / 2, ux = dx / d, uy = dy / d;
            a.x -= ux * push; a.y -= uy * push; c.x += ux * push; c.y += uy * push;
            a.vx -= ux * 1.5; a.vy -= uy * 1.5; c.vx += ux * 1.5; c.vy += uy * 1.5;
          }
        }
      }
      for (const b of st) {
        const sp = Math.hypot(b.vx, b.vy), max = 20;
        if (sp > max) { b.vx = b.vx / sp * max; b.vy = b.vy / sp * max; }
        const n = nodeRefs.current[b.id];
        if (n) n.style.transform = "translate(" + (b.x - b.r) + "px," + (b.y - b.r) + "px)";
      }
    };
    timerRef.current = setInterval(step, 1000 / 30);
    return () => clearInterval(timerRef.current);
  }, [scope, portfolio]);

  const phaseCounts = window.PHASES.map((ph) => ({ ph, n: portfolio.filter((p) => p.phase === ph.id).length }));

  return (
    <div className="page syndic-dash">
      <div className="page-head">
        <div>
          <h1 className="page-title">Portefeuille du cabinet</h1>
          <p className="page-sub">{org.cabinet} · {portfolio.length} copropriétés suivies par {org.gestionnaires.length} gestionnaires</p>
        </div>
        <span className="spacer"></span>
        <div className="seg">
          <button className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>Tout le cabinet</button>
          <button className={scope === "mine" ? "on" : ""} onClick={() => setScope("mine")}>Mon portefeuille · {mineCount}</button>
        </div>
      </div>

      <div className="syndic-bubble-wrap" ref={wrapRef}>
        {shown.map((p) => {
          const g = gestById[p.gestId];
          const ph = window.PHASES.find((x) => x.id === p.phase);
          const big = p.radius >= 48;
          return (
            <div
              key={p.id}
              ref={(el) => { nodeRefs.current[p.id] = el; }}
              className={"bubble" + (p.own ? " own" : "") + (p.real ? " clickable" : "") + (hoverId === p.id ? " hover" : "")}
              style={{
                width: p.radius * 2, height: p.radius * 2,
                background: p.own ? g.color : hexToRgba(g.color, 0.14),
                borderColor: g.color,
                color: p.own ? "#fff" : g.color,
              }}
              title={p.name + " — " + g.name + (ph ? " · " + ph.label : "")}
              onMouseEnter={() => setHoverId(p.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => p.real && onOpen(p.id)}
            >
              {big ? (
                <>
                  <span className="b-name">{p.name}</span>
                  <span className="b-sub">{p.lots} lots{ph ? " · " + ph.short : ""}</span>
                </>
              ) : (
                <span className="b-init">{p.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
              )}
              {p.fragile && <span className="b-flag" title="Copropriété fragile">!</span>}
            </div>
          );
        })}
      </div>

      <div className="syndic-legend">
        <div className="leg-gests">
          {org.gestionnaires.map((g) => {
            const n = portfolio.filter((p) => p.gestId === g.id).length;
            return (
              <span className={"leg-g" + (g.id === org.meId ? " me" : "")} key={g.id}>
                <span className="dot" style={{ background: g.color }}></span>
                {g.name}{g.id === org.meId ? " (vous)" : ""}<span className="leg-n">{n}</span>
              </span>
            );
          })}
        </div>
        <span className="spacer" style={{ flex: 1 }}></span>
        <div className="leg-phases">
          {phaseCounts.map(({ ph, n }) => <span key={ph.id} className="leg-ph"><PhaseBadge phase={ph.id} /><b>{n}</b></span>)}
        </div>
      </div>
      <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12 }}>Les grandes bulles sont vos copropriétés ; les plus petites, celles de vos collègues. Cliquez une bulle de votre portefeuille pour ouvrir le dossier.</p>
    </div>
  );
}

/* ---------- Détail (réutilise CoproDetail, sans plan de financement) ---------- */
function SyndicDetail({ c, onBack, onCoproView }) {
  return <CoproDetail c={c} onBack={onBack} role="syndic" tasksFn={window.makeSyndicTasks} hiddenTabs={["financement"]} onCoproView={onCoproView} />;
}

/* ---------- Vos tâches (transverse) ---------- */
function SyndicMissions({ copros, onOpen }) {
  const phaseRank = { diagnostic: 0, etudes: 1, travaux: 2 };
  const groups = copros
    .map((c) => {
      const tasks = (window.makeSyndicTasks(c)[c.phase] || [])
        .map((t, idx) => ({ ...t, idx }))
        .filter((t) => t.status !== "done")
        .sort((a, b) => (a.status === b.status ? 0 : a.status === "doing" ? -1 : 1));
      return { c, tasks };
    })
    .filter((g) => g.tasks.length > 0)
    .sort((a, b) => phaseRank[b.c.phase] - phaseRank[a.c.phase]);
  const totalDoing = groups.reduce((n, g) => n + g.tasks.filter((t) => t.status === "doing").length, 0);
  const totalTodo = groups.reduce((n, g) => n + g.tasks.filter((t) => t.status === "todo").length, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Vos tâches</h1>
          <p className="page-sub">Assemblées, comptes d'aides, validations, registre & PV — par copropriété et phase</p>
        </div>
        <span className="spacer"></span>
        <div className="mt-tally"><span><b>{totalDoing}</b> en cours</span><span className="dot"></span><span><b>{totalTodo}</b> à faire</span></div>
      </div>
      <div className="mt-groups">
        {groups.map((g) => (
          <div className="panel mt-card" key={g.c.id}>
            <button className="mt-copro" onClick={() => onOpen(g.c.id)}>
              <span className="mt-thumb"><Icon name="building" size={20} /></span>
              <span className="mt-copro-txt">
                <span className="mt-copro-name">{g.c.name}</span>
                <span className="mt-copro-loc">{g.c.adresse || (g.c.city + " · " + g.c.quartier)}</span>
              </span>
              <PhaseBadge phase={g.c.phase} />
              <Icon name="chevronRight" size={18} className="mt-go" />
            </button>
            <div className="mt-list">
              {g.tasks.map((t) => (
                <div className="mt-task" key={t.idx} onClick={() => onOpen(g.c.id)}>
                  <StatusDot status={t.status} />
                  <span className="mt-task-title">{t.title}</span>
                  <span className="spacer"></span>
                  {t.tag && <Badge kind="primary">{t.tag}</Badge>}
                  {t.status === "doing" && <Badge kind="warn" dot>En cours</Badge>}
                  {t.due && <span className="due"><Icon name="calendar" size={13} />{t.due}</span>}
                  {t.who && <Avatar who={t.who} sm />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { SyndicDashboard, SyndicDetail, SyndicMissions });
