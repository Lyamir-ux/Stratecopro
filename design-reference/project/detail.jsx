// detail.jsx — Détail d'un dossier copropriété (vue AMO)

function StatusDot({ status }) {
  if (status === "done") return <span className="status-dot done"><Icon name="check" size={11} /></span>;
  if (status === "doing") return <span className="status-dot doing"></span>;
  return <span className="status-dot todo"></span>;
}
window.StatusDot = StatusDot;

function TaskCard({ task }) {
  return (
    <div className={"task-card" + (task.status === "done" ? " done" : "")}>
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
        <StatusDot status={task.status} />
        <div className="tt">{task.title}{task.jalon && <span className="jalon" title={"Jalon de facturation " + task.jalon}>{task.jalon}</span>}</div>
      </div>
      <div className="task-foot">
        {task.tag && <Badge kind={task.tag === "CEE" || task.tag === "Finance" || task.tag === "Éco-PTZ" ? "blue" : "primary"}>{task.tag}</Badge>}
        {task.due && <span className="due"><Icon name="calendar" size={13} />{task.due}</span>}
        <span className="spacer"></span>
        {task.who && <Avatar who={task.who} sm />}
      </div>
    </div>
  );
}

function ProjetTab({ c, tasksFn }) {
  const tasks = (tasksFn || window.makeTasks)(c);
  return (
    <div className="tkanban fade">
      {window.PHASES.map((ph, i) => {
        const list = tasks[ph.id];
        const cur = c.phase === ph.id;
        const doneN = list.filter((t) => t.status === "done").length;
        return (
          <section key={ph.id}>
            <div className={"tcol-head" + (cur ? " cur" : "")}>
              <span className="num">{String(i + 1).padStart(2, "0")}</span>
              <span className="lbl">{ph.label}</span>
              {cur && <Badge kind="primary" dot>En cours</Badge>}
              <span className="spacer" style={{ flex: 1 }}></span>
              <span style={{ fontSize: 12, color: "var(--fg-muted)", fontWeight: 600 }}>{doneN}/{list.length}</span>
            </div>
            <div className="tcol-body">
              {list.map((t, j) => <TaskCard key={j} task={t} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EditHeader({ icon, title, panel, editing, onEdit, onSave, onCancel, onImport }) {
  const on = editing === panel;
  const dim = editing !== null;
  return (
    <div className="p-head">
      <Icon name={icon} size={18} /><h3>{title}</h3>
      <span style={{ flex: 1 }}></span>
      {on ? (
        <div className="edit-actions">
          <button className="se-btn se-btn-ghost btn-sm" onClick={onCancel}>Annuler</button>
          <button className="se-btn se-btn-primary btn-sm" onClick={onSave}><Icon name="check" size={15} />Enregistrer</button>
        </div>
      ) : (
        <div className="edit-actions">
          {onImport && <button className="se-btn se-btn-secondary btn-sm" onClick={onImport} disabled={dim} style={{ opacity: dim ? 0.35 : 1 }}><Icon name="upload" size={14} />Importer</button>}
          <button className="se-btn se-btn-ghost btn-sm" onClick={onEdit} disabled={dim} style={{ opacity: dim ? 0.35 : 1 }}><Icon name="edit" size={14} />Modifier</button>
        </div>
      )}
    </div>
  );
}

function DonneesTab({ c }) {
  const initUsages = () => [
    { l: "Habitation", v: c.lotsHab, k: "primary" },
    { l: "Garages / parkings", v: Math.round(c.lots * 0.18), k: "blue" },
    { l: "Caves", v: Math.round(c.lots * 0.12), k: "neutral" },
    { l: "Autres", v: Math.max(0, c.lots - c.lotsHab - Math.round(c.lots * 0.18) - Math.round(c.lots * 0.12)), k: "neutral" },
  ];
  const initBats = () => Array.from({ length: Math.min(c.batiments, 5) }).map((_, i) => ({
    name: "Bât. " + String.fromCharCode(65 + i),
    lots: Math.round(c.lots / c.batiments),
    mun: Math.round(1000 / c.batiments),
    esc: Math.round(1000 / c.batiments / 2),
  }));
  const initSynth = () => ({ adresse: c.adresse || (c.city + " · " + c.quartier), syndic: c.syndic, city: c.city, lots: c.lots, copros: c.coproprietaires, batiments: c.batiments });

  const [usages, setUsages] = React.useState(initUsages);
  const [bats, setBats] = React.useState(initBats);
  const [synth, setSynth] = React.useState(initSynth);
  const [editing, setEditing] = React.useState(null);
  const [batImport, setBatImport] = React.useState(null);
  const bak = React.useRef(null);
  const batFileRef = React.useRef(null);

  const totalLots = usages.reduce((a, u) => a + (Number(u.v) || 0), 0) || c.lots;

  const startEdit = (panel) => {
    if (panel === "lots") bak.current = usages.map((x) => ({ ...x }));
    else if (panel === "bat") bak.current = bats.map((x) => ({ ...x }));
    else if (panel === "synth") bak.current = { ...synth };
    setEditing(panel);
  };
  const cancel = () => {
    if (editing === "lots") setUsages(bak.current);
    else if (editing === "bat") setBats(bak.current);
    else if (editing === "synth") setSynth(bak.current);
    setEditing(null);
  };
  const save = () => setEditing(null);

  const setUsage = (i, v) => setUsages((prev) => prev.map((u, j) => (j === i ? { ...u, v: v } : u)));
  const setBat = (i, key, v) => setBats((prev) => prev.map((b, j) => (j === i ? { ...b, [key]: v } : b)));
  const setSyn = (key, v) => setSynth((prev) => ({ ...prev, [key]: v }));

  const onBatImportClick = () => { if (batFileRef.current) batFileRef.current.click(); };
  const onBatFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    // simulation : le fichier fournit la liste complète des bâtiments et leurs clés
    const n = Math.max(1, c.batiments);
    const rows = Array.from({ length: n }).map((_, i) => ({
      name: "Bât. " + String.fromCharCode(65 + i),
      lots: Math.round(c.lots / n),
      mun: Math.round(1000 / n),
      esc: Math.round(1000 / n / 2),
    }));
    setBats(rows);
    setBatImport({ file: f.name, count: n });
    e.target.value = "";
  };

  const lotsEd = editing === "lots", batEd = editing === "bat", synEd = editing === "synth";

  return (
    <div className="detail-grid fade">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <EditHeader icon="building" title="Répartition des lots" panel="lots" editing={editing}
            onEdit={() => startEdit("lots")} onSave={save} onCancel={cancel} />
          <div className="p-body">
            {usages.map((u, i) => (
              <div key={u.l} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, marginBottom: lotsEd ? 0 : 6, gap: 10 }}>
                  <span>{u.l}</span>
                  {lotsEd
                    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input className="edit-inp" type="number" value={u.v} min="0" style={{ width: 84 }}
                          onChange={(e) => setUsage(i, Number(e.target.value) || 0)} />
                        <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>lots</span>
                      </span>
                    : <span style={{ fontWeight: 700 }}>{u.v} lots</span>}
                </div>
                {!lotsEd && <Progress value={(u.v / totalLots) * 100} blue={u.k === "blue"} />}
              </div>
            ))}
            {lotsEd && (
              <div className="edit-total"><span>Total des lots</span><span style={{ fontWeight: 800, fontFamily: "var(--font-display)" }}>{totalLots}</span></div>
            )}
          </div>
        </div>
        <div className="panel">
          <EditHeader icon="layers" title="Bâtiments & clés de répartition" panel="bat" editing={editing}
            onEdit={() => startEdit("bat")} onSave={save} onCancel={cancel} onImport={onBatImportClick} />
          <input type="file" ref={batFileRef} accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={onBatFile} />
          <div className="p-body">
            {batImport && !batEd && (
              <div className="import-note">
                <Icon name="fileCheck" size={16} />
                <span>{batImport.count} bâtiments importés depuis <b>{batImport.file}</b>.</span>
                <button onClick={() => setBatImport(null)} aria-label="Fermer"><Icon name="x" size={14} /></button>
              </div>
            )}
            <table className="dossiers" style={{ fontSize: 13 }}>
              <thead><tr><th>Bâtiment</th><th>Lots</th><th>Clé MUN</th><th>Clé escalier</th></tr></thead>
              <tbody>
                {bats.map((b, i) => (
                  <tr key={i} style={{ cursor: "default" }}>
                    <td style={{ fontWeight: 700, fontFamily: "var(--font-display)" }}>{b.name}</td>
                    {batEd ? (
                      <>
                        <td><input className="edit-inp sm" type="number" value={b.lots} onChange={(e) => setBat(i, "lots", Number(e.target.value) || 0)} /></td>
                        <td><input className="edit-inp sm" type="number" value={b.mun} onChange={(e) => setBat(i, "mun", Number(e.target.value) || 0)} /> ‰</td>
                        <td><input className="edit-inp sm" type="number" value={b.esc} onChange={(e) => setBat(i, "esc", Number(e.target.value) || 0)} /> ‰</td>
                      </>
                    ) : (
                      <>
                        <td>{b.lots}</td>
                        <td>{b.mun} ‰</td>
                        <td>{b.esc} ‰</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {batEd && <p className="se-small" style={{ marginTop: 12, color: "var(--fg-muted)" }}>Les clés sont exprimées en millièmes (‰). La somme des clés MUN doit atteindre 1 000 ‰.</p>}
          </div>
        </div>
      </div>
      <div className="panel" style={{ position: "sticky", top: 0 }}>
        <EditHeader icon="fileText" title="Synthèse" panel="synth" editing={editing}
          onEdit={() => startEdit("synth")} onSave={save} onCancel={cancel} />
        <div className="p-body">
          <div className="kv"><span className="k">Adresse</span>
            {synEd ? <input className="edit-inp" value={synth.adresse} onChange={(e) => setSyn("adresse", e.target.value)} /> : <span className="v" style={{ textAlign: "right" }}>{synth.adresse}</span>}</div>
          <div className="kv"><span className="k">Syndic</span>
            {synEd ? <input className="edit-inp" value={synth.syndic} onChange={(e) => setSyn("syndic", e.target.value)} /> : <span className="v">{synth.syndic}</span>}</div>
          <div className="kv"><span className="k">Ville</span>
            {synEd ? <input className="edit-inp" value={synth.city} onChange={(e) => setSyn("city", e.target.value)} /> : <span className="v">{synth.city}</span>}</div>
          <div className="kv"><span className="k">Lots</span>
            {synEd ? <input className="edit-inp sm" type="number" value={synth.lots} onChange={(e) => setSyn("lots", Number(e.target.value) || 0)} /> : <span className="v">{synth.lots}</span>}</div>
          <div className="kv"><span className="k">Copropriétaires</span>
            {synEd ? <input className="edit-inp sm" type="number" value={synth.copros} onChange={(e) => setSyn("copros", Number(e.target.value) || 0)} /> : <span className="v">{synth.copros}</span>}</div>
          <div className="kv"><span className="k">Bâtiments</span>
            {synEd ? <input className="edit-inp sm" type="number" value={synth.batiments} onChange={(e) => setSyn("batiments", Number(e.target.value) || 0)} /> : <span className="v">{synth.batiments}</span>}</div>
          <div className="kv"><span className="k">Étiquette</span><span className="v"><DpePair before={c.energyBefore} after={c.energyAfter} /></span></div>
          {c.fragile && <div className="kv"><span className="k">Statut</span><span className="v"><Badge kind="warn">Copropriété fragile</Badge></span></div>}
        </div>
      </div>
    </div>
  );
}

function FinancementTab({ c, onIngenierie }) {
  if (c.montantTTC == null) {
    return <div className="placeholder-screen fade">
      <div className="ps-ico"><Icon name="euro" size={28} /></div>
      <h2>Financement à venir</h2>
      <p>Le chiffrage et le plan de financement seront établis à l'issue du diagnostic, en phase Études.</p>
      <button className="se-btn se-btn-primary" style={{ marginTop: 22 }} onClick={onIngenierie}><Icon name="barChart" size={17} />Démarrer l'ingénierie financière</button>
    </div>;
  }
  const travaux = c.montantTTC * 0.72;
  const honoraires = c.montantTTC * 0.20;
  const aleas = c.montantTTC * 0.08;
  const aides = c.montantTTC * (c.aidesPct / 100);
  const reste = c.resteACharge;
  return (
    <div className="detail-grid fade">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head"><Icon name="euro" size={18} /><h3>Scénario · {c.scenario}</h3>
            <span style={{ flex: 1 }}></span><Badge kind="success" dot>Partagé</Badge></div>
          <div className="p-body">
            <div className="kv"><span className="k">Travaux</span><span className="v">{window.fmtEuro(travaux)}</span></div>
            <div className="kv"><span className="k">Honoraires</span><span className="v">{window.fmtEuro(honoraires)}</span></div>
            <div className="kv"><span className="k">Aléas</span><span className="v">{window.fmtEuro(aleas)}</span></div>
            <div className="kv" style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 12 }}>
              <span className="k" style={{ fontWeight: 700, color: "var(--fg1)" }}>Coût total TTC</span>
              <span className="v" style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>{window.fmtEuroFull(c.montantTTC)}</span>
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="p-head"><Icon name="barChart" size={18} /><h3>Ingénierie financière</h3>
            <span style={{ flex: 1 }}></span>
            <button className="se-btn se-btn-ghost btn-sm" onClick={onIngenierie}>Ouvrir l'assistant 7 étapes<Icon name="arrowRight" size={15} /></button>
          </div>
          <div className="p-body">
            {[
              { l: "Aides collectives (MPR Copro, CEE)", v: aides * 0.62, k: false },
              { l: "Aides individuelles (MPR profils)", v: aides * 0.38, k: true },
              { l: "Reste à charge copropriété", v: reste, rest: true },
            ].map((row) => (
              <div key={row.l} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                  <span>{row.l}</span>
                  <span style={{ fontWeight: 700 }}>{window.fmtEuro(row.v)}</span>
                </div>
                <Progress value={(row.v / c.montantTTC) * 100} blue={row.k} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head"><Icon name="trendingUp" size={18} /><h3>Indicateurs</h3></div>
          <div className="p-body">
            <div className="kv"><span className="k">Gain énergétique</span><span className="v" style={{ color: "var(--color-primary-700)" }}>+{c.gainPct} %</span></div>
            <div className="kv"><span className="k">Seuil 35 %</span><span className="v"><Badge kind="success">Atteint</Badge></span></div>
            <div className="kv"><span className="k">Taux d'aides</span><span className="v">{c.aidesPct} %</span></div>
            <div className="kv"><span className="k">Étiquette visée</span><span className="v"><DpePair before={c.energyBefore} after={c.energyAfter} /></span></div>
          </div>
        </div>
        <div className="panel">
          <div className="p-head"><Icon name="fileText" size={18} /><h3>Plans individuels</h3></div>
          <div className="p-body" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {["Copropriétaire 1", "Copropriétaire 2", "Copropriétaire 3"].map((n, i) => (
              <div key={n} className="task-row" style={{ padding: "11px 4px", borderBottom: i < 2 ? "1px solid var(--border)" : "none" }}>
                <Avatar who={["CB", "TM", "LR"][i]} sm />
                <div><div className="t-title" style={{ fontSize: 13 }}>{n}</div><div className="t-copro">Lot {101 + i} · {2 + i} pièces</div></div>
                <span className="spacer"></span>
                <Icon name="fileText" size={16} style={{ color: "var(--color-secondary-500)" }} />
              </div>
            ))}
            <button className="se-btn se-btn-ghost btn-sm" style={{ marginTop: 8, alignSelf: "flex-start" }}>Voir les {c.coproprietaires} plans<Icon name="arrowRight" size={15} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FichiersTab({ c }) {
  const checklists = [
    { l: "CEE — Avant travaux", done: 8, tot: 9 },
    { l: "CEE — Après travaux", done: c.phase === "travaux" ? 4 : 0, tot: 9 },
    { l: "MPR Copropriété 2024", done: 6, tot: 7 },
    { l: "Éco-PTZ collectif 2024", done: c.phase === "travaux" ? 5 : 2, tot: 6 },
  ];
  const folders = ["Diagnostic & audit", "Études techniques", "Plans de financement", "Marchés de travaux", "Assemblée générale", "Photos chantier"];
  return (
    <div className="detail-grid fade">
      <div className="panel">
        <div className="p-head"><Icon name="folder" size={18} /><h3>Fichiers du projet</h3>
          <span style={{ flex: 1 }}></span>
          <button className="se-btn se-btn-secondary btn-sm"><Icon name="plus" size={15} />Déposer</button></div>
        <div className="p-body">
          <div className="file-grid">
            {folders.map((f) => (
              <div className="file-card" key={f}>
                <Icon name="folder" size={26} className="fc-ico" />
                <div className="fc-name">{f}</div>
                <div className="fc-sub">{2 + (f.length % 7)} fichiers</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="p-head"><Icon name="clipboard" size={18} /><h3>Checklists de pièces</h3></div>
        <div className="p-body">
          {checklists.map((cl) => (
            <div key={cl.l} style={{ marginBottom: 15 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 6 }}>
                <span>{cl.l}</span>
                <span style={{ fontWeight: 700, color: cl.done === cl.tot ? "var(--color-success-700)" : "var(--fg2)" }}>{cl.done}/{cl.tot}</span>
              </div>
              <Progress value={(cl.done / cl.tot) * 100} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const DEFAULT_QUESTIONS = [
  { id: 1, q: "Statut d'occupation du logement", type: "Choix · occupant / bailleur", on: true, req: true },
  { id: 2, q: "Composition du foyer (nombre de personnes)", type: "Nombre", on: true, req: true },
  { id: 3, q: "Revenu fiscal de référence (RFR)", type: "Montant · €", on: true, req: true },
  { id: 4, q: "Avis d'imposition N-1", type: "Pièce jointe · PDF", on: true, req: true },
  { id: 5, q: "Nombre de parts fiscales", type: "Nombre", on: true, req: false },
  { id: 6, q: "Mandat de perception des aides", type: "Oui / non", on: true, req: false },
  { id: 7, q: "Travaux privatifs envisagés", type: "Texte libre", on: false, req: false },
];

function EnqueteTab({ c }) {
  const profils = [
    { l: "Bleu", pct: 34, color: "#2E6FA8" },
    { l: "Jaune", pct: 28, color: "#f2a30d" },
    { l: "Violet", pct: 23, color: "#7A5AE0" },
    { l: "Rose", pct: 15, color: "#DC6FA8" },
  ];
  const repondants = Math.round(c.coproprietaires * 0.78);
  const nonRep = c.coproprietaires - repondants;

  const [questions, setQuestions] = React.useState(DEFAULT_QUESTIONS);
  const [configuring, setConfiguring] = React.useState(false);
  const [cible, setCible] = React.useState("nonrep");
  const [parEmail, setParEmail] = React.useState(true);
  const [dateLimite, setDateLimite] = React.useState("2026-07-15");
  const [sent, setSent] = React.useState(c.phase === "travaux");
  const qBak = React.useRef(null);

  const activeCount = questions.filter((q) => q.on).length;
  const destCount = cible === "tous" ? c.coproprietaires : nonRep;

  const setQ = (id, patch) => setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const removeQ = (id) => setQuestions((prev) => prev.filter((q) => q.id !== id));
  const addQ = () => setQuestions((prev) => [...prev, { id: Date.now(), q: "Nouvelle question", type: "Texte libre", on: true, req: false }]);
  const startConfig = () => { qBak.current = questions.map((q) => ({ ...q })); setConfiguring(true); };
  const saveConfig = () => setConfiguring(false);
  const cancelConfig = () => { setQuestions(qBak.current); setConfiguring(false); };

  return (
    <div className="detail-grid fade">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head"><Icon name="users" size={18} /><h3>Profils MaPrimeRénov'</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{repondants}/{c.coproprietaires} répondants</span></div>
          <div className="p-body">
            {profils.map((p) => (
              <div key={p.l} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.color }}></span>{p.l}</span>
                  <span style={{ fontWeight: 700 }}>{p.pct} %</span>
                </div>
                <div className="prog"><i style={{ width: p.pct + "%", background: p.color }}></i></div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="p-head"><Icon name="clipboard" size={18} /><h3>Questionnaire d'enquête sociale</h3>
            <span style={{ flex: 1 }}></span>
            {configuring ? (
              <div className="edit-actions">
                <button className="se-btn se-btn-ghost btn-sm" onClick={cancelConfig}>Annuler</button>
                <button className="se-btn se-btn-primary btn-sm" onClick={saveConfig}><Icon name="check" size={15} />Terminer</button>
              </div>
            ) : (
              <button className="se-btn se-btn-ghost btn-sm" onClick={startConfig}><Icon name="settings" size={14} />Configurer</button>
            )}
          </div>
          <div className="p-body">
            <div className="q-list">
              {questions.map((q, i) => (
                <div key={q.id} className={"q-row" + (!q.on && !configuring ? " off" : "")}>
                  <span className="q-num">{i + 1}</span>
                  <div className="q-main">
                    {configuring
                      ? <input className="edit-inp" value={q.q} onChange={(e) => setQ(q.id, { q: e.target.value })} />
                      : <div className="q-label">{q.q}</div>}
                    <div className="q-type">{q.type}</div>
                  </div>
                  {configuring ? (
                    <div className="q-ctrls">
                      <button className={"q-pill" + (q.req ? " on" : "")} onClick={() => setQ(q.id, { req: !q.req })} title="Réponse obligatoire">Oblig.</button>
                      <button className={"q-switch" + (q.on ? " on" : "")} onClick={() => setQ(q.id, { on: !q.on })} title={q.on ? "Désactiver" : "Activer"}><span className="knob"></span></button>
                      <button className="q-del" onClick={() => removeQ(q.id)} title="Supprimer"><Icon name="trash" size={15} /></button>
                    </div>
                  ) : (
                    <div className="q-badges">
                      {q.req && <Badge kind="neutral">Obligatoire</Badge>}
                      <Badge kind={q.on ? "success" : "neutral"} dot={q.on}>{q.on ? "Actif" : "Inactif"}</Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {configuring && (
              <button className="se-btn se-btn-secondary btn-sm" style={{ marginTop: 14 }} onClick={addQ}><Icon name="plus" size={15} />Ajouter une question</button>
            )}
            {!configuring && (
              <p className="se-small" style={{ marginTop: 14, color: "var(--fg-muted)" }}>{activeCount} question{activeCount > 1 ? "s" : ""} active{activeCount > 1 ? "s" : ""} sur {questions.length} · diffusées via le portail copropriétaire.</p>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head"><Icon name="send" size={18} /><h3>Envoi des questionnaires</h3></div>
          <div className="p-body">
            {sent && (
              <div className="send-ok">
                <Icon name="checkCircle" size={18} />
                <div>Questionnaires envoyés à {destCount} copropriétaire{destCount > 1 ? "s" : ""}<span className="so-sub">Relance programmée le {new Date(dateLimite).toLocaleDateString("fr-FR")}</span></div>
              </div>
            )}
            <div className="send-field">
              <label>Destinataires</label>
              <div className="opt-mini">
                <button className={cible === "tous" ? "on" : ""} onClick={() => setCible("tous")}>Tous · {c.coproprietaires}</button>
                <button className={cible === "nonrep" ? "on" : ""} onClick={() => setCible("nonrep")}>Non-répondants · {nonRep}</button>
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
            <button className="se-btn se-btn-primary" style={{ width: "100%", marginTop: 16, justifyContent: "center" }} onClick={() => setSent(true)}>
              <Icon name="send" size={16} />{sent ? "Renvoyer aux " + destCount + " destinataires" : "Envoyer à " + destCount + " copropriétaires"}
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="p-head"><Icon name="share" size={18} /><h3>Portail copropriétaire</h3></div>
          <div className="p-body">
            <p className="se-body" style={{ fontSize: 14, marginTop: 0 }}>Espace individuel : enquête sociale, fichiers partagés et aides individuelles.</p>
            <div className="kv"><span className="k">Accès actifs</span><span className="v">{Math.round(c.coproprietaires * 0.64)}</span></div>
            <div className="kv"><span className="k">Recensement</span><span className="v"><Badge kind={c.phase === "travaux" ? "success" : "warn"}>{c.phase === "travaux" ? "Envoyé" : "À préparer"}</Badge></span></div>
            <button className="se-btn se-btn-secondary btn-sm" style={{ marginTop: 14 }}><Icon name="share" size={15} />Ouvrir le portail</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommunicationsTab({ c }) {
  const notes = [
    { who: "CB", when: "Il y a 2 h", body: "Réception partielle des façades nord validée. Réserves mineures sur les appuis de fenêtres, levée prévue sous 10 jours." },
    { who: "TM", when: "Hier", body: "Mise à jour du plan de financement : avance de subvention individuelle paramétrée à 70 %." },
    { who: "YK", when: "Il y a 3 j", body: "Visite de chantier hebdomadaire. Avancement conforme au planning, pas de point bloquant." },
    { who: "LR", when: "Il y a 5 j", body: "Relance des copropriétaires non-répondants à l'enquête sociale (12 restants)." },
  ];
  return (
    <div className="panel fade" style={{ maxWidth: 760 }}>
      <div className="p-head"><Icon name="message" size={18} /><h3>Notes du projet</h3></div>
      <div className="p-body">
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          <Avatar who="CB" />
          <input className="search" style={{ width: "100%", margin: 0 }} placeholder="Écrire une note de projet…" />
        </div>
        {notes.map((n, i) => (
          <div className="note" key={i}>
            <Avatar who={n.who} />
            <div>
              <div className="nbody">{n.body}</div>
              <div className="nmeta">{window.TEAM[n.who].name} · {n.when}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoproDetail({ c, onBack, onIngenierie, role, tasksFn, hiddenTabs, onCoproView }) {
  const hidden = hiddenTabs || [];
  const [tab, setTab] = React.useState("projet");
  const allTabs = [
    { id: "projet", label: "Projet" },
    { id: "donnees", label: "Données de la copro" },
    { id: "financement", label: "Plans de financement" },
    { id: "enquete", label: "Enquête sociale" },
    { id: "fichiers", label: "Fichiers" },
    { id: "communications", label: "Communications" },
  ];
  const tabs = allTabs.filter((t) => !hidden.includes(t.id));
  const isSyndic = role === "syndic";
  return (
    <div className="page">
      <div className="detail-hero fade">
        <div className="dh-banner">
          <image-slot id={"hero-" + c.id} shape="rect" placeholder={"Photo — " + c.name} style={{ background: window.THUMB_BG }}></image-slot>
          <div className="dh-overlay"></div>
        </div>
        <div className="dh-body">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <PhaseBadge phase={c.phase} />
              {c.fragile && <Badge kind="warn"><Icon name="alert" size={12} />Fragile</Badge>}
              <DpePair before={c.energyBefore} after={c.energyAfter} />
              {isSyndic && <Badge kind="neutral"><Icon name="building" size={12} />Syndic</Badge>}
            </div>
            <h1 className="dh-title">{c.name}</h1>
            <div className="dh-loc"><Icon name="mapPin" size={15} />{c.city} · {c.quartier} · {c.syndic}</div>
          </div>
          <div className="dh-stats">
            <div className="dh-stat"><div className="v">{c.lots}</div><div className="l">lots</div></div>
            <div className="dh-stat"><div className="v">{c.coproprietaires}</div><div className="l">copropriétaires</div></div>
            <div className="dh-stat"><div className="v">{c.batiments}</div><div className="l">bâtiments</div></div>
            <div className="dh-stat"><div className="v">{c.progress}%</div><div className="l">avancement</div></div>
          </div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((tb) => (
          <button key={tb.id} className={"tab" + (tab === tb.id ? " on" : "")} onClick={() => setTab(tb.id)}>{tb.label}</button>
        ))}
        <span style={{ flex: 1 }}></span>
        {isSyndic && onCoproView && <button className="tab tab-action" onClick={onCoproView}><Icon name="eye" size={15} />Vue copropriétaire</button>}
      </div>

      {tab === "projet" && <ProjetTab c={c} tasksFn={tasksFn} />}
      {tab === "donnees" && <DonneesTab c={c} />}
      {tab === "financement" && <FinancementTab c={c} onIngenierie={onIngenierie} />}
      {tab === "enquete" && <EnqueteTab c={c} />}
      {tab === "fichiers" && <FichiersTab c={c} />}
      {tab === "communications" && <CommunicationsTab c={c} />}
    </div>
  );
}

window.CoproDetail = CoproDetail;
