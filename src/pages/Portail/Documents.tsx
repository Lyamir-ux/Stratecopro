// Pièces et documents du portail copropriétaire.
//
// L'onglet « Mes documents » a été retiré (feedback Amir 22/09/2026) : l'identité
// et le RIB sont désormais demandés par la banque sur son propre parcours de
// souscription, et le seul document que le copropriétaire dépose encore ici est
// son avis d'imposition. Le dépôt vit donc dans l'enquête sociale, sous les
// plafonds de l'Anah, et les documents partagés par l'AMO sur l'accueil.
//
// Le dépôt (bucket privé pieces-copro) exige l'acceptation préalable des CGU du
// service - tracée par version dans cgu_acceptations.
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { RenommageDialog } from "@/components/RenommageDialog";
import { fmtDate } from "@/lib/format";
import { downloadFichier } from "@/api/fichiers";
import {
  libelleQualification,
  useFichiersPartages,
  useMesPieces,
  useUploadPiece,
  type Membership,
} from "@/api/portail";
import { CGU_VERSION } from "@/lib/cguSignature";
import { useAccepterCguDepot, useCguDepotPieces } from "@/api/signature";

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " Ko";
  return (bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Mo";
}

/** Dépôt de l'avis d'imposition - seule pièce encore attendue du copropriétaire. */
export function DepotAvisImposition({ membership }: { membership: Membership }) {
  const { data: pieces } = useMesPieces(membership.coproprietaireId);
  const upload = useUploadPiece(membership.copro.id, membership.coproprietaireId);
  const { data: cguAcceptees, isLoading: chargeCgu } = useCguDepotPieces(CGU_VERSION);
  const accepterCgu = useAccepterCguDepot(CGU_VERSION);
  const [cguCochee, setCguCochee] = useState(false);
  const [infoAvisCochee, setInfoAvisCochee] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Fichier en attente de renommage assisté avant téléversement
  const [depot, setDepot] = useState<File | null>(null);

  const piece = (pieces ?? []).find((x) => x.type === "avis_imposition");
  // Encadré : vert une fois validé par Strat Eco, orange en attente de
  // vérification, rouge si refusé (feedback Amir 10/09).
  const etat = !piece ? "" : piece.statut === "valide" ? " filled" : piece.statut === "refuse" ? " refus" : " attente";
  const icone = !piece ? "download" : piece.statut === "valide" ? "check" : piece.statut === "refuse" ? "alert" : "clock";
  const parTiers = piece?.deposee_par_nom && piece.deposee_par_nom !== membership.nom ? ` par ${piece.deposee_par_nom}` : "";
  const hint = upload.isPending
    ? "Téléversement…"
    : !piece
      ? "PDF ou photo - toutes les pages de l'avis"
      : piece.statut === "valide"
        ? `${piece.name} · validé par Strat Eco le ${fmtDate(piece.verifiee_le)}`
        : piece.statut === "refuse"
          ? `Refusé le ${fmtDate(piece.verifiee_le)} : ${piece.motif_refus || libelleQualification(piece.qualification).toLowerCase()} - déposez une nouvelle version`
          : `${piece.name} · déposé le ${fmtDate(piece.uploaded_at)}${parTiers} · en attente de vérification par Strat Eco`;

  return (
    <div className="card-xl">
      <div className="cx-head">
        <Icon name="folder" size={20} style={{ color: "var(--accent)" }} />
        <h2 style={{ fontSize: 18 }}>Votre avis d'imposition</h2>
      </div>
      <div className="cx-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="se-body" style={{ margin: 0 }}>
          Si vous êtes éligible, merci de déposer votre avis d'imposition. <b>Toutes les pages.</b>
        </p>
        {/* CGU avant tout dépôt : accepter après l'envoi reviendrait à traiter la
            pièce avant que la personne ait accepté le cadre */}
        {chargeCgu ? (
          <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>Chargement…</p>
        ) : !cguAcceptees ? (
          <>
            <p className="se-body" style={{ margin: 0 }}>
              Avant de déposer votre avis d'imposition, merci de prendre connaissance des conditions qui
              encadrent son traitement : qui peut le consulter, à quels organismes il est transmis, et quand il
              est supprimé.
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
                {accepterCgu.isPending ? "Enregistrement…" : "Accepter et déposer mon avis"}
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
                  Avis d'imposition (N-1) <span style={{ color: "var(--color-error-500)" }}>*</span>
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
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
              Votre avis est vérifié par l'équipe Strat Eco (lisibilité, pages complètes, bonne année) :
              l'encadré passe au vert une fois validé ; en cas de problème, vous recevez un e-mail qui précise
              quoi corriger et l'encadré passe au rouge. Il est stocké de manière sécurisée et n'est visible que
              par vous et l'équipe Strat Eco. CGU acceptées le {fmtDate(cguAcceptees.accepte_le)} (version{" "}
              {cguAcceptees.cgu_version}).
            </p>
          </>
        )}
      </div>

      {depot && (
        <RenommageDialog
          files={[depot]}
          prefixe={membership.nom}
          typeInitial="avis_imposition"
          onConfirm={(file) => upload.mutateAsync({ type: "avis_imposition", file })}
          onClose={() => setDepot(null)}
        />
      )}
    </div>
  );
}

/** Documents du projet partagés par l'AMO (lecture seule). */
export function DocumentsProjet({ membership }: { membership: Membership }) {
  const { data: fichiers } = useFichiersPartages(membership.copro.id);

  return (
    <div className="card-xl">
      <div className="cx-head">
        <Icon name="fileText" size={20} style={{ color: "var(--color-secondary-500)" }} />
        <h2 style={{ fontSize: 19 }}>Documents du projet</h2>
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
    </div>
  );
}
