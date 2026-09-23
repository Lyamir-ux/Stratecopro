// Page publique du président du conseil syndical : signature de la fiche
// « État de la copropriété » (ANAH) par lien personnel, sans compte.
// Parcours : relecture de la fiche (PDF généré à la volée depuis les valeurs
// validées par Strat Eco), attestation « Je certifie exacts les
// renseignements de cette fiche », code à usage unique reçu par e-mail.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { PdfLecteur } from "@/components/PdfLecteur";
import { Cadre } from "@/pages/Signature";
import { messageErreurSignature } from "@/api/signature";
import { appelFicheEtatPublique, octetsUrl } from "@/api/ficheEtat";
import { genFicheEtat, type SignatureFichePdf } from "@/lib/pdf/ficheEtat";

interface EtatLienFiche {
  copro: string;
  resolu: Record<string, string>;
  images: { aerienne: string | null; situation: string | null };
  signataire: { nom: string; statut: string; signe_le: string | null };
  signatures: { role: SignatureFichePdf["role"]; nom: string; signe_le: string; donnees_hash: string | null }[];
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

export default function SignatureFichePublique() {
  const { token = "" } = useParams();
  const [etat, setEtat] = useState<EtatLienFiche | null>(null);
  const [chargement, setChargement] = useState(true);
  const [lienInvalide, setLienInvalide] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [lu, setLu] = useState(false);
  const [attestation, setAttestation] = useState(false);
  const [otp, setOtp] = useState<{ canal: string; codeTest?: string } | null>(null);
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = (await appelFicheEtatPublique({ action: "lien_ouvrir", token })) as unknown as EtatLienFiche;
      setEtat(r);
      const [aerienne, situation] = await Promise.all([octetsUrl(r.images.aerienne), octetsUrl(r.images.situation)]);
      const bytes = await genFicheEtat({
        resolu: r.resolu,
        images: { aerienne, situation },
        signatures: r.signatures.map((s) => ({ role: s.role, nom: s.nom, signeLe: s.signe_le, empreinte: s.donnees_hash })),
      });
      setPdfUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      });
    } catch {
      setLienInvalide(true);
    } finally {
      setChargement(false);
    }
  }, [token]);

  useEffect(() => {
    void charger();
  }, [charger]);

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

  const demanderCode = () =>
    agir(async () => {
      const r = await appelFicheEtatPublique({ action: "lien_otp_demander", token, attestation: true });
      setOtp({ canal: r.canal as string, codeTest: r.code_test as string | undefined });
      setCode("");
    }, "otp");

  if (chargement) {
    return (
      <Cadre>
        <p className="se-small" style={{ color: "var(--fg-muted)" }}>Préparation de la fiche…</p>
      </Cadre>
    );
  }

  if (lienInvalide || !etat) {
    return (
      <Cadre>
        <div className="card-xl" style={{ padding: 26 }}>
          <h2 style={{ fontSize: 19, marginTop: 0 }}>Lien non valable</h2>
          <p className="se-body">
            Ce lien de signature n'est plus valable (expiré, remplacé par un lien plus récent ou inconnu). Demandez un
            nouveau lien à votre syndic ou à Strat Eco (contact@strateco.fr).
          </p>
        </div>
      </Cadre>
    );
  }

  const signe = !!etat.signataire.signe_le;

  return (
    <Cadre>
      <div className="card-xl" style={{ padding: 26 }}>
        <div className="se-eyebrow" style={{ marginBottom: 6 }}>{etat.copro}</div>
        <h2 style={{ fontSize: 19, marginTop: 0 }}>Fiche « État de la copropriété »</h2>
        <p className="se-body" style={{ marginTop: 0 }}>
          Bonjour {etat.signataire.nom}, cette fiche accompagne la demande de subvention MaPrimeRénov' Copropriété
          déposée auprès de l'Anah. Elle a été complétée par votre syndic et vérifiée par Strat Eco. Relisez-la jusqu'en
          bas, puis signez-la en tant que président(e) du conseil syndical.
        </p>

        {pdfUrl && <PdfLecteur url={pdfUrl} onLectureComplete={() => setLu(true)} />}

        {signe ? (
          <div className="send-ok" style={{ marginTop: 16 }}>
            <Icon name="checkCircle" size={18} />
            <div>
              Vous avez signé la fiche le {fmt(etat.signataire.signe_le!)}.
              <span className="so-sub">
                Vous recevrez un e-mail de confirmation dès que le syndic aura signé à son tour. Vous pouvez fermer cette page.
              </span>
            </div>
          </div>
        ) : !otp ? (
          <>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer", margin: "16px 0" }}>
              <input type="checkbox" checked={attestation} onChange={(e) => setAttestation(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                <b>Je certifie exacts les renseignements de cette fiche.</b>
              </span>
            </label>
            {erreur && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{erreur}</p>}
            <button
              className="se-btn se-btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={!lu || !attestation || !!busy}
              onClick={() => void demanderCode()}
            >
              <Icon name="lock" size={16} />
              {busy ? "Envoi du code…" : "Recevoir mon code de signature"}
            </button>
            <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10 }}>
              {lu ? "" : "Faites défiler la fiche jusqu'en bas pour activer la signature. "}
              Le code vous est envoyé par e-mail, à l'adresse déclarée par votre syndic.
            </p>
          </>
        ) : (
          <div style={{ marginTop: 16 }}>
            <p className="se-body" style={{ margin: "0 0 10px" }}>
              {otp.canal === "email" ? "Un code à 6 chiffres vient de vous être envoyé par e-mail." : "Mode test : aucun envoi réel configuré."} Il
              est valable 10 minutes.
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
                  await appelFicheEtatPublique({ action: "lien_otp_valider", token, code });
                  setOtp(null);
                  await charger();
                }, "valider")
              }
            >
              <Icon name="checkCircle" size={17} />
              {busy ? "Vérification…" : "Signer la fiche"}
            </button>
            <button className="se-btn se-btn-ghost btn-sm" style={{ marginTop: 10 }} disabled={!!busy} onClick={() => void demanderCode()}>
              Renvoyer un code
            </button>
          </div>
        )}
      </div>
    </Cadre>
  );
}
