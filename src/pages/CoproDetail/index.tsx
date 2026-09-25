// Détail d'un dossier copropriété - porté de detail.jsx (CoproDetail).
// Hero photo (upload réel vers Storage) + 6 onglets ; l'onglet vit dans l'URL.
// Photo : cadrage choisi à l'import et modifiable ensuite (bouton « Recadrer »,
// feedback Amir 24/09/2026), la photo d'origine est conservée.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Badge, DpePair, PhaseBadge, THUMB_BG } from "@/components/ui";
import type { DpeClass, PhaseId } from "@/lib/referentiels";
import { useAuth } from "@/auth/AuthProvider";
import { avancementAmo, useCadrerPhoto, useCopro, useMettreCorbeille, usePhotoUrl, useUploadPhoto } from "@/api/copros";
import { PhotoCadree, RecadrerPhoto, ratioBandeau } from "@/components/PhotoCadrage";
import { lireCadrage } from "@/lib/photoCadrage";
import { messageErreur } from "@/lib/erreurs";
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

/**
 * Phase du dossier : calculée d'après le plan de tâches de l'onglet Projet
 * (trigger taches_recalcule_phase, 0065) - feedback d'Amir du 09/09/2026. Un
 * dossier reste en Études tant qu'une tâche d'Études n'est pas cochée ; il
 * passe en Travaux quand tout ce qui précède est fait.
 */
function PhaseCalculee({ phase }: { phase: PhaseId }) {
  return (
    <span
      title="Phase calculée d'après les tâches de l'onglet Projet : le dossier avance quand toutes les tâches de la phase en cours sont cochées."
      style={{ display: "inline-flex" }}
    >
      <PhaseBadge phase={phase} />
    </span>
  );
}

export default function CoproDetail() {
  const { id, tab: tabParam } = useParams();
  const navigate = useNavigate();
  const { data: c, isLoading } = useCopro(id);
  const { data: photoUrl } = usePhotoUrl(c?.photo_path ?? null);
  const uploadPhoto = useUploadPhoto(id ?? "");
  const cadrerPhoto = useCadrerPhoto(id ?? "");
  const corbeille = useMettreCorbeille();
  const photoRef = useRef<HTMLInputElement>(null);
  // fenêtre de cadrage : photo choisie (pas encore envoyée) ou photo en place
  const [cadrageOuvert, setCadrageOuvert] = useState<{ file: File | null; src: string; ratio: number } | null>(null);
  const [erreurPhoto, setErreurPhoto] = useState<string | null>(null);
  const fichierSrc = cadrageOuvert?.file ? cadrageOuvert.src : null;
  useEffect(() => () => {
    if (fichierSrc) URL.revokeObjectURL(fichierSrc);
  }, [fichierSrc]);
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
      {/* fenêtre rendue hors du bandeau (animé) pour rester centrée à l'écran */}
      {cadrageOuvert && (
        <RecadrerPhoto
          src={cadrageOuvert.src}
          initial={cadrageOuvert.file ? undefined : lireCadrage(c.photo_cadrage)}
          ratio={cadrageOuvert.ratio}
          nouvelle={!!cadrageOuvert.file}
          enCours={uploadPhoto.isPending || cadrerPhoto.isPending}
          erreur={erreurPhoto}
          onClose={() => setCadrageOuvert(null)}
          onValider={(cadrage) => {
            const f = cadrageOuvert.file;
            const envoi = f ? uploadPhoto.mutateAsync({ file: f, cadrage }) : cadrerPhoto.mutateAsync(cadrage);
            envoi.then(
              () => setCadrageOuvert(null),
              (err: unknown) => setErreurPhoto(messageErreur(err, "L'enregistrement de la photo a échoué. Réessayez."))
            );
          }}
        />
      )}
      <div className="detail-hero fade">
        <div className="dh-banner" style={{ position: "relative" }}>
          {photoUrl ? (
            <PhotoCadree src={photoUrl} cadrage={lireCadrage(c.photo_cadrage)} />
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
          <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8 }}>
            <button
              className="se-btn se-btn-secondary btn-sm"
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
            {photoUrl && (
              <button
                className="se-btn se-btn-secondary btn-sm"
                title="Choisir la partie de la photo visible dans le bandeau et sur les cartes"
                onClick={() => {
                  setErreurPhoto(null);
                  setCadrageOuvert({ file: null, src: photoUrl, ratio: ratioBandeau() });
                }}
              >
                <Icon name="crop" size={14} />
                Recadrer
              </button>
            )}
            <button
              className="se-btn se-btn-secondary btn-sm"
              onClick={() => photoRef.current?.click()}
              title="Changer la photo du dossier"
            >
              <Icon name="image" size={14} />
              {uploadPhoto.isPending ? "Envoi…" : "Photo"}
            </button>
          </div>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setErreurPhoto(null);
              setCadrageOuvert({ file: f, src: URL.createObjectURL(f), ratio: ratioBandeau() });
            }}
          />
        </div>
        <div className="dh-body">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <PhaseCalculee phase={c.phase} />
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
