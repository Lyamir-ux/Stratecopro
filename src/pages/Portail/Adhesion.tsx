// Dossier d'adhésion au prêt collectif éco-PTZ (CEGEE) : formulaire, puis
// signature électronique avancée (eIDAS art. 26) - CGU acceptées avant toute
// saisie, déclaration des cosignataires (chacun signe depuis son propre lien),
// dépôt de la pièce d'identité et du RIB par le principal, lecture complète du
// bulletin et du mandat SEPA, puis code OTP. Voir
// SPEC_signature_bulletins_adhesion.md et CGU v1.6.
//
// Retiré le 22/09/2026 au profit du lien de la banque, rétabli le 08/10/2026
// (Amir) : c'est le parcours des copropriétés sans lien de souscription.
// Nouveauté : le mandat SEPA n'est plus à imprimer - généré depuis le RIB
// (un par bulletin), il est signé avec le même code que le bulletin, par le
// seul signataire principal (titulaire du compte). Les cosignataires ne le
// voient pas : il porte l'IBAN complet.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { PdfLecteur } from "@/components/PdfLecteur";
import { useAuth } from "@/auth/AuthProvider";
import { fmtDate } from "@/lib/format";
import { messageErreur } from "@/lib/erreurs";
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
import { decouperAdressePostale, type SourceAdresse } from "@/lib/adressePostale";
import {
  ChampBic,
  ChampDate,
  ChampIban,
  ChampsNaissance,
  CpVilleFields,
  MessageSaisie,
} from "@/components/ChampsSaisie";
import { classerTelephone, dateLieuComplet, diagnosticBic, diagnosticIban } from "@/lib/saisie";
import { ACCEPT_PIECE, erreurFormatPiece, LIBELLE_FORMATS_PIECE, typeMimePiece } from "@/lib/formatPiece";
import { assemblerPieceIdentite, facesADeposer, verifierFacesPiece } from "@/lib/pdf/pieceIdentite";
import { PieceIdentiteChamps } from "@/components/PieceIdentiteChamps";
import { CGU_VERSION } from "@/lib/cguSignature";
import {
  lotsAnnexesNonRattaches,
  tantiemesAvecRattaches,
  urlSigneePiece,
  downloadFromPieces,
  useCoordonneesConnues,
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

/** Situations qui lient deux personnes : un co-emprunteur d'un adhérent marié ou pacsé l'est
 *  presque toujours avec lui, à la même date (feedback du 09/10/2026). */
const enCouple = (s: SituationMatrimoniale) => s === "mariee" || s === "pacsee";

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

/** Case d'acceptation des CGU - porte d'entrée du parcours, et reprise d'une
 *  préparation interrompue (le serveur refuse tout dépôt tant qu'elles ne sont
 *  pas enregistrées). */
function CaseCgu({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer", margin: "14px 0" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} />
      <span>
        J'ai lu et j'accepte les{" "}
        <a href="/cgu-signature" target="_blank" rel="noreferrer">Conditions Générales d'Utilisation</a>{" "}
        du service de signature électronique Strat Eco Pro (version {CGU_VERSION}), y compris la
        convention de preuve figurant à l'article 5.2.
      </span>
    </label>
  );
}

/** Attestation sur l'honneur et information sur l'avis d'imposition, cochées
 *  avant la création des bulletins (puis, si besoin, à la reprise). */
function CasesAttestations({
  attestHonneur,
  onAttestHonneur,
  infoAvis,
  onInfoAvis,
}: {
  attestHonneur: boolean;
  onAttestHonneur: (v: boolean) => void;
  infoAvis: boolean;
  onInfoAvis: (v: boolean) => void;
}) {
  return (
    <>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={attestHonneur} onChange={(e) => onAttestHonneur(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          Je certifie sur l'honneur que les coordonnées communiquées correspondent aux personnes
          déclarées et que je suis habilité(e) à les transmettre.
        </span>
      </label>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={infoAvis} onChange={(e) => onInfoAvis(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          J'ai été informé(e) que mon avis d'imposition sera transmis dans son intégralité à l'Anah
          et, le cas échéant, à l'établissement bancaire instruisant ma demande d'éco-prêt à taux
          zéro, aux fins de vérification de mes ressources, puis supprimé des systèmes de Strat Eco
          une fois ces transmissions effectuées.
        </span>
      </label>
    </>
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
      <ChampsNaissance requis valeur={a.dateLieuNaissance} onChange={(v) => set({ dateLieuNaissance: v })} />
      <Fld label="Profession">
        <input value={a.profession} onChange={(e) => set({ profession: e.target.value })} />
      </Fld>
      <Fld label="Profession exercée depuis le">
        <ChampDate valeur={a.professionDepuis} onChange={(v) => set({ professionDepuis: v })} min="1900-01-01" />
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
          <ChampDate valeur={a.situationDepuis} onChange={(v) => set({ situationDepuis: v })} min="1900-01-01" />
        </Fld>
      )}
    </>
  );
}

/** Mandat SEPA d'un dossier signé avant la signature électronique avancée
 *  (adhesions_pret.sepa_path) : il était imprimé et signé à la main. */
function MandatSepaAncienRow({ path, onApercu }: { path: string; onApercu: () => void }) {
  return (
    <div className="doc-row">
      <span className="d-ico" style={{ background: "var(--accent-soft)", color: "var(--color-primary-700)" }}>
        <Icon name="fileText" size={18} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="d-name">Mandat SEPA pré-rempli</div>
        <div className="d-sub">Signé à la main et remis à Strat Eco</div>
      </div>
      <span className="spacer"></span>
      <button className="icon-btn" title="Visualiser sans télécharger" onClick={onApercu}>
        <Icon name="eye" size={16} />
      </button>
      <button
        className="icon-btn"
        title="Télécharger le mandat SEPA"
        onClick={() => void downloadFromPieces(path, "mandat-sepa.pdf").catch(() => null)}
      >
        <Icon name="download" size={16} />
      </button>
    </div>
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

/** Document à lire en entier avant le code de signature. */
type Lecture = "bulletin" | "mandat";

export function Adhesion({
  membership,
  scenario,
  bareme,
  config,
  email,
  go,
  suiviSeul = false,
}: {
  membership: Membership;
  scenario: Scenario;
  bareme: Bareme;
  config: FinancementConfig | null;
  email: string;
  go?: (s: SectionId) => void;
  /** Campagne fermée ou souscription passée chez la banque : on n'affiche que
   *  les dossiers déjà engagés (signés ou en signature), sans en ouvrir de nouveau. */
  suiviSeul?: boolean;
}) {
  // Aperçu AMO du portail : lecture seule - le dossier se remplit et se signe
  // depuis le compte du copropriétaire, jamais à sa place.
  const { profile } = useAuth();
  const apercuAmo = profile?.role === "amo";
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
  // la situation de l'adhérent 2 suit celle de l'adhérent 1 (couple marié ou pacsé) tant
  // qu'on ne l'a pas modifiée à la main
  const [situation2Libre, setSituation2Libre] = useState(false);
  const [adresseProposee, setAdresseProposee] = useState<SourceAdresse | null>(null);
  // champ où le téléphone de l'enquête a été repris (portable, ou domicile s'il s'agit d'un fixe)
  const [telephoneRepris, setTelephoneRepris] = useState<"portable" | "domicile" | null>(null);
  const [coordonneesTraitees, setCoordonneesTraitees] = useState(false);
  const [erreurRib, setErreurRib] = useState<string | null>(null);

  const [typePiece, setTypePiece] = useState("cni");
  // recto et verso déposés dans deux champs distincts (feedback du 09/10/2026)
  const [recto, setRecto] = useState<File | null>(null);
  const [verso, setVerso] = useState<File | null>(null);
  const [attestPiece, setAttestPiece] = useState(false);

  const [ribFichier, setRibFichier] = useState<File | null>(null);
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  // Retour volontaire à l'étape RIB pour régénérer le mandat SEPA (feedback
  // du 03/09/2026) - possible tant que les bulletins sont en brouillon
  const [refaireRib, setRefaireRib] = useState(false);

  const [lecture, setLecture] = useState<{ quoi: Lecture; url: string } | null>(null);
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
    // un brouillon dont l'adhérent 2 a une autre situation que l'adhérent 1 : choix manuel à respecter
    if (
      f?.adherent1 &&
      f.adherent2 &&
      (f.adherent2.situation !== f.adherent1.situation || f.adherent2.situationDepuis !== f.adherent1.situationDepuis)
    ) {
      setSituation2Libre(true);
    }
  }, [adhesion]);

  // Coordonnées : l'adresse postale et le téléphone déjà connus (réponse à l'enquête, à défaut
  // import pour l'adresse) sont proposés une seule fois, jamais par-dessus ce que le
  // copropriétaire a saisi ou enregistré (idées du 09/10/2026).
  const { data: connues } = useCoordonneesConnues(copro.id, membership.coproprietaireId, membership.adresse);
  useEffect(() => {
    if (isLoading || coordonneesTraitees || connues === undefined) return;
    setCoordonneesTraitees(true);
    const f = adhesion?.form as Partial<AdhesionForm> | null;
    if (connues.adresse && !f?.adresse?.trim() && !f?.cp?.trim() && !f?.ville?.trim()) {
      const proposee = decouperAdressePostale(connues.adresse.texte);
      setForm((prev) => (prev.adresse.trim() || prev.cp.trim() || prev.ville.trim() ? prev : { ...prev, ...proposee }));
      setAdresseProposee(connues.adresse.source);
    }
    if (connues.telephone && !f?.portable?.trim() && !f?.telDomicile?.trim()) {
      const champ = classerTelephone(connues.telephone) === "fixe" ? "domicile" : "portable";
      setForm((prev) =>
        prev.portable.trim() || prev.telDomicile.trim()
          ? prev
          : { ...prev, ...(champ === "portable" ? { portable: connues.telephone! } : { telDomicile: connues.telephone! }) },
      );
      setTelephoneRepris(champ);
    }
  }, [isLoading, coordonneesTraitees, connues, adhesion]);

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

  const changerAdherent1 = (a: Adherent) =>
    setForm((prev) => {
      const adherent2 =
        prev.adherent2 && !situation2Libre && enCouple(a.situation)
          ? { ...prev.adherent2, situation: a.situation, situationDepuis: a.situationDepuis }
          : prev.adherent2;
      return { ...prev, adherent1: a, adherent2 };
    });

  const changerAdherent2 = (a: Adherent) => {
    const avant = form.adherent2;
    if (avant && (a.situation !== avant.situation || a.situationDepuis !== avant.situationDepuis)) {
      setSituation2Libre(true);
    }
    setForm({ ...form, adherent2: a });
  };

  const ajouterAdherent2 = () => {
    const a1 = form.adherent1;
    // marié ou pacsé : le co-emprunteur l'est aussi, à la même date
    const nouveau = enCouple(a1.situation)
      ? { ...emptyAdherent(), situation: a1.situation, situationDepuis: a1.situationDepuis }
      : emptyAdherent();
    setSituation2Libre(false);
    setForm({ ...form, adherent2: nouveau });
    // le co-emprunteur signe aussi : sa fiche de cosignataire est ouverte d'office
    if (cosignataires.length === 0) setCosignataires([emptyCosignataire()]);
  };

  const agir = async (fn: () => Promise<void>, label: string) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(messageErreur(e, "Une erreur est survenue. Réessayez."));
    } finally {
      setBusy(null);
    }
  };

  /** Ouvre un document du principal (URL signée 60 s) dans un nouvel onglet. */
  const ouvrir = (bulletinId: string, quoi: "signe" | "certificat" | "mandat_signe") =>
    void agir(async () => {
      const r = await appelSignature({ action: "principal_document_url", bulletin_id: bulletinId, quoi });
      if (typeof r.url === "string") window.open(r.url, "_blank");
    }, "dl");

  const brouillonAdhesion = () =>
    save.mutateAsync({
      scenarioId: scenario.id,
      form: form as unknown as Json,
      lieuSignature: form.lieuSignature,
    });

  // La préparation crée d'abord le bulletin en base, puis dépose son PDF et
  // enregistre les CGU et l'attestation du principal. Si la page est rechargée
  // ou la connexion coupée entre les deux, il reste un brouillon sans PDF ni
  // CGU : le serveur refusait alors tout dépôt (« acceptez d'abord les CGU »)
  // sans que l'écran propose de les accepter (feedback du 09/10/2026).
  const incomplet = (b: BulletinAvecSignataires) => {
    const p = principalDe(b);
    return !b.document_path || !p?.cgu_acceptees_le || !p?.attestation_honneur_le;
  };

  const abandonner = () => {
    if (!window.confirm("Abandonner ce dossier ? Les bulletins en préparation sont supprimés et vous repartez du formulaire.")) return;
    void agir(async () => {
      await supprimerBrouillons(membership.coproprietaireId);
      setLecture(null);
      setOtp(null);
      await refetchBulletins();
    }, "reset");
  };

  /** PDF du bulletin (non signé : les blocs de signature sont apposés au
   *  scellement), déposé côté serveur qui calcule l'empreinte de référence, puis
   *  CGU et attestation du principal enregistrées. */
  const finaliserBulletin = async (bulletinId: string, lotNum: string, tantiemes: number | null, date: Date) => {
    const bytes = await genBulletin(
      form,
      {
        adresseImmeuble: copro.adresse ?? copro.name,
        nomSyndic: copro.syndic_name ?? "",
        // L'interlocuteur du bulletin est le gestionnaire de la copropriété chez
        // le syndic (pas l'AMO) - feedback du 03/09/2026
        interlocuteur: copro.gestionnaire_nom?.trim() || copro.syndic_name || "",
        lotNum,
        tantiemes: String(tantiemes ?? ""),
      },
      date
    );
    const up = await appelSignature({ action: "principal_document_upload", bulletin_id: bulletinId });
    await uploadVersBucket("signature-docs", up.path as string, up.token as string,
      new Blob([bytes as BlobPart], { type: "application/pdf" }));
    await appelSignature({ action: "principal_document_confirmer", bulletin_id: bulletinId });
    await appelSignature({ action: "principal_cgu", bulletin_id: bulletinId });
    await appelSignature({ action: "principal_attestation_honneur", bulletin_id: bulletinId, info_avis: infoAvis });
  };

  /** Termine une préparation interrompue : bulletins restés incomplets, et lots
   *  d'habitation restés sans bulletin si l'arrêt a eu lieu entre deux lots. Les
   *  signataires (principal et cosignataires) sont repris du bulletin existant. */
  const reprendrePreparation = () =>
    agir(async () => {
      const date = new Date();
      const modele = actifs[0];
      const sPrincipal = principalDe(modele);
      try {
        const aFinir = brouillons.filter(incomplet).map((b) => {
          const lot = membership.lots.find((l) => l.id === b.lot_id);
          return {
            id: b.id,
            lotNum: lot?.num ?? b.lot_reference.match(/n°\s*(\S+)/)?.[1] ?? "",
            tantiemes: b.tantiemes ?? (lot ? tantiemesAvecRattaches(membership.lots, lot, cle) : null),
          };
        });
        for (const lot of lotsHab.filter((l) => !actifs.some((b) => b.lot_id === l.id))) {
          const tantiemes = tantiemesAvecRattaches(membership.lots, lot, cle);
          const id = await creerBulletin({
            coproId: copro.id,
            coproprietaireId: membership.coproprietaireId,
            adhesionId: modele.adhesion_id,
            lotId: lot.id,
            lotReference: `Lot n°${lot.num}${lot.batiment ? ` - ${libellesBatiments(copro.denomination_batiments).court} ${lot.batiment}` : ""}`,
            tantiemes,
            cguVersion: CGU_VERSION,
            principal: {
              nom: sPrincipal?.nom ?? "",
              prenom: sPrincipal?.prenom ?? "",
              email: sPrincipal?.email ?? "",
              telephone: sPrincipal?.telephone ?? "",
            },
            cosignataires: modele.signataires
              .filter((s) => s.role === "cosignataire")
              .map((s) => ({
                civilite: s.civilite ?? "",
                nom: s.nom,
                prenom: s.prenom,
                email: s.email,
                telephone: s.telephone,
                adresse_ligne1: s.adresse_ligne1 ?? "",
                code_postal: s.code_postal ?? "",
                ville: s.ville ?? "",
                date_naissance: s.date_naissance ?? "",
                lieu_naissance: s.lieu_naissance ?? "",
              })),
          });
          aFinir.push({ id, lotNum: lot.num, tantiemes });
        }
        for (const x of aFinir) await finaliserBulletin(x.id, x.lotNum, x.tantiemes, date);
      } finally {
        await refetchBulletins().catch(() => null);
      }
    }, "reprise");

  if (isLoading || chargeBulletins) {
    return suiviSeul ? null : <p className="se-small" style={{ color: "var(--fg-muted)" }}>Chargement du dossier…</p>;
  }

  // ---------- Suivi seul : rien d'engagé, rien à montrer ----------
  const engage = actifs.some((b) => b.statut !== "brouillon") || adhesion?.statut === "signee";
  if (suiviSeul && !engage) return null;

  // ---------- Aperçu AMO : pas de saisie à la place du copropriétaire ----------
  if (apercuAmo && !engage) {
    return (
      <div className="cc-next" style={{ marginTop: 18 }}>
        <Icon name="eye" size={15} className="ico" />
        <span>
          Aperçu AMO : le copropriétaire remplit ici son bulletin d'adhésion et son mandat SEPA, puis les signe
          électroniquement depuis son propre compte.
          {brouillons.length > 0 ? " Son dossier est en cours de préparation." : " Il n'a pas encore commencé."}
        </span>
      </div>
    );
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
            Vos documents d'adhésion (bulletin et mandat SEPA) ne peuvent pas être générés tant que{" "}
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
          <button className="se-btn se-btn-primary" onClick={() => go?.("plan-indiv")}>
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
              {/* Le mandat SEPA est scellé dès la signature du principal : il se
                  télécharge sans attendre les cosignataires. */}
              {!apercuAmo && (b.statut === "complet" || (!!b.mandat_path && !!principalDe(b)?.signe_le)) && (
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {b.statut === "complet" && (
                    <button className="se-btn se-btn-secondary btn-sm" disabled={!!busy} onClick={() => ouvrir(b.id, "signe")}>
                      <Icon name="download" size={14} />Bulletin signé
                    </button>
                  )}
                  {b.mandat_path && (
                    <button className="se-btn se-btn-secondary btn-sm" disabled={!!busy} onClick={() => ouvrir(b.id, "mandat_signe")}>
                      <Icon name="download" size={14} />Mandat SEPA signé
                    </button>
                  )}
                  {b.statut === "complet" && (
                    <button className="se-btn se-btn-secondary btn-sm" disabled={!!busy} onClick={() => ouvrir(b.id, "certificat")}>
                      <Icon name="fileCheck" size={14} />Certificat de preuve
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {!tousComplets && actifs.some((b) => b.statut === "en_signature") && (
            <p className="se-small" style={{ color: "var(--fg-muted)", margin: "4px 0 0" }}>
              Vous recevrez par e-mail les documents scellés et le certificat de preuve dès que tous les signataires
              auront signé.
            </p>
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
  // Pendant la préparation (bulletins créés, PDF pas encore déposé), on reste
  // sur le formulaire : un rafraîchissement des données ne doit pas faire
  // apparaître un écran intermédiaire.
  if (brouillons.length > 0 && busy !== "preparer") {
    // ---------- préparation interrompue : on la reprend avant toute autre étape ----------
    if (brouillons.some(incomplet)) {
      // le formulaire enregistré, lu tel quel (l'état local n'est resynchronisé
      // qu'après le premier rendu)
      const saisie = (adhesion?.form as Partial<AdhesionForm> | null) ?? form;
      const nbSignataires = brouillons[0].signataires.length;
      const adherent2Sans = !!saisie.adherent2 && nbSignataires < 2;
      const saisieRetrouvee = !!saisie.adherent1?.nomPrenom?.trim() && !!saisie.adherent1?.dateLieuNaissance?.trim();
      const peutReprendre = saisieRetrouvee && !adherent2Sans;
      return (
        <div className="card-xl fade" style={{ marginTop: 22 }}>
          <div className="cx-head">
            <Icon name="alert" size={20} style={{ color: "var(--color-warning-500)" }} />
            <h2 style={{ fontSize: 19 }}>Reprenez la préparation de votre dossier</h2>
          </div>
          <div className="cx-body">
            <p className="se-body" style={{ marginTop: 0 }}>
              La préparation de votre bulletin d'adhésion s'est interrompue avant la fin (page rechargée ou
              connexion coupée). {peutReprendre
                ? "Vos informations sont conservées : confirmez les cases ci-dessous pour la reprendre là où elle s'est arrêtée."
                : "Vous pouvez la recommencer depuis le formulaire."}
            </p>
            {adherent2Sans && (
              <div className="cc-next" style={{ marginBottom: 12 }}>
                <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
                <span>
                  Vous avez déclaré un adhérent 2 (co-emprunteur) sans cosignataire : il doit lui aussi signer le
                  bulletin et déposer sa pièce d'identité. Recommencez la préparation pour l'ajouter comme
                  cosignataire.
                </span>
              </div>
            )}
            {!saisieRetrouvee && (
              <div className="cc-next" style={{ marginBottom: 12 }}>
                <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
                <span>Les informations du formulaire n'ont pas été retrouvées : recommencez la préparation.</span>
              </div>
            )}
            {peutReprendre && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <CaseCgu checked={cguCochee} onChange={setCguCochee} />
                <CasesAttestations
                  attestHonneur={attestHonneur}
                  onAttestHonneur={setAttestHonneur}
                  infoAvis={infoAvis}
                  onInfoAvis={setInfoAvis}
                />
              </div>
            )}
            {error && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 12 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              {peutReprendre && (
                <button
                  className="se-btn se-btn-primary"
                  disabled={!cguCochee || !attestHonneur || !infoAvis || !!busy}
                  onClick={() => void reprendrePreparation()}
                >
                  {busy === "reprise" ? "Reprise en cours…" : "Reprendre la préparation"}
                  <Icon name="arrowRight" size={16} />
                </button>
              )}
              <button className="se-btn se-btn-ghost btn-sm" disabled={!!busy} onClick={abandonner}>
                <Icon name="trash" size={14} />
                Abandonner et reprendre la préparation à zéro
              </button>
            </div>
          </div>
        </div>
      );
    }

    const pieceOk = brouillons.every((b) => !!principalDe(b)?.piece_deposee_le);
    const ribOk = brouillons.every((b) => !!b.rib_path);
    // Mandat SEPA généré depuis l'IBAN saisi, qui n'est conservé que chiffré :
    // s'il manque (échec réseau après le dépôt du RIB), on repasse par le RIB.
    const mandatOk = brouillons.every((b) => !!b.mandat_path || !!principalDe(b)?.signe_le);

    // ---------- étape pièce d'identité ----------
    if (!pieceOk) {
      const { complet, erreur: erreurFichiers } = verifierFacesPiece(typePiece, recto, verso);
      // Les personnes déclarées sur le dossier : le principal (vous) et chaque
      // cosignataire. Chacune dépose sa propre pièce, recto et verso : le
      // principal la sienne ici, les autres depuis leur lien personnel.
      const personnes = [...brouillons[0].signataires].sort((x, y) => x.ordre - y.ordre);
      return (
        <div className="card-xl fade" style={{ marginTop: 22 }}>
          <div className="cx-head">
            <Icon name="user" size={20} style={{ color: "var(--accent)" }} />
            <h2 style={{ fontSize: 19 }}>Pièces d'identité</h2>
            <span style={{ flex: 1 }}></span>
            <Badge kind="neutral">{personnes.length} {personnes.length > 1 ? "personnes déclarées" : "personne déclarée"}</Badge>
          </div>
          <div className="cx-body">
            <p className="se-body" style={{ marginTop: 0 }}>
              {personnes.length > 1
                ? `Ce dossier compte ${personnes.length} signataires : chacun dépose sa propre pièce d'identité en cours de validité, en deux fichiers (recto et verso). Vous déposez la vôtre ci-dessous ; les autres la déposeront depuis le lien personnel qu'ils recevront par e-mail dès que vous aurez signé - vous ne pouvez pas le faire à leur place.`
                : "Déposez votre propre pièce d'identité en cours de validité, en deux fichiers : le recto et le verso (pour un passeport, la page d'identité suffit)."}
            </p>
            {personnes.length > 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "0 0 16px" }}>
                {personnes.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
                    <Icon
                      name={s.piece_deposee_le ? "checkCircle" : "clock"}
                      size={15}
                      style={{ color: s.piece_deposee_le ? "var(--color-success-500)" : "var(--fg-muted)", flex: "none" }}
                    />
                    <span>{s.prenom} {s.nom}{s.role === "principal" ? " (vous)" : ""}</span>
                    <span className="se-small" style={{ color: "var(--fg-muted)" }}>
                      {s.piece_deposee_le
                        ? "pièce déposée"
                        : s.role === "principal"
                          ? "recto + verso à déposer ci-dessous"
                          : "recto + verso à déposer depuis son lien"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <PieceIdentiteChamps
              type={typePiece}
              onType={setTypePiece}
              recto={recto}
              verso={verso}
              onRecto={setRecto}
              onVerso={setVerso}
            />
            {erreurFichiers && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{erreurFichiers}</p>}
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer", margin: "14px 0" }}>
              <input type="checkbox" checked={attestPiece} onChange={(e) => setAttestPiece(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Je certifie que la pièce d'identité que je téléverse est <b>la mienne</b> et qu'elle est en cours de validité.</span>
            </label>
            {error && <p className="se-small" style={{ color: "var(--color-error-700)" }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                className="se-btn se-btn-primary"
                disabled={!complet || !attestPiece || !!busy}
                onClick={() =>
                  void agir(async () => {
                    const piece = await assemblerPieceIdentite(facesADeposer(typePiece, recto, verso));
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
                {busy === "piece" ? "Dépôt en cours…" : "Déposer ma pièce d'identité"}
              </button>
              <button className="se-btn se-btn-ghost btn-sm" disabled={!!busy} onClick={abandonner}>
                <Icon name="trash" size={14} />
                Abandonner et reprendre la préparation à zéro
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ---------- étape RIB (ou retour volontaire pour régénérer le mandat) ----------
    if (!ribOk || !mandatOk || refaireRib) {
      const ibanOk = isValidIban(iban);
      const bicOk = isValidBic(bic);
      const majRib = (f: File | null) => {
        // le sélecteur « Tous les fichiers » laisse passer un Word : refusé dès le choix
        const erreurFormat = f ? erreurFormatPiece(f) : null;
        setErreurRib(erreurFormat);
        setRibFichier(f && !erreurFormat ? f : null);
        return !erreurFormat;
      };
      return (
        <div className="card-xl fade" style={{ marginTop: 22 }}>
          <div className="cx-head">
            <Icon name="euro" size={20} style={{ color: "var(--accent)" }} />
            <h2 style={{ fontSize: 19 }}>{refaireRib ? "Nouveau RIB et nouveau mandat SEPA" : "RIB du lot"}</h2>
            {refaireRib && (
              <>
                <span style={{ flex: 1 }}></span>
                <button className="se-btn se-btn-ghost btn-sm" disabled={!!busy} onClick={() => setRefaireRib(false)}>
                  <Icon name="chevronLeft" size={14} />
                  Garder le mandat actuel
                </button>
              </>
            )}
          </div>
          <div className="cx-body">
            {refaireRib && (
              <div className="cc-next" style={{ marginBottom: 14 }}>
                <Icon name="refresh" size={15} className="ico" />
                <span>
                  Déposez à nouveau le RIB et ressaisissez l'IBAN et le BIC : le RIB rattaché à vos bulletins
                  est remplacé et un nouveau mandat SEPA pré-rempli est généré, à relire avant de signer.
                </span>
              </div>
            )}
            {!refaireRib && ribOk && !mandatOk && (
              <div className="cc-next" style={{ marginBottom: 14 }}>
                <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
                <span>
                  Votre mandat SEPA n'a pas pu être préparé. Ressaisissez votre RIB, votre IBAN et votre BIC pour
                  le générer à nouveau.
                </span>
              </div>
            )}
            <p className="se-body" style={{ marginTop: 0 }}>
              Le RIB sert au prélèvement des échéances du prêt (un seul RIB par bulletin) : il remplit votre
              mandat de prélèvement SEPA, que vous signerez en ligne avec votre bulletin. L'IBAN est conservé
              chiffré ; seuls ses 4 derniers caractères restent affichables.
            </p>
            <div className="form-grid">
              <Fld label={`RIB (${LIBELLE_FORMATS_PIECE}) *`} span>
                <input
                  type="file"
                  accept={ACCEPT_PIECE}
                  onChange={(e) => {
                    if (!majRib(e.target.files?.[0] ?? null)) e.target.value = "";
                  }}
                />
                {erreurRib && <span className="hint" style={{ color: "var(--color-error-700)" }}>{erreurRib}</span>}
              </Fld>
              <Fld label="IBAN *">
                <ChampIban value={iban} onChange={setIban} />
                <span className="hint">Un IBAN français compte 27 caractères : les blocs de 4 sont séparés automatiquement.</span>
              </Fld>
              <Fld label="BIC *">
                <ChampBic value={bic} onChange={setBic} />
                <span className="hint">8 ou 11 caractères, par exemple CEPAFRPP513.</span>
              </Fld>
            </div>
            <MessageSaisie diagnostic={diagnosticIban(iban)} />
            <MessageSaisie diagnostic={diagnosticBic(bic)} />
            {error && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 8 }}>{error}</p>}
            <button
              className="se-btn se-btn-primary"
              style={{ marginTop: 14 }}
              disabled={!ribFichier || !ibanOk || !bicOk || !!busy}
              onClick={() =>
                void agir(async () => {
                  // concordance IBAN saisi / RIB déposé (information AMO)
                  const concordance = await checkRibConcordance(ribFichier!, typeMimePiece(ribFichier!), iban);
                  const typeRib = typeMimePiece(ribFichier!);
                  const ext = typeRib === "application/pdf" ? "pdf" : typeRib === "image/png" ? "png" : "jpg";
                  // mandat SEPA pré-rempli, déposé sur chaque bulletin : il sera lu puis
                  // signé avec le même code que le bulletin (0148)
                  const mandat = new Blob(
                    [
                      (await genMandatSepa({
                        nom: form.adherent1.nomPrenom || `${prenomPrincipal} ${nomPrincipal}`,
                        rue: form.adresse,
                        cp: form.cp,
                        ville: form.ville,
                        iban,
                        bic,
                        lieu: form.lieuSignature || copro.city || "",
                        date: new Date(),
                      })) as BlobPart,
                    ],
                    { type: "application/pdf" }
                  );
                  for (const b of brouillons) {
                    if (principalDe(b)?.signe_le) continue;
                    const up = await appelSignature({ action: "principal_rib_upload", bulletin_id: b.id, ext });
                    await uploadVersBucket("signature-pieces", up.path as string, up.token as string, ribFichier!);
                    await appelSignature({
                      action: "principal_rib_confirmer",
                      bulletin_id: b.id,
                      path: up.path,
                      iban: normalizeIban(iban),
                    });
                    const upM = await appelSignature({ action: "principal_mandat_upload", bulletin_id: b.id });
                    await uploadVersBucket("signature-docs", upM.path as string, upM.token as string, mandat);
                    await appelSignature({ action: "principal_mandat_confirmer", bulletin_id: b.id });
                  }
                  await save.mutateAsync({
                    scenarioId: scenario.id,
                    form: form as unknown as Json,
                    lieuSignature: form.lieuSignature,
                    ribConcordance: concordance,
                  });
                  setRefaireRib(false);
                  setRibFichier(null);
                  setLecture(null);
                  await refetchBulletins();
                }, "rib")
              }
            >
              <Icon name="upload" size={16} />
              {busy ? "Dépôt en cours…" : refaireRib ? "Remplacer le RIB et régénérer le mandat" : "Déposer le RIB et continuer"}
            </button>
          </div>
        </div>
      );
    }

    // ---------- étape lecture + OTP (bulletin par bulletin) ----------
    // Le premier bulletin que le principal n'a pas encore signé ; un même code
    // signe le bulletin et son mandat SEPA, lus en entier l'un et l'autre.
    const aSigner = brouillons.filter((b) => !principalDe(b)?.signe_le);
    const bulletinCourant = aSigner[0] ?? brouillons[0];
    const sPrincipal = principalDe(bulletinCourant);
    const documentLu = !!sPrincipal?.document_lu_le;
    const mandatLu = !!bulletinCourant.mandat_lu_le;
    const afficher = (quoi: Lecture) =>
      void agir(async () => {
        const r = await appelSignature({
          action: "principal_document_url",
          bulletin_id: bulletinCourant.id,
          quoi: quoi === "mandat" ? "mandat" : "document",
        });
        setLecture({ quoi, url: r.url as string });
      }, "doc");
    const etapeLecture = (quoi: Lecture, lu: boolean, titre: string, sousTitre: string) => (
      <div className={"adh-etape" + (lu ? " lu" : "")}>
        <Icon
          name={lu ? "checkCircle" : "fileText"}
          size={20}
          style={{ color: lu ? "var(--color-success-500)" : "var(--accent)", flex: "none" }}
        />
        <div className="ae-txt">
          <div className="ae-titre">{titre}</div>
          <div className="ae-sub">{lu ? "Lu en entier" : sousTitre}</div>
        </div>
        {lecture?.quoi !== quoi && (
          <button className="se-btn se-btn-secondary btn-sm" disabled={!!busy} onClick={() => afficher(quoi)}>
            <Icon name="eye" size={14} />
            {lu ? "Relire" : "Lire"}
          </button>
        )}
      </div>
    );
    return (
      <div className="card-xl fade" style={{ marginTop: 22 }}>
        <div className="cx-head">
          <Icon name="edit" size={20} style={{ color: "var(--accent)" }} />
          <h2 style={{ fontSize: 19 }}>Signature - {bulletinCourant.lot_reference}</h2>
          {aSigner.length > 1 && (
            <>
              <span style={{ flex: 1 }}></span>
              <Badge kind="neutral">{aSigner.length} bulletins à signer</Badge>
            </>
          )}
        </div>
        <div className="cx-body">
          <p className="se-body" style={{ marginTop: 0 }}>
            Lisez en entier votre bulletin d'adhésion puis votre mandat de prélèvement SEPA : un seul code à
            usage unique, qui vous sera transmis, les signe tous les deux.{" "}
            {bulletinCourant.signataires.length > 1
              ? "Votre signature déclenche l'envoi des liens de signature du bulletin à vos cosignataires ; le mandat SEPA, lui, n'est signé que par vous."
              : "Vous êtes l'unique signataire : les documents seront scellés dès votre signature."}
          </p>

          <div className="adh-etapes">
            {etapeLecture("bulletin", documentLu, "1. Bulletin d'adhésion", "À lire jusqu'à la dernière page")}
            {lecture?.quoi === "bulletin" && (
              <PdfLecteur
                key={"bulletin-" + bulletinCourant.id}
                url={lecture.url}
                onLectureComplete={() => {
                  void appelSignature({ action: "principal_document_lu", bulletin_id: bulletinCourant.id })
                    .then(() => refetchBulletins())
                    .catch(() => null);
                }}
              />
            )}
            {etapeLecture(
              "mandat",
              mandatLu,
              "2. Mandat de prélèvement SEPA",
              `Prélèvement des échéances sur le compte ····${bulletinCourant.iban_dernier4 ?? ""} - à lire en entier`
            )}
            {lecture?.quoi === "mandat" && (
              <PdfLecteur
                key={"mandat-" + bulletinCourant.id}
                url={lecture.url}
                onLectureComplete={() => {
                  void appelSignature({ action: "principal_document_lu", bulletin_id: bulletinCourant.id, quoi: "mandat" })
                    .then(() => refetchBulletins())
                    .catch(() => null);
                }}
              />
            )}
          </div>

          {!otp ? (
            <>
              {error && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 10 }}>{error}</p>}
              <button
                className="se-btn se-btn-primary"
                style={{ marginTop: 4 }}
                disabled={!documentLu || !mandatLu || !!busy}
                onClick={() =>
                  void agir(async () => {
                    const r = await appelSignature({ action: "principal_otp_demander", bulletin_id: bulletinCourant.id });
                    setOtp({ canal: r.canal as string, codeTest: r.code_test as string | undefined });
                  }, "otp")
                }
              >
                <Icon name="lock" size={16} />
                {busy === "otp" ? "Envoi du code…" : "Recevoir mon code de signature"}
              </button>
              {(!documentLu || !mandatLu) && (
                <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
                  Le code s'obtient une fois les deux documents lus jusqu'à la dernière page.
                </p>
              )}
            </>
          ) : (
            <div style={{ marginTop: 6, maxWidth: 400 }}>
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
              <p className="se-small" style={{ color: "var(--fg-muted)", margin: "8px 0 0" }}>
                En validant ce code, vous signez le bulletin d'adhésion et le mandat de prélèvement SEPA.
              </p>
              {error && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 8 }}>{error}</p>}
              <div className="adh-otp-boutons">
                <button
                  className="se-btn se-btn-primary"
                  disabled={code.length !== 6 || !!busy}
                  onClick={() =>
                    void agir(async () => {
                      await appelSignature({ action: "principal_otp_valider", bulletin_id: bulletinCourant.id, code });
                      setOtp(null);
                      setCode("");
                      setLecture(null);
                      await refetchBulletins();
                    }, "valider")
                  }
                >
                  <Icon name="checkCircle" size={17} />
                  {busy === "valider" ? "Vérification…" : "Signer le bulletin et le mandat"}
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

          <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
            <button
              className="se-btn se-btn-ghost btn-sm"
              title="Ressaisir le RIB : un nouveau mandat SEPA est généré, à relire avant de signer"
              disabled={!!busy}
              onClick={() => {
                setLecture(null);
                setOtp(null);
                setCode("");
                setRefaireRib(true);
              }}
            >
              <Icon name="refresh" size={14} />
              Erreur de RIB ? Régénérer le mandat
            </button>
            <button className="se-btn se-btn-ghost btn-sm" disabled={!!busy} onClick={abandonner}>
              <Icon name="trash" size={14} />
              Abandonner et reprendre la préparation à zéro
            </button>
          </div>
        </div>
        {apercu && <ApercuPdfGenere name={apercu.name} path={apercu.path} onClose={() => setApercu(null)} />}
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
              <MandatSepaAncienRow
                path={adhesion.sepa_path}
                onApercu={() => setApercu({ name: "Mandat SEPA pré-rempli", path: adhesion.sepa_path! })}
              />
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
            Ce parcours vous permet de remplir votre bulletin d'adhésion à l'éco-prêt à taux zéro et votre
            mandat de prélèvement SEPA, puis de les <b>signer électroniquement</b> (signature électronique
            avancée : pièce d'identité + code à usage unique). Rien à imprimer ni à envoyer par courrier. Si
            le lot a plusieurs propriétaires (indivision, couple, SCI), chacun signera le bulletin depuis son
            propre lien, reçu par e-mail.
          </p>
          <p className="se-body">
            L'acceptation des Conditions Générales d'Utilisation est un préalable : elles régissent le
            traitement de vos données (pièce d'identité, RIB) et la valeur juridique de la signature.
          </p>
          <CaseCgu checked={cguCochee} onChange={setCguCochee} />
        </div>
      </div>
    );
  }

  // ---------- formulaire + cosignataires ----------
  const champsOk =
    form.adherent1.nomPrenom.trim() &&
    dateLieuComplet(form.adherent1.dateLieuNaissance) &&
    form.adresse.trim() &&
    form.cp.trim() &&
    form.ville.trim() &&
    form.portable.trim() &&
    form.email.trim() &&
    form.lieuSignature.trim() &&
    (form.montantType === "100" || form.montantAutre.trim()) &&
    (!form.adherent2 || (form.adherent2.nomPrenom.trim() && dateLieuComplet(form.adherent2.dateLieuNaissance)));

  const principalOk =
    prenomPrincipal.trim() && nomPrincipal.trim() && emailValide(form.email) && telValide(form.portable);
  const cosignatairesOk = cosignataires.every(
    (c) => c.nom.trim() && c.prenom.trim() && emailValide(c.email) && telValide(c.telephone)
  );
  // garde-fou anti auto-signature : e-mails et téléphones tous distincts
  const emails = [form.email, ...cosignataires.map((c) => c.email)].map((e) => e.trim().toLowerCase()).filter(Boolean);
  const tels = [form.portable, ...cosignataires.map((c) => c.telephone)].map(normaliserTelephone).filter(Boolean);
  const doublons = new Set(emails).size !== emails.length || new Set(tels).size !== tels.length;

  // Titulaires du prêt et signataires vont de pair : un adhérent 2 (co-emprunteur)
  // signe le bulletin comme le principal et dépose sa propre pièce d'identité
  // (recto + verso), donc il est forcément cosignataire (feedback du 09/10/2026).
  const adherent2SansSignataire = !!form.adherent2 && cosignataires.length === 0;

  const saveBrouillon = () => void brouillonAdhesion().catch((e) => setError(messageErreur(e, "Enregistrement impossible.")));

  const preparerSignature = () =>
    agir(async () => {
      // le dossier d'adhésion doit exister avant les bulletins : c'est lui qui
      // passe « signé » quand tous ses bulletins sont scellés
      const adhesionId = await brouillonAdhesion();
      const date = new Date();
      try {
        for (const lot of lotsHab) {
          const tantiemes = tantiemesAvecRattaches(membership.lots, lot, cle);
          const bulletinId = await creerBulletin({
            coproId: copro.id,
            coproprietaireId: membership.coproprietaireId,
            adhesionId,
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
          await finaliserBulletin(bulletinId, lot.num, tantiemes, date);
        }
      } finally {
        // même en cas d'échec : un bulletin déjà créé doit apparaître (écran de
        // reprise) plutôt que d'être recréé en double au prochain essai
        await refetchBulletins().catch(() => null);
      }
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
          Ces informations remplissent automatiquement le bulletin d'adhésion {config?.banque ?? "CEGEE"} et le
          mandat de prélèvement SEPA. Un bulletin, avec son mandat, sera généré{" "}
          <b>{lotsHab.length > 1 ? `pour chacun de vos ${lotsHab.length} lots d'habitation` : "pour votre lot d'habitation"}</b>
          {membership.lots.some((l) => l.rattacheA) ? ", tantièmes des lots rattachés (garage, cave…) additionnés" : ""}.
        </p>

        <div className="form-grid">
          <AdherentFields a={form.adherent1} onChange={changerAdherent1} titre="Adhérent 1" />

          {form.adherent2 ? (
            <>
              <AdherentFields a={form.adherent2} onChange={changerAdherent2} titre="Adhérent 2 (co-emprunteur)" />
              {!situation2Libre && enCouple(form.adherent1.situation) && (
                <p className="se-small" style={{ gridColumn: "1 / -1", color: "var(--fg-muted)", margin: 0 }}>
                  Situation matrimoniale et date reprises de l'adhérent 1 (couple {form.adherent1.situation === "mariee" ? "marié" : "pacsé"}) :
                  modifiez-les si elles diffèrent.
                </p>
              )}
              <div style={{ gridColumn: "1 / -1" }}>
                <button className="se-btn se-btn-ghost btn-sm" onClick={() => setForm({ ...form, adherent2: null })}>
                  <Icon name="trash" size={14} />Retirer l'adhérent 2
                </button>
              </div>
            </>
          ) : (
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="se-btn se-btn-ghost btn-sm" onClick={ajouterAdherent2}>
                <Icon name="plus" size={14} />Ajouter un adhérent 2 (conjoint, indivisaire…)
              </button>
            </div>
          )}

          <div className="se-eyebrow" style={{ gridColumn: "1 / -1", marginTop: 6 }}>Coordonnées</div>
          <Fld label="Adresse personnelle *" span>
            <input value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
            {adresseProposee && (
              <span className="hint">
                Adresse proposée d'après {adresseProposee === "enquete" ? "votre réponse au questionnaire" : "les informations de votre copropriété"} :
                vérifiez-la et corrigez-la si besoin.
              </span>
            )}
          </Fld>
          <CpVilleFields requis cp={form.cp} ville={form.ville} onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))} />
          <Fld label="Téléphone portable *">
            <input type="tel" autoComplete="tel" value={form.portable} onChange={(e) => setForm({ ...form, portable: e.target.value })} />
            {telephoneRepris === "portable" && (
              <span className="hint">Numéro repris de votre réponse au questionnaire : vérifiez-le.</span>
            )}
          </Fld>
          <Fld label="Téléphone domicile">
            <input type="tel" value={form.telDomicile} onChange={(e) => setForm({ ...form, telDomicile: e.target.value })} />
            {telephoneRepris === "domicile" && (
              <span className="hint">
                Numéro fixe repris de votre réponse au questionnaire : indiquez aussi un téléphone portable (il reçoit votre code de signature).
              </span>
            )}
          </Fld>
          <Fld label="Téléphone bureau">
            <input type="tel" value={form.telBureau} onChange={(e) => setForm({ ...form, telBureau: e.target.value })} />
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
          <p className="se-small" style={{ gridColumn: "1 / -1", color: "var(--fg-muted)", margin: 0 }}>
            Signataires de ce dossier : <b>{1 + cosignataires.length}</b>{" "}
            {cosignataires.length === 0 ? "(vous seul)" : `(vous et ${cosignataires.length} cosignataire${cosignataires.length > 1 ? "s" : ""})`}
            . Chacun dépose sa propre pièce d'identité, <b>recto et verso</b>.
            {form.adherent2 && " L'adhérent 2 (co-emprunteur) fait partie des signataires : renseignez-le ci-dessous."}
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
                <Fld label="E-mail *">
                  <input type="email" autoFocus placeholder="prenom.nom@exemple.fr" value={c.email} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                </Fld>
                <Fld label="Téléphone mobile *">
                  <input type="tel" placeholder="06 12 34 56 78" value={c.telephone} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, telephone: e.target.value } : x)))} />
                </Fld>
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
                <Fld label="Date de naissance">
                  <input type="date" value={c.date_naissance} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, date_naissance: e.target.value } : x)))} />
                </Fld>
                <Fld label="Lieu de naissance">
                  <input value={c.lieu_naissance} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, lieu_naissance: e.target.value } : x)))} />
                </Fld>
                <Fld label="Adresse postale" span>
                  <input value={c.adresse_ligne1} onChange={(e) => setCosignataires(cosignataires.map((x, j) => (j === i ? { ...x, adresse_ligne1: e.target.value } : x)))} />
                </Fld>
                <CpVilleFields
                  cp={c.code_postal}
                  ville={c.ville}
                  onChange={(patch) =>
                    setCosignataires((prev) =>
                      prev.map((x, j) =>
                        j === i
                          ? { ...x, ...(patch.cp !== undefined ? { code_postal: patch.cp } : {}), ...(patch.ville !== undefined ? { ville: patch.ville } : {}) }
                          : x,
                      ),
                    )
                  }
                />
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
            <CasesAttestations
              attestHonneur={attestHonneur}
              onAttestHonneur={setAttestHonneur}
              infoAvis={infoAvis}
              onInfoAvis={setInfoAvis}
            />
          </div>
        </div>

        {error && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 12 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
          <button className="se-btn se-btn-ghost" onClick={saveBrouillon} disabled={save.isPending || !!busy}>
            {save.isPending ? "Enregistrement…" : "Enregistrer le brouillon"}
          </button>
          <button
            className="se-btn se-btn-primary"
            disabled={!champsOk || !principalOk || !cosignatairesOk || adherent2SansSignataire || doublons || !attestHonneur || !infoAvis || !!busy}
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
        {adherent2SansSignataire && (
          <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 10 }}>
            Vous avez déclaré un adhérent 2 (co-emprunteur) : il doit aussi signer le bulletin. Ajoutez-le comme
            cosignataire - il recevra son propre lien et déposera sa pièce d'identité, recto et verso.
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
