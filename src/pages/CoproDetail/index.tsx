// Détail d'un dossier copropriété - porté de detail.jsx (CoproDetail).
// Hero photo (upload réel vers Storage) + 6 onglets ; l'onglet vit dans l'URL.
import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Badge, DpePair, PhaseBadge, THUMB_BG } from "@/components/ui";
import { PHASES, type DpeClass, type PhaseId } from "@/lib/referentiels";
import { useAuth } from "@/auth/AuthProvider";
import {
  avancementAmo,
  useCopro,
  useMettreCorbeille,
  usePhotoUrl,
  useUpdateCopro,
  useUploadPhoto,
  type CoproWithStats,
} from "@/api/copros";
import { useTaches } from "@/api/taches";
import { useConsultations } from "@/api/consultations";
import { compteNonLus, useLectures, useMessagesCopro } from "@/api/messages";
import { ProjetTab } from "./ProjetTab";
import { PrestatairesTab } from "./PrestatairesTab";
import { DonneesTab } from "./DonneesTab";
import { FinancementTab } from "./FinancementTab";
import { EnqueteTab } from "./EnqueteTab";
import { CoproprietairesTab } from "./CoproprietairesTab";
import { FichiersTab } from "./FichiersTab";
import { CommunicationsTab } from "./CommunicationsTab";

const TABS = [
  { id: "projet", label: "Projet" },
  { id: "donnees", label: "Données de la copro" },
  { id: "financement", label: "Plans de financement" },
  { id: "enquete", label: "Enquête sociale" },
  { id: "coproprietaires", label: "Copropriétaires" },
  { id: "prestataires", label: "Prestataires" },
  { id: "fichiers", label: "Fichiers" },
  { id: "communications", label: "Communications" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const RANG_PHASE: Record<PhaseId, number> = { diagnostic: 0, etudes: 1, travaux: 2 };

/**
 * Phase du dossier, modifiable depuis l'en-tête (feedback d'Amir du 09/09/2026 :
 * aucun écran ne permettait de faire avancer un dossier). Règle : on ne passe
 * à une phase que si toutes les tâches du plan des phases précédentes sont
 * faites - verrouillée ici et par le trigger coproprietes_verifie_phase (0064).
 * Revenir en arrière reste libre. Un dossier déjà incohérent (phase avancée
 * alors que des tâches antérieures restent à cocher) est signalé.
 */
function PhaseControl({ c }: { c: CoproWithStats }) {
  const { data: taches } = useTaches(c.id);
  const update = useUpdateCopro(c.id);
  const [open, setOpen] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // tâches non faites des phases strictement antérieures à la phase visée
  const restantes = (cible: PhaseId) =>
    (taches ?? []).filter((t) => t.status !== "done" && RANG_PHASE[t.phase as PhaseId] < RANG_PHASE[cible]);
  const incoherentes = restantes(c.phase);

  const changer = async (p: PhaseId) => {
    setErreur(null);
    if (RANG_PHASE[p] < RANG_PHASE[c.phase] && !window.confirm(`Revenir le dossier en phase ${PHASES.find((x) => x.id === p)?.label} ?`)) return;
    try {
      await update.mutateAsync({ phase: p });
      setOpen(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le changement de phase a échoué.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Changer la phase du dossier"
          style={{ background: "none", border: 0, padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <PhaseBadge phase={c.phase} />
          <Icon name={open ? "chevronUp" : "chevronDown"} size={13} style={{ color: "var(--fg-muted)" }} />
        </button>
        {incoherentes.length > 0 && (
          <Badge kind="warn">
            <Icon name="alert" size={12} />
            {incoherentes.length} tâche{incoherentes.length > 1 ? "s" : ""} des phases précédentes à cocher
          </Badge>
        )}
      </div>
      {open && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {PHASES.map((p) => {
            const courante = p.id === c.phase;
            const bloquantes = restantes(p.id).length;
            const bloque = !courante && RANG_PHASE[p.id] > RANG_PHASE[c.phase] && bloquantes > 0;
            return (
              <button
                key={p.id}
                type="button"
                className={"se-btn btn-sm " + (courante ? "se-btn-primary" : "se-btn-secondary")}
                disabled={courante || bloque || update.isPending}
                title={
                  courante
                    ? "Phase actuelle"
                    : bloque
                      ? `${bloquantes} tâche${bloquantes > 1 ? "s" : ""} des phases précédentes ${bloquantes > 1 ? "restent" : "reste"} à cocher dans l'onglet Projet`
                      : `Passer le dossier en phase ${p.label}`
                }
                onClick={() => void changer(p.id)}
              >
                {p.label}
                {bloque && <Icon name="lock" size={12} />}
              </button>
            );
          })}
          <span className="se-small" style={{ color: "var(--fg-muted)" }}>
            Une phase ne s'ouvre que lorsque toutes les tâches des phases précédentes sont cochées.
          </span>
        </div>
      )}
      {erreur && (
        <p style={{ margin: 0, padding: "6px 10px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13 }}>
          {erreur}
        </p>
      )}
    </div>
  );
}

export default function CoproDetail() {
  const { id, tab: tabParam } = useParams();
  const navigate = useNavigate();
  const { data: c, isLoading } = useCopro(id);
  const { data: photoUrl } = usePhotoUrl(c?.photo_path ?? null);
  const uploadPhoto = useUploadPhoto(id ?? "");
  const corbeille = useMettreCorbeille();
  const photoRef = useRef<HTMLInputElement>(null);
  // pastille de l'onglet Prestataires : questions de candidats sans réponse
  const { data: consultations } = useConsultations();
  const questionsEnAttente = (consultations ?? [])
    .filter((cs) => cs.copro_id === id && cs.statut === "en_ligne")
    .reduce((n, cs) => n + cs.questions.filter((q) => !q.reponse).length, 0);
  // pastille de l'onglet Communications : messages reçus depuis la dernière
  // lecture du fil (l'ouverture de l'onglet marque le fil comme lu)
  const { session } = useAuth();
  const { data: messages } = useMessagesCopro(id);
  const { data: lectures } = useLectures();
  const messagesNonLus = compteNonLus(messages, lectures, session?.user.id);

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
              Photo - {c.name}
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
          <button
            className="se-btn se-btn-secondary btn-sm"
            style={{ position: "absolute", top: 12, right: 96 }}
            title="Mettre le dossier à la corbeille"
            disabled={corbeille.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Mettre « ${c.name} » à la corbeille ?\n\nLe dossier disparaîtra des espaces syndic, copropriétaires et prestataires. Vous pourrez le restaurer à tout moment depuis la corbeille du tableau de bord.`
                )
              ) {
                void corbeille.mutateAsync(c.id).then(() => navigate("/"));
              }
            }}
          >
            <Icon name="trash" size={14} />
            {corbeille.isPending ? "…" : "Corbeille"}
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
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <PhaseControl c={c} />
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
              <div className="l">{c.denomination_batiments === "entree" ? "entrées" : "bâtiments"}</div>
            </div>
            <div
              className="dh-stat"
              title={`${s?.taches_faites ?? 0} tâche${(s?.taches_faites ?? 0) > 1 ? "s" : ""} faite${(s?.taches_faites ?? 0) > 1 ? "s" : ""} sur ${s?.taches_total ?? 0} (plan de tâches de l'onglet Projet, toutes phases)`}
            >
              <div className="v">{avancementAmo(c)}%</div>
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
            {tb.id === "prestataires" && questionsEnAttente > 0 && (
              <span
                title={`${questionsEnAttente} question${questionsEnAttente > 1 ? "s" : ""} de prestataire sans réponse`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 17,
                  height: 17,
                  padding: "0 5px",
                  marginLeft: 6,
                  borderRadius: 9,
                  background: "var(--color-warning-500, #e8a13c)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {questionsEnAttente}
              </span>
            )}
            {tb.id === "communications" && messagesNonLus > 0 && (
              <span
                title={`${messagesNonLus} nouveau${messagesNonLus > 1 ? "x" : ""} message${messagesNonLus > 1 ? "s" : ""}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 17,
                  height: 17,
                  padding: "0 5px",
                  marginLeft: 6,
                  borderRadius: 9,
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {messagesNonLus}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "projet" && <ProjetTab c={c} />}
      {tab === "donnees" && <DonneesTab c={c} />}
      {tab === "financement" && <FinancementTab c={c} />}
      {tab === "enquete" && <EnqueteTab c={c} />}
      {tab === "coproprietaires" && <CoproprietairesTab c={c} />}
      {tab === "prestataires" && <PrestatairesTab c={c} />}
      {tab === "fichiers" && <FichiersTab c={c} />}
      {tab === "communications" && <CommunicationsTab c={c} />}
    </div>
  );
}
