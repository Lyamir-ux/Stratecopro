// Espace syndic (portail) - même chrome que les portails copropriétaire et
// prestataire. Deux branches depuis le 20/09/2026 (module Suivi PPT) :
//   • Rénovations globales : portefeuille (bulles ou tableau, export CSV),
//     tâches d'accompagnement, messages, détail de chaque copro (7 onglets) ;
//   • Suivi des PPT (si l'enseigne a le module) : tableau de bord, échéancier,
//     copropriétés (dépôt de fichiers en tête de liste) - pages dans
//     src/pages/SyndicPpt/. Accent bleu (#2E6FA8) via data-branche="ppt".
// Le gestionnaire choisit sa branche à l'arrivée ; son choix est mémorisé et
// un bouton du header permet de basculer à tout moment.
import { useState, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useOrganisations } from "@/api/organisations";
import { compteNonLus, useLectures, useMessagesSyndic } from "@/api/messages";
import { useCoprosSyndic, useMonOrganisation } from "@/api/syndic";
import { useOrganisationPpt, usePptCopros } from "@/api/ppt";
import { deposerDansTampon } from "@/lib/ppt/depotTampon";
import { Portefeuille, cleGestionnaire } from "./Portefeuille";
import { TachesSyndic } from "./Taches";
import { MessagesSyndic } from "./Messages";

export type Branche = "reno" | "ppt";
export type SectionId = "portefeuille" | "taches" | "messages" | "tableau" | "echeancier" | "copros";

const SECTIONS: Record<Branche, { id: SectionId; label: string; icon: IconName }[]> = {
  reno: [
    { id: "portefeuille", label: "Portefeuille", icon: "building" },
    { id: "taches", label: "Vos tâches", icon: "clipboard" },
    { id: "messages", label: "Messages", icon: "message" },
  ],
  ppt: [
    { id: "tableau", label: "Tableau de bord", icon: "gauge" },
    { id: "echeancier", label: "Échéancier", icon: "calendar" },
    { id: "copros", label: "Copropriétés", icon: "building" },
  ],
};

const CLE_BRANCHE = "syndic-branche";

/** Branche mémorisée par l'utilisateur (null : jamais choisie). */
export function lireBranche(): Branche | null {
  try {
    const v = localStorage.getItem(CLE_BRANCHE);
    return v === "reno" || v === "ppt" ? v : null;
  } catch {
    return null;
  }
}
export function ecrireBranche(b: Branche | null) {
  try {
    if (b) localStorage.setItem(CLE_BRANCHE, b);
    else localStorage.removeItem(CLE_BRANCHE);
  } catch {
    /* stockage indisponible : le choix ne survivra pas */
  }
}

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
export function OrgRail({
  copros,
  value,
  onChange,
}: {
  copros: { organisation_id: string | null }[];
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

// La vue d'aperçu AMO (enseigne + gestionnaire) survit à l'ouverture d'un
// dossier : le bouton « Portefeuille » d'un dossier doit ramener à la vue
// d'où l'on vient, pas au portefeuille global (feedback du 28/08).
export function lireVue<T>(cle: string): T | null {
  try {
    const v = sessionStorage.getItem(cle);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
export function ecrireVue(cle: string, v: unknown) {
  try {
    if (v == null) sessionStorage.removeItem(cle);
    else sessionStorage.setItem(cle, JSON.stringify(v));
  } catch {
    /* stockage indisponible : la vue ne survivra pas à la navigation */
  }
}

/** Chrome commun de l'espace syndic (header + navigation, rail optionnel). */
export function SyndicShell({
  active,
  branche = "reno",
  rail,
  badges,
  children,
}: {
  active: SectionId | null;
  branche?: Branche;
  rail?: ReactNode;
  /** Pastilles du menu (ex. messages non lus). */
  badges?: Partial<Record<SectionId, number>>;
  children: ReactNode;
}) {
  const { profile, signOut } = useAuth();
  const { data: org } = useMonOrganisation();
  const { data: orgPpt } = useOrganisationPpt();
  const navigate = useNavigate();
  if (!profile) return <Loader />;

  // Sous-titre : l'enseigne et le périmètre, à défaut l'intitulé du profil.
  const roleLabel =
    org?.role === "directeur"
      ? "Direction - tout le portefeuille"
      : org?.role === "administratif"
        ? "Administratif"
        : org?.role === "comptable"
          ? "Comptable"
          : "Gestionnaire";
  const sousTitre = org ? `${org.nom} · ${roleLabel}` : profile.job_title || "Syndic";
  // Bascule entre branches : syndic dont l'enseigne a le module, ou aperçu AMO.
  const deuxBranches = profile.role === "amo" || !!orgPpt?.module_ppt;
  const autre: Branche = branche === "ppt" ? "reno" : "ppt";
  const sections = SECTIONS[branche];
  const home = branche === "ppt" ? "/syndic/ppt" : "/syndic";

  return (
    <div className="portal" data-branche={branche}>
      <header className="portal-header">
        <img className="ph-logo" src="/logo-strateco-pro.png" alt="Strat Eco" />
        {deuxBranches && (
          <span className="ph-copro" style={{ marginLeft: 18 }}>
            <span className="nm">{branche === "ppt" ? "Suivi des PPT" : "Rénovations globales"}</span>
          </span>
        )}
        {branche === "ppt" && (
          // doublon du dépôt de l'onglet Copropriétés (feedback 20/09) : choisit les fichiers ici,
          // la liste des copropriétés ouvre la fenêtre de dépôt avec ces fichiers
          <label className="se-btn se-btn-primary btn-sm" style={{ marginLeft: 14, cursor: "pointer" }} title="Déposer un PPPT, un PPT, un DPE collectif ou tout autre document">
            <Icon name="upload" size={14} />
            Déposer un fichier
            <input
              type="file"
              multiple
              accept="application/pdf,.pdf,.xlsx,.xls,.docx,.doc"
              style={{ display: "none" }}
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (!fs.length) return;
                deposerDansTampon(fs);
                navigate("/syndic/ppt/copros");
              }}
            />
          </label>
        )}
        <span className="ph-spacer"></span>
        {deuxBranches && (
          <button
            className="se-btn se-btn-ghost btn-sm"
            title={autre === "ppt" ? "Passer au suivi des plans pluriannuels de travaux" : "Passer au suivi des rénovations globales"}
            onClick={() => {
              ecrireBranche(autre);
              navigate(autre === "ppt" ? "/syndic/ppt" : "/syndic");
            }}
          >
            <Icon name="refresh" size={15} />
            {autre === "ppt" ? "Suivi des PPT" : "Rénovations globales"}
          </button>
        )}
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
        {sections.map((it) => (
          <button
            key={it.id}
            className={"pnav" + (active === it.id ? " on" : "")}
            onClick={() => {
              const premiere = sections[0].id;
              navigate(it.id === premiere ? home : `${home}/${it.id}`);
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

/** Choix de la branche à l'arrivée (enseigne équipée du module PPT). */
function ChoixBranche({ nbReno, nbPpt }: { nbReno: number; nbPpt: number }) {
  const navigate = useNavigate();
  const choisir = (b: Branche) => {
    ecrireBranche(b);
    navigate(b === "ppt" ? "/syndic/ppt" : "/syndic", { replace: true });
  };
  const tuile = (b: Branche, icon: IconName, titre: string, texte: string, n: number, unite: string) => (
    <button
      className="tile"
      data-branche={b}
      onClick={() => choisir(b)}
      style={{ textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, padding: "26px 26px 22px" }}
    >
      <span className="k-ico" style={{ width: 40, height: 40, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--accent-soft)", color: "var(--color-primary-700)" }}>
        <Icon name={icon} size={22} />
      </span>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22 }}>{titre}</span>
      <span className="se-body" style={{ margin: 0 }}>{texte}</span>
      <span className="t-foot" style={{ marginTop: 6 }}>
        {n} {unite}
        {n > 1 ? "s" : ""}
      </span>
      <span style={{ marginTop: 6, color: "var(--color-primary-700)", fontWeight: 600, fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
        Ouvrir <Icon name="arrowRight" size={15} />
      </span>
    </button>
  );
  return (
    <div className="page fade" style={{ padding: 0 }}>
      <h1 className="sec-title">Que souhaitez-vous suivre ?</h1>
      <p className="sec-sub">Votre espace comporte deux branches distinctes. Vous pourrez changer à tout moment depuis le bouton en haut de page.</p>
      <div className="tiles" style={{ gridTemplateColumns: "repeat(2, 1fr)", maxWidth: 760 }}>
        {tuile("reno", "building", "Rénovations globales", "Vos copropriétés en projet de rénovation énergétique avec Strat Eco : avancement, tâches, financement, dossiers bancaires.", nbReno, "copropriété")}
        {tuile("ppt", "calendar", "Suivi des PPT", "Vos plans pluriannuels de travaux : échéancier à 10 ans, passages en AG, votes, honoraires de suivi de travaux.", nbPpt, "copropriété")}
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
  const { data: monOrg } = useMonOrganisation();
  const { data: orgPpt, isLoading: orgLoading } = useOrganisationPpt();
  const { data: pptCopros } = usePptCopros();
  const { data: organisations } = useOrganisations();
  // Filtre d'enseigne : réservé à l'aperçu AMO, qui voit tous les portefeuilles.
  const [orgId, setOrgIdBrut] = useState<string | null>(() => lireVue<string>("syndic-apercu-org"));
  // Vue gestionnaire (aperçu AMO) : clic sur un gestionnaire = exactement son
  // portefeuille, sur toutes les sections - ses tâches restent cochables.
  const [gest, setGestBrut] = useState<{ key: string; nom: string } | null>(() =>
    lireVue<{ key: string; nom: string }>("syndic-apercu-gest")
  );
  const setOrgId = (v: string | null) => {
    setOrgIdBrut(v);
    ecrireVue("syndic-apercu-org", v);
  };
  const setGest = (v: { key: string; nom: string } | null) => {
    setGestBrut(v);
    ecrireVue("syndic-apercu-gest", v);
  };
  // pastille « messages non lus » du menu - sur les seuls dossiers ouvrables
  const { data: messagesSyndic } = useMessagesSyndic((copros ?? []).filter((c) => c.acces).map((c) => c.id));
  const { data: lectures } = useLectures();

  if (isLoading || orgLoading) return <Loader />;

  const apercuAmo = profile?.role === "amo";
  const moduleActif = !apercuAmo && !!orgPpt?.module_ppt;
  const branche = lireBranche();
  // Enseigne équipée du module : la branche mémorisée s'applique, sinon on demande.
  if (moduleActif && !sectionParam) {
    if (branche === "ppt") return <Navigate to="/syndic/ppt" replace />;
    if (branche === null)
      return (
        <SyndicShell active={null}>
          <ChoixBranche nbReno={copros?.length ?? 0} nbPpt={pptCopros?.length ?? 0} />
        </SyndicShell>
      );
  }
  // Sans dossier de rénovation globale : l'écran d'accueil renvoie vers le PPT si le module existe.
  if (!copros || copros.length === 0) {
    if (moduleActif) return <Navigate to="/syndic/ppt" replace />;
    return <AucuneCopro />;
  }

  const parOrg = !apercuAmo || orgId === null
    ? copros
    : orgId === "__sans__"
      ? copros.filter((c) => !c.organisation_id)
      : copros.filter((c) => c.organisation_id === orgId);
  const visibles = apercuAmo && gest ? parOrg.filter((c) => cleGestionnaire(c) === gest.key) : parOrg;
  // Le portefeuille montre toute l'enseigne (feedback Amir 08/09) ; Tâches et
  // Messages ne portent que sur les dossiers que l'utilisateur peut ouvrir.
  const accessibles = visibles.filter((c) => c.acces);

  const nonLus = compteNonLus(messagesSyndic, lectures, session?.user.id);

  // Enseigne affichée à la suite du titre du portefeuille : l'organisation du
  // syndic connecté ; en aperçu AMO, l'enseigne filtrée ; à défaut le syndic
  // commun à tous les dossiers visibles (rien si plusieurs enseignes).
  const syndicsVisibles = [...new Set(visibles.map((c) => c.syndic_name?.trim()).filter(Boolean))];
  const syndicNom = !apercuAmo
    ? monOrg?.nom ?? (syndicsVisibles.length === 1 ? syndicsVisibles[0] : undefined)
    : orgId && orgId !== "__sans__"
      ? organisations?.find((o) => o.id === orgId)?.nom
      : syndicsVisibles.length === 1
        ? syndicsVisibles[0]
        : undefined;

  return (
    <SyndicShell
      active={section}
      badges={{ messages: nonLus }}
      rail={apercuAmo ? <OrgRail copros={copros} value={orgId} onChange={(id) => { setOrgId(id); setGest(null); }} /> : undefined}
    >
      {apercuAmo && gest && (
        <div
          className="panel"
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", marginBottom: 18 }}
        >
          <Icon name="user" size={16} style={{ color: "var(--color-primary-700)", flex: "none" }} />
          <span style={{ fontSize: 13.5 }}>
            <b>Portefeuille de {gest.nom}</b> - vous voyez exactement sa vue ({visibles.length} copropriété
            {visibles.length > 1 ? "s" : ""}). Vous pouvez cocher ses tâches à sa place, l'action est tracée.
          </span>
          <span style={{ flex: 1 }}></span>
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => setGest(null)}>
            <Icon name="x" size={13} />
            Quitter cette vue
          </button>
        </div>
      )}
      {section === "portefeuille" && (
        <Portefeuille
          copros={visibles}
          syndicNom={syndicNom}
          onGestionnaire={apercuAmo && !gest ? (key, nom) => setGest({ key, nom }) : undefined}
        />
      )}
      {section === "taches" && <TachesSyndic copros={accessibles} />}
      {section === "messages" && <MessagesSyndic copros={accessibles} />}
    </SyndicShell>
  );
}
