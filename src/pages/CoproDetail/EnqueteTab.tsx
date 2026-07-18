// Onglet Enquête sociale — porté de detail.jsx (EnqueteTab), branché sur les vraies tables.
// La saisie des réponses se fait par l'AMO en V1 ; l'envoi prépare la campagne
// (aucun e-mail réel n'est expédié — le portail copropriétaire arrive en phase 2).
import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { Profil } from "@/lib/finance";
import { useBareme } from "@/api/scenarios";
import { useDonnees } from "@/api/donnees";
import {
  useEnquete,
  useReponses,
  useSaveReponse,
  useUpdateEnquete,
  type Question,
} from "@/api/enquete";
import type { CoproWithStats } from "@/api/copros";

const PROFIL_META: { p: Profil; color: string }[] = [
  { p: "Bleu", color: "#2E6FA8" },
  { p: "Jaune", color: "#f2a30d" },
  { p: "Violet", color: "#7A5AE0" },
  { p: "Rose", color: "#DC6FA8" },
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
  const color = PROFIL_META.find((m) => m.p === profil)?.color;

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
        {profil ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: color }}></span>
            {profil}
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

export function EnqueteTab({ c }: { c: CoproWithStats }) {
  const { data: enquete } = useEnquete(c.id);
  const { data: reponses } = useReponses(enquete?.id);
  const { data: donnees } = useDonnees(c.id);
  const updateEnquete = useUpdateEnquete(c.id);

  const [configuring, setConfiguring] = useState(false);
  const [draftQ, setDraftQ] = useState<Question[] | null>(null);
  const [cible, setCible] = useState<"tous" | "nonrep">("nonrep");
  const [parEmail, setParEmail] = useState(true);
  const [dateLimite, setDateLimite] = useState("");
  const qBak = useRef<Question[]>([]);

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

  const questions: Question[] = draftQ ?? ((enquete?.questions as unknown as Question[]) ?? []);
  const activeCount = questions.filter((q) => q.on).length;

  const profilCounts = PROFIL_META.map((m) => ({
    ...m,
    n: (reponses ?? []).filter((r) => r.profil_mpr === m.p).length,
  }));

  const setQ = (id: number, patch: Partial<Question>) =>
    setDraftQ((prev) => (prev ?? questions).map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const removeQ = (id: number) => setDraftQ((prev) => (prev ?? questions).filter((q) => q.id !== id));
  const addQ = () =>
    setDraftQ((prev) => [
      ...(prev ?? questions),
      { id: Math.max(0, ...(prev ?? questions).map((q) => q.id)) + 1, q: "Nouvelle question", type: "Texte libre", on: true, req: false },
    ]);
  const startConfig = () => {
    qBak.current = questions.map((q) => ({ ...q }));
    setDraftQ(questions.map((q) => ({ ...q })));
    setConfiguring(true);
  };
  const saveConfig = async () => {
    if (enquete && draftQ) await updateEnquete.mutateAsync({ id: enquete.id, questions: draftQ });
    setConfiguring(false);
    setDraftQ(null);
  };
  const cancelConfig = () => {
    setConfiguring(false);
    setDraftQ(null);
  };

  const doSend = async () => {
    if (!enquete) return;
    await updateEnquete.mutateAsync({ id: enquete.id, statut: "envoyee", sent_at: new Date().toISOString() });
  };

  if (!enquete) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

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
                        {m.p}
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
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>saisie AMO · profil calculé au barème 2024</span>
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
            <h3>Questionnaire d'enquête sociale</h3>
            <span style={{ flex: 1 }}></span>
            {configuring ? (
              <div className="edit-actions">
                <button className="se-btn se-btn-ghost btn-sm" onClick={cancelConfig}>
                  Annuler
                </button>
                <button className="se-btn se-btn-primary btn-sm" onClick={() => void saveConfig()}>
                  <Icon name="check" size={15} />
                  Terminer
                </button>
              </div>
            ) : (
              <button className="se-btn se-btn-ghost btn-sm" onClick={startConfig}>
                <Icon name="settings" size={14} />
                Configurer
              </button>
            )}
          </div>
          <div className="p-body">
            <div className="q-list">
              {questions.map((q, i) => (
                <div key={q.id} className={"q-row" + (!q.on && !configuring ? " off" : "")}>
                  <span className="q-num">{i + 1}</span>
                  <div className="q-main">
                    {configuring ? (
                      <input className="edit-inp" value={q.q} onChange={(e) => setQ(q.id, { q: e.target.value })} />
                    ) : (
                      <div className="q-label">{q.q}</div>
                    )}
                    <div className="q-type">{q.type}</div>
                  </div>
                  {configuring ? (
                    <div className="q-ctrls">
                      <button className={"q-pill" + (q.req ? " on" : "")} onClick={() => setQ(q.id, { req: !q.req })} title="Réponse obligatoire">
                        Oblig.
                      </button>
                      <button className={"q-switch" + (q.on ? " on" : "")} onClick={() => setQ(q.id, { on: !q.on })} title={q.on ? "Désactiver" : "Activer"}>
                        <span className="knob"></span>
                      </button>
                      <button className="q-del" onClick={() => removeQ(q.id)} title="Supprimer">
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="q-badges">
                      {q.req && <Badge kind="neutral">Obligatoire</Badge>}
                      <Badge kind={q.on ? "success" : "neutral"} dot={q.on}>
                        {q.on ? "Actif" : "Inactif"}
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {configuring && (
              <button className="se-btn se-btn-secondary btn-sm" style={{ marginTop: 14 }} onClick={addQ}>
                <Icon name="plus" size={15} />
                Ajouter une question
              </button>
            )}
            {!configuring && (
              <p className="se-small" style={{ marginTop: 14, color: "var(--fg-muted)" }}>
                {activeCount} question{activeCount > 1 ? "s" : ""} active{activeCount > 1 ? "s" : ""} sur {questions.length} · diffusées via le
                portail copropriétaire (phase 2).
              </p>
            )}
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
              Le portail copropriétaire sera construit en phase 2, sur le même socle.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
