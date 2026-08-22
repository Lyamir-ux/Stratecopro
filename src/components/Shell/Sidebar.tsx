// Sidebar de l'espace AMO - portée depuis design-reference/project/shell.jsx
import { useLocation, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "../Icon";
import { Avatar } from "../ui";
import { useUi } from "@/stores/ui";

interface NavEntry {
  to: string;
  icon: IconName;
  label: string;
  count?: number | null;
}

export interface RecentCopro {
  id: string;
  name: string;
}

interface SidebarProps {
  recents: RecentCopro[];
  tasksCount?: number | null;
  /** Questions de prestataires sans réponse - alerte sur « Consulter un intervenant ». */
  questionsCount?: number | null;
  user: { initials: string; name: string; org: string };
  onLogout: () => void;
}

export function Sidebar({ recents, tasksCount, questionsCount, user, onLogout }: SidebarProps) {
  const { collapsed, toggleCollapsed, sidebarTheme } = useUi();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dark = sidebarTheme === "sombre";

  const nav1: NavEntry[] = [
    { to: "/", icon: "gauge", label: "Tableau de bord" },
    { to: "/taches", icon: "clipboard", label: "Vos tâches", count: tasksCount },
    { to: "/consultations", icon: "megaphone", label: "Consulter un intervenant", count: questionsCount },
  ];
  const nav2: NavEntry[] = [
    { to: "/prestataires", icon: "briefcase", label: "Base prestataires" },
    { to: "/collaborateurs", icon: "users", label: "Collaborateurs" },
    { to: "/parametres", icon: "settings", label: "Paramètres" },
  ];
  // l'AMO peut consulter chaque espace tel que le voient ses utilisateurs
  const nav3: NavEntry[] = [
    { to: "/syndic", icon: "building", label: "Espace Syndic" },
    { to: "/portail", icon: "user", label: "Portail copropriétaire" },
    { to: "/prestataire", icon: "hammer", label: "Espace prestataire" },
  ];

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  const NavItem = (it: NavEntry) => (
    <button
      key={it.to}
      className={"nav-item" + (isActive(it.to) ? " active" : "")}
      onClick={() => navigate(it.to)}
      title={it.label}
    >
      <span className="ico">
        <Icon name={it.icon} size={19} />
      </span>
      <span className="lbl">{it.label}</span>
      {it.count != null && <span className="count">{it.count}</span>}
    </button>
  );

  const logoSrc = dark ? "/logo-strateco-pro-white.png" : "/logo-strateco-pro.png";

  return (
    <aside className={"sidebar" + (dark ? " dark" : "")}>
      <div className="sb-top">
        {collapsed ? (
          <img
            className="sb-logo-mini"
            src={logoSrc}
            alt="Strat Eco"
            style={{ objectFit: "none", objectPosition: "left", width: 30, overflow: "hidden" }}
          />
        ) : (
          <img className="sb-logo" src={logoSrc} alt="Strat Eco" />
        )}
        <button className="sb-collapse" onClick={toggleCollapsed} title="Réduire le menu">
          <Icon name="panelLeft" size={18} />
        </button>
      </div>
      <div className="sb-scroll">
        <div className="sb-group">
          <div className="sb-group-label">Votre activité</div>
          {nav1.map(NavItem)}
        </div>
        {recents.length > 0 && (
          <div className="sb-group">
            <div className="sb-group-label">MES PROJETS RECENTS</div>
            {recents.map((c) => (
              <button
                key={c.id}
                className={"nav-item" + (pathname.startsWith(`/copros/${c.id}`) ? " active" : "")}
                onClick={() => navigate(`/copros/${c.id}`)}
                title={c.name}
              >
                <span className="ico">
                  <Icon name="building" size={19} />
                </span>
                <span className="lbl">{c.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="sb-group">
          <div className="sb-group-label">Votre entreprise</div>
          {nav2.map(NavItem)}
        </div>
        <div className="sb-group">
          <div className="sb-group-label">Aperçu des espaces</div>
          {nav3.map(NavItem)}
        </div>
      </div>
      <div className="sb-bottom">
        <div className="sb-user" onClick={onLogout}>
          <Avatar who={user.initials} name={user.name} />
          <span className="meta">
            <span className="nm">{user.name}</span>
            <span className="rl">{user.org}</span>
          </span>
          <span className="spacer" style={{ flex: 1 }}></span>
          <span className="lo" title="Se déconnecter" style={{ color: "var(--fg-muted)" }}>
            <Icon name="logOut" size={17} />
          </span>
        </div>
      </div>
    </aside>
  );
}
