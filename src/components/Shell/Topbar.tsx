// Topbar (fil d'ariane + recherche + actions) — portée depuis design-reference/project/shell.jsx
import { Fragment } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../Icon";
import { useUi } from "@/stores/ui";

export function Topbar() {
  const crumbs = useUi((s) => s.crumbs);
  return (
    <header className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <Icon name="chevronRight" size={15} style={{ color: "var(--border-strong)" }} />}
            {c.to ? (
              <Link className="c-link" to={c.to}>
                {c.label}
              </Link>
            ) : (
              <span className="c-cur">{c.label}</span>
            )}
          </Fragment>
        ))}
      </div>
      <div className="search">
        <Icon name="search" size={17} />
        <input placeholder="Rechercher une copropriété, un copropriétaire…" />
      </div>
      <span className="tb-spacer"></span>
      <div className="tb-actions">
        <button className="icon-btn" title="Notifications">
          <Icon name="bell" size={19} />
          <span className="dot-badge"></span>
        </button>
        <button className="icon-btn" title="Aide">
          <Icon name="inbox" size={19} />
        </button>
        <button className="role-pill" title="Espace AMO">
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-soft)",
              color: "var(--color-primary-700)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="gauge" size={15} />
          </span>
          <span className="role-name">Espace AMO</span>
          <Icon name="chevronDown" size={15} style={{ color: "var(--fg-muted)" }} />
        </button>
      </div>
    </header>
  );
}
