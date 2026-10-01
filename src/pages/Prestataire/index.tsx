// Espace prestataire (MOE & autres intervenants) - même chrome que le portail
// copropriétaire. Le prestataire ne voit que les consultations EN LIGNE de ses
// métiers et ses candidatures ; la section « Mes projets » n'existe que pour
// une MOE (accès lecture aux copros où elle a été retenue ou dont elle est le
// maître d'œuvre saisi). Les autres
// intervenants n'ont AUCUN accès aux projets en cours.
import { useMemo, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import {
  projetsEnCours,
  useDocsPresta,
  useLogoPresta,
  useMesCandidatures,
  useMesProjetsMoe,
  useMonPrestataire,
} from "@/api/espacePrestataire";
import { CONSULT_TYPES } from "@/api/consultations";
import { usePrestataires } from "@/api/prestataires";
import { filtrerEntreprises } from "@/lib/prestataires";
import { compteNonLus, useLectures, useMessagesPresta } from "@/api/messages";
import { ConsultationsPresta } from "./Consultations";
import { MesCandidatures } from "./MesCandidatures";
import { MesProjets } from "./MesProjets";
import { Messages } from "./Messages";
import { MonEntreprise } from "./MonEntreprise";
import type { Tables } from "@/lib/database.types";

export type SectionId = "consultations" | "candidatures" | "projets" | "messages" | "entreprise";

/** Pastille de messages non lus sur l'entrée « Messages » du menu. */
function PastilleMessages({ presta }: { presta: Tables<"prestataires"> }) {
  const { session } = useAuth();
  const { data: candidatures } = useMesCandidatures(presta.id);
  const coproIds = useMemo(
    () =>
      [...new Set(
        (candidatures ?? [])
          .filter((c) => c.statut === "retenue" && c.consultation?.copro)
          .map((c) => c.consultation!.copro!.id)
      )],
    [candidatures]
  );
  const { data: messages } = useMessagesPresta(presta.id, coproIds);
  const { data: lectures } = useLectures();
  const nonLus = compteNonLus(messages, lectures, session?.user.id);
  if (nonLus === 0) return null;
  return (
    <span
      title={`${nonLus} message${nonLus > 1 ? "s" : ""} non lu${nonLus > 1 ? "s" : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 17,
        height: 17,
        padding: "0 5px",
        borderRadius: 9,
        background: "var(--accent)",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {nonLus}
    </span>
  );
}

const pastilleStyle = (background: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 17,
  height: 17,
  padding: "0 5px",
  borderRadius: 9,
  background,
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
});

/** Bulle « Mes projets » : nombre de projets en cours de l'entreprise (même
 *  requête que la page, partagée par le cache). */
function PastilleProjets({ presta }: { presta: Tables<"prestataires"> }) {
  const { data: projets } = useMesProjetsMoe(true, presta.id);
  const n = projetsEnCours(projets ?? []).length;
  if (n === 0) return null;
  return (
    <span title={`${n} projet${n > 1 ? "s" : ""} en cours`} style={pastilleStyle("var(--color-primary-700)")}>
      {n}
    </span>
  );
}

/** Pastille « sélectionné / refusé » : décisions pas encore vues (l'ouverture
 *  de « Mes candidatures » en accuse réception). */
function PastilleDecisions({ presta }: { presta: Tables<"prestataires"> }) {
  const { data: candidatures } = useMesCandidatures(presta.id);
  const n = (candidatures ?? []).filter(
    (c) => !c.retrait_at && c.statut !== "recue" && !c.decision_vue_at
  ).length;
  if (n === 0) return null;
  return (
    <span
      title={`${n} décision${n > 1 ? "s" : ""} sur vos candidatures (retenue ou refusée)`}
      style={pastilleStyle("var(--accent)")}
    >
      {n}
    </span>
  );
}

/** Pastille « documents à renouveler » : certifications expirées ou expirant
 *  sous 60 jours (la date se met à jour dans « Mon entreprise »). */
function PastilleEntreprise({ presta }: { presta: Tables<"prestataires"> }) {
  const { data: docs } = useDocsPresta(presta.id);
  const horizon = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const n = (docs ?? []).filter((d) => d.expire_le && d.expire_le <= horizon).length;
  if (n === 0) return null;
  return (
    <span
      title={`${n} document${n > 1 ? "s" : ""} expiré${n > 1 ? "s" : ""} ou en fin de validité`}
      style={pastilleStyle("var(--color-warning-500, #e8a13c)")}
    >
      {n}
    </span>
  );
}

function Loader() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", color: "var(--fg-muted)" }}>
      Chargement…
    </div>
  );
}

export default function Prestataire() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { section: sectionParam } = useParams();

  const isAmo = profile?.role === "amo";
  const { data: monPresta, isLoading: monLoading } = useMonPrestataire(!isAmo);
  // aperçu AMO : choisir l'entreprise dont on consulte l'espace
  const { data: tous, isLoading: tousLoading } = usePrestataires();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");

  const isLoading = isAmo ? tousLoading : monLoading;
  const presta = isAmo ? (tous ?? []).find((p) => p.id === previewId) ?? null : (monPresta ?? null);
  const { data: logoUrl } = useLogoPresta(presta?.logo_path ?? null);

  if (isLoading || !profile) return <Loader />;

  if (isAmo && !presta) {
    const metiersDe = (p: Tables<"prestataires">) =>
      p.types.map((t) => CONSULT_TYPES.find((x) => x.id === t)?.label ?? t).join(" · ");
    const q = recherche.trim();
    const liste = filtrerEntreprises(tous ?? [], recherche, metiersDe);
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-soft)", display: "flex", flexDirection: "column" }}>
        <div className="portal-header">
          <img className="ph-logo" src="/logo-strateco-pro.png" alt="Strat Eco" />
          <span className="ph-spacer"></span>
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate("/")}>
            <Icon name="gauge" size={15} />Espace AMO
          </button>
        </div>
        <div className="presta-choix-page">
          <div style={{ textAlign: "center" }}>
            <div className="se-eyebrow" style={{ justifyContent: "center" }}>Aperçu AMO</div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, margin: "10px 0 8px", letterSpacing: "-0.02em" }}>
              Espace prestataire
            </h1>
            <p className="se-body" style={{ marginTop: 0, marginBottom: 20 }}>
              Choisissez une entreprise référencée pour consulter son espace tel qu'elle le voit.
            </p>
          </div>
          <div className="search presta-choix-search">
            <Icon name="search" size={16} />
            <input
              autoFocus
              placeholder="Rechercher une entreprise, un métier, une ville…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              // Entrée : ouvre l'entreprise quand la recherche n'en laisse qu'une
              onKeyDown={(e) => {
                if (e.key === "Enter" && liste.length === 1) setPreviewId(liste[0].id);
              }}
            />
            {recherche && (
              <button className="icon-btn" style={{ width: 24, height: 24 }} title="Effacer la recherche" onClick={() => setRecherche("")}>
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
          <p className="se-small" style={{ textAlign: "center", color: "var(--fg-muted)", margin: "0 0 14px" }}>
            {q
              ? `${liste.length} entreprise${liste.length > 1 ? "s" : ""} sur ${(tous ?? []).length}`
              : `${liste.length} entreprise${liste.length > 1 ? "s" : ""} référencée${liste.length > 1 ? "s" : ""}`}
          </p>
          <div className="presta-choix">
            {liste.map((p) => (
              <button key={p.id} className="copro-card" onClick={() => setPreviewId(p.id)}>
                <Icon name="briefcase" size={18} style={{ color: "var(--fg-muted)", flex: "none" }} />
                <span className="pc-txt">
                  <span className="pc-nom">{p.raison_sociale}</span>
                  <span className="pc-metiers">{metiersDe(p)}</span>
                </span>
                {!p.actif && <Badge kind="neutral">Suspendue</Badge>}
                <Icon name="arrowRight" size={17} style={{ color: "var(--accent)", flex: "none" }} />
              </button>
            ))}
          </div>
          {liste.length === 0 && (
            <p className="se-body" style={{ textAlign: "center", color: "var(--fg-muted)" }}>
              Aucune entreprise ne correspond à « {q} ».
            </p>
          )}
        </div>
      </div>
    );
  }

  // compte connecté mais pas rattaché à une entreprise référencée
  if (!presta) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-soft)", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 460 }}>
          <img src="/logo-strateco-pro.png" alt="Strat Eco" style={{ height: 36, marginBottom: 22 }} />
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, margin: "0 0 10px" }}>
            Aucune entreprise rattachée
          </h1>
          <p className="se-body">
            Votre compte n'est pas encore relié à une entreprise référencée. Contactez l'équipe Strat Eco.
          </p>
          <button className="se-btn se-btn-secondary" style={{ marginTop: 14 }} onClick={() => void signOut()}>
            <Icon name="logOut" size={16} />Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  const isMoe = presta.types.includes("moe");
  const sections: { id: SectionId; label: string; icon: IconName }[] = [
    { id: "consultations", label: "Consultations en cours", icon: "megaphone" },
    { id: "candidatures", label: "Mes candidatures", icon: "send" },
    ...(isMoe ? [{ id: "projets" as SectionId, label: "Mes projets", icon: "building" as IconName }] : []),
    { id: "messages", label: "Messages", icon: "message" },
    { id: "entreprise", label: "Mon entreprise", icon: "briefcase" },
  ];
  const section: SectionId = (sections.some((s) => s.id === sectionParam) ? sectionParam : "consultations") as SectionId;

  const metiers = presta.types
    .map((t) => CONSULT_TYPES.find((x) => x.id === t)?.label ?? t)
    .join(" · ");

  const go = (s: SectionId) => {
    navigate(s === "consultations" ? "/prestataire" : `/prestataire/${s}`);
    document.querySelector(".portal-main")?.scrollTo?.(0, 0);
  };

  return (
    <div className="portal">
      {isAmo && (
        <div className="syndic-preview-bar">
          <Icon name="eye" size={15} />
          Aperçu AMO - espace de {presta.raison_sociale}
          <span style={{ flex: 1 }}></span>
          <button onClick={() => setPreviewId(null)}>
            <Icon name="briefcase" size={14} />Changer
          </button>
          <button onClick={() => navigate("/")}>
            <Icon name="gauge" size={14} />Espace AMO
          </button>
        </div>
      )}
      <header className="portal-header">
        <img className="ph-logo" src="/logo-strateco-pro.png" alt="Strat Eco" />
        <div className="ph-copro">
          {logoUrl ? (
            <img src={logoUrl} alt="" style={{ height: 26, maxWidth: 90, objectFit: "contain" }} />
          ) : (
            <Icon name="briefcase" size={18} style={{ color: "var(--accent)" }} />
          )}
          <span className="nm">{presta.raison_sociale}</span>
        </div>
        <span className="ph-spacer"></span>
        <div className="ph-user">
          <Avatar who={profile.initials} name={profile.full_name} />
          <span>
            <span className="nm" style={{ display: "block" }}>{profile.full_name}</span>
            <span className="rl">{metiers || "Prestataire"}</span>
          </span>
          <button className="icon-btn" onClick={() => void signOut()} title="Se déconnecter">
            <Icon name="logOut" size={18} />
          </button>
        </div>
      </header>

      <nav className="portal-nav">
        {sections.map((it) => (
          <button key={it.id} className={"pnav" + (section === it.id ? " on" : "")} onClick={() => go(it.id)}>
            <Icon name={it.icon} size={17} />
            {it.label}
            {it.id === "candidatures" && <PastilleDecisions presta={presta} />}
            {it.id === "projets" && <PastilleProjets presta={presta} />}
            {it.id === "messages" && <PastilleMessages presta={presta} />}
            {it.id === "entreprise" && <PastilleEntreprise presta={presta} />}
          </button>
        ))}
      </nav>

      <main className="portal-main">
        {section === "consultations" && <ConsultationsPresta presta={presta} />}
        {section === "candidatures" && <MesCandidatures presta={presta} />}
        {section === "projets" && isMoe && <MesProjets presta={presta} />}
        {section === "messages" && <Messages presta={presta} />}
        {section === "entreprise" && <MonEntreprise presta={presta} />}
      </main>
    </div>
  );
}
