// Fiche d'un projet de la maîtrise d'œuvre (espace prestataire) - demande
// d'Amir du 14/10/2026 : un clic sur un projet de « Mes projets » ouvre une vue
// proche de celle du syndic, à six onglets : Projet (mêmes étapes, tâches de la
// MOE à venir), Données de la copro (lecture seule, résumé de la composition),
// Financement (PF définitif validé ou prévisionnel, lots de travaux et TVA),
// Documents à produire (ceux du syndic, en couleur ce que la MOE a à déposer),
// Fichiers et Suivi financier (lecture seule). L'onglet vit dans l'URL
// (/prestataire/projets/:id/:tab?). Données : migration 0165 (périmètre de la
// MOE, aucune donnée personnelle des copropriétaires).
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Badge, DpePair, PhaseBadge } from "@/components/ui";
import type { DpeClass, PhaseId } from "@/lib/referentiels";
import { projetsEnCours, useMesProjetsMoe } from "@/api/espacePrestataire";
import { useCompositionMoe, useCoproMoe } from "@/api/projetMoe";
import { SuiviFinancierTabSyndic } from "@/pages/Syndic/SuiviFinancierTab";
import { ProjetTabMoe } from "./projet/ProjetTab";
import { DonneesTabMoe } from "./projet/DonneesTab";
import { FinancementTabMoe } from "./projet/FinancementTab";
import { DocumentsAProduireMoe } from "./projet/DocumentsAProduire";
import { FichiersTabMoe } from "./projet/FichiersTab";
import type { Tables } from "@/lib/database.types";

const TABS = [
  { id: "projet", label: "Projet" },
  { id: "donnees", label: "Données de la copro" },
  { id: "financement", label: "Financement" },
  { id: "documents", label: "Documents à produire" },
  { id: "fichiers", label: "Fichiers" },
  { id: "suivi", label: "Suivi financier" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ProjetMoeFiche({
  presta,
  coproId,
  tab: tabParam,
}: {
  presta: Tables<"prestataires">;
  coproId: string;
  tab: string | undefined;
}) {
  const navigate = useNavigate();
  const { data: projets, isLoading: projetsLoading } = useMesProjetsMoe(true, presta.id);
  const projet = projetsEnCours(projets ?? []).find((p) => p.copro.id === coproId);
  const { data: c, isLoading } = useCoproMoe(coproId);
  const { data: compo } = useCompositionMoe(coproId, presta.id);
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "projet";

  const retour = (
    <button className="se-btn se-btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={() => navigate("/prestataire/projets")}>
      <Icon name="chevronLeft" size={15} />
      Mes projets
    </button>
  );

  if (projetsLoading || isLoading) return <p className="se-body" style={{ color: "var(--fg-muted)" }}>Chargement…</p>;

  // dossier hors de « Mes projets » (lien ancien, MOE changée) : rien n'est montré
  if (!projet || !c) {
    return (
      <div className="fade">
        {retour}
        <div className="panel" style={{ padding: "22px 24px", display: "flex", gap: 14, alignItems: "flex-start" }}>
          <Icon name="lock" size={22} style={{ color: "var(--fg-muted)", flex: "none" }} />
          <div>
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontFamily: "var(--font-display)" }}>Projet introuvable</h2>
            <p className="se-body" style={{ margin: 0 }}>
              Ce dossier ne fait pas partie de vos projets en cours. Si vous pensez qu'il s'agit d'une erreur,
              écrivez à l'équipe Strat Eco depuis « Messages ».
            </p>
          </div>
        </div>
      </div>
    );
  }

  const lieu = [c.adresse?.trim(), [c.code_postal, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const nbBatiments = compo?.batiments.length ?? projet.batiments.length;

  return (
    <div className="fade moe-fiche">
      {retour}

      <div className="detail-hero moe-hero">
        <div className="dh-body">
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
              <PhaseBadge phase={c.phase as PhaseId} />
              {c.fragile && (
                <Badge kind="warn">
                  <Icon name="alert" size={12} />
                  Fragile
                </Badge>
              )}
              <DpePair before={c.energy_before as DpeClass | null} after={c.energy_after as DpeClass | null} />
              <Badge kind="success" dot>
                {projet.candidature?.engagement_at ? "MOE retenue" : "Maîtrise d'œuvre désignée"}
              </Badge>
            </div>
            <h1 className="dh-title">{c.name}</h1>
            <div className="dh-equipe">
              <span>
                <Icon name="mapPin" size={14} />
                {lieu || <i>Adresse à compléter</i>}
              </span>
              {c.syndic_name && (
                <span>
                  <Icon name="building" size={14} />
                  Syndic : <b>{c.syndic_name}</b>
                </span>
              )}
              <span>
                <Icon name="user" size={14} />
                Chargé de projet Strat Eco : {c.chef_projet?.trim() ? <b>{c.chef_projet}</b> : <i>non attribué</i>}
              </span>
            </div>
          </div>
          <div className="dh-stats">
            <div className="dh-stat">
              <div className="v">{compo?.nb_logements ?? c.nb_logements ?? "-"}</div>
              <div className="l">logements</div>
            </div>
            <div className="dh-stat">
              <div className="v">{compo?.nb_lots ?? "-"}</div>
              <div className="l">lots</div>
            </div>
            <div className="dh-stat">
              <div className="v">{nbBatiments}</div>
              <div className="l">{c.denomination_batiments === "entree" ? "entrées" : "bâtiments"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            className={"tab" + (tab === tb.id ? " on" : "")}
            onClick={() => navigate(`/prestataire/projets/${c.id}/${tb.id}`, { replace: true })}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "projet" && <ProjetTabMoe c={c} projet={projet} />}
      {tab === "donnees" && <DonneesTabMoe c={c} presta={presta} />}
      {tab === "financement" && <FinancementTabMoe c={c} presta={presta} />}
      {tab === "documents" && <DocumentsAProduireMoe c={c} presta={presta} />}
      {tab === "fichiers" && <FichiersTabMoe c={c} presta={presta} />}
      {tab === "suivi" && <SuiviFinancierTabSyndic c={c} lectureSeule />}
    </div>
  );
}
