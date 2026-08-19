// Espace prestataire (MOE & autres intervenants) — même chrome que le portail
// copropriétaire. Le prestataire ne voit que les consultations EN LIGNE de ses
// métiers et ses candidatures ; la section « Mes projets » n'existe que pour
// une MOE (accès lecture aux copros où elle a été retenue). Les autres
// intervenants n'ont AUCUN accès aux projets en cours.
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useLogoPresta, useMesCandidatures, useMonPrestataire } from "@/api/espacePrestataire";
import { CONSULT_TYPES } from "@/api/consultations";
import { usePrestataires } from "@/api/prestataires";
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

  const isLoading = isAmo ? tousLoading : monLoading;
  const presta = isAmo ? (tous ?? []).find((p) => p.id === previewId) ?? null : (monPresta ?? null);
  const { data: logoUrl } = useLogoPresta(presta?.logo_path ?? null);

  if (isLoading || !profile) return <Loader />;

  if (isAmo && !presta) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-soft)", display: "flex", flexDirection: "column" }}>
        <div className="portal-header">
          <img className="ph-logo" src="/logo-strateco-pro.png" alt="Strat Eco" />
          <span className="ph-spacer"></span>
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => navigate("/")}>
            <Icon name="gauge" size={15} />Espace AMO
          </button>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
          <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
            <div className="se-eyebrow" style={{ justifyContent: "center" }}>Aperçu AMO</div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, margin: "10px 0 8px", letterSpacing: "-0.02em" }}>
              Espace prestataire
            </h1>
            <p className="se-body" style={{ marginTop: 0, marginBottom: 28 }}>
              Choisissez une entreprise référencée pour consulter son espace tel qu'elle le voit.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 440, overflowY: "auto", padding: 2 }}>
              {(tous ?? []).map((p) => (
                <button
                  key={p.id}
                  className="copro-card"
                  onClick={() => setPreviewId(p.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", textAlign: "left", cursor: "pointer", border: "1px solid var(--border)" }}
                >
                  <Icon name="briefcase" size={18} style={{ color: "var(--fg-muted)", flex: "none" }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 14 }}>{p.raison_sociale}</span>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--fg3)" }}>
                      {p.types.map((t) => CONSULT_TYPES.find((x) => x.id === t)?.label ?? t).join(" · ")}
                    </span>
                  </span>
                  {!p.actif && <Badge kind="neutral">Suspendue</Badge>}
                  <Icon name="arrowRight" size={17} style={{ color: "var(--accent)" }} />
                </button>
              ))}
            </div>
          </div>
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
          Aperçu AMO — espace de {presta.raison_sociale}
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
            {it.id === "messages" && <PastilleMessages presta={presta} />}
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
