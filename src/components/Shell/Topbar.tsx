// Topbar (fil d'ariane + recherche + actions) - portée depuis design-reference/project/shell.jsx
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "../Icon";
import { useUi } from "@/stores/ui";
import { useCopros } from "@/api/copros";
import { supabase } from "@/lib/supabase";

/** Comparaison sans accents ni casse (« boudhors » trouve « BOUDHORS »). */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function useDebounced(value: string, delayMs: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return v;
}

/**
 * Recherche globale : copropriétés (nom, ville, adresse, syndic) et
 * copropriétaires (nom). Un résultat ouvre le dossier (onglet Données pour un
 * copropriétaire).
 */
function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(q, 250);
  const actif = q.trim().length >= 2;

  const { data: copros } = useCopros();
  const { data: owners } = useQuery({
    queryKey: ["search-coproprietaires", debounced.trim()],
    enabled: debounced.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coproprietaires")
        .select("id, nom, copro_id, coproprietes(name)")
        .ilike("nom", `%${debounced.trim()}%`)
        .order("nom")
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const matchesCopros = useMemo(() => {
    if (!actif) return [];
    const nq = norm(q.trim());
    return (copros ?? [])
      .filter((c) => norm([c.name, c.city, c.adresse, c.code_postal, c.syndic_name].filter(Boolean).join(" ")).includes(nq))
      .slice(0, 6);
  }, [actif, q, copros]);

  const matchesOwners = actif ? (owners ?? []) : [];

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    setQ("");
    navigate(to);
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 9,
    width: "100%",
    padding: "8px 10px",
    border: "none",
    background: "transparent",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 13.5,
    color: "var(--fg1)",
  };

  return (
    <div className="search" ref={boxRef} style={{ position: "relative" }}>
      <Icon name="search" size={17} />
      <input
        placeholder="Rechercher une copropriété, un copropriétaire…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter") {
            const first = matchesCopros[0]
              ? `/copros/${matchesCopros[0].id}`
              : matchesOwners[0]
                ? `/copros/${matchesOwners[0].copro_id}/donnees`
                : null;
            if (first) go(first);
          }
        }}
      />
      {open && actif && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: 380,
            maxHeight: 420,
            overflowY: "auto",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            zIndex: 80,
            padding: 6,
          }}
        >
          {matchesCopros.length === 0 && matchesOwners.length === 0 ? (
            <p className="se-small" style={{ margin: 0, padding: "10px 10px", color: "var(--fg-muted)" }}>
              Aucun résultat pour « {q.trim()} ».
            </p>
          ) : (
            <>
              {matchesCopros.length > 0 && (
                <div className="se-small" style={{ padding: "6px 10px 2px", color: "var(--fg-muted)", fontWeight: 600 }}>
                  Copropriétés
                </div>
              )}
              {matchesCopros.map((c) => (
                <button
                  key={c.id}
                  style={rowStyle}
                  className="search-row"
                  onClick={() => go(`/copros/${c.id}`)}
                >
                  <Icon name="building" size={15} style={{ color: "var(--color-primary-700)", flex: "none" }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    <span style={{ color: "var(--fg-muted)" }}>
                      {" "}
                      · {[c.code_postal, c.city].filter(Boolean).join(" ") || "-"}
                    </span>
                  </span>
                </button>
              ))}
              {matchesOwners.length > 0 && (
                <div className="se-small" style={{ padding: "6px 10px 2px", color: "var(--fg-muted)", fontWeight: 600 }}>
                  Copropriétaires
                </div>
              )}
              {matchesOwners.map((o) => (
                <button
                  key={o.id}
                  style={rowStyle}
                  className="search-row"
                  onClick={() => go(`/copros/${o.copro_id}/donnees`)}
                >
                  <Icon name="user" size={15} style={{ color: "var(--fg-muted)", flex: "none" }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{o.nom}</span>
                    <span style={{ color: "var(--fg-muted)" }}>
                      {" "}
                      · {(o as { coproprietes: { name: string } | null }).coproprietes?.name ?? "-"}
                    </span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

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
      <GlobalSearch />
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
