// login.jsx — Écran de connexion + sélecteur d'espace (rôle)

function Login({ onLogin }) {
  const [role, setRole] = React.useState("amo");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", height: "100vh" }}>
      {/* Panneau de marque */}
      <div style={{
        position: "relative", overflow: "hidden",
        background: "linear-gradient(150deg, #213A0E 0%, #355717 55%, #4A7A1F 100%)",
        color: "#fff", padding: "56px 64px", display: "flex", flexDirection: "column",
      }}>
        <img src={(window.__resources && window.__resources.logoWhite) || "assets/logo-strateco-white.svg"} alt="Strat Eco" style={{ height: 44, alignSelf: "flex-start" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 460 }}>
          <div className="se-eyebrow" style={{ color: "rgba(255,255,255,0.7)" }}>Espace de pilotage AMO</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 44, lineHeight: 1.06, letterSpacing: "-0.02em", margin: "14px 0 20px" }}>
            Suivez vos rénovations énergétiques, du diagnostic à la réception.
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: 18, lineHeight: 1.6, color: "rgba(255,255,255,0.85)", margin: 0 }}>
            Une plateforme partagée entre l'AMO, les syndics, la maîtrise d'œuvre et les copropriétaires.
          </p>
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontStyle: "italic", fontWeight: 300, fontSize: 15, color: "rgba(255,255,255,0.7)", margin: 0, maxWidth: 440 }}>
          « Dans un voyage ce n'est pas la destination qui compte mais toujours le chemin parcouru. »
        </p>
      </div>

      {/* Panneau de connexion */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "56px 72px", background: "var(--bg)", overflowY: "auto" }}>
        <div style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, margin: "0 0 6px" }}>Connexion</h2>
          <p className="se-body" style={{ marginTop: 0 }}>Accédez à votre espace de suivi de projet.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
            <div className="field" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>Adresse e-mail</label>
              <input className="login-input" type="email" defaultValue="c.becker@strateco.fr" />
            </div>
            <div className="field" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>Mot de passe</label>
              <input className="login-input" type="password" defaultValue="••••••••••" />
            </div>
          </div>

          <div className="se-eyebrow" style={{ marginTop: 26, marginBottom: 12, color: "var(--fg-muted)" }}>Votre espace</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {window.ROLES.map((r) => (
              <button key={r.id} onClick={() => setRole(r.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 11, textAlign: "left", cursor: "pointer",
                  padding: "13px 14px", borderRadius: "var(--radius-md)",
                  border: "1px solid " + (role === r.id ? "var(--accent)" : "var(--border)"),
                  background: role === r.id ? "var(--accent-soft)" : "var(--bg)",
                  boxShadow: role === r.id ? "var(--shadow-focus)" : "none",
                  transition: "all var(--dur-fast) var(--ease-out-quint)",
                }}>
                <span style={{
                  width: 36, height: 36, borderRadius: "var(--radius-md)", flex: "none",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: role === r.id ? "var(--accent)" : "var(--bg-soft)",
                  color: role === r.id ? "#fff" : "var(--fg2)",
                }}><Icon name={r.icon} size={19} /></span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 14, fontFamily: "var(--font-display)" }}>{r.label}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</span>
                </span>
              </button>
            ))}
          </div>

          <button className="se-btn se-btn-primary" style={{ width: "100%", marginTop: 22 }} onClick={() => onLogin(role)}>
            Se connecter<Icon name="arrowRight" size={18} />
          </button>
          <p style={{ textAlign: "center", fontSize: 13, color: "var(--fg-muted)", marginTop: 16 }}>
            Mot de passe oublié ? <a href="#" style={{ color: "var(--accent)" }}>Réinitialiser</a>
          </p>
        </div>
      </div>
    </div>
  );
}

// Écran « Vos tâches » (transverse AMO) — agrège les tâches réelles des dossiers
function MyTasks({ copros, onOpen }) {
  const phaseLabel = Object.fromEntries(window.PHASES.map((p) => [p.id, p.label]));
  const phaseRank = { diagnostic: 0, etudes: 1, travaux: 2 };

  // Pour chaque copro : on remonte les tâches actionnables (en cours + à faire)
  // de la phase courante du dossier — ce sont les actions concrètes à mener.
  const groups = copros
    .map((c) => {
      const tasks = window.makeTasks(c);
      const phaseTasks = (tasks[c.phase] || [])
        .map((t, idx) => ({ ...t, idx }))
        .filter((t) => t.status !== "done")
        .sort((a, b) => (a.status === b.status ? 0 : a.status === "doing" ? -1 : 1));
      return { c, tasks: phaseTasks };
    })
    .filter((g) => g.tasks.length > 0)
    .sort((a, b) => (phaseRank[b.c.phase] - phaseRank[a.c.phase]));

  const totalDoing = groups.reduce((n, g) => n + g.tasks.filter((t) => t.status === "doing").length, 0);
  const totalTodo = groups.reduce((n, g) => n + g.tasks.filter((t) => t.status === "todo").length, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Vos tâches</h1>
          <p className="page-sub">Actions à mener sur vos dossiers, par copropriété et phase d'avancement</p>
        </div>
        <span className="spacer"></span>
        <div className="mt-tally">
          <span><b>{totalDoing}</b> en cours</span>
          <span className="dot"></span>
          <span><b>{totalTodo}</b> à faire</span>
        </div>
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
              {g.c.fragile && <Badge kind="warn">Fragile</Badge>}
              <Icon name="chevronRight" size={18} className="mt-go" />
            </button>
            <div className="mt-list">
              {g.tasks.map((t) => (
                <div className="mt-task" key={t.idx} onClick={() => onOpen(g.c.id)}>
                  <StatusDot status={t.status} />
                  <span className="mt-task-title">{t.title}{t.jalon && <span className="jalon">{t.jalon}</span>}</span>
                  <span className="spacer"></span>
                  {t.tag && <Badge kind={t.tag === "CEE" || t.tag === "Finance" || t.tag === "Éco-PTZ" ? "blue" : "primary"}>{t.tag}</Badge>}
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

// Écran générique « espace à construire » (rôles non-AMO)
function RolePlaceholder({ role, onSwitch }) {
  const r = window.ROLES.find((x) => x.id === role) || {};
  return (
    <div className="placeholder-screen">
      <div className="ps-ico"><Icon name={r.icon || "user"} size={30} /></div>
      <h2>Espace {r.label}</h2>
      <p>Cette vue sera construite dans une prochaine itération. Elle reprendra le même socle visuel, en exposant un périmètre adapté&nbsp;: {r.sub.toLowerCase()}.</p>
      <button className="se-btn se-btn-primary" style={{ marginTop: 22 }} onClick={onSwitch}><Icon name="gauge" size={17} />Revenir à l'espace AMO</button>
    </div>
  );
}

Object.assign(window, { Login, MyTasks, RolePlaceholder });
