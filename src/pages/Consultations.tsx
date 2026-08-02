// Consulter un intervenant — plateforme de consultation des prestations
// intellectuelles. La consultation vise une copro de la plateforme OU une
// copro externe (études pas encore démarrées). À la publication, les
// prestataires référencés du métier sont alertés par e-mail ; ils déposent
// leur offre depuis leur espace (les candidatures hors plateforme restent
// saisissables à la main).
import { useState } from "react";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { fmtEuro, fmtDate } from "@/lib/format";
import { useCopros } from "@/api/copros";
import {
  CONSULT_TYPES,
  consultationCible,
  ouvrirOffre,
  useAddCandidature,
  useCloseConsultation,
  useConsultations,
  usePublishConsultation,
  useSetCandidatureStatut,
  type Consultation,
  type PublishResult,
} from "@/api/consultations";

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

function Card({ cs }: { cs: Consultation }) {
  const [open, setOpen] = useState(false);
  const [newOrg, setNewOrg] = useState("");
  const close = useCloseConsultation();
  const addCand = useAddCandidature();
  const setStatut = useSetCandidatureStatut();
  const jr = joursRestants(cs.date_limite);
  const enLigne = cs.statut === "en_ligne";
  const cible = consultationCible(cs);
  const notifOk = cs.notifications.filter((n) => n.statut !== "erreur").length;

  return (
    <div className={"cs-card" + (!enLigne ? " closed" : "")}>
      <div className="cs-card-head">
        <TypeTag type={cs.type} />
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
        <button className="cs-cand-toggle" onClick={() => setOpen((o) => !o)}>
          <Icon name="users" size={15} />
          {cs.candidatures.length} candidature{cs.candidatures.length > 1 ? "s" : ""}
          <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
        </button>
        <span className="spacer" style={{ flex: 1 }}></span>
        {enLigne && (
          <button className="se-btn se-btn-ghost btn-sm" onClick={() => void close.mutateAsync(cs.id)}>
            Clôturer
          </button>
        )}
      </div>
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
              <select
                className="edit-inp"
                value={cand.statut}
                onChange={(e) =>
                  void setStatut.mutateAsync({ id: cand.id, statut: e.target.value as typeof cand.statut })
                }
                style={{ maxWidth: 130, fontSize: 12.5 }}
              >
                <option value="recue">Reçue</option>
                <option value="retenue">Retenue</option>
                <option value="non_retenue">Non retenue</option>
              </select>
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
                placeholder="Candidature reçue hors plateforme — nom de l'organisme…"
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
    cible: "existante" as "existante" | "externe",
    copro_id: "",
    ext_nom: "",
    ext_adresse: "",
    ext_ville: "",
    ext_lots: "",
    mission: "",
    date_limite: "",
    budget: "",
  });
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => setDraft((p) => ({ ...p, [k]: v }));

  const cibleOk = draft.cible === "existante" ? !!draft.copro_id : !!draft.ext_nom.trim();

  const doPublish = async () => {
    if (!draft.mission.trim() || !cibleOk) return;
    const externe = draft.cible === "externe";
    const res: PublishResult = await publish.mutateAsync({
      type: draft.type,
      mission: draft.mission.trim(),
      date_limite: draft.date_limite || null,
      budget: draft.budget ? Number(draft.budget) : null,
      copro_id: externe ? null : draft.copro_id,
      copro_externe_nom: externe ? draft.ext_nom.trim() : null,
      copro_externe_adresse: externe ? draft.ext_adresse.trim() || null : null,
      copro_externe_ville: externe ? draft.ext_ville.trim() || null : null,
      copro_externe_lots: externe && draft.ext_lots ? Number(draft.ext_lots) : null,
    });
    if (res.notifyError) {
      setNotice("Consultation publiée, mais l'alerte e-mail a échoué : " + res.notifyError);
    } else if (res.notification) {
      const n = res.notification;
      setNotice(
        n.total === 0
          ? "Consultation publiée. Aucun prestataire référencé pour ce métier — pensez à enrichir la base prestataires."
          : n.mode === "simulation"
            ? `Consultation publiée. ${n.total} prestataire${n.total > 1 ? "s" : ""} référencé${n.total > 1 ? "s" : ""} identifié${n.total > 1 ? "s" : ""} (envoi simulé : configurez RESEND_API_KEY pour l'e-mail réel).`
            : `Consultation publiée. ${n.envoyes} e-mail${n.envoyes > 1 ? "s" : ""} envoyé${n.envoyes > 1 ? "s" : ""}${n.erreurs ? `, ${n.erreurs} en erreur` : ""}.`
      );
    }
    setDraft({ type: "moe", cible: "existante", copro_id: "", ext_nom: "", ext_adresse: "", ext_ville: "", ext_lots: "", mission: "", date_limite: "", budget: "" });
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
            <button className="se-btn se-btn-ghost btn-sm" onClick={() => setForm(false)}>
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
                    <option value="">— Choisir —</option>
                    {(copros ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.city}
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
                </>
              )}
              <div className="cs-field cs-field-full">
                <label>Description de la mission</label>
                <textarea
                  className="cs-textarea"
                  rows={3}
                  value={draft.mission}
                  placeholder="Périmètre, attendus, contraintes particulières…"
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
            </div>
            <button
              className="se-btn se-btn-primary"
              style={{ marginTop: 18 }}
              onClick={() => void doPublish()}
              disabled={!draft.mission.trim() || !cibleOk || publish.isPending}
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
          Aucune consultation en ligne — publiez votre premier appel à intervenants.
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
