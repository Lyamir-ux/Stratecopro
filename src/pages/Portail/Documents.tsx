// Mes documents : téléversement des pièces justificatives (bucket privé pieces-copro)
// + consultation des documents du projet partagés par l'AMO.
// Le dépôt (enquête sociale : avis d'imposition notamment) exige l'acceptation
// préalable des CGU du service - tracée par version dans cgu_acceptations.
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { RenommageDialog } from "@/components/RenommageDialog";
import { fmtDate } from "@/lib/format";
import { downloadFichier } from "@/api/fichiers";
import {
  PIECES,
  libelleQualification,
  useFichiersPartages,
  useMesPieces,
  useUploadPiece,
  type Membership,
  type TypePiece,
} from "@/api/portail";
import { CGU_VERSION } from "@/lib/cguSignature";
import { useAccepterCguDepot, useCguDepotPieces } from "@/api/signature";

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " Ko";
  return (bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Mo";
}

export function Documents({ membership }: { membership: Membership }) {
  const { data: pieces } = useMesPieces(membership.coproprietaireId);
  const { data: fichiers } = useFichiersPartages(membership.copro.id);
  const upload = useUploadPiece(membership.copro.id, membership.coproprietaireId);
  const { data: cguAcceptees, isLoading: chargeCgu } = useCguDepotPieces(CGU_VERSION);
  const accepterCgu = useAccepterCguDepot(CGU_VERSION);
  const [cguCochee, setCguCochee] = useState(false);
  const [infoAvisCochee, setInfoAvisCochee] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingType, setPendingType] = useState<TypePiece | null>(null);
  // Pièce en attente de renommage assisté avant téléversement
  const [depot, setDepot] = useState<{ type: TypePiece; file: File } | null>(null);

  const req = PIECES.filter((p) => p.required);
  // une pièce refusée est à redéposer : elle ne compte plus comme fournie
  const done = req.filter((p) => (pieces ?? []).some((x) => x.type === p.type && x.statut !== "refuse")).length;
  const aVerifier = (pieces ?? []).filter((x) => x.statut === "a_verifier").length;
  const refusees = (pieces ?? []).filter((x) => x.statut === "refuse").length;

  const pick = (type: TypePiece) => {
    setPendingType(type);
    inputRef.current?.click();
  };

  const onFile = (file: File | undefined) => {
    if (file && pendingType) setDepot({ type: pendingType, file });
    setPendingType(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="fade">
      <h1 className="sec-title">Mes documents</h1>
      <p className="sec-sub">Consultez les documents du projet et téléversez vos pièces justificatives.</p>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: "none" }}
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <div className="split">
        <div className="card-xl">
          <div className="cx-head">
            <Icon name="folder" size={20} style={{ color: "var(--accent)" }} />
            <h2>Vos pièces à fournir</h2>
            <span style={{ flex: 1 }}></span>
            <Badge kind={done >= req.length ? "success" : "warn"}>{done}/{req.length} obligatoires</Badge>
          </div>
          {/* CGU avant tout dépôt : accepter après l'upload reviendrait à
              traiter la pièce avant que la personne ait accepté le cadre */}
          {chargeCgu ? (
            <div className="cx-body">
              <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>Chargement…</p>
            </div>
          ) : !cguAcceptees ? (
            <div className="cx-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p className="se-body" style={{ margin: 0 }}>
                Avant de déposer vos pièces justificatives (avis d'imposition, pièce d'identité, RIB…),
                merci de prendre connaissance des conditions qui encadrent leur traitement : qui peut les
                consulter, à quels organismes elles sont transmises, et quand elles sont supprimées.
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
                  {accepterCgu.isPending ? "Enregistrement…" : "Accepter et déposer mes pièces"}
                </button>
              </div>
              {accepterCgu.isError && (
                <p className="se-small" style={{ color: "var(--color-error-700)", margin: 0 }}>
                  L'enregistrement a échoué - réessayez.
                </p>
              )}
            </div>
          ) : (
          <div className="cx-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {PIECES.map((d) => {
              const piece = (pieces ?? []).find((x) => x.type === d.type);
              const busy = upload.isPending && pendingType === d.type;
              // Encadré : vert une fois validée par Strat Eco, orange en attente
              // de vérification, rouge si refusée (feedback Amir 10/09).
              const etat = !piece ? "" : piece.statut === "valide" ? " filled" : piece.statut === "refuse" ? " refus" : " attente";
              const icone = !piece ? "download" : piece.statut === "valide" ? "check" : piece.statut === "refuse" ? "alert" : "clock";
              const parTiers = piece?.deposee_par_nom && piece.deposee_par_nom !== membership.nom ? ` par ${piece.deposee_par_nom}` : "";
              const hint = busy
                ? "Téléversement…"
                : !piece
                  ? d.hint
                  : piece.statut === "valide"
                    ? `${piece.name} · validée par Strat Eco le ${fmtDate(piece.verifiee_le)}`
                    : piece.statut === "refuse"
                      ? `Refusée le ${fmtDate(piece.verifiee_le)} : ${piece.motif_refus || libelleQualification(piece.qualification).toLowerCase()} - déposez une nouvelle version`
                      : `${piece.name} · déposée le ${fmtDate(piece.uploaded_at)}${parTiers} · en attente de vérification par Strat Eco`;
              return (
                <div key={d.type} className={"dropzone" + etat} onClick={() => !upload.isPending && pick(d.type)} style={{ cursor: "pointer" }}>
                  <span className="dz-ico"><Icon name={icone} size={18} /></span>
                  <div>
                    <div className="dz-name">
                      {d.name} {d.required && <span style={{ color: "var(--color-error-500)" }}>*</span>}
                    </div>
                    <div className="dz-hint">{hint}</div>
                  </div>
                  <span className="spacer"></span>
                  <span className="dz-action">{!piece ? "Téléverser" : piece.statut === "refuse" ? "Déposer une nouvelle version" : "Remplacer"}</span>
                </div>
              );
            })}
            {upload.isError && (
              <p className="se-small" style={{ color: "var(--color-error-700)", margin: 0 }}>
                Le téléversement a échoué. Vérifiez le fichier (PDF ou image) et réessayez.
              </p>
            )}
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
              Chaque pièce déposée est vérifiée par l'équipe Strat Eco (lisibilité, pages complètes, bonne année) :
              l'encadré passe au vert une fois la pièce validée ; en cas de problème, vous recevez un e-mail qui
              précise quoi corriger et l'encadré passe au rouge.
              {aVerifier > 0 && ` ${aVerifier} pièce${aVerifier > 1 ? "s" : ""} en attente de vérification.`}
              {refusees > 0 && ` ${refusees} pièce${refusees > 1 ? "s" : ""} à redéposer.`}
            </p>
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: 0 }}>
              Vos pièces sont stockées de manière sécurisée et ne sont visibles que par vous et l'équipe Strat Eco.
              CGU acceptées le {fmtDate(cguAcceptees.accepte_le)} (version {cguAcceptees.cgu_version}).
            </p>
          </div>
          )}
        </div>

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
      </div>

      {depot && (
        <RenommageDialog
          files={[depot.file]}
          prefixe={membership.nom}
          typeInitial={depot.type}
          onConfirm={(file) => upload.mutateAsync({ type: depot.type, file })}
          onClose={() => setDepot(null)}
        />
      )}
    </div>
  );
}
