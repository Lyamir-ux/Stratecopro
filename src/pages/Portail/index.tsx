// Espace copropriétaire (portail) - port de design-reference/project/copro.jsx.
// Sélection de copro (si plusieurs rattachements), en-tête, navigation, sections.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { piecesAttendues, type ReponsesPieces } from "@/lib/piecesSituation";
import { Avatar, PhaseBadge, THUMB_BG } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { compteNonLus, useLectures, useMessagesPortail } from "@/api/messages";
import {
  useMesCopros,
  useScenariosPartages,
  useEnquetePortail,
  useMaReponse,
  useContextePieces,
  useMonChoix,
  useMonPlan,
  useMesPieces,
  profilMetaDepuisReponse,
  type Membership,
  type Scenario,
} from "@/api/portail";
import { useBareme } from "@/api/scenarios";
import { lienVueAmo } from "@/lib/vuesCopro";
import type { Profil } from "@/lib/finance";
import { Accueil } from "./Accueil";
import { QuotesParts } from "./QuotesParts";
import { Enquete } from "./Enquete";
import { Financement } from "./Financement";
import { PlanCopro } from "./PlanCopro";
import { Documents } from "./Documents";
import { Faq } from "./Faq";
import { Messages } from "./Messages";

// « Mes documents » a été retiré (feedback Amir 22/09/2026) : le seul document
// encore attendu du copropriétaire est son avis d'imposition, qui se dépose dans
// l'enquête sociale. Les documents partagés par l'AMO ont leur onglet
// « Documents », en lecture seule (feedback Amir 02/10/2026).
export type SectionId =
  | "accueil"
  | "plan-indiv"
  | "enquete"
  | "pret"
  | "plan-copro"
  | "documents"
  | "faq"
  | "messages";

const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: "accueil", label: "Accueil", icon: "home" },
  { id: "plan-indiv", label: "Mes quotes-parts", icon: "euro" },
  { id: "enquete", label: "Enquête sociale", icon: "clipboard" },
  { id: "pret", label: "Mon financement", icon: "trendingUp" },
  { id: "plan-copro", label: "Plan de financement global", icon: "barChart" },
  { id: "documents", label: "Documents", icon: "fileText" },
  { id: "faq", label: "FAQ", icon: "help" },
  // « Envoyez-nous un message » (feedback Amir 22/09/2026) : fil privé avec l'équipe AMO
  { id: "messages", label: "Nous contacter", icon: "message" },
];

function Loader() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", color: "var(--fg-muted)" }}>
      Chargement…
    </div>
  );
}

// ---------- Aperçu AMO : choisir le copropriétaire à consulter ----------
function ApercuSelect({
  memberships,
  coproInitiale,
  onPick,
  onExit,
  onDossier,
}: {
  memberships: Membership[];
  /** Copropriété déjà choisie (bouton « Vue copropriétaire » d'un dossier AMO) */
  coproInitiale: string | null;
  onPick: (coproprietaireId: string) => void;
  onExit: () => void;
  onDossier: (coproId: string) => void;
}) {
  const [coproId, setCoproId] = useState<string | null>(coproInitiale);
  const [recherche, setRecherche] = useState("");
  const copros = useMemo(() => {
    const seen = new Map<string, { copro: Membership["copro"]; n: number }>();
    for (const m of memberships) {
      const e = seen.get(m.copro.id);
      if (e) e.n += 1;
      else seen.set(m.copro.id, { copro: m.copro, n: 1 });
    }
    return [...seen.values()].sort((a, b) => a.copro.name.localeCompare(b.copro.name, "fr"));
  }, [memberships]);
  const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(recherche.trim());
  const coprosFiltrees = copros.filter(({ copro }) => !q || norm([copro.name, copro.code_postal, copro.city].filter(Boolean).join(" ")).includes(q));
  const cps = useMemo(
    () =>
      memberships
        .filter((m) => m.copro.id === coproId)
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { numeric: true })),
    [memberships, coproId]
  );
  const cpsFiltres = cps.filter((m) => !q || norm(m.nom).includes(q));

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-soft)", display: "flex", flexDirection: "column" }}>
      <div className="portal-header">
        <img className="ph-logo" src="/logo-strateco-pro.png" alt="Strat Eco" />
        <span className="ph-spacer"></span>
        {coproId && (
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => onDossier(coproId)} title="Revenir à ce dossier dans l'espace AMO">
            <Icon name="building" size={15} />Vue AMO
          </button>
        )}
        <button className="se-btn se-btn-ghost btn-sm" onClick={onExit}>
          <Icon name="gauge" size={15} />Espace AMO
        </button>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ maxWidth: 1400, width: "100%", textAlign: "center" }}>
          <div className="se-eyebrow" style={{ justifyContent: "center" }}>Aperçu AMO</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, margin: "10px 0 8px", letterSpacing: "-0.02em" }}>
            {coproId ? "Quel copropriétaire ?" : "Portail copropriétaire"}
          </h1>
          <p className="se-body" style={{ marginTop: 0, marginBottom: 20 }}>
            {coproId
              ? "Choisissez le copropriétaire dont vous voulez voir le portail."
              : "Choisissez une copropriété pour consulter le portail tel que le voient ses copropriétaires."}
          </p>
          <div style={{ position: "relative", maxWidth: 520, margin: "0 auto 22px" }}>
            <Icon name="search" size={16} style={{ position: "absolute", left: 14, top: 13, color: "var(--fg-muted)" }} />
            <input
              className="se-input"
              autoFocus
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder={coproId ? "Rechercher un copropriétaire…" : "Rechercher une copropriété, une ville, un code postal…"}
              style={{ width: "100%", paddingLeft: 38 }}
            />
          </div>
          {!coproId ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
              {coprosFiltrees.length === 0 && <p className="se-small" style={{ gridColumn: "1 / -1", color: "var(--fg-muted)" }}>Aucune copropriété ne correspond.</p>}
              {coprosFiltrees.map(({ copro, n }) => (
                <button
                  key={copro.id}
                  className="copro-card"
                  onClick={() => { setCoproId(copro.id); setRecherche(""); }}
                  style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, textAlign: "left", cursor: "pointer", border: "1px solid var(--border)" }}
                >
                  <span style={{ width: 52, height: 52, borderRadius: "var(--radius-md)", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: THUMB_BG, color: "var(--color-primary-700)" }}>
                    <Icon name="building" size={24} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>{copro.name}</span>
                    <span style={{ display: "block", fontSize: 13, color: "var(--fg3)" }}>
                      {[copro.code_postal, copro.city].filter(Boolean).join(" ")} · {n} copropriétaire{n > 1 ? "s" : ""}
                    </span>
                  </span>
                  <PhaseBadge phase={copro.phase} />
                  <Icon name="arrowRight" size={20} style={{ color: "var(--accent)" }} />
                </button>
              ))}
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8, padding: 2 }}>
                {cpsFiltres.length === 0 && (
                  <p className="se-small" style={{ gridColumn: "1 / -1", color: "var(--fg-muted)" }}>
                    {cps.length === 0
                      ? "Aucun copropriétaire n'est encore rattaché à cette copropriété (onglet Copropriétaires du dossier)."
                      : "Aucun copropriétaire ne correspond."}
                  </p>
                )}
                {cpsFiltres.map((m) => (
                  <button
                    key={m.coproprietaireId}
                    className="copro-card"
                    onClick={() => onPick(m.coproprietaireId)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", textAlign: "left", cursor: "pointer", border: "1px solid var(--border)" }}
                  >
                    <Icon name="user" size={18} style={{ color: "var(--fg-muted)", flex: "none" }} />
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>{m.nom}</span>
                    <span style={{ fontSize: 12.5, color: "var(--fg3)" }}>
                      {m.lots.length} lot{m.lots.length > 1 ? "s" : ""}
                    </span>
                    <Icon name="arrowRight" size={17} style={{ color: "var(--accent)" }} />
                  </button>
                ))}
              </div>
              <button className="se-btn se-btn-ghost btn-sm" style={{ marginTop: 16 }} onClick={() => { setCoproId(null); setRecherche(""); }}>
                <Icon name="chevronLeft" size={15} />Changer de copropriété
              </button>
            </>
          )}
        </div>
      </div>
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
  onPick: (coproprietaireId: string) => void;
  onLogout: () => void;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-soft)", display: "flex", flexDirection: "column" }}>
      <div className="portal-header">
        <img className="ph-logo" src="/logo-strateco-pro.png" alt="Strat Eco" />
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
      <div className="portal-choix">
        <div className="portal-choix-in">
          <div className="se-eyebrow" style={{ justifyContent: "center" }}>Votre espace</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 34, margin: "10px 0 8px", letterSpacing: "-0.02em" }}>
            Bonjour {userName.trim()}
          </h1>
          <p className="se-body" style={{ marginTop: 0, marginBottom: 28 }}>
            Sélectionnez votre copropriété pour accéder au suivi de votre projet de rénovation.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {memberships.map((m) => (
              <button key={m.coproprietaireId} className="copro-card cp-choix" onClick={() => onPick(m.coproprietaireId)}>
                <span className="cp-ico" style={{ background: THUMB_BG }}>
                  <Icon name="building" size={28} />
                </span>
                <span className="cp-txt">
                  <span className="cp-nom">{m.copro.name}</span>
                  <span className="cp-sub">
                    {[m.copro.code_postal, m.copro.city].filter(Boolean).join(" ")}
                    {m.lots.length > 0 && " · " + (m.lots.length > 1 ? m.lots.length + " lots" : "Lot n°" + m.lots[0].num)}
                  </span>
                </span>
                <PhaseBadge phase={m.copro.phase} />
                <Icon name="arrowRight" size={20} className="cp-fleche" style={{ color: "var(--accent)" }} />
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
  const { profile, session, signOut } = useAuth();
  const navigate = useNavigate();
  const { section: sectionParam } = useParams();
  const section: SectionId = (SECTIONS.some((s) => s.id === sectionParam) ? sectionParam : "accueil") as SectionId;

  const isAmo = profile?.role === "amo";
  const { data: memberships, isLoading } = useMesCopros();
  const [cpId, setCpId] = useState<string | null>(null);
  // Aperçu AMO : copropriété dont on choisit le copropriétaire (bouton « Vue
  // copropriétaire » d'un dossier, idée d'Amir du 08/10/2026)
  const [coproApercu, setCoproApercu] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Lien profond ?cp=<coproprietaireId> (ex. clic sur un plan individuel côté
  // AMO) : sélectionne directement ce copropriétaire, puis nettoie l'URL.
  const cpParam = searchParams.get("cp");
  useEffect(() => {
    if (!cpParam || !memberships) return;
    if (memberships.some((m) => m.coproprietaireId === cpParam)) setCpId(cpParam);
    setSearchParams({}, { replace: true });
  }, [cpParam, memberships, setSearchParams]);

  // Lien profond ?copro=<coproprieteId> (aperçu AMO depuis un dossier) : ouvre la
  // liste des copropriétaires de ce dossier, ou directement le portail du seul
  // copropriétaire s'il est unique.
  const coproParam = searchParams.get("copro");
  useEffect(() => {
    if (cpParam || !coproParam || !memberships || !isAmo) return;
    const deLaCopro = memberships.filter((m) => m.copro.id === coproParam);
    if (deLaCopro.length === 1) setCpId(deLaCopro[0].coproprietaireId);
    else setCoproApercu(coproParam);
    setSearchParams({}, { replace: true });
  }, [cpParam, coproParam, memberships, isAmo, setSearchParams]);

  // sélection automatique si un seul rattachement
  useEffect(() => {
    if (!cpParam && memberships?.length === 1) setCpId(memberships[0].coproprietaireId);
  }, [memberships, cpParam]);

  const membership = useMemo(
    () => memberships?.find((m) => m.coproprietaireId === cpId) ?? null,
    [memberships, cpId]
  );

  const { data: scenarios } = useScenariosPartages(membership?.copro.id);
  const scenario: Scenario | null = scenarios?.[0] ?? null;
  const { data: bareme } = useBareme();
  const { data: enquete } = useEnquetePortail(membership?.copro.id);
  const { data: reponse } = useMaReponse(enquete?.id, membership?.coproprietaireId);
  const { data: choix } = useMonChoix(scenario?.id, membership?.coproprietaireId);
  const { data: plan } = useMonPlan(scenario?.id, membership?.coproprietaireId);
  const { data: pieces } = useMesPieces(membership?.coproprietaireId);
  const contextePieces = useContextePieces(membership?.copro.id, membership?.coproprietaireId, membership?.nom);
  const { data: messages } = useMessagesPortail(membership?.copro.id, membership?.coproprietaireId);
  const { data: lectures } = useLectures();

  // Sur téléphone, le menu d'onglets défile à l'horizontale : on y ramène
  // l'onglet actif (ex. « Nous contacter », le dernier, ouvert depuis un lien).
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const actif = nav?.querySelector<HTMLElement>(".pnav.on");
    if (!nav || !actif || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: actif.offsetLeft - (nav.clientWidth - actif.offsetWidth) / 2, behavior: "smooth" });
  }, [section, membership]);

  if (isLoading || !profile) return <Loader />;

  const userName = profile.full_name;
  const initials = profile.initials;

  if (!memberships || memberships.length === 0) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-soft)", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 460 }}>
          <img src="/logo-strateco-pro.png" alt="Strat Eco" style={{ height: 36, marginBottom: 22 }} />
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
    if (isAmo) {
      return (
        <ApercuSelect
          key={coproApercu ?? "toutes"}
          memberships={memberships}
          coproInitiale={coproApercu}
          onPick={(id) => {
            setCpId(id);
            navigate("/portail", { replace: true });
          }}
          onExit={() => navigate("/")}
          onDossier={(id) => navigate(lienVueAmo(id))}
        />
      );
    }
    return (
      <CoproSelect
        memberships={memberships}
        userName={userName}
        initials={initials}
        onPick={(id) => {
          setCpId(id);
          navigate("/portail", { replace: true });
        }}
        onLogout={() => void signOut()}
      />
    );
  }

  const copro = membership.copro;
  const profil = (reponse?.profil_mpr as Profil | null) ?? null;
  const profilMeta = profilMetaDepuisReponse(reponse);
  const enqueteComplete = !!(reponse?.reponses as { complet?: boolean } | null)?.complet;
  // Pièces attendues selon les réponses enregistrées (feedback Marius MAZZANTE
  // 30/09/2026) ; refusée = à redéposer, donc pas fournie (feedback 10/09).
  const attendues = piecesAttendues(reponse?.reponses as ReponsesPieces | null, contextePieces);
  const piecesManquantes = attendues
    .filter((a) => !(pieces ?? []).some((x) => x.type === a.type && x.statut !== "refuse"))
    .map((a) => a.nom);
  // pastilles du menu : « ! » pour une action attendue, le nombre de messages
  // non lus pour l'onglet « Nous contacter »
  const nonLus = compteNonLus(messages, lectures, session?.user.id);
  const flags: Record<string, boolean | number> = {
    enquete: !enqueteComplete || piecesManquantes.length > 0,
    pret: !choix,
    messages: nonLus,
  };

  const go = (s: SectionId) => {
    navigate(s === "accueil" ? "/portail" : `/portail/${s}`);
    window.scrollTo(0, 0);
  };

  const common = { membership, scenarios: scenarios ?? [], scenario, bareme: bareme ?? null, plan: plan ?? null, profil, profilMeta, go };

  return (
    <div className="portal">
      {isAmo && (
        <div className="syndic-preview-bar">
          <Icon name="eye" size={15} />
          Aperçu AMO - portail de {membership.nom} · {copro.name}
          <span style={{ flex: 1 }}></span>
          <button onClick={() => { setCoproApercu(copro.id); setCpId(null); }} title="Choisir un autre copropriétaire de cette copropriété">
            <Icon name="users" size={14} />Changer
          </button>
          <button onClick={() => navigate(lienVueAmo(copro.id))} title="Revenir à ce dossier dans l'espace AMO">
            <Icon name="building" size={14} />Vue AMO
          </button>
          <button onClick={() => navigate("/")}>
            <Icon name="gauge" size={14} />Espace AMO
          </button>
        </div>
      )}
      <header className="portal-header">
        <img className="ph-logo" src="/logo-strateco-pro.png" alt="Strat Eco" />
        <div className="ph-copro">
          <Icon name="building" size={18} style={{ color: "var(--accent)" }} />
          <span className="nm">{copro.name}</span>
          <PhaseBadge phase={copro.phase} />
        </div>
        <span className="ph-spacer"></span>
        {!isAmo && memberships.length > 1 && (
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => setCpId(null)}>
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

      <nav className="portal-nav" ref={navRef}>
        {SECTIONS.map((it) => (
          <button key={it.id} className={"pnav" + (section === it.id ? " on" : "")} onClick={() => go(it.id)}>
            <Icon name={it.icon as never} size={17} />
            {it.label}
            {flags[it.id] ? (
              <span className="pn-badge">{typeof flags[it.id] === "number" ? flags[it.id] : "!"}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <main className="portal-main">
        {section === "accueil" && (
          <Accueil
            {...common}
            userName={isAmo ? membership.nom : userName}
            piecesManquantes={piecesManquantes}
            nbPiecesAttendues={attendues.length}
            choix={choix ?? null}
            enqueteComplete={enqueteComplete}
          />
        )}
        {section === "plan-indiv" && <QuotesParts {...common} />}
        {section === "enquete" && <Enquete membership={membership} bareme={bareme ?? null} />}
        {section === "pret" && <Financement {...common} choix={choix ?? null} />}
        {section === "plan-copro" && <PlanCopro membership={membership} scenarios={scenarios ?? []} bareme={bareme ?? null} />}
        {section === "documents" && <Documents membership={membership} />}
        {section === "faq" && <Faq />}
        {section === "messages" && <Messages membership={membership} />}
      </main>
    </div>
  );
}
