// shell.jsx — Sidebar + Topbar de l'espace AMO

function Sidebar({ route, onNav, collapsed, onToggle, recents, onOpen, onLogout, dark, role }) {
  const moe = role === "moe";
  const syndic = role === "syndic";
  const nav1 = syndic ? [
    { id: "dashboard", icon: "gauge", label: "Portefeuille" },
    { id: "taches", icon: "clipboard", label: "Vos tâches", count: window.countSyndicTasks() }] :
  [
  { id: "dashboard", icon: "gauge", label: moe ? "Vos opérations" : "Tableau de bord" },
  { id: "taches", icon: "clipboard", label: moe ? "Vos missions" : "Vos tâches", count: moe ? window.countMoeTasks() : window.countMyTasks() },
  { id: "consultations", icon: "megaphone", label: moe ? "Consultation en cours" : "Consulter un intervenant" }];

  const nav2 = [
  { id: "collaborateurs", icon: "users", label: "Collaborateurs" },
  { id: "parametres", icon: "settings", label: "Paramètres" }];

  const NavItem = (it) =>
  <button key={it.id} className={"nav-item" + (route.name === it.id ? " active" : "")} onClick={() => onNav(it.id)} title={it.label}>
      <span className="ico"><Icon name={it.icon} size={19} /></span>
      <span className="lbl">{it.label}</span>
      {it.count != null && <span className="count">{it.count}</span>}
    </button>;

  const user = syndic
    ? { initials: "CA", name: "Camille Aubry", org: "Cabinet Niederhoffer · Syndic" }
    : moe
    ? { initials: "PM", name: "Paul Mercier", org: "Atelier Vernet · MOE" }
    : { initials: "CB", name: "Claire Becker", org: "Strat Eco · AMO" };

  const logoSrc = (window.__resources && (dark ? window.__resources.logoWhite : window.__resources.logoDark)) || (dark ? "assets/logo-strateco-white.svg" : "assets/logo-strateco.svg");
  return (
    <aside className={"sidebar" + (dark ? " dark" : "")}>
      <div className="sb-top">
        {collapsed ?
        <img className="sb-logo-mini" src={logoSrc} alt="Strat Eco" style={{ objectFit: "none", objectPosition: "left", width: 30, overflow: "hidden" }} /> :
        <img className="sb-logo" src={logoSrc} alt="Strat Eco" />}
        <button className="sb-collapse" onClick={onToggle} title="Réduire le menu"><Icon name="panelLeft" size={18} /></button>
      </div>
      <div className="sb-scroll">
        <div className="sb-group">
          <div className="sb-group-label">Votre activité</div>
          {nav1.map(NavItem)}
        </div>
        <div className="sb-group">
          <div className="sb-group-label">{moe ? "Opérations récentes" : syndic ? "Copropriétés récentes" : "MES PROJETS RECENTS"}</div>
          {recents.map((c) =>
          <button key={c.id} className={"nav-item" + (route.name === "detail" && route.coproId === c.id ? " active" : "")} onClick={() => onOpen(c.id)} title={c.name}>
              <span className="ico"><Icon name="building" size={19} /></span>
              <span className="lbl">{c.name}</span>
            </button>
          )}
        </div>
        <div className="sb-group">
          <div className="sb-group-label">Votre entreprise</div>
          {nav2.map(NavItem)}
        </div>
      </div>
      <div className="sb-bottom">
        <div className="sb-user" onClick={onLogout}>
          <Avatar who={user.initials} />
          <span className="meta">
            <span className="nm">{user.name}</span>
            <span className="rl">{user.org}</span>
          </span>
          <span className="spacer" style={{ flex: 1 }}></span>
          <span className="lo" title="Se déconnecter" style={{ color: "var(--fg-muted)" }}><Icon name="logOut" size={17} /></span>
        </div>
      </div>
    </aside>);

}

function Topbar({ crumbs, role, onRoleClick }) {
  const r = window.ROLES.find((x) => x.id === role) || window.ROLES[0];
  return (
    <header className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) =>
        <React.Fragment key={i}>
            {i > 0 && <Icon name="chevronRight" size={15} style={{ color: "var(--border-strong)" }} />}
            {c.onClick ? <span className="c-link" onClick={c.onClick}>{c.label}</span> : <span className="c-cur">{c.label}</span>}
          </React.Fragment>
        )}
      </div>
      <div className="search">
        <Icon name="search" size={17} />
        <input placeholder="Rechercher une copropriété, un copropriétaire…" />
      </div>
      <span className="tb-spacer"></span>
      <div className="tb-actions">
        <button className="icon-btn" title="Notifications"><Icon name="bell" size={19} /><span className="dot-badge"></span></button>
        <button className="icon-btn" title="Aide"><Icon name="inbox" size={19} /></button>
        <button className="role-pill" onClick={onRoleClick} title="Changer d'espace">
          <span style={{ width: 26, height: 26, borderRadius: "var(--radius-sm)", background: "var(--accent-soft)", color: "var(--color-primary-700)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={r.icon} size={15} />
          </span>
          <span className="role-name">Espace {r.label}</span>
          <Icon name="chevronDown" size={15} style={{ color: "var(--fg-muted)" }} />
        </button>
      </div>
    </header>);

}

Object.assign(window, { Sidebar, Topbar });