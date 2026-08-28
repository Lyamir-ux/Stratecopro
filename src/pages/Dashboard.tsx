// Tableau de bord AMO - porté de design-reference/project/dashboard.jsx
// Vues Kanban / Galerie / Tableau, KPI, filtres phase & secteur fonctionnels.
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useCrumbs } from "@/components/Shell/useCrumbs";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Avatar, Badge, DpePair, PhaseBadge, Progress, ThumbSlot } from "@/components/ui";
import { PHASES, type DpeClass, type PhaseId } from "@/lib/referentiels";
import { fmtEuro } from "@/lib/format";
import { useUi } from "@/stores/ui";
import {
  avancementAmo,
  nbLogements,
  notifierPassation,
  useCopros,
  useCoprosCorbeille,
  useCreateCopro,
  usePhotoUrl,
  useRestaurerCopro,
  useSupprimerDefinitivement,
  type CoproWithStats,
} from "@/api/copros";
import { useTeamProfiles } from "@/api/profiles";
import { fmtDate } from "@/lib/format";
import { uploadFichierDirect } from "@/api/fichiers";

function TeamStack({ team }: { team: CoproWithStats["team"] }) {
  return (
    <span className="avatar-stack">
      {team.map((m) => (
        <Avatar key={m.user_id} who={m.initials} name={m.full_name} sm />
      ))}
    </span>
  );
}

function CoproCard({ c, showProgress }: { c: CoproWithStats; showProgress: boolean }) {
  const navigate = useNavigate();
  const { data: photoUrl } = usePhotoUrl(c.photo_path);
  const s = c.stats;
  return (
    <article className="copro-card fade">
      <ThumbSlot photoUrl={photoUrl} placeholder={c.name} />
      <div style={{ position: "relative" }}>
        <div className="cc-body" style={{ cursor: "pointer" }} onClick={() => navigate(`/copros/${c.id}`)}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 className="cc-name">{c.name}</h3>
              <div className="cc-loc">
                <Icon name="mapPin" size={14} />
                {c.adresse || [c.code_postal, c.city].filter(Boolean).join(" ") || "Adresse à renseigner"}
              </div>
            </div>
            <DpePair before={c.energy_before as DpeClass | null} after={c.energy_after as DpeClass | null} />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {c.fragile && (
              <Badge kind="warn">
                <Icon name="alert" size={12} />
                Fragile
              </Badge>
            )}
            {c.gain_pct != null && (
              <Badge kind="primary">
                <Icon name="trendingUp" size={12} />+{c.gain_pct}%
              </Badge>
            )}
            {s?.scenario && <Badge kind="neutral">{s.scenario}</Badge>}
          </div>

          <div className="cc-meta">
            <div className="m">
              <span className="v">{nbLogements(c)}</span>
              <span className="l">logement{nbLogements(c) > 1 ? "s" : ""}</span>
            </div>
            <div className="m">
              <span className="v">{s?.coproprietaires ?? 0}</span>
              <span className="l">copropriétaires</span>
            </div>
            <div className="m">
              <span className="v">{s?.batiments ?? 0}</span>
              <span className="l">
                {c.denomination_batiments === "entree" ? "entrée" : "bâtiment"}
                {(s?.batiments ?? 0) > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {showProgress && (
            <div className="cc-prog-row">
              <div className="lab">
                <span>Avancement</span>
                <span>{avancementAmo(c)}%</span>
              </div>
              <Progress value={avancementAmo(c)} blue={c.phase === "etudes"} />
            </div>
          )}

          {s?.next_task && (
            <div className="cc-next">
              <Icon name="checkCircle" size={15} className="ico" />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Prochaine étape · {s.next_task}
              </span>
            </div>
          )}

          <div className="cc-foot">
            <TeamStack team={c.team} />
            <span className="spacer"></span>
            {s?.montant_ttc != null ? (
              <span className="montant">{fmtEuro(s.montant_ttc)}</span>
            ) : (
              <span className="updated">Non chiffré</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function KanbanView({ copros, showProgress }: { copros: CoproWithStats[]; showProgress: boolean }) {
  const dotColor: Record<PhaseId, string> = {
    diagnostic: "var(--color-neutral-400)",
    etudes: "var(--color-secondary-500)",
    travaux: "var(--color-primary-500)",
  };
  return (
    <div className="kanban">
      {PHASES.map((ph) => {
        const list = copros.filter((c) => c.phase === ph.id);
        return (
          <section className="kcol" key={ph.id}>
            <div className="kcol-head">
              <span className="kdot" style={{ background: dotColor[ph.id] }}></span>
              <span className="ktitle">{ph.label}</span>
              <span className="kcount">{list.length}</span>
            </div>
            <div className="kcol-body">
              {list.map((c) => (
                <CoproCard key={c.id} c={c} showProgress={showProgress} />
              ))}
              {list.length === 0 && (
                <div style={{ padding: 18, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>
                  Aucun dossier
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function GalleryView({ copros, showProgress }: { copros: CoproWithStats[]; showProgress: boolean }) {
  return (
    <div className="gallery">
      {copros.map((c) => (
        <CoproCard key={c.id} c={c} showProgress={showProgress} />
      ))}
    </div>
  );
}

function TableView({ copros }: { copros: CoproWithStats[] }) {
  const navigate = useNavigate();
  return (
    <div className="tablewrap fade">
      <table className="dossiers">
        <thead>
          <tr>
            <th>Copropriété</th>
            <th>Phase</th>
            <th>DPE</th>
            <th>Logements</th>
            <th>Copro.</th>
            <th>Montant TTC</th>
            <th>Avancement</th>
            <th>Équipe</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {copros.map((c) => (
            <tr key={c.id} onClick={() => navigate(`/copros/${c.id}`)}>
              <td>
                <div className="td-name">
                  <span className="td-thumb">
                    <Icon name="building" size={18} />
                  </span>
                  <div>
                    <div className="nm">{c.name}</div>
                    <div className="sub">{c.city ?? ""}</div>
                  </div>
                </div>
              </td>
              <td>
                <PhaseBadge phase={c.phase} />
              </td>
              <td>
                <DpePair before={c.energy_before as DpeClass | null} after={c.energy_after as DpeClass | null} />
              </td>
              <td style={{ fontWeight: 600 }}>{nbLogements(c)}</td>
              <td>{c.stats?.coproprietaires ?? 0}</td>
              <td style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{fmtEuro(c.stats?.montant_ttc)}</td>
              <td>
                <div className="td-prog">
                  <span className="pct">{avancementAmo(c)}%</span>
                  <div style={{ flex: 1 }}>
                    <Progress value={avancementAmo(c)} blue={c.phase === "etudes"} />
                  </div>
                </div>
              </td>
              <td>
                {/* Chef de projet (vert) et syndic (bleu) - deux couleurs distinctes sur tous les projets */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                  {c.chef_projet ? (
                    <span title="Chef de projet">
                      <Badge kind="primary">{c.chef_projet}</Badge>
                    </span>
                  ) : null}
                  {c.syndic_name ? (
                    <span title={c.gestionnaire_nom ? "Syndic - gestionnaire en charge" : "Syndic"}>
                      <Badge kind="blue">
                        {c.gestionnaire_nom ? `${c.syndic_name} - ${c.gestionnaire_nom}` : c.syndic_name}
                      </Badge>
                    </span>
                  ) : null}
                  {!c.chef_projet && !c.syndic_name && (
                    <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>-</span>
                  )}
                </div>
              </td>
              <td>
                <Icon name="chevronRight" size={18} style={{ color: "var(--fg-muted)" }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KpiStrip({ copros }: { copros: CoproWithStats[] }) {
  const logements = copros.reduce((s, c) => s + nbLogements(c), 0);
  const coproTotal = copros.reduce((s, c) => s + (c.stats?.coproprietaires ?? 0), 0);
  const montant = copros.reduce((s, c) => s + (c.stats?.montant_ttc ?? 0), 0);
  const gains = copros.filter((c) => c.gain_pct != null);
  const gainMoy = gains.length ? Math.round(gains.reduce((s, c) => s + (c.gain_pct ?? 0), 0) / gains.length) : null;
  const kpis = [
    { ico: "building" as const, label: "Dossiers actifs", val: String(copros.length), foot: <>sur les 3 phases</>, blue: false },
    { ico: "users" as const, label: "Copropriétaires accompagnés", val: String(coproTotal), foot: <>{logements} logements au total</>, blue: true },
    {
      ico: "euro" as const,
      label: "Montant de travaux",
      val: (montant / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " M€",
      foot: <>TTC engagés</>,
      blue: false,
    },
    {
      ico: "trendingUp" as const,
      label: "Gain énergétique moyen",
      val: gainMoy != null ? gainMoy + " %" : "-",
      foot:
        gainMoy != null && gainMoy >= 35 ? (
          <span>
            <span className="up">↑</span> au-dessus du seuil 35 %
          </span>
        ) : (
          <>gain non évalué</>
        ),
      blue: false,
    },
  ];
  return (
    <div className="kpis">
      {kpis.map((k, i) => (
        <div className="kpi fade" key={i}>
          <div className="k-top">
            <span className={"k-ico" + (k.blue ? " blue" : "")}>
              <Icon name={k.ico} size={19} />
            </span>
            <span className="k-label">{k.label}</span>
          </div>
          <div className="k-val">{k.val}</div>
          <div className="k-foot">{k.foot}</div>
        </div>
      ))}
    </div>
  );
}

const DPE_CLASSES: DpeClass[] = ["A", "B", "C", "D", "E", "F", "G"];

function NewCoproDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateCopro();
  const { data: team } = useTeamProfiles();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    nb_batiments: 1,
    batiment_adresses: [] as string[],
    city: "",
    code_postal: "",
    adresse: "",
    syndic_name: "",
    gestionnaire_nom: "",
    gestionnaire_email: "",
    nb_logements: "" as string,
    chef_projet: "",
    phase: "diagnostic" as PhaseId,
    energy_before: "" as string,
    fragile: false,
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  // Documents de passation joints à la création - déposés dans le dossier « Passation »
  const [passation, setPassation] = useState<File[]>([]);
  const passationRef = useRef<HTMLInputElement>(null);
  const nbBats = Math.max(1, form.nb_batiments || 1);
  const setBatAdresse = (i: number, v: string) =>
    setForm((f) => {
      const adresses = [...f.batiment_adresses];
      adresses[i] = v;
      return { ...f, batiment_adresses: adresses };
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const copro = await create.mutateAsync({
      ...form,
      nb_batiments: nbBats,
      nb_logements: form.nb_logements ? Number(form.nb_logements) : null,
      energy_before: form.energy_before || null,
    });
    // Le chef de projet désigné à la création est alerté par e-mail
    // (edge notifier-passation) - sans bloquer la création du dossier.
    if (form.chef_projet.trim()) {
      void notifierPassation(copro.id, null, form.chef_projet.trim());
    }
    // Dépôt des documents de passation dans les fichiers du dossier créé.
    // Le dossier existe déjà : en cas d'échec d'un dépôt on continue quand même,
    // les pièces se redéposent depuis l'onglet Fichiers.
    const rates: string[] = [];
    for (const f of passation) {
      try {
        await uploadFichierDirect(copro.id, f, "Passation");
      } catch {
        rates.push(f.name);
      }
    }
    if (rates.length > 0) {
      window.alert(`Dossier créé, mais document(s) de passation non déposé(s) : ${rates.join(", ")}. Redéposez-les depuis l'onglet Fichiers (dossier Passation).`);
    }
    onClose();
    navigate(`/copros/${copro.id}`);
  };

  const field = (label: string, input: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>{label}</label>
      {input}
    </div>
  );

  return (
    <Modal title="Nouvelle copropriété" onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          {field(
            "Nom de la copropriété *",
            <input className="login-input" required value={form.name} onChange={(e) => set({ name: e.target.value })} />
          )}
          {field(
            "Nombre de bâtiments *",
            <input
              className="login-input"
              type="number"
              min={1}
              required
              value={form.nb_batiments}
              onChange={(e) => set({ nb_batiments: Math.max(1, Number(e.target.value) || 1) })}
            />
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {field("Ville", <input className="login-input" value={form.city} onChange={(e) => set({ city: e.target.value })} />)}
          {field(
            "Code postal",
            <input
              className="login-input"
              inputMode="numeric"
              autoComplete="postal-code"
              value={form.code_postal}
              onChange={(e) => set({ code_postal: e.target.value })}
            />
          )}
        </div>
        {field(
          nbBats > 1 ? "Adresse de la copropriété" : "Adresse",
          <input className="login-input" value={form.adresse} onChange={(e) => set({ adresse: e.target.value })} />
        )}
        {nbBats > 1 && (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            <span className="se-eyebrow" style={{ color: "var(--fg-muted)" }}>
              Adresse de chaque bâtiment
            </span>
            {Array.from({ length: nbBats }, (_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, width: 56, flex: "none" }}>
                  Bât. {String(i + 1).padStart(2, "0")}
                </span>
                <input
                  className="login-input"
                  placeholder="Adresse du bâtiment"
                  value={form.batiment_adresses[i] ?? ""}
                  onChange={(e) => setBatAdresse(i, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}
        {field(
          "Syndic (société en charge de la gestion)",
          <input className="login-input" value={form.syndic_name} onChange={(e) => set({ syndic_name: e.target.value })} />
        )}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <span className="se-eyebrow" style={{ color: "var(--fg-muted)" }}>
            Gestionnaire de la copropriété
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {field(
              "Nom du gestionnaire",
              <input
                className="login-input"
                value={form.gestionnaire_nom}
                onChange={(e) => set({ gestionnaire_nom: e.target.value })}
              />
            )}
            {field(
              "Adresse mail",
              <input
                className="login-input"
                type="email"
                value={form.gestionnaire_email}
                onChange={(e) => set({ gestionnaire_email: e.target.value })}
              />
            )}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {field(
            "Nombre de logements",
            <input
              className="login-input"
              type="number"
              min={0}
              placeholder="Avant l'import des lots"
              value={form.nb_logements}
              onChange={(e) => set({ nb_logements: e.target.value })}
            />
          )}
          {field(
            "Chef de projet",
            <>
              {/* Suggestions = comptes collaborateurs : un nom reconnu reçoit l'e-mail de passation */}
              <input
                className="login-input"
                list="chefs-projet-suggestions-creation"
                value={form.chef_projet}
                onChange={(e) => set({ chef_projet: e.target.value })}
              />
              <datalist id="chefs-projet-suggestions-creation">
                {(team ?? []).map((p) => (
                  <option key={p.user_id} value={p.full_name} />
                ))}
              </datalist>
            </>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {field(
            "Phase de départ",
            <select
              className="login-input"
              value={form.phase}
              onChange={(e) => set({ phase: e.target.value as PhaseId })}
            >
              {PHASES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
          {field(
            "Étiquette énergétique actuelle",
            <select
              className="login-input"
              value={form.energy_before}
              onChange={(e) => set({ energy_before: e.target.value })}
            >
              <option value="">Non connue</option>
              {DPE_CLASSES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>
            Documents de passation{" "}
            <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
              · optionnel - déposés dans les fichiers du dossier (Passation)
            </span>
          </label>
          <input
            ref={passationRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const nouveaux = Array.from(e.target.files ?? []);
              if (nouveaux.length) setPassation((prev) => [...prev, ...nouveaux]);
              e.target.value = "";
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {passation.map((f, i) => (
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
                  type="button"
                  className="icon-btn"
                  title="Retirer"
                  onClick={() => setPassation((prev) => prev.filter((_, j) => j !== i))}
                  style={{ width: 18, height: 18 }}
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
            <button
              type="button"
              className="se-btn se-btn-secondary btn-sm"
              onClick={() => passationRef.current?.click()}
            >
              <Icon name="upload" size={14} />
              Joindre les documents de passation
            </button>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--fg2)" }}>
          <input type="checkbox" checked={form.fragile} onChange={(e) => set({ fragile: e.target.checked })} />
          Copropriété fragile (taux d'impayés &gt; 8 %)
        </label>
        {create.isError && (
          <p style={{ color: "var(--color-error-700)", fontSize: 13.5, margin: 0 }}>
            Impossible de créer le dossier. Réessayez.
          </p>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
          <button type="button" className="se-btn se-btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="se-btn se-btn-primary" disabled={create.isPending}>
            <Icon name="plus" size={16} />
            {create.isPending ? "Création…" : "Créer le dossier"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Corbeille des projets : restaurer un dossier ou le supprimer définitivement. */
function CorbeilleDialog({ onClose }: { onClose: () => void }) {
  const { data: corbeille, isLoading } = useCoprosCorbeille();
  const restaurer = useRestaurerCopro();
  const supprimer = useSupprimerDefinitivement();
  const items = corbeille ?? [];

  return (
    <Modal title="Corbeille" onClose={onClose} width={640}>
      {isLoading ? (
        <p style={{ color: "var(--fg-muted)" }}>Chargement…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--fg-muted)", margin: 0 }}>
          La corbeille est vide. Les dossiers mis à la corbeille depuis leur fiche apparaissent ici - vous
          pouvez les restaurer ou les supprimer définitivement.
        </p>
      ) : (
        <>
          {items.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <Icon name="building" size={17} style={{ color: "var(--fg-muted)", flex: "none" }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
                  {[c.city, `à la corbeille depuis le ${fmtDate(c.deleted_at)}`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button
                className="se-btn se-btn-secondary btn-sm"
                disabled={restaurer.isPending}
                onClick={() => void restaurer.mutateAsync(c.id)}
              >
                <Icon name="chevronLeft" size={13} />
                Restaurer
              </button>
              <button
                className="se-btn se-btn-ghost btn-sm"
                style={{ color: "var(--color-error-700)" }}
                disabled={supprimer.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Supprimer définitivement « ${c.name} » ?\n\nToutes les données du dossier (lots, enquêtes, plans de financement, fichiers…) seront effacées. Cette action est irréversible.`
                    )
                  ) {
                    void supprimer.mutateAsync(c.id);
                  }
                }}
              >
                <Icon name="trash" size={13} />
                Supprimer définitivement
              </button>
            </div>
          ))}
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 12, marginBottom: 0 }}>
            Un dossier à la corbeille n'est plus visible des syndics, copropriétaires et prestataires. La
            restauration le remet en ligne à l'identique.
          </p>
        </>
      )}
    </Modal>
  );
}

function exportCsv(copros: CoproWithStats[]) {
  const head = ["Copropriété", "Ville", "Phase", "DPE avant", "DPE après", "Gain %", "Logements", "Lots", "Copropriétaires", "Bâtiments", "Montant TTC", "Avancement %", "Syndic", "Gestionnaire"];
  const lines = copros.map((c) =>
    [
      c.name,
      c.city ?? "",
      c.phase,
      c.energy_before ?? "",
      c.energy_after ?? "",
      c.gain_pct ?? "",
      nbLogements(c),
      c.stats?.lots ?? 0,
      c.stats?.coproprietaires ?? 0,
      c.stats?.batiments ?? 0,
      c.stats?.montant_ttc ?? "",
      avancementAmo(c),
      c.syndic_name ?? "",
      c.gestionnaire_nom ?? "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(";")
  );
  const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "coproprietes-strateco.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  useCrumbs([{ label: "Vos copropriétés" }]);
  const { data: copros, isLoading, error } = useCopros();
  const { dashLayout, setDashLayout, showProgress, chefProjetFilter, setChefProjetFilter } = useUi();
  const [phaseFilter, setPhaseFilter] = useState<PhaseId | "">("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [showNew, setShowNew] = useState(false);
  const [showCorbeille, setShowCorbeille] = useState(false);
  const { data: corbeille } = useCoprosCorbeille();

  const cities = useMemo(
    () => Array.from(new Set((copros ?? []).map((c) => c.city).filter((v): v is string => !!v))).sort(),
    [copros]
  );
  const chefsProjets = useMemo(
    () =>
      Array.from(new Set((copros ?? []).map((c) => c.chef_projet).filter((v): v is string => !!v))).sort((a, b) =>
        a.localeCompare(b, "fr")
      ),
    [copros]
  );
  const filtered = (copros ?? []).filter(
    (c) =>
      (!phaseFilter || c.phase === phaseFilter) &&
      (!cityFilter || c.city === cityFilter) &&
      (!chefProjetFilter || c.chef_projet === chefProjetFilter)
  );

  const views = [
    { id: "kanban" as const, label: "Kanban", icon: "columns" as const },
    { id: "galerie" as const, label: "Galerie", icon: "grid" as const },
    { id: "tableau" as const, label: "Tableau", icon: "table" as const },
  ];

  if (error)
    return (
      <div className="placeholder-screen">
        <h2>Erreur de chargement</h2>
        <p>{String(error)}</p>
      </div>
    );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Vos copropriétés</h1>
          <p className="page-sub">Suivi des projets de rénovation énergétique · Grand Est</p>
        </div>
        <span className="spacer"></span>
        <button
          className="se-btn se-btn-ghost btn-sm"
          title="Dossiers mis à la corbeille - restaurer ou supprimer définitivement"
          onClick={() => setShowCorbeille(true)}
        >
          <Icon name="trash" size={15} />
          Corbeille{(corbeille?.length ?? 0) > 0 ? ` (${corbeille!.length})` : ""}
        </button>
        <button className="se-btn se-btn-secondary btn-sm" onClick={() => copros && exportCsv(copros)}>
          <Icon name="download" size={16} />
          Exporter
        </button>
        <button className="se-btn se-btn-primary btn-sm" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={16} />
          Nouvelle copropriété
        </button>
      </div>

      <KpiStrip copros={filtered} />

      <div className="toolbar">
        <div className="seg">
          {views.map((v) => (
            <button key={v.id} className={dashLayout === v.id ? "on" : ""} onClick={() => setDashLayout(v.id)}>
              <Icon name={v.icon} size={15} />
              {v.label}
            </button>
          ))}
        </div>
        <select
          className="chip-filter"
          value={phaseFilter}
          onChange={(e) => setPhaseFilter(e.target.value as PhaseId | "")}
          style={{ cursor: "pointer" }}
        >
          <option value="">Phase : toutes</option>
          {PHASES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          className="chip-filter"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          style={{ cursor: "pointer" }}
        >
          <option value="">Secteur : tous</option>
          {cities.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {/* Filtre persistant : le choix reste le défaut du chef de projet à sa prochaine visite */}
        <select
          className="chip-filter"
          value={chefProjetFilter}
          onChange={(e) => setChefProjetFilter(e.target.value)}
          style={{ cursor: "pointer" }}
          title="Le filtre choisi reste appliqué par défaut à votre prochaine visite"
        >
          <option value="">Chef de projet : tous</option>
          {chefProjetFilter && !chefsProjets.includes(chefProjetFilter) && (
            <option value={chefProjetFilter}>{chefProjetFilter}</option>
          )}
          {chefsProjets.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <span style={{ flex: 1 }}></span>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
          {isLoading ? "Chargement…" : `${filtered.length} dossier${filtered.length > 1 ? "s" : ""}`}
        </span>
      </div>

      {dashLayout === "kanban" && <KanbanView copros={filtered} showProgress={showProgress} />}
      {dashLayout === "galerie" && <GalleryView copros={filtered} showProgress={showProgress} />}
      {dashLayout === "tableau" && <TableView copros={filtered} />}

      {!isLoading && filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--fg-muted)" }}>
          Aucun dossier pour l'instant - créez votre première copropriété.
        </div>
      )}

      {showNew && <NewCoproDialog onClose={() => setShowNew(false)} />}
      {showCorbeille && <CorbeilleDialog onClose={() => setShowCorbeille(false)} />}
    </div>
  );
}
