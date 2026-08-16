// Détail d'un dossier copropriété — porté de detail.jsx (CoproDetail).
// Hero photo (upload réel vers Storage) + 6 onglets ; l'onglet vit dans l'URL.
import { useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Badge, DpePair, PhaseBadge, THUMB_BG } from "@/components/ui";
import type { DpeClass } from "@/lib/referentiels";
import { useCopro, usePhotoUrl, useUploadPhoto } from "@/api/copros";
import { ProjetTab } from "./ProjetTab";
import { DonneesTab } from "./DonneesTab";
import { FinancementTab } from "./FinancementTab";
import { EnqueteTab } from "./EnqueteTab";
import { FichiersTab } from "./FichiersTab";
import { CommunicationsTab } from "./CommunicationsTab";

const TABS = [
  { id: "projet", label: "Projet" },
  { id: "donnees", label: "Données de la copro" },
  { id: "financement", label: "Plans de financement" },
  { id: "enquete", label: "Enquête sociale" },
  { id: "fichiers", label: "Fichiers" },
  { id: "communications", label: "Communications" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function CoproDetail() {
  const { id, tab: tabParam } = useParams();
  const navigate = useNavigate();
  const { data: c, isLoading } = useCopro(id);
  const { data: photoUrl } = usePhotoUrl(c?.photo_path ?? null);
  const uploadPhoto = useUploadPhoto(id ?? "");
  const photoRef = useRef<HTMLInputElement>(null);

  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "projet";

  useCrumbs([{ label: "Vos copropriétés", to: "/" }, { label: c?.name ?? "…" }]);

  if (isLoading || !c) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;
  const s = c.stats;

  return (
    <div className="page">
      <div className="detail-hero fade">
        <div className="dh-banner" style={{ position: "relative" }}>
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
              Photo — {c.name}
            </div>
          )}
          <div className="dh-overlay"></div>
          <button
            className="se-btn se-btn-secondary btn-sm"
            style={{ position: "absolute", top: 12, right: 12 }}
            onClick={() => photoRef.current?.click()}
            title="Changer la photo du dossier"
          >
            <Icon name="image" size={14} />
            {uploadPhoto.isPending ? "Envoi…" : "Photo"}
          </button>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && uploadPhoto.mutate(e.target.files[0])}
          />
        </div>
        <div className="dh-body">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <PhaseBadge phase={c.phase} />
              {c.fragile && (
                <Badge kind="warn">
                  <Icon name="alert" size={12} />
                  Fragile
                </Badge>
              )}
              <DpePair before={c.energy_before as DpeClass | null} after={c.energy_after as DpeClass | null} />
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
              <div className="l">bâtiments</div>
            </div>
            <div className="dh-stat">
              <div className="v">{c.progress}%</div>
              <div className="l">avancement</div>
            </div>
          </div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            className={"tab" + (tab === tb.id ? " on" : "")}
            onClick={() => navigate(`/copros/${c.id}/${tb.id}`, { replace: true })}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "projet" && <ProjetTab c={c} />}
      {tab === "donnees" && <DonneesTab c={c} />}
      {tab === "financement" && <FinancementTab c={c} />}
      {tab === "enquete" && <EnqueteTab c={c} />}
      {tab === "fichiers" && <FichiersTab c={c} />}
      {tab === "communications" && <CommunicationsTab c={c} />}
    </div>
  );
}
