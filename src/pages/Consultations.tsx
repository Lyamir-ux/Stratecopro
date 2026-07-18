// Consulter un intervenant — porté de consultations.jsx (ConsultationsAMO), branché sur les vraies tables.
// V1 : les candidatures sont saisies à la main par l'AMO ; le portail intervenant arrive en phase 2.
import { useState } from "react";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Avatar, Badge } from "@/components/ui";
import { fmtEuro, fmtDate } from "@/lib/format";
import { useCopros } from "@/api/copros";
import {
  CONSULT_TYPES,
  useAddCandidature,
  useCloseConsultation,
  useConsultations,
  usePublishConsultation,
  useSetCandidatureStatut,
  type Consultation,
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
        {cs.copro?.name ?? "—"} <span className="cs-loc">· {cs.copro?.adresse || cs.copro?.city || ""}</span>
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
            <div className="cs-cand" key={cand.id}>
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
              <span className="cs-cand-date">{fmtDate(cand.received_at)}</span>
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
            </div>
          ))}
          {enLigne && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                className="edit-inp"
                placeholder="Nom de l'organisme candidat…"
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
  const [draft, setDraft] = useState({
    type: "moe" as Consultation["type"],
    copro_id: "",
    mission: "",
    date_limite: "",
    budget: "",
  });
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => setDraft((p) => ({ ...p, [k]: v }));

  const doPublish = async () => {
    if (!draft.mission.trim() || !draft.copro_id) return;
    await publish.mutateAsync({
      copro_id: draft.copro_id,
      type: draft.type,
      mission: draft.mission.trim(),
      date_limite: draft.date_limite || null,
      budget: draft.budget ? Number(draft.budget) : null,
    });
    setDraft({ type: "moe", copro_id: "", mission: "", date_limite: "", budget: "" });
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
            Publiez une consultation et suivez les candidatures des intervenants (MOE, diagnostiqueur, contrôleur
            technique, SPS…)
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
              <div className="cs-field">
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
              <div className="cs-field">
                <label>Copropriété concernée</label>
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
              disabled={!draft.mission.trim() || !draft.copro_id 	|| publish.isPending}
            >
              <Icon name="megaphone" size={16} />
              Mettre en ligne la consultation
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
