// Dossier d'adhésion au prêt collectif éco-PTZ (CEGEE) :
// formulaire → signature électronique → bulletins pré-remplis (1 par lot
// d'habitation) + mandat SEPA pré-rempli à signer de façon MANUSCRITE.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { SignaturePad } from "@/components/SignaturePad";
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
import {
  downloadFromPieces,
  downloadRibBlob,
  lotsAnnexesNonRattaches,
  tantiemesAvecRattaches,
  uploadPdfGenere,
  urlSigneePiece,
  useMesPieces,
  useMonAdhesion,
  useSaveAdhesion,
  type FinancementConfig,
  type Membership,
  type Scenario,
} from "@/api/portail";
import { readParams } from "@/api/scenarios";
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
  const { data: pieces } = useMesPieces(membership.coproprietaireId);
  const save = useSaveAdhesion(copro.id, membership.coproprietaireId);

  const [form, setForm] = useState<AdhesionForm>(() => emptyForm(membership.nom, email, copro.city ?? ""));
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [step, setStep] = useState<"form" | "signature">("form");
  const [sig1, setSig1] = useState<string | null>(null);
  const [sig2, setSig2] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apercu, setApercu] = useState<{ name: string; path: string } | null>(null);

  // reprise du brouillon existant
  useEffect(() => {
    if (!adhesion) return;
    const f = adhesion.form as Partial<AdhesionForm> | null;
    if (f?.adherent1) setForm((prev) => ({ ...prev, ...f } as AdhesionForm));
    if (adhesion.iban) setIban(adhesion.iban);
    if (adhesion.bic) setBic(adhesion.bic);
  }, [adhesion]);

  const cle = readParams(scenario.params, bareme).cle;
  const lotsHab = useMemo(() => {
    const hab = membership.lots.filter((l) => l.usage === "habitation");
    return hab.length ? hab : membership.lots;
  }, [membership.lots]);
  // Lots annexes (garage, cave…) sans lot d'habitation de rattachement : ils
  // bloquent la génération des documents tant qu'ils ne sont pas rattachés.
  const aLotHab = membership.lots.some((l) => l.usage === "habitation");
  const annexesLibres = useMemo(
    () => (aLotHab ? lotsAnnexesNonRattaches(membership.lots) : []),
    [membership.lots, aLotHab]
  );

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
  const ibanOk = isValidIban(iban);
  const bicOk = isValidBic(bic);

  if (isLoading) return <p className="se-small" style={{ color: "var(--fg-muted)" }}>Chargement du dossier…</p>;

  // ---------- Lots annexes non rattachés : génération bloquée ----------
  if (adhesion?.statut !== "signee" && annexesLibres.length > 0) {
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
                Lot n°{l.num} ({l.usage}){l.batiment ? " · Bât. " + l.batiment : ""} — non rattaché
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

  // ---------- Dossier signé : récapitulatif + téléchargements ----------
  if (adhesion?.statut === "signee") {
    const bulletins = (adhesion.bulletins as { lotNum: string; path: string }[] | null) ?? [];
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
            {bulletins.map((b) => (
              <div key={b.path} className="doc-row">
                <span className="d-ico"><Icon name="fileText" size={18} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="d-name">Bulletin d'adhésion — Lot n°{b.lotNum}</div>
                  <div className="d-sub">PDF pré-rempli et signé électroniquement</div>
                </div>
                <span className="spacer"></span>
                <button
                  className="icon-btn"
                  title="Visualiser sans télécharger"
                  onClick={() => setApercu({ name: `Bulletin d'adhésion — Lot n°${b.lotNum}`, path: b.path })}
                >
                  <Icon name="eye" size={16} />
                </button>
                <button className="se-btn se-btn-secondary btn-sm" onClick={() => void downloadFromPieces(b.path, `bulletin-lot-${b.lotNum}.pdf`)}>
                  <Icon name="download" size={15} />Télécharger
                </button>
              </div>
            ))}
          </div>

          <div className="se-eyebrow" style={{ margin: "18px 0 8px" }}>Mandat de prélèvement SEPA</div>
          {adhesion.sepa_path && (
            <div className="doc-row">
              <span className="d-ico" style={{ background: "var(--accent-soft)", color: "var(--color-primary-700)" }}>
                <Icon name="fileText" size={18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="d-name">Mandat SEPA pré-rempli</div>
                <div className="d-sub">À imprimer et signer à la main — aucune rature</div>
              </div>
              <span className="spacer"></span>
              <button
                className="icon-btn"
                title="Visualiser sans télécharger"
                onClick={() => setApercu({ name: "Mandat SEPA pré-rempli", path: adhesion.sepa_path! })}
              >
                <Icon name="eye" size={16} />
              </button>
              <button className="se-btn se-btn-secondary btn-sm" onClick={() => void downloadFromPieces(adhesion.sepa_path!, "mandat-sepa.pdf")}>
                <Icon name="download" size={15} />Télécharger
              </button>
            </div>
          )}
          <div className="proc-note" style={{ marginTop: 14 }}>
            <Icon name="send" size={18} />
            <div>
              <b>Dernière étape : le mandat SEPA doit être signé de façon manuscrite.</b>
              <span>
                Imprimez-le, signez-le sans rature, puis envoyez-le par courrier à Strat Eco ou remettez-le en main
                propre. Pensez aussi à téléverser vos pièces justificatives dans « Mes documents ».
              </span>
            </div>
          </div>
          {adhesion.rib_concordance === "discordant" && (
            <div className="cc-next" style={{ marginTop: 12 }}>
              <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
              <span>
                L'IBAN saisi ne correspond pas à celui détecté sur votre RIB téléversé — vérifiez l'un ou l'autre.
              </span>
            </div>
          )}
          <button
            className="se-btn se-btn-ghost btn-sm"
            style={{ marginTop: 14 }}
            onClick={() => void save.mutateAsync({ scenarioId: scenario.id, form: form as unknown as Json, iban, bic, lieuSignature: form.lieuSignature, statut: "brouillon", signedAt: null })}
          >
            Modifier mon dossier (annule la signature)
          </button>
        </div>
        {apercu && <ApercuPdfGenere name={apercu.name} path={apercu.path} onClose={() => setApercu(null)} />}
      </div>
    );
  }

  // ---------- Signature ----------
  const signer = async () => {
    if (!sig1) return;
    setBusy("Génération des documents…");
    setError(null);
    try {
      const date = new Date();
      const ctxBase = {
        adresseImmeuble: copro.adresse ?? copro.name,
        nomSyndic: copro.syndic_name ?? "",
        interlocuteur: "Strat Eco (AMO)",
      };
      const bulletins: { lotNum: string; path: string }[] = [];
      for (const lot of lotsHab) {
        // seul le lot d'habitation apparaît ; ses lots annexes rattachés
        // (garage, cave…) comptent dans les tantièmes additionnés
        const bytes = await genBulletin(
          form,
          { ...ctxBase, lotNum: lot.num, tantiemes: String(tantiemesAvecRattaches(membership.lots, lot, cle)) },
          date,
          sig1,
          form.adherent2 ? sig2 : null
        );
        const path = await uploadPdfGenere(`bulletin-lot-${lot.num}.pdf`, bytes);
        bulletins.push({ lotNum: lot.num, path });
      }

      setBusy("Préparation du mandat SEPA…");
      const sepaBytes = await genMandatSepa({
        nom: form.adherent1.nomPrenom,
        rue: form.adresse,
        cp: form.cp,
        ville: form.ville,
        iban,
        bic,
        lieu: form.lieuSignature,
        date,
      });
      const sepaPath = await uploadPdfGenere("mandat-sepa.pdf", sepaBytes);

      setBusy("Vérification du RIB…");
      let concordance: string = "non_verifie";
      const ribPiece = (pieces ?? []).find((x) => x.type === "rib");
      if (ribPiece) {
        const blob = await downloadRibBlob(ribPiece.storage_path);
        if (blob) concordance = await checkRibConcordance(blob, ribPiece.mime, iban);
      }

      await save.mutateAsync({
        scenarioId: scenario.id,
        form: form as unknown as Json,
        iban: normalizeIban(iban),
        bic: bic.replace(/\s/g, "").toUpperCase(),
        lieuSignature: form.lieuSignature,
        statut: "signee",
        signedAt: date.toISOString(),
        bulletins: bulletins as unknown as Json,
        sepaPath,
        ribConcordance: concordance,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "La génération a échoué. Réessayez.");
    } finally {
      setBusy(null);
    }
  };

  if (step === "signature") {
    return (
      <div className="card-xl fade" style={{ marginTop: 22 }}>
        <div className="cx-head">
          <Icon name="edit" size={20} style={{ color: "var(--accent)" }} />
          <h2 style={{ fontSize: 19 }}>Signature du bulletin d'adhésion</h2>
        </div>
        <div className="cx-body">
          <p className="se-body" style={{ marginTop: 0 }}>
            Votre signature sera apposée sur {lotsHab.length > 1 ? `les ${lotsHab.length} bulletins (un par lot)` : "le bulletin"},
            avec horodatage. Le mandat SEPA, lui, devra être signé <b>à la main</b> après téléchargement.
          </p>
          <div className="se-eyebrow" style={{ marginBottom: 6 }}>Signature — {form.adherent1.nomPrenom || "Adhérent 1"} *</div>
          <SignaturePad onChange={setSig1} defaultName={form.adherent1.nomPrenom} />
          {form.adherent2 && (
            <>
              <div className="se-eyebrow" style={{ margin: "16px 0 6px" }}>Signature — {form.adherent2.nomPrenom || "Adhérent 2"} *</div>
              <SignaturePad onChange={setSig2} defaultName={form.adherent2.nomPrenom} />
            </>
          )}
          <div className="cc-next" style={{ marginTop: 16 }}>
            <Icon name="checkCircle" size={15} className="ico" />
            <span>
              En signant, vous certifiez l'exactitude des informations saisies et acceptez les conditions figurant
              sur le bulletin d'adhésion de la {config.banque === "CEGEE" ? "Caisse d'Epargne Grand Est Europe" : config.banque}.
            </span>
          </div>
          {error && <p className="se-small" style={{ color: "var(--color-error-700)", marginTop: 10 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button className="se-btn se-btn-ghost" onClick={() => setStep("form")} disabled={!!busy}>
              <Icon name="chevronLeft" size={16} />Retour
            </button>
            <button
              className="se-btn se-btn-primary"
              disabled={!sig1 || (!!form.adherent2 && !sig2) || !!busy}
              onClick={() => void signer()}
            >
              <Icon name="checkCircle" size={17} />
              {busy ?? "Signer et générer mes documents"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Formulaire ----------
  const saveBrouillon = () =>
    save.mutate({
      scenarioId: scenario.id,
      form: form as unknown as Json,
      iban,
      bic,
      lieuSignature: form.lieuSignature,
    });

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

          <div className="se-eyebrow" style={{ gridColumn: "1 / -1", marginTop: 6 }}>Compte à débiter (mandat SEPA)</div>
          <Fld label="IBAN *">
            <input placeholder="FR76 …" value={iban} onChange={(e) => setIban(e.target.value)} />
          </Fld>
          <Fld label="BIC *">
            <input placeholder="CEPAFRPP…" value={bic} onChange={(e) => setBic(e.target.value)} />
          </Fld>
          {iban && !ibanOk && (
            <p className="se-small" style={{ gridColumn: "1 / -1", color: "var(--color-error-700)", margin: 0 }}>
              IBAN invalide — vérifiez la saisie (clé de contrôle incorrecte).
            </p>
          )}
          {bic && !bicOk && (
            <p className="se-small" style={{ gridColumn: "1 / -1", color: "var(--color-error-700)", margin: 0 }}>
              BIC invalide — 8 ou 11 caractères (ex. CEPAFRPP513).
            </p>
          )}

          <Fld label="Fait à (lieu de signature) *">
            <input value={form.lieuSignature} onChange={(e) => setForm({ ...form, lieuSignature: e.target.value })} />
          </Fld>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
          <button className="se-btn se-btn-ghost" onClick={saveBrouillon} disabled={save.isPending}>
            {save.isPending ? "Enregistrement…" : "Enregistrer le brouillon"}
          </button>
          <button
            className="se-btn se-btn-primary"
            disabled={!champsOk || !ibanOk || !bicOk}
            onClick={() => {
              saveBrouillon();
              setStep("signature");
            }}
          >
            Passer à la signature
            <Icon name="arrowRight" size={16} />
          </button>
        </div>
        {!champsOk && (
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 10 }}>
            Renseignez tous les champs marqués * — la banque rejette les dossiers incomplets.
          </p>
        )}
      </div>
    </div>
  );
}
