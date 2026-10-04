// Onglet Enquête sociale & technique (AMO).
// Le questionnaire est configuré depuis le catalogue (src/lib/enqueteCatalogue.ts) :
// l'AMO active/désactive chaque question ; les questions socle (identité, usage des
// lots) sont verrouillées. Les conditions d'affichage sont montrées à titre informatif -
// elles s'appliquent côté portail copropriétaire au moment de la saisie.
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { Profil } from "@/lib/finance";
import { useBareme } from "@/api/scenarios";
import { useDonnees } from "@/api/donnees";
import { useEnquete, useReponses, useSaveReponse, useUpdateEnquete, useVerifierProfil } from "@/api/enquete";
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
import { useGenererRapportEnquete } from "@/api/rapportEnquete";
import { useFicheEtat } from "@/api/ficheEtat";
import { useEspacesCoproprietaires, type EtatEspace } from "@/api/espaces";
import { OuvrirEspacesFenetre } from "@/components/EspacesCoproprietaires";
import { classerDestinataires, texteEmailEnquete } from "@/lib/emailEnquete";
import { EmailEnqueteFenetre, EnvoyerEnqueteFenetre } from "./EnqueteEmail";

// Libellés grand public (plafonds Anah) - les couleurs MPR restent un simple repère visuel.
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
  existing: {
    nb_personnes: number | null;
    statut_occupation: string | null;
    rfr: number | null;
    profil_mpr: string | null;
    profil_statut?: string;
    profil_verifie_le?: string | null;
  } | null;
  enqueteId: string;
  coproId: string;
}) {
  const { data: bareme } = useBareme();
  const save = useSaveReponse(enqueteId, coproId);
  const verifier = useVerifierProfil(enqueteId, coproId);
  const [nb, setNb] = useState<string>(existing?.nb_personnes?.toString() ?? "");
  const [statut, setStatut] = useState<string>(existing?.statut_occupation ?? "");
  const [rfr, setRfr] = useState<string>(existing?.rfr?.toString() ?? "");
  const dirty =
    nb !== (existing?.nb_personnes?.toString() ?? "") ||
    statut !== (existing?.statut_occupation ?? "") ||
    rfr !== (existing?.rfr?.toString() ?? "");
  const verifie = existing?.profil_statut === "verifie" && !!existing?.profil_verifie_le;

  const doSave = () => {
    if (!bareme) return;
    // Saisie AMO d'après l'avis d'imposition : le profil reste au statut courant
    // (vérifié si déjà vérifié) ; la case « Vérifié » se coche à part.
    void save.mutateAsync({
      coproprietaireId,
      nbPersonnes: nb === "" ? null : Number(nb),
      statutOccupation: statut || null,
      rfr: rfr === "" ? null : Number(rfr),
      bareme,
      verifie,
    });
  };

  const profil = existing?.profil_mpr as Profil | null;
  const meta = PROFIL_META.find((m) => m.p === profil);

  return (
    <tr style={{ cursor: "default" }}>
      <td style={{ fontWeight: 600 }}>{nom}</td>
      <td>
        <input className="edit-inp sm" type="number" min="1" value={nb} placeholder="-" onChange={(e) => setNb(e.target.value)} style={{ width: 64 }} />
      </td>
      <td>
        <select className="edit-inp" value={statut} onChange={(e) => setStatut(e.target.value)}>
          <option value="">-</option>
          <option value="occupant">Occupant</option>
          <option value="bailleur">Bailleur</option>
        </select>
      </td>
      <td>
        <input className="edit-inp sm" type="number" min="0" value={rfr} placeholder="-" onChange={(e) => setRfr(e.target.value)} style={{ width: 100 }} />
      </td>
      <td>
        {meta ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: meta.color }}></span>
            {meta.label}
          </span>
        ) : (
          <span style={{ color: "var(--fg-muted)" }}>-</span>
        )}
      </td>
      <td>
        {profil ? (
          <label
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
            title={verifie ? `Vérifié sur l'avis d'imposition le ${fmtDate(existing?.profil_verifie_le)}` : "Déclaré par le copropriétaire (ou saisi) - cochez après contrôle de l'avis d'imposition : l'avis déposé passe alors « validé »"}
          >
            <input
              type="checkbox"
              checked={verifie}
              disabled={verifier.isPending}
              onChange={(e) => verifier.mutate({ coproprietaireId, verifie: e.target.checked })}
            />
            {verifie ? "Vérifié" : "Déclaratif"}
          </label>
        ) : (
          <span style={{ color: "var(--fg-muted)" }}>-</span>
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

/**
 * Date limite de réponse, enregistrée dès qu'elle change (0136) : elle est
 * rappelée dans l'e-mail du questionnaire.
 */
function DateLimiteChamp({ enqueteId, coproId, valeur }: { enqueteId: string; coproId: string; valeur: string | null }) {
  const update = useUpdateEnquete(coproId);
  const [date, setDate] = useState(valeur ?? "");
  return (
    <input
      className="edit-inp"
      type="date"
      value={date}
      onChange={(e) => {
        const v = e.target.value;
        setDate(v);
        if (v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v)) update.mutate({ id: enqueteId, date_limite: v || null });
      }}
    />
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
          <span className="q-switch on locked" title="Question socle - toujours posée">
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
  // feedback Amir du 23/09/2026 : le rapport se génère d'ici et alimente la fiche État ANAH
  const rapport = useGenererRapportEnquete(c);
  const { data: ficheEtat } = useFicheEtat(c.id);
  const dernierRapport = ficheEtat?.data.occupation?.genereLe ?? null;

  const [configuring, setConfiguring] = useState(false);
  const [draft, setDraft] = useState<ConfigItem[] | null>(null);
  const [cible, setCible] = useState<"tous" | "nonrep">("nonrep");
  // e-mail du questionnaire vérifié et modifiable avant l'envoi - idée d'Amir du 04/10/2026
  const [fenetreEmail, setFenetreEmail] = useState(false);
  const [fenetreEnvoi, setFenetreEnvoi] = useState(false);
  // espaces copropriétaires (portail) - feedback d'Amir du 30/09/2026
  const { data: espaces } = useEspacesCoproprietaires(c.id);
  const [fenetreEspaces, setFenetreEspaces] = useState(false);

  const coproprietaires = donnees?.coproprietaires ?? [];
  const compteEspaces = (etat: EtatEspace) => coproprietaires.filter((cp) => espaces?.get(cp.id)?.etat === etat).length;
  const espacesACreer = coproprietaires.filter((cp) => espaces?.get(cp.id)?.etat === "a_creer");
  const total = coproprietaires.length;
  const repondus = useMemo(
    () => new Map((reponses ?? []).map((r) => [r.coproprietaire_id, r])),
    [reponses]
  );
  const repondants = (reponses ?? []).filter((r) => r.profil_mpr != null).length;
  const sent = enquete?.statut === "envoyee";
  const aRepondu = (id: string) => repondus.get(id)?.profil_mpr != null;
  const presents = coproprietaires.filter((cp) => !cp.sortant_le);
  const nonRep = presents.filter((cp) => !aRepondu(cp.id)).length;
  const classement = classerDestinataires(coproprietaires, espaces, cible, aRepondu);
  const destCount = classement.envoyables.length;

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

  if (!enquete) return <div style={{ padding: 30, color: "var(--fg-muted)" }}>Chargement…</div>;

  const texteEmail = texteEmailEnquete(enquete, c.name);
  const laisses = classement.sansEmail + classement.emailPris;
  const resumeEnvoi =
    classement.retenues === 0
      ? cible === "nonrep"
        ? "Tous les copropriétaires ont répondu."
        : "Aucun copropriétaire dans ce dossier."
      : [
          classement.avecEspace > 0 && `${classement.avecEspace} avec un espace activé : lien vers l'enquête`,
          classement.sansEspace > 0 && `${classement.sansEspace} sans espace activé : lien pour choisir leur mot de passe`,
          laisses > 0 && `${laisses} sans adresse utilisable, laissé${laisses > 1 ? "s" : ""} de côté`,
        ]
          .filter(Boolean)
          .join(" · ") + ".";

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
            <span style={{ fontSize: 13, color: "var(--fg-muted)", marginRight: 10 }}>
              {repondants}/{total} répondants
            </span>
            <button
              className="se-btn se-btn-primary btn-sm"
              title="Classeur Excel : synthèse, profils Anah, occupation, détail par copropriétaire et par lot - les chiffres d'occupation sont reportés dans la fiche État ANAH"
              disabled={total === 0 || !rapport.pret || rapport.enCours}
              onClick={() => void rapport.generer()}
            >
              <Icon name="download" size={14} />
              {rapport.enCours ? "Génération…" : "Générer le rapport d'enquête sociale"}
            </button>
          </div>
          <div className="p-body">
            <p className="se-small" style={{ marginTop: 0, marginBottom: 14, color: "var(--fg-muted)" }}>
              {dernierRapport
                ? `Dernier rapport généré le ${fmtDate(dernierRapport)} - ses chiffres d'occupation sont reportés dans la fiche « État de la copropriété » du dossier ANAH.`
                : "La génération du rapport reporte aussi l'occupation (propriétaires occupants et bailleurs, tantièmes, ménages modestes) dans la fiche « État de la copropriété » du dossier ANAH."}
            </p>
            {rapport.erreur && (
              <p className="se-small" style={{ marginTop: 0, color: "var(--color-error-700)" }}>
                {rapport.erreur}
              </p>
            )}
            {repondants === 0 ? (
              <p className="se-body" style={{ margin: 0, color: "var(--fg-muted)" }}>
                Aucune réponse pour l'instant - saisissez les réponses ci-dessous ou lancez la campagne.
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
                      <th title="Revenu fiscal de référence de l'avis d'imposition N-1">RFR avis N-1 (€)</th>
                      <th>Profil</th>
                      <th title="Déclaratif = déclaré par le copropriétaire ; Vérifié = contrôlé par l'AMO sur l'avis d'imposition">Statut</th>
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
            {enquete.email_envoye_le ? (
              <div className="send-ok">
                <Icon name="checkCircle" size={18} />
                <div>
                  Questionnaire envoyé le {fmtDate(enquete.email_envoye_le)}
                  <span className="so-sub">
                    {enquete.email_envoye_nb ?? 0} e-mail{(enquete.email_envoye_nb ?? 0) > 1 ? "s" : ""} parti
                    {(enquete.email_envoye_nb ?? 0) > 1 ? "s" : ""} lors du dernier envoi. Relancez les non-répondants au
                    besoin.
                  </span>
                </div>
              </div>
            ) : (
              sent && (
                <div className="send-ok">
                  <Icon name="checkCircle" size={18} />
                  <div>
                    Campagne préparée le {fmtDate(enquete.sent_at)}
                    <span className="so-sub">Aucun e-mail n'est encore parti vers les copropriétaires.</span>
                  </div>
                </div>
              )
            )}
            <div className="send-field">
              <label>Destinataires</label>
              <div className="opt-mini">
                <button className={cible === "tous" ? "on" : ""} onClick={() => setCible("tous")}>
                  Tous · {presents.length}
                </button>
                <button className={cible === "nonrep" ? "on" : ""} onClick={() => setCible("nonrep")}>
                  Non-répondants · {nonRep}
                </button>
              </div>
            </div>
            <div className="send-field">
              <label>Date limite de réponse</label>
              <DateLimiteChamp enqueteId={enquete.id} coproId={c.id} valeur={enquete.date_limite} />
            </div>
            <div className="send-field">
              <label>E-mail aux copropriétaires</label>
              <div className="mail-ligne" style={{ alignItems: "flex-start" }}>
                <Icon name="mail" size={16} style={{ color: "var(--accent)", flex: "none", marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{texteEmail.sujet}</div>
                  <div className="mail-ligne-pied">
                    <span>{texteEmail.modifie ? "Texte modifié" : "Texte proposé"}</span>
                    <button
                      className="se-btn se-btn-ghost btn-sm"
                      onClick={() => setFenetreEmail(true)}
                      title="Relire l'e-mail envoyé aux copropriétaires et le modifier si nécessaire"
                    >
                      <Icon name="eye" size={14} />
                      Vérifier l'e-mail
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <button
              className="se-btn se-btn-primary"
              style={{ width: "100%", marginTop: 4, justifyContent: "center" }}
              onClick={() => setFenetreEnvoi(true)}
              disabled={destCount === 0 || !espaces}
            >
              <Icon name="send" size={16} />
              {`Envoyer à ${destCount} copropriétaire${destCount > 1 ? "s" : ""}`}
            </button>
            <p className="se-small" style={{ marginTop: 10, marginBottom: 0, color: "var(--fg-muted)" }}>
              {resumeEnvoi}
            </p>
            {fenetreEnvoi && (
              <EnvoyerEnqueteFenetre
                enquete={enquete}
                copro={c.name}
                coproId={c.id}
                classement={classement}
                onVerifier={() => setFenetreEmail(true)}
                onClose={() => setFenetreEnvoi(false)}
              />
            )}
            {fenetreEmail && (
              <EmailEnqueteFenetre
                enquete={enquete}
                copro={c.name}
                coproId={c.id}
                exemples={classement.envoyables}
                onClose={() => setFenetreEmail(false)}
              />
            )}
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
              <span className="k">Espaces activés</span>
              <span className="v">{compteEspaces("actif")}</span>
            </div>
            <div className="kv">
              <span className="k" title="E-mail d'activation envoyé, lien pas encore utilisé">Invitations en attente</span>
              <span className="v">{compteEspaces("invite")}</span>
            </div>
            <div className="kv">
              <span className="k">Espaces à créer</span>
              <span className="v">{compteEspaces("a_creer")}</span>
            </div>
            {compteEspaces("sans_email") + compteEspaces("email_pris") > 0 && (
              <div className="kv">
                <span className="k" title="Sans adresse e-mail, ou adresse déjà utilisée par un compte Strat Eco, syndic ou prestataire">
                  Sans adresse utilisable
                </span>
                <span className="v">{compteEspaces("sans_email") + compteEspaces("email_pris")}</span>
              </div>
            )}
            <div className="kv">
              <span className="k">Réponses saisies</span>
              <span className="v">{repondants}</span>
            </div>
            <div className="kv">
              <span className="k">Questionnaire</span>
              <span className="v">
                <Badge kind={enquete.email_envoye_le ? "success" : "warn"}>
                  {enquete.email_envoye_le ? "Envoyé" : sent ? "Préparé" : "À envoyer"}
                </Badge>
              </span>
            </div>
            <button
              className="se-btn se-btn-secondary"
              style={{ width: "100%", marginTop: 14, justifyContent: "center" }}
              disabled={espacesACreer.length === 0}
              onClick={() => setFenetreEspaces(true)}
              title="Envoie aux copropriétaires qui n'ont pas encore d'espace un e-mail avec un lien pour choisir leur mot de passe"
            >
              <Icon name="send" size={16} />
              Créer les espaces manquants · {espacesACreer.length}
            </button>
            <p className="se-small" style={{ marginTop: 10, marginBottom: 0, color: "var(--fg-muted)" }}>
              Une fiche à la fois depuis l'onglet Copropriétaires (création ou renvoi de l'invitation).
            </p>
            {fenetreEspaces && (
              <OuvrirEspacesFenetre
                coproId={c.id}
                cibles={espacesACreer.map((cp) => ({ id: cp.id, nom: cp.nom, email: cp.email }))}
                ignores={{ sansEmail: compteEspaces("sans_email"), emailPris: compteEspaces("email_pris") }}
                onClose={() => setFenetreEspaces(false)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
