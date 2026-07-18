// moe.jsx — Espace Maîtrise d'œuvre (missions loi MOP, plan de financement général)
// Pas d'accès à la partie copropriétaires (enquête sociale, portail, plans individuels).

const MOE_TAB_PHASES = window.PHASES;
const MISSION_HINT = {
  diagnostic: "DIAG — relevés, diagnostic technique & programme",
  etudes: "APS · APD · PRO · DCE · ACT — conception & consultation",
  travaux: "VISA · OPC · DET · AOR — exécution & réception",
};

/* ---------- Kanban des missions (loi MOP) ---------- */
function MoeProjetTab({ c }) {
  const tasks = window.makeMoeTasks(c);
  return (
    <div className="tkanban fade">
      {MOE_TAB_PHASES.map((ph, i) => {
        const list = tasks[ph.id];
        const cur = c.phase === ph.id;
        const doneN = list.filter((t) => t.status === "done").length;
        return (
          <section key={ph.id} data-screen-label={"Phase " + ph.label}>
            <div className="tcol-head">
              <span className="tcol-i">{String(i + 1).padStart(2, "0")}</span>
              <h3>{ph.label}</h3>
              {cur && <Badge kind="warn" dot>En cours</Badge>}
              <span className="spacer" style={{ flex: 1 }}></span>
              <span className="tcol-count">{doneN}/{list.length}</span>
            </div>
            <div className="moe-phase-hint">{MISSION_HINT[ph.id]}</div>
            <div className="tcol-body">
              {list.map((t, j) => (
                <div className={"task-card" + (t.status === "done" ? " done" : "")} key={j}>
                  <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                    <StatusDot status={t.status} />
                    <div className="tt">{t.title}</div>
                  </div>
                  <div className="task-foot">
                    {t.code && <span className="mop-code" title={"Élément de mission loi MOP — " + t.code}>{t.code}</span>}
                    {t.due && <span className="due"><Icon name="calendar" size={13} />{t.due}</span>}
                    <span className="spacer" style={{ flex: 1 }}></span>
                    {t.who && <Avatar who={t.who} sm />}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Données techniques (sans volet copropriétaires) ---------- */
const MOE_CHAUFFAGE = ["Collectif gaz", "Collectif fioul", "Réseau de chaleur", "Individuel gaz", "Individuel élec."];
const MOE_VENTIL = ["Naturelle", "VMC simple flux", "VMC hygro B", "VMC double flux"];
const MOE_ETAT = ["Bon", "Moyen", "Dégradé", "Vétuste"];

function MoeDonneesTab({ c }) {
  const initBats = () => Array.from({ length: Math.min(c.batiments, 5) }).map((_, i) => ({
    name: "Bât. " + String.fromCharCode(65 + i),
    shab: 1400 + i * 320,
    chauffage: i % 2 === 0 ? "Collectif gaz" : "Collectif fioul",
    ventil: c.phase === "travaux" ? "VMC hygro B" : "Naturelle",
    cepAvant: 280 - i * 12,
    cepApres: 96 - i * 4,
    etat: c.fragile ? (i === 0 ? "Dégradé" : "Moyen") : "Moyen",
  }));
  const [bats, setBats] = React.useState(initBats);
  const [editing, setEditing] = React.useState(false);
  const bak = React.useRef(null);

  const startEdit = () => { bak.current = bats.map((b) => ({ ...b })); setEditing(true); };
  const cancel = () => { setBats(bak.current); setEditing(false); };
  const save = () => setEditing(false);
  const setBat = (i, key, v) => setBats((prev) => prev.map((b, j) => (j === i ? { ...b, [key]: v } : b)));

  const etatBadge = (e) => (e === "Bon" ? "success" : e === "Vétuste" || e === "Dégradé" ? "warn" : "neutral");

  return (
    <div className="detail-grid fade">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="p-head"><Icon name="layers" size={18} /><h3>Bâtiments — données techniques</h3>
            <span style={{ flex: 1 }}></span>
            {editing ? (
              <div className="edit-actions">
                <button className="se-btn se-btn-ghost btn-sm" onClick={cancel}>Annuler</button>
                <button className="se-btn se-btn-primary btn-sm" onClick={save}><Icon name="check" size={15} />Enregistrer</button>
              </div>
            ) : (
              <button className="se-btn se-btn-ghost btn-sm" onClick={startEdit}><Icon name="edit" size={14} />Modifier</button>
            )}
          </div>
          <div className="p-body">
            <div className="moe-tech-scroll">
              <table className="dossiers moe-tech-table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Bâtiment</th>
                    <th>SHAB</th>
                    <th>Chauffage</th>
                    <th>Ventilation</th>
                    <th>CEP avant</th>
                    <th>CEP après</th>
                    <th>État existant</th>
                  </tr>
                </thead>
                <tbody>
                  {bats.map((b, i) => (
                    <tr key={i} style={{ cursor: "default" }}>
                      <td style={{ fontWeight: 700, fontFamily: "var(--font-display)" }}>{b.name}</td>
                      {editing ? (
                        <>
                          <td><input className="edit-inp sm" type="number" value={b.shab} onChange={(e) => setBat(i, "shab", Number(e.target.value) || 0)} /> m²</td>
                          <td><select className="edit-sel" value={b.chauffage} onChange={(e) => setBat(i, "chauffage", e.target.value)}>{MOE_CHAUFFAGE.map((o) => <option key={o}>{o}</option>)}</select></td>
                          <td><select className="edit-sel" value={b.ventil} onChange={(e) => setBat(i, "ventil", e.target.value)}>{MOE_VENTIL.map((o) => <option key={o}>{o}</option>)}</select></td>
                          <td><input className="edit-inp sm" type="number" value={b.cepAvant} onChange={(e) => setBat(i, "cepAvant", Number(e.target.value) || 0)} /></td>
                          <td><input className="edit-inp sm" type="number" value={b.cepApres} onChange={(e) => setBat(i, "cepApres", Number(e.target.value) || 0)} /></td>
                          <td><select className="edit-sel" value={b.etat} onChange={(e) => setBat(i, "etat", e.target.value)}>{MOE_ETAT.map((o) => <option key={o}>{o}</option>)}</select></td>
                        </>
                      ) : (
                        <>
                          <td>{b.shab.toLocaleString("fr-FR")} m²</td>
                          <td>{b.chauffage}</td>
                          <td>{b.ventil}</td>
                          <td>{b.cepAvant} <span className="moe-unit">kWh/m²/an</span></td>
                          <td style={{ color: "var(--color-primary-700)", fontWeight: 600 }}>{b.cepApres} <span className="moe-unit">kWh/m²/an</span></td>
                          <td><Badge kind={etatBadge(b.etat)}>{b.etat}</Badge></td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="se-small" style={{ marginTop: 12, color: "var(--fg-muted)" }}>CEP : consommation d'énergie primaire (kWh<sub>ep</sub>/m²/an), avant et après travaux préconisés.</p>
          </div>
        </div>
        <div className="panel">
          <div className="p-head"><Icon name="trendingUp" size={18} /><h3>Performance énergétique</h3></div>
          <div className="p-body">
            <div className="kv"><span className="k">Étiquette actuelle → visée</span><span className="v"><DpePair before={c.energyBefore} after={c.energyAfter} /></span></div>
            <div className="kv"><span className="k">Gain énergétique visé</span><span className="v" style={{ color: "var(--color-primary-700)" }}>+{c.gainPct} %</span></div>
            <div className="kv"><span className="k">Seuil réglementaire 35 %</span><span className="v"><Badge kind="success">Atteint</Badge></span></div>
          </div>
        </div>
      </div>
      <div className="panel" style={{ position: "sticky", top: 0 }}>
        <div className="p-head"><Icon name="fileText" size={18} /><h3>Synthèse technique</h3></div>
        <div className="p-body">
          <div className="kv"><span className="k">Adresse</span><span className="v" style={{ textAlign: "right" }}>{c.adresse || (c.city + " · " + c.quartier)}</span></div>
          <div className="kv"><span className="k">Lots</span><span className="v">{c.lots}</span></div>
          <div className="kv"><span className="k">Bâtiments</span><span className="v">{c.batiments}</span></div>
          <div className="kv"><span className="k">Phase</span><span className="v"><PhaseBadge phase={c.phase} /></span></div>
          {c.fragile && <div className="kv"><span className="k">Statut</span><span className="v"><Badge kind="warn">Copropriété fragile</Badge></span></div>}
          <p className="se-small" style={{ marginTop: 12, color: "var(--fg-muted)" }}>Le volet copropriétaires (enquête sociale, plans individuels) est géré par l'AMO et n'est pas accessible depuis l'espace MOE.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Plan de financement général des scénarios préconisés ---------- */
// Décompose un scénario : postes de travaux (HT/TTC), frais annexes (HT/TTC), aides.
function moeBreakdown(c, sc) {
  const base = window.makeFinance(c);
  const travauxHT = Math.round(base.travaux * sc.mult);
  const tvaTravaux = 1.055; // TVA réduite 5,5 % — rénovation énergétique
  const tvaFrais = 1.20;
  const postes = sc.postes.map((p) => {
    const ht = Math.round(travauxHT * p.w);
    return { l: p.l, ht, ttc: Math.round(ht * tvaTravaux) };
  });
  const travauxTTC = postes.reduce((s, p) => s + p.ttc, 0);

  const honoHT = Math.round(base.honoraires * sc.mult);
  const aleasHT = Math.round(base.aleas * sc.mult);
  const frais = [
    { l: "Honoraires de maîtrise d'œuvre", ht: Math.round(honoHT * 0.55) },
    { l: "Honoraires AMO & ingénierie financière", ht: Math.round(honoHT * 0.25) },
    { l: "Assurance dommages-ouvrage", ht: Math.round(honoHT * 0.08) },
    { l: "Diagnostics, audit & études techniques", ht: Math.round(honoHT * 0.07) },
    { l: "Coordination SPS & contrôle technique", ht: Math.round(honoHT * 0.05) },
    { l: "Provision pour aléas & imprévus", ht: aleasHT },
  ].map((f) => ({ ...f, ttc: Math.round(f.ht * tvaFrais) }));
  const fraisHT = frais.reduce((s, f) => s + f.ht, 0);
  const fraisTTC = frais.reduce((s, f) => s + f.ttc, 0);

  const totalHT = travauxHT + fraisHT;
  const totalTTC = travauxTTC + fraisTTC;

  const s = { ...base, profils: { ...base.profils }, primeIndiv: { ...base.primeIndiv }, travaux: travauxHT, honoraires: honoHT, aleas: aleasHT };
  const d = window.computeFinance(s, c);
  const aides = [
    { l: "MaPrimeRénov' Copropriété", v: d.mprCopro },
    { l: "Certificats d'économies d'énergie (CEE)", v: s.cee },
    { l: "Fonds travaux & subventions locales", v: s.fonds },
    { l: "Aides individuelles (profils MaPrimeRénov')", v: d.aidesIndiv },
  ];
  const aidesTotal = d.aidesColl + d.aidesIndiv;
  const resteAvantPret = Math.max(0, totalTTC - aidesTotal);
  const plafond = 50000 * (c.lotsHab || c.lots);
  const ecoPtz = Math.min(resteAvantPret, plafond);
  const reste = Math.max(0, resteAvantPret - ecoPtz);
  return {
    postes, travauxHT, travauxTTC, frais, fraisHT, fraisTTC, totalHT, totalTTC,
    aides, aidesTotal, ecoPtz, resteAvantPret, reste,
    tauxAides: totalTTC ? aidesTotal / totalTTC : 0, parLot: resteAvantPret / c.lots, mensualite: ecoPtz / (15 * 12),
  };
}

function FinRow({ l, ht, ttc, v, strong, accent }) {
  return (
    <tr className={(strong ? "fin-strong" : "") + (accent ? " fin-accent" : "")}>
      <td>{l}</td>
      {ht != null && <td className="num">{window.fmtEuro(ht)}</td>}
      {ttc != null && <td className="num">{window.fmtEuro(ttc)}</td>}
      {v != null && <td className="num">{(accent ? "− " : "") + window.fmtEuro(v)}</td>}
    </tr>
  );
}

function MoeFinancement({ c }) {
  const scenarios = window.makeMoeScenarios(c);
  const [activeId, setActiveId] = React.useState(scenarios.find((s) => s.reco).id);
  const rows = scenarios.map((sc) => ({ sc, b: moeBreakdown(c, sc) }));
  const active = rows.find((r) => r.sc.id === activeId);
  const b = active.b;

  const exportPlan = () => {
    const eur = (n) => Math.round(n) + " €";
    const lines = [];
    lines.push(["Plan de financement — " + c.name, active.sc.name]);
    lines.push([c.adresse || (c.city + " · " + c.quartier)]);
    lines.push([]);
    lines.push(["TRAVAUX", "Montant HT", "Montant TTC"]);
    b.postes.forEach((p) => lines.push([p.l, eur(p.ht), eur(p.ttc)]));
    lines.push(["Sous-total travaux", eur(b.travauxHT), eur(b.travauxTTC)]);
    lines.push([]);
    lines.push(["FRAIS ANNEXES", "Montant HT", "Montant TTC"]);
    b.frais.forEach((f) => lines.push([f.l, eur(f.ht), eur(f.ttc)]));
    lines.push(["Sous-total frais annexes", eur(b.fraisHT), eur(b.fraisTTC)]);
    lines.push([]);
    lines.push(["COÛT TOTAL DE L'OPÉRATION", eur(b.totalHT), eur(b.totalTTC)]);
    lines.push([]);
    lines.push(["AIDES & FINANCEMENT", "Montant"]);
    b.aides.forEach((a) => lines.push([a.l, eur(a.v)]));
    lines.push(["Total des aides mobilisées", eur(b.aidesTotal)]);
    lines.push(["Éco-PTZ collectif mobilisable", eur(b.ecoPtz)]);
    lines.push(["Reste à charge copropriété", eur(b.reste)]);
    lines.push([]);
    lines.push(["Taux d'aides", Math.round(b.tauxAides * 100) + " %"]);
    lines.push(["Reste à charge / lot moyen", eur(b.parLot)]);
    lines.push(["Gain énergétique visé", "+" + active.sc.gain + " %"]);
    const csv = "\uFEFF" + lines.map((r) => r.map((cell) => '"' + String(cell == null ? "" : cell).replace(/"/g, '""') + '"').join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plan-financement-" + c.id + "-" + active.sc.id + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="fade moe-fin">
      <div className="moe-fin-intro">
        <div>
          <h2 className="moe-fin-h">Plan de financement général</h2>
          <p className="moe-fin-d">Détail des scénarios de travaux préconisés par la maîtrise d'œuvre : postes de travaux, frais annexes et plan d'aides. Les quote-parts individuelles sont instruites par l'AMO.</p>
        </div>
        <div className="moe-fin-actions">
          <Badge kind="neutral"><Icon name="hammer" size={12} />Préconisation MOE</Badge>
          <button className="se-btn se-btn-secondary btn-sm" onClick={exportPlan}><Icon name="download" size={15} />Exporter</button>
        </div>
      </div>

      <div className="moe-scn-grid">
        {rows.map(({ sc, b }) => (
          <button key={sc.id} className={"moe-scn" + (sc.id === activeId ? " on" : "") + (sc.reco ? " reco" : "")} onClick={() => setActiveId(sc.id)}>
            <div className="moe-scn-top">
              <span className="moe-scn-name">{sc.name}</span>
              {sc.reco && <Badge kind="success" dot>Préconisé</Badge>}
            </div>
            <p className="moe-scn-scope">{sc.scope}</p>
            <div className="moe-scn-metrics">
              <div><span className="l">Coût TTC</span><span className="v">{window.fmtEuro(b.totalTTC)}</span></div>
              <div><span className="l">Reste à charge</span><span className="v">{window.fmtEuro(b.reste)}</span></div>
              <div><span className="l">Gain énerg.</span><span className="v accent">+{sc.gain} %</span></div>
              <div><span className="l">Étiquette</span><span className="v"><DpePair before={c.energyBefore} after={sc.label} /></span></div>
            </div>
          </button>
        ))}
      </div>

      <div className="moe-fin-cols">
        {/* Détail des dépenses */}
        <div className="panel">
          <div className="p-head"><Icon name="hammer" size={18} /><h3>Détail des travaux — {active.sc.name}</h3></div>
          <div className="p-body">
            <table className="fin-table">
              <thead><tr><th>Poste de travaux</th><th className="num">Montant HT</th><th className="num">Montant TTC</th></tr></thead>
              <tbody>
                {b.postes.map((p) => <FinRow key={p.l} l={p.l} ht={p.ht} ttc={p.ttc} />)}
                <FinRow l="Sous-total travaux" ht={b.travauxHT} ttc={b.travauxTTC} strong />
              </tbody>
            </table>

            <div className="fin-sub">Frais annexes</div>
            <table className="fin-table">
              <thead><tr><th>Poste</th><th className="num">Montant HT</th><th className="num">Montant TTC</th></tr></thead>
              <tbody>
                {b.frais.map((f) => <FinRow key={f.l} l={f.l} ht={f.ht} ttc={f.ttc} />)}
                <FinRow l="Sous-total frais annexes" ht={b.fraisHT} ttc={b.fraisTTC} strong />
              </tbody>
            </table>

            <table className="fin-table fin-total-tbl">
              <tbody>
                <FinRow l="Coût total de l'opération" ht={b.totalHT} ttc={b.totalTTC} strong />
              </tbody>
            </table>
            <p className="se-small" style={{ marginTop: 10, color: "var(--fg-muted)" }}>TVA à 5,5 % sur les travaux d'amélioration énergétique éligibles ; 20 % sur les honoraires et frais.</p>
          </div>
        </div>

        {/* Plan d'aides & financement */}
        <div className="panel">
          <div className="p-head"><Icon name="euro" size={18} /><h3>Plan d'aides & financement</h3>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>Taux d'aides {Math.round(b.tauxAides * 100)} %</span></div>
          <div className="p-body">
            <table className="fin-table">
              <thead><tr><th>Aide / financement</th><th className="num">Montant</th></tr></thead>
              <tbody>
                {b.aides.map((a) => <FinRow key={a.l} l={a.l} v={a.v} accent />)}
                <FinRow l="Total des aides mobilisées" v={b.aidesTotal} strong accent />
                <FinRow l="Éco-PTZ collectif mobilisable" v={b.ecoPtz} accent />
              </tbody>
            </table>

            <table className="fin-table fin-total-tbl">
              <tbody>
                <tr><td>Coût total TTC</td><td className="num">{window.fmtEuro(b.totalTTC)}</td></tr>
                <tr><td>− Aides & financements</td><td className="num">− {window.fmtEuro(b.aidesTotal + b.ecoPtz)}</td></tr>
                <FinRow l="Reste à charge copropriété" v={b.reste} strong />
              </tbody>
            </table>

            <div className="moe-fin-tiles">
              <div className="moe-tile"><div className="l">Reste / lot moyen</div><div className="v">{window.fmtEuro(b.parLot)}</div></div>
              <div className="moe-tile"><div className="l">Mensualité Éco-PTZ / lot</div><div className="v">{window.fmtEuro(b.mensualite / c.lots)}</div></div>
              <div className="moe-tile"><div className="l">Gain énergétique</div><div className="v accent">+{active.sc.gain} %</div></div>
              <div className="moe-tile"><div className="l">Étiquette visée</div><div className="v" style={{ fontSize: 14 }}><DpePair before={c.energyBefore} after={active.sc.label} /></div></div>
            </div>
            <p className="se-small" style={{ marginTop: 14, color: "var(--fg-muted)" }}>Montants généraux indicatifs à l'échelle de la copropriété — base de l'ingénierie financière détaillée conduite par l'AMO.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Fichiers (même espace de dépôt que l'AMO) ---------- */
function MoeFichiers({ c }) {
  const folders = ["Relevés & diagnostic", "Études APS / APD", "CCTP & plans PRO", "DCE & marchés", "Visa exécution", "PV de chantier & DOE"];
  const checklists = [
    { l: "Pièces graphiques (plans, coupes)", done: 7, tot: 9 },
    { l: "CCTP par lot technique", done: c.phase === "diagnostic" ? 0 : 5, tot: 8 },
    { l: "Visas d'exécution entreprises", done: c.phase === "travaux" ? 4 : 0, tot: 6 },
  ];
  return (
    <div className="detail-grid fade">
      <div className="panel">
        <div className="p-head"><Icon name="folder" size={18} /><h3>Fichiers de l'opération</h3>
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
        <div className="p-head"><Icon name="clipboard" size={18} /><h3>Checklists techniques</h3></div>
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

/* ---------- Détail d'une opération MOE ---------- */
function MoeDetail({ c, onBack }) {
  const [tab, setTab] = React.useState("mission");
  const tabs = [
    { id: "mission", label: "Mission" },
    { id: "donnees", label: "Données techniques" },
    { id: "financement", label: "Plan de financement" },
    { id: "fichiers", label: "Fichiers" },
  ];
  return (
    <div className="page" data-screen-label={"Opération MOE — " + c.name}>
      <div className="detail-hero fade">
        <div className="dh-banner">
          <image-slot id={"moe-hero-" + c.id} shape="rect" placeholder={"Photo — " + c.name} style={{ background: window.THUMB_BG }}></image-slot>
          <div className="dh-overlay"></div>
        </div>
        <div className="dh-body">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <PhaseBadge phase={c.phase} />
              <Badge kind="neutral"><Icon name="hammer" size={12} />Maîtrise d'œuvre</Badge>
              <DpePair before={c.energyBefore} after={c.energyAfter} />
            </div>
            <h1 className="dh-title">{c.name}</h1>
            <div className="dh-loc"><Icon name="mapPin" size={15} />{c.adresse || (c.city + " · " + c.quartier)}</div>
          </div>
          <div className="dh-stats">
            <div className="dh-stat"><div className="v">{c.lots}</div><div className="l">lots</div></div>
            <div className="dh-stat"><div className="v">{c.batiments}</div><div className="l">bâtiments</div></div>
            <div className="dh-stat"><div className="v">+{c.gainPct}%</div><div className="l">gain visé</div></div>
            <div className="dh-stat"><div className="v">{c.progress}%</div><div className="l">avancement</div></div>
          </div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((tb) => (
          <button key={tb.id} className={"tab" + (tab === tb.id ? " on" : "")} onClick={() => setTab(tb.id)}>{tb.label}</button>
        ))}
      </div>

      {tab === "mission" && <MoeProjetTab c={c} />}
      {tab === "donnees" && <MoeDonneesTab c={c} />}
      {tab === "financement" && <MoeFinancement c={c} />}
      {tab === "fichiers" && <MoeFichiers c={c} />}
    </div>
  );
}

/* ---------- Tableau de bord MOE (galerie d'opérations) ---------- */
function MoeDashboard({ copros, onOpen }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Vos opérations</h1>
          <p className="page-sub">Missions de maîtrise d'œuvre en cours, par phase loi MOP</p>
        </div>
      </div>
      <div className="moe-gallery">
        {copros.map((c) => {
          const tasks = window.makeMoeTasks(c)[c.phase] || [];
          const doneN = tasks.filter((t) => t.status === "done").length;
          const next = tasks.find((t) => t.status !== "done");
          return (
            <button className="moe-op-card" key={c.id} onClick={() => onOpen(c.id)}>
              <div className="moe-op-top">
                <span className="moe-op-thumb"><Icon name="building" size={22} /></span>
                <div className="moe-op-meta">
                  <span className="moe-op-name">{c.name}</span>
                  <span className="moe-op-loc">{c.adresse || (c.city + " · " + c.quartier)}</span>
                </div>
              </div>
              <div className="moe-op-badges">
                <PhaseBadge phase={c.phase} />
                {c.fragile && <Badge kind="warn">Fragile</Badge>}
              </div>
              <div className="moe-op-prog">
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
                  <span style={{ color: "var(--fg-muted)" }}>Missions de la phase</span>
                  <span style={{ fontWeight: 700 }}>{doneN}/{tasks.length}</span>
                </div>
                <Progress value={tasks.length ? (doneN / tasks.length) * 100 : 0} />
              </div>
              {next && (
                <div className="moe-op-next">
                  <StatusDot status={next.status} />
                  <span>{next.title}</span>
                  {next.code && <span className="mop-code">{next.code}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Vos missions (transverse, façon « Vos tâches ») ---------- */
function MoeMissions({ copros, onOpen }) {
  const phaseRank = { diagnostic: 0, etudes: 1, travaux: 2 };
  const groups = copros
    .map((c) => {
      const tasks = (window.makeMoeTasks(c)[c.phase] || [])
        .map((t, idx) => ({ ...t, idx }))
        .filter((t) => t.status !== "done")
        .sort((a, b) => (a.status === b.status ? 0 : a.status === "doing" ? -1 : 1));
      return { c, tasks };
    })
    .filter((g) => g.tasks.length > 0)
    .sort((a, b) => phaseRank[b.c.phase] - phaseRank[a.c.phase]);

  const totalDoing = groups.reduce((n, g) => n + g.tasks.filter((t) => t.status === "doing").length, 0);
  const totalTodo = groups.reduce((n, g) => n + g.tasks.filter((t) => t.status === "todo").length, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Vos missions</h1>
          <p className="page-sub">Éléments de mission loi MOP à mener, par opération et phase</p>
        </div>
        <span className="spacer"></span>
        <div className="mt-tally">
          <span><b>{totalDoing}</b> en cours</span><span className="dot"></span><span><b>{totalTodo}</b> à faire</span>
        </div>
      </div>
      <div className="mt-groups">
        {groups.map((g) => (
          <div className="panel mt-card" key={g.c.id}>
            <button className="mt-copro" onClick={() => onOpen(g.c.id)}>
              <span className="mt-thumb"><Icon name="building" size={20} /></span>
              <span className="mt-copro-txt">
                <span className="mt-copro-name">{g.c.name}</span>
                <span className="mt-copro-loc">{g.c.adresse || (g.c.city + " · " + g.c.quartier)}</span>
              </span>
              <PhaseBadge phase={g.c.phase} />
              <Icon name="chevronRight" size={18} className="mt-go" />
            </button>
            <div className="mt-list">
              {g.tasks.map((t) => (
                <div className="mt-task" key={t.idx} onClick={() => onOpen(g.c.id)}>
                  <StatusDot status={t.status} />
                  <span className="mt-task-title">{t.title}</span>
                  <span className="spacer"></span>
                  {t.code && <span className="mop-code">{t.code}</span>}
                  {t.status === "doing" && <Badge kind="warn" dot>En cours</Badge>}
                  {t.due && <span className="due"><Icon name="calendar" size={13} />{t.due}</span>}
                  {t.who && <Avatar who={t.who} sm />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { MoeDetail, MoeDashboard, MoeMissions });
