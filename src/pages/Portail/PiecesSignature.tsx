// Pièces de la signature dans « Mon financement » (0155, retour de A CHELGHAM du
// 09/10/2026, 22:11 : « on doit pouvoir visualiser et remplacer les pièces déjà
// fournies au cas où ; elles doivent être validées par l'AMO »).
//
// La pièce d'identité de chaque signataire et le RIB s'affichent avec leur
// validation par Strat Eco (à vérifier, validée, refusée). Une fois le bulletin
// signé, le principal peut les voir et les remplacer, y compris la pièce d'un
// cosignataire (décision d'Amir : le cosignataire peut aussi la redéposer depuis
// le lien reçu au refus). Un RIB d'un autre compte appelle un nouveau mandat SEPA,
// relu puis signé avec un code reçu par e-mail ; le mandat signé reste en vigueur
// jusque-là.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/ui";
import { ApercuDocument } from "@/components/ApercuDocument";
import { PdfLecteur } from "@/components/PdfLecteur";
import { ChampCodeOtp } from "@/components/ChampCodeOtp";
import { PieceIdentiteChamps } from "@/components/PieceIdentiteChamps";
import { ChampBic, ChampIban, MessageSaisie } from "@/components/ChampsSaisie";
import { useGlisserDeposer } from "@/components/useGlisserDeposer";
import { fmtDate } from "@/lib/format";
import { messageErreur } from "@/lib/erreurs";
import { diagnosticBic, diagnosticIban } from "@/lib/saisie";
import { genMandatSepa, isValidBic, isValidIban, nomDebiteurMandat, normalizeIban } from "@/lib/pdf/adhesion";
import { assemblerPieceIdentite, facesADeposer, verifierFacesPiece } from "@/lib/pdf/pieceIdentite";
import { ACCEPT_PIECE, erreurFormatPiece, LIBELLE_FORMATS_PIECE, typeMimePiece } from "@/lib/formatPiece";
import type { PieceSignature } from "@/lib/piecesSituation";
import {
  appelSignature,
  clePieceSignature,
  deposerNouveauMandat,
  remplacerPieceIdentite,
  remplacerRib,
  telechargerPieceSignature,
  urlApercuPieceSignature,
  useFormulaireAdhesion,
  type BulletinAvecSignataires,
} from "@/api/signature";
import type { Membership } from "@/api/portail";

/** Lignes « pièce d'identité » et « RIB » de l'encadré du dossier de prêt. */
export function LignesPiecesSignature({
  membership,
  pieces,
  bulletins,
}: {
  membership: Membership;
  pieces: PieceSignature[];
  bulletins: BulletinAvecSignataires[];
}) {
  const [apercu, setApercu] = useState<PieceSignature | null>(null);
  const [remplacer, setRemplacer] = useState<PieceSignature | null>(null);
  const changements = bulletins.filter((b) => b.statut !== "annule" && !!b.rib_nouveau_path);
  return (
    <>
      {pieces.map((p) => (
        <div key={p.cle} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <LignePiece piece={p} onVoir={() => setApercu(p)} onRemplacer={() => setRemplacer(p)} />
          {p.quoi === "rib" &&
            changements.map((b) => <NouveauMandat key={b.id} bulletin={b} coproprietaireId={membership.coproprietaireId} />)}
        </div>
      ))}
      {apercu?.apercu && (
        <ApercuDocument
          name={`${apercu.nom}.${apercu.apercu.path?.split(".").pop() ?? "pdf"}`}
          path={clePieceSignature(apercu.apercu.bulletinId, apercu.quoi, apercu.apercu.signataireId)}
          urlSignee={urlApercuPieceSignature}
          onClose={() => setApercu(null)}
          onTelecharger={() => {
            const a = apercu.apercu!;
            void telechargerPieceSignature(clePieceSignature(a.bulletinId, apercu.quoi, a.signataireId), apercu.nom).catch(() => null);
          }}
        />
      )}
      {remplacer?.quoi === "piece" && (
        <FenetrePieceIdentite piece={remplacer} coproprietaireId={membership.coproprietaireId} onClose={() => setRemplacer(null)} />
      )}
      {remplacer?.quoi === "rib" && (
        <FenetreRib
          piece={remplacer}
          bulletins={bulletins}
          membership={membership}
          onClose={() => setRemplacer(null)}
        />
      )}
    </>
  );
}

function LignePiece({ piece, onVoir, onRemplacer }: { piece: PieceSignature; onVoir: () => void; onRemplacer: () => void }) {
  const etat = piece.statut === "valide" ? " filled" : piece.statut === "refuse" ? " refus" : piece.statut ? " attente" : "";
  const icone = piece.statut === "valide" ? "check" : piece.statut === "refuse" ? "alert" : "clock";
  return (
    <div className={"dropzone lecture" + etat}>
      <span className="dz-ico"><Icon name={icone} size={18} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="dz-name">
          {piece.nom}
          <span className="dz-etat">
            {piece.statut === "valide" ? (
              <Badge kind="success" dot>Validée</Badge>
            ) : piece.statut === "refuse" ? (
              <span className="badge b-refus">Refusée - à remplacer</span>
            ) : piece.statut ? (
              <Badge kind="warn" dot>Reçue - en vérification</Badge>
            ) : (
              <Badge kind="neutral">En attente</Badge>
            )}
          </span>
        </div>
        <div className="dz-hint">{piece.detail}</div>
        {piece.statut === "refuse" && piece.motif && (
          <div className="dz-hint" style={{ fontWeight: 600 }}>Motif : {piece.motif}</div>
        )}
      </div>
      <span className="spacer"></span>
      <div className="dz-actions">
        {piece.apercu && (
          <button className="icon-btn" title="Voir sans télécharger" onClick={onVoir}>
            <Icon name="eye" size={18} />
          </button>
        )}
        {piece.remplacable && (
          <button className={"se-btn btn-sm " + (piece.statut === "refuse" ? "se-btn-primary" : "se-btn-secondary")} onClick={onRemplacer}>
            <Icon name="refresh" size={14} />
            Remplacer
          </button>
        )}
      </div>
    </div>
  );
}

/** Remplacement d'une pièce d'identité après la signature (la sienne ou celle d'un cosignataire). */
function FenetrePieceIdentite({
  piece,
  coproprietaireId,
  onClose,
}: {
  piece: PieceSignature;
  coproprietaireId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState("cni");
  const [recto, setRecto] = useState<File | null>(null);
  const [verso, setVerso] = useState<File | null>(null);
  const [atteste, setAtteste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  const { complet, erreur: erreurFichiers } = verifierFacesPiece(type, recto, verso);

  if (fait) {
    return (
      <Modal title="Pièce remplacée" onClose={onClose} width={480}>
        <div className="eq-confirm">
          <span className="eq-confirm-ico"><Icon name="check" size={30} /></span>
          <p className="se-body" style={{ margin: 0 }}>
            La nouvelle pièce d'identité{piece.principal ? "" : ` de ${piece.personne}`} est transmise à l'équipe Strat Eco.
          </p>
          <p className="se-small" style={{ margin: 0, color: "var(--fg2)" }}>
            Elle va être vérifiée : l'encadré passera au vert une fois validée. Votre signature reste valable.
          </p>
          <div className="eq-confirm-actions">
            <button className="se-btn se-btn-primary" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={piece.principal ? "Remplacer ma pièce d'identité" : `Remplacer la pièce d'identité de ${piece.personne}`} onClose={onClose} width={560}>
      <p className="se-body" style={{ marginTop: 0 }}>
        Déposez une pièce en cours de validité, bien lisible : le recto et le verso (pour un passeport, la page
        d'identité suffit). Votre signature du bulletin reste valable ; la nouvelle pièce sera vérifiée par l'équipe
        Strat Eco.
      </p>
      {!piece.principal && (
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 0 }}>
          {piece.personne} peut aussi déposer sa pièce depuis le lien personnel reçu par e-mail quand elle a été refusée.
        </p>
      )}
      <PieceIdentiteChamps type={type} onType={setType} recto={recto} verso={verso} onRecto={setRecto} onVerso={setVerso} />
      {erreurFichiers && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{erreurFichiers}</p>}
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer", margin: "14px 0" }}>
        <input type="checkbox" checked={atteste} onChange={(e) => setAtteste(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          {piece.principal ? (
            <>Je certifie que cette pièce d'identité est <b>la mienne</b> et qu'elle est en cours de validité.</>
          ) : (
            <>Je certifie que cette pièce d'identité est <b>celle de {piece.personne}</b>, avec son accord, et qu'elle est en cours de validité.</>
          )}
        </span>
      </label>
      {erreur && <p className="se-small" role="alert" style={{ color: "var(--color-error-700)" }}>{erreur}</p>}
      <div className="eq-confirm-actions">
        <button className="se-btn se-btn-secondary" onClick={onClose} disabled={busy}>Annuler</button>
        <button
          className="se-btn se-btn-primary"
          disabled={!complet || !atteste || busy}
          onClick={async () => {
            setBusy(true);
            setErreur(null);
            try {
              const assemblee = await assemblerPieceIdentite(facesADeposer(type, recto, verso));
              await remplacerPieceIdentite({ cibles: piece.cibles, typePiece: type, piece: assemblee });
              await qc.invalidateQueries({ queryKey: ["signature", "mes-bulletins", coproprietaireId] });
              setFait(true);
            } catch (e) {
              setErreur(messageErreur(e, "Le remplacement a échoué. Réessayez."));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="upload" size={16} />
          {busy ? "Dépôt en cours…" : "Remplacer la pièce"}
        </button>
      </div>
    </Modal>
  );
}

/** Remplacement du RIB après la signature : même compte, ou nouveau mandat SEPA à signer. */
function FenetreRib({
  piece,
  bulletins,
  membership,
  onClose,
}: {
  piece: PieceSignature;
  bulletins: BulletinAvecSignataires[];
  membership: Membership;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // « nouveau_meme_fin » : mêmes 4 derniers caractères, mais le compte actuel n'est pas
  // conservé en clair (IBAN non chiffré faute de clé) : par sécurité, nouveau mandat
  const [resultat, setResultat] = useState<"meme" | "nouveau" | "nouveau_meme_fin" | null>(null);
  const premier = bulletins.find((b) => b.id === piece.cibles[0]?.bulletinId);
  const { data: form } = useFormulaireAdhesion(premier?.adhesion_id);

  const choisir = (f: File | null) => {
    const refus = f ? erreurFormatPiece(f) : null;
    setErreurFichier(refus);
    setFichier(f && !refus ? f : null);
    return !refus;
  };
  const glisser = useGlisserDeposer(choisir, !busy);

  if (resultat) {
    return (
      <Modal title={resultat === "meme" ? "RIB remplacé" : "Nouveau mandat SEPA à signer"} onClose={onClose} width={500}>
        <div className="eq-confirm">
          <span className="eq-confirm-ico"><Icon name={resultat === "meme" ? "check" : "edit"} size={30} /></span>
          <p className="se-body" style={{ margin: 0 }}>
            {resultat === "meme"
              ? "Votre nouveau RIB est transmis à l'équipe Strat Eco ; il porte sur le même compte, votre mandat SEPA signé reste valable."
              : resultat === "nouveau_meme_fin"
                ? "Votre compte actuel n'étant pas conservé en clair, nous ne pouvons pas vérifier qu'il s'agit du même : par sécurité, un nouveau mandat de prélèvement SEPA a été préparé avec ce RIB. Lisez-le puis signez-le avec le code reçu par e-mail, sous la ligne du RIB."
                : "Ce RIB porte sur un autre compte : un nouveau mandat de prélèvement SEPA a été préparé. Lisez-le puis signez-le avec le code reçu par e-mail, sous la ligne du RIB."}
          </p>
          <p className="se-small" style={{ margin: 0, color: "var(--fg2)" }}>
            {resultat === "meme"
              ? "Il va être vérifié : l'encadré passera au vert une fois validé."
              : "D'ici là, votre mandat actuel reste en vigueur."}
          </p>
          <div className="eq-confirm-actions">
            <button className="se-btn se-btn-primary" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </Modal>
    );
  }

  const ibanOk = isValidIban(iban);
  const bicOk = isValidBic(bic);
  return (
    <Modal title="Remplacer le RIB" onClose={onClose} width={580}>
      <p className="se-body" style={{ marginTop: 0 }}>
        Déposez votre nouveau RIB et ressaisissez l'IBAN et le BIC. S'il s'agit du <b>même compte</b>, le RIB est
        simplement remplacé. S'il s'agit d'un <b>autre compte</b> (ou si le compte actuel ne peut pas être vérifié),
        un nouveau mandat de prélèvement SEPA est préparé : vous le lirez puis le signerez avec un code reçu par
        e-mail ; votre mandat actuel reste en vigueur jusque-là.
      </p>
      <div className="form-grid">
        <div className={"fld champ-depot" + (glisser.survol ? " survol" : "")} style={{ gridColumn: "1 / -1" }} {...glisser.props}>
          <label>{`RIB (${LIBELLE_FORMATS_PIECE}) *`}</label>
          <input
            type="file"
            accept={ACCEPT_PIECE}
            onChange={(e) => {
              if (!choisir(e.target.files?.[0] ?? null)) e.target.value = "";
            }}
          />
          {erreurFichier ? (
            <span className="hint" style={{ color: "var(--color-error-700)" }}>{erreurFichier}</span>
          ) : (
            <span className="hint">Vous pouvez aussi glisser le fichier sur le champ.</span>
          )}
        </div>
        <div className="fld">
          <label>IBAN *</label>
          <ChampIban value={iban} onChange={setIban} />
        </div>
        <div className="fld">
          <label>BIC *</label>
          <ChampBic value={bic} onChange={setBic} />
        </div>
      </div>
      <MessageSaisie diagnostic={diagnosticIban(iban)} />
      <MessageSaisie diagnostic={diagnosticBic(bic)} />
      {erreur && <p className="se-small" role="alert" style={{ color: "var(--color-error-700)" }}>{erreur}</p>}
      <div className="eq-confirm-actions">
        <button className="se-btn se-btn-secondary" onClick={onClose} disabled={busy}>Annuler</button>
        <button
          className="se-btn se-btn-primary"
          disabled={!fichier || !ibanOk || !bicOk || busy}
          onClick={async () => {
            setBusy(true);
            setErreur(null);
            try {
              const type = typeMimePiece(fichier!);
              const ext = type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : "jpg";
              const aSigner = await remplacerRib({
                bulletinIds: piece.cibles.map((c) => c.bulletinId),
                fichier: fichier!,
                ext,
                iban: normalizeIban(iban),
              });
              for (const id of aSigner) {
                const b = bulletins.find((x) => x.id === id);
                const p = b?.signataires.find((s) => s.role === "principal");
                const f = (form ?? {}) as { adherent1?: { nomPrenom?: string }; adresse?: string; cp?: string; ville?: string; lieuSignature?: string };
                const mandat = await genMandatSepa({
                  nom: nomDebiteurMandat({ nom: p?.nom, prenom: p?.prenom }, f.adherent1?.nomPrenom || membership.nom),
                  rue: f.adresse || p?.adresse_ligne1 || "",
                  cp: f.cp || p?.code_postal || "",
                  ville: f.ville || p?.ville || "",
                  iban,
                  bic,
                  lieu: f.lieuSignature || membership.copro.city || "",
                  date: new Date(),
                });
                await deposerNouveauMandat(id, new Blob([mandat as BlobPart], { type: "application/pdf" }));
              }
              await qc.invalidateQueries({ queryKey: ["signature", "mes-bulletins", membership.coproprietaireId] });
              const memeFin = aSigner.every((id) => bulletins.find((b) => b.id === id)?.iban_dernier4 === normalizeIban(iban).slice(-4));
              setResultat(aSigner.length === 0 ? "meme" : memeFin ? "nouveau_meme_fin" : "nouveau");
            } catch (e) {
              setErreur(messageErreur(e, "Le remplacement a échoué. Réessayez."));
              await qc.invalidateQueries({ queryKey: ["signature", "mes-bulletins", membership.coproprietaireId] });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="upload" size={16} />
          {busy ? "Dépôt en cours…" : "Remplacer le RIB"}
        </button>
      </div>
    </Modal>
  );
}

/** Changement de compte en attente : lecture du nouveau mandat SEPA, puis signature par code. */
function NouveauMandat({ bulletin, coproprietaireId }: { bulletin: BulletinAvecSignataires; coproprietaireId: string }) {
  const qc = useQueryClient();
  const [lecture, setLecture] = useState<string | null>(null);
  const [otp, setOtp] = useState<{ canal: string; codeTest?: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const principal = bulletin.signataires.find((s) => s.role === "principal");
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["signature", "mes-bulletins", coproprietaireId] });
  const agir = async (fn: () => Promise<void>, label: string) => {
    setBusy(label);
    setErreur(null);
    try {
      await fn();
    } catch (e) {
      setErreur(messageErreur(e, "Une erreur est survenue. Réessayez."));
    } finally {
      setBusy(null);
    }
  };
  const annuler = () => {
    if (!window.confirm("Annuler le changement de compte ? Votre mandat actuel reste en vigueur.")) return;
    void agir(async () => {
      await appelSignature({ action: "principal_rib_nouveau_annuler", bulletin_id: bulletin.id });
      await rafraichir();
    }, "annuler");
  };
  const lu = !!bulletin.mandat_nouveau_lu_le;

  return (
    <div className="card-xl" style={{ border: "1.5px solid var(--accent)", marginTop: 2 }}>
      <div className="cx-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="edit" size={18} style={{ color: "var(--accent)" }} />
          <b>Nouveau mandat SEPA à signer - compte se terminant par {bulletin.iban_nouveau_dernier4 ?? "-"}</b>
        </div>
        <p className="se-small" style={{ margin: 0, color: "var(--fg2)" }}>
          {bulletin.lot_reference} · votre mandat actuel (compte ····{bulletin.iban_dernier4 ?? ""}, signé le{" "}
          {fmtDate(bulletin.mandat_signe_le)}) reste en vigueur jusqu'à la signature du nouveau.
        </p>
        {!bulletin.mandat_nouveau_path ? (
          <p className="se-small" style={{ margin: 0, color: "var(--color-error-700)" }}>
            Le nouveau mandat n'a pas pu être préparé : annulez puis recommencez le remplacement du RIB.
          </p>
        ) : (
          <>
            <div className={"adh-etape" + (lu ? " lu" : "")}>
              <Icon name={lu ? "checkCircle" : "fileText"} size={20} style={{ color: lu ? "var(--color-success-500)" : "var(--accent)", flex: "none" }} />
              <div className="ae-txt">
                <div className="ae-titre">Mandat de prélèvement SEPA</div>
                <div className="ae-sub">{lu ? "Lu en entier" : "À lire jusqu'à la dernière page"}</div>
              </div>
              {!lecture && (
                <button
                  className="se-btn se-btn-secondary btn-sm"
                  disabled={!!busy}
                  onClick={() =>
                    void agir(async () => {
                      const r = await appelSignature({ action: "principal_document_url", bulletin_id: bulletin.id, quoi: "mandat_nouveau" });
                      setLecture(r.url as string);
                    }, "lire")
                  }
                >
                  <Icon name="eye" size={14} />
                  {lu ? "Relire" : "Lire"}
                </button>
              )}
            </div>
            {lecture && (
              <PdfLecteur
                key={"mandat-nouveau-" + bulletin.id}
                url={lecture}
                onLectureComplete={() => {
                  void appelSignature({ action: "principal_document_lu", bulletin_id: bulletin.id, quoi: "mandat_nouveau" })
                    .then(() => rafraichir())
                    .catch(() => null);
                }}
              />
            )}
            {!otp ? (
              <div>
                <button
                  className="se-btn se-btn-primary"
                  disabled={!lu || !!busy}
                  onClick={() =>
                    void agir(async () => {
                      const r = await appelSignature({ action: "principal_mandat_nouveau_otp_demander", bulletin_id: bulletin.id });
                      setOtp({ canal: r.canal as string, codeTest: r.code_test as string | undefined });
                    }, "otp")
                  }
                >
                  <Icon name="lock" size={16} />
                  {busy === "otp" ? "Envoi du code…" : "Recevoir mon code de signature"}
                </button>
                {!lu && (
                  <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
                    Le code s'obtient une fois le mandat lu jusqu'à la dernière page.
                  </p>
                )}
              </div>
            ) : (
              <div style={{ maxWidth: 400 }}>
                <p className="se-body" style={{ margin: "0 0 10px" }}>
                  {otp.canal === "email" ? (
                    <>
                      Un code à 6 chiffres vient de vous être envoyé par e-mail
                      {principal?.email ? <> à <b>{principal.email}</b></> : null}. Il est valable 10 minutes.
                    </>
                  ) : (
                    "Mode test : aucun envoi réel configuré."
                  )}
                </p>
                {otp.codeTest && (
                  <p className="se-small" style={{ color: "var(--color-warning-500)" }}>
                    Code de test (environnement sans envoi réel) : <b>{otp.codeTest}</b>
                  </p>
                )}
                <ChampCodeOtp value={code} onChange={setCode} />
                <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
                  En validant ce code, vous signez le nouveau mandat de prélèvement SEPA, qui remplace l'actuel.
                </p>
                <div className="adh-otp-boutons">
                  <button
                    className="se-btn se-btn-primary"
                    disabled={code.length !== 6 || !!busy}
                    onClick={() =>
                      void agir(async () => {
                        await appelSignature({ action: "principal_mandat_nouveau_signer", bulletin_id: bulletin.id, code });
                        setOtp(null);
                        setCode("");
                        setLecture(null);
                        await rafraichir();
                      }, "signer")
                    }
                  >
                    <Icon name="checkCircle" size={17} />
                    {busy === "signer" ? "Vérification…" : "Signer le nouveau mandat"}
                  </button>
                  <button
                    className="se-btn se-btn-ghost btn-sm"
                    disabled={!!busy}
                    onClick={() =>
                      void agir(async () => {
                        const r = await appelSignature({ action: "principal_mandat_nouveau_otp_demander", bulletin_id: bulletin.id });
                        setOtp({ canal: r.canal as string, codeTest: r.code_test as string | undefined });
                        setCode("");
                      }, "renvoi")
                    }
                  >
                    Renvoyer un code
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {erreur && <p className="se-small" role="alert" style={{ color: "var(--color-error-700)", margin: 0 }}>{erreur}</p>}
        <div>
          <button className="se-btn se-btn-ghost btn-sm" disabled={!!busy} onClick={annuler}>
            <Icon name="x" size={14} />
            Annuler le changement de compte
          </button>
        </div>
      </div>
    </div>
  );
}
