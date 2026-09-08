// Détail d'une copropriété du portefeuille syndic - hero + 6 onglets.
// Tout est en lecture seule sauf « Documents à produire » (montage bancaire), où le syndic dépose
// les documents du dossier de prêt. L'onglet vit dans l'URL (/syndic/copros/:id/:tab?).
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge, DpePair, PhaseBadge, THUMB_BG } from "@/components/ui";
import type { DpeClass } from "@/lib/referentiels";
import { avancementSyndic, usePhotoUrl } from "@/api/copros";
import { phaseAvancement, useSyndicTaches } from "@/api/syndicTaches";
import { useCoproSyndic, type SyndicCopro } from "@/api/syndic";
import { SyndicShell, Loader, AucuneCopro } from "./index";
import { ProjetTabSyndic } from "./ProjetTab";
import { DonneesTabSyndic } from "./DonneesTab";
import { EnqueteTabSyndic } from "./EnqueteTab";
import { FinancementTabSyndic } from "./FinancementTab";
import { MontageTabSyndic } from "./MontageTab";
import { FichiersTabSyndic } from "./FichiersTab";
import { SuiviFinancierTabSyndic } from "./SuiviFinancierTab";

const TABS = [
  { id: "projet", label: "Projet" },
  { id: "donnees", label: "Données de la copro" },
  { id: "enquete", label: "Enquête sociale" },
  { id: "financement", label: "Financement" },
  { id: "banque", label: "Documents à produire" },
  { id: "fichiers", label: "Fichiers" },
  { id: "suivi", label: "Suivi financier" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Dossier du portefeuille de l'enseigne que l'utilisateur ne peut pas ouvrir
 * (feedback Amir 08/09 : la vue portefeuille est commune à toute l'enseigne,
 * l'ouverture des dossiers reste réservée à la direction et au gestionnaire
 * rattaché). La RLS ferme de toute façon les données du dossier.
 */
function AccesReserve({ c }: { c: SyndicCopro }) {
  const navigate = useNavigate();
  return (
    <SyndicShell active={null}>
      <div className="page fade" style={{ padding: 0 }}>
        <button className="se-btn se-btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={() => navigate("/syndic")}>
          <Icon name="chevronLeft" size={15} />
          Portefeuille
        </button>
        <div className="panel" style={{ padding: "22px 24px", display: "flex", gap: 14, alignItems: "flex-start" }}>
          <Icon name="lock" size={22} style={{ color: "var(--fg-muted)", flex: "none" }} />
          <div>
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontFamily: "var(--font-display)" }}>{c.name}</h2>
            <p className="se-body" style={{ margin: 0 }}>
              Ce dossier fait partie du portefeuille de votre enseigne, mais il est suivi par{" "}
              <b>{c.gestionnaire_nom || "un autre gestionnaire"}</b>. Seule la direction et le gestionnaire en
              charge peuvent l'ouvrir.
            </p>
          </div>
        </div>
      </div>
    </SyndicShell>
  );
}

export default function CoproSyndic() {
  const { id, tab: tabParam } = useParams();
  const navigate = useNavigate();
  const { data: c, isLoading } = useCoproSyndic(id);
  const { data: photoUrl } = usePhotoUrl(c?.photo_path ?? null);
  // Le badge de phase suit l'avancement des tâches, comme la pastille
  // « En cours » de l'onglet Projet et les vues du portefeuille (feedback 29/08).
  const { data: taches } = useSyndicTaches(id ? [id] : []);

  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "projet";

  if (isLoading) return <Loader />;
  if (!c) return <AucuneCopro />;
  if (!c.acces) return <AccesReserve c={c} />;
  const s = c.stats;
  const phase = phaseAvancement(c.phase, taches ?? []);

  return (
    <SyndicShell active={null}>
      <div className="page fade" style={{ padding: 0 }}>
        <button
          className="se-btn se-btn-ghost btn-sm"
          style={{ marginBottom: 14 }}
          onClick={() => navigate("/syndic")}
        >
          <Icon name="chevronLeft" size={15} />
          Portefeuille
        </button>

        <div className="detail-hero">
          <div className="dh-banner">
            {photoUrl ? (
              <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: THUMB_BG,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-primary-700)",
                  gap: 8,
                }}
              >
                <Icon name="image" size={18} />
                Photo - {c.name}
              </div>
            )}
            <div className="dh-overlay"></div>
          </div>
          <div className="dh-body">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <PhaseBadge phase={phase} />
                {c.fragile && (
                  <Badge kind="warn">
                    <Icon name="alert" size={12} />
                    Fragile
                  </Badge>
                )}
                <DpePair before={c.energy_before as DpeClass | null} after={c.energy_after as DpeClass | null} />
                <Badge kind="neutral">
                  <Icon name="building" size={12} />
                  Syndic
                </Badge>
              </div>
              <h1 className="dh-title">{c.name}</h1>
              <div className="dh-loc">
                <Icon name="mapPin" size={15} />
                {[[c.code_postal, c.city].filter(Boolean).join(" "), c.syndic_name].filter(Boolean).join(" · ") || "À compléter"}
              </div>
            </div>
            <div className="dh-stats">
              <div className="dh-stat">
                <div className="v">{s?.lots ?? 0}</div>
                <div className="l">lots</div>
              </div>
              <div className="dh-stat">
                <div className="v">{s?.coproprietaires ?? 0}</div>
                <div className="l">copropriétaires</div>
              </div>
              <div className="dh-stat">
                <div className="v">{s?.batiments ?? 0}</div>
                <div className="l">{c.denomination_batiments === "entree" ? "entrées" : "bâtiments"}</div>
              </div>
              <div className="dh-stat">
                <div className="v">{avancementSyndic(c)}%</div>
                <div className="l">avancement de vos tâches</div>
              </div>
            </div>
          </div>
        </div>

        <div className="tabs">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              className={"tab" + (tab === tb.id ? " on" : "")}
              onClick={() => navigate(`/syndic/copros/${c.id}/${tb.id}`, { replace: true })}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {tab === "projet" && <ProjetTabSyndic c={c} />}
        {tab === "donnees" && <DonneesTabSyndic c={c} />}
        {tab === "enquete" && <EnqueteTabSyndic c={c} />}
        {tab === "financement" && <FinancementTabSyndic c={c} />}
        {tab === "banque" && <MontageTabSyndic c={c} />}
        {tab === "fichiers" && <FichiersTabSyndic c={c} />}
        {tab === "suivi" && <SuiviFinancierTabSyndic c={c} />}
      </div>
    </SyndicShell>
  );
}
