// Espace syndic (portail) - même chrome que les portails copropriétaire et
// prestataire. Le gestionnaire consulte son portefeuille (bulles ou tableau,
// export CSV), coche ses tâches d'accompagnement (échéances datées), échange
// avec l'équipe AMO (Messages) et ouvre le détail de chaque copro (7 onglets).
import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useOrganisations } from "@/api/organisations";
import { compteNonLus, useLectures, useMessagesSyndic } from "@/api/messages";
import { useCoprosSyndic, useMonOrganisation, type SyndicCopro } from "@/api/syndic";
import { Portefeuille } from "./Portefeuille";
import { TachesSyndic } from "./Taches";
import { MessagesSyndic } from "./Messages";

export type SectionId = "portefeuille" | "taches" | "messages";

const SECTIONS: { id: SectionId; label: string; icon: IconName }[] = [
  { id: "portefeuille", label: "Portefeuille", icon: "building" },
  { id: "taches", label: "Vos tâches", icon: "clipboard" },
  { id: "messages", label: "Messages", icon: "message" },
];

export function Loader() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", color: "var(--fg-muted)" }}>
      Chargement…
    </div>
  );
}

/**
 * Sélecteur d'enseigne - aperçu AMO uniquement. Un vrai gestionnaire ne voit
 * que son propre portefeuille : ce rail n'aurait rien à lui proposer.
 */
function OrgRail({
  copros,
  value,
  onChange,
}: {
  copros: SyndicCopro[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { data: organisations } = useOrganisations();
  const horsOrg = copros.filter((c) => !c.organisation_id).length;
  const entrees: { id: string | null; nom: string; n: number }[] = [
    { id: null, nom: "Tous les dossiers", n: copros.length },
    ...(organisations ?? []).map((o) => ({
      id: o.id as string | null,
      nom: o.nom,
      n: copros.filter((c) => c.organisation_id === o.id).length,
    })),
    ...(horsOrg ? [{ id: "__sans__" as string | null, nom: "Hors organisation", n: horsOrg }] : []),
  ];

  return (
    <aside className="org-rail">
      <div className="se-eyebrow orl-head">Organisations</div>
      {entrees.map((e) => (
        <button
          key={e.id ?? "tous"}
          className={"orl-item" + (value === e.id ? " on" : "")}
          onClick={() => onChange(e.id)}
        >
          <span className="nm">{e.nom}</span>
          <span className="n">{e.n}</span>
        </button>
      ))}
    </aside>
  );
}

/** Chrome commun de l'espace syndic (header + navigation, rail optionnel). */
export function SyndicShell({
  active,
  rail,
  badges,
  children,
}: {
  active: SectionId | null;
  rail?: ReactNode;
  /** Pastilles du menu (ex. messages non lus). */
  badges?: Partial<Record<SectionId, number>>;
  children: ReactNode;
}) {
  const { profile, signOut } = useAuth();
  const { data: org } = useMonOrganisation();
  const navigate = useNavigate();
  if (!profile) return <Loader />;

  // Sous-titre : l'enseigne et le périmètre, à défaut l'intitulé du profil.
  const sousTitre = org
    ? `${org.nom} · ${org.role === "directeur" ? "Direction - tout le portefeuille" : "Gestionnaire"}`
    : profile.job_title || "Syndic";

  return (
    <div className="portal">
      <header className="portal-header">
        <img className="ph-logo" src="/logo-strateco-pro.png" alt="Strat Eco" />
        <span className="ph-spacer"></span>
        {profile.role === "amo" && (
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate("/")} title="Revenir à l'espace AMO">
            <Icon name="gauge" size={15} />Espace AMO
          </button>
        )}
        <div className="ph-user">
          <Avatar who={profile.initials} name={profile.full_name} />
          <span>
            <span className="nm" style={{ display: "block" }}>{profile.full_name}</span>
            <span className="rl">{sousTitre}</span>
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
            {(badges?.[it.id] ?? 0) > 0 && <Badge kind="warn">{badges![it.id]}</Badge>}
          </button>
        ))}
      </nav>

      {rail ? (
        <div className="portal-body">
          {rail}
          <main className="portal-main">{children}</main>
        </div>
      ) : (
        <main className="portal-main">{children}</main>
      )}
    </div>
  );
}

/** Écran « aucune copropriété rattachée ». */
export function AucuneCopro() {
  const { signOut } = useAuth();
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-soft)", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 460 }}>
        <img src="/logo-strateco-pro.png" alt="Strat Eco" style={{ height: 36, marginBottom: 22 }} />
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
  const section: SectionId =
    sectionParam === "taches" ? "taches" : sectionParam === "messages" ? "messages" : "portefeuille";
  const { profile, session } = useAuth();
  const { data: copros, isLoading } = useCoprosSyndic();
  // Filtre d'enseigne : réservé à l'aperçu AMO, qui voit tous les portefeuilles.
  const [orgId, setOrgId] = useState<string | null>(null);
  // pastille « messages non lus » du menu
  const { data: messagesSyndic } = useMessagesSyndic((copros ?? []).map((c) => c.id));
  const { data: lectures } = useLectures();

  if (isLoading) return <Loader />;
  if (!copros || copros.length === 0) return <AucuneCopro />;

  const apercuAmo = profile?.role === "amo";
  const visibles = !apercuAmo || orgId === null
    ? copros
    : orgId === "__sans__"
      ? copros.filter((c) => !c.organisation_id)
      : copros.filter((c) => c.organisation_id === orgId);

  const nonLus = compteNonLus(messagesSyndic, lectures, session?.user.id);

  return (
    <SyndicShell
      active={section}
      badges={{ messages: nonLus }}
      rail={apercuAmo ? <OrgRail copros={copros} value={orgId} onChange={setOrgId} /> : undefined}
    >
      {section === "portefeuille" && <Portefeuille copros={visibles} />}
      {section === "taches" && <TachesSyndic copros={visibles} />}
      {section === "messages" && <MessagesSyndic copros={visibles} />}
    </SyndicShell>
  );
}
