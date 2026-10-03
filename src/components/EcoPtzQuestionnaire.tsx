// Questionnaire éco-PTZ (02/10/2026, demande d'Amir) : au dépôt ou redépôt de
// l'audit réglementaire, d'un devis ou d'un CCTP / DPGF - par l'AMO, le syndic
// ou le maître d'œuvre - le logiciel demande les données du CERFA Annexe 3.1.
// Audit : référence, date, scénario, classes et consommations, gain, auditeur
// (raison sociale, SIRET, interlocuteur, e-mail). Devis / DPGF : entreprise de
// chaque lot du PF concerné. Les entreprises rejoignent la base prestataires ;
// Strat Eco vérifie et valide avant tout envoi en signature.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import {
  manquantsAudit,
  useContextePfEcoPtz,
  useDossierEcoPtz,
  useSaisirAuditEcoPtz,
  useSaisirPostesEcoPtz,
  type AuditEcoPtz,
  type PosteEcoPtzSaisi,
} from "@/api/ecoPtzIndividuel";
import { extraireTextePdf, proposerAudit, proposerDevis } from "@/lib/pdf/extraitDonnees";
import { messageErreur } from "@/lib/erreurs";

const CLASSES = ["A", "B", "C", "D", "E", "F", "G"];

interface Props {
  coproId: string;
  mode: "audit" | "travaux";
  /** Fichier déposé : son texte pré-remplit les champs (PDF texte seulement). */
  fichier?: File | null;
  /** Émetteur saisi au dépôt (raison sociale proposée). */
  emetteur?: string;
  /** AMO : bouton « Enregistrer et valider ». */
  peutValider?: boolean;
  /** Depuis le dossier AMO : tous les lots sont ouverts à la saisie. */
  toutCocher?: boolean;
  onClose: () => void;
}

export function QuestionnaireEcoPtzDialog(props: Props) {
  return props.mode === "audit" ? <QuestionnaireAudit {...props} /> : <QuestionnaireTravaux {...props} />;
}

function Champ({
  label,
  value,
  onChange,
  placeholder,
  propose,
  type = "text",
  facultatif,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  propose?: boolean;
  type?: string;
  facultatif?: boolean;
}) {
  return (
    <div className="cs-field">
      <label>
        {label}
        {facultatif && <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}> · facultatif</span>}
        {propose && (
          <span style={{ color: "var(--color-warning-700)", fontWeight: 500 }} title="Lu dans le PDF déposé : à vérifier">
            {" "}
            · lu dans le PDF
          </span>
        )}
      </label>
      <input
        className="edit-inp"
        style={{ maxWidth: "none", width: "100%" }}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Intro({ fichier }: { fichier?: File | null }) {
  return (
    <p className="se-small" style={{ margin: "0 0 14px", color: "var(--fg-muted)" }}>
      Ces informations remplissent le CERFA éco-PTZ (Annexe 3.1) et l'attestation des copropriétaires qui financent leur
      quote-part par un éco-PTZ individuel. Strat Eco les vérifie avant l'envoi en signature.
      {fichier && (
        <>
          {" "}
          Document déposé : <b>{fichier.name}</b>.
        </>
      )}
    </p>
  );
}

function useTextePdf(fichier?: File | null) {
  const [texte, setTexte] = useState<string | null>(null);
  useEffect(() => {
    let actif = true;
    if (!fichier || !/pdf$/i.test(fichier.type || fichier.name)) {
      setTexte("");
      return;
    }
    void extraireTextePdf(fichier).then((t) => actif && setTexte(t));
    return () => {
      actif = false;
    };
  }, [fichier]);
  return texte;
}

const nombreFr = (n: number | undefined) =>
  n == null || !Number.isFinite(n) || n === 0 ? "" : String(Math.round(n * 10) / 10).replace(".", ",");

// ---------- Audit ----------

function QuestionnaireAudit({ coproId, fichier, peutValider, onClose }: Props) {
  const { data: dossier, isLoading } = useDossierEcoPtz(coproId);
  const { data: contexte } = useContextePfEcoPtz(coproId);
  const texte = useTextePdf(fichier);
  const saisir = useSaisirAuditEcoPtz(coproId);
  const [a, setA] = useState<AuditEcoPtz | null>(null);
  const [proposes, setProposes] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);

  // valeurs déjà saisies, puis PDF et PF pour les champs vides
  useEffect(() => {
    if (isLoading || !contexte || texte === null || a) return;
    const base: AuditEcoPtz = { ...(dossier?.audit ?? {}) };
    const lus = new Set<string>();
    const prop = proposerAudit(texte);
    for (const [k, v] of Object.entries(prop)) {
      const cle = k as keyof AuditEcoPtz;
      if (v && !String(base[cle] ?? "").trim()) {
        (base as Record<string, unknown>)[cle] = v;
        lus.add(cle);
      }
    }
    const inf = contexte.infos;
    if (!base.conso_avant && inf.cepInitial) base.conso_avant = nombreFr(inf.cepInitial);
    if (!base.conso_apres && inf.cepProjet) base.conso_apres = nombreFr(inf.cepProjet);
    if (!base.classe_avant && inf.etiquetteInitiale) base.classe_avant = inf.etiquetteInitiale.trim().toUpperCase().slice(0, 1);
    if (!base.classe_apres && inf.etiquetteProjet) base.classe_apres = inf.etiquetteProjet.trim().toUpperCase().slice(0, 1);
    if (!base.gain_pct && inf.cepInitial && inf.cepProjet)
      base.gain_pct = nombreFr(100 - (100 * inf.cepProjet) / inf.cepInitial);
    if (fichier) base.fichier = fichier.name;
    setA(base);
    setProposes(lus);
  }, [isLoading, contexte, texte, dossier, fichier, a]);

  const manque = useMemo(() => manquantsAudit(a ?? {}), [a]);

  if (!a)
    return (
      <Modal title="Données de l'audit pour le CERFA éco-PTZ" onClose={onClose} width={720} closeOnBackdrop={false}>
        <p className="se-small" style={{ color: "var(--fg-muted)" }}>Lecture du document…</p>
      </Modal>
    );

  const set = (k: keyof AuditEcoPtz) => (v: string) => {
    setA((x) => ({ ...(x ?? {}), [k]: v }));
    setProposes((p) => {
      const n = new Set(p);
      n.delete(k);
      return n;
    });
  };
  const enregistrer = async (valider: boolean) => {
    setErreur(null);
    try {
      await saisir.mutateAsync({ audit: a, valider });
      onClose();
    } catch (e) {
      setErreur(messageErreur(e, "Enregistrement impossible."));
    }
  };

  return (
    <Modal title="Données de l'audit pour le CERFA éco-PTZ" onClose={onClose} width={720} closeOnBackdrop={false}>
      <Intro fichier={fichier} />
      <div className="renommage-grille">
        <Champ label="Référence de l'audit" value={a.reference ?? ""} onChange={set("reference")} placeholder="A25670370399R" propose={proposes.has("reference")} />
        <Champ label="Date de réalisation" value={a.date ?? ""} onChange={set("date")} placeholder="JJ/MM/AAAA" propose={proposes.has("date")} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Champ
          label="Scénario de travaux retenu pour l'éco-PTZ"
          value={a.scenario ?? ""}
          onChange={set("scenario")}
          placeholder="Scénario 1 - rénovation en une fois"
        />
      </div>
      <div className="renommage-grille" style={{ marginTop: 12 }}>
        <div className="cs-field">
          <label>Classe avant travaux</label>
          <select className="edit-inp" style={{ maxWidth: "none", width: "100%" }} value={a.classe_avant ?? ""} onChange={(e) => set("classe_avant")(e.target.value)}>
            <option value="">-</option>
            {CLASSES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <Champ label="Consommation avant (kWh/m²/an d'énergie primaire)" value={a.conso_avant ?? ""} onChange={set("conso_avant")} placeholder="243" />
        <div className="cs-field">
          <label>Classe après travaux</label>
          <select className="edit-inp" style={{ maxWidth: "none", width: "100%" }} value={a.classe_apres ?? ""} onChange={(e) => set("classe_apres")(e.target.value)}>
            <option value="">-</option>
            {CLASSES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <Champ label="Consommation après (kWh/m²/an d'énergie primaire)" value={a.conso_apres ?? ""} onChange={set("conso_apres")} placeholder="96" />
        <Champ label="Gain énergétique (%)" value={a.gain_pct ?? ""} onChange={set("gain_pct")} placeholder="60" propose={proposes.has("gain_pct")} />
        <Champ label="Coût de l'audit (€ TTC)" value={a.cout_ttc ?? ""} onChange={set("cout_ttc")} placeholder="1 650" facultatif />
      </div>

      <h4 style={{ margin: "18px 0 8px", fontSize: 14.5 }}>Auditeur (signe la synthèse de l'audit sur le CERFA)</h4>
      <div className="renommage-grille">
        <Champ label="Nom de l'entreprise" value={a.raison_sociale ?? ""} onChange={set("raison_sociale")} placeholder="INGEDAIR" />
        <Champ label="SIRET" value={a.siret ?? ""} onChange={set("siret")} placeholder="791 603 384 00045" propose={proposes.has("siret")} />
        <Champ label="Interlocuteur (nom du contact)" value={a.contact_nom ?? ""} onChange={set("contact_nom")} placeholder="Camille STADELMANN" />
        <Champ
          label="E-mail du contact"
          type="email"
          value={a.contact_email ?? ""}
          onChange={set("contact_email")}
          placeholder="contact@auditeur.fr"
          propose={proposes.has("contact_email")}
        />
        <Champ label="Téléphone" value={a.contact_telephone ?? ""} onChange={set("contact_telephone")} facultatif />
        <Champ label="Ville (« Fait à »)" value={a.ville ?? ""} onChange={set("ville")} placeholder="Entzheim" facultatif />
      </div>
      {manque.length > 0 && (
        <p className="se-small" style={{ marginTop: 12, marginBottom: 0, color: "var(--color-warning-700)" }}>
          <Icon name="alert" size={13} /> Encore à compléter : {manque.join(", ")}. Vous pouvez enregistrer et compléter plus tard.
        </p>
      )}
      {erreur && (
        <p className="se-small" style={{ marginTop: 10, color: "var(--color-error-700)" }}>
          {erreur}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <button className="se-btn se-btn-primary" disabled={saisir.isPending} onClick={() => void enregistrer(false)}>
          <Icon name="check" size={15} />
          {saisir.isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {peutValider && (
          <button
            className="se-btn se-btn-secondary"
            disabled={saisir.isPending || manque.length > 0}
            title={manque.length ? "Complétez d'abord tous les champs" : undefined}
            onClick={() => void enregistrer(true)}
          >
            Enregistrer et valider
          </button>
        )}
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-ghost" disabled={saisir.isPending} onClick={onClose}>
          Plus tard
        </button>
      </div>
    </Modal>
  );
}

// ---------- Devis / CCTP / DPGF ----------

interface Ligne extends PosteEcoPtzSaisi {
  coche: boolean;
}

function QuestionnaireTravaux({ coproId, fichier, emetteur, peutValider, toutCocher, onClose }: Props) {
  const { data: dossier, isLoading } = useDossierEcoPtz(coproId);
  const { data: contexte } = useContextePfEcoPtz(coproId);
  const texte = useTextePdf(fichier);
  const saisir = useSaisirPostesEcoPtz(coproId);
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !contexte || texte === null || lignes) return;
    const lots = contexte.lots.filter((l) => l.eligible);
    const prop = proposerDevis(texte, lots);
    const emet = (emetteur ?? "").trim().toLowerCase();
    const parEmetteur = emet ? lots.filter((l) => (l.entreprise ?? "").trim().toLowerCase() === emet).map((l) => l.numero) : [];
    const coches = new Set([...prop.lots, ...parEmetteur]);
    if (lots.length === 1) coches.add(lots[0].numero);
    setLignes(
      lots.map((l) => {
        const deja = dossier?.postes[String(l.numero)];
        const coche = !!toutCocher || coches.has(l.numero);
        return {
          lot_numero: l.numero,
          titre: l.titre,
          designation: deja?.designation ?? "",
          raison_sociale: deja?.raison_sociale ?? (coche && emetteur ? emetteur : l.entreprise ?? ""),
          siret: deja?.siret || (coche ? prop.siret ?? "" : ""),
          contact_nom: deja?.contact_nom ?? "",
          contact_email: deja?.contact_email || (coche ? prop.contact_email ?? "" : ""),
          contact_telephone: deja?.contact_telephone ?? "",
          fichier: coche && fichier ? fichier.name : deja?.fichier,
          coche,
        };
      })
    );
  }, [isLoading, contexte, texte, dossier, fichier, emetteur, toutCocher, lignes]);

  if (!lignes)
    return (
      <Modal title="Entreprises des travaux pour le CERFA éco-PTZ" onClose={onClose} width={820} closeOnBackdrop={false}>
        <p className="se-small" style={{ color: "var(--fg-muted)" }}>Lecture du document…</p>
      </Modal>
    );

  const maj = (i: number, patch: Partial<Ligne>) => setLignes((ls) => (ls ?? []).map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const cochees = lignes.filter((l) => l.coche);
  const incompletes = cochees.filter((l) => !l.raison_sociale.trim());
  const enregistrer = async (valider: boolean) => {
    setErreur(null);
    try {
      await saisir.mutateAsync({
        postes: cochees.map(({ coche: _c, ...p }) => ({ ...p, fichier: fichier?.name ?? p.fichier })),
        valider,
      });
      onClose();
    } catch (e) {
      setErreur(messageErreur(e, "Enregistrement impossible."));
    }
  };

  return (
    <Modal title="Entreprises des travaux pour le CERFA éco-PTZ" onClose={onClose} width={820} closeOnBackdrop={false}>
      <Intro fichier={fichier} />
      {lignes.length === 0 ? (
        <div className="cc-next" style={{ marginBottom: 6 }}>
          <Icon name="alert" size={15} className="ico" />
          <span>
            Aucun lot de travaux retenu dans un PF définitif validé pour l'instant : les entreprises se renseigneront
            lot par lot dès que Strat Eco aura validé le plan de financement.
          </span>
        </div>
      ) : (
        <>
          <p className="se-small" style={{ margin: "0 0 10px" }}>
            Cochez les lots couverts par ce document et indiquez l'entreprise RGE qui les réalise, avec la personne qui
            signera le CERFA.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "52vh", overflowY: "auto" }}>
            {lignes.map((l, i) => (
              <div key={String(l.lot_numero)} className="panel" style={{ padding: "10px 12px", opacity: l.coche ? 1 : 0.75 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600, cursor: "pointer" }}>
                  <input type="checkbox" checked={l.coche} onChange={(e) => maj(i, { coche: e.target.checked })} />
                  Lot {l.lot_numero} - {l.titre}
                </label>
                {l.coche && (
                  <div className="renommage-grille" style={{ marginTop: 10 }}>
                    <Champ label="Entreprise" value={l.raison_sociale} onChange={(v) => maj(i, { raison_sociale: v })} placeholder="Raison sociale" />
                    <Champ label="SIRET" value={l.siret ?? ""} onChange={(v) => maj(i, { siret: v })} placeholder="14 chiffres" />
                    <Champ label="Interlocuteur (nom du contact)" value={l.contact_nom ?? ""} onChange={(v) => maj(i, { contact_nom: v })} />
                    <Champ label="E-mail du contact" type="email" value={l.contact_email ?? ""} onChange={(v) => maj(i, { contact_email: v })} />
                    <Champ label="Téléphone" value={l.contact_telephone ?? ""} onChange={(v) => maj(i, { contact_telephone: v })} facultatif />
                    <Champ
                      label="Intitulé du poste sur le CERFA"
                      value={l.designation ?? ""}
                      onChange={(v) => maj(i, { designation: v })}
                      placeholder={l.titre}
                      facultatif
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {incompletes.length > 0 && (
        <p className="se-small" style={{ marginTop: 10, marginBottom: 0, color: "var(--color-warning-700)" }}>
          <Icon name="alert" size={13} /> Indiquez l'entreprise des lots cochés ({incompletes.map((l) => l.lot_numero).join(", ")}).
        </p>
      )}
      {erreur && (
        <p className="se-small" style={{ marginTop: 10, color: "var(--color-error-700)" }}>
          {erreur}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <button
          className="se-btn se-btn-primary"
          disabled={saisir.isPending || cochees.length === 0 || incompletes.length > 0}
          onClick={() => void enregistrer(false)}
        >
          <Icon name="check" size={15} />
          {saisir.isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {peutValider && (
          <button
            className="se-btn se-btn-secondary"
            disabled={saisir.isPending || cochees.length === 0 || incompletes.length > 0}
            onClick={() => void enregistrer(true)}
          >
            Enregistrer et valider
          </button>
        )}
        <span style={{ flex: 1 }}></span>
        <button className="se-btn se-btn-ghost" disabled={saisir.isPending} onClick={onClose}>
          Plus tard
        </button>
      </div>
    </Modal>
  );
}
