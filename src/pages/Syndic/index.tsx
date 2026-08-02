// Espace syndic (portail) — même chrome que les portails copropriétaire et
// prestataire. Le gestionnaire consulte son portefeuille en LECTURE SEULE :
// portefeuille (bulles), tâches d'accompagnement, détail copro (5 onglets).
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { Avatar } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useCoprosSyndic } from "@/api/syndic";
import { Portefeuille } from "./Portefeuille";
import { TachesSyndic } from "./Taches";

export type SectionId = "portefeuille" | "taches";

const SECTIONS: { id: SectionId; label: string; icon: IconName }[] = [
  { id: "portefeuille", label: "Portefeuille", icon: "building" },
  { id: "taches", label: "Vos tâches", icon: "clipboard" },
];

export function Loader() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", color: "var(--fg-muted)" }}>
      Chargement…
    </div>
  );
}

/** Chrome commun de l'espace syndic (header + navigation). */
export function SyndicShell({ active, children }: { active: SectionId | null; children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  if (!profile) return <Loader />;

  return (
    <div className="portal">
      <header className="portal-header">
        <img className="ph-logo" src="/logo-strateco.svg" alt="Strat Eco" />
        <span className="ph-spacer"></span>
        <div className="ph-user">
          <Avatar who={profile.initials} name={profile.full_name} />
          <span>
            <span className="nm" style={{ display: "block" }}>{profile.full_name}</span>
            <span className="rl">{profile.job_title || "Syndic"}</span>
          </span>
          <button className="icon-btn" onClick={() => void signOut()} title="Se déconnecter">
            <Icon name="logOut" size={18} />
          </button>
        </div>
      </header>

      <nav className="portal-nav">
        {SECTIONS.map((it) => (
          <button
            key={it.id}
            className={"pnav" + (active === it.id ? " on" : "")}
            onClick={() => {
              navigate(it.id === "portefeuille" ? "/syndic" : `/syndic/${it.id}`);
              document.querySelector(".portal-main")?.scrollTo?.(0, 0);
            }}
          >
            <Icon name={it.icon} size={17} />
            {it.label}
          </button>
        ))}
      </nav>

      <main className="portal-main">{children}</main>
    </div>
  );
}

/** Écran « aucune copropriété rattachée ». */
export function AucuneCopro() {
  const { signOut } = useAuth();
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-soft)", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 460 }}>
        <img src="/logo-strateco.svg" alt="Strat Eco" style={{ height: 36, marginBottom: 22 }} />
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, margin: "0 0 10px" }}>
          Aucune copropriété rattachée
        </h1>
        <p className="se-body">
          Votre compte n'est pas encore relié à une copropriété suivie par Strat Eco. Contactez l'équipe AMO.
        </p>
        <button className="se-btn se-btn-secondary" style={{ marginTop: 14 }} onClick={() => void signOut()}>
          <Icon name="logOut" size={16} />Se déconnecter
        </button>
      </div>
    </div>
  );
}

export default function Syndic() {
  const { section: sectionParam } = useParams();
  const section: SectionId = sectionParam === "taches" ? "taches" : "portefeuille";
  const { data: copros, isLoading } = useCoprosSyndic();

  if (isLoading) return <Loader />;
  if (!copros || copros.length === 0) return <AucuneCopro />;

  return (
    <SyndicShell active={section}>
      {section === "portefeuille" && <Portefeuille copros={copros} />}
      {section === "taches" && <TachesSyndic copros={copros} />}
    </SyndicShell>
  );
}
