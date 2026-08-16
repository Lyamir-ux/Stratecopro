// Onglet Enquête sociale & technique (AMO).
// Le questionnaire est configuré depuis le catalogue (src/lib/enqueteCatalogue.ts) :
// l'AMO active/désactive chaque question ; les questions socle (identité, usage des
// lots) sont verrouillées. Les conditions d'affichage sont montrées à titre informatif —
// elles s'appliquent côté portail copropriétaire au moment de la saisie.
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { Profil } from "@/lib/finance";
import { useBareme } from "@/api/scenarios";
import { useDonnees } from "@/api/donnees";
import { useEnquete, useReponses, useSaveReponse, useUpdateEnquete } from "@/api/enquete";
import {
  SECTIONS,
  describeType,
  condTexts,
  normalizeConfig,
  resolveQuestions,
  type ConfigItem,
  type ResolvedQuestion,
  type Scope,
} from "@/lib/enqueteCatalogue";
import type { CoproWithStats } from "@/api/copros";

// Libellés grand public (plafonds Anah) — les couleurs MPR restent un simple repère visuel.
const PROFIL_META: { p: Profil; label: string; color: string }[] = [
  { p: "Bleu", label: "Très modeste", color: "#2E6FA8" },
  { p: "Jaune", label: "Modeste", color: "#f2a30d" },
  { p: "Violet", label: "Intermédiaire", color: "#7A5AE0" },
  { p: "Rose", label: "Supérieur", color: "#DC6FA8" },
];

function ReponseRow({
  coproprietaireId,
  nom,
  existing,
  enqueteId,
  coproId,
}: {
  coproprietaireId: string;
  nom: string;
  existing: { nb_personnes: number | null; statut_occupation: string | null; rfr: number | null; profil_mpr: string | null } | null;
  enqueteId: string;
  coproId: string;
}) {
  const { data: bareme } = useBareme();
  const save = useSaveReponse(enqueteId, coproId);
  const [nb, setNb] = useState<string>(existing?.nb_personnes?.toString() ?? "");
  const [statut, setStatut] = useState<string>(existing?.statut_occupation ?? "");
  const [rfr, setRfr] = useState<string>(existing?.rfr?.toString() ?? "");
  const dirty =
    nb !== (existing?.nb_personnes?.toString() ?? "") ||
    statut !== (existing?.statut_occupation ?? "") ||
    rfr !== (existing?.rfr?.toString() ?? "");

  const doSave = () => {
    if (!bareme) return;
    void save.mutateAsync({
      coproprietaireId,
      nbPersonnes: nb === "" ? null : Number(nb),
      statutOccupation: statut || null,
      rfr: rfr === "" ? null : Number(rfr),
      bareme,
    });
  };

  const profil = existing?.profil_mpr as Profil | null;
  const meta = PROFIL_META.find((m) => m.p === profil);

  return (
    <tr style={{ cursor: "default" }}>
      <td style={{ fontWeight: 600 }}>{nom}</td>
      <td>
        <input className="edit-inp sm" type="number" min="1" value={nb} placeholder="—" onChange={(e) => setNb(e.target.value)} style={{ width: 64 }} />
      </td>
      <td>
        <select className="edit-inp" value={statut} onChange={(e) => setStatut(e.target.value)}>
          <option value="">—</option>
          <option value="occupant">Occupant</option>
          <option value="bailleur">Bailleur</option>
        </select>
      </td>
      <td>
        <input className="edit-inp sm" type="number" min="0" value={rfr} placeholder="—" onChange={(e) => setRfr(e.target.value)} style={{ width: 100 }} />
      </td>
      <td>
        {meta ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: meta.color }}></span>
            {meta.label}
          </span>
        ) : (
          <span style={{ color: "var(--fg-muted)" }}>—</span>
        )}
      </td>
      <td>
        <button className="se-btn se-btn-ghost btn-sm" onClick={doSave} disabled={!dirty || save.isPending}>
          <Icon name="check" size={14} />
          {save.isPending ? "…" : "OK"}
        </button>
      </td>
    </tr>
  );
}

/** Ligne de question dans l'écran de configuration (calquée sur la maquette). */
function ConfigRow({
  q,
  scope,
  onToggle,
  onEdit,
  onDelete,
}: {
  q: ResolvedQuestion;
  scope: Scope;
  onToggle?: () => void;
  onEdit?: (text: string) => void;
  onDelete?: () => void;
}) {
  const conds = condTexts(q);
  return (
    <div className={"qc-row" + (q.on ? "" : " off")}>
      <div className="qc-main">
        <div className="qc-line">
          <span className={"qc-chip " + scope}>{q.tag}</span>
          {onEdit ? (
            <input className="edit-inp" value={q.q} placeholder="Texte de la question…" onChange={(e) => onEdit(e.target.value)} style={{ flex: 1 }} />
          ) : (
            <span className="qc-q">{q.q}</span>
          )}
          {q.aide && (
            <span className="qc-help" title={q.aide}>
              <Icon name="help" size={14} />
            </span>
          )}
        </div>
        <div className="qc-meta">{describeType(q)}</div>
        <div className="qc-cond">
          {conds.length === 0 ? (
            scope === "coproprietaire" ? "Cette question concerne tous les copropriétaires." : "Cette question concerne tous les lots."
          ) : (
            <>
              Cette question se pose sous conditions :
              {conds.map((t) => (
                <span key={t} className="qc-cond-item">{t}</span>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="qc-ctrls">
        {onDelete && (
          <button className="q-del" onClick={onDelete} title="Supprimer cette question">
            <Icon name="trash" size={15} />
          </button>
        )}
        {q.locked ? (
          <span className="q-switch on locked" title="Question socle — toujours posée">
            <Icon name="lock" size={11} className="lock-ico" />
            <span className="knob"></span>
          </span>
        ) : (
          <button
            className={"q-switch" + (q.on ? " on" : "")}
            onClick={onToggle}
            title={q.on ? "Désactiver cette question" : "Activer cette question"}
          >
            <span className="knob"></span>
          </button>
        )}
      </div>
    </div>
  );
}

export function EnqueteTab({ c }: { c: CoproWithStats }) {
  const { data: enquete } = useEnquete(c.id);
  const { data: reponses } = useReponses(enquete?.id);
  const { data: donnees } = useDonnees(c.id);
  const { data: bareme } = useBareme();
  const updateEnquete = useUpdateEnquete(c.id);

  const [configuring, setConfiguring] = useState(false);
  const [draft, setDraft] = useState<ConfigItem[] | null>(null);
  const [cible, setCible] = useState<"tous" | "nonrep">("nonrep");
  const [parEmail, setParEmail] = useState(true);
  const [dateLimite, setDateLimite] = useState("");

  const coproprietaires = donnees?.coproprietaires ?? [];
  const total = coproprietaires.length;
  const repondus = useMemo(
    () => new Map((reponses ?? []).map((r) => [r.coproprietaire_id, r])),
    [reponses]
  );
  const repondants = (reponses ?? []).filter((r) => r.profil_mpr != null).length;
  const nonRep = Math.max(0, total - repondants);
  const destCount = cible === "tous" ? total : nonRep;
  const sent = enquete?.statut === "envoyee";

  const config: ConfigItem[] = draft ?? normalizeConfig(enquete?.questions);
  const resolved = resolveQuestions(config);
  const activeCount = resolved.filter((q) => q.on).length;
  const customs = resolved.filter((q) => q.custom);

  const profilCounts = PROFIL_META.map((m) => ({
    ...m,
    n: (reponses ?? []).filter((r) => r.profil_mpr === m.p).length,
  }));

  const toggleQ = (id: string) =>
    setDraft((prev) => (prev ?? config).map((it) => (it.id === id ? { ...it, on: !it.on } : it)));
  const editCustom = (id: string, text: string) =>
    setDraft((prev) => (prev ?? config).map((it) => (it.id === id ? { ...it, q: text } : it)));
  const removeCustom = (id: string) => setDraft((prev) => (prev ?? config).filter((it) => it.id !== id));
  const addCustom = () =>
    setDraft((prev) => [...(prev ?? config), { id: `custom-${crypto.randomUUID()}`, q: "", on: true, custom: true }]);

  const startConfig = () => {
    setDraft(config.map((it) => ({ ...it })));
    setConfiguring(true);
  };
  const saveConfig = async () => {
    if (enquete && draft) {
      const cleaned = draft.filter((it) => !it.custom || (it.q ?? "").trim() !== "");
      await updateEnquete.mutateAsync({ id: enquete.id, questions: cleaned });
    }
    setConfiguring(false);
    setDraft(null);
  };
  const cancelConfig = () => {
    setConfiguring(false);
    setDraft(null);
  };

  const doSend = async () => {
    if (!enquete) return;
    await updateEnquete.mutateAsync({ id: enquete.id, statut: "envoyee", sent_at: new Date().toISOString() });
  };

  if (!enquete) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  // ===== Mode configuration : écran pleine largeur =====
  if (configuring) {
    return (
      <div className="fade">
        <div className="panel">
          <div className="p-head">
            <Icon name="settings" size={18} />
            <h3>Configuration du questionnaire</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)", marginRight: 12 }}>
              {activeCount} question{activeCount > 1 ? "s" : ""} active{activeCount > 1 ? "s" : ""} sur {resolved.length}
            </span>
            <div className="edit-actions">
              <button className="se-btn se-btn-ghost btn-sm" onClick={cancelConfig}>
                Annuler
              </button>
              <button className="se-btn se-btn-primary btn-sm" onClick={() => void saveConfig()} disabled={updateEnquete.isPending}>
                <Icon name="check" size={15} />
                Terminer
              </button>
            </div>
          </div>
          <div className="p-body">
            <p className="se-small" style={{ marginTop: 0, marginBottom: 18, color: "var(--fg-muted)" }}>
              Activez les questions à poser aux copropriétaires. Les questions{" "}
              <Icon name="lock" size={11} style={{ verticalAlign: "-1px" }} /> socle sont toujours posées. Les conditions
              indiquées s'appliquent automatiquement côté portail : une question conditionnée n'apparaît que si la réponse
              correspondante est donnée.
            </p>

            {SECTIONS.map((section) => {
              const qs = resolved.filter((q) => q.section === section.id && !q.custom);
              const on = qs.filter((q) => q.on).length;
              return (
                <div key={section.id} className="qc-section">
                  <div className="qc-sec-head">
                    <div>
                      <h4>{section.label}</h4>
                      <span className="qc-sec-desc">{section.desc}</span>
                    </div>
                    <span className="qc-sec-count">
                      {on}/{qs.length} active{on > 1 ? "s" : ""}
                    </span>
                  </div>
                  {qs.map((q) => (
                    <ConfigRow key={q.id} q={q} scope={section.scope} onToggle={() => toggleQ(q.id)} />
                  ))}
                </div>
              );
            })}

            <div className="qc-section">
              <div className="qc-sec-head">
                <div>
                  <h4>Questions personnalisées</h4>
                  <span className="qc-sec-desc">Questions libres propres à cette copropriété (réponse en texte libre).</span>
                </div>
                <span className="qc-sec-count">{customs.length}</span>
              </div>
              {customs.map((q) => (
                <ConfigRow
                  key={q.id}
                  q={q}
                  scope="coproprietaire"
                  onToggle={() => toggleQ(q.id)}
                  onEdit={(text) => editCustom(q.id, text)}
                  onDelete={() => removeCustom(q.id)}
                />
              ))}
              <button className="se-btn se-btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={addCustom}>
                <Icon name="plus" size={15} />
                Ajouter une question
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== Vue normale =====
  return (
    <div className="detail-grid fade">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head">
            <Icon name="users" size={18} />
            <h3>Profils MaPrimeRénov'</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              {repondants}/{total} répondants
            </span>
          </div>
          <div className="p-body">
            {repondants === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Aucune réponse pour l'instant — saisissez les réponses ci-dessous ou lancez la campagne.
              </p>
            ) : (
              profilCounts.map((m) => {
                const pct = repondants ? Math.round((m.n / repondants) * 100) : 0;
                return (
                  <div key={m.p} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: m.color }}></span>
                        {m.label}
                      </span>
                      <span style={{ fontWeight: 700 }}>
                        {m.n} · {pct} %
                      </span>
                    </div>
                    <div className="prog">
                      <i style={{ width: pct + "%", background: m.color }}></i>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="panel">
          <div className="p-head">
            <Icon name="edit" size={18} />
            <h3>Réponses des copropriétaires</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              saisie AMO · profil calculé au barème Anah {bareme?.millesime ?? ""}
            </span>
          </div>
          <div className="p-body">
            {total === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Importez d'abord les copropriétaires (onglet Données de la copro).
              </p>
            ) : (
              <div className="tablewrap" style={{ maxHeight: 380, overflowY: "auto" }}>
                <table className="dossiers" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Copropriétaire</th>
                      <th>Foyer</th>
                      <th>Occupation</th>
                      <th>RFR (€)</th>
                      <th>Profil</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {coproprietaires.map((cp) => (
                      <ReponseRow
                        key={cp.id + (repondus.get(cp.id)?.updated_at ?? "")}
                        coproprietaireId={cp.id}
                        nom={cp.nom}
                        existing={repondus.get(cp.id) ?? null}
                        enqueteId={enquete.id}
                        coproId={c.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="p-head">
            <Icon name="clipboard" size={18} />
            <h3>Questionnaire d'enquête</h3>
            <span style={{ flex: 1 }}></span>
            <button className="se-btn se-btn-ghost btn-sm" onClick={startConfig}>
              <Icon name="settings" size={14} />
              Configurer
            </button>
          </div>
          <div className="p-body">
            {SECTIONS.map((section) => {
              const qs = resolved.filter((q) => q.section === section.id && !q.custom);
              const on = qs.filter((q) => q.on).length;
              return (
                <div className="kv" key={section.id}>
                  <span className="k">{section.label}</span>
                  <span className="v">
                    {on}/{qs.length} active{on > 1 ? "s" : ""}
                  </span>
                </div>
              );
            })}
            {customs.length > 0 && (
              <div className="kv">
                <span className="k">Questions personnalisées</span>
                <span className="v">
                  {customs.filter((q) => q.on).length}/{customs.length} active{customs.filter((q) => q.on).length > 1 ? "s" : ""}
                </span>
              </div>
            )}
            <p className="se-small" style={{ marginTop: 14, marginBottom: 0, color: "var(--fg-muted)" }}>
              {activeCount} question{activeCount > 1 ? "s" : ""} active{activeCount > 1 ? "s" : ""} sur {resolved.length} ·
              enquête sociale et technique diffusée via le portail copropriétaire.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head">
            <Icon name="send" size={18} />
            <h3>Envoi des questionnaires</h3>
          </div>
          <div className="p-body">
            {sent && (
              <div className="send-ok">
                <Icon name="checkCircle" size={18} />
                <div>
                  Campagne préparée le {fmtDate(enquete.sent_at)}
                  <span className="so-sub">L'envoi d'e-mails réel sera activé avec le portail copropriétaire.</span>
                </div>
              </div>
            )}
            <div className="send-field">
              <label>Destinataires</label>
              <div className="opt-mini">
                <button className={cible === "tous" ? "on" : ""} onClick={() => setCible("tous")}>
                  Tous · {total}
                </button>
                <button className={cible === "nonrep" ? "on" : ""} onClick={() => setCible("nonrep")}>
                  Non-répondants · {nonRep}
                </button>
              </div>
            </div>
            <div className="send-field">
              <label>Date limite de réponse</label>
              <input className="edit-inp" type="date" value={dateLimite} onChange={(e) => setDateLimite(e.target.value)} />
            </div>
            <label className="send-check">
              <input type="checkbox" checked={parEmail} onChange={(e) => setParEmail(e.target.checked)} />
              <span>Notifier aussi par e-mail (en plus du portail)</span>
            </label>
            <button
              className="se-btn se-btn-primary"
              style={{ width: "100%", marginTop: 16, justifyContent: "center" }}
              onClick={() => void doSend()}
              disabled={total === 0 || updateEnquete.isPending}
            >
              <Icon name="send" size={16} />
              {sent ? `Repréparer pour ${destCount} destinataires` : `Préparer l'envoi à ${destCount} copropriétaire${destCount > 1 ? "s" : ""}`}
            </button>
            <p className="se-small" style={{ marginTop: 10, color: "var(--fg-muted)" }}>
              Mode préparation : la campagne est enregistrée mais aucun e-mail n'est envoyé en V1.
            </p>
          </div>
        </div>

        <div className="panel">
          <div className="p-head">
            <Icon name="share" size={18} />
            <h3>Portail copropriétaire</h3>
          </div>
          <div className="p-body">
            <p className="se-body" style={{ fontSize: 14, marginTop: 0 }}>
              Espace individuel : enquête sociale, fichiers partagés et aides individuelles.
            </p>
            <div className="kv">
              <span className="k">Réponses saisies</span>
              <span className="v">{repondants}</span>
            </div>
            <div className="kv">
              <span className="k">Recensement</span>
              <span className="v">
                <Badge kind={sent ? "success" : "warn"}>{sent ? "Préparé" : "À préparer"}</Badge>
              </span>
            </div>
            <p className="se-small" style={{ marginTop: 14, color: "var(--fg-muted)" }}>
              La saisie complète du questionnaire par les copropriétaires arrive avec la prochaine étape du portail.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
