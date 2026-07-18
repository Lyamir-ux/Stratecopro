// dashboard.jsx — Tableau de bord AMO : liste des copropriétés
// 3 directions visuelles : Kanban (Trello), Galerie, Tableau

function CoproCard({ c, onOpen, showProgress }) {
  const montant = window.fmtEuro(c.montantTTC);
  return (
    <article className="copro-card fade">
      <ThumbSlot id={c.id} placeholder={c.name} />
      {/* overlays */}
      <div style={{ position: "relative" }}>
        <div className="cc-body" style={{ cursor: "pointer" }} onClick={() => onOpen(c.id)}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 className="cc-name">{c.name}</h3>
              <div className="cc-loc">
                <Icon name="mapPin" size={14} />{c.adresse || (c.city + " · " + c.quartier)}
              </div>
            </div>
            <DpePair before={c.energyBefore} after={c.energyAfter} />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {c.fragile && <Badge kind="warn"><Icon name="alert" size={12} />Fragile</Badge>}
            {c.gainPct != null && <Badge kind="primary"><Icon name="trendingUp" size={12} />+{c.gainPct}%</Badge>}
            {c.scenario && <Badge kind="neutral">{c.scenario}</Badge>}
          </div>

          <div className="cc-meta">
            <div className="m"><span className="v">{c.lots}</span><span className="l">lots</span></div>
            <div className="m"><span className="v">{c.coproprietaires}</span><span className="l">copropriétaires</span></div>
            <div className="m"><span className="v">{c.batiments}</span><span className="l">bâtiment{c.batiments > 1 ? "s" : ""}</span></div>
          </div>

          {showProgress && (
            <div className="cc-prog-row">
              <div className="lab"><span>Avancement</span><span>{c.progress}%</span></div>
              <Progress value={c.progress} blue={c.phase === "etudes"} />
            </div>
          )}

          <div className="cc-next">
            <Icon name="checkCircle" size={15} className="ico" />
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Prochaine étape · {c.nextTask}
            </span>
          </div>

          <div className="cc-foot">
            <AvatarStack team={c.team} />
            <span className="spacer"></span>
            {c.montantTTC != null
              ? <span className="montant">{montant}</span>
              : <span className="updated">Non chiffré</span>}
          </div>
        </div>
      </div>
    </article>
  );
}

function KanbanView({ copros, onOpen, showProgress }) {
  const dotColor = { diagnostic: "var(--color-neutral-400)", etudes: "var(--color-secondary-500)", travaux: "var(--color-primary-500)" };
  return (
    <div className="kanban">
      {window.PHASES.map((ph) => {
        const list = copros.filter((c) => c.phase === ph.id);
        return (
          <section className="kcol" key={ph.id}>
            <div className="kcol-head">
              <span className="kdot" style={{ background: dotColor[ph.id] }}></span>
              <span className="ktitle">{ph.label}</span>
              <span className="kcount">{list.length}</span>
              <button className="icon-btn kadd" title="Ajouter une copropriété"><Icon name="plus" size={18} /></button>
            </div>
            <div className="kcol-body">
              {list.map((c) => <CoproCard key={c.id} c={c} onOpen={onOpen} showProgress={showProgress} />)}
              {list.length === 0 && <div style={{ padding: 18, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>Aucun dossier</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function GalleryView({ copros, onOpen, showProgress }) {
  return (
    <div className="gallery">
      {copros.map((c) => <CoproCard key={c.id} c={c} onOpen={onOpen} showProgress={showProgress} />)}
    </div>
  );
}

function TableView({ copros, onOpen, showProgress }) {
  return (
    <div className="tablewrap fade">
      <table className="dossiers">
        <thead>
          <tr>
            <th>Copropriété</th><th>Phase</th><th>DPE</th><th>Lots</th>
            <th>Copro.</th><th>Montant TTC</th><th>Avancement</th><th>Équipe</th><th></th>
          </tr>
        </thead>
        <tbody>
          {copros.map((c) => (
            <tr key={c.id} onClick={() => onOpen(c.id)}>
              <td>
                <div className="td-name">
                  <span className="td-thumb"><Icon name="building" size={18} /></span>
                  <div>
                    <div className="nm">{c.name}</div>
                    <div className="sub">{c.city} · {c.syndic}</div>
                  </div>
                </div>
              </td>
              <td><PhaseBadge phase={c.phase} /></td>
              <td><DpePair before={c.energyBefore} after={c.energyAfter} /></td>
              <td style={{ fontWeight: 600 }}>{c.lots}</td>
              <td>{c.coproprietaires}</td>
              <td style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{window.fmtEuro(c.montantTTC)}</td>
              <td>
                <div className="td-prog">
                  <span className="pct">{c.progress}%</span>
                  <div style={{ flex: 1 }}><Progress value={c.progress} blue={c.phase === "etudes"} /></div>
                </div>
              </td>
              <td><AvatarStack team={c.team} /></td>
              <td><Icon name="chevronRight" size={18} style={{ color: "var(--fg-muted)" }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KpiStrip({ copros }) {
  const lots = copros.reduce((s, c) => s + c.lots, 0);
  const coproTotal = copros.reduce((s, c) => s + c.coproprietaires, 0);
  const montant = copros.reduce((s, c) => s + (c.montantTTC || 0), 0);
  const gains = copros.filter((c) => c.gainPct != null);
  const gainMoy = Math.round(gains.reduce((s, c) => s + c.gainPct, 0) / gains.length);
  const kpis = [
    { ico: "building", label: "Dossiers actifs", val: copros.length, foot: "sur les 3 phases", blue: false },
    { ico: "users", label: "Copropriétaires accompagnés", val: coproTotal, foot: lots + " lots au total", blue: true },
    { ico: "euro", label: "Montant de travaux", val: (montant / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " M€", foot: "TTC engagés", blue: false },
    { ico: "trendingUp", label: "Gain énergétique moyen", val: gainMoy + " %", foot: <span><span className="up">↑</span> au-dessus du seuil 35 %</span>, blue: false },
  ];
  return (
    <div className="kpis">
      {kpis.map((k, i) => (
        <div className="kpi fade" key={i}>
          <div className="k-top">
            <span className={"k-ico" + (k.blue ? " blue" : "")}><Icon name={k.ico} size={19} /></span>
            <span className="k-label">{k.label}</span>
          </div>
          <div className="k-val">{k.val}</div>
          <div className="k-foot">{k.foot}</div>
        </div>
      ))}
    </div>
  );
}

function Dashboard({ copros, t, setTweak, onOpen }) {
  const view = t.dashLayout;
  const views = [
    { id: "kanban", label: "Kanban", icon: "columns" },
    { id: "galerie", label: "Galerie", icon: "grid" },
    { id: "tableau", label: "Tableau", icon: "table" },
  ];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Vos copropriétés</h1>
          <p className="page-sub">Suivi des projets de rénovation énergétique · Grand Est</p>
        </div>
        <span className="spacer"></span>
        <button className="se-btn se-btn-secondary btn-sm"><Icon name="download" size={16} />Exporter</button>
        <button className="se-btn se-btn-primary btn-sm"><Icon name="plus" size={16} />Nouvelle copropriété</button>
      </div>

      <KpiStrip copros={copros} />

      <div className="toolbar">
        <div className="seg">
          {views.map((v) => (
            <button key={v.id} className={view === v.id ? "on" : ""} onClick={() => setTweak("dashLayout", v.id)}>
              <Icon name={v.icon} size={15} />{v.label}
            </button>
          ))}
        </div>
        <button className="chip-filter"><Icon name="filter" size={15} />Phase</button>
        <button className="chip-filter"><Icon name="mapPin" size={15} />Secteur</button>
        <span style={{ flex: 1 }}></span>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{copros.length} dossiers</span>
      </div>

      {view === "kanban" && <KanbanView copros={copros} onOpen={onOpen} showProgress={t.showProgress} />}
      {view === "galerie" && <GalleryView copros={copros} onOpen={onOpen} showProgress={t.showProgress} />}
      {view === "tableau" && <TableView copros={copros} onOpen={onOpen} showProgress={t.showProgress} />}
    </div>
  );
}

window.Dashboard = Dashboard;
