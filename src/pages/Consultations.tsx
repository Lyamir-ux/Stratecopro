// Consulter un intervenant - plateforme de consultation des prestations
// intellectuelles. La consultation vise une copro de la plateforme OU une
// copro externe (études pas encore démarrées). À la publication, les
// prestataires référencés du métier sont alertés par e-mail ; ils déposent
// leur offre depuis leur espace (les candidatures hors plateforme restent
// saisissables à la main).
import { useRef, useState, type CSSProperties } from "react";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { RenommageDialog } from "@/components/RenommageDialog";
import { fmtEuro, fmtDate } from "@/lib/format";
import { useCopros } from "@/api/copros";
import {
  CONSULT_OPTIONS,
  CONSULT_TYPES,
  DIAG_SOUS_TYPES,
  consultationCible,
  optionLabel,
  sousTypeLabel,
  ouvrirDocConsultation,
  ouvrirOffre,
  useAddCandidature,
  useCloseConsultation,
  useConsultations,
  usePublishConsultation,
  useRelancerAlertes,
  useReopenConsultation,
  useRepondreQuestion,
  type Consultation,
  type PublishResult,
} from "@/api/consultations";
import { CandidatureActions } from "@/components/CandidatureActions";

function joursRestants(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

function TypeTag({ type }: { type: Consultation["type"] }) {
  const t = CONSULT_TYPES.find((x) => x.id === type) ?? CONSULT_TYPES[4];
  return (
    <span className="cs-type">
      <Icon name={t.icon} size={13} />
      {t.label}
    </span>
  );
}

const NOTIF_LABELS: Record<string, { label: string; kind: "success" | "neutral" | "warn" }> = {
  envoye: { label: "Envoyé", kind: "success" },
  simule: { label: "Simulé", kind: "neutral" },
  erreur: { label: "Erreur", kind: "warn" },
};

/** Onglet « État de la consultation » : destinataires de l'alerte, dossiers
 *  récupérés (formulaire ouvert ou pièce téléchargée), réponses avec offres. */
function EtatConsultation({ cs }: { cs: Consultation }) {
  const titre = (num: string, texte: string, n: number) => (
    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12.5, color: "var(--fg2)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "12px 0 6px" }}>
      {num} · {texte} <span style={{ color: "var(--fg-muted)" }}>({n})</span>
    </div>
  );
  const ligne: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "5px 0", fontSize: 13 };

  return (
    <div className="cs-cand-list">
      {titre("1", "Consultation envoyée à", cs.notifications.length)}
      {cs.notifications.length === 0 && (
        <div className="cs-cand-empty">Aucun prestataire référencé alerté (base prestataires vide pour ce métier).</div>
      )}
      {cs.notifications.map((n) => {
        const s = NOTIF_LABELS[n.statut] ?? NOTIF_LABELS.simule;
        return (
          <div key={n.id} style={ligne}>
            <span style={{ fontWeight: 600 }}>{n.prestataire?.raison_sociale ?? n.email}</span>
            <span style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>{n.email}</span>
            <span className="spacer" style={{ flex: 1 }}></span>
            <span style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>{fmtDate(n.sent_at)}</span>
            <Badge kind={s.kind}>{s.label}</Badge>
          </div>
        );
      })}

      {titre("2", "Dossier récupéré par", cs.acces.length)}
      {cs.acces.length === 0 && (
        <div className="cs-cand-empty">Personne n'a encore ouvert le dossier ou téléchargé une pièce.</div>
      )}
      {cs.acces.map((a) => (
        <div key={a.id} style={ligne}>
          <Icon name="eye" size={14} style={{ color: "var(--fg-muted)" }} />
          <span style={{ fontWeight: 600 }}>{a.prestataire?.raison_sociale ?? "Entreprise"}</span>
          <span className="spacer" style={{ flex: 1 }}></span>
          <span style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>
            le {fmtDate(a.first_at)}
            {fmtDate(a.last_at) !== fmtDate(a.first_at) ? ` · revu le ${fmtDate(a.last_at)}` : ""}
          </span>
        </div>
      ))}

      {titre("3", "Réponses reçues", cs.candidatures.length)}
      {cs.candidatures.length === 0 && <div className="cs-cand-empty">Aucune réponse pour le moment.</div>}
      {cs.candidatures.map((cand) => (
        <div key={cand.id} style={ligne}>
          <Icon name="fileCheck" size={14} style={{ color: "var(--color-primary-700)" }} />
          <span style={{ fontWeight: 600 }}>{cand.org_name}</span>
          {cand.montant != null && <span style={{ fontWeight: 700 }}>{fmtEuro(cand.montant)} HT</span>}
          <span className="spacer" style={{ flex: 1 }}></span>
          <span style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>{fmtDate(cand.received_at)}</span>
          {cand.fichier_path ? (
            <button
              className="se-btn se-btn-ghost btn-sm"
              title={cand.fichier_name ?? "Offre jointe"}
              onClick={() => void ouvrirOffre(cand.fichier_path!)}
            >
              <Icon name="download" size={13} />
              Offre
            </button>
          ) : (
            <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>sans pièce</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Questions posées par les candidats avant de postuler - la réponse de
 *  l'AMO est visible de tous les candidats de la consultation.
 *  Réutilisé par l'onglet Prestataires du dossier copro. */
export function QuestionsPanel({ cs }: { cs: Consultation }) {
  const repondre = useRepondreQuestion();
  const [brouillons, setBrouillons] = useState<Record<string, string>>({});

  if (cs.questions.length === 0) {
    return (
      <div className="cs-cand-list">
        <div className="cs-cand-empty">Aucune question de candidat pour le moment.</div>
      </div>
    );
  }

  return (
    <div className="cs-cand-list">
      {cs.questions.map((q) => (
        <div key={q.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 700 }}>{q.prestataire?.raison_sociale ?? "Candidat"}</span>
            <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>{fmtDate(q.asked_at)}</span>
          </div>
          <p style={{ margin: "4px 0 6px", fontSize: 13.5 }}>{q.question}</p>
          {q.reponse ? (
            <p
              style={{
                margin: 0,
                paddingLeft: 10,
                borderLeft: "3px solid var(--color-primary-500)",
                fontSize: 13.5,
                color: "var(--fg2)",
              }}
            >
              <strong>Réponse</strong>
              {q.answered_at ? ` · ${fmtDate(q.answered_at)}` : ""} - {q.reponse}
            </p>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="edit-inp"
                style={{ flex: 1, maxWidth: "none" }}
                placeholder="Votre réponse - visible de tous les candidats…"
                value={brouillons[q.id] ?? ""}
                onChange={(e) => setBrouillons((p) => ({ ...p, [q.id]: e.target.value }))}
              />
              <button
                className="se-btn se-btn-secondary btn-sm"
                disabled={!(brouillons[q.id] ?? "").trim() || repondre.isPending}
                onClick={() => void repondre.mutateAsync({ id: q.id, reponse: brouillons[q.id] })}
              >
                <Icon name="send" size={14} />
                Répondre
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Card({ cs }: { cs: Consultation }) {
  const [open, setOpen] = useState(false);
  const [etat, setEtat] = useState(false);
  const [qa, setQa] = useState(false);
  const [newOrg, setNewOrg] = useState("");
  const close = useCloseConsultation();
  const reopen = useReopenConsultation();
  const relance = useRelancerAlertes();
  const addCand = useAddCandidature();

  // Renvoie les alertes e-mail aux prestataires du métier pas encore prévenus
  // (la fonction serveur ne notifie jamais deux fois le même prestataire).
  const relancerAlertes = async () => {
    const n = await relance.mutateAsync(cs.id);
    if (!n) return;
    window.alert(
      n.total === 0
        ? "Tous les prestataires référencés du métier ont déjà été alertés - aucun nouvel e-mail."
        : n.mode === "simulation"
          ? `${n.total} prestataire${n.total > 1 ? "s" : ""} identifié${n.total > 1 ? "s" : ""} - envoi simulé (configurez RESEND_API_KEY pour l'e-mail réel).`
          : `Alertes envoyées : ${n.envoyes} e-mail${n.envoyes > 1 ? "s" : ""}${n.erreurs ? ` · ${n.erreurs} en erreur` : ""}.`
    );
  };
  const jr = joursRestants(cs.date_limite);
  const enLigne = cs.statut === "en_ligne";
  const cible = consultationCible(cs);
  const notifOk = cs.notifications.filter((n) => n.statut !== "erreur").length;
  const enAttente = cs.questions.filter((q) => !q.reponse).length;

  return (
    <div className={"cs-card" + (!enLigne ? " closed" : "")}>
      <div className="cs-card-head">
        <TypeTag type={cs.type} />
        {cs.sous_type && <Badge kind="primary">{sousTypeLabel(cs.sous_type)}</Badge>}
        <span className="spacer" style={{ flex: 1 }}></span>
        {enLigne ? (
          <Badge kind={jr != null && jr <= 5 ? "warn" : "success"} dot>
            {jr == null ? "En ligne" : jr > 0 ? `En ligne · J−${jr}` : "Échéance dépassée"}
          </Badge>
        ) : (
          <Badge kind="neutral">Clôturée</Badge>
        )}
      </div>
      <div className="cs-copro">
        {cible.nom} <span className="cs-loc">· {cible.lieu}</span>
        {cible.externe && (
          <Badge kind="blue" >Hors plateforme{cs.copro_externe_lots ? ` · ${cs.copro_externe_lots} lots` : ""}</Badge>
        )}
      </div>
      <p className="cs-mission">{cs.mission}</p>
      {(cs.options.length > 0 || cs.docs.length > 0) && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {cs.options.map((o) => (
            <Badge key={o} kind="blue">{optionLabel(o)}</Badge>
          ))}
          {cs.docs.map((d) => (
            <button
              key={d.id}
              className="se-btn se-btn-ghost btn-sm"
              title={d.name}
              onClick={() => void ouvrirDocConsultation(d.path)}
            >
              <Icon name="fileText" size={13} />
              {d.name.length > 28 ? d.name.slice(0, 26) + "…" : d.name}
            </button>
          ))}
        </div>
      )}
      <div className="cs-meta">
        {cs.date_limite && (
          <span>
            <Icon name="calendar" size={14} />
            Réponses avant le {fmtDate(cs.date_limite)}
          </span>
        )}
        {(cs.budget ?? 0) > 0 && (
          <span>
            <Icon name="euro" size={14} />
            {fmtEuro(cs.budget)} estimé
          </span>
        )}
        {cs.notifications.length > 0 && (
          <span title="Prestataires référencés alertés par e-mail">
            <Icon name="send" size={14} />
            {notifOk} alerté{notifOk > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="cs-foot">
        <button
          className="cs-cand-toggle"
          onClick={() => {
            setOpen((o) => !o);
            setEtat(false);
            setQa(false);
          }}
        >
          <Icon name="users" size={15} />
          {cs.candidatures.length} candidature{cs.candidatures.length > 1 ? "s" : ""}
          <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
        </button>
        <button
          className="cs-cand-toggle"
          onClick={() => {
            setEtat((e) => !e);
            setOpen(false);
            setQa(false);
          }}
        >
          <Icon name="barChart" size={15} />
          État de la consultation
          <Icon name={etat ? "chevronDown" : "chevronRight"} size={14} />
        </button>
        <button
          className="cs-cand-toggle"
          onClick={() => {
            setQa((v) => !v);
            setOpen(false);
            setEtat(false);
          }}
        >
          <Icon name="message" size={15} />
          {cs.questions.length} question{cs.questions.length > 1 ? "s" : ""}
          {enAttente > 0 && <Badge kind="warn">{enAttente} sans réponse</Badge>}
          <Icon name={qa ? "chevronDown" : "chevronRight"} size={14} />
        </button>
        <span className="spacer" style={{ flex: 1 }}></span>
        {enLigne ? (
          <>
            <button
              className="se-btn se-btn-ghost btn-sm"
              title="Alerter par e-mail les prestataires référencés du métier qui ne l'ont pas encore été"
              disabled={relance.isPending}
              onClick={() => void relancerAlertes()}
            >
              <Icon name="mail" size={13} />
              {relance.isPending ? "Envoi…" : "Relancer les alertes"}
            </button>
            <button className="se-btn se-btn-ghost btn-sm" onClick={() => void close.mutateAsync(cs.id)}>
              Clôturer
            </button>
          </>
        ) : (
          <button
            className="se-btn se-btn-ghost btn-sm"
            title="Relancer la consultation : elle redevient visible des prestataires du métier, qui peuvent de nouveau candidater"
            disabled={reopen.isPending}
            onClick={() => void reopen.mutateAsync(cs.id)}
          >
            <Icon name="megaphone" size={13} />
            Remettre en ligne
          </button>
        )}
      </div>
      {etat && <EtatConsultation cs={cs} />}
      {qa && <QuestionsPanel cs={cs} />}
      {open && (
        <div className="cs-cand-list">
          {cs.candidatures.length === 0 && <div className="cs-cand-empty">Aucune candidature reçue pour le moment.</div>}
          {cs.candidatures.map((cand) => (
            <div className="cs-cand" key={cand.id} style={{ flexWrap: "wrap" }}>
              <Avatar
                who={cand.org_name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
                name={cand.org_name}
                sm
              />
              <span className="cs-cand-org">{cand.org_name}</span>
              {cand.prestataire_id && (
                <Badge kind="primary" dot>Portail</Badge>
              )}
              {cand.montant != null && (
                <span style={{ fontWeight: 700, fontSize: 13 }}>{fmtEuro(cand.montant)} HT</span>
              )}
              <span className="cs-cand-date">{fmtDate(cand.received_at)}</span>
              {cand.fichier_path && (
                <button
                  className="se-btn se-btn-ghost btn-sm"
                  title={cand.fichier_name ?? "Offre jointe"}
                  onClick={() => void ouvrirOffre(cand.fichier_path!)}
                >
                  <Icon name="download" size={14} />
                  Offre
                </button>
              )}
              <span className="spacer" style={{ flex: 1 }}></span>
              <CandidatureActions cand={cand} />
              {(cand.tarif_diag_avp != null ||
                cand.tarif_pro_dce != null ||
                cand.tarif_chantier != null ||
                cand.tarif_options != null ||
                cand.tarif_etancheite_avant != null ||
                cand.tarif_etancheite_apres != null ||
                cand.tarif_conception != null ||
                cand.tarif_realisation != null) && (
                <div style={{ flexBasis: "100%", fontSize: 12.5, color: "var(--fg2)", paddingLeft: 34 }}>
                  {[
                    cand.tarif_diag_avp != null ? `DIAG-AVP ${fmtEuro(cand.tarif_diag_avp)}` : null,
                    cand.tarif_pro_dce != null
                      ? cand.tarif_pro_dce_mode === "pourcentage"
                        ? `PRO-DCE ${cand.tarif_pro_dce.toLocaleString("fr-FR")} % du montant des travaux`
                        : `PRO-DCE ${fmtEuro(cand.tarif_pro_dce)}`
                      : null,
                    cand.tarif_chantier != null
                      ? cand.tarif_chantier_mode === "pourcentage"
                        ? `Suivi de chantier ${cand.tarif_chantier.toLocaleString("fr-FR")} % du montant des travaux`
                        : `Suivi de chantier ${fmtEuro(cand.tarif_chantier)}`
                      : null,
                    cand.tarif_etancheite_avant != null ? `Étanchéité avant travaux ${fmtEuro(cand.tarif_etancheite_avant)}` : null,
                    cand.tarif_etancheite_apres != null ? `Étanchéité après travaux ${fmtEuro(cand.tarif_etancheite_apres)}` : null,
                    cand.tarif_conception != null ? `Phase conception ${fmtEuro(cand.tarif_conception)}` : null,
                    cand.tarif_realisation != null ? `Phase réalisation ${fmtEuro(cand.tarif_realisation)}` : null,
                    ...Object.entries((cand.tarif_options as Record<string, number> | null) ?? {}).map(
                      ([k, v]) => `${optionLabel(k)} ${fmtEuro(v)}`
                    ),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
              {cand.message && (
                <div style={{ flexBasis: "100%", fontSize: 12.5, color: "var(--fg3)", paddingLeft: 34, fontStyle: "italic" }}>
                  « {cand.message} »
                </div>
              )}
            </div>
          ))}
          {enLigne && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                className="edit-inp"
                placeholder="Candidature reçue hors plateforme - nom de l'organisme…"
                value={newOrg}
                onChange={(e) => setNewOrg(e.target.value)}
                style={{ flex: 1, maxWidth: "none" }}
              />
              <button
                className="se-btn se-btn-secondary btn-sm"
                disabled={!newOrg.trim() || addCand.isPending}
                onClick={() => {
                  void addCand.mutateAsync({ consultationId: cs.id, org: newOrg.trim() }).then(() => setNewOrg(""));
                }}
              >
                <Icon name="plus" size={14} />
                Ajouter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Consultations() {
  useCrumbs([{ label: "Consulter un intervenant" }]);
  const { data: consultations } = useConsultations();
  const { data: copros } = useCopros();
  const publish = usePublishConsultation();

  const [form, setForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    type: "moe" as Consultation["type"],
    sous_type: "",
    cible: "existante" as "existante" | "externe",
    copro_id: "",
    ext_nom: "",
    ext_adresse: "",
    ext_ville: "",
    ext_lots: "",
    ext_batiments: "",
    mission: "",
    date_limite: "",
    budget: "",
    options: [] as string[],
  });
  const [files, setFiles] = useState<File[]>([]);
  // Fichiers en attente de renommage assisté avant d'être joints
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const coproDraft =
    draft.cible === "existante"
      ? ((copros ?? []).find((x) => x.id === draft.copro_id)?.name ?? null)
      : draft.ext_nom.trim() || null;
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => setDraft((p) => ({ ...p, [k]: v }));
  const toggleOption = (id: string) =>
    setDraft((p) => ({
      ...p,
      options: p.options.includes(id) ? p.options.filter((o) => o !== id) : [...p.options, id],
    }));

  const cibleOk = draft.cible === "existante" ? !!draft.copro_id : !!draft.ext_nom.trim();
  const [formError, setFormError] = useState<string | null>(null);

  const doPublish = async () => {
    // validation visible : plus de clic « qui ne fait rien »
    const manques: string[] = [];
    if (!cibleOk) manques.push(draft.cible === "existante" ? "choisissez la copropriété" : "renseignez le nom de la copropriété");
    if (draft.type === "diag" && !draft.sous_type) manques.push("choisissez le type de diagnostic");
    if (!draft.mission.trim())
      manques.push(
        draft.sous_type === "amiante_plomb" && draft.type === "diag"
          ? "décrivez la mission et le programme de travaux pressentis"
          : "décrivez la mission"
      );
    if (manques.length > 0) {
      setFormError("Pour publier : " + manques.join(" · ") + ".");
      return;
    }
    setFormError(null);
    const externe = draft.cible === "externe";
    // nombres de logements et de bâtiments figés sur la consultation (les
    // candidats ne peuvent pas lire les stats des copros de la plateforme)
    const stats = externe ? null : (copros ?? []).find((c) => c.id === draft.copro_id)?.stats;
    const nbLogements = externe
      ? draft.ext_lots
        ? Number(draft.ext_lots)
        : null
      : stats?.lots_hab || stats?.lots || null;
    const nbBatiments = externe
      ? draft.ext_batiments
        ? Number(draft.ext_batiments)
        : null
      : stats?.batiments || null;
    let res: PublishResult;
    try {
      res = await publish.mutateAsync({
        type: draft.type,
        mission: draft.mission.trim(),
        date_limite: draft.date_limite || null,
        budget: draft.budget ? Number(draft.budget) : null,
        copro_id: externe ? null : draft.copro_id,
        copro_externe_nom: externe ? draft.ext_nom.trim() : null,
        copro_externe_adresse: externe ? draft.ext_adresse.trim() || null : null,
        copro_externe_ville: externe ? draft.ext_ville.trim() || null : null,
        copro_externe_lots: externe && draft.ext_lots ? Number(draft.ext_lots) : null,
        nb_logements: nbLogements,
        nb_batiments: nbBatiments,
        sous_type: draft.type === "diag" && draft.sous_type ? draft.sous_type : null,
        // options réservées à la maîtrise d'œuvre - jamais publiées pour les autres métiers
        options: draft.type === "moe" ? draft.options : [],
        files,
      });
    } catch (e) {
      // la publication a échoué : le formulaire reste ouvert avec la saisie
      setFormError("La publication a échoué : " + String((e as Error).message ?? e));
      return;
    }
    if (res.notifyError) {
      setNotice("Consultation publiée, mais l'alerte e-mail a échoué : " + res.notifyError);
    } else if (res.notification) {
      const n = res.notification;
      setNotice(
        n.total === 0
          ? "Consultation publiée. Aucun prestataire référencé pour ce métier - pensez à enrichir la base prestataires."
          : n.mode === "simulation"
            ? `Consultation publiée. ${n.total} prestataire${n.total > 1 ? "s" : ""} référencé${n.total > 1 ? "s" : ""} identifié${n.total > 1 ? "s" : ""} (envoi simulé : configurez RESEND_API_KEY pour l'e-mail réel).`
            : `Consultation publiée. ${n.envoyes} e-mail${n.envoyes > 1 ? "s" : ""} envoyé${n.envoyes > 1 ? "s" : ""}${n.erreurs ? `, ${n.erreurs} en erreur` : ""}.`
      );
    }
    if (res.docErrors.length > 0) {
      setNotice((prev) => (prev ? prev + " " : "") + `Attention : pièce(s) non jointe(s) - ${res.docErrors.join(", ")}.`);
    }
    setDraft({ type: "moe", sous_type: "", cible: "existante", copro_id: "", ext_nom: "", ext_adresse: "", ext_ville: "", ext_lots: "", ext_batiments: "", mission: "", date_limite: "", budget: "", options: [] });
    setFiles([]);
    setForm(false);
  };

  const enLigne = (consultations ?? []).filter((c) => c.statut === "en_ligne");
  const closed = (consultations ?? []).filter((c) => c.statut !== "en_ligne");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Consulter un intervenant</h1>
          <p className="page-sub">
            Publiez une consultation : les prestataires référencés du métier sont alertés par e-mail et
            déposent leur offre depuis leur espace (MOE, diagnostiqueur, contrôleur technique, SPS…)
          </p>
        </div>
        <span className="spacer"></span>
        {!form && (
          <button className="se-btn se-btn-primary" onClick={() => setForm(true)}>
            <Icon name="megaphone" size={17} />
            Publier une consultation
          </button>
        )}
      </div>

      {notice && (
        <div
          className="panel"
          style={{ padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, borderLeft: "3px solid var(--color-primary-500)" }}
        >
          <Icon name="send" size={16} style={{ color: "var(--color-primary-700)", flex: "none" }} />
          <span style={{ fontSize: 13.5 }}>{notice}</span>
          <span className="spacer" style={{ flex: 1 }}></span>
          <button className="icon-btn" onClick={() => setNotice(null)} title="Fermer">
            <Icon name="x" size={15} />
          </button>
        </div>
      )}

      {form && (
        <div className="panel cs-form">
          <div className="p-head">
            <Icon name="megaphone" size={18} />
            <h3>Nouvelle consultation</h3>
            <span style={{ flex: 1 }}></span>
            <button
              className="se-btn se-btn-ghost btn-sm"
              onClick={() => {
                setForm(false);
                setFormError(null);
              }}
            >
              Annuler
            </button>
          </div>
          <div className="p-body">
            <div className="cs-form-grid">
              <div className="cs-field cs-field-full">
                <label>Type d'intervenant</label>
                <div className="cs-type-pick">
                  {CONSULT_TYPES.map((t) => (
                    <button key={t.id} className={"cs-type-opt" + (draft.type === t.id ? " on" : "")} onClick={() => set("type", t.id)}>
                      <Icon name={t.icon} size={15} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {draft.type === "diag" && (
                <div className="cs-field cs-field-full">
                  <label>Type de diagnostic</label>
                  <div className="cs-type-pick">
                    {DIAG_SOUS_TYPES.map((s) => (
                      <button
                        key={s.id}
                        className={"cs-type-opt" + (draft.sous_type === s.id ? " on" : "")}
                        onClick={() => set("sous_type", s.id)}
                      >
                        <Icon name={s.id === "etancheite" ? "gauge" : "fileCheck"} size={15} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="cs-field cs-field-full">
                <label>Copropriété concernée</label>
                <div className="cs-type-pick">
                  <button
                    className={"cs-type-opt" + (draft.cible === "existante" ? " on" : "")}
                    onClick={() => set("cible", "existante")}
                  >
                    <Icon name="building" size={15} />
                    Copro de la plateforme
                  </button>
                  <button
                    className={"cs-type-opt" + (draft.cible === "externe" ? " on" : "")}
                    onClick={() => set("cible", "externe")}
                  >
                    <Icon name="mapPin" size={15} />
                    Nouvelle copro (études non démarrées)
                  </button>
                </div>
              </div>
              {draft.cible === "existante" ? (
                <div className="cs-field">
                  <label>Copropriété</label>
                  <select
                    className="edit-sel"
                    style={{ maxWidth: "none", width: "100%" }}
                    value={draft.copro_id}
                    onChange={(e) => set("copro_id", e.target.value)}
                  >
                    <option value="">- Choisir -</option>
                    {(copros ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} - {c.city}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="cs-field">
                    <label>Nom de la copropriété *</label>
                    <input className="edit-inp" style={{ maxWidth: "none" }} value={draft.ext_nom}
                      placeholder="Résidence…" onChange={(e) => set("ext_nom", e.target.value)} />
                  </div>
                  <div className="cs-field">
                    <label>Adresse</label>
                    <input className="edit-inp" style={{ maxWidth: "none" }} value={draft.ext_adresse}
                      placeholder="12 rue…" onChange={(e) => set("ext_adresse", e.target.value)} />
                  </div>
                  <div className="cs-field">
                    <label>Ville</label>
                    <input className="edit-inp" style={{ maxWidth: "none" }} value={draft.ext_ville}
                      placeholder="Strasbourg" onChange={(e) => set("ext_ville", e.target.value)} />
                  </div>
                  <div className="cs-field">
                    <label>Nombre de lots <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· optionnel</span></label>
                    <input className="edit-inp" style={{ maxWidth: "none" }} type="number" value={draft.ext_lots}
                      placeholder="0" onChange={(e) => set("ext_lots", e.target.value)} />
                  </div>
                  <div className="cs-field">
                    <label>Nombre de bâtiments <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· optionnel</span></label>
                    <input className="edit-inp" style={{ maxWidth: "none" }} type="number" value={draft.ext_batiments}
                      placeholder="0" onChange={(e) => set("ext_batiments", e.target.value)} />
                  </div>
                </>
              )}
              <div className="cs-field cs-field-full">
                <label>
                  {draft.type === "diag" && draft.sous_type === "amiante_plomb"
                    ? "Description de la mission et programme de travaux pressentis"
                    : "Description de la mission"}
                </label>
                <textarea
                  className="cs-textarea"
                  rows={draft.type === "diag" && draft.sous_type === "amiante_plomb" ? 5 : 3}
                  value={draft.mission}
                  placeholder={
                    draft.type === "diag" && draft.sous_type === "amiante_plomb"
                      ? "Périmètre du repérage, puis programme de travaux pressentis (postes concernés : façades, menuiseries, toiture, parties communes…)"
                      : "Périmètre, attendus, contraintes particulières…"
                  }
                  onChange={(e) => set("mission", e.target.value)}
                ></textarea>
              </div>
              <div className="cs-field">
                <label>Date limite de réponse</label>
                <input
                  className="edit-inp"
                  style={{ maxWidth: "none" }}
                  type="date"
                  value={draft.date_limite}
                  onChange={(e) => set("date_limite", e.target.value)}
                />
              </div>
              <div className="cs-field">
                <label>
                  Budget estimatif <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· optionnel</span>
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    className="edit-inp"
                    style={{ maxWidth: "none" }}
                    type="number"
                    value={draft.budget}
                    placeholder="0"
                    onChange={(e) => set("budget", e.target.value)}
                  />
                  <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>€ HT</span>
                </div>
              </div>
              {/* Les options ne concernent que la recherche de maîtrise d'œuvre */}
              {draft.type === "moe" && (
              <div className="cs-field cs-field-full">
                <label>
                  Options demandées{" "}
                  <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
                    · le candidat chiffrera chaque option cochée
                  </span>
                </label>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  {CONSULT_OPTIONS.map((o) => (
                    <label
                      key={o.id}
                      style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={draft.options.includes(o.id)}
                        onChange={() => toggleOption(o.id)}
                        style={{ accentColor: "var(--accent)", width: 15, height: 15 }}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>
              )}
              <div className="cs-field cs-field-full">
                <label>
                  Documents joints{" "}
                  <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
                    · cahier des charges, audit, plans… visibles des candidats
                  </span>
                </label>
                <input
                  ref={filesRef}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    // copie immédiate : la FileList est un objet vivant, vidé
                    // par le reset de l'input avant que React n'évalue l'updater
                    const nouveaux = Array.from(e.target.files ?? []);
                    if (nouveaux.length) setPendingFiles(nouveaux); // renommage assisté avant d'être joints
                    e.target.value = "";
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {files.map((f, i) => (
                    <span
                      key={i}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "5px 10px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--bg-soft)",
                        border: "1px solid var(--border)",
                        fontSize: 12.5,
                      }}
                    >
                      <Icon name="fileText" size={13} />
                      {f.name}
                      <button
                        className="icon-btn"
                        title="Retirer"
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        style={{ width: 18, height: 18 }}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </span>
                  ))}
                  <button className="se-btn se-btn-secondary btn-sm" onClick={() => filesRef.current?.click()}>
                    <Icon name="upload" size={14} />
                    Joindre un document
                  </button>
                </div>
              </div>
            </div>
            {pendingFiles && (
              <RenommageDialog
                files={pendingFiles}
                prefixe={coproDraft}
                onConfirm={(file) => setFiles((prev) => [...prev, file])}
                onClose={() => setPendingFiles(null)}
              />
            )}
            {formError && (
              <p
                style={{
                  marginTop: 16,
                  marginBottom: 0,
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-error-50)",
                  color: "var(--color-error-700)",
                  fontSize: 13.5,
                }}
              >
                {formError}
              </p>
            )}
            <button
              className="se-btn se-btn-primary"
              style={{ marginTop: 18 }}
              onClick={() => void doPublish()}
              disabled={publish.isPending}
            >
              <Icon name="megaphone" size={16} />
              {publish.isPending ? "Publication…" : "Mettre en ligne et alerter les prestataires"}
            </button>
          </div>
        </div>
      )}

      <div className="cs-section-label">En ligne · {enLigne.length}</div>
      <div className="cs-grid">
        {enLigne.map((cs) => (
          <Card key={cs.id} cs={cs} />
        ))}
      </div>
      {enLigne.length === 0 && !form && (
        <p className="se-small" style={{ color: "var(--fg-muted)" }}>
          Aucune consultation en ligne - publiez votre premier appel à intervenants.
        </p>
      )}
      {closed.length > 0 && (
        <>
          <div className="cs-section-label" style={{ marginTop: 28 }}>
            Clôturées · {closed.length}
          </div>
          <div className="cs-grid">
            {closed.map((cs) => (
              <Card key={cs.id} cs={cs} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
