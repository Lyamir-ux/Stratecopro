// Parcours public du cosignataire (spec §4) : accès par lien personnel
// tokenisé, sans compte. Mobile d'abord - la plupart des cosignataires
// photographient leur pièce d'identité depuis un téléphone.
// Étapes imposées : CGU → pièce d'identité → lecture complète → OTP → signé.
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { PdfLecteur } from "@/components/PdfLecteur";
import { appelSignaturePublique, uploadVersBucket, messageErreurSignature } from "@/api/signature";
import { assemblerPieceIdentite, validerFichiersPiece } from "@/lib/pdf/pieceIdentite";

interface EtatLien {
  copro: string;
  lot: string;
  cgu_version: string;
  statut_bulletin: string;
  signataire: {
    civilite: string | null;
    nom: string;
    prenom: string;
    telephone_masque: string;
    statut: string;
    cgu_acceptees: boolean;
    piece_deposee: boolean;
    document_lu: boolean;
    signe: boolean;
    expire_le: string | null;
  };
}

const TYPES_PIECE = [
  { id: "cni", label: "Carte nationale d'identité" },
  { id: "passeport", label: "Passeport" },
  { id: "titre_sejour", label: "Titre de séjour" },
];

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f1f2ee", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          background: "linear-gradient(150deg, #213A0E 0%, #355717 70%)",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <img src="/logo-strateco-pro-white.png" alt="Strat Eco" style={{ height: 30 }} />
        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13.5 }}>Signature électronique</span>
      </div>
      <div style={{ width: "100%", maxWidth: 660, margin: "0 auto", padding: "22px 16px 48px", flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

function Etapes({ active }: { active: number }) {
  const libelles = ["Conditions", "Identité", "Lecture", "Signature"];
  return (
    <div style={{ display: "flex", gap: 6, margin: "0 0 18px" }}>
      {libelles.map((l, i) => (
        <div key={l} style={{ flex: 1, textAlign: "center" }}>
          <div
            style={{
              height: 4,
              borderRadius: 2,
              background: i <= active ? "var(--accent, #355717)" : "#d8dad2",
              marginBottom: 5,
            }}
          />
          <span style={{ fontSize: 11.5, color: i <= active ? "var(--fg, #222)" : "var(--fg-muted, #888)" }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

export default function SignaturePublique() {
  const { token = "" } = useParams();
  const [etat, setEtat] = useState<EtatLien | null>(null);
  const [chargement, setChargement] = useState(true);
  const [lienInvalide, setLienInvalide] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [cguCochee, setCguCochee] = useState(false);
  const [typePiece, setTypePiece] = useState("cni");
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [attestation, setAttestation] = useState(false);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [otp, setOtp] = useState<{ canal: string; codeTest?: string } | null>(null);
  const [code, setCode] = useState("");
  const [nouveauLienEnvoye, setNouveauLienEnvoye] = useState(false);
  const inputFichiers = useRef<HTMLInputElement>(null);

  const recharger = useCallback(async (premiere = false) => {
    try {
      const r = await appelSignaturePublique({ action: premiere ? "lien_ouvrir" : "lien_etat", token });
      setEtat(r as unknown as EtatLien);
    } catch {
      setLienInvalide(true);
    } finally {
      setChargement(false);
    }
  }, [token]);

  useEffect(() => {
    void recharger(true);
  }, [recharger]);

  const agir = async (fn: () => Promise<void>, label: string) => {
    setBusy(label);
    setErreur(null);
    try {
      await fn();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : messageErreurSignature(undefined));
    } finally {
      setBusy(null);
    }
  };

  if (chargement) {
    return (
      <Cadre>
        <p className="se-small" style={{ color: "var(--fg-muted)" }}>Vérification du lien…</p>
      </Cadre>
    );
  }

  // ---------- lien inconnu, consommé ou expiré ----------
  if (lienInvalide || !etat) {
    return (
      <Cadre>
        <div className="card-xl" style={{ padding: 26 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <Icon name="alert" size={22} style={{ color: "var(--color-warning-500)" }} />
            <h2 style={{ margin: 0, fontSize: 19 }}>Ce lien n'est plus valable</h2>
          </div>
          <p className="se-body">
            Il a peut-être expiré (validité 30 jours), déjà servi à signer, ou l'adresse est incomplète.
          </p>
          {nouveauLienEnvoye ? (
            <p className="se-body" style={{ color: "var(--color-success-500)" }}>
              <b>Si ce lien correspondait à une signature en attente, un nouveau lien vient d'être envoyé
              par e-mail.</b> Pensez à vérifier vos courriers indésirables.
            </p>
          ) : (
            <button
              className="se-btn se-btn-primary"
              disabled={!!busy}
              onClick={() =>
                void agir(async () => {
                  await appelSignaturePublique({ action: "lien_nouveau", token }).catch(() => null);
                  setNouveauLienEnvoye(true);
                }, "nouveau")
              }
            >
              <Icon name="send" size={16} />
              Recevoir un nouveau lien par e-mail
            </button>
          )}
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 14 }}>
            Besoin d'aide ? contact@strateco.fr - 03 65 67 13 54
          </p>
        </div>
      </Cadre>
    );
  }

  const s = etat.signataire;

  // ---------- déjà signé ----------
  if (s.signe) {
    return (
      <Cadre>
        <Etapes active={3} />
        <div className="card-xl" style={{ padding: 26, textAlign: "center" }}>
          <Icon name="checkCircle" size={44} style={{ color: "var(--color-success-500)" }} />
          <h2 style={{ fontSize: 20, margin: "12px 0 6px" }}>Signature enregistrée</h2>
          <p className="se-body" style={{ margin: 0 }}>
            Merci {s.prenom}. Votre signature du bulletin d'adhésion ({etat.lot}, copropriété {etat.copro})
            est bien enregistrée.
          </p>
          <p className="se-body">
            Dès que tous les signataires auront signé, vous recevrez par e-mail le document scellé
            accompagné de son certificat de preuve.
          </p>
        </div>
      </Cadre>
    );
  }

  // ---------- étape 1 : CGU ----------
  if (!s.cgu_acceptees) {
    return (
      <Cadre>
        <Etapes active={0} />
        <div className="card-xl" style={{ padding: 26 }}>
          <h2 style={{ fontSize: 20, marginTop: 0 }}>Bonjour {s.prenom},</h2>
          <p className="se-body">
            Vous êtes invité(e) à signer électroniquement le <b>bulletin d'adhésion à l'éco-prêt à taux
            zéro</b> de la copropriété <b>{etat.copro}</b> ({etat.lot}).
          </p>
          <p className="se-body">Il vous faudra :</p>
          <ul className="se-body" style={{ marginTop: 0 }}>
            <li>votre pièce d'identité (une photo suffit) ;</li>
            <li>environ 5 minutes.</li>
          </ul>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer", margin: "16px 0" }}>
            <input type="checkbox" checked={cguCochee} onChange={(e) => setCguCochee(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              J'ai lu et j'accepte les{" "}
              <a href="/cgu-signature" target="_blank" rel="noreferrer">Conditions Générales d'Utilisation</a>{" "}
              du service de signature électronique Strat Eco Pro (version {etat.cgu_version}), y compris la
              convention de preuve figurant à l'article 5.2.
            </span>
          </label>
          {erreur && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{erreur}</p>}
          <button
            className="se-btn se-btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
            disabled={!cguCochee || !!busy}
            onClick={() =>
              void agir(async () => {
                await appelSignaturePublique({ action: "lien_accepter_cgu", token });
                await recharger();
              }, "cgu")
            }
          >
            {busy ? "Enregistrement…" : "Commencer"}
            <Icon name="arrowRight" size={16} />
          </button>
        </div>
      </Cadre>
    );
  }

  // ---------- étape 2 : pièce d'identité ----------
  if (!s.piece_deposee) {
    const erreurFichiers = fichiers.length ? validerFichiersPiece(fichiers) : null;
    return (
      <Cadre>
        <Etapes active={1} />
        <div className="card-xl" style={{ padding: 26 }}>
          <h2 style={{ fontSize: 19, marginTop: 0 }}>Votre pièce d'identité</h2>
          <p className="se-body">
            Déposez <b>votre propre pièce</b>, en cours de validité : photo(s) ou PDF, recto et verso
            lisibles. Personne d'autre ne peut la déposer à votre place.
          </p>
          <div className="fld" style={{ marginBottom: 14 }}>
            <label>Type de pièce</label>
            <select value={typePiece} onChange={(e) => setTypePiece(e.target.value)}>
              {TYPES_PIECE.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <input
            ref={inputFichiers}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            capture="environment"
            multiple
            style={{ display: "none" }}
            onChange={(e) => setFichiers([...(e.target.files ?? [])].slice(0, 2))}
          />
          <button
            className="se-btn se-btn-secondary"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => inputFichiers.current?.click()}
          >
            <Icon name="upload" size={16} />
            {fichiers.length ? "Changer de fichier(s)" : "Prendre en photo ou choisir un fichier"}
          </button>
          {fichiers.length > 0 && (
            <p className="se-small" style={{ margin: "8px 0 0" }}>
              {fichiers.map((f) => f.name).join(" + ")}
              {fichiers.length === 1 && fichiers[0].type !== "application/pdf" && " - ajoutez le verso si besoin (2 fichiers max)"}
            </p>
          )}
          {erreurFichiers && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{erreurFichiers}</p>}
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer", margin: "16px 0" }}>
            <input type="checkbox" checked={attestation} onChange={(e) => setAttestation(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Je certifie que la pièce d'identité que je téléverse est <b>la mienne</b> et qu'elle est en cours de validité.</span>
          </label>
          {erreur && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{erreur}</p>}
          <button
            className="se-btn se-btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
            disabled={!fichiers.length || !!erreurFichiers || !attestation || !!busy}
            onClick={() =>
              void agir(async () => {
                const piece = await assemblerPieceIdentite(fichiers);
                const up = await appelSignaturePublique({ action: "lien_piece_upload", token, ext: piece.ext });
                await uploadVersBucket("signature-pieces", up.path as string, up.token as string, piece.blob);
                await appelSignaturePublique({
                  action: "lien_piece_confirmer",
                  token,
                  path: up.path,
                  type_piece: typePiece,
                  attestation: true,
                });
                await recharger();
              }, "piece")
            }
          >
            {busy ? "Dépôt en cours…" : "Déposer ma pièce d'identité"}
            <Icon name="arrowRight" size={16} />
          </button>
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12 }}>
            Vous pouvez fermer cette page et revenir plus tard avec le même lien : votre avancement est conservé.
          </p>
        </div>
      </Cadre>
    );
  }

  // ---------- étape 3 : lecture + OTP + signature ----------
  return (
    <Cadre>
      <Etapes active={otp ? 3 : 2} />
      <div className="card-xl" style={{ padding: 26 }}>
        <h2 style={{ fontSize: 19, marginTop: 0 }}>Lisez puis signez votre bulletin</h2>
        {!docUrl ? (
          <button
            className="se-btn se-btn-secondary"
            style={{ width: "100%", justifyContent: "center" }}
            disabled={!!busy}
            onClick={() =>
              void agir(async () => {
                const r = await appelSignaturePublique({ action: "lien_document_url", token });
                setDocUrl(r.url as string);
              }, "doc")
            }
          >
            <Icon name="fileText" size={16} />
            Afficher le bulletin d'adhésion
          </button>
        ) : (
          <PdfLecteur
            url={docUrl}
            onLectureComplete={() => {
              void appelSignaturePublique({ action: "lien_document_lu", token })
                .then(() => recharger())
                .catch(() => null);
            }}
          />
        )}

        {!otp ? (
          <>
            {erreur && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 10 }}>{erreur}</p>}
            <button
              className="se-btn se-btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 14 }}
              disabled={!s.document_lu || !!busy}
              onClick={() =>
                void agir(async () => {
                  const r = await appelSignaturePublique({ action: "lien_otp_demander", token });
                  setOtp({ canal: r.canal as string, codeTest: r.code_test as string | undefined });
                }, "otp")
              }
            >
              <Icon name="lock" size={16} />
              {busy ? "Envoi du code…" : "Recevoir mon code de signature"}
            </button>
            <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10 }}>
              En demandant ce code, vous exprimez votre consentement à signer. Le code vous est transmis
              personnellement (téléphone {s.telephone_masque} déclaré au dossier).
            </p>
          </>
        ) : (
          <div style={{ marginTop: 16 }}>
            <p className="se-body" style={{ margin: "0 0 10px" }}>
              {otp.canal === "email"
                ? "Un code à 6 chiffres vient de vous être envoyé par e-mail."
                : otp.canal === "sms"
                  ? `Un code à 6 chiffres vient d'être envoyé par SMS au ${s.telephone_masque}.`
                  : "Mode test : aucun envoi réel configuré."}
              {" "}Il est valable 10 minutes.
            </p>
            {otp.codeTest && (
              <p className="se-small" style={{ color: "var(--color-warning-500)" }}>
                Code de test (environnement sans envoi réel) : <b>{otp.codeTest}</b>
              </p>
            )}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="______"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              style={{
                width: "100%",
                fontSize: 30,
                letterSpacing: 14,
                textAlign: "center",
                padding: "10px 0",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
              }}
            />
            {erreur && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 8 }}>{erreur}</p>}
            <button
              className="se-btn se-btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
              disabled={code.length !== 6 || !!busy}
              onClick={() =>
                void agir(async () => {
                  await appelSignaturePublique({ action: "lien_otp_valider", token, code });
                  await recharger();
                }, "valider")
              }
            >
              <Icon name="checkCircle" size={17} />
              {busy ? "Vérification…" : "Signer le bulletin"}
            </button>
            <button
              className="se-btn se-btn-ghost btn-sm"
              style={{ marginTop: 10 }}
              disabled={!!busy}
              onClick={() =>
                void agir(async () => {
                  const r = await appelSignaturePublique({ action: "lien_otp_demander", token });
                  setOtp({ canal: r.canal as string, codeTest: r.code_test as string | undefined });
                  setCode("");
                }, "renvoi")
              }
            >
              Renvoyer un code
            </button>
          </div>
        )}
      </div>
    </Cadre>
  );
}
