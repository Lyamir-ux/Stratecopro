// Espace copropriétaire (portail) — port de design-reference/project/copro.jsx.
// Sélection de copro (si plusieurs rattachements), en-tête, navigation, sections.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Avatar, PhaseBadge, THUMB_BG } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import {
  useMesCopros,
  useScenariosPartages,
  useEnquetePortail,
  useMaReponse,
  useMonChoix,
  useMonPlan,
  useMesPieces,
  PIECES,
  type Membership,
  type Scenario,
} from "@/api/portail";
import { useBareme } from "@/api/scenarios";
import { Accueil } from "./Accueil";
import { QuotesParts } from "./QuotesParts";
import { Enquete } from "./Enquete";
import { Financement } from "./Financement";
import { Documents } from "./Documents";
import { PlanCopro } from "./PlanCopro";

export type SectionId = "accueil" | "plan-indiv" | "enquete" | "pret" | "documents" | "plan-copro";

const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: "accueil", label: "Accueil", icon: "home" },
  { id: "plan-indiv", label: "Mes quotes-parts", icon: "euro" },
  { id: "enquete", label: "Enquête sociale", icon: "clipboard" },
  { id: "pret", label: "Mon financement", icon: "trendingUp" },
  { id: "documents", label: "Mes documents", icon: "folder" },
  { id: "plan-copro", label: "Plan de la copropriété", icon: "barChart" },
];

function Loader() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", color: "var(--fg-muted)" }}>
      Chargement…
    </div>
  );
}

// ---------- Écran de sélection de copropriété ----------
function CoproSelect({
  memberships,
  userName,
  initials,
  onPick,
  onLogout,
}: {
  memberships: Membership[];
  userName: string;
  initials: string;
  onPick: (coproId: string) => void;
  onLogout: () => void;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-soft)", display: "flex", flexDirection: "column" }}>
      <div className="portal-header">
        <img className="ph-logo" src="/logo-strateco.svg" alt="Strat Eco" />
        <span className="ph-spacer"></span>
        <div className="ph-user">
          <Avatar who={initials} name={userName} />
          <span>
            <span className="nm" style={{ display: "block" }}>{userName}</span>
            <span className="rl">Copropriétaire</span>
          </span>
          <button className="icon-btn" onClick={onLogout} title="Se déconnecter">
            <Icon name="logOut" size={18} />
          </button>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
          <div className="se-eyebrow" style={{ justifyContent: "center" }}>Votre espace</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 34, margin: "10px 0 8px", letterSpacing: "-0.02em" }}>
            Bonjour {userName.split(" ")[0]}
          </h1>
          <p className="se-body" style={{ marginTop: 0, marginBottom: 28 }}>
            Sélectionnez votre copropriété pour accéder au suivi de votre projet de rénovation.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {memberships.map((m) => (
              <button
                key={m.copro.id}
                className="copro-card"
                onClick={() => onPick(m.copro.id)}
                style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, textAlign: "left", cursor: "pointer", border: "1px solid var(--border)" }}
              >
                <span style={{ width: 64, height: 64, borderRadius: "var(--radius-md)", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: THUMB_BG, color: "var(--color-primary-700)" }}>
                  <Icon name="building" size={28} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}>{m.copro.name}</span>
                  <span style={{ display: "block", fontSize: 13, color: "var(--fg3)" }}>
                    {[m.copro.city, m.copro.quartier].filter(Boolean).join(" · ")}
                    {m.lots.length > 0 && " · " + (m.lots.length > 1 ? m.lots.length + " lots" : "Lot n°" + m.lots[0].num)}
                  </span>
                </span>
                <PhaseBadge phase={m.copro.phase} />
                <Icon name="arrowRight" size={20} style={{ color: "var(--accent)" }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Portail (conteneur) ----------
export default function Portail() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { section: sectionParam } = useParams();
  const section: SectionId = (SECTIONS.some((s) => s.id === sectionParam) ? sectionParam : "accueil") as SectionId;

  const { data: memberships, isLoading } = useMesCopros();
  const [coproId, setCoproId] = useState<string | null>(null);

  // sélection automatique si un seul rattachement
  useEffect(() => {
    if (memberships?.length === 1) setCoproId(memberships[0].copro.id);
  }, [memberships]);

  const membership = useMemo(
    () => memberships?.find((m) => m.copro.id === coproId) ?? null,
    [memberships, coproId]
  );

  const { data: scenarios } = useScenariosPartages(membership?.copro.id);
  const scenario: Scenario | null = scenarios?.[0] ?? null;
  const { data: bareme } = useBareme();
  const { data: enquete } = useEnquetePortail(membership?.copro.id);
  const { data: reponse } = useMaReponse(enquete?.id, membership?.coproprietaireId);
  const { data: choix } = useMonChoix(scenario?.id, membership?.coproprietaireId);
  const { data: plan } = useMonPlan(scenario?.id, membership?.coproprietaireId);
  const { data: pieces } = useMesPieces(membership?.coproprietaireId);

  if (isLoading || !profile) return <Loader />;

  const userName = profile.full_name;
  const initials = profile.initials;

  if (!memberships || memberships.length === 0) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-soft)", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 460 }}>
          <img src="/logo-strateco.svg" alt="Strat Eco" style={{ height: 36, marginBottom: 22 }} />
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, margin: "0 0 10px" }}>
            Aucune copropriété rattachée
          </h1>
          <p className="se-body">
            Votre compte n'est pas encore relié à un lot. Contactez votre syndic ou l'équipe Strat Eco.
          </p>
          <button className="se-btn se-btn-secondary" style={{ marginTop: 14 }} onClick={() => void signOut()}>
            <Icon name="logOut" size={16} />Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  if (!membership) {
    return (
      <CoproSelect
        memberships={memberships}
        userName={userName}
        initials={initials}
        onPick={(id) => {
          setCoproId(id);
          navigate("/portail", { replace: true });
        }}
        onLogout={() => void signOut()}
      />
    );
  }

  const copro = membership.copro;
  const profil = reponse?.profil_mpr ?? null;
  const reqPieces = PIECES.filter((p) => p.required);
  const piecesDone = reqPieces.filter((p) => (pieces ?? []).some((x) => x.type === p.type)).length;
  const flags: Record<string, boolean> = {
    enquete: !profil,
    pret: !choix,
    documents: piecesDone < reqPieces.length,
  };

  const go = (s: SectionId) => {
    navigate(s === "accueil" ? "/portail" : `/portail/${s}`);
    document.querySelector(".portal-main")?.scrollTo?.(0, 0);
  };

  const common = { membership, scenarios: scenarios ?? [], scenario, bareme: bareme ?? null, plan: plan ?? null, profil, go };

  return (
    <div className="portal">
      <header className="portal-header">
        <img className="ph-logo" src="/logo-strateco.svg" alt="Strat Eco" />
        <div className="ph-copro">
          <Icon name="building" size={18} style={{ color: "var(--accent)" }} />
          <span className="nm">{copro.name}</span>
          <PhaseBadge phase={copro.phase} />
        </div>
        <span className="ph-spacer"></span>
        {memberships.length > 1 && (
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => setCoproId(null)}>
            <Icon name="building" size={15} />Changer
          </button>
        )}
        <div className="ph-user">
          <Avatar who={initials} name={userName} />
          <span>
            <span className="nm" style={{ display: "block" }}>{userName}</span>
            <span className="rl">
              {membership.lots.length > 1
                ? membership.lots.length + " lots"
                : membership.lots.length === 1
                  ? "Lot n°" + membership.lots[0].num
                  : "Copropriétaire"}
            </span>
          </span>
          <button className="icon-btn" onClick={() => void signOut()} title="Se déconnecter">
            <Icon name="logOut" size={18} />
          </button>
        </div>
      </header>

      <nav className="portal-nav">
        {SECTIONS.map((it) => (
          <button key={it.id} className={"pnav" + (section === it.id ? " on" : "")} onClick={() => go(it.id)}>
            <Icon name={it.icon as never} size={17} />
            {it.label}
            {flags[it.id] ? <span className="pn-badge">!</span> : null}
          </button>
        ))}
      </nav>

      <main className="portal-main">
        {section === "accueil" && (
          <Accueil {...common} userName={userName} piecesDone={piecesDone} piecesReq={reqPieces.length} choix={choix ?? null} />
        )}
        {section === "plan-indiv" && <QuotesParts {...common} />}
        {section === "enquete" && <Enquete membership={membership} bareme={bareme ?? null} />}
        {section === "pret" && <Financement {...common} choix={choix ?? null} />}
        {section === "documents" && <Documents membership={membership} />}
        {section === "plan-copro" && <PlanCopro membership={membership} scenarios={scenarios ?? []} bareme={bareme ?? null} />}
      </main>
    </div>
  );
}
