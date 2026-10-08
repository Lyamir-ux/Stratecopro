// Pièces et documents du portail copropriétaire.
//
// L'onglet « Mes documents » a été retiré (feedback Amir 22/09/2026) : l'identité
// et le RIB sont désormais demandés par la banque sur son propre parcours de
// souscription. Les pièces justificatives encore attendues du copropriétaire se
// déposent dans l'enquête sociale, sous les plafonds de l'Anah, et les documents
// partagés par l'AMO ont leur onglet « Documents » (02/10/2026).
//
// Pièces selon la situation (feedback Marius MAZZANTE 30/09/2026) : la liste
// suit les réponses à l'enquête (src/lib/piecesSituation.ts) - avis définitif
// pour tous les ménages, second avis s'il y a deux déclarants, justificatif
// d'usufruit, pièces de SCI occupée par un associé, jugement de tutelle ou de
// curatelle. Chaque pièce a son statut : manquante, reçue (en vérification),
// validée, refusée. Un dépôt réussi se confirme par une fenêtre.
//
// Le dépôt (bucket privé pieces-copro) exige l'acceptation préalable des CGU du
// service - tracée par version dans cgu_acceptations.
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { RenommageDialog } from "@/components/RenommageDialog";
import { ApercuDocument } from "@/components/ApercuDocument";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { downloadFichier, estVisualisable, type Fichier } from "@/api/fichiers";
import {
  libelleQualification,
  useFichiersPartages,
  urlSigneePiece,
  useMesPieces,
  useSupprimerPiece,
  useUploadPiece,
  type Membership,
  type PieceJustificative,
} from "@/api/portail";
import { CGU_VERSION } from "@/lib/cguSignature";
import { PIECES_SITUATION, RAISON_PRET, type PieceAttendue } from "@/lib/piecesSituation";
import { useAccepterCguDepot, useCguDepotPieces } from "@/api/signature";
import { ouvrirDocumentSignature, urlApercuDocumentSignature, useMesDocumentsEcoPtz } from "@/api/ecoPtzIndividuel";
import { messageErreur } from "@/lib/erreurs";

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " Ko";
  return (bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Mo";
}

/** Une pièce : encadré de dépôt, statut en toutes lettres, confirmation après envoi. */
function DepotPiece({
  membership,
  attendue,
  piece,
}: {
  membership: Membership;
  attendue: PieceAttendue;
  piece: PieceJustificative | undefined;
}) {
  const upload = useUploadPiece(membership.copro.id, membership.coproprietaireId);
  const inputRef = useRef<HTMLInputElement>(null);
  // Fichier en attente de renommage assisté avant téléversement
  const [depot, setDepot] = useState<File | null>(null);
  // Nom du fichier qui vient d'être transmis (fenêtre de confirmation)
  const [transmis, setTransmis] = useState<string | null>(null);
  const supprimer = useSupprimerPiece(membership.coproprietaireId);
  const [confirmerSuppr, setConfirmerSuppr] = useState(false);
  const [erreurPiece, setErreurPiece] = useState<string | null>(null);

  // Encadré : vert une fois validé par Strat Eco, orange en attente de
  // vérification, rouge si refusé (feedback Amir 10/09).
  const etat = !piece ? "" : piece.statut === "valide" ? " filled" : piece.statut === "refuse" ? " refus" : " attente";
  const icone = !piece ? "download" : piece.statut === "valide" ? "check" : piece.statut === "refuse" ? "alert" : "clock";
  const parTiers = piece?.deposee_par_nom && piece.deposee_par_nom !== membership.nom ? ` par ${piece.deposee_par_nom}` : "";
  const hint = upload.isPending
    ? "Téléversement…"
    : !piece
      ? `${attendue.aide} PDF ou photo.`
      : piece.statut === "valide"
        ? `${piece.name} · validé par Strat Eco le ${fmtDate(piece.verifiee_le)}`
        : piece.statut === "refuse"
          ? `Refusé le ${fmtDate(piece.verifiee_le)} : ${piece.motif_refus || libelleQualification(piece.qualification).toLowerCase()} - déposez une nouvelle version`
          : `${piece.name} · reçu le ${fmtDate(piece.uploaded_at)}${parTiers} · en attente de vérification par Strat Eco`;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setDepot(file);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <div
        className={"dropzone" + etat}
        onClick={() => !upload.isPending && inputRef.current?.click()}
        style={{ cursor: "pointer" }}
      >
        <span className="dz-ico"><Icon name={icone as never} size={18} /></span>
        <div>
          <div className="dz-name">
            {attendue.nom} <span style={{ color: "var(--color-error-500)" }}>*</span>
            {!upload.isPending && (
              <span className="dz-etat">
                {!piece ? (
                  <Badge kind="neutral">Manquante</Badge>
                ) : piece.statut === "valide" ? (
                  <Badge kind="success" dot>Validée</Badge>
                ) : piece.statut === "refuse" ? (
                  <span className="badge b-refus">Refusée - à redéposer</span>
                ) : (
                  <Badge kind="warn" dot>Reçue - en vérification</Badge>
                )}
              </span>
            )}
          </div>
          <div className="dz-hint">{hint}</div>
        </div>
        <span className="spacer"></span>
        <span className="dz-action">
          {!piece ? "Téléverser" : piece.statut === "refuse" ? "Déposer une nouvelle version" : "Remplacer"}
        </span>
      </div>
      {upload.isError && (
        <p className="se-small" style={{ color: "var(--color-error-700)", margin: 0 }}>
          Le téléversement a échoué. Vérifiez le fichier (PDF ou image) et réessayez.
        </p>
      )}
      {piece && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: -6 }}>
          <button
            className="se-btn se-btn-ghost btn-sm"
            onClick={() => void urlSigneePiece(piece.storage_path).then((u) => window.open(u, "_blank", "noopener")).catch((e) => setErreurPiece(messageErreur(e, "Ouverture impossible.")))}
          >
            <Icon name="eye" size={13} />
            Voir mon fichier
          </button>
          {piece.statut !== "valide" && (
            <button className="se-btn se-btn-ghost btn-sm" disabled={supprimer.isPending} onClick={() => setConfirmerSuppr(true)}>
              <Icon name="trash" size={13} />
              Supprimer
            </button>
          )}
          {erreurPiece && <span className="se-small" style={{ color: "var(--color-error-700)" }}>{erreurPiece}</span>}
        </div>
      )}
      {confirmerSuppr && piece && (
        <Modal title="Supprimer cette pièce ?" onClose={() => setConfirmerSuppr(false)} width={480}>
          <p className="se-body" style={{ marginTop: 0, overflowWrap: "anywhere" }}>
            Le fichier « {piece.name} » sera retiré de votre dossier. Vous pourrez en déposer un autre à tout moment.
          </p>
          <div className="eq-confirm-actions">
            <button className="se-btn se-btn-secondary" onClick={() => setConfirmerSuppr(false)}>Annuler</button>
            <button
              className="se-btn se-btn-primary"
              disabled={supprimer.isPending}
              onClick={() =>
                supprimer.mutate(piece, {
                  onSuccess: () => setConfirmerSuppr(false),
                  onError: (e) => { setConfirmerSuppr(false); setErreurPiece(messageErreur(e, "Suppression impossible.")); },
                })
              }
            >
              {supprimer.isPending ? "Suppression…" : "Supprimer"}
            </button>
          </div>
        </Modal>
      )}

      {depot && (
        <RenommageDialog
          files={[depot]}
          prefixe={membership.nom}
          typeInitial={attendue.type}
          onConfirm={async (file) => {
            await upload.mutateAsync({ type: attendue.type, file });
            setTransmis(file.name);
          }}
          onClose={() => setDepot(null)}
        />
      )}

      {transmis && !depot && (
        <Modal title="Pièce transmise" onClose={() => setTransmis(null)} width={480}>
          <div className="eq-confirm">
            <span className="eq-confirm-ico">
              <Icon name="check" size={30} />
            </span>
            <p className="se-body" style={{ margin: 0 }}>
              <b>{attendue.nom}</b> : bien reçu par l'équipe Strat Eco.
            </p>
            <p className="se-small" style={{ margin: 0, color: "var(--fg2)", overflowWrap: "anywhere" }}>
              Fichier : {transmis}. Il va être vérifié : l'encadré passera au vert une fois validé ; en cas de
              problème, vous recevrez un e-mail qui précise quoi corriger.
            </p>
            <div className="eq-confirm-actions">
              <button className="se-btn se-btn-primary" onClick={() => setTransmis(null)}>
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * Pièces justificatives à déposer, selon les réponses à l'enquête. Les pièces
 * déjà déposées qui ne sont plus demandées (réponse modifiée) restent affichées.
 */
export function PiecesJustificatives({
  membership,
  attendues,
}: {
  membership: Membership;
  attendues: PieceAttendue[];
}) {
  const { data: pieces } = useMesPieces(membership.coproprietaireId);
  const { data: cguAcceptees, isLoading: chargeCgu } = useCguDepotPieces(CGU_VERSION);
  const accepterCgu = useAccepterCguDepot(CGU_VERSION);
  const [cguCochee, setCguCochee] = useState(false);
  const [infoAvisCochee, setInfoAvisCochee] = useState(false);

  const parType = new Map((pieces ?? []).map((p) => [p.type as string, p]));
  const deposeesHorsListe: PieceAttendue[] = (pieces ?? [])
    .filter((p) => PIECES_SITUATION[p.type] && !attendues.some((a) => a.type === p.type))
    .map((p) => ({ type: p.type, nom: PIECES_SITUATION[p.type].nom, aide: PIECES_SITUATION[p.type].aide, raison: "" }));
  const liste = [...attendues, ...deposeesHorsListe];
  const recues = attendues.filter((a) => {
    const p = parType.get(a.type);
    return p && p.statut !== "refuse";
  }).length;

  return (
    <div className="card-xl">
      <div className="cx-head">
        <Icon name="folder" size={20} style={{ color: "var(--accent)" }} />
        <h2 style={{ fontSize: 18 }}>{liste.length > 1 ? "Vos pièces justificatives" : "Votre avis d'imposition"}</h2>
        {attendues.length > 0 && (
          <>
            <span style={{ flex: 1 }}></span>
            <span className="se-small" style={{ color: "var(--fg-muted)" }}>
              {recues} / {attendues.length} reçue{recues > 1 ? "s" : ""}
            </span>
          </>
        )}
      </div>
      <div className="cx-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="se-body" style={{ margin: 0 }}>
          {liste.some((a) => a.raison === RAISON_PRET) ? (
            <>
              Merci de déposer les pièces ci-dessous : l'avis d'imposition si vous êtes éligible aux aides, et les
              pièces que la Caisse d'Épargne demande pour votre adhésion au prêt collectif. <b>Toutes les pages.</b>
            </>
          ) : liste.length > 1 ? (
            <>
              Si vous êtes éligible, merci de déposer les pièces ci-dessous, demandées selon vos réponses à
              l'enquête. <b>Toutes les pages.</b>
            </>
          ) : (
            <>
              Si vous êtes éligible, merci de déposer votre avis d'imposition. <b>Toutes les pages.</b>
            </>
          )}
        </p>
        {liste.length === 0 && (
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
            Selon vos réponses, aucune pièce n'est demandée pour l'instant.
          </p>
        )}
        {/* CGU avant tout dépôt : accepter après l'envoi reviendrait à traiter la
            pièce avant que la personne ait accepté le cadre */}
        {liste.length === 0 ? null : chargeCgu ? (
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>Chargement…</p>
        ) : !cguAcceptees ? (
          <>
            <p className="se-body" style={{ margin: 0 }}>
              Avant de déposer vos pièces, merci de prendre connaissance des conditions qui encadrent leur
              traitement : qui peut les consulter, à quels organismes elles sont transmises, et quand elles sont
              supprimées.
            </p>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={cguCochee} onChange={(e) => setCguCochee(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                J'ai lu et j'accepte les{" "}
                <a href="/cgu-signature" target="_blank" rel="noreferrer">Conditions Générales d'Utilisation</a>{" "}
                du service de dépôt de pièces justificatives et de signature électronique Strat Eco Pro
                (version {CGU_VERSION}).
              </span>
            </label>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={infoAvisCochee} onChange={(e) => setInfoAvisCochee(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                J'ai été informé(e) que mon avis d'imposition sera transmis dans son intégralité à l'Anah
                et, le cas échéant, à l'établissement bancaire instruisant ma demande d'éco-prêt à taux
                zéro, aux fins de vérification de mes ressources, puis supprimé des systèmes de Strat Eco
                une fois ces transmissions effectuées.
              </span>
            </label>
            <div>
              <button
                className="se-btn se-btn-primary"
                disabled={!cguCochee || !infoAvisCochee || accepterCgu.isPending}
                onClick={() =>
                  void accepterCgu.mutateAsync({
                    coproprietaireId: membership.coproprietaireId,
                    infoAvisImposition: infoAvisCochee,
                  }).catch(() => null)
                }
              >
                <Icon name="checkCircle" size={16} />
                {accepterCgu.isPending ? "Enregistrement…" : liste.length > 1 ? "Accepter et déposer mes pièces" : "Accepter et déposer mon avis"}
              </button>
            </div>
            {accepterCgu.isError && (
              <p className="se-small" style={{ color: "var(--color-error-700)", margin: 0 }}>
                L'enregistrement a échoué - réessayez.
              </p>
            )}
          </>
        ) : (
          <>
            {liste.map((a) => (
              <DepotPiece key={a.type} membership={membership} attendue={a} piece={parType.get(a.type)} />
            ))}
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
              Vos pièces sont vérifiées par l'équipe Strat Eco (lisibilité, pages complètes, bonne année) :
              l'encadré passe au vert une fois validé ; en cas de problème, vous recevez un e-mail qui précise
              quoi corriger et l'encadré passe au rouge. Elles sont stockées de manière sécurisée et ne sont
              visibles que par vous et l'équipe Strat Eco. CGU acceptées le {fmtDate(cguAcceptees.accepte_le)}{" "}
              (version {cguAcceptees.cgu_version}).
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Onglet « Documents » (feedback Amir du 02/10/2026, 11:09) : les documents du
 * projet partagés par l'AMO, en lecture seule. Ils étaient en bas de l'accueil,
 * qui garde un lien vers cet onglet.
 */
export function Documents({ membership }: { membership: Membership }) {
  return (
    <div className="fade">
      <h1 className="sec-title">Documents du projet</h1>
      <p className="sec-sub">
        Les documents de la rénovation que votre AMO met à votre disposition. Vous pouvez les consulter à l'écran
        (l'œil) ou les télécharger à tout moment.
      </p>
      <DocumentsEcoPtz membership={membership} />
      <DocumentsProjet membership={membership} />
    </div>
  );
}

/**
 * Éco-PTZ individuel (02/10/2026) : CERFA Annexe 3.1 et attestation des
 * montants éligibles de chaque logement, à remettre à la banque. Visibles dès
 * l'envoi en signature ; téléchargeables une fois signés par les entreprises,
 * l'auditeur et le syndic. Rien ne s'affiche sans demande d'éco-PTZ individuel.
 */
export function DocumentsEcoPtz({ membership }: { membership: Membership }) {
  const { data: docs } = useMesDocumentsEcoPtz(membership.coproprietaireId);
  const [erreur, setErreur] = useState<string | null>(null);
  const [apercu, setApercu] = useState<{ id: string; nom: string } | null>(null);
  if (!docs?.length) return null;
  return (
    <div className="card-xl" style={{ marginBottom: 18 }}>
      <div className="cx-head">
        <Icon name="fileCheck" size={20} style={{ color: "var(--accent)" }} />
        <h2 style={{ fontSize: 19 }}>Votre éco-PTZ individuel</h2>
      </div>
      <div className="cx-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
        <p className="se-small" style={{ color: "var(--fg-muted)", margin: "4px 0 6px" }}>
          Le formulaire CERFA et l'attestation des montants éligibles de votre logement, à joindre à votre demande
          d'éco-prêt à taux zéro auprès de votre banque.
        </p>
        {docs.map((d) => (
          <div key={d.id} className="doc-row">
            <span className="d-ico"><Icon name={d.statut === "signe" ? "fileCheck" : "clock"} size={18} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="d-name">{d.libelle}</div>
              <div className="d-sub">
                {d.statut === "signe"
                  ? `Signé le ${fmtDate(d.scelle_le)}`
                  : "En cours de signature par les entreprises, l'auditeur et le syndic"}
              </div>
            </div>
            <span className="spacer"></span>
            {d.statut === "signe" ? (
              <>
                <button
                  className="icon-btn"
                  title="Aperçu sans téléchargement"
                  onClick={() => setApercu({ id: d.id, nom: `${d.libelle}.pdf` })}
                >
                  <Icon name="eye" size={18} />
                </button>
                <button
                  className="icon-btn"
                  title="Télécharger le document signé"
                  onClick={() =>
                    void ouvrirDocumentSignature(d.id, "signe").catch((e) => setErreur(messageErreur(e, "Téléchargement impossible.")))
                  }
                >
                  <Icon name="download" size={18} />
                </button>
              </>
            ) : (
              <Badge kind="blue">En signature</Badge>
            )}
          </div>
        ))}
        {erreur && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{erreur}</p>}
      </div>
      {apercu && (
        <ApercuDocument
          name={apercu.nom}
          path={apercu.id}
          urlSignee={urlApercuDocumentSignature}
          onClose={() => setApercu(null)}
          onTelecharger={() =>
            void ouvrirDocumentSignature(apercu.id, "signe").catch((e) => setErreur(messageErreur(e, "Téléchargement impossible.")))
          }
        />
      )}
    </div>
  );
}

/** Documents du projet partagés par l'AMO (lecture seule). */
export function DocumentsProjet({ membership }: { membership: Membership }) {
  const { data: fichiers } = useFichiersPartages(membership.copro.id);
  const [apercu, setApercu] = useState<Fichier | null>(null);
  const nb = fichiers?.length ?? 0;

  return (
    <div className="card-xl">
      <div className="cx-head">
        <Icon name="fileText" size={20} style={{ color: "var(--color-secondary-500)" }} />
        <h2 style={{ fontSize: 19 }}>Partagés par votre AMO</h2>
        {nb > 0 && (
          <>
            <span style={{ flex: 1 }}></span>
            <span className="se-small" style={{ color: "var(--fg-muted)" }}>
              {nb} document{nb > 1 ? "s" : ""}
            </span>
          </>
        )}
      </div>
      <div className="cx-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
        {(fichiers ?? []).map((doc) => (
          <div key={doc.id} className="doc-row">
            <span className="d-ico"><Icon name="fileText" size={18} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="d-name">{doc.name}</div>
              <div className="d-sub">
                {[doc.dossier, fmtSize(doc.size), fmtDate(doc.created_at)].filter(Boolean).join(" · ")}
              </div>
            </div>
            <span className="spacer"></span>
            <button
              className="icon-btn"
              title={estVisualisable(doc.name) ? "Aperçu sans téléchargement" : "Ce format ne s'affiche pas dans le navigateur"}
              onClick={() => setApercu(doc)}
            >
              <Icon name="eye" size={18} />
            </button>
            <button className="icon-btn" title="Télécharger" onClick={() => void downloadFichier(doc)}>
              <Icon name="download" size={18} />
            </button>
          </div>
        ))}
        {(fichiers ?? []).length === 0 && (
          <p className="se-small" style={{ color: "var(--fg-muted)", padding: "14px 0" }}>
            Aucun document n'a encore été partagé par votre AMO.
          </p>
        )}
      </div>
      {apercu && (
        <ApercuDocument
          name={apercu.name}
          path={apercu.storage_path}
          onClose={() => setApercu(null)}
          onTelecharger={() => void downloadFichier(apercu)}
        />
      )}
    </div>
  );
}
