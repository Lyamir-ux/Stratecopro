// Page publique de signature des documents éco-PTZ individuel (02/10/2026) :
// entreprise de travaux, auditeur ou syndic, par lien personnel sans compte.
// Un lien par signataire et par envoi : il ouvre chaque document où il figure
// (CERFA Annexe 3.1, attestations), certifie sur l'honneur, indique « Fait à »,
// puis signe le tout en une fois avec un code reçu par e-mail.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { PdfLecteur } from "@/components/PdfLecteur";
import { Cadre } from "@/pages/Signature";
import { appelSignatureDocumentsPublique, messageErreurSignatureDocuments } from "@/api/ecoPtzIndividuel";
import { messageErreur } from "@/lib/erreurs";

interface DocLien {
  id: string;
  type: "cerfa_ecoptz" | "attestation_ecoptz";
  libelle: string;
  statut: string;
  lu: boolean;
  signe_le: string | null;
}

interface EtatLien {
  copro: { nom: string; adresse: string };
  participant: {
    role: "entreprise" | "auditeur" | "syndic";
    role_libelle: string;
    societe: string;
    siret: string;
    nom: string;
    statut: string;
    signe_le: string | null;
    ville_proposee: string;
  };
  attestation: string;
  documents: DocLien[];
}

const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });

const QUOI: Record<EtatLien["participant"]["role"], string> = {
  entreprise: "Vous certifiez, pour votre entreprise, les travaux et le montant éligible de votre poste sur chaque formulaire.",
  auditeur: "Vous certifiez la synthèse de l'audit énergétique reprise en page 1 de chaque formulaire.",
  syndic: "Vous attestez le coût total éligible revenant à chaque logement et vous signez les attestations de montants.",
};

export default function SignatureDocumentsPublique() {
  const { token = "" } = useParams();
  const [etat, setEtat] = useState<EtatLien | null>(null);
  const [chargement, setChargement] = useState(true);
  const [lienInvalide, setLienInvalide] = useState(false);
  const [ouvert, setOuvert] = useState<{ id: string; url: string } | null>(null);
  const [lus, setLus] = useState<Set<string>>(new Set());
  const [attestation, setAttestation] = useState(false);
  const [faitA, setFaitA] = useState("");
  const [otp, setOtp] = useState<{ canal: string; codeTest?: string } | null>(null);
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = (await appelSignatureDocumentsPublique({ action: "lien_ouvrir", token })) as unknown as EtatLien;
      setEtat(r);
      setLus(new Set(r.documents.filter((d) => d.lu).map((d) => d.id)));
      setFaitA((f) => f || r.participant.ville_proposee || "");
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
      setErreur(messageErreur(e, messageErreurSignatureDocuments(undefined)));
    } finally {
      setBusy(null);
    }
  };

  const ouvrir = (d: DocLien) =>
    agir(async () => {
      const r = await appelSignatureDocumentsPublique({ action: "lien_document_url", token, document_id: d.id });
      setOuvert({ id: d.id, url: String(r.url) });
      setLus((s) => new Set(s).add(d.id));
    }, "ouvrir:" + d.id);

  const demanderCode = () =>
    agir(async () => {
      const r = await appelSignatureDocumentsPublique({ action: "lien_otp_demander", token, attestation: true, fait_a: faitA.trim() });
      setOtp({ canal: r.canal as string, codeTest: r.code_test as string | undefined });
      setCode("");
    }, "otp");

  if (chargement)
    return (
      <Cadre>
        <p className="se-small" style={{ color: "var(--fg-muted)" }}>Chargement des documents…</p>
      </Cadre>
    );

  if (lienInvalide || !etat)
    return (
      <Cadre>
        <div className="card-xl" style={{ padding: 26 }}>
          <h2 style={{ fontSize: 19, marginTop: 0 }}>Lien non valable</h2>
          <p className="se-body">
            Ce lien de signature n'est plus valable (expiré, remplacé par un lien plus récent, envoi annulé ou lien inconnu).
            Demandez un nouveau lien à Strat Eco (contact@strateco.fr).
          </p>
        </div>
      </Cadre>
    );

  const p = etat.participant;
  const signe = !!p.signe_le;
  const aSigner = etat.documents.filter((d) => d.statut === "en_attente" && !d.signe_le);
  const tousLus = aSigner.every((d) => lus.has(d.id));

  return (
    <Cadre>
      <div className="card-xl" style={{ padding: 26 }}>
        <div className="se-eyebrow" style={{ marginBottom: 6 }}>
          {etat.copro.nom}
          {etat.copro.adresse ? ` - ${etat.copro.adresse}` : ""}
        </div>
        <h2 style={{ fontSize: 19, marginTop: 0 }}>Documents éco-PTZ à signer</h2>
        <p className="se-body" style={{ marginTop: 0 }}>
          Bonjour {p.nom || p.societe}, des copropriétaires financent leur quote-part de travaux par un éco-prêt à taux zéro
          individuel. En tant que {p.role_libelle.toLowerCase()}
          {p.societe && p.role !== "syndic" ? ` (${p.societe})` : ""}, votre signature est attendue sur{" "}
          {etat.documents.length} document{etat.documents.length > 1 ? "s" : ""}. {QUOI[p.role]}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "14px 0" }}>
          {etat.documents.map((d) => (
            <div
              key={d.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: ouvert?.id === d.id ? "var(--bg-soft)" : undefined,
              }}
            >
              <Icon
                name={d.signe_le ? "checkCircle" : lus.has(d.id) ? "check" : "fileText"}
                size={16}
                style={{ color: d.signe_le || lus.has(d.id) ? "var(--color-primary-700)" : "var(--fg-muted)", flex: "none" }}
              />
              <span style={{ flex: 1, fontSize: 14 }}>{d.libelle}</span>
              <button className="se-btn se-btn-ghost btn-sm" disabled={!!busy} onClick={() => void ouvrir(d)}>
                {busy === "ouvrir:" + d.id ? "Ouverture…" : d.statut === "signe" ? "Voir le document signé" : "Lire"}
              </button>
            </div>
          ))}
        </div>

        {ouvert && <PdfLecteur key={ouvert.id} url={ouvert.url} onLectureComplete={() => undefined} hauteur={520} />}

        {signe ? (
          <div className="send-ok" style={{ marginTop: 16 }}>
            <Icon name="checkCircle" size={18} />
            <div>
              Vous avez signé le {fmt(p.signe_le!)}.
              <span className="so-sub">
                Un e-mail de confirmation vous a été envoyé. Les documents sont remis aux copropriétaires dès que tous les
                signataires ont signé. Vous pouvez fermer cette page.
              </span>
            </div>
          </div>
        ) : !otp ? (
          <>
            {!tousLus && (
              <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 14 }}>
                Ouvrez chaque document avant de signer ({aSigner.filter((d) => lus.has(d.id)).length}/{aSigner.length} lus).
              </p>
            )}
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer", margin: "16px 0 12px" }}>
              <input type="checkbox" checked={attestation} onChange={(e) => setAttestation(e.target.checked)} style={{ marginTop: 3 }} />
              <span>{etat.attestation}</span>
            </label>
            <div className="cs-field" style={{ marginBottom: 14 }}>
              <label>Fait à (ville)</label>
              <input className="edit-inp" style={{ maxWidth: "none", width: "100%" }} value={faitA} onChange={(e) => setFaitA(e.target.value)} />
            </div>
            {erreur && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{erreur}</p>}
            <button
              className="se-btn se-btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={!tousLus || !attestation || !faitA.trim() || !!busy}
              onClick={() => void demanderCode()}
            >
              <Icon name="lock" size={16} />
              {busy === "otp" ? "Envoi du code…" : "Recevoir mon code de signature"}
            </button>
            <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10 }}>
              Le code vous est envoyé par e-mail, à l'adresse à laquelle vous avez reçu ce lien.
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
                  await appelSignatureDocumentsPublique({ action: "lien_otp_valider", token, code });
                  setOtp(null);
                  setOuvert(null);
                  await charger();
                }, "valider")
              }
            >
              <Icon name="checkCircle" size={17} />
              {busy === "valider" ? "Signature en cours…" : `Signer ${aSigner.length > 1 ? `les ${aSigner.length} documents` : "le document"}`}
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
