// Dossier d'adhésion au prêt collectif éco-PTZ (CEGEE) : formulaire, puis
// signature électronique avancée (eIDAS art. 26) - CGU acceptées avant toute
// saisie, déclaration des cosignataires (chacun signe depuis son propre lien),
// dépôt de la pièce d'identité et du RIB par le principal, lecture complète du
// bulletin et code OTP. Le mandat SEPA reste à signer de façon MANUSCRITE.
// Voir SPEC_signature_bulletins_adhesion.md et CGU v1.6.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { PdfLecteur } from "@/components/PdfLecteur";
import { fmtDate } from "@/lib/format";
import {
  genBulletin,
  genMandatSepa,
  isValidBic,
  isValidIban,
  normalizeIban,
  type Adherent,
  type AdhesionForm,
  type SituationMatrimoniale,
} from "@/lib/pdf/adhesion";
import { checkRibConcordance } from "@/lib/pdf/ribCheck";
import { assemblerPieceIdentite, validerFichiersPiece } from "@/lib/pdf/pieceIdentite";
import { CGU_VERSION } from "@/lib/cguSignature";
import {
  lotsAnnexesNonRattaches,
  tantiemesAvecRattaches,
  uploadPdfGenere,
  urlSigneePiece,
  useMonAdhesion,
  useSaveAdhesion,
  type FinancementConfig,
  type Membership,
  type Scenario,
} from "@/api/portail";
import {
  appelSignature,
  creerBulletin,
  supprimerBrouillons,
  uploadVersBucket,
  useMesBulletins,
  useRelancerSignataire,
  type BulletinAvecSignataires,
  type CosignataireDeclare,
} from "@/api/signature";
import { readParams } from "@/api/scenarios";
import { libellesBatiments, USAGE_LOT_LABEL } from "@/lib/referentiels";
import { Modal } from "@/components/Modal";
import type { Bareme } from "@/lib/finance";
import type { Json } from "@/lib/database.types";
import type { SectionId } from "./index";

const SITUATIONS: { id: SituationMatrimoniale; label: string }[] = [
  { id: "mariee", label: "Marié(e)" },
  { id: "pacsee", label: "Pacsé(e)" },
  { id: "divorcee", label: "Divorcé(e)" },
  { id: "veuve", label: "Veuf / veuve" },
  { id: "celibataire", label: "Célibataire" },
];

const TYPES_PIECE = [
  { id: "cni", label: "Carte nationale d'identité" },
  { id: "passeport", label: "Passeport" },
  { id: "titre_sejour", label: "Titre de séjour" },
];

const emptyAdherent = (nom = ""): Adherent => ({
  nomPrenom: nom,
  nomNaissance: "",
  dateLieuNaissance: "",
  profession: "",
  professionDepuis: "",
  situation: "celibataire",
  situationDepuis: "",
});

const emptyForm = (nom: string, email: string, ville: string): AdhesionForm => ({
  adherent1: emptyAdherent(nom),
  adherent2: null,
  adresse: "",
  cp: "",
  ville: "",
  telDomicile: "",
  telBureau: "",
  portable: "",
  email,
  montantType: "100",
  montantAutre: "",
  lieuSignature: ville,
});

const emptyCosignataire = (): CosignataireDeclare => ({
  civilite: "",
  nom: "",
  prenom: "",
  email: "",
  telephone: "",
  adresse_ligne1: "",
  code_postal: "",
  ville: "",
  date_naissance: "",
  lieu_naissance: "",
});

/** Téléphone mobile français vers E.164 (+33612345678). */
function normaliserTelephone(tel: string): string {
  const brut = tel.replace(/[\s.\-()]/g, "");
  if (/^0[67]\d{8}$/.test(brut)) return "+33" + brut.slice(1);
  if (/^\+\d{8,15}$/.test(brut)) return brut;
  return brut;
}

const telValide = (tel: string) => /^\+\d{8,15}$/.test(normaliserTelephone(tel));
const emailValide = (e: string) => /.+@.+\..+/.test(e);

function Fld({ label, children, span }: { label: string; children: ReactNode; span?: boolean }) {
  return (
    <div className="fld" style={span ? { gridColumn: "1 / -1" } : undefined}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function AdherentFields({ a, onChange, titre }: { a: Adherent; onChange: (a: Adherent) => void; titre: string }) {
  const set = (patch: Partial<Adherent>) => onChange({ ...a, ...patch });
  return (
    <>
      <div className="se-eyebrow" style={{ gridColumn: "1 / -1", marginTop: 6 }}>{titre}</div>
      <Fld label="Nom et prénom *">
        <input value={a.nomPrenom} onChange={(e) => set({ nomPrenom: e.target.value })} />
      </Fld>
      <Fld label="Nom de naissance">
        <input value={a.nomNaissance} onChange={(e) => set({ nomNaissance: e.target.value })} />
      </Fld>
      <Fld label="Date et lieu de naissance *">
        <input placeholder="12/05/1980 à Colmar" value={a.dateLieuNaissance} onChange={(e) => set({ dateLieuNaissance: e.target.value })} />
      </Fld>
      <Fld label="Profession">
        <input value={a.profession} onChange={(e) => set({ profession: e.target.value })} />
      </Fld>
      <Fld label="Profession exercée depuis le">
        <input placeholder="01/09/2015" value={a.professionDepuis} onChange={(e) => set({ professionDepuis: e.target.value })} />
      </Fld>
      <Fld label="Situation matrimoniale *">
        <select value={a.situation} onChange={(e) => set({ situation: e.target.value as SituationMatrimoniale })}>
          {SITUATIONS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </Fld>
      {a.situation !== "celibataire" && (
        <Fld label="Depuis le">
          <input placeholder="15/06/2010" value={a.situationDepuis} onChange={(e) => set({ situationDepuis: e.target.value })} />
        </Fld>
      )}
    </>
  );
}

/** Aperçu inline d'un PDF généré (bucket pieces-copro), sans téléchargement. */
function ApercuPdfGenere({ name, path, onClose }: { name: string; path: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erreur, setErreur] = useState(false);
  useEffect(() => {
    let vivant = true;
    urlSigneePiece(path)
      .then((u) => vivant && setUrl(u))
      .catch(() => vivant && setErreur(true));
    return () => {
      vivant = false;
    };
  }, [path]);
  return (
    <Modal title={name} onClose={onClose} width={980}>
      <div style={{ height: "72vh", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        {erreur ? (
          <p className="se-small" style={{ color: "var(--color-error-700)", padding: 20, margin: 0 }}>
            Aperçu indisponible. Téléchargez le document pour l'ouvrir.
          </p>
        ) : url ? (
          <iframe src={url} title={name} style={{ width: "100%", height: "100%", border: 0 }} />
        ) : (
          <p className="se-small" style={{ color: "var(--fg-muted)", padding: 20, margin: 0 }}>
            Chargement de l'aperçu…
          </p>
        )}
      </div>
    </Modal>
  );
}

const STATUT_SIGNATAIRE: Record<string, { label: string; kind: "success" | "warn" | "neutral" }> = {
  en_attente: { label: "En attente", kind: "neutral" },
  identite_deposee: { label: "Identité déposée", kind: "warn" },
  signe: { label: "Signé", kind: "success" },
  expire: { label: "Lien expiré", kind: "warn" },
};

export function Adhesion({
  membership,
  scenario,
  bareme,
  config,
  email,
  go,
}: {
  membership: Membership;
  scenario: Scenario;
  bareme: Bareme;
  config: FinancementConfig;
  email: string;
  go: (s: SectionId) => void;
}) {
  const copro = membership.copro;
  const { data: adhesion, isLoading } = useMonAdhesion(copro.id, membership.coproprietaireId);
  const { data: bulletins, isLoading: chargeBulletins, refetch: refetchBulletins } = useMesBulletins(membership.coproprietaireId);
  const save = useSaveAdhesion(copro.id, membership.coproprietaireId);
  const relancer = useRelancerSignataire();

  const [form, setForm] = useState<AdhesionForm>(() => emptyForm(membership.nom, email, copro.city ?? ""));
  const [prenomPrincipal, setPrenomPrincipal] = useState("");
  const [nomPrincipal, setNomPrincipal] = useState(membership.nom);
  const [cosignataires, setCosignataires] = useState<CosignataireDeclare[]>([]);
  const [cguCochee, setCguCochee] = useState(false);
  const [attestHonneur, setAttestHonneur] = useState(false);
  const [infoAvis, setInfoAvis] = useState(false);

  const [typePiece, setTypePiece] = useState("cni");
  const [fichiersPiece, setFichiersPiece] = useState<File[]>([]);
  const [attestPiece, setAttestPiece] = useState(false);

  const [ribFichier, setRibFichier] = useState<File | null>(null);
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");

  const [idxSignature, setIdxSignature] = useState(0);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [otp, setOtp] = useState<{ canal: string; codeTest?: string } | null>(null);
  const [code, setCode] = useState("");

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apercu, setApercu] = useState<{ name: string; path: string } | null>(null);

  // reprise du brouillon existant
  useEffect(() => {
    if (!adhesion) return;
    const f = adhesion.form as Partial<AdhesionForm> | null;
    if (f?.adherent1) setForm((prev) => ({ ...prev, ...f } as AdhesionForm));
  }, [adhesion]);

  const cle = readParams(scenario.params, bareme).cle;
  const lotsHab = useMemo(() => {
    const hab = membership.lots.filter((l) => l.usage === "habitation");
    return hab.length ? hab : membership.lots;
  }, [membership.lots]);
  const aLotHab = membership.lots.some((l) => l.usage === "habitation");
  const annexesLibres = useMemo(
    () => (aLotHab ? lotsAnnexesNonRattaches(membership.lots) : []),
    [membership.lots, aLotHab]
  );

  const actifs = useMemo(
    () => (bulletins ?? []).filter((b) => b.statut !== "annule"),
    [bulletins]
  );
  const brouillons = actifs.filter((b) => b.statut === "brouillon");
  const principalDe = (b: BulletinAvecSignataires) => b.signataires.find((s) => s.role === "principal");

  const agir = async (fn: () => Promise<void>, label: string) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue. Réessayez.");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || chargeBulletins) {
    return <p className="se-small" style={{ color: "var(--fg-muted)" }}>Chargement du dossier…</p>;
  }

  // ---------- Lots annexes non rattachés : génération bloquée ----------
  if (actifs.length === 0 && adhesion?.statut !== "signee" && annexesLibres.length > 0) {
    return (
      <div className="card-xl fade" style={{ marginTop: 22 }}>
        <div className="cx-head">
          <Icon name="alert" size={20} style={{ color: "var(--color-warning-500)" }} />
          <h2 style={{ fontSize: 19 }}>Rattachez d'abord vos lots annexes</h2>
        </div>
        <div className="cx-body">
          <p className="se-body" style={{ marginTop: 0 }}>
            Vos documents d'adhésion (bulletins + mandat SEPA) ne peuvent pas être générés tant que{" "}
            {annexesLibres.length > 1 ? "ces lots ne sont pas rattachés" : "ce lot n'est pas rattaché"} à
            l'un de vos lots d'habitation. Le bulletin ne mentionne que le lot d'habitation, avec les
            tantièmes des lots rattachés additionnés.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {annexesLibres.map((l) => (
              <div key={l.id} className="afournir-row">
                <Icon name="alert" size={15} style={{ color: "var(--color-warning-500)" }} />
                Lot n°{l.num} ({(USAGE_LOT_LABEL[l.usage] ?? l.usage).toLowerCase()})
                {l.batiment ? ` · ${libellesBatiments(copro.denomination_batiments).court} ` + l.batiment : ""} - non rattaché
              </div>
            ))}
          </div>
          <button className="se-btn se-btn-primary" onClick={() => go("plan-indiv")}>
            <Icon name="link" size={16} />
            Rattacher mes lots dans « Mes quotes-parts »
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // SUIVI : bulletins en signature / complets / expirés
  // ============================================================
  if (actifs.length > 0 && brouillons.length === 0) {
    const tousComplets = actifs.every((b) => b.statut === "complet");
    return (
      <div className="card-xl fade" style={{ marginTop: 22 }}>
        <div className="cx-head">
          <Icon name={tousComplets ? "checkCircle" : "clock"} size={20}
            style={{ color: tousComplets ? "var(--color-success-500)" : "var(--accent)" }} />
          <h2 style={{ fontSize: 19 }}>
            {tousComplets ? "Dossier d'adhésion signé" : "Signatures en cours"}
          </h2>
          <span style={{ flex: 1 }}></span>
          {tousComplets && <Badge kind="success">Scellé le {fmtDate(actifs[0].scelle_le)}</Badge>}
        </div>
        <div className="cx-body">
          {actifs.map((b) => (
            <div key={b.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <b>Bulletin d'adhésion - {b.lot_reference}</b>
                <span style={{ flex: 1 }}></span>
                <Badge kind={b.statut === "complet" ? "success" : b.statut === "expire" ? "warn" : "neutral"}>
                  {b.statut === "complet" ? "Signé et scellé" : b.statut === "expire" ? "Liens expirés" : "En signature"}
                </Badge>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {b.signataires.sort((x, y) => x.ordre - y.ordre).map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
                    <Icon name={s.statut === "signe" ? "checkCircle" : "clock"} size={15}
                      style={{ color: s.statut === "signe" ? "var(--color-success-500)" : "var(--fg-muted)" }} />
                    <span>{s.prenom} {s.nom}{s.role === "principal" ? " (vous)" : ""}</span>
                    <Badge kind={STATUT_SIGNATAIRE[s.statut]?.kind ?? "neutral"}>
                      {STATUT_SIGNATAIRE[s.statut]?.label ?? s.statut}
                      {s.signe_le ? ` le ${fmtDate(s.signe_le)}` : ""}
                    </Badge>
                    <span style={{ flex: 1 }}></span>
                    {b.statut === "en_signature" && s.role === "cosignataire" && s.statut !== "signe" && (
                      <button
                        className="se-btn se-btn-ghost btn-sm"
                        disabled={relancer.isPending}
                        onClick={() => void relancer.mutateAsync(s.id).catch(() => null)}
                      >
                        <Icon name="send" size={13} />Relancer
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {b.statut === "complet" && (
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button
                    className="se-btn se-btn-secondary btn-sm"
                    onClick={() =>
                      void agir(async () => {
                        const r = await appelSignature({ action: "principal_document_url", bulletin_id: b.id, quoi: "signe" });
                        if (typeof r.url === "string") window.open(r.url, "_blank");
                      }, "dl")
                    }
                  >
                    <Icon name="download" size={14} />Bulletin signé
                  </button>
                  <button
                    className="se-btn se-btn-secondary btn-sm"
                    onClick={() =>
                      void agir(async () => {
                        const r = await appelSignature({ action: "principal_document_url", bulletin_id: b.id, quoi: "certificat" });
                        if (typeof r.url === "string") window.open(r.url, "_blank");
                      }, "dl")
                    }
                  >
                    <Icon name="fileCheck" size={14} />Certificat de preuve
                  </button>
                </div>
              )}
            </div>
          ))}

          {adhesion?.sepa_path && (
            <>
              <div className="se-eyebrow" style={{ margin: "18px 0 8px" }}>Mandat de prélèvement SEPA</div>
              <div className="doc-row">
                <span className="d-ico" style={{ background: "var(--accent-soft)", color: "var(--color-primary-700)" }}>
                  <Icon name="fileText" size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="d-name">Mandat SEPA pré-rempli</div>
                  <div className="d-sub">À imprimer et signer à la main - aucune rature</div>
                </div>
                <span className="spacer"></span>
                <button
                  className="icon-btn"
                  title="Visualiser sans télécharger"
                  onClick={() => setApercu({ name: "Mandat SEPA pré-rempli", path: adhesion.sepa_path! })}
                >
                  <Icon name="eye" size={16} />
                </button>
              </div>
              <div className="proc-note" style={{ marginTop: 14 }}>
                <Icon name="send" size={18} />
                <div>
                  <b>Le mandat SEPA doit être signé de façon manuscrite.</b>
                  <span>
                    Imprimez-le, signez-le sans rature, puis envoyez-le par courrier à Strat Eco ou
                    remettez-le en main propre. Pensez aussi à téléverser vos pièces justificatives
                    dans « Mes documents ».
                  </span>
                </div>
              </div>
            </>
          )}

          {actifs.some((b) => b.statut === "expire") && (
            <div className="cc-next" style={{ marginTop: 12 }}>
              <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
              <span>
                Des liens de signature ont expiré (30 jours). Contactez Strat Eco (contact@strateco.fr)
                pour relancer la procédure.
              </span>
            </div>
          )}
          {error && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 10 }}>{error}</p>}
        </div>
        {apercu && <ApercuPdfGenere name={apercu.name} path={apercu.path} onClose={() => setApercu(null)} />}
      </div>
    );
  }

  // ============================================================
  // PRÉPARATION EN COURS : bulletins en brouillon
  // ============================================================
  if (brouillons.length > 0) {
    const pieceOk = brouillons.every((b) => !!principalDe(b)?.piece_deposee_le);
    const ribOk = brouillons.every((b) => !!b.rib_path);

    // ---------- étape pièce d'identité ----------
    if (!pieceOk) {
      const erreurFichiers = fichiersPiece.length ? validerFichiersPiece(fichiersPiece) : null;
      return (
        <div className="card-xl fade" style={{ marginTop: 22 }}>
          <div className="cx-head">
            <Icon name="user" size={20} style={{ color: "var(--accent)" }} />
            <h2 style={{ fontSize: 19 }}>Votre pièce d'identité</h2>
          </div>
          <div className="cx-body">
            <p className="se-body" style={{ marginTop: 0 }}>
              Déposez <b>votre propre pièce d'identité</b> en cours de validité (photo recto/verso ou PDF).
              Chaque cosignataire déposera la sienne depuis son propre lien - vous ne pouvez pas le faire
              à sa place.
            </p>
            <div className="form-grid">
              <Fld label="Type de pièce">
                <select value={typePiece} onChange={(e) => setTypePiece(e.target.value)}>
                  {TYPES_PIECE.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </Fld>
              <Fld label="Fichier(s) - JPG, PNG ou PDF, 10 Mo max">
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  multiple
                  onChange={(e) => setFichiersPiece([...(e.target.files ?? [])].slice(0, 2))}
                />
              </Fld>
            </div>
            {erreurFichiers && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{erreurFichiers}</p>}
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer", margin: "14px 0" }}>
              <input type="checkbox" checked={attestPiece} onChange={(e) => setAttestPiece(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Je certifie que la pièce d'identité que je téléverse est <b>la mienne</b> et qu'elle est en cours de validité.</span>
            </label>
            {error && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{error}</p>}
            <button
              className="se-btn se-btn-primary"
              disabled={!fichiersPiece.length || !!erreurFichiers || !attestPiece || !!busy}
              onClick={() =>
                void agir(async () => {
                  const piece = await assemblerPieceIdentite(fichiersPiece);
                  for (const b of brouillons) {
                    const up = await appelSignature({ action: "principal_piece_upload", bulletin_id: b.id, ext: piece.ext });
                    await uploadVersBucket("signature-pieces", up.path as string, up.token as string, piece.blob);
                    await appelSignature({
                      action: "principal_piece_confirmer",
                      bulletin_id: b.id,
                      path: up.path,
                      type_piece: typePiece,
                      attestation: true,
                    });
                  }
                  await refetchBulletins();
                }, "piece")
              }
            >
              <Icon name="upload" size={16} />
              {busy ? "Dépôt en cours…" : "Déposer ma pièce d'identité"}
            </button>
          </div>
        </div>
      );
    }

    // ---------- étape RIB ----------
    if (!ribOk) {
      const ibanOk = isValidIban(iban);
      const bicOk = isValidBic(bic);
      return (
        <div className="card-xl fade" style={{ marginTop: 22 }}>
          <div className="cx-head">
            <Icon name="euro" size={20} style={{ color: "var(--accent)" }} />
            <h2 style={{ fontSize: 19 }}>RIB du lot</h2>
          </div>
          <div className="cx-body">
            <p className="se-body" style={{ marginTop: 0 }}>
              Le RIB sert au prélèvement des échéances du prêt (un seul RIB par bulletin). L'IBAN est
              conservé chiffré ; seuls ses 4 derniers caractères restent affichables.
            </p>
            <div className="form-grid">
              <Fld label="RIB (JPG, PNG ou PDF) *" span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={(e) => setRibFichier(e.target.files?.[0] ?? null)}
                />
              </Fld>
              <Fld label="IBAN *">
                <input placeholder="FR76 …" value={iban} onChange={(e) => setIban(e.target.value)} />
              </Fld>
              <Fld label="BIC *">
                <input placeholder="CEPAFRPP…" value={bic} onChange={(e) => setBic(e.target.value)} />
              </Fld>
            </div>
            {iban && !ibanOk && (
              <p className="se-small" style={{ color: "var(--color-error-700)", margin: "6px 0 0" }}>
                IBAN invalide - vérifiez la saisie (clé de contrôle incorrecte).
              </p>
            )}
            {bic && !bicOk && (
              <p className="se-small" style={{ color: "var(--color-error-700)", margin: "6px 0 0" }}>
                BIC invalide - 8 ou 11 caractères (ex. CEPAFRPP513).
              </p>
            )}
            {error && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 8 }}>{error}</p>}
            <button
              className="se-btn se-btn-primary"
              style={{ marginTop: 14 }}
              disabled={!ribFichier || !ibanOk || !bicOk || !!busy}
              onClick={() =>
                void agir(async () => {
                  // concordance IBAN saisi / RIB déposé (information AMO)
                  const concordance = await checkRibConcordance(ribFichier!, ribFichier!.type, iban);
                  const ext = ribFichier!.type === "application/pdf" ? "pdf" : ribFichier!.type === "image/png" ? "png" : "jpg";
                  for (const b of brouillons) {
                    const up = await appelSignature({ action: "principal_rib_upload", bulletin_id: b.id, ext });
                    await uploadVersBucket("signature-pieces", up.path as string, up.token as string, ribFichier!);
                    await appelSignature({
                      action: "principal_rib_confirmer",
                      bulletin_id: b.id,
                      path: up.path,
                      iban: normalizeIban(iban),
                    });
                  }
                  // mandat SEPA pré-rempli (signature manuscrite exigée)
                  const sepaBytes = await genMandatSepa({
                    nom: form.adherent1.nomPrenom || `${prenomPrincipal} ${nomPrincipal}`,
                    rue: form.adresse,
                    cp: form.cp,
                    ville: form.ville,
                    iban,
                    bic,
                    lieu: form.lieuSignature || copro.city || "",
                    date: new Date(),
                  });
                  const sepaPath = await uploadPdfGenere("mandat-sepa.pdf", sepaBytes);
                  await save.mutateAsync({
                    scenarioId: scenario.id,
                    form: form as unknown as Json,
                    // l'IBAN ne se stocke plus en clair : il vit chiffré sur le bulletin
                    iban: "",
                    bic: "",
                    lieuSignature: form.lieuSignature,
                    sepaPath,
                    ribConcordance: concordance,
                  });
                  await refetchBulletins();
                }, "rib")
              }
            >
              <Icon name="upload" size={16} />
              {busy ? "Dépôt en cours…" : "Déposer le RIB et continuer"}
            </button>
          </div>
        </div>
      );
    }

    // ---------- étape lecture + OTP (bulletin par bulletin) ----------
    const idx = Math.min(idxSignature, brouillons.length - 1);
    const bulletinCourant = brouillons[idx];
    const sPrincipal = principalDe(bulletinCourant);
    const documentLu = !!sPrincipal?.document_lu_le;
    return (
      <div className="card-xl fade" style={{ marginTop: 22 }}>
        <div className="cx-head">
          <Icon name="edit" size={20} style={{ color: "var(--accent)" }} />
          <h2 style={{ fontSize: 19 }}>
            Signature - {bulletinCourant.lot_reference}
            {brouillons.length > 1 ? ` (${idx + 1}/${brouillons.length})` : ""}
          </h2>
        </div>
        <div className="cx-body">
          <p className="se-body" style={{ marginTop: 0 }}>
            Lisez l'intégralité du bulletin, puis signez-le avec le code à usage unique qui vous sera
            transmis. {bulletinCourant.signataires.length > 1
              ? "Votre signature déclenche l'envoi des liens de signature à vos cosignataires."
              : "Vous êtes l'unique signataire : le document sera scellé dès votre signature."}
          </p>
          {!docUrl ? (
            <button
              className="se-btn se-btn-secondary"
              disabled={!!busy}
              onClick={() =>
                void agir(async () => {
                  const r = await appelSignature({ action: "principal_document_url", bulletin_id: bulletinCourant.id, quoi: "document" });
                  setDocUrl(r.url as string);
                }, "doc")
              }
            >
              <Icon name="fileText" size={16} />
              Afficher le bulletin
            </button>
          ) : (
            <PdfLecteur
              url={docUrl}
              onLectureComplete={() => {
                void appelSignature({ action: "principal_document_lu", bulletin_id: bulletinCourant.id })
                  .then(() => refetchBulletins())
                  .catch(() => null);
              }}
            />
          )}

          {!otp ? (
            <>
              {error && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 10 }}>{error}</p>}
              <button
                className="se-btn se-btn-primary"
                style={{ marginTop: 14 }}
                disabled={!documentLu || !!busy}
                onClick={() =>
                  void agir(async () => {
                    const r = await appelSignature({ action: "principal_otp_demander", bulletin_id: bulletinCourant.id });
                    setOtp({ canal: r.canal as string, codeTest: r.code_test as string | undefined });
                  }, "otp")
                }
              >
                <Icon name="lock" size={16} />
                {busy ? "Envoi du code…" : "Recevoir mon code de signature"}
              </button>
            </>
          ) : (
            <div style={{ marginTop: 16, maxWidth: 380 }}>
              <p className="se-body" style={{ margin: "0 0 10px" }}>
                {otp.canal === "email"
                  ? "Un code à 6 chiffres vient de vous être envoyé par e-mail."
                  : otp.canal === "sms"
                    ? "Un code à 6 chiffres vient d'être envoyé par SMS."
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
                  width: "100%", fontSize: 28, letterSpacing: 12, textAlign: "center",
                  padding: "8px 0", border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
                }}
              />
              {error && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 8 }}>{error}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  className="se-btn se-btn-primary"
                  disabled={code.length !== 6 || !!busy}
                  onClick={() =>
                    void agir(async () => {
                      await appelSignature({ action: "principal_otp_valider", bulletin_id: bulletinCourant.id, code });
                      setOtp(null);
                      setCode("");
                      setDocUrl(null);
                      setIdxSignature(idx + 1);
                      await refetchBulletins();
                    }, "valider")
                  }
                >
                  <Icon name="checkCircle" size={17} />
                  {busy ? "Vérification…" : "Signer ce bulletin"}
                </button>
                <button
                  className="se-btn se-btn-ghost btn-sm"
                  disabled={!!busy}
                  onClick={() =>
                    void agir(async () => {
                      const r = await appelSignature({ action: "principal_otp_demander", bulletin_id: bulletinCourant.id });
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

          <button
            className="se-btn se-btn-ghost btn-sm"
            style={{ marginTop: 20 }}
            disabled={!!busy}
            onClick={() =>
              void agir(async () => {
                await supprimerBrouillons(membership.coproprietaireId);
                setIdxSignature(0);
                setDocUrl(null);
                setOtp(null);
                await refetchBulletins();
              }, "reset")
            }
          >
            <Icon name="trash" size={14} />
            Abandonner et reprendre la préparation à zéro
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Ancien dossier signé (avant la signature électronique avancée)
  // ============================================================
  if (adhesion?.statut === "signee") {
    const anciens = (adhesion.bulletins as { lotNum: string; path: string }[] | null) ?? [];
    return (
      <div className="card-xl fade" style={{ marginTop: 22 }}>
        <div className="cx-head">
          <Icon name="checkCircle" size={20} style={{ color: "var(--color-success-500)" }} />
          <h2 style={{ fontSize: 19 }}>Dossier d'adhésion signé</h2>
          <span style={{ flex: 1 }}></span>
          <Badge kind="success">Signé le {fmtDate(adhesion.signed_at)}</Badge>
        </div>
        <div className="cx-body">
          <div className="se-eyebrow" style={{ marginBottom: 8 }}>Vos bulletins d'adhésion (signés)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {anciens.map((b) => (
              <div key={b.path} className="doc-row">
                <span className="d-ico"><Icon name="fileText" size={18} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="d-name">Bulletin d'adhésion - Lot n°{b.lotNum}</div>
                  <div className="d-sub">PDF pré-rempli et signé électroniquement</div>
                </div>
                <span className="spacer"></span>
                <button
                  className="icon-btn"
                  title="Visualiser sans télécharger"
                  onClick={() => setApercu({ name: `Bulletin d'adhésion - Lot n°${b.lotNum}`, path: b.path })}
                >
                  <Icon name="eye" size={16} />
                </button>
              </div>
            ))}
          </div>
          {adhesion.sepa_path && (
            <>
              <div className="se-eyebrow" style={{ margin: "18px 0 8px" }}>Mandat de prélèvement SEPA</div>
              <div className="doc-row">
                <span className="d-ico" style={{ background: "var(--accent-soft)", color: "var(--color-primary-700)" }}>
                  <Icon name="fileText" size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="d-name">Mandat SEPA pré-rempli</div>
                  <div className="d-sub">À imprimer et signer à la main - aucune rature</div>
                </div>
                <span className="spacer"></span>
                <button
                  className="icon-btn"
                  title="Visualiser sans télécharger"
                  onClick={() => setApercu({ name: "Mandat SEPA pré-rempli", path: adhesion.sepa_path! })}
                >
                  <Icon name="eye" size={16} />
                </button>
              </div>
            </>
          )}
        </div>
        {apercu && <ApercuPdfGenere name={apercu.name} path={apercu.path} onClose={() => setApercu(null)} />}
      </div>
    );
  }

  // ============================================================
  // FORMULAIRE : CGU d'abord, puis saisie + cosignataires
  // ============================================================

  // ---------- porte d'entrée : acceptation des CGU avant toute saisie ----------
  if (!cguCochee) {
    return (
      <div className="card-xl fade" style={{ marginTop: 22 }}>
        <div className="cx-head">
          <Icon name="fileCheck" size={20} style={{ color: "var(--accent)" }} />
          <h2 style={{ fontSize: 19 }}>Adhésion au prêt collectif - avant de commencer</h2>
        </div>
        <div className="cx-body">
          <p className="se-body" style={{ marginTop: 0 }}>
            Ce parcours vous permet de remplir votre bulletin d'adhésion à l'éco-prêt à taux zéro puis de
            le <b>signer électroniquement</b> (signature électronique avancée : pièce d'identité + code à
            usage unique). Si le lot a plusieurs propriétaires (indivision, couple, SCI), chacun signera
            depuis son propre lien, reçu par e-mail.
          </p>
          <p className="se-body">
            L'acceptation des Conditions Générales d'Utilisation est un préalable : elles régissent le
            traitement de vos données (pièce d'identité, RIB) et la valeur juridique de la signature.
          </p>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer", margin: "14px 0" }}>
            <input type="checkbox" onChange={(e) => setCguCochee(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              J'ai lu et j'accepte les{" "}
              <a href="/cgu-signature" target="_blank" rel="noreferrer">Conditions Générales d'Utilisation</a>{" "}
              du service de signature électronique Strat Eco Pro (version {CGU_VERSION}), y compris la
              convention de preuve figurant à l'article 5.2.
            </span>
          </label>
        </div>
      </div>
    );
  }

  // ---------- formulaire + cosignataires ----------
  const champsOk =
    form.adherent1.nomPrenom.trim() &&
    form.adherent1.dateLieuNaissance.trim() &&
    form.adresse.trim() &&
    form.cp.trim() &&
    form.ville.trim() &&
    form.portable.trim() &&
    form.email.trim() &&
    form.lieuSignature.trim() &&
    (form.montantType === "100" || form.montantAutre.trim()) &&
    (!form.adherent2 || (form.adherent2.nomPrenom.trim() && form.adherent2.dateLieuNaissance.trim()));

  const principalOk =
    prenomPrincipal.trim() && nomPrincipal.trim() && emailValide(form.email) && telValide(form.portable);
  const cosignatairesOk = cosignataires.every(
    (c) => c.nom.trim() && c.prenom.trim() && emailValide(c.email) && telValide(c.telephone)
  );
  // garde-fou anti auto-signature : e-mails et téléphones tous distincts
  const emails = [form.email, ...cosignataires.map((c) => c.email)].map((e) => e.trim().toLowerCase()).filter(Boolean);
  const tels = [form.portable, ...cosignataires.map((c) => c.telephone)].map(normaliserTelephone).filter(Boolean);
  const doublons = new Set(emails).size !== emails.length || new Set(tels).size !== tels.length;

  const saveBrouillon = () =>
    save.mutate({
      scenarioId: scenario.id,
      form: form as unknown as Json,
      iban: "",
      bic: "",
      lieuSignature: form.lieuSignature,
    });

  const preparerSignature = () =>
    agir(async () => {
      saveBrouillon();
      const date = new Date();
      const ctxBase = {
        adresseImmeuble: copro.adresse ?? copro.name,
        nomSyndic: copro.syndic_name ?? "",
        // L'interlocuteur du bulletin est le gestionnaire de la copropriété chez
        // le syndic (pas l'AMO) - feedback du 03/09/2026
        interlocuteur: copro.gestionnaire_nom?.trim() || copro.syndic_name || "",
      };
      for (const lot of lotsHab) {
        const tantiemes = tantiemesAvecRattaches(membership.lots, lot, cle);
        const bulletinId = await creerBulletin({
          coproId: copro.id,
          coproprietaireId: membership.coproprietaireId,
          adhesionId: adhesion?.id ?? null,
          lotId: lot.id,
          lotReference: `Lot n°${lot.num}${lot.batiment ? ` - ${libellesBatiments(copro.denomination_batiments).court} ${lot.batiment}` : ""}`,
          tantiemes,
          cguVersion: CGU_VERSION,
          principal: {
            nom: nomPrincipal.trim(),
            prenom: prenomPrincipal.trim(),
            email: form.email.trim(),
            telephone: normaliserTelephone(form.portable),
          },
          cosignataires: cosignataires.map((c) => ({
            ...c,
            email: c.email.trim(),
            telephone: normaliserTelephone(c.telephone),
          })),
        });
        // PDF du bulletin (non signé - les blocs de signature sont apposés au
        // scellement), déposé côté serveur qui calcule l'empreinte de référence
        const bytes = await genBulletin(
          form,
          { ...ctxBase, lotNum: lot.num, tantiemes: String(tantiemes) },
          date
        );
        const up = await appelSignature({ action: "principal_document_upload", bulletin_id: bulletinId });
        await uploadVersBucket("signature-docs", up.path as string, up.token as string,
          new Blob([bytes as BlobPart], { type: "application/pdf" }));
        await appelSignature({ action: "principal_document_confirmer", bulletin_id: bulletinId });
        await appelSignature({ action: "principal_cgu", bulletin_id: bulletinId });
        await appelSignature({ action: "principal_attestation_honneur", bulletin_id: bulletinId, info_avis: infoAvis });
      }
      await refetchBulletins();
    }, "preparer");

  return (
    <div className="card-xl fade" style={{ marginTop: 22 }}>
      <div className="cx-head">
        <Icon name="clipboard" size={20} style={{ color: "var(--accent)" }} />
        <h2 style={{ fontSize: 19 }}>Dossier d'adhésion au prêt collectif</h2>
        <span style={{ flex: 1 }}></span>
        {adhesion && <Badge kind="neutral">Brouillon enregistré</Badge>}
      </div>
      <div className="cx-body">
        <p className="se-body" style={{ marginTop: 0 }}>
          Ces informations remplissent automatiquement le bulletin d'adhésion {config.banque} et le mandat SEPA.
          Un bulletin sera généré <b>pour chacun de vos {lotsHab.length > 1 ? lotsHab.length + " lots" : "lots"} d'habitation</b>
          {membership.lots.some((l) => l.rattacheA) ? ", tantièmes des lots rattachés (garage, cave…) additionnés" : ""}.
        </p>

        <div className="form-grid">
          <AdherentFields a={form.adherent1} onChange={(a) => setForm({ ...form, adherent1: a })} titre="Adhérent 1" />

          {form.adherent2 ? (
            <>
              <AdherentFields a={form.adherent2} onChange={(a) => setForm({ ...form, adherent2: a })} titre="Adhérent 2 (co-emprunteur)" />
              <div style={{ gridColumn: "1 / -1" }}>
                <button className="se-btn se-btn-ghost btn-sm" onClick={() => setForm({ ...form, adherent2: null })}>
                  <Icon name="trash" size={14} />Retirer l'adhérent 2
                </button>
              </div>
            </>
          ) : (
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="se-btn se-btn-ghost btn-sm" onClick={() => setForm({ ...form, adherent2: emptyAdherent() })}>
                <Icon name="plus" size={14} />Ajouter un adhérent 2 (conjoint, indivisaire…)
              </button>
            </div>
          )}

          <div className="se-eyebrow" style={{ gridColumn: "1 / -1", marginTop: 6 }}>Coordonnées</div>
          <Fld label="Adresse personnelle *" span>
            <input value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
          </Fld>
          <Fld label="Code postal *">
            <input value={form.cp} onChange={(e) => setForm({ ...form, cp: e.target.value })} />
          </Fld>
          <Fld label="Ville *">
            <input value={form.ville} onChange={(e) => setForm({ ...form, ville: e.target.value })} />
          </Fld>
          <Fld label="Téléphone portable *">
            <input value={form.portable} onChange={(e) => setForm({ ...form, portable: e.target.value })} />
          </Fld>
          <Fld label="Téléphone domicile">
            <input value={form.telDomicile} onChange={(e) => setForm({ ...form, telDomicile: e.target.value })} />
          </Fld>
          <Fld label="Téléphone bureau">
            <input value={form.telBureau} onChange={(e) => setForm({ ...form, telBureau: e.target.value })} />
          </Fld>
          <Fld label="E-mail *">
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Fld>

          <div className="se-eyebrow" style={{ gridColumn: "1 / -1", marginTop: 6 }}>Montant demandé</div>
          <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
              <input type="radio" checked={form.montantType === "100"} onChange={() => setForm({ ...form, montantType: "100" })} />
              100 % de ma quote-part des dépenses éligibles à l'éco-PTZ (+ frais de garantie)
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
              <input type="radio" checked={form.montantType === "autre"} onChange={() => setForm({ ...form, montantType: "autre" })} />
              Autre montant (dans la limite de ma quote-part) :
              <input
                style={{ width: 140 }}
                placeholder="Montant en €"
                value={form.montantAutre}
                disabled={form.montantType !== "autre"}
                onChange={(e) => setForm({ ...form, montantAutre: e.target.value })}
              />
            </label>
          </div>

          <Fld label="Fait à (lieu de signature) *">
            <input value={form.lieuSignature} onChange={(e) => setForm({ ...form, lieuSignature: e.target.value })} />
          </Fld>

          {/* ---------- signataires ---------- */}
          <div className="se-eyebrow" style={{ gridColumn: "1 / -1", marginTop: 6 }}>Signataire principal (vous)</div>
          <Fld label="Prénom *">
            <input value={prenomPrincipal} onChange={(e) => setPrenomPrincipal(e.target.value)} />
          </Fld>
          <Fld label="Nom *">
            <input value={nomPrincipal} onChange={(e) => setNomPrincipal(e.target.value)} />
          </Fld>
          <p className="se-small" style={{ gridColumn: "1 / -1", color: "var(--fg-muted)", margin: 0 }}>
            Votre code de signature vous sera transmis personnellement (e-mail et téléphone portable
            renseignés ci-dessus).
          </p>

          <div className="se-eyebrow" style={{ gridColumn: "1 / -1", marginTop: 6 }}>
            Cosignataires (indivision, couple, SCI…)
          </div>
          <p className="se-small" style={{ gridColumn: "1 / -1", color: "var(--fg-muted)", margin: 0 }}>
            Si le lot a plusieurs propriétaires, <b>tous doivent signer</b>. Chaque cosignataire recevra
            son propre lien par e-mail, déposera lui-même sa pièce d'identité et signera avec son propre
            code : vous ne pouvez pas signer à sa place.
          </p>
          {cosignataires.map((c, i) => (
            <div key={i} style={{ gridColumn: "1 / -1", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                <b style={{ fontSize: 14 }}>Cosignataire {i + 1}</b>
                <span style={{ flex: 1 }}></span>
                <button className="se-btn se-btn-ghost btn-sm" onClick={() => setCosignataires(cosignataires.filter((_, j) => j !== i))}>
                  <Icon name="trash" size={13} />Retirer
                </button>
              </div>
              <div className="form-grid">
                <Fld label="Civilité">
                  <select value={c.civilite} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, civilite: e.target.value } : x)))}>
                    <option value="">-</option>
                    <option value="Madame">Madame</option>
                    <option value="Monsieur">Monsieur</option>
                  </select>
                </Fld>
                <Fld label="Prénom *">
                  <input value={c.prenom} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, prenom: e.target.value } : x)))} />
                </Fld>
                <Fld label="Nom *">
                  <input value={c.nom} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} />
                </Fld>
                <Fld label="E-mail *">
                  <input type="email" value={c.email} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                </Fld>
                <Fld label="Téléphone mobile *">
                  <input placeholder="06 12 34 56 78" value={c.telephone} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, telephone: e.target.value } : x)))} />
                </Fld>
                <Fld label="Date de naissance">
                  <input type="date" value={c.date_naissance} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, date_naissance: e.target.value } : x)))} />
                </Fld>
                <Fld label="Lieu de naissance">
                  <input value={c.lieu_naissance} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, lieu_naissance: e.target.value } : x)))} />
                </Fld>
                <Fld label="Adresse postale" span>
                  <input value={c.adresse_ligne1} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, adresse_ligne1: e.target.value } : x)))} />
                </Fld>
                <Fld label="Code postal">
                  <input value={c.code_postal} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, code_postal: e.target.value } : x)))} />
                </Fld>
                <Fld label="Ville">
                  <input value={c.ville} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, ville: e.target.value } : x)))} />
                </Fld>
              </div>
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1" }}>
            <button className="se-btn se-btn-ghost btn-sm" onClick={() => setCosignataires([...cosignataires, emptyCosignataire()])}>
              <Icon name="plus" size={14} />Ajouter un cosignataire
            </button>
          </div>
          {doublons && (
            <p className="se-small" style={{ gridColumn: "1 / -1", color: "var(--color-error-700)", margin: 0 }}>
              Chaque signataire doit avoir son propre e-mail et son propre téléphone : les coordonnées ne
              peuvent pas être partagées entre deux signataires.
            </p>
          )}

          <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={attestHonneur} onChange={(e) => setAttestHonneur(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                Je certifie sur l'honneur que les coordonnées communiquées correspondent aux personnes
                déclarées et que je suis habilité(e) à les transmettre.
              </span>
            </label>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={infoAvis} onChange={(e) => setInfoAvis(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                J'ai été informé(e) que mon avis d'imposition sera transmis dans son intégralité à l'Anah
                et, le cas échéant, à l'établissement bancaire instruisant ma demande d'éco-prêt à taux
                zéro, aux fins de vérification de mes ressources, puis supprimé des systèmes de Strat Eco
                une fois ces transmissions effectuées.
              </span>
            </label>
          </div>
        </div>

        {error && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 12 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
          <button className="se-btn se-btn-ghost" onClick={saveBrouillon} disabled={save.isPending || !!busy}>
            {save.isPending ? "Enregistrement…" : "Enregistrer le brouillon"}
          </button>
          <button
            className="se-btn se-btn-primary"
            disabled={!champsOk || !principalOk || !cosignatairesOk || doublons || !attestHonneur || !infoAvis || !!busy}
            onClick={() => void preparerSignature()}
          >
            {busy ? "Préparation des bulletins…" : "Passer à la signature"}
            <Icon name="arrowRight" size={16} />
          </button>
        </div>
        {!champsOk && (
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10 }}>
            Renseignez tous les champs marqués * - la banque rejette les dossiers incomplets.
          </p>
        )}
        {champsOk && !principalOk && (
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10 }}>
            Renseignez vos prénom et nom de signataire, un e-mail valide et un téléphone portable valide.
          </p>
        )}
      </div>
      {apercu && <ApercuPdfGenere name={apercu.name} path={apercu.path} onClose={() => setApercu(null)} />}
    </div>
  );
}
